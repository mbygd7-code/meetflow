// 완료 회의 뷰 전용 — 회의 자료 히스토리 + 저장된 드로잉 주석 확인
// MeetingRoom의 DocumentPanel은 편집 모드, 이 컴포넌트는 읽기 전용

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, FileText, Image as ImageIcon, X, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { useMeetingFiles } from '@/hooks/useMeetingFiles';
import DrawingOverlay from './DrawingOverlay';
import { Document as PdfDocument, Page as PdfPage } from 'react-pdf';

function isImageFile(f) {
  return !!f?.type?.startsWith('image/');
}
function isPdfFile(f) {
  return f?.type === 'application/pdf';
}

// 파일 뷰어 모달 — 이미지/PDF + 드로잉 오버레이 readOnly
function FileViewerModal({ file, url, meetingId, onClose }) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [bodySize, setBodySize] = useState({ w: 0, h: 0 });

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
  const targetKey = isImage ? `img:${file.id || file.name}` : `doc:${file.id || file.name}`;

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

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
          className="flex-1 min-h-0 relative bg-bg-tertiary/30 overflow-auto flex items-center justify-center p-4"
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
              {imgSize.w > 0 && (
                <DrawingOverlay
                  targetKey={targetKey}
                  meetingId={meetingId}
                  width={imgSize.w}
                  height={imgSize.h}
                  readOnly
                />
              )}
            </div>
          )}

          {isPdf && url && (
            <div className="relative w-full h-full flex flex-col items-center overflow-auto">
              <PdfDocument
                file={url}
                loading={<div className="text-xs text-txt-muted py-8">PDF 로딩 중...</div>}
                error={<div className="text-xs text-status-error py-8">PDF 로드 실패</div>}
              >
                <PdfPage
                  pageNumber={1}
                  width={Math.min(bodySize.w - 32, 800)}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </PdfDocument>
              {bodySize.w > 0 && bodySize.h > 0 && (
                <DrawingOverlay
                  targetKey={targetKey}
                  meetingId={meetingId}
                  width={bodySize.w}
                  height={bodySize.h}
                  readOnly
                />
              )}
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

export default function CompletedMeetingFiles({ meetingId }) {
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
                    <div className="w-8 h-8 rounded bg-bg-tertiary flex items-center justify-center shrink-0">
                      {isImg ? (
                        <ImageIcon size={16} className="text-brand-purple" />
                      ) : isPdf ? (
                        <FileText size={16} className="text-status-error" />
                      ) : (
                        <FileText size={16} className="text-txt-muted" />
                      )}
                    </div>
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
          onClose={() => { setOpenFile(null); setOpenUrl(null); }}
        />
      )}
    </>
  );
}
