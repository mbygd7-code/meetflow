import { useNavigate } from 'react-router-dom';
import { Clock, ListChecks, Bell, Calendar, UserCircle, AlertTriangle } from 'lucide-react';
import { Card, Avatar, Badge } from '@/components/ui';
import { formatRelative, formatElapsed, safeFormatDate } from '@/utils/formatters';
import { useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';

export default function MeetingCard({ meeting, onClick, onCancel, onJoin }) {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const currentUser = useAuthStore((s) => s.user);
  const isCreator = !!(meeting.created_by && currentUser?.id && meeting.created_by === currentUser.id);
  const isParticipant = !!(currentUser?.id && (meeting.participants || []).some((p) => p?.id === currentUser.id));
  // 초대 안 된 사용자(주로 관리자가 다른 회의 보는 경우) → 참석 버튼
  const showJoinAction = !isCreator && !isParticipant;
  const isActive = meeting.status === 'active';
  const isScheduled = meeting.status === 'scheduled';
  const isCompleted = meeting.status === 'completed';

  const handleClick = () => {
    if (onClick) return onClick(meeting);
    navigate(`/meetings/${meeting.id}`);
  };

  // 회의 시각 (완료/예정 구분 없이 실제 datetime)
  const meetingAt =
    meeting.ended_at ||
    meeting.started_at ||
    meeting.scheduled_at ||
    meeting.created_at;

  // 시간 레이블 — 상태별 분기 + null 안전 fallback
  const timeLabel = () => {
    if (isActive && meeting.started_at) return `진행 ${formatElapsed(meeting.started_at)}`;
    if (isScheduled) {
      return safeFormatDate(meeting.scheduled_at || meeting.created_at, 'HH:mm', '시간 미정');
    }
    if (isCompleted) {
      return safeFormatDate(meetingAt, 'HH:mm', '');
    }
    return '';
  };

  // 날짜 레이블 (예정 · 완료 둘 다 실제 날짜 표시)
  const dateLabel = isScheduled
    ? safeFormatDate(meeting.scheduled_at || meeting.created_at, 'MM/dd (EEE)', '')
    : isCompleted
    ? safeFormatDate(meetingAt, 'MM/dd (EEE)', '')
    : '';

  // 완료 회의의 보조 상대 시각 ("1일 전")
  const relativeLabel = isCompleted ? formatRelative(meetingAt) : '';

  // 진행 중 회의: 미참석 직원 (online !== true인 참여자) — id 중복 제거
  const absentParticipants = isActive
    ? (() => {
        const seen = new Set();
        return (meeting.participants || []).filter((p) => {
          if (p?.online === true) return false;
          if (!p?.id || seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      })()
    : [];

  const handleRemind = (e, participant) => {
    e.stopPropagation();
    addToast(`${participant.name}님에게 Slack 리마인드를 전송했습니다.`, 'success');
  };

  const creatorName = meeting.creator?.name || null;
  const creatorColor = meeting.creator?.color || '#723CEB';

  // 예정 시간이 지난 회의 감지 — scheduled_at 우선, 없으면 created_at (최소 10분 이전)
  const scheduledPassed = (() => {
    if (!isScheduled) return false;
    const effective = meeting.scheduled_at || meeting.created_at;
    if (!effective) return false;
    const when = new Date(effective);
    if (isNaN(when)) return false;
    // 10분 이상 지났을 때만 "경과"로 판단 (방금 만든 예정 회의는 제외)
    return (new Date() - when) > 10 * 60 * 1000;
  })();
  const overdueLabel = scheduledPassed
    ? formatRelative(meeting.scheduled_at || meeting.created_at)
    : '';

  return (
    <Card
      onClick={handleClick}
      className={`group/card relative cursor-pointer hover:border-border-hover-strong hover:-translate-y-0.5 ${
        scheduledPassed ? 'border-status-error/40 bg-status-error/[0.03]' : ''
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-6 bottom-6 w-0.5 rounded-r bg-status-success" />
      )}

      {/* 예정 시간 경과 — 중앙 알림 오버레이 */}
      {scheduledPassed && (
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="mx-auto max-w-[90%] bg-status-error/15 border border-status-error/40 backdrop-blur-sm rounded-lg px-3 py-2 text-center shadow-md">
            <div className="inline-flex items-center gap-1.5 text-status-error mb-0.5">
              <AlertTriangle size={16} strokeWidth={2.4} />
              <span className="text-[11px] font-bold uppercase tracking-wider">예정 시간 경과</span>
            </div>
            <p className="text-[11px] text-txt-primary font-medium">
              {overdueLabel} · 아직 시작 안 됨
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-base font-semibold text-txt-primary leading-snug line-clamp-2">
          {meeting.title}
        </h3>

        {isActive && (
          <Badge variant="success">
            <span className="w-1.5 h-1.5 rounded-full bg-status-success pulse-dot mr-1" />
            진행 중
          </Badge>
        )}
        {isScheduled && (showJoinAction ? onJoin : onCancel) ? (
          <>
            <Badge variant="purple" className="group-hover/card:hidden">예정</Badge>
            {showJoinAction && onJoin ? (
              <button onClick={onJoin} className="hidden group-hover/card:inline-flex" title="회의 참석">
                <Badge variant="success">참석</Badge>
              </button>
            ) : (
              <button onClick={onCancel} className="hidden group-hover/card:inline-flex" title={isCreator ? '회의 취소' : '회의 불참'}>
                <Badge variant="danger">{isCreator ? '취소' : '불참'}</Badge>
              </button>
            )}
          </>
        ) : isScheduled ? (
          <Badge variant="purple">예정</Badge>
        ) : null}
        {isCompleted && <Badge variant="outline">완료</Badge>}
      </div>

      {/* 시간 — 강조 표시 */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* 예정/완료 공통: 실제 날짜 (MM/dd 요일) */}
        {(isScheduled || isCompleted) && dateLabel && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-txt-primary">
            <Calendar size={16} strokeWidth={2.2} className={isCompleted ? 'text-txt-muted' : 'text-brand-purple'} />
            {dateLabel}
          </span>
        )}
        {/* 시각 (HH:mm) 또는 진행 경과 */}
        <span className={`inline-flex items-center gap-1.5 ${
          (isScheduled || isCompleted) && dateLabel ? 'text-xs text-txt-secondary' : 'text-sm font-semibold text-txt-primary'
        }`}>
          <Clock
            size={(isScheduled || isCompleted) && dateLabel ? 12 : 14}
            strokeWidth={2.2}
            className={(isScheduled || isCompleted) && dateLabel ? '' : 'text-brand-orange'}
          />
          {timeLabel() || '시간 미정'}
        </span>
        {/* 완료: 보조 상대 시각 */}
        {isCompleted && relativeLabel && (
          <span className="text-[11px] text-txt-muted">· {relativeLabel}</span>
        )}
      </div>

      {/* 요청자 */}
      {creatorName && (
        <div className="flex items-center gap-1.5 text-[11px] text-txt-muted mb-3">
          <UserCircle size={13} strokeWidth={2} />
          <span>요청자</span>
          <span className="text-txt-secondary font-medium">{creatorName}</span>
        </div>
      )}

      {/* 어젠다 내용 (최대 3개) */}
      {meeting.agendas?.length > 0 ? (
        <div className="mb-3 pl-2 border-l-2 border-brand-purple/25 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1">
            <ListChecks size={13} strokeWidth={2.2} />
            어젠다 {meeting.agendas.length}개
          </div>
          {meeting.agendas.slice(0, 3).map((a, i) => (
            <div key={a.id || i} className="flex items-start gap-1.5 text-[11px]">
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-border-default text-[8px] font-semibold text-txt-muted shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className={`flex-1 leading-snug ${a.status === 'completed' ? 'text-txt-muted line-through' : 'text-txt-secondary'}`}>
                {a.title}
              </span>
              {a.duration_minutes != null && (
                <span className="text-[10px] text-txt-muted shrink-0 mt-0.5">{a.duration_minutes}분</span>
              )}
            </div>
          ))}
          {meeting.agendas.length > 3 && (
            <p className="text-[10px] text-txt-muted pl-5">+{meeting.agendas.length - 3}개 더</p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-txt-muted mb-3">
          <ListChecks size={13} strokeWidth={2} />
          어젠다 없음
        </div>
      )}

      {/* 참여자 아바타 — id 중복 제거 (DB 차원 dup 방어) */}
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          <Avatar variant="ai" size="sm" label="M" />
          {(() => {
            const seen = new Set();
            const unique = [];
            // 1) 요청자(creator)를 먼저 포함 — meeting_participants에 누락된 경우 방어
            if (meeting.creator?.id) {
              unique.push({
                id: meeting.creator.id,
                name: meeting.creator.name,
                color: meeting.creator.color || creatorColor,
              });
              seen.add(meeting.creator.id);
            }
            // 2) participants에서 중복 제거하며 추가
            (meeting.participants || []).forEach((p) => {
              const k = p?.id;
              if (!k || seen.has(k)) return;
              seen.add(k);
              unique.push(p);
            });
            // 슬랙 응답 (참석/불참) — user_id별 마지막 응답 매핑
            const ackList = Array.isArray(meeting.acknowledged_by) ? meeting.acknowledged_by : [];
            const responseMap = new Map();
            ackList.forEach((a) => {
              if (!a?.user_id) return;
              responseMap.set(a.user_id, a);
            });
            return unique.slice(0, 4).map((p) => {
              const resp = responseMap.get(p.id);
              // status 누락된 레거시 데이터는 'attending'으로 간주
              const status = resp?.status || (resp ? 'attending' : null);
              return (
                <Avatar
                  key={p.id}
                  name={p.name || (p.id ? `참가자 ${p.id.slice(0, 4)}` : '참가자')}
                  color={p.color || undefined}
                  size="sm"
                  acknowledged={status === 'attending'}
                  declined={status === 'declined'}
                  declineReason={resp?.reason || ''}
                  className="ring-2 ring-bg-secondary"
                />
              );
            });
          })()}
          {(() => {
            // creator + participants 통합 인원 — 4명 초과면 잔여 카운트
            const total = new Set();
            if (meeting.creator?.id) total.add(meeting.creator.id);
            (meeting.participants || []).forEach((p) => p?.id && total.add(p.id));
            return total.size > 4 ? (
              <div className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center text-[10px] text-txt-secondary ring-2 ring-bg-secondary">
                +{total.size - 4}
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* 진행 중: 미참석 직원 표시 + 리마인드 */}
      {isActive && absentParticipants.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-divider">
          <p className="text-[10px] text-txt-muted mb-2">미참석</p>
          <div className="flex flex-wrap gap-1.5">
            {absentParticipants.map((p) => (
              <button
                key={p.id}
                onClick={(e) => handleRemind(e, p)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-status-warning bg-status-warning/10 hover:bg-status-warning/20 transition-colors"
                title={`${p.name}님에게 리마인드 전송`}
              >
                <Bell size={12} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
