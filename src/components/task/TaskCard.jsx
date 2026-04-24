import { Circle, CheckCircle2, Clock, Sparkles, Folder, Layers, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, Badge } from '@/components/ui';
import { formatDueDate, getInitials, getDueDateStatus } from '@/utils/formatters';
import { getPriorityInfo } from '@/lib/taskConstants';

/**
 * 태스크 카드 — TasksPage 리스트/칸반에서 공통 사용.
 * compact=true 이면 칸반용 간결 버전 (설명/컨텍스트 생략).
 */
export default function TaskCard({ task, onToggle, onClick, selected = false, compact = false }) {
  const isDone = task.status === 'done';
  const priority = getPriorityInfo(task.priority);
  const dday = getDueDateStatus(task.due_date);
  const isUrgent = dday?.urgent && !isDone;

  // assignee null-safe
  const assigneeName = task.assignee?.name || task.assignee_name || null;
  const assigneeColor = task.assignee?.color || '#723CEB';

  // 서브태스크 진행률
  const subtasksDone = task.subtasks?.filter((s) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const progress = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(task);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${task.title}${task.due_date ? ` · ${formatDueDate(task.due_date)}` : ''}`}
      onClick={() => onClick?.(task)}
      onKeyDown={handleKeyDown}
      className={`
        group bg-bg-secondary border rounded-[8px] p-4 transition-all cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-brand-purple/40
        ${selected
          ? 'border-brand-purple bg-brand-purple/5'
          : 'border-border-subtle hover:border-border-hover-strong'
        }
        ${isDone ? 'opacity-60' : ''}
      `}
    >
      <div className="flex items-start gap-3">
        {/* 체크 원형 */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle?.(task); }}
          className="mt-0.5 shrink-0 text-txt-muted hover:text-status-success transition-colors"
          aria-label={isDone ? '완료 해제' : '완료 처리'}
        >
          {isDone ? (
            <CheckCircle2 size={18} className="text-status-success" />
          ) : (
            <Circle size={18} strokeWidth={2} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* 제목 + AI 뱃지 */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p
              className={`text-sm font-medium text-txt-primary leading-snug ${
                isDone ? 'line-through' : ''
              }`}
            >
              {task.title}
            </p>
            {task.ai_suggested && (
              <Badge variant="purple" className="!text-[9px] shrink-0">
                <Sparkles size={11} strokeWidth={2.4} /> AI
              </Badge>
            )}
          </div>

          {/* ── compact 모드가 아니면 상세 정보 ── */}
          {!compact && (
            <>
              {/* 서비스 · 페이지 · 기능 컨텍스트 */}
              {(task.service_name || task.page_name || task.feature_name) && (
                <div className="flex items-center gap-1.5 text-[10px] text-txt-muted flex-wrap mb-1.5">
                  {task.service_name && (
                    <span className="inline-flex items-center gap-0.5">
                      <Folder size={11} strokeWidth={2.2} />
                      <span className="text-txt-secondary font-medium">{task.service_name}</span>
                    </span>
                  )}
                  {task.page_name && task.page_name !== '-' && (
                    <>
                      <span className="opacity-40">·</span>
                      <span>{task.page_name}</span>
                    </>
                  )}
                  {task.feature_name && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="inline-flex items-center gap-0.5">
                        <Layers size={11} strokeWidth={2.2} />
                        {task.feature_name}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* 출처 회의 */}
              {task.meeting_id && task.meeting_title && (
                <Link
                  to={`/summaries/${task.meeting_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[11px] text-brand-purple hover:text-txt-primary transition-colors truncate mb-1.5"
                >
                  <FileText size={12} strokeWidth={2} className="shrink-0" />
                  <span className="truncate">{task.meeting_title}</span>
                </Link>
              )}

              {/* 설명 1줄 */}
              {task.description && (
                <p className="text-xs text-txt-secondary mb-2 line-clamp-1">
                  {task.description}
                </p>
              )}

              {/* 서브태스크 프로그레스 */}
              {subtasksTotal > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-txt-muted mb-0.5">
                    <span>서브태스크 {subtasksDone}/{subtasksTotal}</span>
                    <span className="font-semibold text-txt-secondary">{progress}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden">
                    <div
                      className="h-full bg-brand-purple transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 태그 */}
              {task.tags?.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {task.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] text-txt-muted bg-bg-tertiary border border-border-subtle px-1.5 py-0.5 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                  {task.tags.length > 3 && (
                    <span className="text-[9px] text-txt-muted">+{task.tags.length - 3}</span>
                  )}
                </div>
              )}
            </>
          )}

          {/* 하단: 담당자 + 마감 + 우선순위 */}
          <div className="flex items-center gap-2 flex-wrap">
            {assigneeName && (
              <Avatar
                name={assigneeName}
                color={assigneeColor}
                size="sm"
                label={getInitials(assigneeName)[0]}
                className="!w-5 !h-5 !text-[9px]"
              />
            )}

            {dday && (
              <div
                className={`inline-flex items-center gap-1 text-[11px] ${
                  isUrgent ? 'text-status-error font-semibold' : 'text-txt-secondary'
                }`}
              >
                <Clock size={12} />
                <span>{dday.text}</span>
              </div>
            )}

            <span
              className={`ml-auto text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${priority.bg} ${priority.tone} ${priority.border}`}
            >
              {priority.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
