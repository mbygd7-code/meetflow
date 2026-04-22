import { useRef } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';

/**
 * 파일 첨부 버튼 (input[type=file] 래퍼)
 * - 다중 선택 기본 on
 * - 업로드 중엔 스피너
 */
export default function AttachButton({
  onPick,
  uploading = false,
  accept,
  multiple = true,
  size = 14,
  className = '',
  title = '파일 첨부',
  label,  // 있으면 아이콘 옆에 텍스트 표시
}) {
  const inputRef = useRef(null);

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await onPick(files);
    // 같은 파일 다시 선택 가능하게 리셋
    e.target.value = '';
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={
          className ||
          'p-1.5 rounded text-txt-muted hover:bg-bg-secondary hover:text-brand-purple transition-colors disabled:opacity-50'
        }
        title={title}
      >
        {uploading ? (
          <Loader2 size={size} className="animate-spin text-brand-purple" />
        ) : (
          <Paperclip size={size} />
        )}
        {label && <span>{label}</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept}
        onChange={handleChange}
      />
    </>
  );
}
