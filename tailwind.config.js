/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* ── 배경 (CSS 변수 → 자동 전환) ── */
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        /* ── 텍스트 (CSS 변수) ── */
        txt: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        /* ── 브랜드 (RGB 채널 → opacity modifier 호환 + 테마 전환) ── */
        brand: {
          purple: 'rgb(var(--brand-purple-rgb) / <alpha-value>)',
          'purple-deep': 'rgb(var(--brand-purple-deep-rgb) / <alpha-value>)',
          orange: 'rgb(var(--brand-orange-rgb) / <alpha-value>)',
          yellow: 'rgb(var(--brand-yellow-rgb) / <alpha-value>)',
        },
        /* ── 상태 (RGB 채널 → opacity modifier 호환 + 테마 전환) ── */
        status: {
          success: 'rgb(var(--status-success-rgb) / <alpha-value>)',
          warning: 'rgb(var(--status-warning-rgb) / <alpha-value>)',
          error: 'rgb(var(--status-error-rgb) / <alpha-value>)',
          info: 'rgb(var(--status-info-rgb) / <alpha-value>)',
        },
        /* ── 시맨틱 보더 ── */
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          hover: 'var(--border-hover)',
          'hover-strong': 'var(--border-hover-strong)',
          'hover-max': 'var(--border-hover-max)',
          focus: 'var(--border-focus)',
          divider: 'var(--border-divider)',
          'divider-faint': 'var(--border-divider-faint)',
        },
        /* ── 서페이스 ── */
        surface: {
          overlay: 'var(--surface-overlay)',
        },
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      fontFamily: {
        heading: ['Gilroy', 'Inter', 'sans-serif'],
        sub: ['Lufga', 'Inter', 'sans-serif'],
        body: ['Inter', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'gradient-warm': 'var(--gradient-warm)',
        'gradient-card': 'var(--gradient-card)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
};
