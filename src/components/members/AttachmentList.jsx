import { Paperclip, X, FileText, Download, Image as ImageIcon, File } from 'lucide-react';
import { formatBytes, isImage } from '@/hooks/useFileAttach';

/**
 * 첨부파일 표시 목록
 * - 이미지: 썸네일 그리드
 * - 기타: 파일 칩 (아이콘 + 이름 + 크기 + 다운로드)
 * - onRemove 있으면 X 버튼으로 제거 가능 (편집 모드)
 */
export default function AttachmentList({ attachments = [], onRemove, compact = false }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => isImage(a.type));
  const files = attachments.filter((a) => !isImage(a.type));

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {/* 이미지 그리드 */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((att) => (
            <ImageThumb key={att.path} att={att} onRemove={onRemove} />
          ))}
        </div>
      )}

      {/* 일반 파일 칩 */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((att) => (
            <FileChip key={att.path} att={att} onRemove={onRemove} compact={compact} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageThumb({ att, onRemove }) {
  return (
    <div className="relative group rounded-md overflow-hidden border border-border-subtle bg-bg-tertiary aspect-square">
      <a href={att.url} target="_blank" rel="noreferrer" className="block w-full h-full">
        <img
          src={att.url}
          alt={att.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </a>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-6 pb-1 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[9px] text-white truncate" title={att.name}>{att.name}</p>
      </div>
      {onRemove && (
        <button
          onClick={() => onRemove(att)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-status-error transition-colors opacity-0 group-hover:opacity-100"
          title="제거"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function FileChip({ att, onRemove, compact }) {
  const Icon = getFileIcon(att.type, att.name);
  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-bg-tertiary border border-border-subtle rounded-md group hover:border-brand-purple/40 transition-colors max-w-full ${
        compact ? 'px-1.5 py-1' : 'px-2 py-1.5'
      }`}
    >
      <Icon size={compact ? 11 : 12} className="text-brand-purple shrink-0" />
      <a
        href={att.url}
        target="_blank"
        rel="noreferrer"
        download={att.name}
        className="min-w-0 flex-1 flex items-center gap-1.5 text-[11px] text-txt-primary hover:text-brand-purple transition-colors"
        title={`${att.name} (${formatBytes(att.size)})`}
      >
        <span className="truncate max-w-[160px]">{att.name}</span>
        <span className="text-[9px] text-txt-muted tabular-nums shrink-0">{formatBytes(att.size)}</span>
      </a>
      <a
        href={att.url}
        target="_blank"
        rel="noreferrer"
        download={att.name}
        className="shrink-0 p-0.5 rounded text-txt-muted hover:text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity"
        title="다운로드"
      >
        <Download size={10} />
      </a>
      {onRemove && (
        <button
          onClick={() => onRemove(att)}
          className="shrink-0 p-0.5 rounded text-txt-muted hover:text-status-error transition-colors"
          title="제거"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function getFileIcon(type = '', name = '') {
  if (isImage(type)) return ImageIcon;
  if (/\.(pdf)$/i.test(name) || type.includes('pdf')) return FileText;
  if (/\.(doc|docx|txt|md|rtf)$/i.test(name)) return FileText;
  return File;
}
