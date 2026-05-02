// ScreenShareView — 회의 중 활성 화면 공유 비디오 패널
// - LiveKit screenShares Map (identity → { videoTrack, audioTrack, name, isLocal })을 받아
//   메인 화면 1명 + (다중 발표자 시) 작은 PIP 썸네일 표시
// - 각 video element에 track.attach() / cleanup 시 detach()
// - 본인이 공유 중일 때는 무한 거울 회피 — 메인에 본인 트랙은 안 띄우고 안내 메시지

import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorX, X, Pencil, Maximize2, Minimize2, Expand } from 'lucide-react';
import DrawingOverlay from './DrawingOverlay';
// Note: 별도 창 분리는 Document Picture-in-Picture API 사용 (Chrome/Edge 116+).
// 일반 브라우저 풀스크린 API 는 더 이상 사용하지 않음 (사용자 요구로 별도 창 분리 방식 채택).

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
  // 발표 집중 모드 — 부모에서 focusMode 상태 관리
  //   focusMode=true: LNB 최소화 + VoicePanel 숨김 + Ctrl+wheel 줌 활성. 채팅은 그대로.
  //   onToggleFocusMode 미제공 시 버튼 미노출 (발표자 본인은 의미 없음).
  focusMode = false,
  onToggleFocusMode,
  // 발표자 본인 시점일 때 우측 영역에 채팅 패널을 임베드하기 위한 콜백 ref.
  //   부모(MeetingRoom)가 div 노드를 받아 createPortal 의 target 으로 사용.
  //   발표자 본인 시점일 때만 호출(노드 전달), 그 외엔 null 호출(해제).
  onEmbeddedChatHost,
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

  // 메인 발표자 도출 — useEffect 들이 main.videoTrack 을 참조하기 위해 일찍 계산.
  //   list 비어있을 수 있으므로 null safety 적용 (이후 early return 으로 빈 케이스 처리).
  const main = list.length > 0
    ? (list.find((s) => s.identity === mainIdentity) || list[list.length - 1])
    : null;
  const others = main ? list.filter((s) => s.identity !== main.identity) : [];

  // 드로잉 모드 + 캔버스 크기 추적 (inline 모드에서만 활용)
  const [drawingActive, setDrawingActive] = useState(false);
  const [toolbarHost, setToolbarHost] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const videoWrapRef = useRef(null);
  // ── 발표 집중 모드 시 Ctrl+wheel 줌 (영상 영역 내부) ──
  // CSS transform: scale 로 영상 비율 유지하며 확대. 1.0~3.0 사이.
  const [contentZoom, setContentZoom] = useState(1);
  // 줌 후 가려진 영역을 드래그로 이동 (pan) — translate transform 으로 적용
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStartRef = useRef(null); // { mouseX, mouseY, offsetX, offsetY }
  // focusMode 또는 줌 1배 복귀 시 pan/zoom 리셋
  useEffect(() => {
    if (!focusMode) {
      setContentZoom(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [focusMode]);
  useEffect(() => {
    if (contentZoom === 1) setPanOffset({ x: 0, y: 0 });
  }, [contentZoom]);

  // 비디오 wrap 에 wheel 리스너 — focusMode + Ctrl/Cmd 키일 때만 줌
  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el || !focusMode) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const step = 0.1;
      setContentZoom((z) => {
        const next = e.deltaY < 0 ? z + step : z - step;
        return Math.max(1, Math.min(3, +next.toFixed(2)));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [focusMode]);

  // 드래그로 pan — 줌 1배 초과 시에만 활성. window 단위 mousemove/up 으로 부드러운 이동
  const onPanMouseDown = (e) => {
    if (!focusMode || contentZoom === 1) return;
    if (e.button !== 0) return; // 좌클릭만
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      const start = panStartRef.current;
      if (!start) return;
      const dx = ev.clientX - start.mouseX;
      const dy = ev.clientY - start.mouseY;
      // 줌 배율을 고려한 max offset — 너무 멀리 못 가게 제한
      // 컨테이너의 절반 폭 × (zoom-1) 만큼 이동 가능
      const el = videoWrapRef.current;
      const maxX = el ? (el.clientWidth * (contentZoom - 1)) / 2 : 1000;
      const maxY = el ? (el.clientHeight * (contentZoom - 1)) / 2 : 1000;
      const nextX = Math.max(-maxX, Math.min(maxX, start.offsetX + dx));
      const nextY = Math.max(-maxY, Math.min(maxY, start.offsetY + dy));
      setPanOffset({ x: nextX, y: nextY });
    };
    const onUp = () => {
      panStartRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  // ── 별도 창(Document Picture-in-Picture) 분리 ──
  //   onExpandWindow 클릭 시 별도 창으로 video 트랙만 분리.
  //   Chrome/Edge 116+ 지원. Firefox/Safari 미지원 시 안내 메시지.
  //   별도 창엔 video element 만 (드로잉/채팅 X). 본 창은 그대로.
  const [pipWindow, setPipWindow] = useState(null);
  const pipWindowRef = useRef(null);
  pipWindowRef.current = pipWindow;
  const supportsDocPiP = typeof window !== 'undefined' && !!window.documentPictureInPicture;

  // PiP 창에서 video 에 track attach — main.videoTrack 변경/창 변경 시 재attach
  useEffect(() => {
    if (!pipWindow || !main?.videoTrack) return;
    const win = pipWindow;
    const videoEl = win.document.querySelector('video[data-pip-video]');
    if (!videoEl) return;
    try {
      main.videoTrack.attach(videoEl);
    } catch (e) {
      console.warn('[ScreenShareView] PiP video attach failed:', e?.message);
    }
    return () => {
      try { main.videoTrack.detach(videoEl); } catch {}
    };
  }, [pipWindow, main?.videoTrack]);

  const openInPipWindow = async () => {
    if (!supportsDocPiP) {
      alert('이 브라우저는 별도 창 분리를 지원하지 않습니다. Chrome/Edge 116+ 에서 사용하세요.');
      return;
    }
    if (pipWindow) {
      // 이미 열려 있으면 포커스
      try { pipWindow.focus(); } catch {}
      return;
    }
    try {
      const win = await window.documentPictureInPicture.requestWindow({
        width: 960,
        height: 540,
      });
      // PiP 창 기본 스타일 + video 마운트 슬롯
      const styleEl = win.document.createElement('style');
      styleEl.textContent = `
        body { margin: 0; padding: 0; background: #000; height: 100vh; overflow: hidden; }
        .pip-root { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        video { max-width: 100%; max-height: 100%; object-fit: contain; }
        .hint { position: fixed; top: 8px; left: 8px; color: rgba(255,255,255,0.6); font: 11px sans-serif; pointer-events: none; }
      `;
      win.document.head.appendChild(styleEl);
      const root = win.document.createElement('div');
      root.className = 'pip-root';
      root.innerHTML = `
        <video data-pip-video autoplay playsinline></video>
        <div class="hint">드로잉은 본 창에서만 가능합니다</div>
      `;
      win.document.body.appendChild(root);
      // 사용자가 창 닫으면 cleanup
      win.addEventListener('pagehide', () => {
        setPipWindow(null);
      });
      setPipWindow(win);
    } catch (e) {
      console.warn('[ScreenShareView] open PiP window failed:', e?.message);
      alert('별도 창 열기에 실패했습니다: ' + (e?.message || '알 수 없는 오류'));
    }
  };

  const closePipWindow = () => {
    if (pipWindow) {
      try { pipWindow.close(); } catch {}
      setPipWindow(null);
    }
  };

  // 컴포넌트 언마운트 시 PiP 창 자동 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      const win = pipWindowRef.current;
      if (win) {
        try { win.close(); } catch {}
      }
    };
  }, []);

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

  // (main, others 는 위쪽에서 일찍 계산 — useEffect 가 main 을 참조하므로 TDZ 회피)

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
          {/* 발표 집중 모드 토글 — LNB 최소화 + 음성 참가자 숨김 + Ctrl+wheel 줌 활성.
              채팅창은 그대로 유지 (사용자 요구). active 시 보라색 배경. */}
          {inline && typeof onToggleFocusMode === 'function' && (
            <button
              type="button"
              onClick={onToggleFocusMode}
              className={`p-1.5 rounded-md transition-colors ${
                focusMode
                  ? 'text-white bg-brand-purple'
                  : 'text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary'
              }`}
              title={focusMode
                ? '집중 모드 종료'
                : '발표 집중 모드 (LNB·음성패널 숨김, Ctrl+휠 줌)'}
              aria-label="발표 집중 모드 토글"
              aria-pressed={focusMode}
            >
              {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          {/* 별도 창 — Document PiP 로 video 만 분리. 본 창은 그대로 (공유+채팅 유지).
              별도 창엔 드로잉 X (서비스 창에서만 가능). */}
          {inline && (
            <button
              type="button"
              onClick={pipWindow ? closePipWindow : openInPipWindow}
              className={`p-1.5 rounded-md transition-colors ${
                pipWindow
                  ? 'text-white bg-brand-purple'
                  : 'text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary'
              }`}
              title={pipWindow
                ? '별도 창 닫기'
                : (supportsDocPiP
                    ? '별도 창으로 분리 (자유 리사이즈)'
                    : '이 브라우저는 미지원 (Chrome/Edge 116+)')}
              aria-label="별도 창 분리"
              aria-pressed={!!pipWindow}
              disabled={!supportsDocPiP && !pipWindow}
            >
              <Expand size={14} />
            </button>
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

      {/* 메인 비디오 영역
          - focusMode + Ctrl+wheel = 줌
          - 줌 > 1배 + 드래그 = 이동(pan) — 가려진 영역 보기
          - 큰 컬러 커서: viewer 시점일 때만 video 영역에 적용 (발표자 본인 영역 X) */}
      <div
        ref={videoWrapRef}
        onMouseDown={onPanMouseDown}
        className="flex-1 min-h-0 relative bg-black flex items-center justify-center overflow-hidden"
      >
        {main.isLocal ? (
          // 본인 공유 시점 — 좌측: 작은 미리보기 + 안내 / 우측: 채팅 호스트 슬롯
          //   ScreenShareView 내부 빈 공간(60%)에 채팅을 임베드하여 발표자도 실시간 피드백 확인.
          //   부모(MeetingRoom)가 createPortal 로 ChatArea 단일 인스턴스를 이 슬롯으로 보냄.
          <div className="flex w-full h-full">
            {/* 좌측 — 본인 미리보기 + 안내 (40%) */}
            <div className="w-[40%] min-w-[260px] flex flex-col items-center justify-center gap-3 text-txt-secondary border-r border-border-divider/40 px-4 py-3">
              <div className="px-4 py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-xs font-semibold">
                ● 내 화면을 다른 참가자에게 공유하고 있습니다
              </div>
              <div className="w-full max-w-[360px] aspect-video rounded-md overflow-hidden border border-border-default shadow-md bg-bg-tertiary">
                <ScreenVideo
                  track={main.videoTrack}
                  muted
                  className="w-full h-full object-contain"
                />
              </div>
              <p className="text-[11px] text-txt-muted text-center px-2 leading-relaxed">
                작게 표시되는 것은 본인 미리보기예요.<br />
                다른 참가자는 큰 화면으로 봅니다.
              </p>
            </div>
            {/* 우측 — 채팅 호스트 슬롯 (60%). MeetingRoom 의 ChatArea 가 portal 로 들어옴 */}
            <div
              ref={(node) => {
                if (typeof onEmbeddedChatHost === 'function') {
                  onEmbeddedChatHost(node);
                }
              }}
              className="flex-1 min-w-0 min-h-0 flex flex-col bg-bg-primary"
            />
          </div>
        ) : (
          // viewer — focusMode 시 Ctrl+wheel 줌 + 드래그 pan transform 적용 (영상 비율 유지)
          //   cursor: 큰 주황 화살표 (CSS SVG inline) — 줌 > 1 시 grab 커서로 전환 (드래그 안내)
          //   pan 진행 중엔 document.body.cursor 가 grabbing 으로 강제됨
          <div
            className="flex items-center justify-center w-full h-full"
            style={{
              cursor: focusMode && contentZoom > 1
                ? 'grab'
                : "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><path d=\"M4 4 L26 14 L15 16 L12 26 Z\" fill=\"%23FF902F\" stroke=\"%23ffffff\" stroke-width=\"2\" stroke-linejoin=\"round\"/></svg>') 4 4, auto",
              ...(focusMode && contentZoom !== 1 ? {
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${contentZoom})`,
                transition: panStartRef.current ? 'none' : 'transform 0.1s ease-out',
              } : null),
            }}
          >
            <ScreenVideo
              track={main.videoTrack}
              muted={false}
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          </div>
        )}

        {/* 줌 상태 표시 — focusMode 시 우측 상단에 현재 배율 + 조작 안내 */}
        {focusMode && contentZoom > 1 && (
          <div className="absolute top-3 right-3 z-30 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold pointer-events-none">
            {Math.round(contentZoom * 100)}%
            <span className="ml-1.5 text-white/60 font-normal">Ctrl+휠 · 드래그 이동</span>
          </div>
        )}

        {/* PiP 별도 창이 열려있을 때 안내 — 본 창의 비디오 영역 위에 약하게 표시 */}
        {pipWindow && !main.isLocal && (
          <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-md bg-brand-purple/80 backdrop-blur-sm text-white text-[11px] font-semibold pointer-events-none">
            ⤢ 별도 창에서 보고 있습니다
          </div>
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
