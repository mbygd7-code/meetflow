// PDF 내부 링크를 인앱 iframe에 안전하게 임베드하기 위한 URL 변환 유틸
//
// 알려진 호스트 패턴은 임베드 가능 형태로 자동 변환:
//   - Google Docs/Sheets/Slides: /edit → /preview (X-Frame-Options 우회)
//   - YouTube watch?v=ID → /embed/ID
//   - 직접 PDF/이미지 URL: 그대로 임베드 가능 (브라우저 네이티브)
//
// 모르는 호스트는 원본을 반환하되 embedSafe=false로 마킹 →
// 클라이언트가 onload 타임아웃을 짧게 두고 차단 시 폴백 UI 노출.
//
// 반환:
//   { url: string, embedSafe: boolean, original: string }
//   - url:        실제 iframe.src 에 넣을 주소
//   - embedSafe:  true=알려진 임베드 가능 호스트, false=시도해보지만 차단 가능
//   - original:   원본 href (폴백 "새 탭 열기" 버튼용)

const KNOWN_DIRECT_MEDIA_RE = /\.(pdf|png|jpe?g|gif|webp|svg)(\?|#|$)/i;

export function embeddableUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return { url: '', embedSafe: false, original: rawUrl || '' };
  }

  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { url: rawUrl, embedSafe: false, original: rawUrl };
  }

  if (!/^https?:$/.test(u.protocol)) {
    return { url: rawUrl, embedSafe: false, original: rawUrl };
  }

  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  // ── Google Docs/Sheets/Slides ──
  // 패턴: /document/d/ID/(edit|view|...)? → /document/d/ID/preview
  if (host === 'docs.google.com') {
    const m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
    if (m) {
      return {
        url: `https://docs.google.com/${m[1]}/d/${m[2]}/preview`,
        embedSafe: true,
        original: rawUrl,
      };
    }
    // /forms 등은 원본 (preview 미지원)
  }

  // Google Drive 파일 미리보기
  if (host === 'drive.google.com') {
    const m = path.match(/^\/file\/d\/([^/]+)/);
    if (m) {
      return {
        url: `https://drive.google.com/file/d/${m[1]}/preview`,
        embedSafe: true,
        original: rawUrl,
      };
    }
  }

  // ── YouTube ──
  if (host === 'www.youtube.com' || host === 'youtube.com') {
    if (path === '/watch') {
      const v = u.searchParams.get('v');
      if (v) {
        return {
          url: `https://www.youtube.com/embed/${v}`,
          embedSafe: true,
          original: rawUrl,
        };
      }
    }
    if (path.startsWith('/embed/')) {
      return { url: rawUrl, embedSafe: true, original: rawUrl };
    }
  }
  if (host === 'youtu.be') {
    const id = path.replace(/^\//, '').split(/[?#]/)[0];
    if (id) {
      return {
        url: `https://www.youtube.com/embed/${id}`,
        embedSafe: true,
        original: rawUrl,
      };
    }
  }

  // ── Vimeo ──
  if (host === 'vimeo.com') {
    const m = path.match(/^\/(\d+)$/);
    if (m) {
      return {
        url: `https://player.vimeo.com/video/${m[1]}`,
        embedSafe: true,
        original: rawUrl,
      };
    }
  }

  // ── 직접 미디어 (PDF/이미지) ──
  if (KNOWN_DIRECT_MEDIA_RE.test(path)) {
    return { url: rawUrl, embedSafe: true, original: rawUrl };
  }

  // ── 그 외: 원본 반환 + embedSafe=false (시도해보되 차단될 수 있음) ──
  return { url: rawUrl, embedSafe: false, original: rawUrl };
}

/** 호스트네임 추출 (제목 표시용) */
export function getHostnameForDisplay(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}
