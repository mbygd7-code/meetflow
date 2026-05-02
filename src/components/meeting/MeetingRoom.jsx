import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Square, Sparkles, Zap, ZapOff, FileText, FolderOpen, ChevronLeft, ChevronRight, AlertTriangle, Minus, Maximize2, GripVertical, Search, ZoomIn, ZoomOut, Pencil, Download, LogOut, ChevronsLeftRight, Menu, Trash2, Loader2 } from 'lucide-react';
import { getFileTypeBadge, getFileExt } from '@/lib/fileTypeBadge';
import { clearSessionState } from '@/lib/harness';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useMeetingFiles } from '@/hooks/useMeetingFiles';
import { useMilo } from '@/hooks/useMilo';
import { useViewerSync } from '@/hooks/useViewerSync';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useToastStore } from '@/stores/toastStore';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useAuthStore } from '@/stores/authStore';
import { useSidebar } from '@/components/layout/Layout';
import ChatArea from './ChatArea';
import AgendaBar from './AgendaBar';
import PollPanel from './PollPanel';
import PdfViewer from './PdfViewer';
import DrawingOverlay from './DrawingOverlay';
import RemoteCursorsLayer from './RemoteCursorsLayer';
import IframeOverlay from './IframeOverlay';
import VoiceJoinButton from './VoiceJoinButton';
import ScreenShareButton from './ScreenShareButton';
import ScreenShareView from './ScreenShareView';
import VoicePanel from './VoicePanel';
import VoiceJoinIntroModal, { shouldShowVoiceIntro } from './VoiceJoinIntroModal';
import ScreenShareInviteModal from './ScreenShareInviteModal';
import ChatMiniWidget from './ChatMiniWidget';
import { useLiveKitVoice } from '@/hooks/useLiveKitVoice';
import { Document as PdfDocument, Page as PdfPage } from 'react-pdf';
import { getSourceMeta } from '@/lib/googleDocsUrl';
import { embeddableUrl, getHostnameForDisplay } from '@/lib/embeddableUrl';

// ── 파일 썸네일 카드 (갤러리 스타일 — 이미지 유동 / 문서 고정) ──
// canDelete=true 이면 우상단에 삭제(X) 버튼 노출 — onDelete 콜백은 confirm 후 호출됨.
function FileThumbCard({ file, getUrl, onClick, isImage, compact = false, canDelete = false, onDelete }) {
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

  // 외부 출처(Google Docs 등) 메타 — 썸네일에 작은 뱃지 노출
  const sourceMeta = getSourceMeta(file.source_kind);
  const SourceBadge = sourceMeta ? (
    <div
      className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold text-white shadow-sm pointer-events-none"
      style={{ backgroundColor: sourceMeta.color }}
      title={`${sourceMeta.label}에서 가져온 PDF`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
      {sourceMeta.label}
    </div>
  ) : null;

  // 삭제 버튼 — 권한자(업로더/회의 생성자/관리자)에게만 노출. 호버 시 표시.
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (typeof onDelete === 'function') onDelete(file);
  };
  const DeleteBtn = canDelete ? (
    <button
      type="button"
      onClick={handleDeleteClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/55 hover:bg-status-error/90 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm z-10"
      title="자료 삭제"
      aria-label="자료 삭제"
    >
      <Trash2 size={12} strokeWidth={2.2} />
    </button>
  ) : null;

  // 카드 클릭 — 키보드 접근성 (button 시멘틱 대체) — Enter/Space 로 클릭 트리거
  const cardKeyHandler = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  // 이미지: 섹션 폭에 맞춰 adaptive 크기 (갤러리)
  // 카드를 div(role=button) 로 둠 — 내부에 삭제 button 중첩되어도 DOM 검증 위반 X
  if (isImage) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={cardKeyHandler}
        className="w-full rounded-lg overflow-hidden transition-all group text-left border bg-bg-tertiary/50 border-border-subtle hover:border-brand-purple/40 hover:shadow-md cursor-pointer"
        title={file.name}
      >
        <div className="relative w-full aspect-video bg-bg-tertiary flex items-center justify-center overflow-hidden">
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
          {SourceBadge}
          {DeleteBtn}
        </div>
        {!compact && (
          <div className="px-2 py-1.5">
            <p className="text-[11px] font-medium truncate text-txt-primary group-hover:text-brand-purple">
              {file.name}
            </p>
            {sizeLabel && <p className="text-[9px] text-txt-muted">{sizeLabel}</p>}
          </div>
        )}
      </div>
    );
  }

  // PDF: 첫 페이지를 썸네일로 렌더 (이미지와 유사한 adaptive 레이아웃, aspect A4)
  if (isPdf) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={cardKeyHandler}
        className="w-full rounded-lg overflow-hidden transition-all group text-left border bg-bg-tertiary/50 border-border-subtle hover:border-brand-purple/40 hover:shadow-md cursor-pointer"
        title={file.name}
      >
        <div
          ref={thumbContainerRef}
          className="relative w-full aspect-[1/1.414] bg-white flex items-center justify-center overflow-hidden"
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
          {SourceBadge}
          {DeleteBtn}
        </div>
        {!compact && (
          <div className="px-2 py-1.5">
            <p className="text-[11px] font-medium truncate text-txt-primary group-hover:text-brand-purple">
              {file.name}
            </p>
            {sizeLabel && <p className="text-[9px] text-txt-muted">{sizeLabel}</p>}
          </div>
        )}
      </div>
    );
  }

  // 일반 문서: compact 모드에서는 작게, 아니면 140px 중앙 정렬
  // PPT/DOC/XLS 등은 컬러 뱃지 + 확장자로 placeholder. 변환 중이면 spinner 오버레이.
  const docWidth = compact ? '100%' : 140;
  const badge = getFileTypeBadge(file.name || file.type || '');
  const ext = getFileExt(file.name);
  // Office 파일이고 아직 PDF 로 변환 안 된 상태 → 변환 진행 중으로 간주
  // (createMeeting 경로에선 _converting 플래그가 안 set 되지만, 파일 type 자체로 판정 가능)
  const OFFICE_NAME_RE = /\.(pptx|ppt|docx|doc|xlsx|xls|odp|odt|ods|rtf|csv)$/i;
  const isOfficeOriginal =
    OFFICE_NAME_RE.test(file.name || '') &&
    file.type !== 'application/pdf' &&
    !file.metadata?.converted_at;
  const isConverting = !!file._converting || isOfficeOriginal;
  const convertError = file._convertError;
  return (
    <div
      role="button"
      tabIndex={isConverting ? -1 : 0}
      onClick={isConverting ? undefined : onClick}
      onKeyDown={isConverting ? undefined : cardKeyHandler}
      className={`mx-auto rounded-lg overflow-hidden transition-all group text-center border bg-bg-tertiary/50 hover:shadow-md ${
        isConverting ? 'cursor-wait' : 'cursor-pointer'
      } ${
        convertError ? 'border-status-error/40' : 'border-border-subtle hover:border-brand-purple/40'
      }`}
      style={{ width: docWidth }}
      title={convertError ? `변환 실패: ${convertError}` : isConverting ? `${file.name} (PDF 변환 중...)` : file.name}
    >
      <div
        className={`relative w-full ${compact ? 'h-[60px]' : 'h-[100px]'} flex flex-col items-center justify-center gap-1`}
        style={{ backgroundColor: badge.bg }}
      >
        {/* 큰 컬러 사각 뱃지 — placeholder 썸네일 역할 */}
        <div
          className={`flex items-center justify-center rounded font-bold tracking-wide ${
            compact ? 'w-7 h-7 text-[9px]' : 'w-10 h-12 text-[11px]'
          }`}
          style={{ backgroundColor: badge.color, color: badge.textColor }}
        >
          {badge.label}
        </div>
        {!compact && (
          <span className="text-[9px] uppercase tracking-wider text-txt-muted/80">
            {ext}
          </span>
        )}

        {/* 변환 중 오버레이 */}
        {isConverting && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5">
            <Loader2 size={compact ? 16 : 22} className="text-white animate-spin" />
            {!compact && (
              <span className="text-[9px] text-white font-medium">PDF 변환 중…</span>
            )}
          </div>
        )}

        {/* 변환 실패 표시 */}
        {convertError && !isConverting && (
          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 px-1 py-0.5 rounded bg-status-error/90">
            <AlertTriangle size={10} className="text-white" />
            <span className="text-[8px] text-white font-medium truncate">변환 실패</span>
          </div>
        )}

        {SourceBadge}
        {DeleteBtn}
      </div>
      {!compact && (
        <div className="px-2 py-1.5">
          <p className="text-[11px] font-medium truncate text-txt-primary group-hover:text-brand-purple">
            {file.name}
          </p>
          {sizeLabel && <p className="text-[9px] text-txt-muted">{sizeLabel}</p>}
        </div>
      )}
    </div>
  );
}

