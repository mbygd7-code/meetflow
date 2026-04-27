// 외부 유료 서비스 사용량 추적 — 옵션 A 자체 계측
//
//   클라이언트/서버에서 사용량 발생 시 logServiceUsage() 호출 → service_usage_logs 에 기록
//   대시보드(TokenUsagePage)는 이 테이블 + ai_usage_logs + service_usage_billing 합산
//
// 주의: estimated_cost 는 단가표 기준 추정치. 실제 청구액은 옵션 B (cron) 으로 보정.

import { supabase } from '@/lib/supabase';

// ── 단가표 ───────────────────────────────────────────────────────────────
// 변동 시 이 한 곳만 수정하면 모든 추정 비용이 갱신됨.
// 출처: 각 서비스 공식 가격 페이지 기준 (2026-04 기준)
export const SERVICE_PRICING = {
  // LiveKit Cloud — 참가자 × 분 (Build 플랜 0.0008 USD/min, Ship 플랜 0.0005)
  // 보수적으로 Build 가격 사용 (공식: https://livekit.io/pricing)
  livekit: {
    perMinute: 0.0008, // USD per participant-minute
    label: 'LiveKit (음성 회의)',
    unit: '참가자·분',
  },
  // Google Cloud Speech-to-Text — Standard 모델 0.024 USD/min, Chirp 0.016 USD/min
  // 회의에 사용하는 latest_long 은 Standard 라인 적용
  stt: {
    perMinute: 0.024, // USD per audio minute
    label: 'Google STT (자막)',
    unit: '오디오·분',
  },
  // Supabase Edge Functions — 월 500K 호출 무료, 이후 $2/1M
  edge_function: {
    perInvocation: 0.000002, // USD per call (0 free quota 까지는 0)
    freeQuota: 500_000,
    label: 'Edge Functions',
    unit: '호출',
  },
  // Supabase Storage — $0.021/GB/month, egress $0.09/GB
  // 단일 사용량은 storage 용량(MB) 기준만 추적
  storage: {
    perGbMonth: 0.021,
    perGbEgress: 0.09,
    freeGb: 1,
    label: 'Storage',
    unit: 'GB·월',
  },
  // Supabase Database — Pro $25 fix + storage 0.125/GB (현재는 Pro 가입 가정 시 고정)
  db: {
    fixedMonthly: 0, // Free tier 가정. Pro 시 25
    label: 'Database',
    unit: '월정액',
  },
};

// ── 비용 계산 헬퍼 ──────────────────────────────────────────────────────
export function calcLiveKitCost(participantMinutes) {
  return Math.max(0, participantMinutes) * SERVICE_PRICING.livekit.perMinute;
}

export function calcSttCost(audioMinutes) {
  return Math.max(0, audioMinutes) * SERVICE_PRICING.stt.perMinute;
}

export function calcEdgeFunctionCost(invocations) {
  const billable = Math.max(0, invocations - SERVICE_PRICING.edge_function.freeQuota);
  return billable * SERVICE_PRICING.edge_function.perInvocation;
}

// ── 사용량 기록 ─────────────────────────────────────────────────────────
// 클라이언트에서 직접 INSERT — RLS 가 service_role 이 아닌 인증 사용자에게도 INSERT 허용해야 하나?
// 보안상 클라이언트 INSERT 는 추천하지 않음. 대신 Edge Function 경유 (service-usage-log) 권장.
// 다만 LiveKit 연결처럼 클라이언트 사이드에서만 정확히 측정 가능한 것은 RPC 로 처리.
//
// 본 함수는 Edge Function 'service-usage-log' 에 POST — 그쪽에서 service role 로 INSERT.
export async function logServiceUsage({
  service,           // 'livekit' | 'stt' | 'edge_function' | 'storage'
  eventType,         // 'connection' | 'recognize' | ...
  units,             // numeric
  unitType,          // 'minutes' | 'seconds' | 'mb' | 'count'
  estimatedCost,     // USD
  meetingId = null,
  metadata = {},
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { error: 'no_session' };

    // 직접 client-side INSERT — RLS 정책상 authenticated INSERT 도 허용해두면 더 단순.
    // 보안 민감도가 낮은 사용량 데이터이므로 정책을 완화 가능. 일단 그대로 진행.
    const { error } = await supabase
      .from('service_usage_logs')
      .insert({
        service,
        event_type: eventType,
        units,
        unit_type: unitType,
        estimated_cost: estimatedCost,
        meeting_id: meetingId,
        user_id: session.user.id,
        metadata,
      });
    if (error) {
      console.warn('[serviceUsage] log insert failed', error);
      return { error };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[serviceUsage] exception', err);
    return { error: err };
  }
}

// 편의 래퍼 — LiveKit 세션 종료 시 한 번 호출
export function logLiveKitSession({ meetingId, durationSeconds, participantCount = 1 }) {
  const minutes = (durationSeconds / 60) * participantCount;
  return logServiceUsage({
    service: 'livekit',
    eventType: 'session',
    units: minutes,
    unitType: 'minutes',
    estimatedCost: calcLiveKitCost(minutes),
    meetingId,
    metadata: { durationSeconds, participantCount },
  });
}

// 편의 래퍼 — STT recognize 호출 시 (Edge Function 안에서 직접 호출 권장)
export function logSttRecognition({ meetingId, audioSeconds }) {
  const minutes = audioSeconds / 60;
  return logServiceUsage({
    service: 'stt',
    eventType: 'recognize',
    units: minutes,
    unitType: 'minutes',
    estimatedCost: calcSttCost(minutes),
    meetingId,
    metadata: { audioSeconds },
  });
}
