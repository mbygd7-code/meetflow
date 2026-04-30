// ScreenShareView — 회의 중 활성 화면 공유 비디오 패널
// - LiveKit screenShares Map (identity → { videoTrack, audioTrack, name, isLocal })을 받아
//   메인 화면 1명 + (다중 발표자 시) 작은 PIP 썸네일 표시
// - 각 video element에 track.attach() / cleanup 시 detach()
// - 본인이 공유 중일 때는 무한 거울 회피 — 메인에 본인 트랙은 안 띄우고 안내 메시지

import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorX, X } from 'lucide-react';

function ScreenVideo({ track, muted = true, className = '', onClick }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    try {
      track.attach(el);
    } catch (e) {
      console.warn('[ScreenShareView] video attach failed:', e?.message);
    }
    return () => {
      try { track.detach(el); } catch {}
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      onClick={onClick}
      className={className}
    />
  );
}

export default function ScreenShareView({
  screenShares,           // Map<identity, { videoTrack, audioTrack, name, isLocal, identity }>
  localIdentity,          // 본인 identity (현재 활용 안 함, 추후 grid view용)
  onStopLocal,            // 본인 공유 중지 콜백
  onClose,                // 패널 자체 닫기 (트랙은 살아있고 다시 열 수 있음)
}) {
  // Map → 배열 (videoTrack 있는 것만)
  const list = useMemo(() => {
    const arr = [];
    screenShares?.forEach?.((v) => { if (v?.videoTrack) arr.push(v); });
    return arr;
  }, [screenShares]);

  // 메인으로 띄울 발표자 (기본: 마지막 발표자 = 가장 최근)
  // 사용자가 다른 PIP를 클릭하면 해당 발표자로 메인 전환
  const [mainIdentity, setMainIdentity] = useState(null);
  useEffect(() => {
    // 메인이 사라지면 다음으로 자동 전환
    if (mainIdentity && !list.some((s) => s.identity === mainIdentity)) {
      setMainIdentity(list[list.length - 1]?.identity || null);
    }
    // 메인 미지정이면 마지막 발표자로
    if (!mainIdentity && list.length > 0) {
      setMainIdentity(list[list.length - 1].identity);
    }
  }, [list, mainIdentity]);

  if (list.length === 0) return null;

  const main = list.find((s) => s.identity === mainIdentity) || list[list.length - 1];
  const others = list.filter((s) => s.identity !== main.identity);

  return (
    <div className="absolute inset-0 z-20 bg-bg-primary/95 backdrop-blur-sm flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary/80 border-b border-border-divider">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-error/15 text-status-error text-[11px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-status-error animate-pulse" />
          공유 중
        </span>
        <span className="text-sm font-medium text-txt-primary truncate">
          {main.isLocal ? '내 화면' : `${main.name}님의 화면`}
        </span>
        {list.length > 1 && (
          <span className="text-[10px] text-txt-muted ml-1">
            (총 {list.length}명 공유 중)
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {main.isLocal && onStopLocal && (
            <button
              type="button"
              onClick={onStopLocal}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-status-error/15 text-status-error hover:bg-status-error hover:text-white transition-colors"
              title="공유 중지"
            >
              <MonitorX size={13} strokeWidth={2.4} />
              중지
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
              title="패널 닫기 (트랙은 유지)"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 메인 비디오 영역 */}
      <div className="flex-1 min-h-0 relative bg-black flex items-center justify-center">
        {main.isLocal ? (
          // 본인 공유 — 무한 거울 회피: 작은 미리보기 + 안내
          <div className="flex flex-col items-center gap-3 text-txt-secondary">
            <div className="px-4 py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-xs font-semibold">
              ● 내 화면을 다른 참가자에게 공유하고 있습니다
            </div>
            <div className="w-[40%] max-w-[480px] aspect-video rounded-md overflow-hidden border border-border-default shadow-md bg-bg-tertiary">
              <ScreenVideo
                track={main.videoTrack}
                muted
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-[11px] text-txt-muted">
              (작게 표시되는 것은 본인 미리보기 — 다른 참가자는 큰 화면으로 봅니다)
            </p>
          </div>
        ) : (
          <ScreenVideo
            track={main.videoTrack}
            muted={false}
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* 다른 발표자 PIP 썸네일 — 우하단 가로 스크롤 */}
        {others.length > 0 && (
          <div className="absolute bottom-3 right-3 flex gap-2 max-w-[60%] overflow-x-auto p-1">
            {others.map((s) => (
              <button
                key={s.identity}
                type="button"
                onClick={() => setMainIdentity(s.identity)}
                className="relative shrink-0 w-32 aspect-video rounded-md overflow-hidden border border-border-default hover:border-brand-purple shadow-md bg-bg-tertiary group/pip"
                title={`${s.name}님의 화면`}
              >
                <ScreenVideo
                  track={s.videoTrack}
                  muted
                  className="w-full h-full object-cover pointer-events-none"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 truncate">
                  {s.isLocal ? '내 화면' : s.name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
