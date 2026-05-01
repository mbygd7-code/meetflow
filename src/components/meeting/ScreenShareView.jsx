// ScreenShareView — 회의 중 활성 화면 공유 비디오 패널
// - LiveKit screenShares Map (identity → { videoTrack, audioTrack, name, isLocal })을 받아
//   메인 화면 1명 + (다중 발표자 시) 작은 PIP 썸네일 표시
// - 각 video element에 track.attach() / cleanup 시 detach()
// - 본인이 공유 중일 때는 무한 거울 회피 — 메인에 본인 트랙은 안 띄우고 안내 메시지

import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorX, X, Pencil } from 'lucide-react';
import DrawingOverlay from './DrawingOverlay';

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
  // 인라인 레이아웃 모드 — true 시 자료 패널 자리에 flex 자식으로 배치 (overlay X)
  inline = false,
  // 드로잉 통합용 (inline 모드에서 활용)
  meetingId = null,
  messages = [],
  following = false,
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

  // 드로잉 모드 + 캔버스 크기 추적 (inline 모드에서만 활용)
  const [drawingActive, setDrawingActive] = useState(false);
  const [toolbarHost, setToolbarHost] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const videoWrapRef = useRef(null);

  // 비디오 wrap 크기 추적 → DrawingOverlay width/height 동기화 (resize/zoom 즉시 반영)
  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inline]);

  // legacy(absolute overlay) 모드에서는 list 비면 null로 fallback (렌더 안 함).
  // inline 모드에서는 null 반환 시 부모(absolute overlay 컨테이너)가 빈 박스로
  // DocumentPanel을 가릴 위험이 있어 항상 placeholder 렌더 → 안전.
  if (list.length === 0) {
    if (!inline) return null;
    return (
      <div className={inline ? 'flex-1 min-h-0 flex flex-col bg-bg-primary' : 'absolute inset-0 z-20 bg-bg-primary/95 backdrop-blur-sm flex flex-col'}>
        <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary/80 border-b border-border-divider">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-warning/15 text-status-warning text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-status-warning animate-pulse" />
            준비 중
          </span>
          <span className="text-sm font-medium text-txt-primary truncate">화면 공유 준비 중...</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-auto p-1.5 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
              title="패널 닫기"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center text-txt-muted text-xs">
          비디오 트랙 수신 대기 중...
        </div>
      </div>
    );
  }

  const main = list.find((s) => s.identity === mainIdentity) || list[list.length - 1];
  const others = list.filter((s) => s.identity !== main.identity);

  // 컨테이너 클래스 — inline 모드는 부모 flex의 자식으로 자료 패널 자리 차지,
  // 그렇지 않으면 기존 absolute overlay 동작 (legacy 호환)
  const rootClass = inline
    ? 'flex-1 min-h-0 flex flex-col bg-bg-primary relative'
    : 'absolute inset-0 z-20 bg-bg-primary/95 backdrop-blur-sm flex flex-col';

  return (
    <div className={rootClass}>
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
          {/* 드로잉 툴바 호스트 — DrawingOverlay 가 toolbarContainer로 포털 배치 */}
          {inline && (
            <>
              <div ref={setToolbarHost} className="flex items-center gap-1.5" />
              <button
                type="button"
                onClick={() => setDrawingActive((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  drawingActive
                    ? 'bg-brand-purple text-white hover:opacity-90'
                    : 'bg-bg-tertiary text-txt-secondary hover:text-brand-purple hover:bg-brand-purple/10'
                }`}
                title={drawingActive ? '드로잉 종료' : '화면 위 드로잉 켜기'}
              >
                <Pencil size={13} strokeWidth={2.4} />
                {drawingActive ? '드로잉 종료' : '드로잉'}
              </button>
            </>
          )}
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
      <div ref={videoWrapRef} className="flex-1 min-h-0 relative bg-black flex items-center justify-center">
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

        {/* 드로잉 오버레이 — inline 모드에서만 활성화. PDF/이미지와 동일 패턴.
            화면 공유 영상 위에 그릴 수 있고 라이브 ON 시 다른 참가자에게 broadcast.
            targetKey 는 발표자별 고유 → 발표자 전환 시 새 stroke set 으로 재마운트. */}
        {inline && (drawingActive || following) && canvasSize.w > 0 && canvasSize.h > 0 && (
          <DrawingOverlay
            targetKey={`screen:${main.identity}`}
            fileName={`${main.isLocal ? '내' : main.name + '님의'} 화면 공유`}
            meetingId={meetingId}
            width={canvasSize.w}
            height={canvasSize.h}
            messages={messages}
            onClose={() => setDrawingActive(false)}
            toolbarContainer={toolbarHost}
            readOnly={!drawingActive}
            following={following}
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
