import { useState, useEffect } from 'react';
import { Sparkles, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal, Input, Button, Avatar, Badge } from '@/components/ui';

const PRIORITIES = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'urgent', label: '긴급' },
];

const STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export default function TaskDetailModal({ task, open, onClose, onUpdate }) {
  const [form, setForm] = useState({
    title: '',
    priority: 'medium',
    status: 'todo',
    due_date: '',
  });

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        priority: task.priority || 'medium',
        status: task.status || 'todo',
        due_date: task.due_date || '',
      });
    }
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    onUpdate?.(task.id, form);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="태스크 상세"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSave}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {task.ai_suggested && (
          <Badge variant="purple" className="!text-[10px]">
            <Sparkles size={10} strokeWidth={2.4} /> Milo 추천 태스크
          </Badge>
        )}

        <Input
          label="제목"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        {task.description && (
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
              설명
            </label>
            <p className="text-sm text-txt-primary bg-bg-tertiary rounded-md p-3 border border-border-subtle">
              {task.description}
            </p>
          </div>
        )}

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
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
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
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
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

        {task.assignee && (
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
              담당자
            </label>
            <div className="flex items-center gap-3 bg-bg-tertiary rounded-md p-3 border border-border-subtle">
              <Avatar
                name={task.assignee.name}
                color={task.assignee.color}
                size="sm"
              />
              <span className="text-sm text-txt-primary">{task.assignee.name}</span>
            </div>
          </div>
        )}

        {task.meeting_id && task.meeting_title && (
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
              출처 회의
            </label>
            <Link
              to={`/summaries/${task.meeting_id}`}
              className="flex items-center gap-2 bg-bg-tertiary rounded-md p-3 border border-border-subtle hover:border-brand-purple/50 transition-colors group"
            >
              <Link2 size={14} className="text-brand-purple" />
              <span className="text-sm text-txt-primary group-hover:text-brand-purple">
                {task.meeting_title}
              </span>
            </Link>
          </div>
        )}
      </div>
    </Modal>
  );
}
