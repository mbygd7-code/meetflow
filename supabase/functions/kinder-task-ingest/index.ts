// Supabase Edge Function — KinderStick → MeetFlow 태스크 수신
//
// 엔드포인트: POST {supabase}/functions/v1/kinder-task-ingest
// 인증: HMAC-SHA256 서명 (헤더 X-Kinder-Signature: <hex>)
//       서명 대상: raw body (UTF-8)
//       서명 키:   KINDER_INCOMING_SECRET
//
// 요청 본문 (KinderStick):
//   {
//     request_id, callback_url,
//     kinder: { workspace, task_id, team, tier, phase, cadence },
//     title, why, hint, description,
//     due_at, priority,
//     expected_evidence: { kpi_sub_items, boost_domains }
//   }
//
// 처리:
//   1. 서명 검증
//   2. kinder_team_mapping 으로 kinder.team → MeetFlow team_id 매핑 시도
//      매핑 없으면 teams.name 으로 fallback 매칭
//   3. 해당 팀 멤버 전원에게 task fan-out (external_task_id 로 묶음)
//      - 이미 같은 (external_source, external_task_id, assignee_id) 가 있으면 update
//   4. 응답: { ok, request_id, meetflow_task_ids: [...] }
//
// Deploy: supabase functions deploy kinder-task-ingest --no-verify-jwt
// Secrets: supabase secrets set KINDER_INCOMING_SECRET=...

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-kinder-signature, x-kinder-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KINDER_INCOMING_SECRET = Deno.env.get('KINDER_INCOMING_SECRET') || '';

// ── HMAC-SHA256 검증 ─────────────────────────────────────────────
async function verifyHmac(rawBody: string, signatureHex: string): Promise<boolean> {
  if (!KINDER_INCOMING_SECRET) {
    console.warn('[kinder-ingest] KINDER_INCOMING_SECRET not set — rejecting all requests');
    return false;
  }
  if (!signatureHex) return false;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(KINDER_INCOMING_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const computedHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // 타이밍 안전 비교
    if (computedHex.length !== signatureHex.length) return false;
    let mismatch = 0;
    for (let i = 0; i < computedHex.length; i++) {
      mismatch |= computedHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
    }
    return mismatch === 0;
  } catch (err) {
    console.error('[kinder-ingest] HMAC verify error', err);
    return false;
  }
}

// ── priority 매핑: kinder → MeetFlow ─────────────────────────────
function mapPriority(p: string | undefined): string {
  switch ((p || '').toLowerCase()) {
    case 'urgent': return 'urgent';
    case 'high':   return 'high';
    case 'normal': return 'medium';
    case 'low':    return 'low';
    default:       return 'medium';
  }
}

// ── due_at (ISO) → due_date (DATE) ──────────────────────────────
function toDueDate(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-kinder-signature') || '';
  const requestId = req.headers.get('x-kinder-request-id') || '';

  // 1. 서명 검증
  const valid = await verifyHmac(rawBody, signature);
  if (!valid) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_signature' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. payload 파싱
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const kinder = payload?.kinder || {};
  const externalTaskId = String(kinder.task_id || '').trim();
  const kinderTeam = String(kinder.team || '').trim();
  const title = String(payload?.title || '').trim();
  const callbackUrl = String(payload?.callback_url || '').trim();

  if (!externalTaskId || !title) {
    return new Response(JSON.stringify({
      ok: false, error: 'missing_fields',
      detail: 'kinder.task_id and title are required',
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 3. team 매핑: kinder_team_mapping → fallback teams.name
  let teamId: string | null = null;
  if (kinderTeam) {
    const { data: mapping } = await supabase
      .from('kinder_team_mapping')
      .select('team_id')
      .eq('kinder_team', kinderTeam)
      .maybeSingle();
    if (mapping?.team_id) {
      teamId = mapping.team_id;
    } else {
      // fallback — teams.name 정확 매칭
      const { data: teamByName } = await supabase
        .from('teams')
        .select('id')
        .eq('name', kinderTeam)
        .maybeSingle();
      if (teamByName?.id) teamId = teamByName.id;
    }
  }

  if (!teamId) {
    return new Response(JSON.stringify({
      ok: false, error: 'team_not_mapped',
      detail: `kinder.team "${kinderTeam}" 가 MeetFlow team 에 매핑되지 않음. /admin 에서 매핑하세요.`,
    }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 4. 팀 멤버 조회
  const { data: members, error: memErr } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId);
  if (memErr) {
    return new Response(JSON.stringify({ ok: false, error: 'team_members_query_failed', detail: memErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const memberIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
  if (memberIds.length === 0) {
    return new Response(JSON.stringify({
      ok: false, error: 'team_has_no_members',
      detail: `team_id=${teamId} 에 팀원이 없음`,
    }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 5. tasks 행 구성 — fan-out per member, external_task_id 로 묶음
  const externalMeta = {
    workspace: kinder.workspace || null,
    tier: kinder.tier || null,
    phase: kinder.phase || null,
    cadence: kinder.cadence || null,
    why: payload.why || null,
    hint: payload.hint || null,
    request_id: payload.request_id || requestId || null,
    expected_evidence: payload.expected_evidence || null,
  };

  const due_date = toDueDate(payload.due_at);
  const priority = mapPriority(payload.priority);
  const description = String(payload.description || '');

  const rows = memberIds.map((uid: string) => ({
    title,
    description,
    status: 'todo',
    priority,
    due_date,
    assignee_id: uid,
    team_id: teamId,
    external_source: 'kinder',
    external_task_id: externalTaskId,
    external_workspace: kinder.workspace || null,
    external_meta: externalMeta,
    external_callback_url: callbackUrl || null,
    kpi_sub_items: payload.expected_evidence?.kpi_sub_items || null,
    boost_domains: payload.expected_evidence?.boost_domains || null,
    ai_suggested: false,
  }));

  // 6. upsert by (external_source, external_task_id, assignee_id)
  //    — 같은 외부 태스크 재수신 시 멤버별로 update
  //    Supabase upsert 는 단일 unique constraint 필요 → 수동 처리
  const insertedIds: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('external_source', 'kinder')
      .eq('external_task_id', externalTaskId)
      .eq('assignee_id', row.assignee_id)
      .maybeSingle();

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from('tasks')
        .update({
          title: row.title,
          description: row.description,
          priority: row.priority,
          due_date: row.due_date,
          external_meta: row.external_meta,
          external_callback_url: row.external_callback_url,
          kpi_sub_items: row.kpi_sub_items,
          boost_domains: row.boost_domains,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (upErr) errors.push(`update ${existing.id}: ${upErr.message}`);
      else insertedIds.push(existing.id);
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('tasks')
        .insert(row)
        .select('id')
        .single();
      if (insErr) errors.push(`insert: ${insErr.message}`);
      else if (ins?.id) insertedIds.push(ins.id);
    }
  }

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    request_id: payload.request_id || requestId || null,
    external_task_id: externalTaskId,
    meetflow_task_ids: insertedIds,
    team_id: teamId,
    members_fan_out: memberIds.length,
    errors: errors.length ? errors : undefined,
  }), {
    status: errors.length ? 207 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
