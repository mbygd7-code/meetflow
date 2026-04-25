// 멤버/태스크 페이지 + 대시보드 + 직원상세 공통 태스크 카드
// 비주얼: 좌측 우선순위 컬러바 + 상단 뱃지(우선순위/상태/AI추출) + 제목 + 설명 + 메타(담당/마감/댓글/회의)
// 인라인 편집: 상태(드롭다운) · 우선순위(드롭다운) · 담당자(드롭다운) · 마감일(date picker) · 완료 확인 모달
// 편집 핸들러(onQuickStatus / onQuickUpdate)가 없으면 읽기 전용으로 동작
import { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, FileText, MessageSquare, ChevronRight, Check, Zap,
  PartyPopper, X as XIcon, Sparkles,
} from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { PRIORITY_MAP, STATUS_MAP, getPriorityInfo, getStatusInfo } from '@/lib/taskConstants';

// 인라인 편집 노출 상태 (취소 제외 — 마이태스크와 일관성)
const QUICK_STATUSES = ['todo', 'in_progress', 'review', 'done'];

export default function MemberTaskCard({
  task,
  assignee,                  // 사전 해석된 assignee 객체 (없으면 members + assignee_id로 자체 조회)
  creator,                   // (옵션) 생성자 객체
  commentCount = 0,
  onClick,                   // (task) => void  태스크 상세 패널 열기
  // 인라인 편집 (선택적 — 없으면 읽기 전용)
  members = [],
  onQuickStatus,             // (taskId, newStatus) => void
  onQuickUpdate,             // (taskId, patch) => void
}) {
  // ── 드롭다운 상태 ──
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [confirmDoneOpen, setConfirmDoneOpen] = useState(false);
  const statusRef = useRef(null);
  const priorityRef = useRef(null);
  const assigneeRef = useRef(null);
  const dueRef = useRef(null);

  // 외부 클릭 → 닫기
  useEffect(() => {
    if (!statusOpen && !priorityOpen && !assigneeOpen && !dueOpen) return;
    const onDoc = (e) => {
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false);
      if (priorityOpen && priorityRef.current && !priorityRef.current.contains(e.target)) setPriorityOpen(false);
      if (assigneeOpen && assigneeRef.current && !assigneeRef.current.contains(e.target)) setAssigneeOpen(false);
      if (dueOpen && dueRef.current && !dueRef.current.contains(e.target)) setDueOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [statusOpen, priorityOpen, assigneeOpen, dueOpen]);

  // 편집 가능 여부
  const canEditStatus = typeof onQuickStatus === 'function';
  const canEditFields = typeof onQuickUpdate === 'function';
  const anyOpen = statusOpen || priorityOpen || assigneeOpen || dueOpen;

  // ── 데이터 해석 ──
  const priority = getPriorityInfo(task.priority);
  const status = getStatusInfo(task.status);
  const StatusIcon = status.icon;

  const resolvedAssignee = assignee
    || (task.assignee_id ? members.find((m) => m.id === task.assignee_id) : null)
    || (task.assignee_name ? { name: task.assignee_name, avatar_color: '#723CEB' } : null);

  // 마감일 표시 (D-day / 오늘 / N일 지연)
  const dueInfo = useMemo(() => {
    if (!task.due_date) return null;
    const date = parseISO(task.due_date);
    if (!isValid(date)) return null;
    const diff = differenceInDays(date, new Date());
    const overdue = diff < 0 && task.status !== 'done';
    let label = format(date, 'M/d', { locale: ko });
    let colorClass = 'text-txt-secondary';
    if (overdue) {
      label = `${Math.abs(diff)}일 지연`;
      colorClass = 'text-status-error font-semibold';
    } else if (diff === 0) {
      label = '오늘';
      colorClass = 'text-brand-orange font-semibold';
    } else if (diff <= 3 && task.status !== 'done') {
      label = `D-${diff}`;
      colorClass = 'text-brand-orange';
    }
    return { label, colorClass };
  }, [task.due_date, task.status]);

  // ── 핸들러 ──
  const handlePickStatus = (e, newStatus) => {
    e.stopPropagation();
    setStatusOpen(false);
    if (!canEditStatus || newStatus === task.status) return;
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
    if (newAssigneeId === (task.assignee_id || null)) return;
    onQuickUpdate(task.id, {
      assignee_id: newAssigneeId,
      assignee_name: member?.name || null,
    });
  };

  const handlePickDueDate = (newValue) => {
    setDueOpen(false);
    if (!canEditFields) return;
    const next = newValue || null;
    if ((next || null) === (task.due_date || null)) return;
    onQuickUpdate(task.id, { due_date: next });
  };
  const dueInputValue = task.due_date ? String(task.due_date).slice(0, 10) : '';

  // 카드 본문 클릭 → 상세 (드롭다운 열려있으면 무시)
  const handleCardClick = () => {
    if (anyOpen) return;
    onClick?.(task);
  };
  const handleKeyDown = (e) => {
    if (anyOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(task);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3.5 py-2 text-left hover:border-brand-purple/30 hover:bg-bg-tertiary/30 transition-all group cursor-pointer focus:outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/20"
    >
      <div className="flex items-stretch gap-3">
        {/* 우선순위 컬러바 — 시각 인디케이터 (긴급일 때 두껍게 강조) */}
        <div
          className={`${task.priority === 'urgent' ? 'w-1.5' : 'w-1'} self-stretch rounded-full ${priority.dot} shrink-0`}
          aria-label={`우선순위: ${priority.label}`}
        />

        <div className="flex-1 min-w-0 flex flex-col gap-1 pr-1">
          {/* ═══ Row 1: 정체성 (제목 + 상태) ═══ */}
          <div className="flex items-start gap-2.5">
            <h3 className="text-sm font-semibold text-txt-primary leading-snug flex-1 min-w-0 group-hover:text-brand-purple transition-colors">
              {task.priority === 'urgent' && (
                <Zap size={12} className="inline-block text-status-error mr-1 -mt-0.5" strokeWidth={2.8} />
              )}
              {task.title}
            </h3>

            {/* 상태 — 우상단, 정체성 행에 배치 (가장 강한 우측 시선)
                in_progress는 가독성을 위해 중립 회색으로 override (STATUS_MAP 미변경) */}
            {(() => {
              const isInProgress = task.status === 'in_progress';
              const badgeColor = isInProgress ? 'text-txt-primary' : status.color;
              const badgeBg = isInProgress ? 'bg-bg-tertiary' : status.bg;
              return (
                <div ref={statusRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canEditStatus) { onClick?.(task); return; }
                      setStatusOpen((v) => !v);
                      setPriorityOpen(false); setAssigneeOpen(false); setDueOpen(false);
                    }}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold ${badgeColor} ${badgeBg} border border-current/20 px-2 py-0.5 rounded-full ${canEditStatus ? 'hover:brightness-110 transition-all' : ''}`}
                    title={canEditStatus ? `상태 변경 (현재: ${status.label})` : status.label}
                    aria-haspopup={canEditStatus ? 'menu' : undefined}
                    aria-expanded={canEditStatus ? statusOpen : undefined}
                  >
                    <StatusIcon size={11} strokeWidth={2.6} />
                    {status.label}
                  </button>
              {statusOpen && (
                <div
                  role="menu"
                  className="absolute z-30 top-full right-0 mt-1 min-w-[140px] bg-bg-secondary rounded-md shadow-xl border border-border-default py-1"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
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
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-bg-tertiary transition-colors ${isCurrent ? 'bg-bg-tertiary/60' : ''}`}
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
              );
            })()}
          </div>

          {/* ═══ Row 2: 설명 (옵션) ═══ */}
          {task.description && (
            <p className="text-[11px] text-txt-muted line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* ═══ Row 3: 메타 (액션 트리오 | 컨텍스트+CTA) ═══
              - 한 행에 다 들어가면 좌우 분리, 좁은 화면에서 wrap 시 자동 정렬
              - 점 구분자 대신 gap으로 분리 → wrap 시 어색함 없음
              - ml-auto로 컨텍스트+CTA가 데스크톱은 우측, 모바일 wrap 시 새 줄 좌측 끝 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px]">
            {/* 좌측: 핵심 액션 트리오 (담당 → 마감 → 우선순위) */}
            <div className="flex items-center gap-x-1.5 gap-y-1 min-w-0 flex-wrap">
              {/* 담당자 */}
              <div ref={assigneeRef} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canEditFields || members.length === 0) { onClick?.(task); return; }
                    setAssigneeOpen((v) => !v);
                    setStatusOpen(false); setPriorityOpen(false); setDueOpen(false);
                  }}
                  className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded whitespace-nowrap ${canEditFields && members.length > 0 ? 'hover:bg-bg-tertiary transition-colors' : ''}`}
                  title={canEditFields ? `담당자 변경 (현재: ${resolvedAssignee?.name || '미배정'})` : resolvedAssignee?.name || '미배정'}
                  aria-haspopup={canEditFields ? 'menu' : undefined}
                  aria-expanded={canEditFields ? assigneeOpen : undefined}
                >
                  {resolvedAssignee ? (
                    <>
                      <div
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: resolvedAssignee.avatar_color || '#723CEB' }}
                      >
                        {resolvedAssignee.name?.[0]}
                      </div>
                      <span className="text-txt-secondary font-medium">{resolvedAssignee.name}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-[18px] h-[18px] rounded-full border border-dashed border-txt-muted/50 flex items-center justify-center shrink-0">
                        <span className="text-[9px] text-txt-muted">?</span>
                      </div>
                      <span className="text-txt-muted italic">미배정</span>
                    </>
                  )}
                </button>
                {assigneeOpen && (
                  <div
                    className="absolute z-30 bottom-full left-0 mb-1 min-w-[180px] max-h-[240px] overflow-y-auto bg-bg-secondary rounded-md shadow-xl border border-border-default py-1"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => handlePickAssignee(e, null)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-txt-muted hover:bg-bg-tertiary transition-colors"
                    >
                      <span className="w-4 h-4 rounded-full border border-dashed border-txt-muted/50" />
                      미배정
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

              {/* 마감일 — 시간 정보 강조 (D-Day 시 색상 변화) */}
              <div ref={dueRef} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canEditFields) { onClick?.(task); return; }
                    setDueOpen((v) => !v);
                    setStatusOpen(false); setPriorityOpen(false); setAssigneeOpen(false);
                  }}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${dueInfo?.colorClass || 'text-txt-muted'} ${canEditFields ? 'hover:bg-bg-tertiary transition-colors' : ''}`}
                  title={canEditFields ? `마감일 변경 (현재: ${task.due_date || '미정'})` : task.due_date || '미정'}
                >
                  <Calendar size={12} />
                  {dueInfo?.label || '미정'}
                </button>
                {dueOpen && (
                  <div
                    className="absolute z-30 bottom-full left-0 mb-1 min-w-[180px] bg-bg-secondary rounded-md shadow-xl border border-border-default p-2"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="date"
                      defaultValue={dueInputValue}
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

              {/* 우선순위 — 작은 도트+라벨 (컬러바와 시각적으로 연결) */}
              <div ref={priorityRef} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canEditFields) { onClick?.(task); return; }
                    setPriorityOpen((v) => !v);
                    setStatusOpen(false); setAssigneeOpen(false); setDueOpen(false);
                  }}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${priority.tone} font-medium whitespace-nowrap ${canEditFields ? 'hover:bg-bg-tertiary transition-colors' : ''}`}
                  title={canEditFields ? `우선순위 변경 (현재: ${priority.label})` : priority.label}
                  aria-haspopup={canEditFields ? 'menu' : undefined}
                  aria-expanded={canEditFields ? priorityOpen : undefined}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                  {priority.label}
                </button>
                {priorityOpen && (
                  <div
                    role="menu"
                    className="absolute z-30 bottom-full left-0 mb-1 min-w-[130px] bg-bg-secondary rounded-md shadow-xl border border-border-default py-1"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {Object.entries(PRIORITY_MAP).map(([key, info]) => {
                      const isCurrent = key === task.priority;
                      return (
                        <button
                          key={key}
                          role="menuitem"
                          type="button"
                          onClick={(e) => handlePickPriority(e, key)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-bg-tertiary transition-colors ${isCurrent ? 'bg-bg-tertiary/60' : ''}`}
                        >
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${info.bg} ${info.tone} border ${info.border} text-[10px] font-medium`}>
                            {key === 'urgent' && <Zap size={8} strokeWidth={2.6} />}
                            {info.label}
                          </span>
                          {isCurrent && <Check size={11} className="ml-auto text-brand-purple" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 우측: 보조 컨텍스트 + 상세보기 CTA
                - ml-auto: 데스크톱 우측 끝, 모바일 wrap 시 새 줄에서 우측 정렬
                - shrink-0: 작아져도 안 줄어듦 */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {/* 컨텍스트 아이콘 묶음 — 보조 정보 */}
              {(commentCount > 0 || task.ai_suggested || task.meeting_id) && (
                <div className="flex items-center gap-1.5 text-txt-muted">
                  {commentCount > 0 && (
                    <span className="inline-flex items-center gap-0.5" title={`댓글 ${commentCount}개`}>
                      <MessageSquare size={11} />
                      <span className="text-[10px]">{commentCount}</span>
                    </span>
                  )}
                  {task.ai_suggested && (
                    <span
                      className="inline-flex items-center text-brand-purple/70"
                      title="AI 추출 태스크"
                    >
                      <Sparkles size={11} strokeWidth={2.4} />
                    </span>
                  )}
                  {task.meeting_id && (
                    <span
                      className="inline-flex items-center text-brand-purple/70"
                      title="회의에서 생성됨"
                    >
                      <FileText size={11} />
                    </span>
                  )}
                </div>
              )}

              {/* 상세보기 CTA — 카드 우측 고정 진입점 */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick?.(task);
                }}
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-txt-secondary hover:text-brand-purple transition-colors whitespace-nowrap"
                title="태스크 상세 보기"
              >
                상세보기
                <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 완료 확인 모달 — 마이태스크와 동일 UX */}
      {confirmDoneOpen && createPortal(
        <div
          className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleCancelDone}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-task-done-title"
            className="bg-bg-secondary rounded-[12px] shadow-2xl border border-border-default p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-status-success/15 flex items-center justify-center shrink-0">
                <PartyPopper size={20} className="text-status-success" />
              </div>
              <div className="flex-1">
                <h3 id="member-task-done-title" className="text-base font-semibold text-txt-primary leading-tight">
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
