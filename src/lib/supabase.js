import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[MeetFlow] Supabase 환경변수가 설정되지 않았습니다. .env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 추가하세요.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
    realtime: {
      // postgres_changes 속도 제한 (10 events/sec로 충분)
      params: { eventsPerSecond: 10 },
      // Broadcast/postgres_changes 공용 하트비트 — 기본 15s, 회의 중 WS 안정성 위해 명시
      heartbeatIntervalMs: 15000,
      // 연결 타임아웃 (기본값 10s)
      timeout: 10000,
    },
  }
);

// ══════════════════════════════════════════════════════
// Realtime 토큰 동기화 — 프로덕션 안정성 핵심
// ══════════════════════════════════════════════════════
// autoRefreshToken이 REST용 JWT는 자동 갱신해주지만,
// Realtime WebSocket은 **연결 당시의 토큰**을 계속 사용함.
// → 토큰 만료 시 서버가 "HTTP Authentication failed"로 WS 거부
// → postgres_changes/Broadcast 전혀 도착 안 함 (폴링만 살아남음)
// 해결: TOKEN_REFRESHED/SIGNED_IN 시점에 realtime.setAuth()로 즉시 동기화
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
    if (session?.access_token) {
      try {
        supabase.realtime.setAuth(session.access_token);
        console.log('[supabase] Realtime 토큰 동기화:', event);
      } catch (err) {
        console.warn('[supabase] Realtime 토큰 동기화 실패:', err);
      }
    }
  } else if (event === 'SIGNED_OUT') {
    try {
      supabase.realtime.setAuth(null);
    } catch {}
  }
});
