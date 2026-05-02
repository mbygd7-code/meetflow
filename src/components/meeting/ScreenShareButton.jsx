// ScreenShareButton — 화면 공유 시작/중지 토글
// 상태:
//   미지원 환경: disabled + "이 브라우저에서는 지원되지 않음"
//   시작 가능: 보라 모니터 아이콘 + (옵션 팝오버)
//   공유 중: 빨강 + "공유 중지"
//
// 음성 룸 미연결 상태에서도 활성화 — 클릭 시 useLiveKitVoice.startScreenShare 가
// 자동으로 룸에 join (mute) 후 화면 공유를 시작함. 사용자는 "음성 참여" 단계를
// 별도로 거치지 않아도 됨. (connected prop은 호환성 위해 유지)

import { useState, useRef, useEffect } from 'react';
import { Monitor, MonitorX } from 'lucide-react';

export default function ScreenShareButton({
  connected = false,           // LiveKit 룸 연결 여부
  sharing = false,              // 본인이 현재 공유 중
  supported = true,             // getDisplayMedia 지원 환경 여부
  onStart,                      // ({ audio: bool, quality: 'low'|'medium'|'high' }) => void
  onStop,
  size = 'sm',                  // 'sm' | 'md'
  iconOnly = false,             // 모바일 헤더용
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [withAudio, setWithAudio] = useState(false);
  // 화질 — 'medium' (1080p) 기본. 사용자가 네트워크/콘텐츠에 맞게 선택.
  const [quality, setQuality] = useState('medium');
  const popRef = useRef(null);

  // 외부 클릭 시 팝오버 닫기
  useEffect(() => {
    if (!popoverOpen) return;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [popoverOpen]);

  // 음성 미참여여도 클릭 시 자동 join 후 공유 시작 → connected 게이트 제거.
  // 미지원 브라우저(getDisplayMedia 없음)만 비활성화 유지.
  const disabled = !supported;
  const disabledTitle = !supported
    ? '이 브라우저에서는 화면 공유를 지원하지 않습니다 (데스크톱 Chrome/Edge/Firefox에서 사용 가능)'
    : '';

  const iconSize = iconOnly ? 16 : (size === 'sm' ? 12 : 14);
  const baseClass = iconOnly
    ? 'inline-flex items-center justify-center w-8 h-8 rounded-md transition-all relative'
    : size === 'sm'
      ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all'
      : 'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all';

  if (sharing) {
    return (
      <button
        type="button"
        onClick={() => onStop?.()}
        className={`${baseClass} bg-status-error/15 text-status-error border border-status-error/30 hover:bg-status-error hover:text-white shadow-sm`}
        title="화면 공유 중지"
      >
        <MonitorX size={iconSize} strokeWidth={2.4} />
        {!iconOnly && '공유 중지'}
      </button>
    );
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          // 옵션 팝오버 토글 — 선택 후 onStart 호출
          setPopoverOpen((v) => !v);
        }}
        disabled={disabled}
        className={`${baseClass} ${
          disabled
            ? 'bg-bg-tertiary text-txt-muted cursor-not-allowed'
            : 'bg-brand-purple text-white hover:opacity-90 shadow-sm'
        }`}
        title={disabled ? disabledTitle : '화면 공유'}
      >
        <Monitor size={iconSize} strokeWidth={2.4} />
        {!iconOnly && '화면 공유'}
      </button>

      {popoverOpen && !disabled && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-bg-secondary border border-border-default rounded-md shadow-lg overflow-hidden min-w-[260px]">
          {/* 화질 선택 — 라디오 3개 */}
          <div className="p-3 border-b border-border-divider">
            <p className="text-[11px] font-semibold text-txt-primary mb-2">화질</p>
            <div className="space-y-1">
              {[
                { val: 'low', label: '기본', spec: '720p · 가벼움' },
                { val: 'medium', label: '고화질', spec: '1080p · 권장 ★' },
                { val: 'high', label: '최고화질', spec: '1440p · 무거움' },
              ].map((opt) => (
                <label
                  key={opt.val}
                  className={`flex items-center gap-2 cursor-pointer text-[11px] px-1.5 py-1 rounded transition-colors ${
                    quality === opt.val ? 'bg-brand-purple/10' : 'hover:bg-bg-tertiary/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="screen-quality"
                    checked={quality === opt.val}
                    onChange={() => setQuality(opt.val)}
                    className="accent-brand-purple"
                  />
                  <span className="text-txt-primary font-medium">{opt.label}</span>
                  <span className="text-[10px] text-txt-muted ml-auto">{opt.spec}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-txt-muted mt-2 leading-relaxed">
              네트워크 약하면 기본, 자료 글씨 위주면 고화질 권장
            </p>
          </div>
          {/* 시스템 오디오 옵션 */}
          <div className="p-3 border-b border-border-divider">
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-txt-secondary">
              <input
                type="checkbox"
                checked={withAudio}
                onChange={(e) => setWithAudio(e.target.checked)}
                className="accent-brand-purple"
              />
              <span>시스템 오디오 함께 공유</span>
            </label>
            <p className="text-[10px] text-txt-muted mt-1.5 leading-relaxed">
              시작 후 브라우저에서 화면/창/탭을 선택하세요
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPopoverOpen(false);
              onStart?.({ audio: withAudio, quality });
            }}
            className="w-full px-3 py-2 text-xs font-semibold text-white bg-brand-purple hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
          >
            <Monitor size={13} strokeWidth={2.4} />
            공유 시작
          </button>
        </div>
      )}
    </div>
  );
}
