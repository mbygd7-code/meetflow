// Supabase Edge Function — 직원 비밀번호 재설정 링크 생성
// Deploy: supabase functions deploy reset-user-password
//
// POST body: { userId?: string, email?: string }  (둘 중 하나 필수)
// Returns: { ok, email, recoveryLink, actionLink }
//
// 용도: 초대 이메일이 안 닿았거나 링크 만료된 사용자를 관리자가 즉시 복구.
//       이메일 발송 대신 링크를 **직접 응답**으로 반환 → 관리자가 Slack/카톡으로 전달.
//
// 요구 권한: 호출자가 admin

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
    const siteUrl =
      Deno.env.get('SITE_URL') ||
      Deno.env.get('PUBLIC_SITE_URL') ||
      'https://meetflow-sandy.vercel.app';

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

    const { data: callerRow } = await admin
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerRow?.role !== 'admin') {
      return json({ error: '관리자 권한이 필요합니다' }, 403);
    }

    // 2) 입력 파싱
    const body = await req.json().catch(() => ({}));
    const userId = body.userId ? String(body.userId).trim() : null;
    let email = body.email ? String(body.email).trim().toLowerCase() : null;

    if (!userId && !email) {
      return json({ error: 'userId 또는 email 중 하나는 필수입니다' }, 400);
    }

    // userId로 이메일 조회 (email 미제공 시)
    if (!email && userId) {
      const { data: row } = await admin
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
      email = row?.email?.toLowerCase() || null;
      if (!email) return json({ error: '해당 userId의 이메일을 찾을 수 없습니다' }, 404);
    }

    // 3) 복구 링크 생성 (이메일 발송 X, 링크만 반환)
    //    type='recovery': 비밀번호 재설정
    //    초대된 상태(비번 없음)여도 recovery 링크로 비번 설정 가능
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: email!,
      options: {
        redirectTo: `${siteUrl}/login`,
      },
    });

    if (linkErr) {
      console.error('[reset-user-password] generateLink error:', linkErr);
      return json({ error: '링크 생성 실패: ' + linkErr.message }, 500);
    }

    // Supabase가 반환하는 링크 후보들:
    //   action_link: 클릭 시 바로 인증 처리되는 최종 URL (사용자에게 전달할 것)
    //   hashed_token + verification_type 등 별도 필드도 존재
    const actionLink = (linkData?.properties as any)?.action_link || null;

    if (!actionLink) {
      return json({ error: '링크 데이터를 찾을 수 없습니다', raw: linkData }, 500);
    }

    return json({
      ok: true,
      email,
      actionLink,
      // 호환용 별칭 — 클라이언트가 어떤 이름을 쓰든 작동
      recoveryLink: actionLink,
    });
  } catch (err) {
    console.error('[reset-user-password]', err);
    return json({ error: String(err) }, 500);
  }
});
