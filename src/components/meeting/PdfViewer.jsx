import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import DrawingOverlay from './DrawingOverlay';
import RemoteCursorsLayer from './RemoteCursorsLayer';

// PDF.js worker 설정 — Vite + unpkg CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PDF 뷰어 — react-pdf 기반
 * - 페이지 네비게이션
 * - 확대/축소 (50% ~ 300%)
 * - 카드 크기(width/height) 변화에 맞춰 자연스럽게 fit 조정 (ResizeObserver)
 */
export default function PdfViewer({
  url,
  // 드로잉 관련 — 활성 시 현재 페이지 위에 per-page 오버레이 렌더
  drawingActive = false,
  onCloseDrawing,
  meetingId,
  fileId,
  fileName,
  messages = [],
  toolbarContainer,
  // 라이브 동기화 — 다른 참가자가 페이지 넘기면 따라가기
  presenterPage,         // 외부가 강제로 지정하는 페이지 (null/undefined = 미사용)
  onPageChange,          // 내 페이지 변경 시 부모에게 알림 → broadcast
  controlsContainer,     // HTMLElement | null — 지정 시 컨트롤(페이지/줌)을 이 노드에 포털 렌더
  // 라이브 커서 동기화 — PDF 페이지 박스 기준으로 정규화하여 모든 사용자가 같은 위치에 표시
  vbroadcast,            // (event, payload) => void
  remoteCursors = {},    // { [uid]: { fileId, page, x, y, name, color, ts } }
  // 라이브 따라가기 ON 시 — 드로잉 오버레이를 readOnly 로 자동 마운트하여 다른 참가자 스트로크 표시
  // (연필 버튼은 별도로 drawingActive 를 켜야 툴바 + 편집 가능)
  following = false,
}) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1); // 0.5 ~ 3.0
  const [loadError, setLoadError] = useState(null);
  const [pageAspect, setPageAspect] = useState(0.707); // A4 기본 (w/h)
  const [fitWidth, setFitWidth] = useState(400);       // 컨테이너 기준 자동 계산
  const scrollContainerRef = useRef(null);
  // 페이지 렌더 박스 — DrawingOverlay 캔버스 치수 동기화용
  //   zoom/fitWidth 변화에 따라 ResizeObserver로 자동 갱신 → 드로잉이 페이지와 같이 스케일
  const pageWrapRef = useRef(null);
  const [pageBox, setPageBox] = useState({ w: 0, h: 0 });
  const cursorThrottleRef = useRef(0);

  useEffect(() => {
    const el = pageWrapRef.current;
    if (!el) return;
    // 진동 방지:
    //  - offsetWidth/Height (정수, subpixel 없음)
    //  - 2px 미만 변화는 무시 (canvas 리사이즈 → RO 재발화 루프 차단)
    //  - rAF 디바운스로 같은 프레임 내 다중 RO 발화를 1회로 합침
    let rafId = null;
    const update = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        setPageBox((prev) => {
          if (Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2) return prev;
          return { w, h };
        });
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [pageNumber, fitWidth, zoom]);

  const onDocumentLoadSuccess = useCallback(async (pdf) => {
    setNumPages(pdf.numPages);
    setPageNumber(1);
    setLoadError(null);
    // 첫 페이지의 aspect 계산 (width/height)
    try {
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      if (viewport.width && viewport.height) {
        setPageAspect(viewport.width / viewport.height);
      }
    } catch (e) {
      console.warn('[PdfViewer] aspect calc failed', e);
    }
  }, []);

  const onDocumentLoadError = useCallback((err) => {
    console.error('[PdfViewer] load error:', err);
    setLoadError(err?.message || 'PDF를 불러올 수 없습니다');
  }, []);

  // ── 라이브 동기화 ──
  //   1) presenterPage(외부 발표자 신호) 들어오면 내 pageNumber 강제 적용
  //      이 변경은 "외부에서 온 것"이므로 다시 broadcast 하지 않도록 ref 표식
  //   2) 내가 직접 클릭/네비로 pageNumber 바꾸면 broadcast (외부 표식 없을 때만)
  //   3) 초기 마운트(pageNumber=1) 자동 broadcast 억제
  const skipBroadcastRef = useRef(false);
  const initialBroadcastSkippedRef = useRef(false);

  // 1) 외부 → 내부
  useEffect(() => {
    if (presenterPage == null) return;
    if (numPages != null && (presenterPage < 1 || presenterPage > numPages)) return;
    setPageNumber((cur) => {
      if (cur === presenterPage) return cur;
      skipBroadcastRef.current = true; // 다음 pageNumber effect 의 broadcast 1회 스킵
      return presenterPage;
    });
  }, [presenterPage, numPages]);

  // 2) 내부 → 외부 (broadcast)
  useEffect(() => {
    if (typeof onPageChange !== 'function') return;
    if (!initialBroadcastSkippedRef.current) {
      initialBroadcastSkippedRef.current = true;
      return;
    }
    if (skipBroadcastRef.current) {
      skipBroadcastRef.current = false; // 외부에서 온 변경이므로 broadcast 안 함
      return;
    }
    onPageChange(pageNumber);
  }, [pageNumber, onPageChange]);

  // ── 모바일 핀치줌 (두 손가락) ──
  // touchstart 시 두 손가락 간 거리 기록 → touchmove 에서 비율로 zoom 조정
  //   zoom 클로저 stale 방지: ref로 최신 zoom 유지
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    let pinchStartDist = null;
    let pinchStartZoom = 1;
    const dist = (t) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches);
        pinchStartZoom = zoomRef.current;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || pinchStartDist == null) return;
      e.preventDefault();
      const scale = dist(e.touches) / pinchStartDist;
      const next = Math.max(0.5, Math.min(3, +(pinchStartZoom * scale).toFixed(2)));
      setZoom(next);
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinchStartDist = null;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // ── Ctrl/Cmd + 마우스 휠 → 줌 인/아웃 ──
  // React onWheel은 일부 환경에서 passive로 처리되어 preventDefault 무시될 수 있음
  // → DOM 직접 listener (passive:false) 로 안전하게 막고 zoom 조정
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      // deltaY: 음수=위로 굴림(확대), 양수=아래로 굴림(축소)
      const step = 0.1;
      setZoom((z) => {
        const next = e.deltaY < 0 ? z + step : z - step;
        const clamped = Math.max(0.5, Math.min(3, +next.toFixed(2)));
        return clamped;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ResizeObserver로 컨테이너 크기 변화 감지 → fit width 계산
  // 최적화: rAF 디바운스 + 10px 단위 스냅으로 PDF canvas 재렌더 최소화
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    let rafId = null;
    const computeFit = () => {
      if (rafId) return; // 이미 예약됨
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const cw = el.clientWidth - 16;
        const ch = el.clientHeight - 16;
        if (cw <= 0 || ch <= 0) return;
        const byHeight = ch * pageAspect;
        const byWidth = cw;
        const fit = Math.max(80, Math.min(byWidth, byHeight));
        // 20px 단위 스냅 — 스크롤바 폭(~15px) 변화는 흡수, 의미 있는 폭 변화만 반영
        const snapped = Math.round(fit / 20) * 20;
        setFitWidth((prev) => (prev === snapped ? prev : snapped));
      });
    };
    computeFit();
    const ro = new ResizeObserver(computeFit);
    ro.observe(el);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [pageAspect]);

  // ── 드래그로 스크롤(pan) — 확대 시 PDF 이동 ──
  const panRef = useRef(null);
  const isOverflowingRef = useRef(false);
  const onPanStart = useCallback((e) => {
    if (e.button !== 0) return;  // 좌클릭만
    if (e.target.closest('button, input, a, select, textarea')) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const canScroll =
      el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    isOverflowingRef.current = canScroll;
    if (!canScroll) return;  // 스크롤 영역 없으면 pan 의미 없음
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origScrollLeft: el.scrollLeft,
      origScrollTop: el.scrollTop,
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      if (!panRef.current) return;
      el.scrollLeft = panRef.current.origScrollLeft - (ev.clientX - panRef.current.startX);
      el.scrollTop = panRef.current.origScrollTop - (ev.clientY - panRef.current.startY);
    };
    const onUp = () => {
      panRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, []);

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-2 text-txt-muted py-8 px-4 text-center">
        <p className="text-xs">PDF 미리보기 실패</p>
        <p className="text-[10px]">{loadError}</p>
        <a href={url} download target="_blank" rel="noopener noreferrer"
           className="text-xs text-brand-purple hover:underline mt-2">
          파일 다운로드하여 보기
        </a>
      </div>
    );
  }

  // 최종 페이지 width: fit × zoom
  const pageWidth = Math.max(80, fitWidth * zoom);

  // 컨트롤(페이지 네비/줌) — controlsContainer 가 있으면 포털, 없으면 인라인
  // 모바일에서는 패딩/아이콘 사이즈/min-width 압축으로 한 줄에 들어가게
  const controlsJsx = (
    <>
      <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
        <button
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={!numPages || pageNumber <= 1}
          className="p-0.5 md:p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="이전 페이지"
        >
          <ChevronLeft size={16} className="md:hidden" />
          <ChevronLeft size={18} className="hidden md:block" />
        </button>
        <span className="text-[10px] md:text-[11px] text-txt-primary tabular-nums min-w-[40px] md:min-w-[56px] text-center">
          {numPages ? `${pageNumber} / ${numPages}` : '—'}
        </span>
        <button
          onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}
          disabled={!numPages || pageNumber >= numPages}
          className="p-0.5 md:p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="다음 페이지"
        >
          <ChevronRight size={16} className="md:hidden" />
          <ChevronRight size={18} className="hidden md:block" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
        <button
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          className="p-0.5 md:p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
          aria-label="축소" title="축소"
        >
          <ZoomOut size={14} className="md:hidden" />
          <ZoomOut size={16} className="hidden md:block" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="text-[10px] md:text-[11px] text-txt-primary tabular-nums min-w-[36px] md:min-w-[44px] text-center hover:text-brand-purple font-medium"
          title="리셋"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
          className="p-0.5 md:p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
          aria-label="확대" title="확대"
        >
          <ZoomIn size={14} className="md:hidden" />
          <ZoomIn size={16} className="hidden md:block" />
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 컨트롤 바: 외부 컨테이너 있으면 포털, 없으면 자체 바 표시 */}
      {controlsContainer
        ? createPortal(controlsJsx, controlsContainer)
        : (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle bg-bg-primary shrink-0">
            {controlsJsx}
          </div>
        )}

      {/* PDF 렌더링 영역 — ResizeObserver로 컨테이너 크기 따라감, 오버플로우 시 드래그 스크롤 */}
      <div
        ref={scrollContainerRef}
        onMouseDown={onPanStart}
        onDoubleClick={(e) => {
          // 드로잉 활성 시 무시 — 드로잉 캔버스가 위에 있어 의도치 않은 줌 리셋 방지
          if (drawingActive) return;
          // 버튼/링크/입력은 무시
          if (e.target.closest('button, input, a, select, textarea')) return;
          // 드로잉 캔버스(별도 표시)만 거르고, PDF 본문 캔버스(react-pdf)는 허용
          const t = e.target;
          if (t.tagName === 'CANVAS' && !t.classList.contains('react-pdf__Page__canvas')) return;
          setZoom(1);
        }}
        className={`flex-1 min-h-0 overflow-auto bg-bg-tertiary/30 flex p-2 ${
          zoom !== 1 ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{
          justifyContent: 'safe center',
          alignItems: 'safe start',
          overflowAnchor: 'none',
          // 스크롤바 등장/사라짐으로 clientWidth가 펄싱되어 fitWidth/pageWidth 가
          // 진동하는 루프 차단. modern 브라우저에서 스크롤바 공간 항상 예약.
          scrollbarGutter: 'stable',
        }}
        title={zoom !== 1 ? '더블클릭으로 100%, 드래그로 이동' : '더블클릭으로 100%'}
      >
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center gap-2 text-txt-muted py-8">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-xs">PDF 불러오는 중...</span>
            </div>
          }
          className="shrink-0"
        >
          {/* 페이지 + 드로잉 오버레이 컨테이너 — relative로 묶어 오버레이가 페이지와 함께 이동/스케일 */}
          <div
            ref={pageWrapRef}
            className="relative shrink-0 inline-block"
            onMouseMove={(e) => {
              if (typeof vbroadcast !== 'function') return;
              const now = Date.now();
              if (cursorThrottleRef.current && now - cursorThrottleRef.current < 50) return;
              cursorThrottleRef.current = now;
              // 좌표 정규화 기준 = 실제 PDF 페이지 박스
              //   (스크롤 컨테이너 기준이면 fitWidth/auto 여백 차이로 사용자 간 위치가 어긋남)
              const el = pageWrapRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return;
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              if (x < 0 || x > 1 || y < 0 || y > 1) return;
              vbroadcast('viewer:cursor', { fileId, page: pageNumber, x, y });
            }}
          >
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="shadow-lg"
            />
            {/* 드로잉 오버레이 — drawingActive(연필 ON) 또는 following(라이브 ON) 시 마운트
                  - drawingActive=true  : 편집 모드 (툴바 + 그리기)
                  - drawingActive=false + following=true : 읽기 전용 (다른 참가자 스트로크만 표시) */}
            {(drawingActive || following) && fileId && (
              <DrawingOverlay
                // 페이지 변경 시 강제 재마운트 — 이전 페이지 stroke state 누수 방지
                key={`${fileId}-p${pageNumber}`}
                // 페이지별 target_key — 각 페이지는 독립된 드로잉 레이어
                targetKey={`doc:${fileId}:p${pageNumber}`}
                fileName={fileName ? `${fileName} p.${pageNumber}` : null}
                meetingId={meetingId}
                // pageBox 초기엔 0 — pageWidth(렌더된 PDF 폭)을 fallback 으로 사용
                //   → DrawingOverlay 가 즉시 마운트되어 toolbar 포털이 곧바로 동작
                width={pageBox.w || pageWidth}
                height={pageBox.h || Math.round(pageWidth / pageAspect)}
                messages={messages}
                onClose={onCloseDrawing}
                toolbarContainer={toolbarContainer}
                readOnly={!drawingActive}
              />
            )}
            {/* 라이브 커서 — pageWrapRef 위에 직접 마운트, 페이지 일치 시만 표시 */}
            {fileId && (
              <RemoteCursorsLayer
                cursors={remoteCursors}
                fileId={fileId}
                page={pageNumber}
              />
            )}
          </div>
        </Document>
      </div>
    </div>
  );
}
