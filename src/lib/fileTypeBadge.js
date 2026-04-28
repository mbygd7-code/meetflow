// 파일 확장자/MIME → 컬러 뱃지 정보
//   카드 썸네일 placeholder 또는 우측 표식으로 사용.
//   디자인: PowerPoint = 주황, Word = 파랑, Excel = 초록, PDF = 빨강 (실제 앱 컬러 톤)

export function getFileTypeBadge(fileNameOrType) {
  const lower = String(fileNameOrType || '').toLowerCase();

  // PowerPoint
  if (/(\.|^)(pptx?|odp)$/.test(lower) || lower.includes('presentation'))
    return { label: 'PPT', color: '#D24726', bg: '#FFF1EE', textColor: '#FFFFFF' };
  // Word
  if (/(\.|^)(docx?|odt|rtf)$/.test(lower) || lower.includes('wordprocessing') || lower === 'application/msword')
    return { label: 'DOC', color: '#185ABD', bg: '#EAF2FB', textColor: '#FFFFFF' };
  // Excel
  if (/(\.|^)(xlsx?|ods|csv)$/.test(lower) || lower.includes('spreadsheet') || lower === 'application/vnd.ms-excel')
    return { label: 'XLS', color: '#107C41', bg: '#E8F5EE', textColor: '#FFFFFF' };
  // PDF
  if (/(\.|^)pdf$/.test(lower) || lower === 'application/pdf')
    return { label: 'PDF', color: '#D32F2F', bg: '#FFEBEE', textColor: '#FFFFFF' };
  // Image
  if (/^image\//.test(lower) || /(\.|^)(png|jpe?g|gif|webp|svg|bmp)$/.test(lower))
    return { label: 'IMG', color: '#723CEB', bg: '#F0EAFA', textColor: '#FFFFFF' };
  // Text / markdown
  if (/(\.|^)(txt|md)$/.test(lower) || lower === 'text/plain' || lower === 'text/markdown')
    return { label: 'TXT', color: '#6B6B6B', bg: '#F0F0F0', textColor: '#FFFFFF' };

  return { label: 'FILE', color: '#6B6B6B', bg: '#F0F0F0', textColor: '#FFFFFF' };
}

// 확장자 추출 (파일명 기반)
export function getFileExt(fileName) {
  const m = String(fileName || '').match(/\.([^.]+)$/);
  return m ? m[1].toUpperCase() : 'FILE';
}
