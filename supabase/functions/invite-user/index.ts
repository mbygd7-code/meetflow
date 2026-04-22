// Supabase Edge Function — 새 직원 초대 (이메일 기반)
// Deploy: supabase functions deploy invite-user
//
// POST body: { email, name?, teamId?, slackUserId? }
// Returns: { ok, userId, email }
//
// 요구 권한: 호출자가 admin 이어야 함 (authorization 헤더 Bearer token 으로 검증)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1) 호출자 인증 (admin 권한 검증)
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: '인증 토큰이 없습니다' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !caller) return json({ error: '유효하지 않은 세션' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // caller 가 admin 인지 확인
    const { data: callerRow } = await admin
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerRow?.role !== 'admin') {
      return json({ error: '관리자 권한이 필요합니다' }, 403);
    }

    // 2) 입력 파싱
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const name = body.name ? String(body.name).trim() : null;
    const teamId = body.teamId || null;
    const slackUserId = body.slackUserId ? String(body.slackUserId).trim() : null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: '올바른 이메일 주소가 아닙니다' }, 400);
    }

    // 3) 이미 존재하는지 확인
    const { data: existing } = await admin
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      return json({ error: '이미 등록된 이메일입니다', userId: existing.id }, 409);
    }

    // 4) Supabase Auth 초대 전송
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
    });
    if (inviteErr) {
      console.error('[invite-user] inviteUserByEmail error:', inviteErr);
      return json({ error: '초대 메일 발송 실패: ' + inviteErr.message }, 500);
    }

    const newUserId = inviteData?.user?.id;
    if (!newUserId) return json({ error: '초대 결과에서 user id 를 찾을 수 없습니다' }, 500);

    // 5) public.users 업서트 (트리거가 자동 생성하지 않는 경우 대비)
    await admin.from('users').upsert(
      {
        id: newUserId,
        email,
        name: name || email.split('@')[0],
        role: 'user',
        ...(slackUserId ? { slack_user_id: slackUserId } : {}),
      },
      { onConflict: 'id' }
    );

    // 6) 팀 배정 (옵션)
    if (teamId) {
      await admin.from('team_members').upsert(
        { user_id: newUserId, team_id: teamId },
        { onConflict: 'user_id,team_id' }
      );
    }

    return json({ ok: true, userId: newUserId, email });
  } catch (err) {
    console.error('[invite-user]', err);
    return json({ error: String(err) }, 500);
  }
});
