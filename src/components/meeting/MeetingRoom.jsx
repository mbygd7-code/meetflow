import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Square, Sparkles, Zap, ZapOff, FileText, FolderOpen, ChevronLeft, ChevronRight, AlertTriangle, Minus, Maximize2, GripVertical, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { clearSessionState } from '@/lib/harness';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useMeetingFiles } from '@/hooks/useMeetingFiles';
import { useMilo } from '@/hooks/useMilo';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useToastStore } from '@/stores/toastStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import ChatArea from './ChatArea';
import AgendaBar from './AgendaBar';
import PollPanel from './PollPanel';
import PdfViewer from './PdfViewer';
import { Document as PdfDocument, Page as PdfPage } from 'react-pdf';

// ── 파일 썸네일 카드 (갤러리 스타일 — 이미지 유동 / 문서 고정) ──
function FileThumbCard({ file, getUrl, onClick, isImage, compact = false }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const isPdf = file.type === 'application/pdf';
  const thumbContainerRef = useRef(null);
  const [thumbW, setThumbW] = useState(140);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (file.preview) {
        if (!cancelled) setThumbUrl(file.preview);
        return;
      }
      // 이미지와 PDF 모두 signed URL 필요 (PDF는 첫 페이지 썸네일용)
      if ((isImage || isPdf) && file.storage_path && getUrl) {
        const url = await getUrl(file.storage_path);
        if (!cancelled) setThumbUrl(url);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [file, isImage, isPdf, getUrl]);

  // PDF 썸네일 — 컨테이너 폭에 맞춰 Page width 조정
  useEffect(() => {
    if (!isPdf || !thumbContainerRef.current) return;
    const el = thumbContainerRef.current;
    const update = () => setThumbW(Math.max(60, el.clientWidth - 4));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPdf]);

  const sizeLabel = file.size
    ? file.size >= 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)}MB`
      : `${(file.size / 1024).toFixed(0)}KB`
    : '';

  // 이미지: 섹션 폭에 맞춰 adaptive 크기 (갤러리)
  if (isImage) {
    return (
      <button
        onClick={onClick}
        className="w-full rounded-lg overflow-hidden transition-all group text-left border bg-bg-tertiary/50 border-border-subtle hover:border-brand-purple/40 hover:shadow-md"
        title={file.name}
      >
        <div className="w-full aspect-video bg-bg-tertiary flex items-center justify-center overflow-hidden">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={file.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="text-txt-muted text-[10px]">로딩…</div>
          )}
        </div>
        {!compact && (
          <div className="px-2 py-1.5">
            <p className="text-[11px] font-medium truncate text-txt-primary group-hover:text-brand-purple">
              {file.name}
            </p>
            {sizeLabel && <p className="text-[9px] text-txt-muted">{sizeLabel}</p>}
          </div>
        )}
      </button>
    );
  }

  // PDF: 첫 페이지를 썸네일로 렌더 (이미지와 유사한 adaptive 레이아웃, aspect A4)
  if (isPdf) {
    return (
      <button
        onClick={onClick}
        className="w-full rounded-lg overflow-hidden transition-all group text-left border bg-bg-tertiary/50 border-border-subtle hover:border-brand-purple/40 hover:shadow-md"
        title={file.name}
      >
        <div
          ref={thumbContainerRef}
          className="w-full aspect-[1/1.414] bg-white flex items-center justify-center overflow-hidden"
        >
          {thumbUrl ? (
            <PdfDocument
              file={thumbUrl}
              loading={<div className="text-txt-muted text-[10px]">로딩…</div>}
              error={<FileText size={compact ? 20 : 32} className="text-txt-muted" strokeWidth={1.4} />}
              noData={<FileText size={compact ? 20 : 32} className="text-txt-muted" strokeWidth={1.4} />}
            >
              <PdfPage
                pageNumber={1}
                width={thumbW}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                className="group-hover:scale-[1.02] transition-transform duration-300"
              />
            </PdfDocument>
          ) : (
            <div className="text-txt-muted text-[10px]">로딩…</div>
          )}
        </div>
        {!compact && (
          <div className="px-2 py-1.5">
            <p className="text-[11px] font-medium truncate text-txt-primary group-hover:text-brand-purple">
              {file.name}
            </p>
            {sizeLabel && <p className="text-[9px] text-txt-muted">{sizeLabel}</p>}
          </div>
        )}
      </button>
    );
  }

  // 일반 문서: compact 모드에서는 작게, 아니면 140px 중앙 정렬 (섹션 폭에 영향 안 받음)
  const docWidth = compact ? '100%' : 140;
  return (
    <button
      onClick={onClick}
      className="mx-auto rounded-lg overflow-hidden transition-all group text-center border bg-bg-tertiary/50 border-border-subtle hover:border-brand-purple/40 hover:shadow-md"
      style={{ width: docWidth }}
      title={file.name}
    >
      <div className={`w-full ${compact ? 'h-[60px]' : 'h-[100px]'} bg-bg-tertiary flex flex-col items-center justify-center gap-1 text-txt-muted`}>
        <FileText size={compact ? 20 : 32} strokeWidth={1.4} />
        {!compact && (
          <span className="text-[9px] uppercase tracking-wider">
            {(file.name?.split('.').pop() || 'FILE').slice(0, 6)}
          </span>
        )}
      </div>
      {!compact && (
        <div className="px-2 py-1.5">
          <p className="text-[11px] font-medium truncate text-txt-primary group-hover:text-brand-purple">
            {file.name}
          </p>
          {sizeLabel && <p className="text-[9px] text-txt-muted">{sizeLabel}</p>}
        </div>
      )}
    </button>
  );
}

// ── 이미지 패널 내부 확대 오버레이 (다른 자료 덮음) ──
function ImageZoomOverlay({ file, url, onClose, onImageLoad }) {
  const [zoomScale, setZoomScale] = useState(100);   // 50~300 (%)
  const [sliderOpen, setSliderOpen] = useState(false);
  const scrollRef = useRef(null);
  const panRef = useRef(null);
  const sliderContainerRef = useRef(null);
  const isZoomed = zoomScale > 100;

  // 슬라이더 외부 클릭 → 닫기 (이미지/채팅창/입력창 어디든 밖을 클릭하면 닫힘)
  useEffect(() => {
    if (!sliderOpen) return;
    const handleOutside = (e) => {
      if (sliderContainerRef.current && !sliderContainerRef.current.contains(e.target)) {
        setSliderOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [sliderOpen]);

  // 드래그 이동 (pan) — 확대 상태에서만 활성화
  const onPanStart = (e) => {
    if (!isZoomed) return;
    const el = scrollRef.current;
    if (!el) return;
    // 슬라이더/버튼 영역 클릭은 무시
    if (e.target.closest('button, input, a')) return;

    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origScrollLeft: el.scrollLeft,
      origScrollTop: el.scrollTop,
    };
    const onMove = (ev) => {
      if (!panRef.current || !el) return;
      el.scrollLeft = panRef.current.origScrollLeft - (ev.clientX - panRef.current.startX);
      el.scrollTop = panRef.current.origScrollTop - (ev.clientY - panRef.current.startY);
    };
    const onUp = () => {
      panRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };
  return (
    <div className="absolute inset-0 z-20 bg-bg-primary flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-divider shrink-0">
        <p className="text-xs font-medium text-txt-primary truncate flex-1">{file.name}</p>
        <div className="flex items-center gap-1 shrink-0">
          {url && (
            <a href={url} download={file.name} target="_blank" rel="noopener noreferrer"
               className="text-[11px] text-brand-purple hover:underline px-1.5">
              다운로드
            </a>
          )}
          <button onClick={onClose} className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded" aria-label="닫기">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 relative bg-bg-tertiary/30 overflow-hidden">
        {/* 이미지 스크롤 컨테이너 — 확대 시 드래그/스크롤로 전체 접근 가능
            safe center: 내용 오버플로우 시 start로 fallback하여 왼쪽/위 영역도 스크롤 도달 */}
        <div
          ref={scrollRef}
          onMouseDown={onPanStart}
          className={`absolute inset-0 overflow-auto flex p-3 ${
            isZoomed ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{
            justifyContent: 'safe center',
            alignItems: 'safe center',
          }}
        >
          {url ? (
            <img
              src={url}
              alt={file.name}
              onLoad={(e) => onImageLoad?.(e.target.naturalWidth, e.target.naturalHeight)}
              draggable={false}
              style={
                zoomScale === 100
                  ? undefined
                  : {
                      width: `${zoomScale}%`,
                      height: 'auto',
                      maxWidth: 'none',
                      maxHeight: 'none',
                      flexShrink: 0, // 컨테이너보다 큰 이미지가 축소되지 않도록
                    }
              }
              className={`select-none pointer-events-none ${
                zoomScale === 100
                  ? 'max-w-full max-h-full object-contain rounded-md shadow-md'
                  : 'rounded-md shadow-md'
              }`}
            />
          ) : (
            <p className="text-xs text-txt-muted">로딩 중...</p>
          )}
        </div>

        {/* 오른쪽 세로 중앙 — 돋보기 버튼 + 세로 슬라이더 (밝고 진한 그림자로 어두운 배경에서도 잘 보임) */}
        <div
          ref={sliderContainerRef}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2"
        >
          {sliderOpen && (
            <div className="flex flex-col items-center gap-2 px-2 py-3 rounded-lg bg-white/95 backdrop-blur-sm border border-[#d0d0d0] shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
              <button
                onClick={() => setZoomScale((s) => Math.min(300, s + 20))}
                className="p-1 rounded-md text-[#555] hover:text-brand-purple hover:bg-black/5 transition-colors"
                aria-label="확대"
              >
                <ZoomIn size={14} />
              </button>
              <span className="text-[10px] font-semibold text-[#222] min-w-[30px] text-center tabular-nums">
                {zoomScale}%
              </span>
              <input
                type="range"
                min={50}
                max={300}
                step={5}
                value={zoomScale}
                onChange={(e) => setZoomScale(parseInt(e.target.value, 10))}
                orient="vertical"
                aria-label="이미지 크기 조절"
                style={{
                  writingMode: 'bt-lr',
                  WebkitAppearance: 'slider-vertical',
                  width: '6px',
                  height: '120px',
                }}
                className="cursor-pointer accent-brand-purple"
              />
              <button
                onClick={() => setZoomScale((s) => Math.max(50, s - 20))}
                className="p-1 rounded-md text-[#555] hover:text-brand-purple hover:bg-black/5 transition-colors"
                aria-label="축소"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => setZoomScale(100)}
                className="text-[10px] text-brand-purple hover:underline font-medium"
                title="원래 크기"
              >
                리셋
              </button>
            </div>
          )}
          <button
            onClick={() => setSliderOpen((v) => !v)}
            className={`p-2.5 rounded-full transition-all ring-2 ${
              sliderOpen
                ? 'bg-brand-purple text-white ring-white/60 shadow-[0_4px_16px_rgba(114,60,235,0.5)] scale-110'
                : 'bg-white text-[#333] ring-black/15 shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:scale-110 hover:ring-black/25'
            }`}
            aria-label="이미지 크기 조절"
            title="이미지 크기 조절"
          >
            <Search size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 문서 플로팅 윈도우 (드래그/리사이즈 가능, 배경 오버레이 없음) ──
