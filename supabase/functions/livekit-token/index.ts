// Supabase Edge Function — LiveKit 룸 입장 JWT 토큰 발급
//
// POST body: { meetingId: string }
// Auth: Authorization 헤더 필수 (Supabase Anon JWT)
// Returns: { token: string, url: string, identity: string }
//
// 검증:
//   1) JWT 디코드 → user_id 확보 (실패 시 401)
//   2) meeting_participants 에 (meeting_id, user_id) 존재 확인
//      OR users.role='admin' 인 경우 우회 (관리자는 모든 회의 입장 가능)
//      실패 시 403
//   3) 통과하면 LiveKit AccessToken 발급 (room=meeting_id, identity=user_id, name=user.name, exp=60분)
//
// 보안:
//   - LIVEKIT_API_SECRET 은 절대 응답에 포함 X (서버 서명용으로만 사용)
//   - identity 는 user.id (UUID) 그대로 — 클라이언트가 LiveKit Participant 매핑 시 직관적
//   - 토큰 권한: canPublish + canSubscribe (음성/영상 publish/subscribe)
//                canPublishData=false (Supabase Realtime 으로 텍스트 broadcast 충분)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2.7.2';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOKEN_TTL_SECONDS = 60 * 60; // 60분

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  try {
    // ── 1) 환경 변수 검증 ──
    const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL');
    const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY');
    const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      console.error('[livekit-token] LIVEKIT_* env not set');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonResponse({ error: 'supabase_env_missing' }, 500);
    }

    // ── 2) JWT 검증 → user_id 획득 ──
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!accessToken) {
      return jsonResponse({ error: 'unauthorized', reason: 'no_token' }, 401);
    }

    // anon key 로 일반 Supabase 클라이언트 생성 + 사용자 토큰으로 인증
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'unauthorized', reason: 'invalid_token' }, 401);
    }
    const userId = userData.user.id;

    // ── 3) 요청 파싱 ──
    const body = await req.json().catch(() => ({}));
    const { meetingId } = body;
    if (!meetingId || typeof meetingId !== 'string') {
      return jsonResponse({ error: 'meetingId_required' }, 400);
    }

    // ── 4) 권한 검증: meeting_participants 또는 admin ──
    // service role 로 RLS 우회하여 정확한 검증 (사용자 토큰 RLS 와는 별개로 우리가 명시적으로 권한 체크)
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'service_role_missing' }, 500);
    }
    const adminSb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4a) meeting_participants 체크
    const { data: participantRow } = await adminSb
      .from('meeting_participants')
      .select('user_id')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .maybeSingle();

    let allowed = !!participantRow;

    // 4b) 미허용 시 — admin 또는 meeting created_by 우회
    if (!allowed) {
      const { data: profile } = await adminSb
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role === 'admin') {
        allowed = true;
      } else {
        const { data: meetingRow } = await adminSb
          .from('meetings')
          .select('created_by')
          .eq('id', meetingId)
          .maybeSingle();
        if (meetingRow?.created_by === userId) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      console.warn(`[livekit-token] denied: user=${userId.slice(0, 8)} meeting=${meetingId.slice(0, 8)}`);
      return jsonResponse({ error: 'forbidden', reason: 'not_a_participant' }, 403);
    }

    // ── 5) 사용자 표시 이름 조회 (LiveKit Participant.name 으로 사용 → UI 친화적) ──
    const { data: profile2 } = await adminSb
      .from('users')
      .select('name, avatar_color')
      .eq('id', userId)
      .maybeSingle();
    const displayName = profile2?.name || userData.user.email?.split('@')[0] || '참가자';

    // ── 6) LiveKit AccessToken 발급 ──
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: userId,        // 우리 user.id 그대로 → 클라가 LiveKit Participant 와 매핑 직관적
      name: displayName,
      ttl: TOKEN_TTL_SECONDS,
      // metadata: 발화자 색상 등 부가 정보 — 클라가 ParticipantList 색상 표시에 활용
      metadata: JSON.stringify({
        avatar_color: profile2?.avatar_color || null,
      }),
    });
    at.addGrant({
      room: meetingId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false, // 텍스트 broadcast 는 Supabase Realtime 으로 처리
    });

    const jwt = await at.toJwt();

    return jsonResponse({
      token: jwt,
      url: LIVEKIT_URL,
      identity: userId,
      name: displayName,
      ttl: TOKEN_TTL_SECONDS,
    }, 200);
  } catch (err) {
    console.error('[livekit-token] exception:', err);
    return jsonResponse({ error: 'internal', message: String(err).slice(0, 200) }, 500);
  }
});

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
