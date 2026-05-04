import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: Number(process.env.PORT) || 5180,
    host: true,
  },
  // [보안] prod 빌드에서 console.log/debug/info 제거 — PII(회의 내용·user.id 등) 노출 방지.
  // console.warn / console.error 는 유지 (실제 에러 디버깅에 필요).
  // dev/HMR에는 영향 없음.
  esbuild: {
    pure: mode === 'production'
      ? ['console.log', 'console.debug', 'console.info']
      : [],
  },
}));
