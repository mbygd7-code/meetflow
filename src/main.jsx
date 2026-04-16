import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

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

// StrictMode 비활성화 — Realtime 구독 + useMilo 이중 실행 방지
// (StrictMode는 useEffect를 의도적으로 2번 실행하여 사이드이펙트 문제를 찾는데,
// Supabase Realtime과 충돌하여 메시지 중복 렌더링 유발)
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
