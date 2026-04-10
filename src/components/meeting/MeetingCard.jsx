import { useNavigate } from 'react-router-dom';
import { Clock, ListChecks } from 'lucide-react';
import { Card, Avatar, Badge } from '@/components/ui';
import { formatRelative, formatDate } from '@/utils/formatters';

export default function MeetingCard({ meeting, onClick }) {
  const navigate = useNavigate();
  const isActive = meeting.status === 'active';
  const isScheduled = meeting.status === 'scheduled';
  const isCompleted = meeting.status === 'completed';

  const handleClick = () => {
    if (onClick) return onClick(meeting);
    navigate(`/meetings/${meeting.id}`);
  };

  const statusBadge = () => {
    if (isActive)
      return (
        <Badge variant="success">
          <span className="w-1.5 h-1.5 rounded-full bg-status-success pulse-dot mr-1" />
          진행 중
        </Badge>
      );
    if (isScheduled) return <Badge variant="purple">예정</Badge>;
    if (isCompleted) return <Badge variant="outline">완료</Badge>;
    return null;
  };

  const timeLabel = () => {
    if (isActive) return `시작 ${formatRelative(meeting.started_at)}`;
    if (isScheduled) return formatDate(meeting.scheduled_at, 'MM/dd HH:mm');
    if (isCompleted) return formatRelative(meeting.ended_at || meeting.started_at);
    return '';
  };

  return (
    <Card
      onClick={handleClick}
      className="relative cursor-pointer hover:border-white/[0.16] hover:-translate-y-0.5"
    >
      {isActive && (
        <span className="absolute left-0 top-6 bottom-6 w-0.5 rounded-r bg-status-success" />
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-base font-semibold text-white leading-snug line-clamp-2">
          {meeting.title}
        </h3>
        {statusBadge()}
      </div>

      <div className="flex items-center gap-4 text-xs text-txt-secondary mb-4">
        <span className="flex items-center gap-1.5">
          <Clock size={13} strokeWidth={2} />
          {timeLabel()}
        </span>
        <span className="flex items-center gap-1.5">
          <ListChecks size={13} strokeWidth={2} />
          어젠다 {meeting.agendas?.length || 0}개
        </span>
      </div>

      <div className="flex items-center justify-between">
        {/* 참여자 아바타 스택 */}
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
            <div className="w-8 h-8 rounded-full bg-bg-tertiary border border-white/[0.12] flex items-center justify-center text-[10px] text-txt-secondary ring-2 ring-bg-secondary">
              +{meeting.participants.length - 4}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
