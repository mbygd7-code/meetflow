// "음성 참여 / 나가기" 토글 버튼 — AgendaBar 우측 또는 헤더에 거주
// 상태:
//   미참여: 보라색 "음성 참여" + Mic 아이콘
//   연결중: spinner + "연결 중..."
//   참여중: 빨간색 "음성 나가기" + PhoneOff 아이콘 (호버 시 명확)

import { Mic, PhoneOff, Loader2 } from 'lucide-react';

export default function VoiceJoinButton({
  connected,
  connecting,
  error,
  participantCount = 0,
  onJoin,
  onLeave,
  size = 'md', // 'sm' | 'md'
}) {
  const handleClick = () => {
    if (connecting) return;
    if (connected) onLeave?.();
    else onJoin?.();
  };

  const baseClass =
    size === 'sm'
      ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all'
      : 'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all';

  if (connecting) {
    return (
      <button
        disabled
        className={`${baseClass} bg-bg-tertiary text-txt-muted cursor-wait`}
        title="LiveKit 룸 연결 중..."
      >
        <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" />
        연결 중...
      </button>
    );
  }

  if (connected) {
    return (
      <button
        onClick={handleClick}
        className={`${baseClass} bg-status-error/15 text-status-error border border-status-error/30 hover:bg-status-error hover:text-white shadow-sm`}
        title={`음성 종료 (현재 ${participantCount}명 참여 중)`}
      >
        <PhoneOff size={size === 'sm' ? 12 : 14} strokeWidth={2.4} />
        음성 종료
        {participantCount > 0 && (
          <span className="ml-0.5 text-[10px] opacity-80">·{participantCount}</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`${baseClass} bg-brand-purple text-white hover:opacity-90 shadow-sm`}
      title={error ? `오류: ${error}` : '음성 회의 참여'}
    >
      <Mic size={size === 'sm' ? 12 : 14} strokeWidth={2.4} />
      음성 참여
    </button>
  );
}
