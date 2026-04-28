// 외부 유료 서비스 사용량 추적 — 옵션 A 자체 계측
//
//   클라이언트는 service-usage-log Edge Function 호출 → 서버에서 service_role 로 INSERT.
//   클라이언트가 estimated_cost / units 를 임의 조작하지 못하도록 서버 측 단가표로 재계산.
//
//   대시보드(TokenUsagePage) 는 service_usage_logs 를 조회만 (인증 사용자 read-only).

import { supabase } from '@/lib/supabase';

// ── UI 표시용 단가표 ───────────────────────────────────────────────────
//   ⚠️ 실제 비용 계산은 supabase/functions/service-usage-log/index.ts 의 PRICING 이 진실.
//   이 상수는 페이지에서 라벨/추정치 표시용이며 두 값은 동기화 유지가 권장됨.
//   가격 변경 시 양쪽 모두 갱신.
export const SERVICE_PRICING = {
  livekit: {
    perMinute: 0.0008,
    label: 'LiveKit (음성 회의)',
    unit: '참가자·분',
  },
  stt: {
    perMinute: 0.024,
    label: 'Google STT (자막)',
    unit: '오디오·분',
  },
  edge_function: {
    perInvocation: 0.000002,
    freeQuota: 500_000,
    label: 'Edge Functions',
    unit: '호출',
  },
  storage: {
    perGbMonth: 0.021,
    perGbEgress: 0.09,
    freeGb: 1,
    label: 'Storage',
    unit: 'GB·월',
  },
  db: {
    fixedMonthly: 0,
    label: 'Database',
    unit: '월정액',
  },
  // CloudConvert — Office → PDF 변환. paid plan: $0.005/credit (≈ 1 minute)
  cloudconvert: {
    perMinute: 0.005,
    freeQuota: 25, // free plan: 25 credits/month
    label: 'CloudConvert (PDF 변환)',
    unit: '변환·분',
  },
};

// ── 사용량 기록 ─────────────────────────────────────────────────────────
//   Edge Function service-usage-log 경유 — 사용자가 직접 INSERT 못하도록 RLS INSERT 정책은
//   service_role 만 허용 (마이그레이션 044 에서 강화).
export async function logServiceUsage({
  service,
  eventType,
  units,
  unitType,
  meetingId = null,
  metadata = {},
}) {
  try {
    const { data, error } = await supabase.functions.invoke('service-usage-log', {
      body: { service, eventType, units, unitType, meetingId, metadata },
    });
    if (error) {
      console.warn('[serviceUsage] invoke failed', error);
      return { error };
    }
    return { ok: true, estimatedCost: data?.estimatedCost };
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
    meetingId,
    metadata: { durationSeconds, participantCount },
  });
}

// 편의 래퍼 — STT recognize (Edge Function 내부에서 직접 INSERT — 클라에선 사용 안 함)
export function logSttRecognition({ meetingId, audioSeconds }) {
  const minutes = audioSeconds / 60;
  return logServiceUsage({
    service: 'stt',
    eventType: 'recognize',
    units: minutes,
    unitType: 'minutes',
    meetingId,
    metadata: { audioSeconds },
  });
}
