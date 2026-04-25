// 회의록 메타 바 — 요청자 + 시간 타임라인 + 기본 수치
// 제목 바로 아래 라인으로 렌더. 데이터가 없으면 그 항목만 자동 스킵
import { Calendar, Play, Square, Clock, ListChecks, Users, UserCircle, MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { safeFormatDate } from '@/utils/formatters';

/**
 * @param {{
 *   meeting: {
 *     scheduled_at?: string,
 *     started_at?: string,
 *     ended_at?: string,
 *     created_at?: string,
 *     creator?: { id: string, name: string, color: string } | null,
 *     agendas?: Array<unknown>,
 *   },
 *   participantCount?: number,
 *   durationMin?: number,
 * }} props
 */
export default function MeetingMetaBar({ meeting, participantCount, durationMin, messageCount, humanMsgs, aiMsgs }) {
  if (!meeting) return null;

  const chips = [];

  // 1. 요청자
  if (meeting.creator?.name) {
    chips.push(
      <span key="creator" className="inline-flex items-center gap-1.5">
        <UserCircle size={14} className="text-txt-muted" strokeWidth={2} />
        <span className="text-txt-muted">요청</span>
        <span className="inline-flex items-center gap-1.5 ml-0.5">
          <Avatar
            name={meeting.creator.name}
            color={meeting.creator.color}
            size="sm"
            className="!w-5 !h-5 !text-[9px]"
          />
          <span className="text-txt-primary font-medium">{meeting.creator.name}</span>
        </span>
      </span>
    );
  }

  // 2. 예정 시각 (scheduled_at)
  if (meeting.scheduled_at) {
    chips.push(
      <span key="scheduled" className="inline-flex items-center gap-1.5">
        <Calendar size={14} className="text-txt-muted" strokeWidth={2} />
        <span className="text-txt-muted">예정</span>
        <span className="text-txt-primary">
          {safeFormatDate(meeting.scheduled_at, 'MM/dd (EEE) HH:mm', '-')}
        </span>
      </span>
    );
  }

  // 3. 시작 시각 (예정과 같은 날짜면 시간만)
  if (meeting.started_at) {
    const sameDayAsScheduled =
      meeting.scheduled_at &&
      safeFormatDate(meeting.started_at, 'yyyyMMdd') ===
        safeFormatDate(meeting.scheduled_at, 'yyyyMMdd');
    const pattern = sameDayAsScheduled ? 'HH:mm' : 'MM/dd HH:mm';
    chips.push(
      <span key="started" className="inline-flex items-center gap-1.5">
        <Play size={13} className="text-status-success" strokeWidth={2.4} />
        <span className="text-txt-muted">시작</span>
        <span className="text-txt-primary">{safeFormatDate(meeting.started_at, pattern, '-')}</span>
      </span>
    );
  }

  // 4. 종료 시각
  if (meeting.ended_at) {
    const sameDayAsStart =
      meeting.started_at &&
      safeFormatDate(meeting.ended_at, 'yyyyMMdd') ===
        safeFormatDate(meeting.started_at, 'yyyyMMdd');
    const pattern = sameDayAsStart ? 'HH:mm' : 'MM/dd HH:mm';
    chips.push(
      <span key="ended" className="inline-flex items-center gap-1.5">
        <Square size={12} className="text-status-error" strokeWidth={2.4} />
        <span className="text-txt-muted">종료</span>
        <span className="text-txt-primary">{safeFormatDate(meeting.ended_at, pattern, '-')}</span>
      </span>
    );
  }

  // 5. 소요 시간
  if (durationMin != null && durationMin > 0) {
    const hours = Math.floor(durationMin / 60);
    const mins = durationMin % 60;
    const label = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;
    chips.push(
      <span key="duration" className="inline-flex items-center gap-1.5">
        <Clock size={14} className="text-brand-orange" strokeWidth={2} />
        <span className="text-txt-primary font-medium">{label}</span>
        <span className="text-txt-muted">소요</span>
      </span>
    );
  }

  // 6. 어젠다 수
  if (meeting.agendas?.length > 0) {
    chips.push(
      <span key="agendas" className="inline-flex items-center gap-1.5 text-txt-muted">
        <ListChecks size={14} strokeWidth={2} />
        어젠다 <span className="text-txt-primary font-medium">{meeting.agendas.length}</span>개
      </span>
    );
  }

  // 7. 참여자 수
  if (participantCount != null && participantCount > 0) {
    chips.push(
      <span key="participants" className="inline-flex items-center gap-1.5 text-txt-muted">
        <Users size={14} strokeWidth={2} />
        참가자 <span className="text-txt-primary font-medium">{participantCount}</span>명
      </span>
    );
  }

  // 8. 총 메시지 수 (사람/AI 분리 표시)
  if (messageCount != null && messageCount > 0) {
    const breakdown =
      humanMsgs != null && aiMsgs != null
        ? ` (사람 ${humanMsgs} · AI ${aiMsgs})`
        : '';
    chips.push(
      <span key="messages" className="inline-flex items-center gap-1.5 text-txt-muted">
        <MessageSquare size={14} strokeWidth={2} />
        <span className="text-txt-primary font-medium">{messageCount}</span>건{breakdown}
      </span>
    );
  }

  if (chips.length === 0) return null;

  return (
    <>
      {/* 데스크톱(md↑): 구분자 · 포함 한 줄 flex-wrap */}
      <div className="hidden md:flex items-center gap-x-4 gap-y-2 text-xs flex-wrap py-1">
        {chips.map((chip, i) => (
          <span key={i} className="inline-flex items-center gap-4">
            {chip}
            {i < chips.length - 1 && <span className="text-border-default">·</span>}
          </span>
        ))}
      </div>

      {/* 모바일(md 미만): 구분자 없이 칩만 flex-wrap, 더 타이트 */}
      <div className="md:hidden flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] py-1">
        {chips.map((chip, i) => (
          <span key={i} className="inline-flex items-center">
            {chip}
          </span>
        ))}
      </div>
    </>
  );
}
