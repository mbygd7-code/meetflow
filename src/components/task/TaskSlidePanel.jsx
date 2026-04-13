import { useEffect, useRef } from 'react';
import {
  X, Clock, User, Calendar, Flag, MessageSquare, CheckCircle2, Circle, Loader,
  Globe, Layout, Zap, FileText, Tag,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { format, parseISO, differenceInDays } from 'date-fns';

const PRIORITY_MAP = {
  urgent: { label: '긴급', color: 'text-status-error', bg: 'bg-status-error/10' },
  high: { label: '높음', color: 'text-brand-orange', bg: 'bg-brand-orange/10' },
  medium: { label: '보통', color: 'text-txt-secondary', bg: 'bg-bg-tertiary' },
  low: { label: '낮음', color: 'text-txt-muted', bg: 'bg-bg-tertiary' },
};

const STATUS_MAP = {
  done: { label: '완료', icon: CheckCircle2, color: 'text-status-success', bg: 'bg-status-success/10' },
  in_progress: { label: '진행 중', icon: Loader, color: 'text-brand-purple', bg: 'bg-brand-purple/10' },
  todo: { label: '대기', icon: Circle, color: 'text-txt-muted', bg: 'bg-bg-tertiary' },
};

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-1.5 w-[72px] text-[11px] text-txt-muted shrink-0 pt-0.5">
        <Icon size={11} />
        <span>{label}</span>
      </div>
      <div className="flex-1 min-w-0 text-xs text-txt-primary">{children}</div>
    </div>
  );
}

export default function TaskSlidePanel({ task, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!task) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [task, onClose]);

  useEffect(() => {
    if (!task) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 100);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [task, onClose]);

  if (!task) return null;

  const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;
  const status = STATUS_MAP[task.status] || STATUS_MAP.todo;
  const StatusIcon = status.icon;
  const isOverdue = task.due_date && task.status !== 'done' &&
    differenceInDays(new Date(), parseISO(task.due_date)) > 0;
  const daysLeft = task.due_date ? differenceInDays(parseISO(task.due_date), new Date()) : null;

  return (
    <div
      ref={panelRef}
      className="fixed w-[320px] bg-[var(--bg-secondary)] border border-border-default rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.15)] animate-slide-left z-50"
      style={{ maxHeight: 'calc(100vh - 140px)', top: '80px', right: 'calc(300px + 40px)' }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-divider">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md ${status.bg} flex items-center justify-center shrink-0`}>
            <StatusIcon size={14} className={status.color} />
          </div>
          <Badge variant={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'info' : 'outline'}>
            {status.label}
          </Badge>
        </div>
        <button onClick={onClose} className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* 본문 */}
      <div className="p-4 space-y-4 overflow-y-auto scrollbar-hide" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {/* 제목 */}
        <h3 className="text-[15px] font-semibold text-txt-primary leading-snug">{task.title}</h3>

        {/* ── 기본 정보 ── */}
        <div className="space-y-2">
          <InfoRow icon={Flag} label="우선순위">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${priority.bg} ${priority.color}`}>
              {priority.label}
            </span>
          </InfoRow>

          {task.due_date && (
            <InfoRow icon={Calendar} label="마감일">
              <span className={`font-medium ${isOverdue ? 'text-status-error' : ''}`}>
                {format(parseISO(task.due_date), 'yyyy.MM.dd')}
                {isOverdue && ` (${Math.abs(daysLeft)}일 초과)`}
                {!isOverdue && daysLeft !== null && daysLeft >= 0 && ` (D-${daysLeft})`}
              </span>
            </InfoRow>
          )}

          {task.assignee_name && (
            <InfoRow icon={User} label="담당자">
              <span className="font-medium">{task.assignee_name}</span>
            </InfoRow>
          )}

          {task.created_at && (
            <InfoRow icon={Clock} label="생성일">
              <span className="text-txt-secondary">{format(parseISO(task.created_at), 'yyyy.MM.dd')}</span>
            </InfoRow>
          )}

          {task.meeting_title && (
            <InfoRow icon={MessageSquare} label="연관 회의">
              <span className="text-txt-secondary">{task.meeting_title}</span>
            </InfoRow>
          )}
        </div>

        {/* ── 프로젝트 상세 ── */}
        <div className="border-t border-border-divider pt-3 space-y-2">
          <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1">프로젝트 상세</p>

          <InfoRow icon={Globe} label="서비스">
            <span className="text-txt-secondary">{task.service_name || '킨더보드'}</span>
          </InfoRow>

          <InfoRow icon={Layout} label="페이지">
            <span className="text-txt-secondary">{task.page_name || '-'}</span>
          </InfoRow>

          <InfoRow icon={Zap} label="기능">
            <span className="text-txt-secondary">{task.feature_name || '-'}</span>
          </InfoRow>

          {task.tags && task.tags.length > 0 && (
            <InfoRow icon={Tag} label="태그">
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary">
                    {tag}
                  </span>
                ))}
              </div>
            </InfoRow>
          )}
        </div>

        {/* ── 설명 ── */}
        {task.description && (
          <div className="border-t border-border-divider pt-3">
            <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-2">설명</p>
            <p className="text-xs text-txt-secondary leading-relaxed bg-bg-tertiary rounded-md p-3 whitespace-pre-wrap">
              {task.description}
            </p>
          </div>
        )}

        {/* ── 서브태스크 ── */}
        {task.subtasks && task.subtasks.length > 0 && (
          <div className="border-t border-border-divider pt-3">
            <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-2">서브태스크</p>
            <div className="space-y-1.5">
              {task.subtasks.map((sub, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                    sub.done ? 'bg-status-success border-status-success' : 'border-txt-muted'
                  }`}>
                    {sub.done && <CheckCircle2 size={8} className="text-white" />}
                  </div>
                  <span className={sub.done ? 'text-txt-muted line-through' : 'text-txt-primary'}>{sub.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
