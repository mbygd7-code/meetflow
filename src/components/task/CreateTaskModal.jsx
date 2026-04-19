// 태스크 생성 모달 — TasksPage의 "+ 새 태스크" 버튼 및 칸반 컬럼 "+" 버튼에서 호출
import { useState, useEffect } from 'react';
import { Modal, Input, Button } from '@/components/ui';
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
 * }} props
 */
export default function CreateTaskModal({ open, onClose, defaultStatus }) {
  const addTask = useTaskStore((s) => s.addTask);
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [form, setForm] = useState(INITIAL_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...INITIAL_FORM, status: defaultStatus || 'todo' });
    }
  }, [open, defaultStatus]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) {
      addToast('제목을 입력해주세요', 'error', 2000);
      return;
    }
    setBusy(true);
    try {
      const tagsArray = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const newTask = {
        id: `local-${Date.now()}`,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        assignee_id: user?.id || null,
        assignee: user
          ? { id: user.id, name: user.name, color: user.avatar_color || '#723CEB' }
          : null,
        assignee_name: user?.name || null,
        service_name: form.service_name.trim() || null,
        feature_name: form.feature_name.trim() || null,
        tags: tagsArray,
        ai_suggested: false,
        created_at: new Date().toISOString(),
        subtasks: [],
      };
      addTask(newTask);
      addToast('태스크가 생성되었습니다', 'success', 2000);
      onClose();
    } catch (err) {
      console.error('[CreateTaskModal]', err);
      addToast('태스크 생성 실패', 'error', 3000);
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
