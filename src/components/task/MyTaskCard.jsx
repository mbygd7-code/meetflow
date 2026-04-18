// 마이보드 오른쪽 사이드바 전용 — 디테일이 풍부한 내 태스크 카드
// 다른 사람에게 묻지 않고도 이 카드 안에서 맥락을 파악할 수 있도록 설계
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Circle, CircleDot, CheckCircle2, Clock, Sparkles,
  FileText, ChevronDown, ChevronUp, Folder, Layers, Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { differenceInDays, parseISO } from 'date-fns';

const PRIORITY_MAP = {
  urgent: { label: '긴급', tone: 'text-status-error', bg: 'bg-status-error/10', border: 'border-status-error/30' },
  high: { label: '높음', tone: 'text-brand-orange', bg: 'bg-brand-orange/10', border: 'border-brand-orange/25' },
  medium: { label: '보통', tone: 'text-brand-purple', bg: 'bg-brand-purple/10', border: 'border-brand-purple/20' },
  low: { label: '낮음', tone: 'text-txt-muted', bg: 'bg-bg-tertiary', border: 'border-border-subtle' },
};

const STATUS_MAP = {
  done: { icon: CheckCircle2, color: 'text-status-success' },
  in_progress: { icon: CircleDot, color: 'text-brand-purple' },
  todo: { icon: Circle, color: 'text-txt-muted' },
};

function dDayLabel(dueDate) {
  if (!dueDate) return null;
  const d = differenceInDays(parseISO(dueDate), new Date());
  if (d < 0) return { text: `${Math.abs(d)}일 지연`, urgent: true };
  if (d === 0) return { text: 'D-Day', urgent: true };
  if (d === 1) return { text: '내일', urgent: true };
  if (d <= 3) return { text: `D-${d}`, urgent: false };
  return { text: `D-${d}`, urgent: false };
}

export default function MyTaskCard({ task, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const StatusIcon = (STATUS_MAP[task.status] || STATUS_MAP.todo).icon;
  const statusColor = (STATUS_MAP[task.status] || STATUS_MAP.todo).color;
  const dday = dDayLabel(task.due_date);
  const isDone = task.status === 'done';

  const subtasksDone = task.subtasks?.filter((s) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const progress = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  return (
    <div
      className={`
        bg-[var(--card-bg)] rounded-[8px] border transition-all cursor-pointer
        ${selected
          ? 'border-brand-purple bg-brand-purple/5'
          : 'border-border-subtle hover:border-border-hover-strong'
        }
        ${isDone ? 'opacity-70' : ''}
      `}
      onClick={() => onSelect?.(task)}
    >
      <div className="p-3 space-y-2">
        {/* 상단: 상태 아이콘 + 제목 + D-Day */}
        <div className="flex items-start gap-2">
          <StatusIcon size={15} className={`${statusColor} mt-0.5 shrink-0`} />
          <p
            className={`flex-1 text-[13px] font-medium text-txt-primary leading-snug ${
              isDone ? 'line-through decoration-txt-muted' : ''
            }`}
          >
            {task.title}
          </p>
          {dday && (
            <span
              className={`shrink-0 text-[10px] font-semibold ${
                dday.urgent ? 'text-status-error' : 'text-txt-muted'
              }`}
            >
              {dday.text}
            </span>
          )}
        </div>

        {/* 컨텍스트: 서비스 · 페이지 · 기능 */}
        {(task.service_name || task.page_name || task.feature_name) && (
          <div className="flex items-center gap-1.5 text-[10px] text-txt-muted flex-wrap pl-[22px]">
            {task.service_name && (
              <span className="inline-flex items-center gap-0.5">
                <Folder size={9} strokeWidth={2.2} />
                {task.service_name}
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
                  <Layers size={9} strokeWidth={2.2} />
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
            className="pl-[22px] flex items-center gap-1 text-[11px] text-brand-purple hover:text-txt-primary transition-colors truncate"
          >
            <FileText size={10} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{task.meeting_title}</span>
          </Link>
        )}

        {/* 설명 (확장 가능) */}
        {task.description && (
          <div className="pl-[22px]">
            <p
              className={`text-[11px] text-txt-secondary leading-relaxed whitespace-pre-line ${
                expanded ? '' : 'line-clamp-2'
              }`}
            >
              {task.description}
            </p>
            {task.description.length > 60 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="mt-1 text-[10px] text-txt-muted hover:text-txt-secondary inline-flex items-center gap-0.5"
              >
                {expanded ? <><ChevronUp size={10} /> 접기</> : <><ChevronDown size={10} /> 자세히</>}
              </button>
            )}
          </div>
        )}

        {/* 서브태스크 프로그레스 */}
        {subtasksTotal > 0 && (
          <div className="pl-[22px] space-y-1">
            <div className="flex items-center justify-between text-[10px] text-txt-muted">
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

        {/* 태그 + AI 뱃지 */}
        {(task.tags?.length > 0 || task.ai_suggested) && (
          <div className="pl-[22px] flex items-center gap-1 flex-wrap">
            {task.ai_suggested && (
              <Badge variant="purple" className="!text-[9px] !px-1.5 !py-0.5">
                <Sparkles size={8} strokeWidth={2.6} /> AI 제안
              </Badge>
            )}
            {task.tags?.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[9px] text-txt-muted bg-bg-tertiary border border-border-subtle px-1.5 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
            {task.tags?.length > 3 && (
              <span className="text-[9px] text-txt-muted">+{task.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* 하단: 담당자 + 우선순위 */}
        <div className="pl-[22px] flex items-center gap-2 pt-0.5">
          {task.assignee && (
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
              style={{ backgroundColor: task.assignee.color }}
            >
              {task.assignee.name[0]}
            </span>
          )}
          <span className={`text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${priority.bg} ${priority.tone} border ${priority.border}`}>
            {task.priority === 'urgent' && <Zap size={8} strokeWidth={2.6} />}
            {priority.label}
          </span>
          {task.due_date && (
            <span className="text-[10px] text-txt-muted inline-flex items-center gap-0.5">
              <Clock size={9} />
              {task.due_date.slice(5).replace('-', '/')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
