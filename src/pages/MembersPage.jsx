import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Users, UserCog } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useTaskStore } from '@/stores/taskStore';
import { useToastStore } from '@/stores/toastStore';
import MemberList from '@/components/members/MemberList';
import MemberTaskList from '@/components/members/MemberTaskList';
import TaskDetailPanel from '@/components/members/TaskDetailPanel';
import TeamManagementModal from '@/components/admin/TeamManagementModal';
import CreateTaskModal from '@/components/task/CreateTaskModal';

// ── 태스크 변경 diff → 사람이 읽는 요약 라인 ──
const PRIORITY_LABEL = { urgent: '긴급', high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_LABEL = { todo: '할 일', in_progress: '진행 중', review: '검토', done: '완료', cancelled: '취소' };

function truncate(s, n = 80) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function buildTaskChangeLines(prev, next, patch) {
  const lines = [];
  if (!patch) return lines;

  if (patch.title !== undefined && prev?.title !== next.title) {
    lines.push(`제목: "${truncate(prev?.title, 40)}" → "${truncate(next.title, 40)}"`);
  }
  if (patch.description !== undefined && (prev?.description || '') !== (next.description || '')) {
    if (!prev?.description && next.description) lines.push(`설명 추가: ${truncate(next.description, 120)}`);
    else if (prev?.description && !next.description) lines.push('설명 삭제');
    else lines.push(`설명 수정: ${truncate(next.description, 120)}`);
  }
  if (patch.priority !== undefined && prev?.priority !== next.priority) {
    lines.push(`우선순위: ${PRIORITY_LABEL[prev?.priority] || prev?.priority || '-'} → ${PRIORITY_LABEL[next.priority] || next.priority}`);
  }
  if (patch.status !== undefined && prev?.status !== next.status) {
    lines.push(`상태: ${STATUS_LABEL[prev?.status] || prev?.status || '-'} → ${STATUS_LABEL[next.status] || next.status}`);
  }
  if (patch.due_date !== undefined && (prev?.due_date || null) !== (next.due_date || null)) {
    const from = prev?.due_date || '미정';
    const to = next.due_date || '미정';
    lines.push(`마감일: ${from} → ${to}`);
  }

  // 서브태스크 (작업 단계)
  if (patch.subtasks !== undefined) {
    const prevList = Array.isArray(prev?.subtasks) ? prev.subtasks : [];
    const nextList = Array.isArray(next.subtasks) ? next.subtasks : [];
    const prevTitles = new Set(prevList.map((s) => s.title));
    const nextTitles = new Set(nextList.map((s) => s.title));
    const added = nextList.filter((s) => !prevTitles.has(s.title));
    const removed = prevList.filter((s) => !nextTitles.has(s.title));
    const toggled = nextList.filter((s) => {
      const prevItem = prevList.find((p) => p.title === s.title);
      return prevItem && prevItem.done !== s.done;
    });
    added.forEach((s) => lines.push(`작업 단계 추가: "${truncate(s.title, 60)}"`));
    removed.forEach((s) => lines.push(`작업 단계 삭제: "${truncate(s.title, 60)}"`));
    toggled.forEach((s) =>
      lines.push(`작업 단계 ${s.done ? '완료' : '되돌림'}: "${truncate(s.title, 60)}"`)
    );
  }

  // 첨부파일
  if (patch.attachments !== undefined) {
    const prevAtt = Array.isArray(prev?.attachments) ? prev.attachments : [];
    const nextAtt = Array.isArray(next.attachments) ? next.attachments : [];
    const prevPaths = new Set(prevAtt.map((a) => a.path));
    const nextPaths = new Set(nextAtt.map((a) => a.path));
    const added = nextAtt.filter((a) => !prevPaths.has(a.path));
    const removed = prevAtt.filter((a) => !nextPaths.has(a.path));
    added.forEach((a) => {
      const sizeMB = a.size ? `${(a.size / 1024 / 1024).toFixed(1)}MB` : '';
      lines.push(`📎 첨부 추가: ${truncate(a.name, 60)}${sizeMB ? ` (${sizeMB})` : ''}`);
    });
    removed.forEach((a) => lines.push(`첨부 제거: ${truncate(a.name, 60)}`));
  }

  // 태그/서비스
  if (patch.service_name !== undefined && prev?.service_name !== next.service_name) {
    lines.push(`서비스: ${prev?.service_name || '-'} → ${next.service_name || '-'}`);
  }
  if (patch.page_name !== undefined && prev?.page_name !== next.page_name) {
    lines.push(`페이지: ${prev?.page_name || '-'} → ${next.page_name || '-'}`);
  }
  if (patch.feature_name !== undefined && prev?.feature_name !== next.feature_name) {
    lines.push(`기능: ${prev?.feature_name || '-'} → ${next.feature_name || '-'}`);
  }

  return lines;
}

/**
 * 멤버 태스크 관리 페이지
 *
 * - 좌측: 전체 팀원 평탄 리스트 (검색, 통계, 완수율 바)
 * - 우측: 선택한 멤버의 태스크 리스트 (전체 선택 시 모든 태스크)
 * - 태스크 클릭 → 우측 슬라이드 패널로 상세 + 댓글
 */
export default function MembersPage() {
  const { pageTitle } = useOutletContext() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const addToast = useToastStore((s) => s.addToast);
  const { user, isAdmin } = useAuthStore();
  const admin = isAdmin();
  const { tasks, updateTask } = useTaskStore();

  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [commentCounts, setCommentCounts] = useState({});
  // 모바일 네비게이션: false=멤버 리스트, true=태스크 리스트 (md 이하에서만 적용)
  const [mobileShowTasks, setMobileShowTasks] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDefaults, setCreateTaskDefaults] = useState(null);

  // 팀원 재로드 (TeamManagementModal에서 변경 후 동기화)
  const reloadMembers = async () => {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, avatar_color, role, slack_user_id')
        .order('name');
      setMembers(data || []);
    } catch (err) {
      console.error('[MembersPage] reloadMembers failed:', err);
    }
  };

  // URL param 동기화 (공유 가능 링크)
  useEffect(() => {
    const member = searchParams.get('member');
    if (member === 'all') {
      setSelectedMemberId(null);
      setMobileShowTasks(true); // URL로 접근 시 모바일에서도 태스크 뷰
    } else if (member) {
      setSelectedMemberId(member);
      setMobileShowTasks(true);
    }
    const taskId = searchParams.get('task');
    if (taskId && tasks.length > 0) {
      const t = tasks.find((tk) => tk.id === taskId);
      if (t) setSelectedTask(t);
    }
  }, [searchParams, tasks]);

  // 멤버 로드 + Realtime 구독 (다른 화면/사용자 변경 실시간 반영)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, email, avatar_color, role, slack_user_id')
          .order('name');
        if (!cancelled) setMembers(data || []);
      } catch (err) {
        console.error('[MembersPage] load members failed:', err);
      }
    }
    load();

    // users 테이블 변경 구독 (관리자 창에서 수정 시 자동 반영)
    const channel = supabase
      .channel(`members_page_users:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => { if (!cancelled) load(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_members' },
        () => { if (!cancelled) load(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // 댓글 수 집계 (표시용 뱃지)
  useEffect(() => {
    let cancelled = false;
    async function loadCounts() {
      if (tasks.length === 0) return;
      try {
        const { data } = await supabase
          .from('task_comments')
          .select('task_id')
          .is('deleted_at', null);
        if (!cancelled && data) {
          const counts = {};
          data.forEach((c) => {
            counts[c.task_id] = (counts[c.task_id] || 0) + 1;
          });
          setCommentCounts(counts);
        }
      } catch (err) {
        console.warn('[MembersPage] comment counts failed:', err);
      }
    }
    loadCounts();
  }, [tasks.length]);

  // 선택된 멤버
  const selectedMember = useMemo(
    () => (selectedMemberId ? members.find((m) => m.id === selectedMemberId) : null),
    [members, selectedMemberId]
  );

  // 필터된 태스크 (선택된 멤버 or 전체)
  const visibleTasks = useMemo(() => {
    if (!selectedMemberId) return tasks;
    return tasks.filter((t) => t.assignee_id === selectedMemberId);
  }, [tasks, selectedMemberId]);

  // 멤버 선택 → URL 갱신 + 모바일 태스크 뷰로 전환
  const handleSelectMember = (id) => {
    setSelectedMemberId(id);
    setMobileShowTasks(true); // 모바일: 태스크 리스트로 전환
    const newParams = new URLSearchParams(searchParams);
    if (id) newParams.set('member', id);
    else newParams.set('member', 'all');
    newParams.delete('task');
    setSearchParams(newParams, { replace: true });
  };

  // 태스크 선택 → 상세 슬라이드
  const handleSelectTask = (task) => {
    setSelectedTask(task);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('task', task.id);
    setSearchParams(newParams, { replace: true });
  };

  const handleCloseDetail = () => {
    setSelectedTask(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('task');
    setSearchParams(newParams, { replace: true });
  };

  // 태스크 필드 업데이트 (DB + store + 슬라이드 패널 동기화)
  const handleUpdateTask = async (taskId, patch, { silent = false } = {}) => {
    // 변경 전 상태 스냅샷 (diff용)
    const prevTask =
      (selectedTask && selectedTask.id === taskId ? selectedTask : null) ||
      tasks.find((t) => t.id === taskId);

    try {
      const { data, error } = await supabase
        .from('tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error('편집 권한이 없습니다 (RLS). 019 마이그레이션을 실행해주세요');
      }
      updateTask(taskId, data);
      setSelectedTask((prev) => (prev?.id === taskId ? { ...prev, ...data } : prev));

      // members 캐시에서 사용자 찾기 (팀·직원 관리 모달에서 저장한 slack_user_id 사용)
      const lookupMember = (id) => members.find((m) => m.id === id);

      // ── DM 수신 대상 수집 (담당자 + 편집자 본인, slack_user_id 기준 중복 제거) ──
      const collectRecipients = (assigneeId) => {
        const ids = new Set();
        if (assigneeId) ids.add(assigneeId);
        if (user?.id) ids.add(user.id);
        const result = new Map(); // slack_user_id -> { id, name, role }
        ids.forEach((id) => {
          const m = lookupMember(id);
          if (!m?.slack_user_id) return;
          const isSelf = m.id === user?.id;
          const isAssignee = m.id === assigneeId;
          const role = isSelf && isAssignee ? '담당자(본인)'
            : isSelf ? '편집자(본인)'
            : '담당자';
          if (!result.has(m.slack_user_id)) {
            result.set(m.slack_user_id, { id: m.id, name: m.name, role });
          }
        });
        return result;
      };

      // 담당자 변경 → 신규 담당자 + 본인에게 task_assigned DM + 팀 채널 broadcast
      if (patch.assignee_id !== undefined && patch.assignee_id) {
        const recipients = collectRecipients(patch.assignee_id);
        if (recipients.size === 0) {
          const assignee = lookupMember(patch.assignee_id);
          if (assignee && !assignee.slack_user_id) {
            addToast(`${assignee.name}님은 Slack ID 미등록 — 관리에서 설정하세요`, 'info');
          }
        } else {
          for (const [slackId, r] of recipients) {
            console.log(`[slack-notify] task_assigned → ${r.role} DM:`, r.name, slackId);
            supabase.functions.invoke('slack-notify', {
              body: {
                event: 'task_assigned',
                payload: {
                  assignee_slack_id: slackId,
                  task_id: data.id,
                  title: data.title,
                  due_date: data.due_date,
                  priority: data.priority,
                  recipient_role: r.role,
                },
              },
            }).catch(() => {});
          }
        }
        // 팀 채널 broadcast (개인 DM과 별개로 1회 발송)
        const assigneeMember = lookupMember(patch.assignee_id);
        supabase.functions.invoke('slack-notify', {
          body: {
            event: 'task_assigned_broadcast',
            payload: {
              task_id: data.id,
              task_title: data.title,
              assignee_slack_id: assigneeMember?.slack_user_id || null,
              assignee_name: assigneeMember?.name || '담당자',
              priority: data.priority,
              due_date: data.due_date,
              editor_name: user?.name || user?.email || '누군가',
            },
          },
        }).catch(() => {});
      }

      // 그 외 변경 → 담당자 + 편집자 본인 모두 task_updated DM
      try {
        const changes = buildTaskChangeLines(prevTask, data, patch);
        const finalAssigneeId = data.assignee_id;
        if (changes.length > 0) {
          const recipients = collectRecipients(finalAssigneeId);
          if (recipients.size === 0) {
            console.log('[slack-notify] task_updated 스킵 — 수신 대상 Slack ID 없음');
          } else {
            for (const [slackId, r] of recipients) {
              console.log(`[slack-notify] task_updated → ${r.role} DM:`, r.name, '변경:', changes.length + '건');
              supabase.functions.invoke('slack-notify', {
                body: {
                  event: 'task_updated',
                  payload: {
                    assignee_slack_id: slackId,
                    task_id: data.id,
                    task_title: data.title,
                    editor_name: user?.name || user?.email || '누군가',
                    changes,
                    recipient_role: r.role,
                  },
                },
              }).catch(() => {});
            }
          }
          // 팀 채널 broadcast (개인 DM과 별개로 1회)
          const assigneeMember = lookupMember(finalAssigneeId);
          supabase.functions.invoke('slack-notify', {
            body: {
              event: 'task_updated_broadcast',
              payload: {
                task_id: data.id,
                task_title: data.title,
                assignee_slack_id: assigneeMember?.slack_user_id || null,
                assignee_name: assigneeMember?.name || null,
                editor_name: user?.name || user?.email || '누군가',
                changes,
              },
            },
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('[task_updated notify]', e);
      }

      if (!silent) addToast('변경되었습니다', 'success');
      return data;
    } catch (err) {
      console.error('[handleUpdateTask]', err);
      addToast('변경 실패: ' + (err.message || err), 'error');
      return null;
    }
  };

  // 상태 변경 (이전 onStatusChange 호환)
  const handleStatusChange = (taskId, newStatus) =>
    handleUpdateTask(taskId, { status: newStatus });

  return (
    <div
      className="h-full flex flex-col bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3 overflow-hidden"
      style={{ minHeight: 'calc(100vh - 120px)' }}
    >
      {/* 헤더 */}
      <div className="px-4 md:px-5 lg:px-6 pt-4 pb-3 border-b border-border-subtle shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center shrink-0">
            <Users size={18} className="text-brand-purple" />
          </div>
          <div className="min-w-0">
            {pageTitle && (
              <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-0.5">
                {pageTitle}
              </h2>
            )}
            <p className="text-xs text-txt-secondary">
              팀원별 태스크를 관리하고 댓글로 협업하세요
            </p>
          </div>
        </div>

        {/* 팀/직원 관리 버튼 — 관리자만 */}
        {admin && (
          <button
            onClick={() => setManageOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-purple text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            title="팀·직원 관리"
          >
            <UserCog size={14} />
            <span className="hidden sm:inline">팀·직원 관리</span>
            <span className="sm:hidden">관리</span>
          </button>
        )}
      </div>

      {/* 본문 — 2컬럼 (모바일: 1개씩 토글) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <MemberList
          members={members}
          tasks={tasks}
          selectedId={selectedMemberId}
          onSelect={handleSelectMember}
          mobileShowTasks={mobileShowTasks}
        />
        <MemberTaskList
          tasks={visibleTasks}
          members={members}
          selectedMember={selectedMember}
          selectedId={selectedMemberId}
          commentCounts={commentCounts}
          onSelectTask={handleSelectTask}
          onBack={() => setMobileShowTasks(false)}
          mobileShowTasks={mobileShowTasks}
          onCreateTask={(member) => {
            setCreateTaskDefaults(member ? { assignee_id: member.id, assignee_name: member.name } : null);
            setCreateTaskOpen(true);
          }}
        />
      </div>

      {/* 태스크 상세 슬라이드 */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          members={members}
          currentUser={user}
          highlightCommentId={searchParams.get('comment') || null}
          onClose={handleCloseDetail}
          onStatusChange={handleStatusChange}
          onUpdate={handleUpdateTask}
        />
      )}

      {/* 팀·직원 관리 모달 */}
      <TeamManagementModal
        open={manageOpen}
        onClose={() => {
          setManageOpen(false);
          reloadMembers();  // 닫을 때 즉시 재로드 (Realtime backup)
        }}
        initialTab="members"
      />

      {/* 새 태스크 생성 모달 */}
      <CreateTaskModal
        open={createTaskOpen}
        onClose={() => {
          setCreateTaskOpen(false);
          setCreateTaskDefaults(null);
        }}
        defaultValues={createTaskDefaults}
      />
    </div>
  );
}
