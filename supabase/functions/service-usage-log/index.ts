// Edge Function: service-usage-log
//   클라이언트(useLiveKitVoice 등) 가 사용량을 직접 INSERT 하면 사용자가
//   estimated_cost / units 등을 임의 조작 가능. 이 함수가 인증된 사용자의
//   원시 데이터(서비스, units, meetingId 등) 만 받아 서버 측 단가표로
//   estimated_cost 를 재계산해 service_role 로 INSERT.
//
// POST body:
//   {
//     service: 'livekit' | 'stt' | 'edge_function' | 'storage',
//     eventType: string,
//     units: number,                   // 분/초/MB/호출수
//     unitType: 'minutes' | 'seconds' | 'mb' | 'count',
//     meetingId?: string,              // UUID
//     metadata?: object,               // 자유 메타. 신뢰 안 함 — 클라가 보낸 그대로 저장만
//   }
//
// 인증: 서명 검증된 사용자 JWT 필수. user_id 는 토큰에서 추출 (클라이언트가 보낸 값 무시).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 서버 측 단가표 — 클라이언트와 분리하여 가격 변경 시 단일 진실 소스 유지
//   변경 시 src/lib/serviceUsage.js 의 SERVICE_PRICING 도 함께 업데이트 (UI 추정 표시용)
const PRICING: Record<string, { perMinute?: number; perInvocation?: number; perGbMonth?: number }> = {
  livekit: { perMinute: 0.0008 },
  stt: { perMinute: 0.024 },
  edge_function: { perInvocation: 0.000002 },
  storage: { perGbMonth: 0.021 },
};

function calcCost(service: string, units: number, unitType: string): number {
  const p = PRICING[service];
  if (!p || !Number.isFinite(units) || units < 0) return 0;
  if (unitType === 'minutes' && p.perMinute) return units * p.perMinute;
  if (unitType === 'seconds' && p.perMinute) return (units / 60) * p.perMinute;
  if (unitType === 'count' && p.perInvocation) return units * p.perInvocation;
  if (unitType === 'mb' && p.perGbMonth) return (units / 1024) * p.perGbMonth;
  return 0;
}

// units / unitType 합리성 가드 — 사용자가 음수/비정상 값 보내는 케이스 차단
const MAX_UNITS: Record<string, number> = {
  minutes: 24 * 60, // 하루 단일 세션 최대 1440분
  seconds: 24 * 60 * 60,
  mb: 100_000,
  count: 1_000_000,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 인증
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { service, eventType, units, unitType, meetingId, metadata } = body || {};

    // 입력 검증
    if (!service || !eventType || !unitType) {
      return new Response(JSON.stringify({ error: 'invalid_body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const u = Number(units);
    if (!Number.isFinite(u) || u < 0) {
      return new Response(JSON.stringify({ error: 'invalid_units' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const cap = MAX_UNITS[unitType];
    if (cap != null && u > cap) {
      return new Response(JSON.stringify({ error: 'units_exceeds_cap' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 서버 측 단가표로 estimated_cost 재계산 — 클라가 보낸 값 무시
    const estimatedCost = calcCost(service, u, unitType);

    const { error: insertErr } = await sb.from('service_usage_logs').insert({
      service,
      event_type: eventType,
      units: u,
      unit_type: unitType,
      estimated_cost: estimatedCost,
      meeting_id: meetingId || null,
      user_id: userId,
      metadata: metadata || null,
    });

    if (insertErr) {
      console.error('[service-usage-log] insert failed:', insertErr);
      return new Response(JSON.stringify({ error: 'db_insert_failed', detail: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, estimatedCost }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[service-usage-log]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
