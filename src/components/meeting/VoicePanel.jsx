// VoicePanel — LiveKit 음성 회의 참여자 그리드 + 본인 컨트롤
// - 활성 화자: 아바타 외곽 보라 펄스 ring (브랜드 컬러)
// - 본인: 마이크 토글 / 나가기 버튼
// - 위치: ChatArea 위에 슬라이드형 (참여 중일 때만 표시)

import { Mic, MicOff, Headphones, ChevronUp, ChevronDown, Radio, Repeat } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function VoicePanel({
  participants = [],     // [{ identity, name, isLocal, avatar_color, isMuted }]
  activeSpeakers,         // Set<string> identity
  muted,                  // 본인 음소거 여부
  currentUserId,
  // 음성 입력 모드 — 'toggle' | 'ptt'
  voiceMode = 'toggle',
  onChangeVoiceMode,
  pttPressed = false,
}) {
  // 모바일(< md, 768px) 에서는 기본 접힘 — 화면 공간 절약. 데스크톱은 기본 펼침.
  // 사용자가 수동으로 토글한 후엔 자동 동기화 안 함 (의도 보존)
  const userToggledRef = useRef(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e) => {
      // 사용자가 수동 토글 후엔 미디어 쿼리 변동 무시
      if (userToggledRef.current) return;
      setCollapsed(e.matches);
    };
    // 구형 브라우저 (Safari < 14) addListener fallback
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  const handleToggleCollapsed = () => {
    userToggledRef.current = true;
    setCollapsed((c) => !c);
  };

  const total = participants.length;
  const speakingCount = activeSpeakers?.size || 0;

  return (
    <div className="border-b border-border-subtle bg-bg-secondary/60 backdrop-blur-sm">
      {/* 헤더 — 항상 보임 */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-full bg-brand-purple/15 flex items-center justify-center">
              <Headphones size={14} className="text-brand-purple" />
            </div>
            {speakingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-status-success animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-txt-primary leading-tight">
              음성 회의 진행 중 ({total}명)
            </p>
            <p className="text-[10px] text-txt-muted leading-tight truncate">
              {speakingCount > 0
                ? `${speakingCount}명 발언 중`
                : '발언자 없음'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* 음성 입력 모드 — 토글/PTT 라디오 (둘 중 하나 선택, Space 동작 결정) */}
          <div className="inline-flex items-center bg-bg-tertiary/60 rounded-md p-0.5 border border-border-subtle">
            <button
              onClick={() => onChangeVoiceMode?.('toggle')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                voiceMode === 'toggle'
                  ? 'bg-brand-purple text-white shadow-sm'
                  : 'text-txt-muted hover:text-txt-primary'
              }`}
              title="토글 모드 — Space 한 번에 음소거 ↔ 발언 전환"
              aria-pressed={voiceMode === 'toggle'}
            >
              <Repeat size={11} />
              토글
            </button>
            <button
              onClick={() => onChangeVoiceMode?.('ptt')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                voiceMode === 'ptt'
                  ? 'bg-brand-orange text-white shadow-sm'
                  : 'text-txt-muted hover:text-txt-primary'
              }`}
              title="PTT 모드 — Space 누르고 있을 때만 발언 (같은 방 다중 참여 시 권장)"
              aria-pressed={voiceMode === 'ptt'}
            >
              <Radio size={11} />
              PTT
            </button>
          </div>

          {/* 현재 마이크 상태 인디케이터 (선택지가 아니라 표시 — 큰 마이크 버튼이 진짜 컨트롤) */}
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
              voiceMode === 'ptt'
                ? pttPressed
                  ? 'bg-status-error/15 text-status-error animate-pulse'
                  : 'bg-bg-tertiary text-txt-muted'
                : muted
                  ? 'bg-bg-tertiary text-txt-muted'
                  : 'bg-status-success/15 text-status-success animate-pulse'
            }`}
            title={
              voiceMode === 'ptt'
                ? (pttPressed ? 'Space 누르는 중 — 발언 중' : 'Space 떼는 중 — 음소거')
                : (muted ? '음소거 (Space 또는 아래 버튼으로 말하기)' : '발언 중 (Space 또는 아래 버튼으로 음소거)')
            }
          >
            {voiceMode === 'ptt'
              ? (pttPressed ? <><Mic size={11} />발언</> : <><MicOff size={11} />대기</>)
              : (muted ? <><MicOff size={11} />음소거</> : <><Mic size={11} />발언 중</>)}
          </div>

          <button
            onClick={handleToggleCollapsed}
            className="p-1 text-txt-muted hover:text-txt-primary transition-colors"
            title={collapsed ? '펼치기' : '접기'}
            aria-label={collapsed ? '참가자 목록 펼치기' : '참가자 목록 접기'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* 참가자 그리드 — 접힘 토글 */}
      {!collapsed && total > 0 && (
        <div className="px-3 md:px-4 pb-2.5">
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const speaking = activeSpeakers?.has(p.identity);
              const isMe = p.identity === currentUserId || p.isLocal;
              const initial = (p.name || '?').slice(0, 2);
              return (
                <div
                  key={p.identity}
                  className="relative flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-tertiary/60 border border-border-subtle"
                  title={`${p.name}${isMe ? ' (나)' : ''}${p.isMuted ? ' · 음소거' : ''}`}
                >
                  {/* 아바타 + speaking ring */}
                  <div className="relative">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ backgroundColor: p.avatar_color || '#723CEB' }}
                    >
                      {initial}
                    </div>
                    {speaking && (
                      <span
                        className="absolute inset-0 rounded-full ring-2 ring-brand-purple animate-pulse pointer-events-none"
                        aria-hidden
                      />
                    )}
                    {p.isMuted && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-bg-secondary flex items-center justify-center">
                        <MicOff size={7} className="text-status-error" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-txt-secondary font-medium truncate max-w-[80px]">
                    {p.name}
                  </span>
                  {isMe && (
                    <span className="text-[9px] font-semibold text-brand-purple px-1 py-0.5 rounded bg-brand-purple/10">
                      나
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