// ── 이미지 패널 내부 확대 오버레이 (다른 자료 덮음) ──
function ImageZoomOverlay({
  file, url, onClose, onImageLoad, meetingId, messages = [],
  following, setFollowing, vbroadcast, remoteCursors = {},
  setMyViewerState,
}) {
  // 내 뷰어 상태 hook 에 동기화 (이미지는 페이지 개념 없음 → page=1)
  //   cleanup 은 언마운트(파일 닫힘) 시만 실행하여 race window 제거
  useEffect(() => {
    if (typeof setMyViewerState !== 'function') return;
    setMyViewerState({
      fileId: file?.id || file?.name,
      fileName: file?.name,
      page: 1,
    });
  }, [file?.id, file?.name, setMyViewerState]);

  useEffect(() => {
    return () => {
      if (typeof setMyViewerState === 'function') setMyViewerState(null);
    };
  }, [setMyViewerState]);
  const [zoomScale, setZoomScale] = useState(100);   // 50~300 (%)
  const [sliderOpen, setSliderOpen] = useState(false);
  const [drawingActive, setDrawingActive] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  // 드로잉 툴바를 헤더 아래 슬롯에 포털 배치하기 위한 타겟
  const [toolbarHost, setToolbarHost] = useState(null);
  const scrollRef = useRef(null);
  const panRef = useRef(null);
  const sliderContainerRef = useRef(null);
  const imageRef = useRef(null);
  const cursorThrottleRef = useRef(0);
  // 슬라이더/줌 컨트롤과 상호작용 중 — pan 차단용 (이벤트 race 방지)
  const sliderInteractingRef = useRef(false);
  // 줌 변경 시 visible center 보존을 위한 prev zoom 추적
  const prevZoomRef = useRef(100);
  const isZoomed = zoomScale > 100;

  // ── 줌 변경 시 화면 중심 고정 ──
  // zoomScale 변경 → 이미지 크기가 % 단위로 변함 → safe-center 정렬로 인해
  // 이미지 콘텐츠가 시각적으로 "드래그되는 것처럼" 보이는 현상 방지.
  // 보이는 영역의 중심이 zoom 전후 동일한 이미지 좌표를 가리키도록 scrollLeft/Top 재계산.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevZoomRef.current;
    if (!el || prev === zoomScale) {
      prevZoomRef.current = zoomScale;
      return;
    }
    const factor = zoomScale / prev;
    // zoom 적용 직전 중심 좌표 (콘텐츠 기준)
    const centerX = el.scrollLeft + el.clientWidth / 2;
    const centerY = el.scrollTop + el.clientHeight / 2;
    const targetCenterX = centerX * factor;
    const targetCenterY = centerY * factor;
    prevZoomRef.current = zoomScale;
    // 이미지 width % 적용으로 scrollWidth/Height 가 업데이트된 후 scroll 위치 조정
    requestAnimationFrame(() => {
      const cur = scrollRef.current;
      if (!cur) return;
      cur.scrollLeft = Math.max(0, targetCenterX - cur.clientWidth / 2);
      cur.scrollTop = Math.max(0, targetCenterY - cur.clientHeight / 2);
    });
  }, [zoomScale]);

  // 이미지 리사이즈 감지 — 줌/뷰포트/폭 변화 모두 캔버스에 즉시 반영
  // (img의 clientWidth/Height가 바뀌면 DrawingOverlay width/height prop이 새 값으로 갱신됨)
  useEffect(() => {
    const el = imageRef.current;
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
  }, [url, zoomScale]);

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

  // Ctrl/Cmd + 마우스 휠 → 이미지 줌 인/아웃 (50%~300%)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const step = 10;
      setZoomScale((s) => {
        const next = e.deltaY < 0 ? s + step : s - step;
        return Math.max(50, Math.min(300, next));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 모바일 핀치줌 — 두 손가락으로 이미지 zoom 조정 (50~300%)
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinchStartDist = null;
    let pinchStartZoom = 100;
    const dist = (t) => Math.hypot(
      t[0].clientX - t[1].clientX,
      t[0].clientY - t[1].clientY
    );
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches);
        pinchStartZoom = zoomScaleRef.current;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2 || pinchStartDist == null) return;
      e.preventDefault();
      const scale = dist(e.touches) / pinchStartDist;
      const next = Math.max(50, Math.min(300, Math.round(pinchStartZoom * scale)));
      setZoomScale(next);
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

  // 드래그 이동 (pan) — 확대 상태에서만 활성화
  const onPanStart = (e) => {
    if (!isZoomed) return;
    // 슬라이더와 상호작용 중이면 pan 절대 시작 금지 (이벤트 race 방지)
    if (sliderInteractingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // 슬라이더 컨테이너/버튼/input/링크 영역 클릭은 무시
    if (e.target.closest('button, input, a, [role="slider"]')) return;
    if (sliderContainerRef.current && sliderContainerRef.current.contains(e.target)) return;

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
      <div className="flex items-center justify-between gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-2 border-b border-border-divider shrink-0 min-w-0">
        <p className="text-[11px] md:text-xs font-medium text-txt-primary truncate flex-1 min-w-0">{file.name}</p>
        <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
          {typeof setFollowing === 'function' && (
            <button
              onClick={() => setFollowing((v) => !v)}
              className={`px-1.5 md:px-2 py-1 rounded transition-colors text-[11px] font-medium inline-flex items-center gap-1 ${
                following
                  ? 'text-white bg-status-success'
                  : 'text-txt-primary hover:text-status-success hover:bg-bg-tertiary border border-border-default'
              }`}
              title={following ? '라이브 따라가기 ON' : '라이브 따라가기 OFF — 클릭해서 켜기'}
              aria-pressed={following}
            >
              <span
                style={following ? { color: '#FFEF63', textShadow: '0 0 4px rgba(255,239,99,0.8)' } : undefined}
              >●</span>
              <span className="ml-1 hidden md:inline">라이브</span>
            </button>
          )}
          <button
            onClick={() => setDrawingActive((v) => !v)}
            className={`p-1 md:p-1.5 rounded transition-colors ${
              drawingActive
                ? 'text-white bg-brand-purple'
                : 'text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary'
            }`}
            title={drawingActive ? '드로잉 종료' : '드로잉 켜기 (실시간 공유)'}
            aria-label="드로잉 토글"
          >
            <Pencil size={16} />
          </button>
          {url && (
            <a
              href={url}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 md:p-1.5 rounded text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
              aria-label="다운로드"
              title="다운로드"
            >
              <Download size={16} />
            </a>
          )}
          <button onClick={onClose} className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded" aria-label="닫기">
            <X size={16} />
          </button>
        </div>
      </div>
      {/* 드로잉 툴바 슬롯 — 헤더(편집 버튼) 바로 아래 고정. 드로잉 활성 시만 표시 */}
      {drawingActive && (
        <div
          ref={setToolbarHost}
          className="flex items-center justify-end gap-2 px-3 py-1.5 border-b border-border-divider shrink-0 bg-bg-secondary/60"
        />
      )}
      <div className="flex-1 relative bg-bg-tertiary/30 overflow-hidden">
        {/* 이미지 스크롤 컨테이너 — 확대 시 드래그/스크롤로 전체 접근 가능
            safe center: 내용 오버플로우 시 start로 fallback하여 왼쪽/위 영역도 스크롤 도달 */}
        <div
          ref={scrollRef}
          onMouseDown={onPanStart}
          onMouseMove={(e) => {
            if (typeof vbroadcast !== 'function') return;
            const now = Date.now();
            if (cursorThrottleRef.current && now - cursorThrottleRef.current < 50) return;
            cursorThrottleRef.current = now;
            // 좌표 정규화 기준 = 실제 이미지 콘텐츠 박스
            //   (스크롤 컨테이너 기준이면 브라우저 폭에 따라 이미지 주변 여백이 달라
            //    같은 픽셀에 마우스를 올려도 사용자 간 normalized x/y 가 어긋남)
            const img = imageRef.current;
            if (!img) return;
            const rect = img.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            if (x < 0 || x > 1 || y < 0 || y > 1) return;
            vbroadcast('viewer:cursor', { fileId: file.id || file.name, x, y });
          }}
          onDoubleClick={(e) => {
            // 버튼/슬라이더 위 더블클릭은 무시
            if (e.target.closest('button, input, a, [role="slider"]')) return;
            if (sliderContainerRef.current && sliderContainerRef.current.contains(e.target)) return;
            setZoomScale(100);
          }}
          title={isZoomed ? '더블클릭으로 원래 크기' : '더블클릭으로 원래 크기'}
          className={`absolute inset-0 overflow-auto flex p-3 ${
            isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
          }`}
          style={{
            justifyContent: 'safe center',
            alignItems: 'safe center',
            // 브라우저의 overflow-anchor 자동 스크롤 조정 비활성화
            // → 이미지 크기 변할 때 스크롤이 제멋대로 움직이지 않음
            overflowAnchor: 'none',
          }}
        >
          {url ? (
            <div className="relative shrink-0" style={{ overflowAnchor: 'none' }}>
              <img
                ref={imageRef}
                src={url}
                alt={file.name}
                onLoad={(e) => {
                  onImageLoad?.(e.target.naturalWidth, e.target.naturalHeight);
                  // 드로잉 캔버스 크기 추적
                  setCanvasSize({
                    w: e.target.clientWidth,
                    h: e.target.clientHeight,
                  });
                }}
                draggable={false}
                style={
                  zoomScale === 100
                    ? { overflowAnchor: 'none' }
                    : {
                        width: `${zoomScale}%`,
                        height: 'auto',
                        maxWidth: 'none',
                        maxHeight: 'none',
                        flexShrink: 0,
                        overflowAnchor: 'none',
                      }
                }
                className={`select-none ${drawingActive ? '' : 'pointer-events-none'} ${
                  zoomScale === 100
                    ? 'max-w-full max-h-full object-contain rounded-md shadow-md block'
                    : 'rounded-md shadow-md block'
                }`}
              />
              {/* 드로잉 오버레이
                  - drawingActive(연필 ON)        : 편집 모드 (툴바 + 그리기)
                  - !drawingActive + following ON : 읽기 전용 (다른 참가자 스트로크만 표시) */}
              {(drawingActive || following) && (
                <DrawingOverlay
                  targetKey={`img:${file.id || file.name}`}
                  fileName={file?.name}
                  meetingId={meetingId}
                  width={canvasSize.w || imageRef.current?.clientWidth || 0}
                  height={canvasSize.h || imageRef.current?.clientHeight || 0}
                  messages={messages}
                  onClose={() => setDrawingActive(false)}
                  toolbarContainer={toolbarHost}
                  readOnly={!drawingActive}
                  following={following}
                />
              )}
              {/* 라이브 커서 — 이미지 콘텐츠 박스 위에 직접 마운트
                  (sender가 imageRef 기준으로 정규화하므로 receiver도 같은 박스 위에 표시) */}
              <RemoteCursorsLayer
                cursors={remoteCursors}
                fileId={file.id || file.name}
                width={canvasSize.w}
                height={canvasSize.h}
              />
            </div>
          ) : (
            <p className="text-xs text-txt-muted">로딩 중...</p>
          )}

        </div>

        {/* 오른쪽 세로 중앙 — 돋보기 버튼 + 세로 슬라이더 (밝고 진한 그림자로 어두운 배경에서도 잘 보임)
            슬라이더 드래그 중 pan 이 절대 트리거되지 않도록 sliderInteractingRef 플래그 사용 */}
        <div
          ref={sliderContainerRef}
          onMouseDown={(e) => {
            e.stopPropagation();
            sliderInteractingRef.current = true;
            const release = () => {
              sliderInteractingRef.current = false;
              document.removeEventListener('mouseup', release);
              document.removeEventListener('pointerup', release);
              document.removeEventListener('touchend', release);
              document.removeEventListener('touchcancel', release);
            };
            document.addEventListener('mouseup', release);
            document.addEventListener('pointerup', release);
            document.addEventListener('touchend', release);
            document.addEventListener('touchcancel', release);
          }}
          onMouseMove={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            e.stopPropagation();
            sliderInteractingRef.current = true;
          }}
          onTouchMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2"
        >
          {sliderOpen && (
            <div className="flex flex-col items-center gap-2 px-2 py-3 rounded-lg bg-white/95 backdrop-blur-sm border border-[#d0d0d0] shadow-[0_4px_16px_rgba(0,0,0,0.25)]">
              <button
                onClick={() => setZoomScale((s) => Math.min(300, s + 20))}
                className="p-1 rounded-md text-[#555] hover:text-brand-purple hover:bg-black/5 transition-colors"
                aria-label="확대"
              >
                <ZoomIn size={16} />
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
                onChange={(e) => {
                  const newScale = parseInt(e.target.value, 10);
                  // 줌 변경 시 스크롤 중심점 유지 (이미지가 튀지 않음)
                  const el = scrollRef.current;
                  if (el && newScale !== zoomScale) {
                    const ratio = newScale / zoomScale;
                    const cx = el.scrollLeft + el.clientWidth / 2;
                    const cy = el.scrollTop + el.clientHeight / 2;
                    const nextLeft = cx * ratio - el.clientWidth / 2;
                    const nextTop = cy * ratio - el.clientHeight / 2;
                    requestAnimationFrame(() => {
                      el.scrollLeft = Math.max(0, nextLeft);
                      el.scrollTop = Math.max(0, nextTop);
                    });
                  }
                  setZoomScale(newScale);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
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
                <ZoomOut size={16} />
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

// ── 문서 인라인 오버레이 (DocumentPanel 내부, 이미지와 동일 패턴) ──
//   포털 모달이 아니라 패널을 그대로 덮는 풀사이즈 뷰어. 뒤로가기/다른 파일 클릭으로 종료.
function DocumentZoomOverlay({
  file, url, onClose, meetingId, messages = [],
  following, setFollowing, vbroadcast, remoteCursors = {}, setViewerHandler,
  // 라이브 OFF→ON 동기화: 내 상태를 hook 에 알림 + 외부에서 받은 초기 페이지 적용
  setMyViewerState,
  initialPage = null,
  initialPageFileId = null,
  onInitialPageApplied,
  // PDF 안 링크 클릭 → 부모(DocumentPanel)가 iframe 오픈 + broadcast 처리
  onPdfLinkClick,
  // PDF 줌 시 자료 섹션 확장 — 부모(DocumentPanel) 가 폭 floor 갱신
  onContentWidthChange,
}) {
  const [drawingActive, setDrawingActive] = useState(false);
  const [toolbarHost, setToolbarHost] = useState(null);
  // PDF 페이지 네비/줌 컨트롤 포털 타겟 — 통합 툴바에 함께 배치
  const [pdfControlsHost, setPdfControlsHost] = useState(null);
  // 외부(다른 참가자)가 보낸 페이지 변경 — PdfViewer로 전달해서 그쪽 pageNumber 강제 동기화
  const [presenterPage, setPresenterPage] = useState(null);
  const bodyRef = useRef(null);
  const isPdf = file?.type === 'application/pdf';
  const isImageType = file?.type?.startsWith?.('image/');
  const fileId = file?.id || file?.name;

  // 내 현재 페이지 — request-sync 응답에 사용 + UI 상태 추적
  // PdfViewer 의 onCurrentPageChange 콜백이 출처 무관하게 모든 페이지 변경을 통지하므로
  // 외부 동기화로 인한 변경도 정확히 추적된다. (skipBroadcast 의 영향을 받지 않음)
  const [myCurrentPage, setMyCurrentPage] = useState(1);

  // 페이지 변경 broadcast (PdfViewer 의 onPageChange 콜백) — 자기가 직접 넘긴 경우만
  const handlePageChange = useCallback((page) => {
    if (typeof vbroadcast === 'function') {
      vbroadcast('viewer:page', { fileId, page });
    }
  }, [vbroadcast, fileId]);

  // 내 뷰어 상태 hook 에 동기화 (request-sync 응답에 사용)
  //   ※ cleanup 은 마운트 해제(파일 닫힘) 시에만 실행하도록 분리.
  //     이전엔 dep 변경마다 null→state 가 일어나 응답 race window 가 있었음.
  useEffect(() => {
    if (typeof setMyViewerState !== 'function') return;
    setMyViewerState({
      fileId,
      fileName: file?.name,
      page: myCurrentPage,
    });
  }, [fileId, file?.name, myCurrentPage, setMyViewerState]);

  // 언마운트 시 file 정보만 클리어 (iframe 은 별도 효과에서 관리되므로 보존)
  useEffect(() => {
    return () => {
      if (typeof setMyViewerState === 'function') {
        setMyViewerState({ fileId: null, fileName: null, page: null });
      }
    };
  }, [setMyViewerState]);

  // 외부에서 받은 초기 페이지 (라이브 OFF→ON 동기화 응답)
  // — 같은 파일에 대한 응답일 때만 적용. 다른 파일(이전에 열었던 자료)의 페이지가
  //   잘못 적용되어 페이지가 점프하는 사고 방지.
  useEffect(() => {
    if (initialPage == null || initialPage <= 0) return;
    // 응답에 fileId가 명시돼 있고 현재 파일과 다르면 무시 + reset
    if (initialPageFileId && initialPageFileId !== fileId) {
      onInitialPageApplied?.();
      return;
    }
    setPresenterPage(initialPage);
    onInitialPageApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage, initialPageFileId, fileId]);

  // viewer:page 수신 → following=true 일 때만 페이지 변경 적용
  // 언마운트 시 핸들러 청소 (stale 클로저로 setPresenterPage 호출 방지)
  useEffect(() => {
    if (typeof setViewerHandler !== 'function') return;
    setViewerHandler('onPage', (payload, isFollowing) => {
      if (!isFollowing) return;
      if (payload.fileId !== fileId) return;
      setPresenterPage(payload.page);
    });
    return () => setViewerHandler('onPage', null);
  }, [setViewerHandler, fileId]);

  // PDF 케이스의 커서/원격커서는 PdfViewer 가 페이지 박스 기준으로 자체 처리.
  // 비-PDF(이미지/기타) 폴백 케이스용 마우스 이동 broadcast — 이미지 ref 기준 정규화.
  const lastSentRef = useRef(0);
  const fallbackImageRef = useRef(null);
  const handleFallbackMouseMove = (e) => {
    if (typeof vbroadcast !== 'function') return;
    if (isPdf) return; // PDF는 PdfViewer 내부에서 처리
    const now = Date.now();
    if (now - lastSentRef.current < 50) return;
    lastSentRef.current = now;
    const el = isImageType ? fallbackImageRef.current : bodyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    vbroadcast('viewer:cursor', { fileId, x, y });
  };

  return (
    <div className="absolute inset-0 z-20 bg-bg-primary flex flex-col">
      {/* 헤더 — 파일명 + 라이브 토글 + 드로잉 + 다운로드 + 닫기 */}
      <div className="flex items-center justify-between gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-2 border-b border-border-divider shrink-0 min-w-0">
        <p className="text-[11px] md:text-xs font-medium text-txt-primary truncate flex-1 min-w-0">{file.name}</p>
        <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
          {/* 라이브 따라가기 토글 */}
          {typeof setFollowing === 'function' && (
            <button
              onClick={() => setFollowing((v) => !v)}
              className={`px-1.5 md:px-2 py-1 rounded transition-colors text-[11px] font-medium inline-flex items-center gap-1 ${
                following
                  ? 'text-white bg-status-success'
                  : 'text-txt-primary hover:text-status-success hover:bg-bg-tertiary border border-border-default'
              }`}
              title={following ? '라이브 따라가기 ON — 다른 참가자가 자료 열거나 페이지 넘기면 따라감' : '라이브 따라가기 OFF — 클릭해서 켜기'}
              aria-pressed={following}
            >
              <span
                style={following ? { color: '#FFEF63', textShadow: '0 0 4px rgba(255,239,99,0.8)' } : undefined}
              >●</span>
              <span className="ml-1 hidden md:inline">라이브</span>
            </button>
          )}
          <button
            onClick={() => setDrawingActive((v) => !v)}
            className={`p-1 md:p-1.5 rounded transition-colors ${
              drawingActive
                ? 'text-white bg-brand-purple'
                : 'text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary'
            }`}
            title={drawingActive ? '드로잉 종료' : '드로잉 켜기 (실시간 공유)'}
            aria-label="드로잉 토글"
          >
            <Pencil size={16} />
          </button>
          {url && (
            <a
              href={url}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 md:p-1.5 rounded text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
              aria-label="다운로드"
              title="다운로드"
            >
              <Download size={16} />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 바디 — PDF는 PdfViewer, 그 외는 안내 + 다운로드
          통합 툴바는 본문 위에 absolute 떠있는 형태로 들어감 (회색 빈 공간 제거)
          툴바 활성 시 상단 padding 으로 콘텐츠가 가려지지 않게 공간 확보 */}
      <div
        ref={bodyRef}
        onMouseMove={handleFallbackMouseMove}
        className={`flex-1 relative bg-bg-tertiary/30 overflow-hidden ${(isPdf || drawingActive) ? 'pt-12 md:pt-12' : ''}`}
      >
        {/* 통합 툴바 (absolute 떠있는 오버레이) — PDF 컨트롤 + 드로잉 툴바
            본문 콘텐츠 위에 떠 있어 흰색 라운드 pill 만 보이고 회색 박스 시각 잡음 0 */}
        {(isPdf || drawingActive) && (
          <div className="absolute top-1.5 left-0 right-0 z-20 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-2 gap-y-1 px-2 md:px-3 pointer-events-none">
            {/* PDF 페이지 네비 + 줌 (PdfViewer가 포털로 채움) */}
            <div ref={setPdfControlsHost} className="flex items-center justify-between gap-2 flex-1 min-w-0 w-full md:w-auto pointer-events-auto" />
            {/* 드로잉 툴바 (DrawingOverlay가 포털로 채움)
                overflow-visible: pill 의 shadow 가 부모 박스 경계에 잘려 회색 사각으로 보이는 현상 방지 */}
            <div ref={setToolbarHost} className="flex items-center gap-2 shrink-0 w-full md:w-auto md:justify-end justify-center overflow-visible pointer-events-auto" />
          </div>
        )}
        {isPdf && url ? (
          <PdfViewer
            url={url}
            drawingActive={drawingActive}
            onCloseDrawing={() => setDrawingActive(false)}
            meetingId={meetingId}
            fileId={file.id || file.name}
            fileName={file.name}
            messages={messages}
            toolbarContainer={toolbarHost}
            controlsContainer={pdfControlsHost}
            presenterPage={presenterPage}
            onPageChange={handlePageChange}
            onCurrentPageChange={setMyCurrentPage}
            vbroadcast={vbroadcast}
            remoteCursors={remoteCursors}
            following={following}
            onLinkClick={onPdfLinkClick}
            onContentWidthChange={onContentWidthChange}
          />
        ) : isImageType && url ? (
          <div className="relative w-full h-full">
            <img
              ref={fallbackImageRef}
              src={url}
              alt={file.name}
              className="w-full h-full object-contain"
            />
            {/* 비-PDF 이미지 폴백 — 이미지 박스 기준 커서 동기화 */}
            <RemoteCursorsLayer cursors={remoteCursors} fileId={fileId} />
          </div>
        ) : url ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-txt-muted py-8 px-4 text-center">
            <FileText size={48} strokeWidth={1.3} />
            <p className="text-xs font-medium text-txt-primary break-all">{file.name}</p>
            <p className="text-[11px]">이 형식은 미리보기를 지원하지 않습니다.</p>
            <a
              href={url}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand-purple hover:underline"
            >
              파일 다운로드하여 보기
            </a>
          </div>
        ) : (
          <p className="text-xs text-txt-muted p-4">로딩 중...</p>
        )}
        {/* 라이브 커서:
            - PDF      : PdfViewer 내부 pageWrapRef 위에 마운트 (페이지 박스 기준 정규화)
            - 이미지   : 위 fallback 이미지 wrapper 안에서 렌더 (이미지 박스 기준)
            - 그 외   : 콘텐츠가 없으므로 표시 안 함 */}
      </div>
    </div>
  );
}

// ── 문서 플로팅 윈도우 (사용 중단 — DocumentZoomOverlay로 대체. 코드는 유지하되 참조 없음) ──
function FloatingDocumentWindow({ file, url, onClose, meetingId, messages = [] }) {
  const [drawingActive, setDrawingActive] = useState(false);
  // 드로잉 툴바를 헤더 아래 슬롯에 포털 배치
  const [toolbarHost, setToolbarHost] = useState(null);
  const bodyRef = useRef(null);
  const [bodySize, setBodySize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!bodyRef.current) return;
    const el = bodyRef.current;
    const update = () => setBodySize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
          <GripVertical size={16} className="text-txt-muted shrink-0" />
          <p className="text-xs font-medium text-txt-primary truncate">{file.name}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {!minimized && (
            <button
              onClick={() => setDrawingActive((v) => !v)}
              className={`p-1.5 rounded transition-colors ${
                drawingActive
                  ? 'text-white bg-brand-purple'
                  : 'text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary'
              }`}
              title={drawingActive ? '드로잉 종료' : '드로잉 켜기 (실시간 공유)'}
              aria-label="드로잉 토글"
            >
              <Pencil size={15} />
            </button>
          )}
          {url && !minimized && (
            <a
              href={url}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-md text-txt-muted hover:text-brand-purple hover:bg-bg-tertiary transition-colors"
              aria-label="다운로드"
              title="다운로드"
            >
              <Download size={16} />
            </a>
          )}
          {!minimized && (
            <button
              onClick={(e) => { e.stopPropagation(); setPrevState({ pos, size }); setSize({ w: 300, h: 240 }); setPos({ x: 60, y: 80 }); setMinimized(true); }}
              className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
              aria-label="최소화" title="최소화"
            >
              <Minus size={16} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
            aria-label="닫기">
            <X size={16} />
          </button>
        </div>
      </div>
      {/* 드로잉 툴바 슬롯 — 헤더 바로 아래, 드로잉 활성 시만 표시 */}
      {drawingActive && !minimized && (
        <div
          ref={setToolbarHost}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center justify-end gap-2 px-3 py-1.5 border-b border-border-subtle shrink-0 bg-bg-tertiary/50"
        />
      )}
      {/* 바디 — PDF는 react-pdf로 렌더, 이미지/기타는 기존 방식. min-h-0으로 flex overflow 허용 */}
      <div
        ref={bodyRef}
        className={`flex-1 min-h-0 relative ${isPdf ? '' : 'overflow-auto bg-bg-primary/50 flex items-center justify-center p-2'}`}
      >
        {isPdf && url ? (
          <PdfViewer
            url={url}
            drawingActive={drawingActive}
            onCloseDrawing={() => setDrawingActive(false)}
            meetingId={meetingId}
            fileId={file.id || file.name}
            fileName={file.name}
            messages={messages}
            toolbarContainer={toolbarHost}
          />
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

        {/* 비-PDF 바디 오버레이 — PDF는 PdfViewer 내부에서 페이지별 렌더 */}
        {!isPdf && drawingActive && bodySize.w > 0 && bodySize.h > 0 && (
          <DrawingOverlay
            targetKey={`doc:${file.id || file.name}`}
            fileName={file?.name}
            meetingId={meetingId}
            width={bodySize.w}
            height={bodySize.h}
            messages={messages}
            onClose={() => setDrawingActive(false)}
            toolbarContainer={toolbarHost}
          />
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
function DocumentPanel({
  files = [], getUrl, meetingId, messages = [], onViewerChange,
  mobileOpen = false,    // 모바일에서 풀스크린 드로어로 표시
  onMobileClose,
  // 자료 삭제 권한 체크용
  currentUserId, isAdmin, meetingCreatedBy, onDeleteFile,
}) {
  // 채팅 최소 가로폭 — 모바일 화면 사이즈. 자료 패널 최대 확장은 항상 (winW - CHAT_MIN_WIDTH) 로 제한
  const CHAT_MIN_WIDTH = 400;
  // 윈도우 폭 추적 — 창 크기 변경 시에도 채팅 최소폭 보장
  const [winW, setWinW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // PDF 줌 시 자료 섹션 확장 — PdfViewer 가 보고한 페이지폭 이상으로 패널을 키워 콘텐츠가 잘리지 않게.
  //   zoom<=1 이면 0 (확장 비활성). 채팅 최소폭 (CHAT_MIN_WIDTH) 으로 클램프됨.
  const [zoomedContentW, setZoomedContentW] = useState(0);
  // 패널 폭 — localStorage에 저장하여 세션 간 유지 (기본 200px: 1열 컴팩트 썸네일 보기)
  const [width, setWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('meetflow_doc_panel_width') || '200', 10);
      return Number.isFinite(v) ? Math.max(80, v) : 200;
    } catch { return 200; }
  });
  const [zoomFile, setZoomFile] = useState(null);     // 패널 내 확대할 이미지 파일
  const [zoomUrl, setZoomUrl] = useState(null);
  const [docFile, setDocFile] = useState(null);       // 플로팅 윈도우에 띄울 문서
  const [docUrl, setDocUrl] = useState(null);
  const [widthBeforeZoom, setWidthBeforeZoom] = useState(null); // 확대 전 원래 폭 기억
  // PDF 안 링크 → 인앱 iframe 풀스크린 뷰어 (라이브 동기화 가능)
  //   { url, original, embedSafe, title, openerName? } | null
  const [iframeOpen, setIframeOpen] = useState(null);
  const resizerRef = useRef(null);

  // ── 라이브 동기화: 다른 참가자와 같은 자료/페이지/커서 보기 ──
  //   following=true 일 때만 다른 사람이 연 자료를 자동으로 따라감 (의도하지 않은 화면 변경 방지).
  //   브로드캐스트(보내기)는 항상 자동 — 따라가기 모드와 무관.
  const { broadcast: vbroadcast, setHandler: setViewerHandler, following, setFollowing, setMyViewerState } = useViewerSync(meetingId);
  // 라이브 OFF→ON 전환 시 다른 라이브 사용자가 보낸 viewer:state 를 받아 적용할 때 사용
  // PdfViewer 의 presenterPage 로 흘러갈 "초기 페이지 점프 신호"
  // pendingInitialPageFileId — 이 페이지가 어느 파일을 위한 것인지. 다른 파일이 열리면 무시됨.
  const [pendingInitialPage, setPendingInitialPage] = useState(null);
  const [pendingInitialPageFileId, setPendingInitialPageFileId] = useState(null);
  // 다른 참가자 커서 — { userId: { x, y, name, color, fileId, page, ts } }
  const [remoteCursors, setRemoteCursors] = useState({});

  // 폭 변경 시 localStorage 저장 — 자료(이미지/문서) 뷰 활성 중에는 저장하지 않음.
  // 이유: 자료를 열면 패널이 자동 확장되는데(이미지 480px / 문서 820px), 그 값이
  // localStorage에 저장되면 다음 회의 진입 시에도 확장된 상태로 시작 → 사용자가 원하지 않음.
  // 자료 닫으면 widthBeforeZoom으로 복원되므로 그 시점의 폭이 정상적으로 저장됨.
  useEffect(() => {
    if (zoomFile || docFile) return;
    try { localStorage.setItem('meetflow_doc_panel_width', String(width)); } catch {}
  }, [width, zoomFile, docFile]);

  // 풀사이즈 뷰어(이미지 확대 or 문서 윈도우) 활성 여부를 부모에 전달 →
  // 활성 중에는 AI 자동 개입 중단 (호출한 경우에만 응답).
  useEffect(() => {
    if (typeof onViewerChange === 'function') {
      onViewerChange(!!zoomFile || !!docFile);
    }
  }, [zoomFile, docFile, onViewerChange]);

  // 이미지/문서 구분
  const isImageFile = (f) => !!f?.type?.startsWith('image/');

  // 이미지 확대 시 패널을 최대 폭까지 확장할 목표값 (이미지 실제 크기 기반 가능)
  const getMaxPanelWidth = () => Math.min(window.innerWidth - 340, 1400);

  // 내부 헬퍼 — 로컬 state만 변경 (broadcast 안 함). 원격 이벤트 수신 시 사용.
  // 다른 타입의 파일이 이미 열려 있으면 먼저 닫음 (이미지↔문서 전환 충돌 방지).
  const openFileLocal = async (file) => {
    const url = file.storage_path && getUrl
      ? await getUrl(file.storage_path)
      : (file.preview || file.url || null);

    if (isImageFile(file)) {
      // 문서가 열려있다면 먼저 닫음
      if (docFile) { setDocFile(null); setDocUrl(null); }
      if (widthBeforeZoom === null) setWidthBeforeZoom(width);
      setZoomFile(file);
      setZoomUrl(url);
      const max = getMaxPanelWidth();
      if (width < 480) setWidth(Math.min(480, max));
    } else {
      // 이미지가 열려있다면 먼저 닫음
      if (zoomFile) { setZoomFile(null); setZoomUrl(null); }
      if (widthBeforeZoom === null) setWidthBeforeZoom(width);
      setDocFile(file);
      setDocUrl(url);
      const max = getMaxPanelWidth();
      const A4_PANEL_WIDTH = 820;
      setWidth(Math.min(A4_PANEL_WIDTH, max));
    }
  };

  // 파일 클릭 핸들러 — 로컬 오픈 + 라이브 동기화 broadcast
  const handleFileClick = async (file) => {
    await openFileLocal(file);
    vbroadcast('viewer:open', {
      fileId: file.id || file.name,
      fileName: file.name,
      fileType: file.type,
    });
  };

  // PDF 안 하이퍼링크 클릭 → 인앱 iframe 풀스크린 뷰어로 오픈 + 라이브 broadcast
  //   embeddableUrl() 로 알려진 호스트는 변환(/edit→/preview 등). 모르는 곳은 시도.
  //   라이브 ON 참가자 모두에게 viewer:link-open 으로 동시 표시.
  const handlePdfLinkClick = useCallback((href) => {
    const conv = embeddableUrl(href);
    const payload = {
      url: conv.url,
      original: conv.original,
      embedSafe: conv.embedSafe,
      title: getHostnameForDisplay(conv.url),
    };
    setIframeOpen(payload);
    vbroadcast('viewer:link-open', payload);
  }, [vbroadcast]);

  // iframe 닫기 — 본인 화면 닫고 라이브 ON 모두에게 닫기 broadcast
  const handleIframeClose = useCallback(() => {
    setIframeOpen(null);
    vbroadcast('viewer:link-close', {});
  }, [vbroadcast]);

  // iframe state 를 useViewerSync 에 동기화 — 라이브 OFF→ON 전환자에게 응답할 때 포함됨
  //   파일 state 와 독립적으로 partial-merge (useViewerSync.setMyViewerState 참조)
  useEffect(() => {
    if (typeof setMyViewerState !== 'function') return;
    setMyViewerState({
      iframe: iframeOpen
        ? {
            url: iframeOpen.url,
            original: iframeOpen.original,
            embedSafe: iframeOpen.embedSafe,
            title: iframeOpen.title,
          }
        : null,
    });
  }, [iframeOpen, setMyViewerState]);

  // 이미지 확대 닫기 → 원래 폭으로 복귀 + broadcast
  const closeZoom = () => {
    const closingId = zoomFile?.id || zoomFile?.name;
    setZoomFile(null);
    setZoomUrl(null);
    if (widthBeforeZoom !== null) {
      setWidth(widthBeforeZoom);
      setWidthBeforeZoom(null);
    }
    if (closingId) vbroadcast('viewer:close', { fileId: closingId });
  };

  // 문서 확대 닫기 → 원래 폭으로 복귀 + broadcast
  const closeDoc = () => {
    const closingId = docFile?.id || docFile?.name;
    setDocFile(null);
    setDocUrl(null);
    if (widthBeforeZoom !== null) {
      setWidth(widthBeforeZoom);
      setWidthBeforeZoom(null);
    }
    if (closingId) vbroadcast('viewer:close', { fileId: closingId });
  };

  // ── 라이브 동기화 수신 핸들러 ──
  // viewer:open  → 같은 파일을 로컬 오픈 (following=true 일 때만)
  // viewer:close → 현재 보고 있는 파일이면 닫기 (following=true 일 때만)
  // viewer:cursor → 다른 사용자 커서 위치 갱신 (항상 수신, 5초 후 자동 만료)
  useEffect(() => {
    setViewerHandler('onOpen', async (payload, isFollowing) => {
      if (!isFollowing) return;
      const target = files.find((f) => (f.id || f.name) === payload.fileId);
      if (!target) return;
      await openFileLocal(target);
    });
    setViewerHandler('onClose', (payload, isFollowing) => {
      if (!isFollowing) return;
      const currentId = (zoomFile?.id || zoomFile?.name) || (docFile?.id || docFile?.name);
      if (currentId && currentId === payload.fileId) {
        if (zoomFile) {
          setZoomFile(null); setZoomUrl(null);
        }
        if (docFile) {
          setDocFile(null); setDocUrl(null);
        }
        if (widthBeforeZoom !== null) {
          setWidth(widthBeforeZoom); setWidthBeforeZoom(null);
        }
      }
    });
    setViewerHandler('onCursor', (payload) => {
      const u = payload?._user;
      if (!u?.id) return;
      setRemoteCursors((prev) => ({
        ...prev,
        [u.id]: {
          x: payload.x, y: payload.y,
          fileId: payload.fileId,
          page: payload.page,
          name: u.name, color: u.color,
          ts: Date.now(),
        },
      }));
    });
    // 동기화 응답 수신 (내가 라이브 OFF→ON 전환했을 때 다른 라이브 사용자가 보냄)
    // → 자료 자동 오픈 + 해당 페이지로 점프 + iframe 도 동일하게 표시
    setViewerHandler('onState', async (payload) => {
      // 자료 동기화 (있는 경우)
      if (payload?.fileId) {
        const currentId = (zoomFile?.id || zoomFile?.name) || (docFile?.id || docFile?.name);
        if (currentId !== payload.fileId) {
          const target = files.find((f) => (f.id || f.name) === payload.fileId);
          if (target) await openFileLocal(target);
        }
        if (typeof payload.page === 'number' && payload.page > 0) {
          setPendingInitialPage(payload.page);
          setPendingInitialPageFileId(payload.fileId);
        }
      }
      // iframe 동기화 — 라이브 사용자가 PDF 안 링크 열어둔 상태였다면 같이 표시
      if (payload?.iframe?.url) {
        setIframeOpen({
          ...payload.iframe,
          openerName: payload._user?.name,
        });
      }
    });
    // PDF 안 링크 → 인앱 iframe 오픈 (라이브 ON 만 적용 — 다른 사람이 의도치 않게 화면 끌리는 거 방지)
    setViewerHandler('onLinkOpen', (payload, isFollowing) => {
      if (!isFollowing) return;
      if (!payload?.url) return;
      setIframeOpen({
        ...payload,
        openerName: payload._user?.name,
      });
    });
    setViewerHandler('onLinkClose', (_payload, isFollowing) => {
      if (!isFollowing) return;
      setIframeOpen(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, zoomFile, docFile, widthBeforeZoom]);

  // 5초 이상 안 들어온 원격 커서는 표시에서 제거 (1초마다 정리)
  useEffect(() => {
    const t = setInterval(() => {
      setRemoteCursors((prev) => {
        const now = Date.now();
        const next = {};
        let changed = false;
        for (const [uid, c] of Object.entries(prev)) {
          if (now - c.ts < 5000) next[uid] = c;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // 라이브 OFF 전환 즉시 다른 참가자 커서 모두 제거
  //   (수신은 useViewerSync 에서 차단되지만, 이미 들어와 있던 커서가 5초 fade 까지
  //    화면에 남으면 사용자에게 "라이브 켜진 거 같은데?" 혼란을 줄 수 있음)
  useEffect(() => {
    if (!following) {
      setRemoteCursors((prev) => (Object.keys(prev).length ? {} : prev));
    }
  }, [following]);

  // 이미지 로드 후: 실제 이미지 너비에 맞춰 패널 폭을 정확히 조정
  // 이미지가 원래 폭보다 작으면 줄이고, 크면 확장 (최대 제한 내에서)
  // 여백 없이 이미지가 꽉 차 보이도록 함
  const handleImageLoaded = (naturalWidth) => {
    if (!naturalWidth) return;
    // 드로잉 툴바(~365px) + 100px 여유 확보 → 풀사이즈 뷰어 최소 480px
    const MIN = 480;
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

  // 어떤 자료도 열려있지 않으면 stale pendingInitialPage 정리
  // (자료를 닫은 후 다른 파일을 열 때 이전 동기화 응답이 잘못 적용되는 것 방지)
  useEffect(() => {
    if (!docFile && !zoomFile && (pendingInitialPage !== null || pendingInitialPageFileId !== null)) {
      setPendingInitialPage(null);
      setPendingInitialPageFileId(null);
    }
  }, [docFile, zoomFile, pendingInitialPage, pendingInitialPageFileId]);

  // 리사이저 드래그 — 마우스/터치 모두 지원
  //   최소 80px (컴팩트), 최대 화면폭-CHAT_MIN_WIDTH (채팅창 모바일 최소 가로폭 보장)
  //   풀사이즈 뷰어(zoomFile/docFile) 활성 시: 최소 480px
  const onResizerDown = (e) => {
    e.preventDefault();
    if (userCollapsed) setUserCollapsed(false);
    // 마우스/터치 통합 — clientX 추출
    const getClientX = (ev) => (ev.touches?.[0]?.clientX ?? ev.clientX);
    const startX = getClientX(e);
    const startW = userCollapsed ? MIN_WIDTH : effectiveWidth;
    const minWForDrag = (zoomFile || docFile) ? 480 : 80;
    const onMove = (ev) => {
      const dx = getClientX(ev) - startX;
      const maxW = Math.max(minWForDrag, window.innerWidth - CHAT_MIN_WIDTH);
      const next = Math.max(minWForDrag, Math.min(maxW, startW + dx));
      setWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    document.addEventListener('touchcancel', onUp);
  };

  // 파일이 없을 때는 최소 폭(80px)으로 자동 축소 → 채팅 공간 확보
  // 사용자의 저장된 폭은 그대로 유지 (파일 업로드 시 복원됨)
  const MIN_WIDTH = 80;
  const isEmpty = files.length === 0;
  // 풀사이즈 뷰어(zoom/doc) 열려 있으면 state값이 작아도 480px 이상 보장
  const viewerActive = !!(zoomFile || docFile);
  // 사용자가 헤더를 클릭하여 의도적으로 접은 상태 — width 보존, 렌더만 MIN_WIDTH 로 강제
  // 다시 헤더(컴팩트 모드)를 클릭하면 false 로 돌아가 저장된 width 로 복원됨
  const [userCollapsed, setUserCollapsed] = useState(false);
  const baseWidth = (isEmpty || userCollapsed) ? MIN_WIDTH : width;
  // 채팅 최소폭(400px) 보장을 위해 자료 패널 최대폭을 (윈도우 폭 - 400) 으로 클램프
  // — 저장된 width 가 너무 크거나 창이 좁아진 경우에도 채팅이 잘리지 않음
  const maxAllowed = Math.max(MIN_WIDTH, winW - CHAT_MIN_WIDTH);
  // PDF 줌 시 콘텐츠 폭 + 좌우 여백/툴바 padding (~48px) 만큼 floor 로 추가 — 잘림 방지
  const ZOOM_CHROME_PAD = 48;
  const zoomFloor = zoomedContentW > 0 ? zoomedContentW + ZOOM_CHROME_PAD : 0;
  const desiredBase = Math.max(baseWidth, zoomFloor);
  const clampedBase = Math.min(desiredBase, maxAllowed);
  const effectiveWidth = viewerActive ? Math.max(480, clampedBase) : clampedBase;

  // 항상 1열 유지 — 패널 폭이 커질수록 썸네일도 같이 커짐 (세로 리스트)
  const isCompact = effectiveWidth < 180; // 매우 좁을 때: 헤더/파일명 숨김

  // 문서/플로팅 윈도우용 파일 URL 로딩
  return (
    <>
      <aside
        className={`flex-col shrink-0 border-r border-border-subtle bg-bg-primary relative transition-[width] duration-200 ease-out ${
          mobileOpen
            ? 'fixed inset-0 z-40 flex w-full md:relative md:z-auto md:inset-auto md:w-[var(--panel-w)]'
            : 'hidden md:flex md:w-[var(--panel-w)]'
        } ${
          // 풀사이즈 뷰어 최소 폭은 데스크톱(md+) 에서만 (모바일은 viewport 에 맞춤)
          viewerActive ? 'md:min-w-[480px]' : ''
        }`}
        style={{
          // 데스크톱 폭은 CSS 변수로 전달 — 모바일 mobileOpen 시 w-full 이 우선 적용
          '--panel-w': `${effectiveWidth}px`,
        }}
      >
        {/* 헤더 — 컴팩트 모드에서는 심플하게. 모바일에서는 닫기 버튼 통합
            확장 상태(헤더 배경 클릭) → 컴팩트로 접힘. 컴팩트 상태(헤더 배경 클릭) → 확장 복원.
            단 풀사이즈 뷰어(zoom/doc) 활성 시에는 토글 비활성화 (의도치 않은 너비 변경 방지). */}
        <div
          onClick={() => {
            if (viewerActive || isEmpty) return; // 풀스크린 / 빈 패널은 토글 무효
            setUserCollapsed((c) => !c);
          }}
          className={`border-b border-border-divider shrink-0 select-none ${
            (!viewerActive && !isEmpty) ? 'cursor-pointer hover:bg-bg-tertiary/30 transition-colors' : ''
          } ${isCompact ? 'flex flex-col items-center py-3 gap-1' : 'flex items-center gap-2 px-3 py-3'}`}
          title={viewerActive ? undefined : (isCompact ? '클릭하여 자료 패널 펼치기' : '클릭하여 자료 패널 접기')}
        >
          <FolderOpen size={isCompact ? 14 : 14} className="text-brand-purple shrink-0" />
          {!isCompact && (
            <>
              <span className="text-sm font-semibold text-txt-primary">자료</span>
              <span className="text-[10px] text-txt-muted">{files.length}개</span>
              {/* 우측 액션 영역 — ml-auto 로 우측 정렬 */}
              <div className="ml-auto flex items-center gap-1">
                {/* 데스크톱 접기 버튼 — 풀스크린 뷰어 미활성 + 빈 패널 아님 */}
                {!viewerActive && !isEmpty && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // 헤더 onClick 중복 호출 방지 — 자체 처리
                      setUserCollapsed(true);
                    }}
                    className="hidden md:inline-flex p-1.5 rounded-md text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
                    aria-label="자료 패널 접기"
                    title="자료 패널 접기"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                {/* 모바일 드로어 닫기 */}
                {mobileOpen && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMobileClose?.(); }}
                    className="md:hidden p-1.5 rounded-md text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
                    aria-label="자료 패널 닫기"
                    title="닫기"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
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
              {files.map((f) => {
                // 삭제 권한: 업로더 본인 / 회의 생성자 / 관리자
                const canDelete = !!currentUserId && (
                  f.uploaded_by === currentUserId ||
                  meetingCreatedBy === currentUserId ||
                  !!isAdmin
                );
                return (
                  <FileThumbCard
                    key={f.id || f.name}
                    file={f}
                    getUrl={getUrl}
                    onClick={() => handleFileClick(f)}
                    isImage={isImageFile(f)}
                    compact={isCompact}
                    canDelete={canDelete}
                    onDelete={onDeleteFile}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* 이미지 확대 오버레이 — 패널 내부를 덮음. 패널은 자동으로 최대 폭까지 확장.
            key 에 fileId 부착 → 다른 파일로 전환 시 컴포넌트가 완전히 remount되어
            이전 파일의 페이지/뷰어 상태가 새 파일에 영향을 주지 않음. */}
        {zoomFile && (
          <ImageZoomOverlay
            key={`img:${zoomFile.id || zoomFile.name}`}
            file={zoomFile}
            url={zoomUrl}
            onClose={closeZoom}
            onImageLoad={handleImageLoaded}
            meetingId={meetingId}
            messages={messages}
            following={following}
            setFollowing={setFollowing}
            vbroadcast={vbroadcast}
            remoteCursors={remoteCursors}
            setMyViewerState={setMyViewerState}
          />
        )}

        {/* 문서 확대 오버레이 — 이미지와 동일한 패턴으로 패널 내부를 덮음 (포털/모달 X)
            key 에 fileId 부착 → 다른 PDF로 전환 시 완전 remount.
            initialPage(=pendingInitialPage) 는 onState 응답 직후 자동 reset 되지만,
            방금 도착한 값이 새 파일과 매칭되지 않으면 적용되지 않도록 expectedFileId 도 함께 전달. */}
        {docFile && (
          <DocumentZoomOverlay
            key={`doc:${docFile.id || docFile.name}`}
            file={docFile}
            url={docUrl}
            onClose={closeDoc}
            meetingId={meetingId}
            messages={messages}
            following={following}
            setFollowing={setFollowing}
            vbroadcast={vbroadcast}
            remoteCursors={remoteCursors}
            setViewerHandler={setViewerHandler}
            setMyViewerState={setMyViewerState}
            initialPage={pendingInitialPage}
            initialPageFileId={pendingInitialPageFileId}
            onInitialPageApplied={() => { setPendingInitialPage(null); setPendingInitialPageFileId(null); }}
            onPdfLinkClick={handlePdfLinkClick}
            onContentWidthChange={setZoomedContentW}
          />
        )}

        {/* PDF 링크 클릭 → 인앱 풀스크린 iframe 뷰어 (라이브 동기화)
            z-[100] 으로 DocumentZoomOverlay(z-20) 와 메시지 영역까지 모두 덮음 */}
        {iframeOpen && (
          <IframeOverlay
            url={iframeOpen.url}
            original={iframeOpen.original}
            embedSafe={iframeOpen.embedSafe}
            title={iframeOpen.title}
            openerName={iframeOpen.openerName}
            onClose={handleIframeClose}
          />
        )}

        {/* 리사이저 — 우측 세로 라인 드래그 (자료 있을 때만 활성화)
            z-30 으로 풀사이즈 뷰어(z-20) 위에 노출되어 풀뷰 중에도 폭 조절 가능 */}
        {!isEmpty && (
          <div
            ref={resizerRef}
            onMouseDown={onResizerDown}
            onTouchStart={onResizerDown}
            className="absolute top-0 right-0 w-2 h-full cursor-col-resize group/resize z-30 touch-none"
            title="드래그하여 가로 크기 조절"
          >
            {/* 세로 라인 — 호버 시 두꺼워지고 보라색으로 강조 */}
            <div className="absolute top-0 right-0 h-full bg-border-subtle group-hover/resize:bg-brand-purple group-hover/resize:w-1 w-px transition-all duration-150" />
            {/* 중앙 핸들 — 호버 시 좌우 화살표 아이콘 노출 */}
            <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover/resize:opacity-100 transition-opacity duration-150 pointer-events-none">
              <div className="w-6 h-10 rounded-full bg-brand-purple text-white flex items-center justify-center shadow-md">
                <ChevronsLeftRight size={14} strokeWidth={2.6} />
              </div>
            </div>
          </div>
        )}
      </aside>

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
  const { user } = useAuthStore();
  const meeting = getById(id);
  // 회의 요청자(생성자) 여부 — 버튼/동작 분기에 사용
  //   요청자 → "회의 종료" (전체 종료 + 회의록 생성)
  //   참가자 → "나가기" (혼자만 퇴장, 회의는 계속)
  const isCreator = !!(meeting?.created_by && user?.id && meeting.created_by === user.id);
  // 자동개입 토글 권한 — 회의 요청자(생성자) 또는 관리자만 제어 가능
  const canToggleAutoIntervene = isCreator || user?.role === 'admin';
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
  // 풀스크린 자료 뷰어(이미지 확대/문서 윈도우) 활성 여부
  // — 활성 중엔 AI 자동 개입 중단. 유저가 @-호출 시에만 응답. + LNB 강제 최소화.
  const [materialViewerActive, setMaterialViewerActive] = useState(false);
  const { setSidebarForceMinimized, setSidebarOpen } = useSidebar() || {};
  // 모바일 자료 드로어 열림 상태 — 데스크톱(md+) 으로 리사이즈 시 자동 해제
  const [mobileDocOpen, setMobileDocOpen] = useState(false);
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileDocOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 드로잉 아바타 태그 클릭 시 — 모바일에서는 자료 드로어 닫고 채팅창으로 전환.
  // 자료 패널 state(zoomFile/docFile/페이지/줌 등)는 DocumentPanel이 마운트 유지되어 보존됨.
  // → 다시 자료 버튼 누르면 같은 자료, 같은 페이지로 복귀.
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < 768) setMobileDocOpen(false);
    };
    window.addEventListener('meetflow:drawing-tag', handler);
    return () => window.removeEventListener('meetflow:drawing-tag', handler);
  }, []);

  // 발표 집중 모드 — 화면 공유 헤더의 Maximize2 버튼으로 토글.
  //   ON 시: LNB 최소화 + 음성 참가자 스트립(VoicePanel) 숨김 + Ctrl+wheel 줌 활성화.
  //   채팅창은 그대로 유지. 새 공유 시작 시 false 초기화.
  //   ※ 아래 setSidebarForceMinimized useEffect 가 이 state 를 deps 로 참조하므로
  //     반드시 useEffect 보다 먼저 선언 (TDZ 회피).
  const [presentationFocusMode, setPresentationFocusMode] = useState(false);

  useEffect(() => {
    if (typeof setSidebarForceMinimized !== 'function') return;
    // materialViewerActive 또는 발표 집중 모드 시 LNB 최소화
    setSidebarForceMinimized(materialViewerActive || presentationFocusMode);
    return () => setSidebarForceMinimized(false);
  }, [materialViewerActive, presentationFocusMode, setSidebarForceMinimized]);
  // docPanelExpanded 제거 — DocumentPanel은 항상 표시되며 리사이저로 폭 조절
  // 회의 자료 — DB + Storage 기반 (useMeetingFiles 훅)
  const {
    files: meetingFiles,
    uploadFile: uploadMeetingFile,
    getDownloadUrl: getMeetingFileUrl,
    importFromGoogleDocs: importGoogleDocsFile,
    deleteFile: deleteMeetingFile,
  } = useMeetingFiles(id);
  const { messages, sendMessage } = useRealtimeMessages(id);

  // ── LiveKit 음성 회의 ──
  // 사용자 명시적 join 전엔 룸 미연결. join 시 토큰 발급 → connect → 마이크 publish.
  const lk = useLiveKitVoice(id);
  // 화면 공유 패널 숨김 상태 — X 버튼으로 임시 닫기 가능 (트랙은 유지). 새 공유 시작 시 자동 reopen.
  const [screenShareHidden, setScreenShareHidden] = useState(false);
  // ChatArea portal targets — 단일 ChatArea 인스턴스가 포지션만 바뀌도록 (state 보존):
  //   - defaultChatHost : 외부 기본 위치 (대부분의 시간)
  //   - embeddedChatHostInShare : 발표자 본인 시점일 때 ScreenShareView 안 우측 슬롯
  const [defaultChatHost, setDefaultChatHost] = useState(null);
  const [embeddedChatHostInShare, setEmbeddedChatHostInShare] = useState(null);
  const prevScreenShareCountRef = useRef(0);
  useEffect(() => {
    const cur = lk.screenShares?.size || 0;
    const prev = prevScreenShareCountRef.current;
    if (cur > prev) {
      setScreenShareHidden(false); // 새 공유자 증가 → 패널 다시 표시
      setPresentationFocusMode(false); // 발표 집중 모드 리셋 (사용자가 다시 결정하게)
    }
    if (cur === 0) {
      setScreenShareHidden(false);  // 모두 종료 → 다음 공유 시 다시 표시되도록 리셋
      setPresentationFocusMode(false);
    }
    prevScreenShareCountRef.current = cur;
  }, [lk.screenShares]);

  // ── LiveKit 자동 join 시그널 채널 ──
  // 화면 공유는 LiveKit 룸 안의 트랙. 다른 참가자가 룸에 join 안 되어 있으면 publish 된
  // 트랙을 못 받음. 따라서 발표자가 공유 시작할 때 Supabase Realtime 으로 신호를 보내고,
  // 룸에 미연결인 참가자들이 받아 자동 join (mute) 하도록 한다.
  // - 채널: lk-signal:<meetingId>
  // - 이벤트: screen-share:start (payload 없음)
  // - 자동 join 은 마이크 muted 상태 → 의도치 않게 들리지 않음 (안전)
  const lkSignalChannelRef = useRef(null);
  // lk 객체는 매 렌더 새로 만들어져 채널 핸들러 클로저가 stale 됨 → ref 로 최신 보관
  const lkRef = useRef(lk);
  useEffect(() => { lkRef.current = lk; }, [lk]);
  // 화면 공유 합류 모달 — { presenterName } | null
  //   다른 참가자가 공유 시작 시 모달 노출 → "참여하고 보기" 클릭 시 lk.join (mute) 후 자동 표시
  const [shareInvite, setShareInvite] = useState(null);
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`lk-signal:${id}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'screen-share:start' }, ({ payload }) => {
      // 이미 룸에 연결돼 있으면 모달 불필요 — TrackSubscribed 가 알아서 화면 트랙 잡음
      const cur = lkRef.current;
      if (!cur || cur.connected || cur.connecting) return;
      // 합류 의사 확인 모달 노출 (자동 join 대신 사용자 확인)
      setShareInvite({ presenterName: payload?.presenterName || '참가자' });
    });
    ch.on('broadcast', { event: 'screen-share:stop' }, () => {
      // 발표자가 종료 → 아직 모달이 열려 있으면 자동 dismiss (열 가치 없음)
      setShareInvite(null);
    });
    ch.subscribe();
    lkSignalChannelRef.current = ch;
    return () => {
      try { supabase.removeChannel(ch); } catch {}
      lkSignalChannelRef.current = null;
    };
  }, [id]);

  // 본인이 공유 시작/종료 시 → 시그널 broadcast 해서 다른 참가자에게 알림
  const wasLocalScreenSharingRef = useRef(false);
  useEffect(() => {
    const was = wasLocalScreenSharingRef.current;
    const now = lk.localScreenSharing;
    wasLocalScreenSharingRef.current = now;
    const ch = lkSignalChannelRef.current;
    if (!ch) return;
    if (!was && now) {
      try {
        ch.send({
          type: 'broadcast',
          event: 'screen-share:start',
          payload: { presenterName: user?.name || '참가자' },
        });
      } catch (e) {
        console.warn('[lk-signal] broadcast start failed:', e?.message);
      }
    } else if (was && !now) {
      try {
        ch.send({ type: 'broadcast', event: 'screen-share:stop', payload: {} });
      } catch {}
    }
  }, [lk.localScreenSharing, user?.name]);

  // 모달 액션 핸들러
  const handleShareInviteAccept = useCallback(() => {
    setShareInvite(null);
    // lk.join() — 마이크 음소거 기본. screenShareSupported 무관 (수신만)
    lk.join().catch((e) => console.warn('[shareInvite] join failed:', e?.message));
  }, [lk]);
  const handleShareInviteDecline = useCallback(() => {
    setShareInvite(null);
  }, []);

  // ── milo-analyze warmup ping ──
  // Edge Function 이 일정 시간 호출 없으면 cold start 발생 → 첫 AI 호출이 timeout 으로
  // 실패하며 브라우저에 CORS 에러로 보임. 회의방 진입 즉시 ping 보내 함수 깨움.
  // 응답 기다리지 않음 (fire-and-forget). 실패해도 무시 (실제 AI 호출 시 retry 함).
  useEffect(() => {
    if (!id) return;
    if (!import.meta.env.VITE_SUPABASE_URL) return;
    supabase.functions.invoke('milo-analyze', { body: { ping: true } })
      .catch(() => { /* 무시 */ });
  }, [id]);

  // 음성 참여 안내 모달 — 첫 참여 시 1회 (다시 안 보기 옵션)
  const [voiceIntroOpen, setVoiceIntroOpen] = useState(false);
  const handleVoiceJoinClick = useCallback(() => {
    if (shouldShowVoiceIntro()) {
      setVoiceIntroOpen(true);
    } else {
      lk.join();
    }
  }, [lk]);
  const handleVoiceIntroConfirm = useCallback(() => {
    setVoiceIntroOpen(false);
    lk.join();
  }, [lk]);

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
    meetingId: id, alwaysRespond: isAiOnlyMeeting,
    // 자료 풀스크린 뷰어가 열려있으면 자동 개입 중단 — @호출 시에만 응답
    autoIntervene: aiAutoIntervene && !materialViewerActive,
  });

  // AI 인사 — meeting 객체/messages 배열 ref가 아닌 안정적 값(id/status/length)만 deps로
  const greetedRef = useRef(false);
  const meetingId = meeting?.id;
  const meetingStatus = meeting?.status;
  const messagesLen = messages.length;
  const hasAnyAi = messages.some((m) => m.is_ai);
  useEffect(() => {
    if (greetedRef.current || !meetingId || meetingStatus !== 'active') return;
    if (hasAnyAi) { greetedRef.current = true; return; }
    if (messagesLen === 0 && !greetedRef.current) {
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
  }, [meetingId, meetingStatus, messagesLen, hasAnyAi, sendMessage, meeting, id]);

  // 파일 업로드 핸들러 (ChatArea에서 호출) — Storage+DB에 영구 저장
  const handleFileUpload = useCallback(async (file) => {
    try {
      await uploadMeetingFile(file);
    } catch (err) {
      console.error('[handleFileUpload] 실패:', err);
    }
  }, [uploadMeetingFile]);

  // URL → PDF 변환 핸들러 (ChatArea의 "URL로 자료 추가" 폼에서 호출)
  // Google Docs/Sheets/Slides URL을 서버측에서 PDF로 변환 후 Storage에 저장 → 일반 PDF처럼 동작.
  const handleImportUrl = useCallback(async (url, options = {}) => {
    return await importGoogleDocsFile({ url, ...options });
  }, [importGoogleDocsFile]);

  // 자료 삭제 핸들러 (DocumentPanel에서 X 버튼 클릭 시 호출)
  // 권한: 업로더 / 회의 생성자 / 관리자만 — UI에서 이미 게이트하지만 DB RLS로 한 번 더 확인됨.
  const handleDeleteFile = useCallback(async (file) => {
    if (!file?.id) return;
    const ok = window.confirm(`"${file.name}" 자료를 정말 삭제할까요?\n삭제하면 복구할 수 없어요.`);
    if (!ok) return;
    try {
      await deleteMeetingFile(file);
      addToast(`"${file.name}" 삭제되었습니다`, 'success', 2500);
    } catch (err) {
      console.error('[handleDeleteFile] 실패:', err);
      addToast(err?.message || '자료 삭제에 실패했습니다', 'error', 4000);
    }
  }, [deleteMeetingFile, addToast]);

  // 참가자 재입장 공지 — 이전에 나간 적이 있다면 자동으로 "다시 입장" 시스템 메시지 전송.
  //   - 요청자는 제외 (요청자는 "나가기" 개념이 없음)
  //   - 메시지 히스토리에서 leave/rejoin 카운트 비교로 판단
  //   - rejoinCheckedRef로 한 번의 마운트 동안 최대 1회만 실행
  // ⚠️ 이 hook들은 early return(if !meeting) 보다 위에 있어야 hook 순서 보장 (React #310 방지)
  const rejoinCheckedRef = useRef(false);
  useEffect(() => {
    if (rejoinCheckedRef.current) return;
    if (!user?.name || !meeting || meeting.created_by === user?.id) return;
    if (meeting.status !== 'active') return;
    if (!Array.isArray(messages) || messages.length === 0) return;

    rejoinCheckedRef.current = true;
    const myName = user.name;
    let leaveCount = 0, rejoinCount = 0;
    for (const m of messages) {
      if (m.ai_type !== 'system') continue;
      const c = m.content || '';
      if (c.includes(`${myName}님이 회의에서 나갔습니다`)) leaveCount++;
      else if (c.includes(`${myName}님이 회의에 다시 입장했습니다`)) rejoinCount++;
    }
    if (leaveCount > rejoinCount) {
      sendMessage(`${myName}님이 회의에 다시 입장했습니다.`, {
        agendaId: currentAgenda?.id,
        isAi: true,
        aiType: 'system',
        aiEmployee: 'system',
      }).catch((err) => {
        console.warn('[rejoin] 시스템 메시지 전송 실패:', err);
        rejoinCheckedRef.current = false;
      });
    }
  }, [messages, user, meeting, sendMessage, currentAgenda]);

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


  // 참가자(비요청자) — 회의 나가기. 확인 창 없이 즉시 퇴장.
  //   1) 채팅에 "{이름}님이 회의에서 나갔습니다." 시스템 공지 전송
  //   2) 회의 상태 변경 없음 (요청자가 계속 진행 가능)
  //   3) 회의록은 요청자가 종료 시 생성 (기존 handleConfirmEnd 흐름)
  const handleLeaveMeeting = async () => {
    const leaverName = user?.name || '참가자';
    try {
      await sendMessage(`${leaverName}님이 회의에서 나갔습니다.`, {
        agendaId: currentAgenda?.id,
        isAi: true,
        aiType: 'system',
        aiEmployee: 'system',
      });
    } catch (err) {
      console.warn('[handleLeaveMeeting] 시스템 메시지 전송 실패:', err);
    }
    setActiveMeetingId(null);
    setLeavingConfirmed(true);
    clearSessionState(id);
    navigate('/');
  };

  const handleSend = async (content, opts = {}) => {
    // 화면 공유 활성 시 메타데이터에 발표 컨텍스트 자동 첨부
    //   → 회의록 요약/AI 분석 시 "○○ 발표 중에 나눈 대화" 로 그룹핑 가능
    //   - presenter   : 현재 발표자 identity (LiveKit 식별자 = users.id)
    //   - presenters  : 다중 발표자 케이스 대비 식별자 배열
    //   - presenter_name : 표시용 이름
    let mergedMeta = opts.metadata || null;
    try {
      const shares = lk.screenShares;
      if (shares && shares.size > 0) {
        const presenters = [];
        let firstName = null;
        shares.forEach((v) => {
          if (v?.videoTrack && v?.identity) {
            presenters.push(v.identity);
            if (!firstName) firstName = v.name || null;
          }
        });
        if (presenters.length > 0) {
          mergedMeta = {
            ...(mergedMeta || {}),
            during_screen_share: {
              presenters,
              presenter: presenters[0],
              presenter_name: firstName,
              ts: Date.now(),
            },
          };
        }
      }
    } catch {}
    await sendMessage(content, {
      agendaId: currentAgenda?.id,
      metadata: mergedMeta,
    });
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
              <X size={18} />
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

      {/* ═══ 헤더 ═══ — 한 줄. 모바일은 모든 액션을 32px 아이콘 버튼으로 통일해 컴팩트하게 */}
      <div className="flex items-center justify-between px-2.5 md:px-6 py-2 md:py-4 gap-2 md:gap-3 border-b border-border-divider">
        {/* 좌측: 메뉴/닫기 + 제목 + 상태 dot */}
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0 flex-1">
          {/* 모바일 햄버거 — 사이드바 드로어 토글 */}
          <button
            onClick={() => setSidebarOpen?.(true)}
            className="md:hidden inline-flex items-center justify-center w-8 h-8 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors shrink-0"
            aria-label="메뉴 열기"
            title="메뉴"
          >
            <Menu size={18} />
          </button>
          <button
            onClick={() => safeNavigate('/meetings')}
            className="hidden md:inline-flex p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors shrink-0"
            aria-label="회의 목록으로"
            title="회의 목록"
          >
            <X size={18} />
          </button>
          <h1 className="text-[14px] md:text-[22px] font-medium text-txt-primary tracking-tight truncate min-w-0">
            {meeting.title}
          </h1>
          {meeting.status === 'active' && (
            <>
              {/* 모바일: 작은 dot 만 */}
              <span
                className="md:hidden shrink-0 w-2 h-2 rounded-full bg-status-error pulse-dot"
                title="진행 중"
              />
              {/* 데스크톱: dot + "진행 중" 텍스트 — 제목과 충분히 떨어뜨려 가독성 ↑ */}
              <span className="hidden md:inline-flex items-center gap-1.5 shrink-0 md:ml-4">
                <span className="w-2.5 h-2.5 rounded-full bg-status-error pulse-dot" />
                <span className="text-[11px] font-semibold text-status-success">진행 중</span>
              </span>
            </>
          )}
          {/* AI 자동 개입 토글 (데스크톱) — 진행중 우측에 충분한 간격 */}
          <div className="hidden md:flex items-center gap-2 ml-6 shrink-0">
            <span className={`text-[11px] font-medium ${canToggleAutoIntervene ? 'text-txt-muted' : 'text-txt-muted/60'}`}>AI 자동 개입</span>
            <button
              onClick={() => canToggleAutoIntervene && setAiAutoIntervene((v) => !v)}
              disabled={!canToggleAutoIntervene}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                aiAutoIntervene ? 'bg-brand-purple' : 'bg-bg-tertiary border border-border-default'
              } ${canToggleAutoIntervene ? '' : 'opacity-50 cursor-not-allowed'}`}
              title={
                canToggleAutoIntervene
                  ? (aiAutoIntervene ? 'AI 자동 개입 ON' : 'AI 직접 호출만')
                  : '회의 요청자 또는 관리자만 변경할 수 있습니다'
              }
            >
              <span className={`absolute top-1/2 -translate-y-1/2 ${aiAutoIntervene ? 'left-[18px]' : 'left-[3px]'} w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm`} />
            </button>
          </div>
        </div>

        {/* 우측 액션: 모바일 = 아이콘 전용 32px, 데스크톱 = 라벨 동반 */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* LiveKit 음성 회의 참여/나가기 — 회의방 안에 있으면 항상 노출 (완료 회의 제외)
              모바일은 아이콘 전용, 데스크톱은 라벨 포함 */}
          {meeting.status !== 'completed' && (
            <>
              <div className="md:hidden">
                <VoiceJoinButton
                  connected={lk.connected}
                  connecting={lk.connecting}
                  error={lk.error}
                  participantCount={lk.participants.length}
                  onJoin={handleVoiceJoinClick}
                  onLeave={lk.leave}
                  iconOnly
                />
              </div>
              <div className="hidden md:block">
                <VoiceJoinButton
                  connected={lk.connected}
                  connecting={lk.connecting}
                  error={lk.error}
                  participantCount={lk.participants.length}
                  onJoin={handleVoiceJoinClick}
                  onLeave={lk.leave}
                  size="sm"
                />
              </div>
              {/* 화면 공유 버튼 — LiveKit 연결 시에만 사용 가능 (모바일은 아이콘 전용) */}
              <div className="md:hidden">
                <ScreenShareButton
                  connected={lk.connected}
                  sharing={lk.localScreenSharing}
                  supported={lk.screenShareSupported}
                  onStart={lk.startScreenShare}
                  onStop={lk.stopScreenShare}
                  iconOnly
                />
              </div>
              <div className="hidden md:block">
                <ScreenShareButton
                  connected={lk.connected}
                  sharing={lk.localScreenSharing}
                  supported={lk.screenShareSupported}
                  onStart={lk.startScreenShare}
                  onStop={lk.stopScreenShare}
                  size="sm"
                />
              </div>
            </>
          )}

          {/* 모바일 자료 버튼 — 32×32 아이콘 + 카운트 뱃지 */}
          <button
            onClick={() => setMobileDocOpen(true)}
            className="md:hidden inline-flex items-center justify-center w-8 h-8 relative rounded-md text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
            aria-label="자료 보기"
            title="자료"
          >
            <FolderOpen size={16} />
            {meetingFiles.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-brand-purple leading-none">
                {meetingFiles.length}
              </span>
            )}
          </button>

          {/* 모바일 자동개입 — 32×32 아이콘 (Zap/ZapOff) */}
          <button
            onClick={() => canToggleAutoIntervene && setAiAutoIntervene((v) => !v)}
            disabled={!canToggleAutoIntervene}
            className={`md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              aiAutoIntervene
                ? 'text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/15'
                : 'text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary'
            } ${canToggleAutoIntervene ? '' : 'opacity-50 cursor-not-allowed'}`}
            title={
              canToggleAutoIntervene
                ? (aiAutoIntervene ? 'AI 자동 개입 ON' : 'AI 직접 호출만')
                : '회의 요청자 또는 관리자만 변경할 수 있습니다'
            }
          >
            {aiAutoIntervene ? <Zap size={16} /> : <ZapOff size={16} />}
          </button>

          {/* 회의 종료 / 나가기 — 모바일 아이콘 전용, 데스크톱 라벨 포함 */}
          {isCreator ? (
            <button
              onClick={handleEndClick}
              className="inline-flex items-center justify-center md:gap-2 w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-sm font-medium hover:bg-status-error/20 transition-colors"
              title="회의를 종료하고 회의록을 생성합니다"
            >
              <Square size={16} strokeWidth={2.4} />
              <span className="hidden md:inline">회의 종료</span>
            </button>
          ) : (
            <button
              onClick={handleLeaveMeeting}
              className="inline-flex items-center justify-center md:gap-2 w-8 h-8 md:w-auto md:h-auto md:px-4 md:py-2 rounded-md bg-bg-tertiary border border-border-default text-txt-secondary text-sm font-medium hover:text-txt-primary hover:border-border-focus transition-colors"
              title="회의에서 나갑니다 (회의는 계속 진행)"
            >
              <LogOut size={16} strokeWidth={2.4} />
              <span className="hidden md:inline">나가기</span>
            </button>
          )}
        </div>
      </div>

      {/* 어젠다 바 */}
      <AgendaBar agendas={meeting.agendas || []} activeId={currentAgenda?.id} onSelect={setActiveAgendaId} />

      {/* LiveKit 음성 회의 활성 시 — 참가자 그리드 + 모드 라디오 패널.
          발표 집중 모드일 땐 숨김 (화면 공유에 더 많은 공간 확보). */}
      {lk.connected && !presentationFocusMode && (
        <VoicePanel
          participants={lk.participants}
          activeSpeakers={lk.activeSpeakers}
          muted={lk.muted}
          currentUserId={user?.id}
          voiceMode={lk.voiceMode}
          onChangeVoiceMode={lk.setVoiceMode}
          pttPressed={lk.pttPressed}
        />
      )}

      {/* 음성 참여 첫 클릭 시 안내 모달 */}
      {voiceIntroOpen && (
        <VoiceJoinIntroModal
          onConfirm={handleVoiceIntroConfirm}
          onCancel={() => setVoiceIntroOpen(false)}
        />
      )}

      {/* 다른 참가자가 화면 공유 시작 → 합류 여부 확인 모달 */}
      {shareInvite && (
        <ScreenShareInviteModal
          presenterName={shareInvite.presenterName}
          onAccept={handleShareInviteAccept}
          onDecline={handleShareInviteDecline}
        />
      )}

      {/* ═══ 메인: 자료 패널 + 채팅 ═══
          ※ 안전 정책: DocumentPanel/ChatArea는 항상 마운트. 화면 공유 활성 시
            ScreenShareView를 absolute overlay로 그 위에 덮어 표시 (자료 패널 자리만,
            채팅 영역은 비워둠 → 채팅 그대로 사용 가능). 어떤 이유로든 ScreenShareView
            가 null/빈 결과를 반환해도 DocumentPanel이 그대로 보이므로 빈 화면 없음. */}
      {(() => {
        // 실제로 videoTrack이 있는 발표자가 1명 이상일 때만 화면 공유 active.
        let hasActiveVideo = false;
        if (lk.screenShares && lk.screenShares.size > 0) {
          for (const v of lk.screenShares.values()) {
            if (v?.videoTrack) { hasActiveVideo = true; break; }
          }
        }
        const screenShareActive = hasActiveVideo && !screenShareHidden;
        // 발표자 본인 시점 — ScreenShareView 안에 채팅을 임베드하기 위해 외부 채팅 영역은 숨김
        const isPresentingMyself = screenShareActive && !!lk.localScreenSharing;
        // 채팅 폭 결정 (발표 집중 모드와 무관하게 채팅은 항상 표시):
        //   - 발표자 본인: 외부 영역 숨김 (채팅은 ScreenShareView 안으로 portal)
        //   - 화면 공유 중(viewer): 380px 축소 + ml-auto (DocumentPanel collapsed 시 위치 정렬)
        //   - 화면 공유 비활성: 일반 채팅 영역 (flex-1)
        const chatWrapClass = isPresentingMyself
          ? 'hidden'  // 발표자 본인: portal 로 ScreenShareView 안으로 이동
          : screenShareActive
            ? 'shrink-0 w-[340px] md:w-[380px] flex flex-col min-h-0 min-w-0 border-l border-border-subtle ml-auto'
            : 'flex-1 flex flex-col min-h-0 min-w-0';
        return (
          <div className="flex flex-1 overflow-hidden relative">
            {/* 자료 패널 — 항상 마운트 */}
            <DocumentPanel
              files={meetingFiles}
              getUrl={getMeetingFileUrl}
              meetingId={id}
              messages={messages}
              onViewerChange={setMaterialViewerActive}
              mobileOpen={mobileDocOpen}
              onMobileClose={() => setMobileDocOpen(false)}
              currentUserId={user?.id}
              isAdmin={user?.role === 'admin'}
              meetingCreatedBy={meeting?.created_by}
              onDeleteFile={handleDeleteFile}
            />

            {/* 채팅 영역 — 항상 마운트, 화면 공유 시에만 폭 축소.
                발표자 본인 시점일 땐 hidden (아래 ScreenShareView 안으로 portal). */}
            <div ref={setDefaultChatHost} className={chatWrapClass} />

            {/* ChatArea 단일 인스턴스 — portal target 에 따라 위치만 바뀜
                (state/스크롤/입력/STT 보존). target 우선순위:
                  1) ScreenShareView 안 채팅 슬롯 (발표자 본인 시점일 때)
                  2) 외부 기본 위치 (defaultChatHost) */}
            {(embeddedChatHostInShare || defaultChatHost) && createPortal(
              <ChatArea
                messages={messages}
                onSend={handleSend}
                disabled={meeting.status === 'completed'}
                aiThinking={aiThinking}
                onFileUpload={handleFileUpload}
                onImportUrl={handleImportUrl}
                autoIntervene={aiAutoIntervene}
                aiError={aiError}
                voiceConnected={lk.connected}
                voiceMuted={lk.muted}
                onVoiceToggleMute={lk.toggleMute}
                voiceLocalStream={lk.localStream}
              />,
              (isPresentingMyself && embeddedChatHostInShare) ? embeddedChatHostInShare : defaultChatHost
            )}

            {/* 화면 공유 overlay — 발표자 본인은 채팅 임베드, viewer 는 우측 채팅 380px 유지 */}
            {screenShareActive && (
              <div className={`absolute top-0 bottom-0 left-0 z-20 flex flex-col bg-bg-primary ${
                isPresentingMyself
                  ? 'right-0'  // 발표자 본인: 채팅이 ScreenShareView 안으로 들어감
                  : 'right-[340px] md:right-[380px] border-r border-border-subtle'
              }`}>
                <ScreenShareView
                  inline
                  screenShares={lk.screenShares}
                  localIdentity={user?.id}
                  onStopLocal={lk.stopScreenShare}
                  onClose={() => setScreenShareHidden(true)}
                  meetingId={id}
                  messages={messages}
                  // following 은 DocumentPanel 스코프 안의 변수 — 안전상 false 고정 (이전 fix 유지)
                  following={false}
                  // 발표 집중 모드 토글 — 발표자 본인은 의미 없음(채팅은 어차피 임베드)
                  focusMode={presentationFocusMode}
                  onToggleFocusMode={isPresentingMyself ? undefined : () => setPresentationFocusMode((v) => !v)}
                  // 발표자 본인 시점일 때만 chat host 콜백 활성화 (다른 사람 발표일 땐 null)
                  onEmbeddedChatHost={isPresentingMyself ? setEmbeddedChatHostInShare : null}
                  // 멀티커서 sync 용 본인 정보 (id/name/color)
                  currentUser={user ? { id: user.id, name: user.name, color: user.avatar_color } : null}
                />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
