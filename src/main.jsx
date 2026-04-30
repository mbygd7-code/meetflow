import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// react-pdf 워커가 컴포넌트 언마운트 시 "Worker was terminated"를 unhandled로 던짐.
// 사용자 경험에는 영향 없는 정상 동작이므로 console만 정리.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message || e?.reason || '');
  if (msg.includes('Worker was terminated') || msg.includes('Transport destroyed')) {
    e.preventDefault();
  }
});

// iOS Safari viewport 높이 보정
//   100vh / 100dvh 가 첫 로드 시 URL 바 영역을 잘못 포함하는 케이스 회피.
//   visualViewport.height 를 직접 측정해 --app-h CSS 변수로 주입.
//   Layout 루트가 height: var(--app-h) 로 이를 사용 → 항상 visible viewport 와 정확히 일치.
(function initVhVar() {
  const setVh = () => {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${h}px`);
  };
  setVh();
  window.addEventListener('resize', setVh);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVh);
    window.visualViewport.addEventListener('scroll', setVh);
  }
  window.addEventListener('orientationchange', () => setTimeout(setVh, 100));
  window.addEventListener('load', setVh);
})();

// react-pdf worker termination 무해 에러 silent 처리
//   PDF 썸네일이 빠르게 마운트/언마운트할 때 PDF.js worker 가 강제 종료되며 발생.
//   기능엔 영향 없지만 콘솔이 지저분해 사용자가 진짜 에러를 못 보게 됨.
//   "Worker was terminated" 메시지만 정확히 매칭해서 silent.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message || e.reason || '');
  if (msg.includes('Worker was terminated')) {
    e.preventDefault(); // 콘솔 출력 차단
  }
});

// iOS Safari layout viewport 강제 스크롤 차단
//   input 포커스 시 iOS 가 layout viewport(html) 를 위로 스크롤해서 focused 요소를
//   상단으로 끌어올리는 동작이 있음. body{overflow:hidden} 만으로는 못 막아
//   document 자체 스크롤이 발생하면 즉시 0 으로 되돌림.
//   ⚠️ 이벤트 타깃이 document/window 인 경우만 처리 — 내부 스크롤 컨테이너의 scroll
//   이벤트는 캡처 단계로 올라오지 않도록 listener 단계 비-캡처. capture:false 가 기본.
(function preventDocumentScroll() {
  const reset = () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
  };
  // window 의 scroll 이벤트는 page 자체 스크롤일 때만 발화 (자식 컨테이너 scroll 은
  // 기본적으로 bubbling 안 됨 — capture:false 면 안전).
  window.addEventListener('scroll', reset, { passive: true });
})();

// 모든 줌(핀치줌, input 포커스 확대 등) 감지 → 액션 없으면 2초 후 부드럽게 리셋
(function initZoomReset() {
  if (!window.visualViewport) return;

  let zoomTimer = null;
  let isZoomed = false;
  let overlay = null;

  // 페이드 오버레이 생성 (한 번만)
  const getOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '99999',
      background: 'var(--bg-primary, #E4DFD5)',
      opacity: '0', pointerEvents: 'none',
      transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(overlay);
    return overlay;
  };

  const resetZoom = () => {
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) return;

    const el = getOverlay();
    // 1) 페이드 인
    el.style.opacity = '1';

    setTimeout(() => {
      // 2) 줌 리셋 (오버레이가 가리는 동안)
      vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover');

      setTimeout(() => {
        vp.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
        // 3) 페이드 아웃
        el.style.opacity = '0';
        isZoomed = false;
      }, 50);
    }, 300);
  };

  const scheduleReset = () => {
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(resetZoom, 2000);
  };

  // visualViewport resize — 모든 줌 변화 감지
  window.visualViewport.addEventListener('resize', () => {
    const scale = window.visualViewport.scale;
    if (scale > 1.05) {
      isZoomed = true;
      scheduleReset();
    } else if (isZoomed && scale <= 1.05) {
      clearTimeout(zoomTimer);
      isZoomed = false;
    }
  });

  // 터치 종료 시에도 체크
  window.addEventListener('touchend', () => {
    if (window.visualViewport.scale > 1.05) scheduleReset();
  }, { passive: true });

  // input blur 시 리셋 (키보드 닫힐 때)
  document.addEventListener('focusout', (e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') {
      if (window.visualViewport.scale > 1.05) {
        clearTimeout(zoomTimer);
        setTimeout(resetZoom, 300);
      }
    }
  });
})();

// 브라우저 전역 줌 차단 — Ctrl/Cmd + 휠/+/-/0 로 페이지 자체가 확대되는 현상 방지.
//   PDF 뷰어 내부([data-allow-zoom-wheel]) 에서는 자체 PDF 줌으로 동작해야 하므로 통과시킴.
//   (PdfViewer 내부 wheel 리스너가 자체적으로 stopPropagation + preventDefault 처리)
(function initGlobalZoomBlock() {
  const isInsideAllowZoom = (target) => {
    try { return target?.closest?.('[data-allow-zoom-wheel]'); } catch { return false; }
  };
  // Ctrl/Cmd + 휠 → 브라우저 줌 차단 (PDF 영역만 통과)
  window.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (isInsideAllowZoom(e.target)) return; // PDF 자체 줌 허용
    e.preventDefault();
  }, { passive: false, capture: true });
  // Ctrl/Cmd + +/-/0 키보드 줌 차단 (전역 — PDF 도 키보드 줌은 사용 안 함)
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key;
    if (k === '+' || k === '-' || k === '=' || k === '0') {
      // 입력창에서 텍스트 편집 단축키와 충돌 안 함 (해당 키들은 편집용 단축키 아님)
      e.preventDefault();
    }
  }, { capture: true });
})();

// StrictMode 비활성화 — Realtime 구독 + useMilo 이중 실행 방지
// (StrictMode는 useEffect를 의도적으로 2번 실행하여 사이드이펙트 문제를 찾는데,
// Supabase Realtime과 충돌하여 메시지 중복 렌더링 유발)
ReactDOM.createRoot(document.getElementById('root')).render(
  // future flag 옵트인 — v7 동작 미리 적용해 경고 제거 + v7 마이그레이션 부담 감소
  //   v7_startTransition: 상태 업데이트를 React.startTransition 으로 래핑 (UI 블로킹 ↓)
  //   v7_relativeSplatPath: Splat 라우트 안 상대 경로 해석을 v7 방식으로
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <App />
  </BrowserRouter>
);
