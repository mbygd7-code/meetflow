import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

// PDF.js worker 설정 — Vite + unpkg CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PDF 뷰어 — react-pdf 기반
 * - 페이지 네비게이션
 * - 확대/축소 (50% ~ 300%)
 * - 카드 크기(width/height) 변화에 맞춰 자연스럽게 fit 조정 (ResizeObserver)
 */
export default function PdfViewer({ url }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1); // 0.5 ~ 3.0
  const [loadError, setLoadError] = useState(null);
  const [pageAspect, setPageAspect] = useState(0.707); // A4 기본 (w/h)
  const [fitWidth, setFitWidth] = useState(400);       // 컨테이너 기준 자동 계산
  const scrollContainerRef = useRef(null);

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
        // 10px 단위 스냅 — 같은 값이면 리렌더 스킵 (React 얕은 비교)
        const snapped = Math.round(fit / 10) * 10;
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 컨트롤 바: 페이지 네비 + 줌 */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border-subtle bg-bg-primary shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={!numPages || pageNumber <= 1}
            className="p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="이전 페이지"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[11px] text-txt-primary tabular-nums min-w-[56px] text-center">
            {numPages ? `${pageNumber} / ${numPages}` : '—'}
          </span>
          <button
            onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}
            disabled={!numPages || pageNumber >= numPages}
            className="p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="다음 페이지"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
            aria-label="축소" title="축소"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="text-[11px] text-txt-primary tabular-nums min-w-[44px] text-center hover:text-brand-purple font-medium"
            title="리셋"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            className="p-1 rounded text-txt-secondary hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
            aria-label="확대" title="확대"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* PDF 렌더링 영역 — ResizeObserver로 컨테이너 크기 따라감, 오버플로우 시 드래그 스크롤 */}
      <div
        ref={scrollContainerRef}
        onMouseDown={onPanStart}
        className={`flex-1 min-h-0 overflow-auto bg-bg-tertiary/30 flex p-2 ${
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{
          justifyContent: 'safe center',
          alignItems: 'safe start',
          overflowAnchor: 'none',
        }}
        title={zoom > 1 ? '드래그로 이동' : ''}
      >
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center gap-2 text-txt-muted py-8">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs">PDF 불러오는 중...</span>
            </div>
          }
          className="shrink-0"
        >
          <Page
            pageNumber={pageNumber}
            width={pageWidth}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  );
}
