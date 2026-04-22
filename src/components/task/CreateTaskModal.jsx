// 태스크 생성 모달 — TasksPage의 "+ 새 태스크" 버튼 및 칸반 컬럼 "+" 버튼에서 호출
import { useState, useEffect } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTaskStore } from '@/stores/taskStore';
import { useAuthStore } from '@/stores/authStore';
import { PRIORITY_MAP, STATUS_MAP } from '@/lib/taskConstants';
import { useToastStore } from '@/stores/toastStore';

const INITIAL_FORM = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  due_date: '',
  service_name: '',
  feature_name: '',
  tags: '',
};

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   defaultStatus?: string,  칸반 컬럼 "+" 에서 호출 시 초기 상태
 *   defaultValues?: { assignee_id?: string, assignee_name?: string },  멤버 페이지에서 특정 팀원 지정 생성
 * }} props
 */
export default function CreateTaskModal({ open, onClose, defaultStatus, defaultValues }) {
  const addTask = useTaskStore((s) => s.addTask);
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [form, setForm] = useState(INITIAL_FORM);
  const [assigneeId, setAssigneeId] = useState(null);
  const [assigneeName, setAssigneeName] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...INITIAL_FORM, status: defaultStatus || 'todo' });
      // defaultValues로 담당자 지정 (멤버 페이지에서 특정 멤버 선택 시)
      setAssigneeId(defaultValues?.assignee_id || user?.id || null);
      setAssigneeName(defaultValues?.assignee_name || user?.name || null);
    }
  }, [open, defaultStatus, defaultValues, user]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) {
      addToast('제목을 입력해주세요', 'error', 2000);
      return;
    }
    setBusy(true);

    const tagsArray = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    // DB에 INSERT (Supabase) — catch에서도 참조 가능하게 try 밖에 선언
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      assignee_id: assigneeId,
      assignee_name: assigneeName,
      created_by: user?.id || null,
      service_name: form.service_name.trim() || null,
      feature_name: form.feature_name.trim() || null,
      tags: tagsArray,
      ai_suggested: false,
      subtasks: [],
    };

    try {

      const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      // 로컬 store 즉시 반영 (Realtime 지연 대비)
      addTask(data);
      addToast('태스크가 생성되었습니다', 'success', 2000);

      // ═══ Slack 알림 ═══ (담당자 + 생성자 본인 + 팀 채널)
      // 담당자가 없으면 스킵 (개인 알림 X, 브로드캐스트 X)
      try {
        const notifyIds = new Set();
        if (data.assignee_id) notifyIds.add(data.assignee_id);
        if (user?.id) notifyIds.add(user.id);

        if (notifyIds.size > 0) {
          const { data: recipients } = await supabase
            .from('users')
            .select('id, name, slack_user_id')
            .in('id', [...notifyIds]);

          // slack_user_id 기준 중복 제거
          const slackIdMap = new Map();
          (recipients || []).forEach((r) => {
            if (r.slack_user_id) slackIdMap.set(r.slack_user_id, r);
          });

          const assigneeInfo = (recipients || []).find((r) => r.id === data.assignee_id);

          for (const [slackId, r] of slackIdMap) {
            const isSelf = r.id === user?.id;
            const isAssignee = r.id === data.assignee_id;
            const role = isSelf && isAssignee ? '담당자(본인)'
              : isSelf ? '생성자(본인)'
              : '담당자';
            console.log(`[slack-notify] task_assigned(신규) → ${role} DM:`, r.name, slackId);
            supabase.functions.invoke('slack-notify', {
              body: {
                event: 'task_assigned',
                payload: {
                  assignee_slack_id: slackId,
                  task_id: data.id,
                  title: data.title,
                  due_date: data.due_date,
                  priority: data.priority,
                  recipient_role: role,
                },
              },
            }).catch((e) => console.warn('[slack-notify] task_assigned DM 실패:', e));
          }

          // 팀 채널 broadcast (meeting_id 있으면 해당 팀으로)
          supabase.functions.invoke('slack-notify', {
            body: {
              event: 'task_assigned_broadcast',
              payload: {
                task_id: data.id,
                task_title: data.title,
                assignee_slack_id: assigneeInfo?.slack_user_id || null,
                assignee_name: assigneeInfo?.name || data.assignee_name || '담당자',
                priority: data.priority,
                due_date: data.due_date,
                editor_name: user?.name || user?.email || '누군가',
              },
            },
          }).catch((e) => console.warn('[slack-notify] task_assigned_broadcast 실패:', e));
        }
      } catch (slackErr) {
        console.warn('[CreateTaskModal] Slack 알림 실패:', slackErr);
      }

      onClose();
    } catch (err) {
      // 에러 상세 로그 — code / message / details / hint 모두 출력
      console.error('════════════════════════════════════════');
      console.error('[CreateTaskModal] 태스크 생성 실패');
      console.error('  code:', err.code);
      console.error('  message:', err.message);
      console.error('  details:', err.details);
      console.error('  hint:', err.hint);
      console.error('  전체 err 객체:', err);
      console.error('  전송한 payload:', payload);
      console.error('════════════════════════════════════════');

      const msg = err.message || String(err);
      let hint = msg;
      if (err.code === '42501' || msg.toLowerCase().includes('row-level security')) {
        hint = 'RLS 권한 부족 — 021 마이그레이션 (INSERT 정책) 실행 필요';
      } else if (err.code === '42703') {
        const colMatch = msg.match(/column "([^"]+)"/);
        hint = `컬럼 누락: ${colMatch?.[1] || '알 수 없음'} — 019/021 마이그레이션 확인`;
      } else if (err.code === '23502') {
        hint = '필수 값 누락: ' + (err.details || msg);
      } else if (err.code === '23503') {
        hint = 'FK 참조 오류: ' + (err.details || msg);
      } else if (err.code === '23514') {
        hint = 'CHECK 제약 위반 (status/priority 값 확인): ' + (err.details || msg);
      }
      addToast('태스크 생성 실패: ' + hint, 'error', 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="새 태스크"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button variant="gradient" onClick={handleSubmit} loading={busy} disabled={!form.title.trim()}>
            생성
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="제목 *"
          placeholder="무엇을 해야 하나요?"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          autoFocus
        />

        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
            설명
          </label>
          <textarea
            placeholder="배경·맥락·참고 정보"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-4 py-2.5 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:ring-[3px] focus:border-brand-purple/50 focus:ring-brand-purple/15 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
              상태
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand-purple/50"
            >
              {Object.entries(STATUS_MAP)
                .filter(([k]) => ['todo', 'in_progress', 'done'].includes(k))
                .map(([k, s]) => (
                  <option key={k} value={k}>{s.label}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
              우선순위
            </label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand-purple/50"
            >
              {Object.entries(PRIORITY_MAP).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="마감일"
          type="date"
          value={form.due_date}
          onChange={(e) => setForm({ ...form, due_date: e.target.value })}
        />

        {/* 담당자 표시 (defaultValues에서 받은 경우 강조) */}
        {assigneeName && (
          <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-md px-3 py-2 text-xs flex items-center gap-2">
            <span className="text-txt-muted">담당자:</span>
            <span className="text-brand-purple font-semibold">{assigneeName}</span>
            {assigneeId === user?.id && (
              <span className="text-[10px] text-txt-muted">(본인)</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="서비스"
            placeholder="예: 킨더보드"
            value={form.service_name}
            onChange={(e) => setForm({ ...form, service_name: e.target.value })}
          />
          <Input
            label="기능"
            placeholder="예: 온보딩"
            value={form.feature_name}
            onChange={(e) => setForm({ ...form, feature_name: e.target.value })}
          />
        </div>

        <Input
          label="태그"
          placeholder="쉼표로 구분 (예: UX, 데이터)"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          helperText="여러 개는 쉼표(,)로 구분하세요"
        />
      </form>
    </Modal>
  );
}
