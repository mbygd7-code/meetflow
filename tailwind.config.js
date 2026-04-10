/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#131313',
          secondary: '#1A1A1A',
          tertiary: '#252525',
        },
        brand: {
          purple: '#723CEB',
          'purple-deep': '#4C11CE',
          orange: '#FF902F',
          yellow: '#FFEF63',
        },
        txt: {
          primary: '#FFFFFF',
          secondary: '#A0A0A0',
          muted: '#6B6B6B',
        },
        status: {
          success: '#34D399',
          warning: '#FFEF63',
          error: '#EF4444',
          info: '#723CEB',
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
        sm: '0 1px 2px rgba(0,0,0,0.3)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 8px 32px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(114,60,235,0.3)',
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
