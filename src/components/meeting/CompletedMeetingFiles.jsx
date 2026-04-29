// 완료 회의 뷰 전용 — 회의 자료 히스토리 + 저장된 드로잉 주석 확인
// MeetingRoom의 DocumentPanel은 편집 모드, 이 컴포넌트는 읽기 전용

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, FileText, Image as ImageIcon, X, Download, ChevronDown, ChevronUp, Loader2, Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';
import { useMeetingFiles } from '@/hooks/useMeetingFiles';
import DrawingOverlay from './DrawingOverlay';
import { Document as PdfDocument, Page as PdfPage } from 'react-pdf';
import { getFileTypeBadge } from '@/lib/fileTypeBadge';

function isImageFile(f) {
  return !!f?.type?.startsWith('image/');
}
function isPdfFile(f) {
  return f?.type === 'application/pdf';
}

// 파일 썸네일 — 이미지: 원본 / PDF: 첫 페이지 / 그 외: 아이콘
//   storage_path 기준 signed URL 을 1회 비동기 로드 후 캐시 (썸네일 클릭은 부모 onClick 으로 위임)
function FileThumb({ file, getDownloadUrl }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const isImg = isImageFile(file);
  const isPdf = isPdfFile(file);

  useEffect(() => {
    if (!isImg && !isPdf) return;
    if (!file?.storage_path || !getDownloadUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await getDownloadUrl(file.storage_path);
        if (!cancelled) setThumbUrl(url);
      } catch (e) {
        // 실패 시 아이콘 fallback
        if (!cancelled) setThumbUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [file?.storage_path, isImg, isPdf, getDownloadUrl]);

  // 이미지 — object-cover 로 정사각 썸네일
  if (isImg && thumbUrl) {
    return (
      <div className="w-10 h-10 rounded overflow-hidden bg-bg-tertiary shrink-0 ring-1 ring-border-subtle">
        <img
          src={thumbUrl}
          alt={file.name}
          loading="lazy"
          draggable={false}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // PDF — 첫 페이지를 mini render
  if (isPdf && thumbUrl) {
    return (
      <div className="w-10 h-10 rounded overflow-hidden bg-white shrink-0 ring-1 ring-border-subtle relative flex items-center justify-center">
        <PdfDocument
          file={thumbUrl}
          loading={<FileText size={16} className="text-status-error" />}
          error={<FileText size={16} className="text-status-error" />}
          noData={<FileText size={16} className="text-status-error" />}
        >
          <PdfPage
            pageNumber={1}
            width={40}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </PdfDocument>
        {/* PDF 표식 — 우상단 빨간 점 */}
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-status-error shadow-sm" />
      </div>
    );
  }

  // fallback — 컬러 뱃지 + 변환 중 오버레이
  const badge = getFileTypeBadge(file.name || file.type || '');
  const isConverting = !!file._converting;
  return (
    <div
      className="relative w-10 h-10 rounded shrink-0 ring-1 ring-border-subtle flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: badge.bg }}
    >
      <span
        className="px-1 py-0.5 rounded text-[8px] font-bold tracking-wide"
        style={{ backgroundColor: badge.color, color: badge.textColor }}
      >
        {badge.label}
      </span>
      {isConverting && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 size={14} className="text-white animate-spin" />
        </div>
      )}
    </div>
  );
}

// PDF 페이지 + 페이지별 드로잉 오버레이 (readOnly)
function PdfPageWithOverlay({ pageNumber, pageWidth, meetingId, fileId, messages, showAnnotations }) {
  const wrapRef = useRef(null);
  const [pageBox, setPageBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      const canvas = el.querySelector('canvas');
      if (canvas) setPageBox({ w: canvas.clientWidth, h: canvas.clientHeight });
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [pageWidth]);

  return (
    <div ref={wrapRef} className="relative shadow-md rounded overflow-hidden bg-white">
      <PdfPage
        pageNumber={pageNumber}
        width={pageWidth}
        renderAnnotationLayer={true}
        renderTextLayer={false}
        onRenderSuccess={() => {
          const canvas = wrapRef.current?.querySelector('canvas');
          if (canvas) setPageBox({ w: canvas.clientWidth, h: canvas.clientHeight });
        }}
      />
      {showAnnotations && pageBox.w > 0 && pageBox.h > 0 && (
        <DrawingOverlay
          targetKey={`doc:${fileId}:p${pageNumber}`}
          meetingId={meetingId}
          width={pageBox.w}
          height={pageBox.h}
          messages={messages}
          readOnly
        />
      )}
    </div>
  );
}

// 파일 뷰어 모달 — 이미지/PDF + 드로잉 오버레이 readOnly + 페이지별 메시지/드로잉
function FileViewerModal({ file, url, meetingId, messages = [], onClose }) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [bodySize, setBodySize] = useState({ w: 0, h: 0 });
  const [showAnnotations, setShowAnnotations] = useState(true); // 드로잉/태그 표시 토글
  const [zoom, setZoom] = useState(1);                          // 0.5 ~ 3.0
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setBodySize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isImage = isImageFile(file);
  const isPdf = isPdfFile(file);
  const fileKey = file.id || file.name;
  const imageTargetKey = `img:${fileKey}`;
  const fileId = fileKey;

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // Ctrl + 휠 줌 (PDF만)
  const handleWheel = (e) => {
    if (!isPdf) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => {
      const next = z + (e.deltaY < 0 ? 0.1 : -0.1);
      return Math.min(3, Math.max(0.5, Math.round(next * 10) / 10));
    });
  };

  const baseFitWidth = Math.min((bodySize.w || 800) - 32, 800);
  const pageWidth = Math.max(200, Math.round(baseFitWidth * zoom));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-[min(90vw,1000px)] h-[min(85vh,900px)] bg-bg-secondary border border-border-default rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-divider shrink-0">
          <FileText size={16} className="text-txt-muted shrink-0" />
          <p className="text-sm font-medium text-txt-primary truncate flex-1">{file.name}</p>
          <span className="text-[10px] text-txt-muted px-2 py-0.5 rounded border border-border-subtle">
            읽기 전용 · 저장된 드로잉 포함
          </span>
          {/* 드로잉/태그 표시 토글 */}
          <button
            onClick={() => setShowAnnotations((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-bg-tertiary text-txt-secondary hover:text-txt-primary transition-colors"
            title={showAnnotations ? '드로잉/태그 숨기기' : '드로잉/태그 보기'}
          >
            {showAnnotations ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden sm:inline">{showAnnotations ? '주석 숨기기' : '주석 보기'}</span>
          </button>
          {/* PDF 전용: 줌 컨트롤 */}
          {isPdf && (
            <div className="inline-flex items-center gap-0.5 ml-1">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
                className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded"
                title="축소"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-[10px] text-txt-muted tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10))}
                className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded"
                title="확대 (Ctrl+휠)"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
          {url && (
            <a
              href={url}
              download={file.name}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-brand-purple hover:underline"
            >
              <Download size={14} /> 다운로드
            </a>
          )}
          <button
            onClick={onClose}
            className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 바디 */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          className="flex-1 min-h-0 relative bg-bg-tertiary/30 overflow-auto flex items-start justify-center p-4"
        >
          {isImage && url && (
            <div className="relative">
              <img
                ref={imageRef}
                src={url}
                alt={file.name}
                draggable={false}
                onLoad={(e) => setImgSize({ w: e.target.clientWidth, h: e.target.clientHeight })}
                className="select-none pointer-events-none max-w-full max-h-[80vh] object-contain rounded-md shadow-md block"
              />
              {imgSize.w > 0 && showAnnotations && (
                <DrawingOverlay
                  targetKey={imageTargetKey}
                  meetingId={meetingId}
                  width={imgSize.w}
                  height={imgSize.h}
                  messages={messages}
                  readOnly
                />
              )}
            </div>
          )}

          {isPdf && url && (
            <div className="w-full flex flex-col items-center gap-3">
              <PdfDocument
                file={url}
                onLoadSuccess={(p) => setNumPages(p.numPages)}
                loading={<div className="text-xs text-txt-muted py-8">PDF 로딩 중...</div>}
                error={<div className="text-xs text-status-error py-8">PDF 로드 실패</div>}
                externalLinkTarget="_blank"
                externalLinkRel="noopener noreferrer"
              >
                {numPages > 0 && Array.from({ length: numPages }, (_, idx) => {
                  const pageNumber = idx + 1;
                  return (
                    <PdfPageWithOverlay
                      key={`page-${pageNumber}`}
                      pageNumber={pageNumber}
                      pageWidth={pageWidth}
                      meetingId={meetingId}
                      fileId={fileId}
                      messages={messages}
                      showAnnotations={showAnnotations}
                    />
                  );
                })}
              </PdfDocument>
              <p className="text-[10px] text-txt-muted pb-4">
                Ctrl + 휠로 확대/축소 · 총 {numPages}페이지
              </p>
            </div>
          )}

          {!isImage && !isPdf && (
            <div className="flex flex-col items-center gap-3 text-txt-muted">
              <FileText size={48} strokeWidth={1.3} />
              <p className="text-sm">{file.name}</p>
              {url && (
                <a
                  href={url}
                  download={file.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-purple hover:underline"
                >
                  파일 다운로드
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CompletedMeetingFiles({ meetingId, messages = [] }) {
  const { files, getDownloadUrl } = useMeetingFiles(meetingId);
  const [expanded, setExpanded] = useState(false);
  const [openFile, setOpenFile] = useState(null);
  const [openUrl, setOpenUrl] = useState(null);

  // 파일이 있으면 자동 펼침 (3개 이하)
  useEffect(() => {
    if (files.length > 0 && files.length <= 3) setExpanded(true);
  }, [files.length]);

  if (files.length === 0) return null;

  const handleOpen = async (file) => {
    const url = file.storage_path ? await getDownloadUrl(file.storage_path) : null;
    setOpenFile(file);
    setOpenUrl(url);
  };

  return (
    <>
      <div className="border-b border-border-divider bg-bg-secondary/30">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-2.5 px-3 md:px-6 py-2.5 hover:bg-bg-tertiary/40 transition-colors"
        >
          <div className="w-7 h-7 rounded-md bg-brand-purple/15 flex items-center justify-center shrink-0">
            <FolderOpen size={16} className="text-brand-purple" strokeWidth={2.4} />
          </div>
          <div className="flex items-center gap-2.5 flex-1 text-left">
            <span className="text-sm font-semibold text-txt-primary">자료 · 드로잉 히스토리</span>
            <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-brand-purple/10 border border-brand-purple/20">
              <span className="text-xl md:text-2xl font-bold text-brand-purple leading-none">
                {files.length}
              </span>
              <span className="text-[10px] font-medium text-brand-purple/80">개</span>
            </span>
            <span className="text-xs text-txt-muted hidden sm:inline">
              저장된 주석/드로잉이 함께 표시됩니다
            </span>
          </div>
          <span className="text-txt-muted shrink-0">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {expanded && (
          <div className="px-3 md:px-6 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {files.map((f) => {
                const isImg = isImageFile(f);
                const isPdf = isPdfFile(f);
                return (
                  <button
                    key={f.id}
                    onClick={() => handleOpen(f)}
                    className="flex items-center gap-2 p-2.5 rounded-md bg-bg-tertiary/50 border border-border-subtle hover:border-brand-purple/40 hover:bg-brand-purple/5 transition-colors text-left group/fi"
                  >
                    <FileThumb file={f} getDownloadUrl={getDownloadUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-txt-primary truncate group-hover/fi:text-brand-purple">
                        {f.name}
                      </p>
                      <p className="text-[9px] text-txt-muted">
                        {f.size ? `${(f.size / 1024).toFixed(0)}KB` : ''}
                        {isImg && ' · 이미지'}
                        {isPdf && ' · PDF'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 파일 뷰어 모달 */}
      {openFile && (
        <FileViewerModal
          file={openFile}
          url={openUrl}
          meetingId={meetingId}
          messages={messages}
          onClose={() => { setOpenFile(null); setOpenUrl(null); }}
        />
      )}
    </>
  );
}
