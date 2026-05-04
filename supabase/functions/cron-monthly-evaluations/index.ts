// Supabase Edge Function — 매월 1일 자동 직원 평가 생성
// 모든 사용자(active)의 지난달 평가를 evaluate-employee 함수로 위임 호출.
//
// 호출 방법:
//   - pg_cron 매월 1일 새벽 1회 자동 (migrations/051_cron_monthly_evaluations.sql)
//   - 수동 테스트: POST { month: 'YYYY-MM' } (없으면 자동으로 지난달)
//
// 응답: { success, generated, failed, errors[] }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── 평가 대상 월 결정 ──
    // body.month 가 오면 그것 사용 (수동 테스트용), 아니면 지난달 자동
    let month: string | undefined;
    try {
      const body = await req.json();
      month = body?.month;
    } catch { /* GET 또는 빈 body */ }

    if (!month) {
      const now = new Date();
      // 지난달 1일 → YYYY-MM
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      month = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`;
    }

    // ── 활성 사용자 목록 ──
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id, name')
      .order('created_at', { ascending: true });
    if (usersErr) throw usersErr;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ success: true, generated: 0, failed: 0, errors: [], note: 'no users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 각 사용자에 대해 evaluate-employee 호출 (직렬 — Anthropic rate limit 보호) ──
    const evalEndpoint = `${supabaseUrl}/functions/v1/evaluate-employee`;
    let generated = 0;
    let failed = 0;
    const errors: Array<{ userId: string; name: string; error: string }> = [];

    for (const u of users) {
      try {
        const resp = await fetch(evalEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: u.id,
            month,
            periodLabel: `${month} (자동 월간)`,
          }),
        });
        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
        }
        const data = await resp.json();
        if (data?.error) throw new Error(data.error);
        generated++;
      } catch (err: any) {
        failed++;
        errors.push({ userId: u.id, name: u.name, error: String(err?.message || err) });
        console.error(`[cron-monthly] user ${u.name} (${u.id}) failed:`, err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      month,
      total: users.length,
      generated,
      failed,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[cron-monthly-evaluations]', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