function FloatingDocumentWindow({ file, url, onClose }) {
  const [pos, setPos] = useState({ x: 120, y: 80 });
  const [size, setSize] = useState({ w: 720, h: 540 });
  const [minimized, setMinimized] = useState(false);
  const [prevState, setPrevState] = useState(null); // 최소화 전 pos/size 기억
  const windowRef = useRef(null);
  const dragRef = useRef(null);   // { startX, startY, origX, origY }
  const resizeRef = useRef(null); // { startX, startY, origW, origH }

  // 화면 중앙으로 초기 위치
  useEffect(() => {
    const w = Math.min(720, window.innerWidth - 80);
    const h = Math.min(540, window.innerHeight - 120);
    setSize({ w, h });
    setPos({ x: Math.max(40, (window.innerWidth - w) / 2), y: Math.max(40, (window.innerHeight - h) / 3) });
  }, []);

  // 외부 클릭(창 밖 = 채팅창/배경 등) 시 최소화
  useEffect(() => {
    if (minimized) return;
    const handleOutside = (e) => {
      // 드래그/리사이즈 중에는 외부 클릭으로 간주하지 않음
      if (dragRef.current || resizeRef.current) return;
      if (windowRef.current && !windowRef.current.contains(e.target)) {
        // 현재 pos/size 저장 후 카드를 그대로 작은 크기로 축소
        setPrevState({ pos, size });
        setSize({ w: 300, h: 240 });
        setPos({ x: 60, y: 80 });
        setMinimized(true);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [minimized, pos, size]);

  // 최소화 복원 — 카드 클릭 시 원래 크기로
  const handleRestore = () => {
    if (!minimized) return;
    if (prevState) {
      setPos(prevState.pos);
      setSize(prevState.size);
      setPrevState(null);
    }
    setMinimized(false);
  };

  // 드래그 이동 — DOM 직접 조작 + rAF 디바운스로 React 리렌더 방지
  const onDragStart = (e) => {
    e.preventDefault();
    const el = windowRef.current;
    if (!el) return;
    const startX = e.clientX, startY = e.clientY;
    const origX = pos.x, origY = pos.y;
    dragRef.current = { startX, startY, origX, origY };

    const prevTransition = el.style.transition;
    el.style.transition = 'none';

    let lastX = origX, lastY = origY;
    let rafId = null;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      lastX = Math.max(0, Math.min(window.innerWidth - 200, origX + dx));
      lastY = Math.max(0, Math.min(window.innerHeight - 80, origY + dy));
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          el.style.left = `${lastX}px`;
          el.style.top = `${lastY}px`;
          rafId = null;
        });
      }
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      dragRef.current = null;
      el.style.transition = prevTransition;
      setPos({ x: lastX, y: lastY });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 리사이즈 — DOM 직접 조작 + rAF 디바운스, PDF 재렌더 최소화
  // 'se': 우하단 코너(가로+세로), 'e': 우측 엣지(가로만), 's': 하단 엣지(세로만)
  const onResizeStart = (e, direction = 'se') => {
    e.preventDefault();
    e.stopPropagation();
    const el = windowRef.current;
    if (!el) return;
    const startX = e.clientX, startY = e.clientY;
    const origW = size.w, origH = size.h;
    resizeRef.current = { startX, startY, origW, origH, direction };

    const prevTransition = el.style.transition;
    el.style.transition = 'none';

    let lastW = origW, lastH = origH;
    let rafId = null;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      lastW = direction === 's' ? origW : Math.max(300, origW + dx);
      lastH = direction === 'e' ? origH : Math.max(200, origH + dy);
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          el.style.width = `${lastW}px`;
          el.style.height = `${lastH}px`;
          rafId = null;
        });
      }
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeRef.current = null;
      el.style.transition = prevTransition;
      // 드래그 종료 시 한 번만 state commit → PdfViewer도 1회 재렌더
      setSize({ w: lastW, h: lastH });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const isPdf = file.type === 'application/pdf';
  const isImage = file.type?.startsWith('image/');

  return createPortal(
    <div
      ref={windowRef}
      onClick={minimized ? handleRestore : undefined}
      className={`fixed z-[9999] bg-bg-secondary rounded-xl shadow-2xl border border-border-subtle overflow-hidden flex flex-col pointer-events-auto ${
        minimized ? 'cursor-zoom-in hover:ring-2 hover:ring-brand-purple/50 transition-[box-shadow] duration-150' : ''
      }`}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {/* 헤더 — 드래그 핸들 (최소화 상태에서도 드래그 가능, 클릭 시 복원은 body에서만) */}
      <div
        onMouseDown={onDragStart}
        onClick={(e) => e.stopPropagation()}  // 헤더 클릭 → 카드 onClick(복원) 차단
        className="flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-bg-primary select-none shrink-0 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical size={14} className="text-txt-muted shrink-0" />
          <p className="text-xs font-medium text-txt-primary truncate">{file.name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {url && !minimized && (
            <a href={url} download={file.name} target="_blank" rel="noopener noreferrer"
               className="text-[11px] text-brand-purple hover:underline px-1.5">
              다운로드
            </a>
          )}
          {!minimized && (
            <button
              onClick={(e) => { e.stopPropagation(); setPrevState({ pos, size }); setSize({ w: 300, h: 240 }); setPos({ x: 60, y: 80 }); setMinimized(true); }}
              className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
              aria-label="최소화" title="최소화"
            >
              <Minus size={14} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
            aria-label="닫기">
            <X size={14} />
          </button>
        </div>
      </div>
      {/* 바디 — PDF는 react-pdf로 렌더, 이미지/기타는 기존 방식. min-h-0으로 flex overflow 허용 */}
      <div className={`flex-1 min-h-0 ${isPdf ? '' : 'overflow-auto bg-bg-primary/50 flex items-center justify-center p-2'}`}>
        {isPdf && url ? (
          <PdfViewer url={url} />
        ) : isImage && url ? (
          <img src={url} alt={file.name} className="max-w-full max-h-full object-contain" />
        ) : url ? (
          <div className="flex flex-col items-center gap-3 text-txt-muted py-8">
            <FileText size={48} strokeWidth={1.3} />
            <p className="text-xs font-medium text-txt-primary break-all text-center">{file.name}</p>
            <a href={url} download={file.name} target="_blank" rel="noopener noreferrer"
               className="text-xs text-brand-purple hover:underline">
              파일 다운로드
            </a>
          </div>
        ) : (
          <p className="text-xs text-txt-muted">로딩 중...</p>
        )}
      </div>
      {/* 리사이즈 핸들 — 우측 엣지(가로) / 하단 엣지(세로) / 우하단 코너(대각선)
          minimized 상태에선 렌더 생략 */}
      {!minimized && (
        <>
          {/* 우측 엣지 — 가로만 조절 */}
          <div
            onMouseDown={(e) => onResizeStart(e, 'e')}
            className="absolute top-0 right-0 bottom-4 w-1.5 cursor-ew-resize hover:bg-brand-purple/30 transition-colors"
            title="가로 크기 조절"
          />
          {/* 하단 엣지 — 세로만 조절 */}
          <div
            onMouseDown={(e) => onResizeStart(e, 's')}
            className="absolute left-0 bottom-0 right-4 h-1.5 cursor-ns-resize hover:bg-brand-purple/30 transition-colors"
            title="세로 크기 조절"
          />
          {/* 우하단 코너 — 가로+세로 동시 조절 */}
          <div
            onMouseDown={(e) => onResizeStart(e, 'se')}
            className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end pr-0.5 pb-0.5 z-10"
            title="크기 조절"
          >
            <div className="w-2 h-2 border-r-2 border-b-2 border-txt-muted/60" />
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

// ── 자료 패널 (갤러리 + 리사이저) ──
// 2단 구조: [자료 섹션(가변 폭, 리사이저로 조절)] + [채팅 flex-1]
// - 이미지 썸네일: 패널 폭에 따라 auto-fit 그리드 (갤러리)
// - 문서 썸네일: 고정 140px 중앙 정렬
// - 이미지 클릭: 패널 내부 오버레이로 확대 (다른 자료 덮음)
// - 문서 클릭: 드래그/리사이즈 가능한 플로팅 윈도우 (body portal, 오버레이 없음)
function DocumentPanel({ files = [], getUrl }) {
  // 패널 폭 — localStorage에 저장하여 세션 간 유지 (기본 420px: 갤러리 2열 기본 보기)
  const [width, setWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('meetflow_doc_panel_width') || '420', 10);
      return Number.isFinite(v) ? Math.max(80, v) : 420;
    } catch { return 420; }
  });
  const [zoomFile, setZoomFile] = useState(null);     // 패널 내 확대할 이미지 파일
  const [zoomUrl, setZoomUrl] = useState(null);
  const [docFile, setDocFile] = useState(null);       // 플로팅 윈도우에 띄울 문서
  const [docUrl, setDocUrl] = useState(null);
  const [widthBeforeZoom, setWidthBeforeZoom] = useState(null); // 확대 전 원래 폭 기억
  const resizerRef = useRef(null);

  // 폭 변경 시 localStorage 저장 — 단, 이미지 확대 중에는 저장하지 않음 (원래 폭 유지)
  useEffect(() => {
    if (zoomFile) return;
    try { localStorage.setItem('meetflow_doc_panel_width', String(width)); } catch {}
  }, [width, zoomFile]);

  // 이미지/문서 구분
  const isImageFile = (f) => !!f?.type?.startsWith('image/');

  // 이미지 확대 시 패널을 최대 폭까지 확장할 목표값 (이미지 실제 크기 기반 가능)
  const getMaxPanelWidth = () => Math.min(window.innerWidth - 340, 1400);

  // 파일 클릭 핸들러
  const handleFileClick = async (file) => {
    const url = file.storage_path && getUrl
      ? await getUrl(file.storage_path)
      : (file.preview || file.url || null);

    if (isImageFile(file)) {
      // 원래 폭 기억 (onClose에서 복구용). 패널 폭은 이미지 로드 후 실제 크기에 맞춰 조정.
      if (widthBeforeZoom === null) setWidthBeforeZoom(width);
      setZoomFile(file);
      setZoomUrl(url);
    } else {
      setDocFile(file);
      setDocUrl(url);
    }
  };

  // 이미지 확대 닫기 → 원래 폭으로 복귀
  const closeZoom = () => {
    setZoomFile(null);
    setZoomUrl(null);
    if (widthBeforeZoom !== null) {
      setWidth(widthBeforeZoom);
      setWidthBeforeZoom(null);
    }
  };

  // 이미지 로드 후: 실제 이미지 너비에 맞춰 패널 폭을 정확히 조정
  // 이미지가 원래 폭보다 작으면 줄이고, 크면 확장 (최대 제한 내에서)
  // 여백 없이 이미지가 꽉 차 보이도록 함
  const handleImageLoaded = (naturalWidth) => {
    if (!naturalWidth) return;
    const MIN = 240;               // 너무 작은 이미지도 읽기 편한 최소 폭
    const max = getMaxPanelWidth();
    const target = Math.min(Math.max(naturalWidth + 48, MIN), max);
    setWidth(target);
  };

  // 파일 리스트에서 현재 열린 파일이 사라지면 닫기
  useEffect(() => {
    if (zoomFile && !files.some((f) => f.id === zoomFile.id)) {
      closeZoom();
    }
    if (docFile && !files.some((f) => f.id === docFile.id)) {
      setDocFile(null); setDocUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, zoomFile, docFile]);

  // 리사이저 드래그 — 최소 80px (컴팩트), 최대 화면폭-340px (채팅창 최소 340px 보장)
  const onResizerDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const next = Math.max(80, Math.min(window.innerWidth - 340, startW + dx));
      setWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 파일이 없을 때는 최소 폭(80px)으로 자동 축소 → 채팅 공간 확보
  // 사용자의 저장된 폭은 그대로 유지 (파일 업로드 시 복원됨)
  const MIN_WIDTH = 80;
  const isEmpty = files.length === 0;
  const effectiveWidth = isEmpty ? MIN_WIDTH : width;

  // 항상 1열 유지 — 패널 폭이 커질수록 썸네일도 같이 커짐 (세로 리스트)
  const isCompact = effectiveWidth < 180; // 매우 좁을 때: 헤더/파일명 숨김

  // 문서/플로팅 윈도우용 파일 URL 로딩
  return (
    <>
      <aside
        className="hidden md:flex flex-col shrink-0 border-r border-border-subtle bg-bg-primary relative transition-[width] duration-200 ease-out"
        style={{ width: effectiveWidth }}
      >
        {/* 헤더 — 컴팩트 모드에서는 심플하게 */}
        <div className={`border-b border-border-divider shrink-0 ${isCompact ? 'flex flex-col items-center py-3 gap-1' : 'flex items-center gap-2 px-3 py-3'}`}>
          <FolderOpen size={isCompact ? 14 : 14} className="text-brand-purple shrink-0" />
          {!isCompact && (
            <>
              <span className="text-sm font-semibold text-txt-primary">자료</span>
              <span className="text-[10px] text-txt-muted">{files.length}개</span>
            </>
          )}
          {isCompact && files.length > 0 && (
            <span className="text-[9px] font-bold text-brand-purple bg-brand-purple/10 rounded-full w-5 h-5 flex items-center justify-center">
              {files.length}
            </span>
          )}
        </div>

        {/* 파일 갤러리 — auto-fit 그리드 */}
        <div className={`flex-1 overflow-y-auto ${isCompact ? 'p-1.5' : 'p-3'}`}>
          {files.length === 0 ? (
            <div className="text-center py-8 text-txt-muted">
              <FolderOpen size={20} className="mx-auto mb-2 opacity-40" />
              {!isCompact && (
                <>
                  <p className="text-[11px]">첨부된 자료가 없습니다</p>
                  <p className="text-[10px] mt-1">채팅 입력창의 + 버튼으로 업로드하세요</p>
                </>
              )}
            </div>
          ) : (
            <div className={`flex flex-col ${isCompact ? 'gap-1.5' : 'gap-2.5'}`}>
              {files.map((f) => (
                <FileThumbCard
                  key={f.id || f.name}
                  file={f}
                  getUrl={getUrl}
                  onClick={() => handleFileClick(f)}
                  isImage={isImageFile(f)}
                  compact={isCompact}
                />
              ))}
            </div>
          )}
        </div>

        {/* 이미지 확대 오버레이 — 패널 내부를 덮음. 패널은 자동으로 최대 폭까지 확장 */}
        {zoomFile && (
          <ImageZoomOverlay
            file={zoomFile}
            url={zoomUrl}
            onClose={closeZoom}
            onImageLoad={handleImageLoaded}
          />
        )}

        {/* 리사이저 — 우측 세로 라인 드래그 (자료 있을 때만 활성화) */}
        {!isEmpty && (
          <div
            ref={resizerRef}
            onMouseDown={onResizerDown}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group/resize"
            title="드래그하여 크기 조절"
          >
            <div className="absolute top-0 right-0 w-px h-full bg-border-subtle group-hover/resize:bg-brand-purple/40 transition-colors" />
          </div>
        )}
      </aside>

      {/* 문서 플로팅 윈도우 — 배경 오버레이 없음, 드래그/리사이즈 가능 */}
      {docFile && (
        <FloatingDocumentWindow
          file={docFile}
          url={docUrl}
          onClose={() => { setDocFile(null); setDocUrl(null); }}
        />
      )}
    </>
  );
}

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getById, endMeeting } = useMeeting();
  const setActiveMeetingId = useMeetingStore((s) => s.setActiveMeetingId);
  const setSummaryGeneratingId = useMeetingStore((s) => s.setSummaryGeneratingId);
  const addToast = useToastStore((s) => s.addToast);
  const meeting = getById(id);
  const [activeAgendaId, setActiveAgendaId] = useState(null);
  const [aiThinking, setAiThinking] = useState(null);
  const [polls, setPolls] = useState([]);
  const [ending, setEnding] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [leavingConfirmed, setLeavingConfirmed] = useState(false);
  // 자동개입 상태: localStorage에 영속 저장 (페이지 새로고침 유지)
  const [aiAutoIntervene, setAiAutoIntervene] = useState(() => {
    try {
      const saved = localStorage.getItem('meetflow_auto_intervene');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try { localStorage.setItem('meetflow_auto_intervene', String(aiAutoIntervene)); } catch {}
  }, [aiAutoIntervene]);
  // docPanelExpanded 제거 — DocumentPanel은 항상 표시되며 리사이저로 폭 조절
  // 회의 자료 — DB + Storage 기반 (useMeetingFiles 훅)
  const { files: meetingFiles, uploadFile: uploadMeetingFile, getDownloadUrl: getMeetingFileUrl } = useMeetingFiles(id);
  const { messages, sendMessage } = useRealtimeMessages(id);

  // Phase 3: 회의방의 AI 메시지에 대한 내 피드백 + 팀 집계 로드 (렌더에 사용)
  const loadMyFeedbacks = useFeedbackStore((s) => s.loadMyFeedbacks);
  const loadAggregates = useFeedbackStore((s) => s.loadAggregates);
  useEffect(() => {
    const aiMsgIds = messages
      .filter((m) => m.is_ai && m.id && !String(m.id).startsWith('m-local-') && !String(m.id).startsWith('stream-'))
      .map((m) => m.id);
    if (aiMsgIds.length === 0) return;
    loadMyFeedbacks(aiMsgIds);
    loadAggregates(aiMsgIds);
    // 메시지 수가 바뀔 때마다 재조회 (새 AI 응답 도착 시 포함)
  }, [messages.length, loadMyFeedbacks, loadAggregates]);

  // 활성 회의 등록
  useEffect(() => {
    if (meeting?.status === 'active') setActiveMeetingId(id);
    return () => { if (ending) setActiveMeetingId(null); };
  }, [id, meeting?.status, ending, setActiveMeetingId]);

  // 브라우저 탭 닫기 방지
  useEffect(() => {
    if (meeting?.status !== 'active' || ending) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [meeting?.status, ending]);

  const safeNavigate = useCallback((to) => {
    if (meeting?.status === 'active' && !ending && !leavingConfirmed) {
      if (window.confirm('회의가 진행 중입니다. 나가시겠습니까?\n(회의는 유지됩니다)')) {
        setLeavingConfirmed(true);
        navigate(to);
      }
      return;
    }
    navigate(to);
  }, [meeting?.status, ending, leavingConfirmed, navigate]);

  const currentAgenda = useMemo(() => {
    const targetId = activeAgendaId
      ? activeAgendaId
      : meeting?.agendas?.find((a) => a.status === 'active')?.id || meeting?.agendas?.[0]?.id;
    return meeting?.agendas?.find((a) => a.id === targetId);
  }, [activeAgendaId, meeting]);

  const isAiOnlyMeeting = useMemo(() => {
    const aiIds = AI_EMPLOYEES.map((e) => e.id);
    const humanParticipants = (meeting?.participants || []).filter(
      (p) => p.id !== 'milo' && !aiIds.includes(p.id)
    );
    return humanParticipants.length <= 1;
  }, [meeting]);

  // Polls
  const handleCreatePoll = useCallback(({ question, options }) => {
    const newPoll = { id: `poll-${Date.now()}`, question, options, votes: {}, myVote: null, created_at: new Date().toISOString() };
    setPolls((prev) => [newPoll, ...prev]);
    sendMessage(`📊 투표가 생성되었습니다: "${question}"`, { agendaId: currentAgenda?.id, isAi: true, aiType: 'nudge', aiEmployee: 'milo' });
  }, [sendMessage, currentAgenda]);

  const handleVote = useCallback((pollId, optionIndex) => {
    setPolls((prev) => prev.map((p) => {
      if (p.id !== pollId) return p;
      const votes = { ...p.votes };
      votes[optionIndex] = (votes[optionIndex] || 0) + 1;
      return { ...p, votes, myVote: optionIndex };
    }));
  }, []);

  // AI 에러 토스트 (4초 자동 사라짐)
  const [aiError, setAiError] = useState(null);
  const aiErrorTimerRef = useRef(null);
  const handleAiError = useCallback((err) => {
    setAiError(err);
    clearTimeout(aiErrorTimerRef.current);
    aiErrorTimerRef.current = setTimeout(() => setAiError(null), 4000);
  }, []);

  // Milo AI
  // 동일 응답 텍스트가 짧은 시간 내에 중복 전송되는 것을 방어 (최종 방어선)
  // 해시 충돌 완화: employee_id + 전체 내용 + ai_type 조합으로 specialist 응답 false-positive 차단
  const sentResponseHashesRef = useRef(new Map()); // text → timestamp
  const handleMiloRespond = useCallback(async (result) => {
    if (!result?.response_text) return;
    // 기존: slice(0,100) → Specialist 1·2가 비슷한 서두로 시작하면 누락됨
    // 수정: 전체 내용 사용 + 직원 ID + ai_type → 실질적으로 같은 메시지만 차단
    const hash = `${result.ai_employee || 'milo'}::${result.ai_type || '-'}::${result.response_text}`;
    const now = Date.now();
    const prevTime = sentResponseHashesRef.current.get(hash);
    if (prevTime && now - prevTime < 10000) {
      console.warn('[MeetingRoom] Duplicate AI response blocked:', (result.ai_employee || 'milo'), '-', result.response_text.slice(0, 40));
      return;
    }
    sentResponseHashesRef.current.set(hash, now);
    if (sentResponseHashesRef.current.size > 50) {
      const cutoff = now - 60000;
      for (const [k, t] of sentResponseHashesRef.current.entries()) {
        if (t < cutoff) sentResponseHashesRef.current.delete(k);
      }
    }
    try {
      await sendMessage(result.response_text, {
        agendaId: currentAgenda?.id, isAi: true, aiType: result.ai_type,
        aiEmployee: result.ai_employee || 'milo',
        searchSources: result.search_sources || null,
        searchMode: result.search_mode || null,
        orchestrationVersion: result.orchestration_version || 'parallel_v1',
        miloSynthesisId: result.milo_synthesis_id || null,
      });
    } catch (err) {
      // sendMessage 실패(Auth/RLS/네트워크) 시 사용자에게 에러 토스트 표시
      console.error('[handleMiloRespond] sendMessage 실패:', err);
      handleAiError({
        message: `AI 응답 저장 실패: ${err?.message || '네트워크 또는 인증 오류'}`,
        type: 'send_failed',
        employeeId: result.ai_employee || 'milo',
      });
    }
  }, [sendMessage, currentAgenda, handleAiError]);

  const handleThinking = useCallback((active, employeeId) => {
    setAiThinking(active ? { active: true, employeeId } : null);
  }, []);

  useMilo({
    messages, agenda: currentAgenda, onRespond: handleMiloRespond,
    onThinking: handleThinking, onError: handleAiError,
    meetingId: id, alwaysRespond: isAiOnlyMeeting, autoIntervene: aiAutoIntervene,
  });

  // AI 인사
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current || !meeting || meeting.status !== 'active') return;
    const hasAiMessage = messages.some((m) => m.is_ai);
    if (hasAiMessage) { greetedRef.current = true; return; }
    if (messages.length === 0 && !greetedRef.current) {
      const checkTimer = setTimeout(() => {
        greetedRef.current = true;
        // store에서 최신 meeting 데이터를 가져옴 (클로저 stale 방지)
        const freshMeeting = useMeetingStore.getState().meetings.find((m) => m.id === id);
        const mtg = freshMeeting || meeting;
        const userName = mtg.participants?.[0]?.name || '여러분';
        const agendaList = (mtg.agendas || []).filter((a) => a.title?.trim());
        // 자동개입 OFF 상태에서는 AI 호출 방법 안내 추가
        // (localStorage 최신값 직접 조회 — state 클로저 stale 방지)
        let autoOn = true;
        try {
          const saved = localStorage.getItem('meetflow_auto_intervene');
          autoOn = saved === null ? true : saved === 'true';
        } catch { /* ignore */ }

        const offGuide = autoOn
          ? ''
          : `\n\n💡 **AI 자동개입이 꺼져 있어요.**\n필요할 때 \`@밀로\` 또는 \`@노먼 / @코틀러 / @프뢰벨 / @간트 / @코르프 / @데밍\` 으로 호출하면 해당 전문가가 답변드립니다. 호출 전에는 조용히 듣고만 있을게요.`;

        let greeting;
        if (agendaList.length > 0) {
          const agendaNames = agendaList.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
          greeting = `안녕하세요, ${userName}님! 킨더보드 회의 진행자 밀로입니다.\n\n오늘의 어젠다:\n${agendaNames}\n\n첫 번째 안건 "${agendaList[0].title}"부터 시작하겠습니다. 의견을 자유롭게 나눠주세요!${offGuide}`;
        } else {
          greeting = `안녕하세요, ${userName}님! 킨더보드 회의 진행자 밀로입니다. 오늘 회의 주제나 논의하고 싶은 안건이 있으시면 알려주세요.${offGuide}`;
        }
        sendMessage(greeting, { agendaId: mtg?.agendas?.[0]?.id, isAi: true, aiType: 'nudge', aiEmployee: 'milo' });
      }, 2000);
      return () => clearTimeout(checkTimer);
    }
  }, [meeting, messages, sendMessage]);

  // 파일 업로드 핸들러 (ChatArea에서 호출) — Storage+DB에 영구 저장
  const handleFileUpload = useCallback(async (file) => {
    try {
      await uploadMeetingFile(file);
    } catch (err) {
      console.error('[handleFileUpload] 실패:', err);
    }
  }, [uploadMeetingFile]);

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center text-txt-secondary">
        <div className="text-center">
          <p className="text-sm mb-3">회의를 찾을 수 없습니다.</p>
          <button onClick={() => navigate('/meetings')} className="text-brand-purple hover:text-txt-primary text-xs">회의 목록으로 돌아가기</button>
        </div>
      </div>
    );
  }

  const handleEndClick = () => {
    setConfirmingEnd(true);
  };

  const handleCancelEnd = () => {
    setConfirmingEnd(false);
  };

  // 회의록 작성 + 종료
  const handleConfirmEnd = async () => {
    setConfirmingEnd(false);
    setActiveMeetingId(null);
    setLeavingConfirmed(true);
    clearSessionState(id);

    // 즉시 대시보드로 이동 + 시작 토스트
    navigate('/');
    addToast('회의록을 작성중입니다...', 'info', 4000);

    // 백그라운드에서 회의록 생성
    setSummaryGeneratingId(id);
    try {
      const result = await endMeeting(id, { messages, agendas: meeting.agendas || [] });
      if (result?.failed) {
        // 요약 실패 — 명확한 경고 토스트 + 재시도 유도
        addToast(
          '회의록 자동 생성에 실패했습니다. 회의록 목록에서 다시 시도할 수 있어요.',
          'error',
          6000
        );
      } else if (result?.summary) {
        addToast('회의록 작성이 완료되었습니다! 📝', 'success', 5000);
      }
    } catch (err) {
      console.error('[handleConfirmEnd]', err);
      addToast('회의록 작성 중 오류가 발생했습니다.', 'error', 5000);
    } finally {
      setSummaryGeneratingId(null);
    }
  };

  // 회의록 없이 종료 — summary_skipped=true → 회의록 목록에서 제외
  const handleEndWithoutSummary = async () => {
    setConfirmingEnd(false);
    setActiveMeetingId(null);
    setLeavingConfirmed(true);
    clearSessionState(id);

    const patch = {
      status: 'completed',
      ended_at: new Date().toISOString(),
      summary_skipped: true,   // 회의록 페이지에서 제외되도록 표시
    };
    const { updateMeeting: storePatch } = useMeetingStore.getState();
    storePatch(id, patch);
    if (!!import.meta.env.VITE_SUPABASE_URL) {
      try { await supabase.from('meetings').update(patch).eq('id', id); } catch {}
    }

    navigate('/');
    addToast('회의가 종료되었습니다. (요약 없이 종료 — 회의록 목록에 표시되지 않아요)', 'info', 4000);
  };

  const handleSend = async (content) => {
    await sendMessage(content, { agendaId: currentAgenda?.id });
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* 종료 확인 오버레이 — Portal로 body 직접 렌더링 (LNB 위로) */}
      {confirmingEnd && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/10 backdrop-blur-sm flex items-center justify-center">
          <div className="relative bg-bg-secondary border border-border-subtle rounded-xl p-8 max-w-sm mx-4 text-center shadow-lg">
            {/* X 닫기 → 회의 화면으로 복귀 */}
            <button
              onClick={handleCancelEnd}
              className="absolute top-3 right-3 p-1.5 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
            >
              <X size={16} />
            </button>
            <div className="w-14 h-14 rounded-full bg-gradient-brand shadow-glow flex items-center justify-center mx-auto mb-4">
              <Sparkles size={24} className="text-white" strokeWidth={2} />
            </div>
            <h3 className="text-lg font-semibold text-txt-primary mb-2">회의록을 작성하시겠습니까?</h3>
            <p className="text-sm text-txt-secondary mb-6">Milo가 자동으로 회의록과 요약을 생성합니다.</p>
            <div className="flex gap-2">
              <button
                onClick={handleEndWithoutSummary}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border-default text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
              >
                작성 취소
              </button>
              <button
                onClick={handleConfirmEnd}
                className="flex-1 px-4 py-2.5 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                회의록 작성
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═══ 헤더 ═══ */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-border-divider">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => safeNavigate('/meetings')} className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors shrink-0">
            <X size={16} />
          </button>
          <h1 className="text-base md:text-[22px] font-medium text-txt-primary tracking-tight truncate">
            {meeting.title}
          </h1>
          {meeting.status === 'active' && (
            <Badge variant="success">
              <span className="w-3 h-3 rounded-full bg-status-error pulse-dot mr-1" />
              <span className="hidden md:inline">진행 중</span>
            </Badge>
          )}
        </div>

        {/* 우측 액션: 자동개입 토글 + 요약 + 회의 종료 */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* 자동개입 토글 */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-[10px] text-txt-muted font-medium">자동개입</span>
            <button
              onClick={() => setAiAutoIntervene((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                aiAutoIntervene ? 'bg-brand-purple' : 'bg-bg-tertiary border border-border-default'
              }`}
              title={aiAutoIntervene ? 'AI 자동 개입 ON' : 'AI 직접 호출만'}
            >
              <span className={`absolute top-1/2 -translate-y-1/2 ${aiAutoIntervene ? 'left-[18px]' : 'left-[3px]'} w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm`} />
            </button>
          </div>

          {/* 모바일 자동개입 */}
          <button
            onClick={() => setAiAutoIntervene((v) => !v)}
            className={`md:hidden p-1.5 rounded-md transition-colors ${aiAutoIntervene ? 'text-brand-purple bg-brand-purple/10' : 'text-txt-muted'}`}
            title={aiAutoIntervene ? 'AI 자동 개입 ON' : 'AI 직접 호출만'}
          >
            {aiAutoIntervene ? <Zap size={16} /> : <ZapOff size={16} />}
          </button>

          {/* 요약 버튼 */}
          <Link
            to={`/summaries/${id}`}
            className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium text-brand-purple bg-brand-purple/10 border border-brand-purple/20 hover:bg-brand-purple/20 transition-colors"
          >
            <Sparkles size={13} />
            <span className="hidden md:inline">요약</span>
          </Link>

          {/* 회의 종료 */}
          <button
            onClick={handleEndClick}
            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-xs md:text-sm font-medium hover:bg-status-error/20 transition-colors"
          >
            <Square size={14} strokeWidth={2.4} />
            <span className="hidden md:inline">회의 종료</span>
            <span className="md:hidden">종료</span>
          </button>
        </div>
      </div>

      {/* 어젠다 바 */}
      <AgendaBar agendas={meeting.agendas || []} activeId={currentAgenda?.id} onSelect={setActiveAgendaId} />

      {/* ═══ 메인: 자료 패널 + 채팅 ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 자료 패널 (데스크톱) */}
        <DocumentPanel
          files={meetingFiles}
          getUrl={getMeetingFileUrl}
        />

        {/* 채팅 영역 */}
        <ChatArea
          messages={messages}
          onSend={handleSend}
          disabled={meeting.status === 'completed'}
          aiThinking={aiThinking}
          onFileUpload={handleFileUpload}
          autoIntervene={aiAutoIntervene}
          aiError={aiError}
        />
      </div>
    </div>
  );
}
