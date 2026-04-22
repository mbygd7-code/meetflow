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
