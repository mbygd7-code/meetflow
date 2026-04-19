import { useNavigate } from 'react-router-dom';
import { Clock, ListChecks, Bell, Calendar, UserCircle } from 'lucide-react';
import { Card, Avatar, Badge } from '@/components/ui';
import { formatRelative, formatDate, formatElapsed, safeFormatDate } from '@/utils/formatters';
import { useToastStore } from '@/stores/toastStore';

export default function MeetingCard({ meeting, onClick, onCancel }) {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const isActive = meeting.status === 'active';
  const isScheduled = meeting.status === 'scheduled';
  const isCompleted = meeting.status === 'completed';

  const handleClick = () => {
    if (onClick) return onClick(meeting);
    navigate(`/meetings/${meeting.id}`);
  };

  // 시간 레이블 — 상태별 분기 + null 안전 fallback
  const timeLabel = () => {
    if (isActive && meeting.started_at) return `진행 ${formatElapsed(meeting.started_at)}`;
    if (isScheduled) {
      const when = meeting.scheduled_at || meeting.created_at;
      return safeFormatDate(when, 'MM/dd HH:mm', '시간 미정');
    }
    if (isCompleted) {
      const end = meeting.ended_at || meeting.started_at;
      return end ? formatRelative(end) : '';
    }
    return '';
  };

  // 날짜만 별도 표시 (scheduled일 때 유용)
  const dateLabel = isScheduled ? safeFormatDate(meeting.scheduled_at, 'MM/dd (EEE)', '') : '';

  // 진행 중 회의: 미참석 직원 (online !== true인 참여자)
  const absentParticipants = isActive
    ? (meeting.participants || []).filter((p) => p.online !== true)
    : [];

  const handleRemind = (e, participant) => {
    e.stopPropagation();
    addToast(`${participant.name}님에게 Slack 리마인드를 전송했습니다.`, 'success');
  };

  const creatorName = meeting.creator?.name || null;
  const creatorColor = meeting.creator?.color || '#723CEB';

  return (
    <Card
      onClick={handleClick}
      className="group/card relative cursor-pointer hover:border-border-hover-strong hover:-translate-y-0.5"
    >
      {isActive && (
        <span className="absolute left-0 top-6 bottom-6 w-0.5 rounded-r bg-status-success" />
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
        {isScheduled && onCancel ? (
          <>
            <Badge variant="purple" className="group-hover/card:hidden">예정</Badge>
            <button onClick={onCancel} className="hidden group-hover/card:inline-flex">
              <Badge variant="danger">취소</Badge>
            </button>
          </>
        ) : isScheduled ? (
          <Badge variant="purple">예정</Badge>
        ) : null}
        {isCompleted && <Badge variant="outline">완료</Badge>}
      </div>

      {/* 시간 · 어젠다 */}
      <div className="flex items-center gap-3 text-xs text-txt-secondary mb-2 flex-wrap">
        {isScheduled && dateLabel && (
          <span className="flex items-center gap-1.5">
            <Calendar size={12} strokeWidth={2} />
            {dateLabel}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Clock size={12} strokeWidth={2} />
          {timeLabel() || '시간 미정'}
        </span>
        <span className="flex items-center gap-1.5">
          <ListChecks size={12} strokeWidth={2} />
          어젠다 {meeting.agendas?.length || 0}개
        </span>
      </div>

      {/* 요청자 */}
      {creatorName && (
        <div className="flex items-center gap-1.5 text-[11px] text-txt-muted mb-3">
          <UserCircle size={11} strokeWidth={2} />
          <span>요청자</span>
          <span className="text-txt-secondary font-medium">{creatorName}</span>
        </div>
      )}

      {/* 참여자 아바타 */}
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          <Avatar variant="ai" size="sm" label="M" />
          {meeting.participants?.slice(0, 4).map((p) => (
            <Avatar
              key={p.id}
              name={p.name}
              color={p.color}
              size="sm"
              className="ring-2 ring-bg-secondary"
            />
          ))}
          {meeting.participants?.length > 4 && (
            <div className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center text-[10px] text-txt-secondary ring-2 ring-bg-secondary">
              +{meeting.participants.length - 4}
            </div>
          )}
          {/* 참여자 정보가 없을 때 요청자 아바타를 fallback으로 */}
          {(!meeting.participants || meeting.participants.length === 0) && creatorName && (
            <Avatar
              name={creatorName}
              color={creatorColor}
              size="sm"
              className="ring-2 ring-bg-secondary"
            />
          )}
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
                <Bell size={10} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
