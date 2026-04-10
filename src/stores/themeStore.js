import { create } from 'zustand';

const STORAGE_KEY = 'meetflow-theme';

function getInitialTheme() {
  // 1. localStorage에 저장된 값 우선
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}

  // 2. OS 다크 모드 감지
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';

  // 3. 기본값 = dark
  return 'dark';
}

function applyTheme(theme) {
  const html = document.documentElement;

  // 부드러운 전환 애니메이션 트리거
  html.classList.add('theme-transitioning');

  if (theme === 'light') {
    html.setAttribute('data-theme', 'light');
  } else {
    html.removeAttribute('data-theme');
  }

  // 전환 애니메이션 종료 후 클래스 제거
  setTimeout(() => html.classList.remove('theme-transitioning'), 350);

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
}

export const useThemeStore = create((set, get) => ({
  theme: 'dark',

  init: () => {
    const theme = getInitialTheme();
    applyTheme(theme);
    set({ theme });

    // OS 테마 변경 감지
    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', (e) => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const next = e.matches ? 'dark' : 'light';
        applyTheme(next);
        set({ theme: next });
      }
    });
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
