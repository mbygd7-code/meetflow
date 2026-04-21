// Supabase Edge Function — 직원 계정 삭제
// Deploy: supabase functions deploy delete-user
//
// POST body: { userId }
// Returns: { ok }
//
// 요구 권한: 호출자가 admin 이어야 함. 자기 자신은 삭제 불가.

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

    const body = await req.json();
    const userId = String(body.userId || '').trim();
    if (!userId) return json({ error: 'userId 가 필요합니다' }, 400);
    if (userId === caller.id) return json({ error: '자기 자신은 삭제할 수 없습니다' }, 400);

    // 관련 연결 먼저 정리 (FK 제약 대비)
    await admin.from('team_members').delete().eq('user_id', userId);

    // auth.users 삭제 (public.users 는 CASCADE 또는 트리거로 정리되어야 함)
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('[delete-user] auth.admin.deleteUser error:', delErr);
      // auth 삭제 실패 시에도 public.users 는 정리 시도
      await admin.from('users').delete().eq('id', userId);
      return json({ error: 'Auth 계정 삭제 실패: ' + delErr.message }, 500);
    }

    // public.users 에 남아있으면 명시적으로 제거
    await admin.from('users').delete().eq('id', userId);

    return json({ ok: true });
  } catch (err) {
    console.error('[delete-user]', err);
    return json({ error: String(err) }, 500);
  }
});
