import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// 핀치줌 후 2초 뒤 자동 리셋
(function initZoomReset() {
  let zoomTimer = null;
  const resetZoom = () => {
    const vp = document.querySelector('meta[name="viewport"]');
    if (!vp) return;
    vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover');
    requestAnimationFrame(() => {
      vp.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    });
  };
  window.addEventListener('touchend', () => {
    if (window.visualViewport && window.visualViewport.scale > 1.05) {
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(resetZoom, 2000);
    }
  }, { passive: true });
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
