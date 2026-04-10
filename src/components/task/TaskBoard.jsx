import TaskCard from './TaskCard';
import { Plus } from 'lucide-react';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'bg-txt-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-brand-purple' },
  { id: 'done', label: 'Done', color: 'bg-status-success' },
];

export default function TaskBoard({ tasks, onToggle, onCardClick }) {
  const grouped = COLUMNS.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.status === col.id),
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {grouped.map((col) => (
        <div
          key={col.id}
          className="bg-bg-secondary border border-border-subtle rounded-[12px] p-4"
        >
          {/* 컬럼 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${col.color}`} />
              <h3 className="text-sm font-semibold text-txt-primary">{col.label}</h3>
              <span className="text-xs text-txt-muted">{col.tasks.length}</span>
            </div>
            <button className="text-txt-muted hover:text-txt-primary transition-colors">
              <Plus size={14} />
            </button>
          </div>

          {/* 카드 리스트 */}
          <div className="space-y-2.5">
            {col.tasks.length === 0 ? (
              <div className="text-center py-6 text-xs text-txt-muted">
                태스크가 없습니다
              </div>
            ) : (
              col.tasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onToggle={onToggle}
                  onClick={onCardClick}
                  compact
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
