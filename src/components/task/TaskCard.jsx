import { Circle, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { formatDueDate } from '@/utils/formatters';
import { differenceInDays, parseISO } from 'date-fns';

const PRIORITY_STYLE = {
  urgent: { label: '긴급', variant: 'danger', dot: 'bg-status-error' },
  high: { label: '높음', variant: 'danger', dot: 'bg-status-error' },
  medium: { label: '보통', variant: 'purple', dot: 'bg-brand-purple' },
  low: { label: '낮음', variant: 'outline', dot: 'bg-txt-muted' },
};

export default function TaskCard({ task, onToggle, onClick, compact = false }) {
  const isDone = task.status === 'done';
  const diff = task.due_date
    ? differenceInDays(parseISO(task.due_date), new Date())
    : null;
  const isUrgent = diff !== null && diff <= 2 && !isDone;
  const priority = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;

  return (
    <div
      onClick={() => onClick?.(task)}
      className={`
        group bg-bg-secondary border border-white/[0.08] rounded-[12px]
        p-4 hover:border-white/[0.16] transition-all cursor-pointer
        ${isDone ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* 체크 원형 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.(task);
          }}
          className="mt-0.5 shrink-0 text-txt-muted hover:text-status-success transition-colors"
        >
          {isDone ? (
            <CheckCircle2 size={18} className="text-status-success" />
          ) : (
            <Circle size={18} strokeWidth={2} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p
              className={`text-sm font-medium text-white leading-snug ${
                isDone ? 'line-through' : ''
              }`}
            >
              {task.title}
            </p>
            {task.ai_suggested && (
              <Badge variant="purple" className="!text-[9px] shrink-0">
                <Sparkles size={9} strokeWidth={2.4} /> AI
              </Badge>
            )}
          </div>

          {!compact && task.description && (
            <p className="text-xs text-txt-secondary mb-2 line-clamp-1">
              {task.description}
            </p>
          )}

          {!compact && task.meeting_title && (
            <p className="text-[11px] text-txt-muted mb-2 truncate">
              📎 {task.meeting_title}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {task.assignee && (
              <Avatar name={task.assignee.name} color={task.assignee.color} size="sm" />
            )}

            {task.due_date && (
              <div
                className={`inline-flex items-center gap-1 text-[11px] ${
                  isUrgent ? 'text-status-error' : 'text-txt-secondary'
                }`}
              >
                <Clock size={10} />
                <span>{formatDueDate(task.due_date)}</span>
              </div>
            )}

            {isUrgent && (
              <Badge variant="danger" className="!text-[9px]">
                D-{Math.max(0, diff)}
              </Badge>
            )}

            <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
            <span className="text-[10px] text-txt-muted">{priority.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
