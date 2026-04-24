// 마이보드 오른쪽 사이드바 전용 — 디테일이 풍부한 내 태스크 카드
// 다른 사람에게 묻지 않고도 이 카드 안에서 맥락을 파악할 수 있도록 설계
// 인라인 빠른 편집: 상태(클릭 사이클) · 우선순위(드롭다운) · 담당자(드롭다운)
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  FileText, ChevronDown, ChevronUp, Folder, Layers, Zap, Clock, Check, PartyPopper,
} from 'lucide-react';
import { getDueDateStatus, formatMonthDay, getInitials } from '@/utils/formatters';
import { getPriorityInfo, getStatusInfo, PRIORITY_MAP, STATUS_MAP } from '@/lib/taskConstants';

// 인라인 편집에서 노출할 상태 4종 (취소 제외 — 상세 패널에서만 변경)
const QUICK_STATUSES = ['todo', 'in_progress', 'review', 'done'];

export default function MyTaskCard({
  task,
  selected,
  onSelect,
  // 인라인 편집용 (없으면 읽기 전용)
  members = [],
  onQuickStatus,     // (taskId, newStatus) => void
  onQuickUpdate,     // (taskId, patch) => void
}) {
  const [expanded, setExpanded] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  // 완료 확인 모달 — 실수 클릭 방지 + 팀 공유 안내
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  const priorityRef = useRef(null);
  const assigneeRef = useRef(null);
  const statusRef = useRef(null);
  const dueRef = useRef(null);

  // 팝오버 외부 클릭 → 닫기
  useEffect(() => {
    if (!priorityOpen && !assigneeOpen && !statusOpen && !dueOpen) return;
    const onDoc = (e) => {
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(e.target)) {
        setPriorityOpen(false);
      }
      if (assigneeOpen && assigneeRef.current && !assigneeRef.current.contains(e.target)) {
        setAssigneeOpen(false);
      }
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target)) {
        setStatusOpen(false);
      }
      if (dueOpen && dueRef.current && !dueRef.current.contains(e.target)) {
        setDueOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [priorityOpen, assigneeOpen, statusOpen, dueOpen]);

  const priority = getPriorityInfo(task.priority);
  const status = getStatusInfo(task.status);
  const StatusIcon = status.icon;
  const dday = getDueDateStatus(task.due_date);
  const isDone = task.status === 'done';

  const subtasksDone = task.subtasks?.filter((s) => s.done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const progress = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  const assigneeName = task.assignee?.name || task.assignee_name || null;
  const assigneeColor = task.assignee?.color || '#723CEB';
  const assigneeInitial = assigneeName ? getInitials(assigneeName)[0] : '?';

  // 인라인 편집 가능 여부
  const canEditStatus = typeof onQuickStatus === 'function';
  const canEditFields = typeof onQuickUpdate === 'function';

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // 팝오버 열린 상태면 카드 선택 안 함
      if (priorityOpen || assigneeOpen || statusOpen || dueOpen) return;
      e.preventDefault();
      onSelect?.(task);
    }
  };

  const handlePickStatus = (e, newStatus) => {
    e.stopPropagation();
    setStatusOpen(false);
    if (!canEditStatus || newStatus === task.status) return;
    // 완료 선택 시 → 확인 모달 표시 (실수 방지 + 팀 공유 안내)
    if (newStatus === 'done') {
      setConfirmDoneOpen(true);
      return;
    }
    onQuickStatus(task.id, newStatus);
  };

  const handleConfirmDone = (e) => {
    e?.stopPropagation?.();
    setConfirmDoneOpen(false);
    if (canEditStatus) onQuickStatus(task.id, 'done');
  };
  const handleCancelDone = (e) => {
    e?.stopPropagation?.();
    setConfirmDoneOpen(false);
  };

  // 마감일 변경 — input[type=date] 의 yyyy-mm-dd 문자열을 그대로 저장
  //   비우려면 빈 값 → null
  const handlePickDueDate = (newValue) => {
    setDueOpen(false);
    if (!canEditFields) return;
    const next = newValue || null;
    if ((next || null) === (task.due_date || null)) return;
    onQuickUpdate(task.id, { due_date: next });
  };
  // input[type=date] 의 value 형식 (YYYY-MM-DD) 추출
  const dueInputValue = task.due_date ? String(task.due_date).slice(0, 10) : '';

  const handlePickPriority = (e, newPriority) => {
    e.stopPropagation();
    setPriorityOpen(false);
    if (!canEditFields || newPriority === task.priority) return;
    onQuickUpdate(task.id, { priority: newPriority });
  };

  const handlePickAssignee = (e, member) => {
    e.stopPropagation();
    setAssigneeOpen(false);
    if (!canEditFields) return;
    const newAssigneeId = member?.id || null;
    if (newAssigneeId === task.assignee_id) return;
    onQuickUpdate(task.id, {
      assignee_id: newAssigneeId,
      assignee_name: member?.name || null,
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${task.title} — ${dday?.text || '기한 없음'}`}
      className={`
        bg-[var(--card-bg)] rounded-[8px] border transition-all cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-brand-purple/40 focus:border-brand-purple
        ${selected
          ? 'border-brand-purple bg-brand-purple/5'
          : 'border-border-subtle hover:border-border-hover-strong'
        }
        ${isDone ? 'opacity-70' : ''}
      `}
      onClick={() => {
        if (priorityOpen || assigneeOpen || statusOpen || dueOpen) return;
        onSelect?.(task);
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="p-3 space-y-2">
        {/* 상단: 상태 아이콘(시각 인디케이터) + 제목 + D-Day */}
        <div className="flex items-start gap-2">
          <StatusIcon size={17} className={`${status.color} mt-0.5 shrink-0`} aria-hidden="true" />
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
                <Folder size={11} strokeWidth={2.2} />
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
            className="pl-[22px] flex items-center gap-1 text-[11px] text-brand-purple hover:text-txt-primary transition-colors truncate"
          >
            <FileText size={12} strokeWidth={2} className="shrink-0" />
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
                {expanded ? <><ChevronUp size={12} /> 접기</> : <><ChevronDown size={12} /> 자세히</>}
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

        {/* 태그 — AI 제안 뱃지는 제거(중복 노이즈), 사용자 정의 태그만 노출 */}
        {task.tags?.length > 0 && (
          <div className="pl-[22px] flex items-center gap-1 flex-wrap">
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

        {/* 하단: 담당자(클릭 → 변경) + 우선순위(클릭 → 변경) + D-Day */}
        <div className="pl-[22px] flex items-center gap-2 pt-0.5">
          {/* 담당자 아바타 — 클릭 시 드롭다운 */}
          <div ref={assigneeRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!canEditFields || members.length === 0) { onSelect?.(task); return; }
                setAssigneeOpen((v) => !v);
                setPriorityOpen(false);
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 hover:ring-2 hover:ring-brand-purple/40 transition-all"
              style={{ backgroundColor: assigneeName ? assigneeColor : '#999' }}
              title={canEditFields ? `담당자: ${assigneeName || '미지정'} (클릭해 변경)` : assigneeName || '미지정'}
            >
              {assigneeInitial}
            </button>
            {assigneeOpen && (
              <div
                className="absolute z-20 bottom-full left-0 mb-1 min-w-[180px] max-h-[240px] overflow-y-auto bg-bg-secondary rounded-md shadow-xl border border-border-default py-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => handlePickAssignee(e, null)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-txt-muted hover:bg-bg-tertiary transition-colors"
                >
                  <span className="w-4 h-4 rounded-full border border-dashed border-txt-muted" />
                  미지정
                  {!task.assignee_id && <Check size={11} className="ml-auto text-brand-purple" />}
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={(e) => handlePickAssignee(e, m)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-txt-primary hover:bg-bg-tertiary transition-colors"
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{ backgroundColor: m.avatar_color || '#723CEB' }}
                    >
                      {(m.name || '?')[0]}
                    </span>
                    <span className="truncate">{m.name}</span>
                    {m.id === task.assignee_id && <Check size={11} className="ml-auto text-brand-purple" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 마감일 — 프로필과 우선순위 사이. 클릭 시 날짜 선택 */}
          <div ref={dueRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!canEditFields) { onSelect?.(task); return; }
                setDueOpen((v) => !v);
                setStatusOpen(false);
                setPriorityOpen(false);
                setAssigneeOpen(false);
              }}
              className={`text-[12px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-bg-tertiary transition-colors ${
                dday?.urgent ? 'text-status-error' : task.due_date ? 'text-txt-primary' : 'text-txt-muted'
              }`}
              title={canEditFields ? `마감일 변경 (현재: ${task.due_date ? formatMonthDay(task.due_date) : '미정'})` : '마감일'}
            >
              <Clock size={13} strokeWidth={2.4} />
              {task.due_date ? formatMonthDay(task.due_date) : '미정'}
            </button>
            {dueOpen && (
              <div
                className="absolute z-20 bottom-full left-0 mb-1 min-w-[180px] bg-bg-secondary rounded-md shadow-xl border border-border-default p-2"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="date"
                  value={dueInputValue}
                  onChange={(e) => handlePickDueDate(e.target.value)}
                  className="w-full text-[12px] px-2 py-1 rounded bg-bg-tertiary border border-border-subtle text-txt-primary focus:border-brand-purple/50 focus:outline-none [color-scheme:dark]"
                  autoFocus
                />
                {task.due_date && (
                  <button
                    type="button"
                    onClick={() => handlePickDueDate('')}
                    className="mt-2 w-full text-[11px] text-txt-muted hover:text-status-error transition-colors px-2 py-1 rounded hover:bg-bg-tertiary"
                  >
                    마감일 지우기
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 우선순위 뱃지 — 마감일 옆. 클릭 시 드롭다운 */}
          <div ref={priorityRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!canEditFields) { onSelect?.(task); return; }
                setPriorityOpen((v) => !v);
                setStatusOpen(false);
                setAssigneeOpen(false);
              }}
              className={`text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${priority.bg} ${priority.tone} border ${priority.border} hover:brightness-110 transition-all`}
              title={canEditFields ? `우선순위 변경 (현재: ${priority.label})` : priority.label}
            >
              {task.priority === 'urgent' && <Zap size={8} strokeWidth={2.6} />}
              {priority.label}
            </button>
            {priorityOpen && (
              <div
                className="absolute z-20 bottom-full left-0 mb-1 min-w-[130px] bg-bg-secondary rounded-md shadow-xl border border-border-default py-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {Object.entries(PRIORITY_MAP).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={(e) => handlePickPriority(e, key)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-txt-primary hover:bg-bg-tertiary transition-colors"
                  >
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${info.bg} ${info.tone} border ${info.border} text-[10px] font-medium`}>
                      {key === 'urgent' && <Zap size={8} strokeWidth={2.6} />}
                      {info.label}
                    </span>
                    {key === task.priority && <Check size={11} className="ml-auto text-brand-purple" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 상태 뱃지 — 카드 오른쪽 끝. 클릭 시 드롭다운 (할일/진행중/검토/완료) */}
          <div ref={statusRef} className="relative ml-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!canEditStatus) { onSelect?.(task); return; }
                setStatusOpen((v) => !v);
                setPriorityOpen(false);
                setAssigneeOpen(false);
              }}
              className={`text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${status.bg} ${status.color} border border-current/20 hover:brightness-110 transition-all`}
              title={canEditStatus ? `상태 변경 (현재: ${status.label})` : status.label}
              aria-haspopup="menu"
              aria-expanded={statusOpen}
            >
              <StatusIcon size={10} strokeWidth={2.6} />
              {status.label}
            </button>
            {statusOpen && (
              <div
                role="menu"
                className="absolute z-20 bottom-full right-0 mb-1 min-w-[140px] bg-bg-secondary rounded-md shadow-xl border border-border-default py-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {QUICK_STATUSES.map((key) => {
                  const info = STATUS_MAP[key];
                  if (!info) return null;
                  const Icon = info.icon;
                  const isCurrent = key === task.status;
                  return (
                    <button
                      key={key}
                      role="menuitem"
                      type="button"
                      onClick={(e) => handlePickStatus(e, key)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-bg-tertiary transition-colors ${
                        isCurrent ? 'bg-bg-tertiary/60' : ''
                      }`}
                    >
                      <Icon size={13} className={`${info.color} shrink-0`} />
                      <span className="text-txt-primary">{info.label}</span>
                      {isCurrent && <Check size={11} className="ml-auto text-brand-purple" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 완료 확인 모달 — body에 portal로 렌더 (카드 스택 위, 백드롭 포함) */}
      {confirmDoneOpen && createPortal(
        <div
          className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleCancelDone}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-done-title"
            className="bg-bg-secondary rounded-[12px] shadow-2xl border border-border-default p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-status-success/15 flex items-center justify-center shrink-0">
                <PartyPopper size={20} className="text-status-success" />
              </div>
              <div className="flex-1">
                <h3 id="task-done-title" className="text-base font-semibold text-txt-primary leading-tight">
                  수고하셨어요! 이 태스크를 완료할까요?
                </h3>
                <p className="text-xs text-txt-secondary mt-1.5 leading-relaxed">
                  완료 처리하면 팀원들에게 공유되고
                  대시보드에서도 즉시 반영됩니다.
                </p>
              </div>
            </div>

            <div className="bg-bg-tertiary/60 rounded-md px-3 py-2 mb-4 border border-border-subtle">
              <p className="text-[11px] text-txt-muted mb-0.5">완료할 태스크</p>
              <p className="text-[13px] font-medium text-txt-primary line-clamp-2">{task.title}</p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCancelDone}
                className="px-4 py-2 text-xs font-medium rounded-md text-txt-secondary border border-border-default hover:bg-bg-tertiary hover:text-txt-primary transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDone}
                autoFocus
                className="px-4 py-2 text-xs font-semibold rounded-md text-white bg-status-success hover:brightness-110 transition-all inline-flex items-center gap-1.5"
              >
                <Check size={14} strokeWidth={2.6} />
                완료 처리
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
