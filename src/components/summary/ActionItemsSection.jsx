// 후속 태스크 섹션 — AI 초안 → 담당자 확인/수정/추가 → 정식 태스크
// 워크플로우
// 1) summary.action_items 가 있으나 tasks에 미등록: "제안 등록하기" 버튼
// 2) 등록된 tasks는 인라인 편집 (제목/담당자/기한/우선순위) + 확인/삭제
// 3) 담당자가 확인(confirm) 클릭 → confirmed=true, 태스크 페이지 노출

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ListTodo, Plus, Sparkles, Check, CheckCircle2, X, Loader2,
  Calendar, Flag, Pencil, Trash2, UserPlus, Users,
  AlertCircle, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTaskStore } from '@/stores/taskStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { getPriorityInfo, PRIORITY_MAP } from '@/lib/taskConstants';
import { Avatar } from '@/components/ui';
import TaskDetailPanel from '@/components/members/TaskDetailPanel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDemoId = (id) => !id || !UUID_RE.test(id);

function normalizeTask(t) {
  return {
    ...t,
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, color: t.assignee.avatar_color || '#723CEB' }
      : null,
    assignee_name: t.assignee?.name || t.assignee_name || null,
  };
}

export default function ActionItemsSection({ meeting, summary, messages = [] }) {
  const { user, isAdmin } = useAuthStore();
  const admin = typeof isAdmin === 'function' ? isAdmin() : false;
  const addToast = useToastStore((s) => s.addToast);
  const { tasks, addTask, updateTask, removeTask } = useTaskStore();

  const [members, setMembers] = useState([]);
  const [registering, setRegistering] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [openMenu, setOpenMenu] = useState(null); // `${taskId}:${type}` (assignee|priority|due)
  const [busyIds, setBusyIds] = useState(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  // migration 038 미적용 환경 폴백 (confirmed 컬럼 지원 여부)
  const [confirmColumnSupported, setConfirmColumnSupported] = useState(true);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null),
    [selectedTaskId, tasks]
  );

  // ── 데이터 유도 ──
  const meetingTasks = useMemo(
    () => tasks.filter((t) => t.meeting_id === meeting?.id),
    [tasks, meeting?.id]
  );

  const unregisteredSuggestions = useMemo(() => {
    const items = summary?.action_items || [];
    if (items.length === 0) return [];
    const registered = new Set(meetingTasks.map((t) => (t.title || '').trim().toLowerCase()));
    return items.filter((a) => !registered.has((a.title || '').trim().toLowerCase()));
  }, [summary, meetingTasks]);

  const stats = useMemo(() => {
    const total = meetingTasks.length;
    const confirmed = meetingTasks.filter((t) => t.confirmed).length;
    return { total, confirmed, pending: total - confirmed };
  }, [meetingTasks]);

  // ── 멤버 로드 (담당자 드롭다운용) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, avatar_color')
          .order('name');
        if (!cancelled) setMembers(data || []);
      } catch (err) {
        console.warn('[ActionItemsSection] members load:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 헬퍼 ──
  const markBusy = (id, on) => {
    setBusyIds((prev) => {
      const s = new Set(prev);
      on ? s.add(id) : s.delete(id);
      return s;
    });
  };

  // ── 메시지 기반 발언자 분석 ──
  // 회의록 메시지를 분석해서 가장 활발히 발언한 사람들을 추출
  const speakerStats = useMemo(() => {
    const counts = {};  // user_id → { count, lastAt, user }
    for (const m of messages) {
      if (m.is_ai) continue;
      if (!m.user_id) continue;
      const cur = counts[m.user_id] || { count: 0, lastAt: 0, user: m.user };
      cur.count += 1;
      const ts = new Date(m.created_at).getTime();
      if (ts > cur.lastAt) cur.lastAt = ts;
      counts[m.user_id] = cur;
    }
    // 발언 수 내림차순
    return Object.entries(counts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [messages]);

  // ── 담당자 자동 매칭 (AI hint + 메시지 컨텍스트) ──
  const resolveAssigneeId = useCallback((hint, taskTitle) => {
    const clean = (hint || '').trim();

    // 1) 정확한 이름 일치 (members 우선)
    if (clean) {
      const exact = members.find((m) => m.name === clean);
      if (exact) return exact.id;
    }

    // 2) 힌트에 멤버 이름 포함 (양방향)
    if (clean) {
      const partial = members.find((m) => {
        if (!m.name) return false;
        return clean.includes(m.name) || m.name.includes(clean);
      });
      if (partial) return partial.id;
    }

    // 3) 태스크 제목/힌트에 "저가/제가/내가/본인" 등 1인칭 → 회의 생성자
    if (clean || taskTitle) {
      const selfKeywords = /\b(저[가는]?|제가|내가|본인|담당자\s*본인)\b/;
      if (selfKeywords.test(clean) || selfKeywords.test(taskTitle || '')) {
        if (meeting?.creator?.id) {
          const creator = members.find((m) => m.id === meeting.creator.id);
          if (creator) return creator.id;
        }
      }
    }

    // 4) 태스크 제목 안에 멤버 이름이 언급되어 있는지
    if (taskTitle) {
      const mentioned = members.find((m) => m.name && taskTitle.includes(m.name));
      if (mentioned) return mentioned.id;
    }

    // 5) 메시지 컨텍스트 fallback — 태스크 제목의 핵심 단어가 등장한 메시지의 발신자
    if (taskTitle && messages.length > 0) {
      const needle = taskTitle.slice(0, 15);
      const hit = messages.find((m) =>
        !m.is_ai && m.content?.includes(needle) && m.user_id
      );
      if (hit?.user_id && members.some((m) => m.id === hit.user_id)) {
        return hit.user_id;
      }
    }

    // 6) 최후 fallback: 가장 많이 발언한 사람 (논의 주도자)
    if (speakerStats.length > 0) {
      const top = speakerStats[0];
      if (members.some((m) => m.id === top.id)) return top.id;
    }

    return null;
  }, [members, meeting?.creator?.id, messages, speakerStats]);

  // ── AI 제안 일괄 등록 ──
  const handleRegisterAll = async () => {
    if (unregisteredSuggestions.length === 0 || registering) return;
    setRegistering(true);
    try {
      const rows = unregisteredSuggestions.map((a) => {
        const base = {
          title: a.title || '제목 없음',
          description: (a.assignee_hint || a.due_hint)
            ? [
                a.assignee_hint && `담당 힌트: ${a.assignee_hint}`,
                a.due_hint && `기한 힌트: ${a.due_hint}`,
              ].filter(Boolean).join('\n')
            : null,
          status: 'todo',
          priority: ['urgent', 'high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
          meeting_id: meeting.id,
          meeting_title: meeting.title || null,
          ai_suggested: true,
          assignee_id: resolveAssigneeId(a.assignee_hint, a.title),
        };
        // confirmed 컬럼 지원 시에만 포함 (migration 038 미적용 환경 폴백)
        if (confirmColumnSupported) base.confirmed = false;
        return base;
      });

      if (!isDemoId(meeting.id)) {
        let result = await supabase
          .from('tasks')
          .insert(rows)
          .select('*, assignee:users!tasks_assignee_id_fkey(id, name, avatar_color, slack_user_id)');
        // migration 038 미적용 → confirmed 컬럼 없음. 재시도 without confirmed
        if (result.error?.code === '42703' && confirmColumnSupported) {
          console.warn('[registerAll] confirmed 컬럼 미지원. 재시도 (migration 038 미적용)');
          setConfirmColumnSupported(false);
          const fallbackRows = rows.map(({ confirmed, ...rest }) => rest);
          result = await supabase
            .from('tasks')
            .insert(fallbackRows)
            .select('*, assignee:users!tasks_assignee_id_fkey(id, name, avatar_color, slack_user_id)');
        }
        if (result.error) throw result.error;
        (result.data || []).forEach((t) => addTask(normalizeTask(t)));
        addToast?.(`${result.data?.length ?? 0}개 태스크 등록 · 담당자 확인 대기`, 'success', 3000);
      } else {
        const now = new Date().toISOString();
        rows.forEach((r, i) => addTask({
          ...r, id: `t-local-${Date.now()}-${i}`, created_at: now,
          assignee: r.assignee_id ? members.find((m) => m.id === r.assignee_id) : null,
        }));
        addToast?.(`(데모) ${rows.length}개 등록 처리`, 'info', 2500);
      }
    } catch (err) {
      console.error('[registerAll]', err);
      addToast?.(`등록 실패: ${err.message}`, 'error', 4000);
    } finally {
      setRegistering(false);
    }
  };

  // ── 공통 필드 업데이트 (낙관적 업데이트 + 롤백) ──
  const updateField = async (task, patch, rollback) => {
    markBusy(task.id, true);
    updateTask(task.id, patch);
    try {
      if (!isDemoId(task.id) && !isDemoId(meeting.id)) {
        const { assignee, ...dbPatch } = patch;
        const { error } = await supabase
          .from('tasks')
          .update({ ...dbPatch, updated_at: new Date().toISOString() })
          .eq('id', task.id);
        if (error) throw error;
      }
      return true;
    } catch (err) {
      console.error('[updateField]', err);
      updateTask(task.id, rollback);
      const code = err?.code || '';
      const msg = code === '42703'
        ? 'DB 스키마 업데이트 필요 (migration 038 실행)'
        : '저장 실패';
      addToast?.(msg, 'error', 3500);
      return false;
    } finally {
      markBusy(task.id, false);
    }
  };

  // ── 확인 토글 ──
  const handleToggleConfirm = async (task) => {
    const newVal = !task.confirmed;
    const rollback = {
      confirmed: task.confirmed,
      confirmed_by: task.confirmed_by || null,
      confirmed_at: task.confirmed_at || null,
    };
    const patch = {
      confirmed: newVal,
      confirmed_by: newVal ? (user?.id || null) : null,
      confirmed_at: newVal ? new Date().toISOString() : null,
    };
    const ok = await updateField(task, patch, rollback);
    if (ok) {
      addToast?.(
        newVal ? '확인 완료 · 태스크 페이지에서 추적할 수 있어요' : '확인을 취소했습니다',
        'success', 2500
      );
    }
  };

  // ── 제목 편집 ──
  const startEditTitle = (task) => {
    setEditingTitleId(task.id);
    setEditTitleDraft(task.title || '');
  };
  const saveTitle = async (task) => {
    const t = editTitleDraft.trim();
    if (!t || t === task.title) {
      setEditingTitleId(null);
      return;
    }
    await updateField(task, { title: t }, { title: task.title });
    setEditingTitleId(null);
  };

  // ── 담당자 변경 ──
  const handleAssigneeChange = async (task, member) => {
    setOpenMenu(null);
    const patch = member
      ? {
          assignee_id: member.id,
          assignee_name: member.name,
          assignee: { id: member.id, name: member.name, color: member.avatar_color || '#723CEB' },
        }
      : { assignee_id: null, assignee_name: null, assignee: null };
    const rollback = {
      assignee_id: task.assignee_id || null,
      assignee_name: task.assignee_name || null,
      assignee: task.assignee || null,
    };
    await updateField(task, patch, rollback);
  };

  // ── 우선순위 ──
  const handlePriorityChange = async (task, priority) => {
    setOpenMenu(null);
    await updateField(task, { priority }, { priority: task.priority });
  };

  // ── 기한 ──
  const handleDueChange = async (task, due) => {
    setOpenMenu(null);
    await updateField(task, { due_date: due || null }, { due_date: task.due_date || null });
  };

  // ── 삭제 ──
  const handleDelete = async (task) => {
    if (!window.confirm(`"${task.title}"를 삭제하시겠습니까?`)) return;
    markBusy(task.id, true);
    const snapshot = task;
    removeTask(task.id);
    try {
      if (!isDemoId(task.id) && !isDemoId(meeting.id)) {
        const { error } = await supabase.from('tasks').delete().eq('id', task.id);
        if (error) throw error;
      }
      addToast?.('삭제했습니다', 'success', 2000);
    } catch (err) {
      addTask(snapshot);
      addToast?.(`삭제 실패: ${err.message}`, 'error', 3500);
    } finally {
      markBusy(task.id, false);
    }
  };

  // ── 새 태스크 추가 ──
  const handleAddTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    // 사용자가 직접 추가할 때도 발언자 기반 자동 담당 지정 (수정 가능)
    const autoAssigneeId = resolveAssigneeId(null, title);

    const baseRow = {
      title,
      status: 'todo',
      priority: 'medium',
      meeting_id: meeting.id,
      meeting_title: meeting.title || null,
      ai_suggested: false,
      assignee_id: autoAssigneeId,
    };
    // confirmed 필드는 지원되는 경우만 포함
    const row = confirmColumnSupported
      ? { ...baseRow, confirmed: true, confirmed_by: user?.id || null, confirmed_at: new Date().toISOString() }
      : baseRow;

    try {
      if (!isDemoId(meeting.id)) {
        let result = await supabase
          .from('tasks')
          .insert([row])
          .select('*, assignee:users!tasks_assignee_id_fkey(id, name, avatar_color, slack_user_id)')
          .single();
        // migration 038 미적용 → confirmed 컬럼 없음. 재시도
        if (result.error?.code === '42703' && confirmColumnSupported) {
          console.warn('[addTask] confirmed 컬럼 미지원. 재시도');
          setConfirmColumnSupported(false);
          result = await supabase
            .from('tasks')
            .insert([baseRow])
            .select('*, assignee:users!tasks_assignee_id_fkey(id, name, avatar_color, slack_user_id)')
            .single();
        }
        if (result.error) throw result.error;
        addTask(normalizeTask(result.data));
      } else {
        addTask({ ...row, id: `t-local-${Date.now()}`, created_at: new Date().toISOString() });
      }
      setNewTitle('');
      setAdding(false);
      addToast?.('태스크를 추가했습니다', 'success', 2000);
    } catch (err) {
      console.error('[addTask]', err);
      // 원인별 구체적 메시지
      const code = err?.code || '';
      const msg = err?.message || '';
      let friendly = `추가 실패`;
      if (code === '42703') friendly = 'DB 스키마 업데이트 필요 (migration 038 실행)';
      else if (code === '42501' || /policy|row-level security/i.test(msg)) {
        friendly = '등록 권한 없음 (migration 021 확인)';
      } else if (code === '23514') friendly = '잘못된 값 — priority 또는 status 확인';
      else if (code === '23503') friendly = '참조 오류 — meeting_id 또는 assignee_id 유효하지 않음';
      else if (msg) friendly = `추가 실패: ${msg.slice(0, 80)}`;
      addToast?.(friendly, 'error', 4500);
    }
  };

  // ── UI: 권한 체크 ──
  const canEditTask = (task) => {
    // 본인이 담당자이거나, 관리자이거나, 담당 미배정이면 누구나 편집 가능
    if (!user) return false;
    if (admin) return true;
    if (!task.assignee_id) return true;
    return task.assignee_id === user.id;
  };

  // ── 렌더 ──
  const totalCount = meetingTasks.length + unregisteredSuggestions.length;

  return (
    <div className="space-y-3">
      {/* 안내 배너 — AI 제안이 있는데 미등록 */}
      {unregisteredSuggestions.length > 0 && (
        <div className="rounded-lg border border-brand-purple/30 bg-brand-purple/[0.04] p-3 md:p-4">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-md bg-brand-purple/15 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-brand-purple" strokeWidth={2.4} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-txt-primary mb-0.5">
                AI가 제안한 후속 태스크 {unregisteredSuggestions.length}건
              </p>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                회의 기록에서 자동으로 추출한 제안입니다. 등록 후 담당자가 확인·수정할 수 있어요.
              </p>
              <ul className="mt-2 space-y-1">
                {unregisteredSuggestions.slice(0, 3).map((a, i) => (
                  <li key={i} className="text-[11px] text-txt-secondary flex items-start gap-1.5">
                    <span className="text-txt-muted shrink-0">{i + 1}.</span>
                    <span className="flex-1 truncate">{a.title}</span>
                    {a.assignee_hint && (
                      <span className="text-[10px] text-brand-purple shrink-0">{a.assignee_hint}</span>
                    )}
                  </li>
                ))}
                {unregisteredSuggestions.length > 3 && (
                  <li className="text-[11px] text-txt-muted pl-4">
                    외 {unregisteredSuggestions.length - 3}개 더
                  </li>
                )}
              </ul>
            </div>
            <button
              onClick={handleRegisterAll}
              disabled={registering}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-purple text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {registering ? (
                <><Loader2 size={14} className="animate-spin" />등록 중</>
              ) : (
                <><Plus size={14} strokeWidth={2.6} />모두 등록 ({unregisteredSuggestions.length})</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 상단 요약 + 추가 버튼 */}
      {(meetingTasks.length > 0 || unregisteredSuggestions.length === 0) && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-txt-secondary">
            {meetingTasks.length > 0 ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 size={14} className="text-status-success" />
                  <span className="text-txt-primary font-semibold">{stats.confirmed}</span>
                  <span>확인</span>
                </span>
                <span className="text-border-default">·</span>
                <span className="inline-flex items-center gap-1">
                  <AlertCircle size={14} className="text-brand-orange" />
                  <span className="text-txt-primary font-semibold">{stats.pending}</span>
                  <span>미확인</span>
                </span>
              </>
            ) : (
              <span className="text-txt-muted">등록된 태스크가 없습니다</span>
            )}
          </div>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-txt-secondary border border-border-subtle hover:text-txt-primary hover:border-border-hover transition-colors"
            >
              <Plus size={13} strokeWidth={2.4} />
              태스크 추가
            </button>
          )}
        </div>
      )}

      {/* 새 태스크 입력 */}
      {adding && (
        <div className="p-3 rounded-lg border border-brand-purple/40 bg-brand-purple/[0.04] flex items-center gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddTask();
              else if (e.key === 'Escape') { setAdding(false); setNewTitle(''); }
            }}
            placeholder="태스크 제목 (Enter 저장, Esc 취소)"
            className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-1.5 text-sm text-txt-primary outline-none focus:border-brand-purple/50"
          />
          <button
            onClick={handleAddTask}
            disabled={!newTitle.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-purple text-white hover:opacity-90 disabled:opacity-50"
          >
            추가
          </button>
          <button
            onClick={() => { setAdding(false); setNewTitle(''); }}
            className="p-1.5 text-txt-muted hover:text-txt-primary"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 태스크 리스트 */}
      {meetingTasks.length > 0 && (
        <ul className="space-y-2">
          {meetingTasks.map((t) => {
            const pri = getPriorityInfo(t.priority);
            const busy = busyIds.has(t.id);
            const editable = canEditTask(t);
            const isEditingTitle = editingTitleId === t.id;

            return (
              <li
                key={t.id}
                onClick={(e) => {
                  // 내부 버튼/드롭다운/input 클릭은 모달 오픈 차단
                  if (e.target.closest('button, input, [role="menu"]')) return;
                  setSelectedTaskId(t.id);
                }}
                className={`group/item p-3 rounded-md border transition-all cursor-pointer ${
                  t.confirmed
                    ? 'bg-status-success/[0.04] border-status-success/20 hover:border-status-success/40'
                    : 'bg-bg-tertiary/40 border-border-subtle hover:border-brand-purple/30'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* 확인 체크박스 */}
                  <button
                    onClick={() => editable && handleToggleConfirm(t)}
                    disabled={!editable || busy}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      t.confirmed
                        ? 'bg-status-success border-status-success'
                        : editable
                          ? 'border-border-default hover:border-status-success'
                          : 'border-border-subtle opacity-50'
                    }`}
                    title={
                      !editable ? '담당자만 확인 가능'
                        : t.confirmed ? '확인 취소'
                        : '담당자 확인 (정식 태스크로 승격)'
                    }
                  >
                    {busy ? (
                      <Loader2 size={14} className="text-white animate-spin" />
                    ) : t.confirmed ? (
                      <Check size={14} className="text-white" strokeWidth={3} />
                    ) : null}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* 제목 */}
                    {isEditingTitle ? (
                      <input
                        autoFocus
                        value={editTitleDraft}
                        onChange={(e) => setEditTitleDraft(e.target.value)}
                        onBlur={() => saveTitle(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveTitle(t); }
                          else if (e.key === 'Escape') { setEditingTitleId(null); setEditTitleDraft(''); }
                        }}
                        className="w-full bg-bg-tertiary border border-brand-purple/50 rounded px-2 py-1 text-sm text-txt-primary outline-none focus:border-brand-purple"
                      />
                    ) : (
                      <div className="flex items-start gap-1.5">
                        <p className={`text-sm font-medium leading-snug flex-1 ${
                          t.confirmed ? 'text-txt-primary' : 'text-txt-primary'
                        }`}>
                          {t.title}
                        </p>
                        {editable && (
                          <button
                            onClick={() => startEditTitle(t)}
                            className="opacity-0 group-hover/item:opacity-100 p-0.5 text-txt-muted hover:text-brand-purple transition-opacity shrink-0"
                            title="제목 편집"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* 메타: 담당자 · 기한 · 우선순위 · AI 제안 · 확인 정보 */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {/* 담당자 */}
                      <MetaDropdown
                        open={openMenu === `${t.id}:assignee`}
                        onOpen={() => editable && setOpenMenu(`${t.id}:assignee`)}
                        onClose={() => setOpenMenu(null)}
                        label={(t.assignee?.name || t.assignee_name) ? (
                          <>
                            {t.assignee && (
                              <Avatar name={t.assignee.name} color={t.assignee.color} size="sm" className="!w-3.5 !h-3.5 !text-[8px]" />
                            )}
                            {t.assignee?.name || t.assignee_name}
                          </>
                        ) : (
                          <><UserPlus size={12} />담당자 지정</>
                        )}
                        active={!!(t.assignee?.name || t.assignee_name)}
                        disabled={!editable}
                      >
                        {members.length === 0 ? (
                          <div className="px-3 py-2 text-[11px] text-txt-muted">멤버 없음</div>
                        ) : (
                          <>
                            {members.map((m) => {
                              const active = t.assignee_id === m.id;
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => handleAssigneeChange(t, m)}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] ${
                                    active ? 'bg-brand-purple/10 text-brand-purple' : 'text-txt-primary hover:bg-bg-tertiary'
                                  }`}
                                >
                                  <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: m.avatar_color || '#723CEB' }} />
                                  <span className="flex-1 text-left truncate">{m.name}</span>
                                  {active && <Check size={12} />}
                                </button>
                              );
                            })}
                            {t.assignee_id && (
                              <>
                                <div className="border-t border-border-divider my-1" />
                                <button
                                  onClick={() => handleAssigneeChange(t, null)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-status-error hover:bg-bg-tertiary"
                                >
                                  <X size={12} />담당 해제
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </MetaDropdown>

                      {/* 기한 */}
                      <MetaDropdown
                        open={openMenu === `${t.id}:due`}
                        onOpen={() => editable && setOpenMenu(`${t.id}:due`)}
                        onClose={() => setOpenMenu(null)}
                        label={<><Calendar size={12} />{t.due_date || '기한 없음'}</>}
                        active={!!t.due_date}
                        disabled={!editable}
                        noBorder
                      >
                        <div className="p-2">
                          <input
                            type="date"
                            defaultValue={t.due_date || ''}
                            onChange={(e) => handleDueChange(t, e.target.value)}
                            className="w-full bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-[11px] text-txt-primary"
                          />
                          {t.due_date && (
                            <button
                              onClick={() => handleDueChange(t, null)}
                              className="w-full mt-1 text-center py-1 text-[11px] text-status-error hover:bg-bg-tertiary rounded"
                            >
                              기한 제거
                            </button>
                          )}
                        </div>
                      </MetaDropdown>

                      {/* 우선순위 */}
                      <MetaDropdown
                        open={openMenu === `${t.id}:priority`}
                        onOpen={() => editable && setOpenMenu(`${t.id}:priority`)}
                        onClose={() => setOpenMenu(null)}
                        label={<><Flag size={12} />{pri?.label || '보통'}</>}
                        active
                        tone={pri?.tone}
                        bg={pri?.bg}
                        border={pri?.border}
                        disabled={!editable}
                      >
                        {Object.entries(PRIORITY_MAP).map(([key, info]) => (
                          <button
                            key={key}
                            onClick={() => handlePriorityChange(t, key)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] ${
                              t.priority === key ? `${info.bg} ${info.tone}` : 'text-txt-primary hover:bg-bg-tertiary'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
                            <span className="flex-1 text-left">{info.label}</span>
                            {t.priority === key && <Check size={12} />}
                          </button>
                        ))}
                      </MetaDropdown>

                      {/* AI 제안 표시 */}
                      {t.ai_suggested && !t.confirmed && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-purple">
                          <Sparkles size={11} />AI 초안
                        </span>
                      )}

                      {/* 확인 정보 */}
                      {t.confirmed && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-status-success">
                          <CheckCircle2 size={12} />
                          {t.confirmed_by === user?.id ? '내가 확인함' : (members.find((m) => m.id === t.confirmed_by)?.name || '확인됨')}
                        </span>
                      )}
                    </div>

                    {/* 설명이 있으면 표시 (AI 힌트 포함) */}
                    {t.description && (
                      <p className="mt-2 text-[11px] text-txt-muted whitespace-pre-wrap leading-relaxed bg-bg-tertiary/40 px-2 py-1.5 rounded">
                        {t.description}
                      </p>
                    )}
                  </div>

                  {/* 삭제 (권한 있을 때만) */}
                  {editable && (
                    <button
                      onClick={() => handleDelete(t)}
                      disabled={busy}
                      className="opacity-0 group-hover/item:opacity-100 p-1 text-txt-muted hover:text-status-error transition-all shrink-0"
                      title="태스크 삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 빈 상태 */}
      {meetingTasks.length === 0 && unregisteredSuggestions.length === 0 && !adding && (
        <div className="text-center py-8 border border-dashed border-border-subtle rounded-lg">
          <ListTodo size={24} className="text-txt-muted mx-auto mb-2 opacity-50" />
          <p className="text-sm text-txt-secondary mb-3">아직 등록된 태스크가 없어요</p>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-brand-purple bg-brand-purple/10 border border-brand-purple/25 hover:bg-brand-purple/15 transition-colors"
          >
            <Plus size={14} strokeWidth={2.4} />
            태스크 직접 추가
          </button>
        </div>
      )}

      {/* 태스크 상세 모달 (MembersPage 와 동일) */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          members={members}
          currentUser={user}
          onClose={() => setSelectedTaskId(null)}
          onStatusChange={async (taskId, newStatus) => {
            const target = tasks.find((x) => x.id === taskId);
            if (target) await updateField(target, { status: newStatus }, { status: target.status });
          }}
          onUpdate={async (taskId, patch, opts = {}) => {
            const target = tasks.find((x) => x.id === taskId);
            if (!target) return;
            // rollback 을 위해 변경 전 값 추출
            const rollback = Object.fromEntries(
              Object.keys(patch).map((k) => [k, target[k] ?? null])
            );
            await updateField(target, patch, rollback);
            if (!opts.silent) addToast?.('변경되었습니다', 'success', 1800);
          }}
        />
      )}
    </div>
  );
}

// ── 메타 드롭다운 공용 컴포넌트 ──
function MetaDropdown({
  open, onOpen, onClose, label, children, active, tone, bg, border, noBorder, disabled,
}) {
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? onClose() : onOpen(); }}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
          active
            ? `${bg || 'bg-transparent'} ${tone || 'text-txt-secondary'} ${!noBorder && (border || 'hover:bg-bg-tertiary')}`
            : 'text-txt-muted hover:bg-bg-tertiary border border-dashed border-border-default'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {label}
        {!disabled && <ChevronDown size={11} className="opacity-60" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={onClose} />
          <div className="absolute left-0 top-full mt-1 min-w-[160px] max-h-60 overflow-y-auto bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-30 py-1">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
