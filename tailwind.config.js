/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* ── 배경 (CSS 변수 → 테마 전환 시 자동 변경) ── */
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
        /* ── 브랜드 (hex 고정 — opacity modifier 정상 동작) ── */
        brand: {
          purple: '#723CEB',
          'purple-deep': '#4C11CE',
          orange: '#FF902F',
          yellow: '#FFEF63',
        },
        /* ── 상태 (hex 고정) ── */
        status: {
          success: '#34D399',
          warning: '#FFEF63',
          error: '#EF4444',
          info: '#723CEB',
        },
        /* ── 시맨틱 보더 (CSS 변수) ── */
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
        /* ── 서페이스 (CSS 변수) ── */
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
        'gradient-brand': 'linear-gradient(135deg, #FF902F 0%, #723CEB 50%, #4C11CE 100%)',
        'gradient-warm': 'linear-gradient(180deg, #723CEB 0%, #FF902F 100%)',
        'gradient-card': 'linear-gradient(135deg, #723CEB 0%, #4C11CE 100%)',
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
