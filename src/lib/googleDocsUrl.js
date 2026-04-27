// Google Docs/Sheets/Slides URL 파싱 + PDF export URL 생성 유틸
//
// 지원 패턴:
//   https://docs.google.com/document/d/{ID}/edit?usp=sharing
//   https://docs.google.com/spreadsheets/d/{ID}/edit?usp=sharing
//   https://docs.google.com/presentation/d/{ID}/edit?usp=sharing
//
// "링크가 있는 모든 사용자에게 보기 권한"이 부여된 문서면 export?format=pdf 로 PDF 다운로드 가능.

const PATTERN = /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/;

const KIND_BY_PATH = {
  document: 'google_docs',
  spreadsheets: 'google_sheets',
  presentation: 'google_slides',
};

const LABEL_BY_KIND = {
  google_docs: 'Google Docs',
  google_sheets: 'Google Sheets',
  google_slides: 'Google Slides',
};

const COLOR_BY_KIND = {
  // Google 브랜드 컬러 — UI 뱃지/아이콘 배경
  google_docs: '#4285F4',   // 파랑
  google_sheets: '#0F9D58', // 초록
  google_slides: '#F4B400', // 노랑
};

/**
 * Google Docs/Sheets/Slides URL을 파싱.
 * @param {string} url
 * @returns {{ kind, id, exportUrl, viewUrl, label, color } | null}
 */
export function parseGoogleDocsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let trimmed = url.trim();
  // URL 객체로 1차 검증
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/(^|\.)docs\.google\.com$/.test(parsed.hostname)) return null;

  const m = trimmed.match(PATTERN);
  if (!m) return null;
  const path = m[1];          // 'document' | 'spreadsheets' | 'presentation'
  const id = m[2];
  const kind = KIND_BY_PATH[path];
  if (!kind) return null;

  return {
    kind,
    id,
    path,
    exportUrl: `https://docs.google.com/${path}/d/${id}/export?format=pdf`,
    viewUrl: `https://docs.google.com/${path}/d/${id}/view`,
    editUrl: `https://docs.google.com/${path}/d/${id}/edit`,
    label: LABEL_BY_KIND[kind],
    color: COLOR_BY_KIND[kind],
  };
}

/**
 * URL이 Google 클라우드 문서인지 가벼운 확인 (UI 미리보기용).
 */
export function isGoogleDocsUrl(url) {
  return parseGoogleDocsUrl(url) !== null;
}

/**
 * source_kind에 대응하는 표시 라벨/컬러 (DocumentPanel 뱃지에서 사용).
 */
export function getSourceMeta(sourceKind) {
  if (!sourceKind) return null;
  return {
    kind: sourceKind,
    label: LABEL_BY_KIND[sourceKind] || sourceKind,
    color: COLOR_BY_KIND[sourceKind] || '#6B6B6B',
  };
}
