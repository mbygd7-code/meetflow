import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// 모든 줌(핀치줌, input 포커스 확대 등) 감지 → 액션 없으면 2초 후 자동 리셋
(function initZoomReset() {
  if (!window.visualViewport) return;

  let zoomTimer = null;
  let isZoomed = false;

  const resetZoom = () => {
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) return;
    // 일시적으로 max-scale 강제 후 복원
    vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover');
    setTimeout(() => {
      vp.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
      isZoomed = false;
    }, 100);
  };

  const scheduleReset = () => {
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(resetZoom, 2000);
  };

  // visualViewport resize — 핀치줌, input 포커스 확대 등 모든 줌 변화 감지
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

  // 터치 종료 시에도 체크 (핀치줌 후 손 뗄 때)
  window.addEventListener('touchend', () => {
    if (window.visualViewport.scale > 1.05) scheduleReset();
  }, { passive: true });

  // input blur 시 즉시 리셋 (키보드 닫힐 때)
  document.addEventListener('focusout', (e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') {
      if (window.visualViewport.scale > 1.05) {
        clearTimeout(zoomTimer);
        setTimeout(resetZoom, 300);
      }
    }
  });
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
