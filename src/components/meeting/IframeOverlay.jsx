// PDF 내부 링크 클릭 시 인앱 풀스크린 iframe 뷰어
// — 라이브 ON 참가자 전체 동기화 가능 (broadcast는 부모가 처리, 본 컴포넌트는 표시만)
// — 임베딩 차단 사이트(X-Frame-Options) 폴백: 2.5초 내 onload 미발화 시 차단 안내 + 새 탭 버튼

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { getHostnameForDisplay } from '@/lib/embeddableUrl';

const EMBED_TIMEOUT_MS = 2500;

export default function IframeOverlay({
  url,             // 변환된(임베드용) URL
  original,        // 원본 href (새 탭 열기용)
  embedSafe = false, // true 면 onload 타임아웃 검사 스킵 (알려진 호스트라 신뢰)
  title,           // 상단 바 제목 (없으면 hostname 자동)
  onClose,
  openerName,      // "누가 열었는지" 표시 (라이브 동기화 시 다른 사용자가 연 경우)
}) {
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef(null);

  const displayTitle = title || getHostnameForDisplay(url);

  // 차단 감지: embedSafe=false 인 경우만, 일정 시간 내 onload 안 오면 차단으로 판정
  // (cross-origin iframe의 로드 실패는 표준적으로 감지 불가 — 시간 기반 휴리스틱이 최선)
  useEffect(() => {
    if (embedSafe) return; // 알려진 호스트는 신뢰
    if (loaded) return;
    const t = setTimeout(() => {
      // 타임아웃 시점에도 onload 안 떴으면 차단 가능성으로 간주
      setBlocked(true);
    }, EMBED_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [embedSafe, loaded]);

  // ESC 닫기
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col">
      {/* 상단 바 */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-bg-secondary/90 border-b border-border-subtle">
        <ExternalLink size={14} className="text-brand-purple shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-txt-primary truncate">{displayTitle}</p>
          {openerName && (
            <p className="text-[10px] text-txt-muted">@{openerName}님이 공유</p>
          )}
        </div>
        <a
          href={original || url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-txt-secondary hover:text-brand-purple hover:bg-brand-purple/10 transition-colors"
          title="원본 새 탭으로 열기"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
          새 탭으로
        </a>
        <button
          onClick={onClose}
          className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
          title="닫기 (Esc)"
          aria-label="iframe 뷰어 닫기"
        >
          <X size={18} />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 relative bg-white">
        {!loaded && !blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-txt-muted">
            <Loader2 size={28} className="animate-spin text-brand-purple" />
            <p className="text-xs">불러오는 중…</p>
          </div>
        )}

        {blocked ? (
          <BlockedFallback original={original || url} />
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            title={displayTitle}
            // 표준 안전 sandbox — 스크립트/폼/팝업/same-origin 허용 (Google Docs 동작 위해)
            //   allow-top-navigation 미부여 → 부모 앱 강제 이동 차단
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            // 기능 정책: 카메라/마이크 등 민감 권한 모두 차단
            allow="autoplay; fullscreen; picture-in-picture"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0"
            onLoad={() => setLoaded(true)}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

function BlockedFallback({ original }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center bg-bg-content">
      <div className="w-16 h-16 rounded-full bg-status-warning/10 flex items-center justify-center">
        <AlertTriangle size={28} className="text-status-warning" />
      </div>
      <div className="space-y-1.5 max-w-md">
        <p className="text-base font-semibold text-txt-primary">이 페이지는 회의방 안에 표시할 수 없어요</p>
        <p className="text-xs text-txt-secondary leading-relaxed">
          외부 사이트가 임베드를 차단하고 있습니다 (X-Frame-Options).
          <br />
          새 탭으로 열어 확인하세요.
        </p>
      </div>
      <a
        href={original}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <ExternalLink size={15} />
        새 탭으로 열기
      </a>
      <p className="text-[10px] text-txt-muted break-all max-w-md">{original}</p>
    </div>
  );
}
