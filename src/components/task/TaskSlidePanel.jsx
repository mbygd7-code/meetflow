// 태스크 상세 슬라이드 패널 (단일 표준 — TaskDetailModal 대체)
// 읽기 + 간단한 인라인 편집(상태/우선순위) 지원
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Clock, User, Calendar, Flag, MessageSquare, CheckCircle2, ExternalLink,
  Globe, Layout, Zap, Tag, Sparkles, Pencil, Save,
} from 'lucide-react';
import { Badge, Avatar } from '@/components/ui';
import { useTaskStore } from '@/stores/taskStore';
import { safeFormatDate, getInitials } from '@/utils/formatters';
import {
  getPriorityInfo,
  getStatusInfo,
  PRIORITY_MAP,
  STATUS_MAP,
} from '@/lib/taskConstants';
import { differenceInDays, parseISO } from 'date-fns';

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-1.5 w-[72px] text-[11px] text-txt-muted shrink-0 pt-0.5">
        <Icon size={13} />
        <span>{label}</span>
      </div>
      <div className="flex-1 min-w-0 text-xs text-txt-primary">{children}</div>
    </div>
  );
}

export default function TaskSlidePanel({ task, onClose }) {
  const panelRef = useRef(null);
  const updateTask = useTaskStore((s) => s.updateTask);

  // 간단한 인라인 편집 상태 (제목/상태/우선순위/마감)
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
  });

  useEffect(() => {
    if (!task) {
      setEditing(false);
      return;
    }
    setForm({
      title: task.title || '',
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      due_date: task.due_date || '',
    });
    setEditing(false);
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    const handleEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [task, onClose]);

  useEffect(() => {
    if (!task) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [task, onClose]);

  if (!task) return null;

  const priority = getPriorityInfo(task.priority);
  const status = getStatusInfo(task.status);
  const StatusIcon = status.icon;

  const isOverdue = task.due_date && task.status !== 'done' &&
    differenceInDays(new Date(), parseISO(task.due_date)) > 0;
  const daysLeft = task.due_date
    ? differenceInDays(parseISO(task.due_date), new Date())
    : null;

  // assignee null-safe
  const assigneeName = task.assignee?.name || task.assignee_name || null;
  const assigneeColor = task.assignee?.color || '#723CEB';

  // 서브태스크
  const subtasks = task.subtasks || [];
  const subtasksDone = subtasks.filter((s) => s.done).length;
  const subtasksTotal = subtasks.length;
  const progress = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  const handleSave = () => {
    updateTask(task.id, form);
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setForm({
      title: task.title || '',
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      due_date: task.due_date || '',
    });
    setEditing(false);
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="태스크 상세"
      className="fixed w-[340px] bg-[var(--bg-secondary)] border border-border-default rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.15)] animate-slide-left z-50"
      style={{ maxHeight: 'calc(100vh - 140px)', top: '80px', right: '24px' }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-divider">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md ${status.bg} flex items-center justify-center shrink-0`}>
            <StatusIcon size={16} className={status.color} />
          </div>
          <Badge variant={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'info' : 'outline'}>
            {status.label}
          </Badge>
          {task.ai_suggested && (
            <Badge variant="purple" className="!text-[9px]">
              <Sparkles size={11} strokeWidth={2.4} /> AI
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="px-2 py-1 rounded text-[11px] text-txt-muted hover:text-txt-primary"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="p-1.5 rounded-md text-brand-purple hover:bg-brand-purple/10 transition-colors"
                aria-label="저장"
              >
                <Save size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
              aria-label="편집"
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
            aria-label="닫기"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="p-4 space-y-4 overflow-y-auto scrollbar-hide"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        {/* 제목 */}
        {editing ? (
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full text-[15px] font-semibold text-txt-primary leading-snug bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 focus:outline-none focus:border-brand-purple/50"
            autoFocus
          />
        ) : (
          <h3 className="text-[15px] font-semibold text-txt-primary leading-snug">{task.title}</h3>
        )}

        {/* ── 기본 정보 ── */}
        <div className="space-y-2">
          <InfoRow icon={Flag} label="우선순위">
            {editing ? (
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs focus:outline-none focus:border-brand-purple/50"
              >
                {Object.entries(PRIORITY_MAP).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${priority.bg} ${priority.tone} border ${priority.border}`}>
                {priority.label}
              </span>
            )}
          </InfoRow>

          <InfoRow icon={StatusIcon} label="상태">
            {editing ? (
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs focus:outline-none focus:border-brand-purple/50"
              >
                {Object.entries(STATUS_MAP).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${status.bg} ${status.color}`}>
                {status.label}
              </span>
            )}
          </InfoRow>

          <InfoRow icon={Calendar} label="마감일">
            {editing ? (
              <input
                type="date"
                value={form.due_date || ''}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-xs focus:outline-none focus:border-brand-purple/50"
              />
            ) : task.due_date ? (
              <span className={`font-medium ${isOverdue ? 'text-status-error' : ''}`}>
                {safeFormatDate(task.due_date, 'yyyy.MM.dd', '-')}
                {isOverdue && daysLeft !== null && ` (${Math.abs(daysLeft)}일 초과)`}
                {!isOverdue && daysLeft !== null && daysLeft >= 0 && ` (D-${daysLeft})`}
              </span>
            ) : (
              <span className="text-txt-muted">미정</span>
            )}
          </InfoRow>

          {assigneeName && (
            <InfoRow icon={User} label="담당자">
              <div className="inline-flex items-center gap-1.5">
                <Avatar
                  name={assigneeName}
                  color={assigneeColor}
                  size="sm"
                  className="!w-5 !h-5 !text-[9px]"
                  label={getInitials(assigneeName)[0]}
                />
                <span className="font-medium">{assigneeName}</span>
              </div>
            </InfoRow>
          )}

          {task.created_at && (
            <InfoRow icon={Clock} label="생성일">
              <span className="text-txt-secondary">
                {safeFormatDate(task.created_at, 'yyyy.MM.dd', '-')}
              </span>
            </InfoRow>
          )}

          {task.meeting_id && task.meeting_title && (
            <InfoRow icon={MessageSquare} label="연관 회의">
              <Link
                to={`/summaries/${task.meeting_id}`}
                className="inline-flex items-center gap-1 text-brand-purple hover:underline"
              >
                {task.meeting_title}
                <ExternalLink size={12} />
              </Link>
            </InfoRow>
          )}
        </div>

        {/* ── 프로젝트 상세 ── */}
        {(task.service_name || task.page_name || task.feature_name || task.tags?.length) && (
          <div className="border-t border-border-divider pt-3 space-y-2">
            <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1">
              프로젝트 상세
            </p>

            {task.service_name && (
              <InfoRow icon={Globe} label="서비스">
                <span className="text-txt-secondary">{task.service_name}</span>
              </InfoRow>
            )}

            {task.page_name && task.page_name !== '-' && (
              <InfoRow icon={Layout} label="페이지">
                <span className="text-txt-secondary">{task.page_name}</span>
              </InfoRow>
            )}

            {task.feature_name && (
              <InfoRow icon={Zap} label="기능">
                <span className="text-txt-secondary">{task.feature_name}</span>
              </InfoRow>
            )}

            {task.tags?.length > 0 && (
              <InfoRow icon={Tag} label="태그">
                <div className="flex flex-wrap gap-1">
                  {task.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </InfoRow>
            )}
          </div>
        )}

        {/* ── 설명 ── */}
        {task.description && (
          <div className="border-t border-border-divider pt-3">
            <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-2">
              설명
            </p>
            <p className="text-xs text-txt-secondary leading-relaxed bg-bg-tertiary rounded-md p-3 whitespace-pre-wrap">
              {task.description}
            </p>
          </div>
        )}

        {/* ── 서브태스크 ── */}
        {subtasksTotal > 0 && (
          <div className="border-t border-border-divider pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">
                서브태스크
              </p>
              <span className="text-[10px] text-txt-secondary font-semibold">
                {subtasksDone}/{subtasksTotal} · {progress}%
              </span>
            </div>
            <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden mb-2">
              <div
                className="h-full bg-brand-purple transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="space-y-1.5">
              {subtasks.map((sub, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div
                    className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                      sub.done ? 'bg-status-success border-status-success' : 'border-txt-muted'
                    }`}
                  >
                    {sub.done && <CheckCircle2 size={8} className="text-white" />}
                  </div>
                  <span className={sub.done ? 'text-txt-muted line-through' : 'text-txt-primary'}>
                    {sub.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
