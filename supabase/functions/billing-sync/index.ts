// Edge Function: billing-sync
//   목적: 월 1회 외부 유료 서비스의 정확한 청구액을 동기화하여 service_usage_billing 에 저장
//   호출 방법:
//     ① Supabase pg_cron 으로 매월 1일 09:00 KST 호출 (권장)
//     ② 운영자가 admin 페이지에서 수동 트리거
//
//   호출 시 query: ?period=YYYY-MM (생략 시 전월)
//   요청자 권한: 매니지드 호출(service_role) 또는 admin 사용자만 (RLS 와 별도로 함수 안에서 검증)
//
// 환경 변수 (Supabase Secrets):
//   LIVEKIT_API_KEY, LIVEKIT_API_SECRET (이미 설정됨, livekit-token 함수와 공유)
//   SB_MGMT_TOKEN              (선택 — Supabase Management API. SUPABASE_ prefix 는 Supabase 가 예약)
//   SB_PROJECT_REF             (선택 — Supabase 프로젝트 ref)
//   GCP_BILLING_ACCOUNT_ID + GOOGLE_SERVICE_ACCOUNT_JSON (선택 — GCP Billing 조회용)
//
// 실패해도 다른 서비스 동기화는 계속 진행. 각 서비스별 결과를 응답에 포함.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── 유틸: YYYY-MM 으로 period_start, period_end 계산 ──
function periodRange(yyyymm: string): { start: string; end: string } {
  const [y, m] = yyyymm.split('-').map((n) => parseInt(n, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // 다음 달 0일 = 이번 달 마지막 날
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

// ── LiveKit 사용량 ──
//   LiveKit Cloud Server API: GET /twirp/livekit.AnalyticsService/GetSessions
//   본 MVP 에서는 /sessions 엔드포인트로 월별 회의실 분 합산
//   (LiveKit Analytics API 정확 명세는 https://docs.livekit.io/cloud/analytics-api/)
async function syncLiveKit(periodStart: string, periodEnd: string): Promise<{ amount: number; raw: any } | { error: string }> {
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const url = Deno.env.get('LIVEKIT_URL'); // wss://xxx.livekit.cloud
  if (!apiKey || !apiSecret || !url) return { error: 'livekit_credentials_missing' };

  // LiveKit Analytics API 는 별도 도메인: https://cloud-api.livekit.io
  // 인증: Basic auth (apiKey:apiSecret) 또는 JWT. 본 함수는 단순 GET 시도 → 실패 시 error 반환
  const projectId = url.match(/\/\/([^.]+)/)?.[1];
  if (!projectId) return { error: 'livekit_url_unparseable' };

  try {
    const res = await fetch(
      `https://cloud-api.livekit.io/v1/projects/${projectId}/sessions?from=${periodStart}T00:00:00Z&to=${periodEnd}T23:59:59Z`,
      { headers: { Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` } }
    );
    if (!res.ok) return { error: `livekit_http_${res.status}` };
    const data = await res.json();
    // 분 합산 — Analytics API 응답 스키마에 따라 조정 필요
    const totalParticipantMinutes = (data.sessions || []).reduce((s: number, sess: any) => {
      return s + (sess.participantMinutes || 0);
    }, 0);
    // Build 가격 0.0008/min — serviceUsage.js 의 SERVICE_PRICING.livekit.perMinute 과 일치 유지
    const amount = totalParticipantMinutes * 0.0008;
    return { amount, raw: data };
  } catch (e) {
    return { error: `livekit_exception:${(e as Error).message}` };
  }
}

// ── Supabase 자체 사용량 (DB / Storage / Edge / Realtime / Egress) ──
//   Supabase Management API: GET /v1/projects/{ref}/usage
async function syncSupabase(periodStart: string, periodEnd: string): Promise<{ amount: number; raw: any } | { error: string }> {
  const token = Deno.env.get('SB_MGMT_TOKEN');
  const projectRef = Deno.env.get('SB_PROJECT_REF');
  if (!token || !projectRef) return { error: 'supabase_mgmt_credentials_missing' };

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/usage?from=${periodStart}&to=${periodEnd}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return { error: `supabase_http_${res.status}` };
    const data = await res.json();
    // 응답 스키마는 변동 가능 — `total_cost` 또는 라인 아이템 합산
    const amount = parseFloat(data.total_cost || data.totalCost || 0);
    return { amount, raw: data };
  } catch (e) {
    return { error: `supabase_exception:${(e as Error).message}` };
  }
}

// ── GCP STT 청구액 ──
//   GCP Billing API 는 BigQuery export 또는 Cloud Billing API.
//   MVP 로 미구현 — 실제 청구액은 GCP Console 에서 수동 입력 가능.
async function syncGCP(_periodStart: string, _periodEnd: string): Promise<{ amount: number; raw: any } | { error: string }> {
  return { error: 'gcp_billing_not_implemented_yet' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 권한 검증 — 호출자가 service_role 이거나 admin 사용자여야 함
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'auth_required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // service_role JWT 또는 admin 사용자만 통과
    let isAuthorized = false;
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]));
      if (payload.role === 'service_role') {
        isAuthorized = true;
      } else if (payload.sub) {
        // admin 사용자 검증
        const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { data: u } = await sb.from('users').select('role').eq('id', payload.sub).single();
        if (u?.role === 'admin') isAuthorized = true;
      }
    } catch {}
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'admin_required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // period 파라미터 — 없으면 전월
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || (() => {
      const now = new Date();
      now.setUTCMonth(now.getUTCMonth() - 1);
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const { start, end } = periodRange(period);

    // 각 서비스 동기화 — 병렬, 실패해도 다른 건 계속
    const [livekit, supabaseUsage, gcp] = await Promise.all([
      syncLiveKit(start, end),
      syncSupabase(start, end),
      syncGCP(start, end),
    ]);

    // service_usage_billing 에 upsert
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const upserts: any[] = [];
    if ('amount' in livekit) {
      upserts.push({
        service: 'livekit',
        period_start: start, period_end: end,
        amount: livekit.amount, currency: 'USD',
        source: 'livekit_api',
        raw_response: livekit.raw,
      });
    }
    if ('amount' in supabaseUsage) {
      upserts.push({
        service: 'supabase',
        period_start: start, period_end: end,
        amount: supabaseUsage.amount, currency: 'USD',
        source: 'supabase_mgmt',
        raw_response: supabaseUsage.raw,
      });
    }
    if ('amount' in gcp) {
      upserts.push({
        service: 'stt',
        period_start: start, period_end: end,
        amount: gcp.amount, currency: 'USD',
        source: 'gcp_billing',
        raw_response: gcp.raw,
      });
    }
    let inserted = 0;
    if (upserts.length > 0) {
      const { error } = await sb
        .from('service_usage_billing')
        .upsert(upserts, { onConflict: 'service,period_start,period_end,source' });
      if (error) {
        return new Response(JSON.stringify({ error: 'db_upsert_failed', detail: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      inserted = upserts.length;
    }

    return new Response(
      JSON.stringify({
        period,
        period_start: start,
        period_end: end,
        results: {
          livekit: 'amount' in livekit ? { amount: livekit.amount } : { error: livekit.error },
          supabase: 'amount' in supabaseUsage ? { amount: supabaseUsage.amount } : { error: supabaseUsage.error },
          gcp: 'amount' in gcp ? { amount: gcp.amount } : { error: gcp.error },
        },
        inserted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[billing-sync]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
