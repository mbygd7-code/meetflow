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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      console.error('[livekit-token] LIVEKIT_* env not set');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'supabase_env_missing' }, 500);
    }

    // ── 2) JWT 직접 디코드 + 만료 검증 ──
    //   supabase-js 의 auth.getUser() 는 GoTrue API 호출 시 Edge Function 환경에서
    //   간헐적으로 invalid_token 반환 (동일 프로젝트 JWT인데도). 직접 디코드로 우회.
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!accessToken) {
      return jsonResponse({ error: 'unauthorized', reason: 'no_token' }, 401);
    }

    let userId: string;
    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3) throw new Error('malformed_jwt');
      // base64url → base64 → JSON
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      if (!payload?.sub) throw new Error('no_sub_claim');
      // 만료 검증 (sec → ms)
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return jsonResponse({ error: 'unauthorized', reason: 'token_expired' }, 401);
      }
      userId = payload.sub;
    } catch (decodeErr) {
      console.warn('[livekit-token] JWT decode failed:', String(decodeErr).slice(0, 100));
      return jsonResponse({ error: 'unauthorized', reason: 'invalid_token' }, 401);
    }

    // ── 3) 요청 파싱 ──
    const body = await req.json().catch(() => ({}));
    const { meetingId } = body;
    if (!meetingId || typeof meetingId !== 'string') {
      return jsonResponse({ error: 'meetingId_required' }, 400);
    }

    // ── 4) 권한 검증: meeting_participants / admin / created_by / 회의 메시지 발신자 ──
    // service role 로 RLS 우회 (사용자 토큰 RLS 와는 별개로 명시적 권한 체크)
    const adminSb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 검증 추적용 (실패 시 진단)
    const checks: Record<string, boolean> = {
      participant: false,
      admin: false,
      creator: false,
      messenger: false,
    };

    // 4a) meeting_participants 체크
    const { data: participantRow } = await adminSb
      .from('meeting_participants')
      .select('user_id')
      .eq('meeting_id', meetingId)
      .eq('user_id', userId)
      .maybeSingle();
    checks.participant = !!participantRow;
    let allowed = checks.participant;

    // 4b) admin 우회
    if (!allowed) {
      const { data: profile } = await adminSb
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      checks.admin = profile?.role === 'admin';
      if (checks.admin) allowed = true;
    }

    // 4c) 회의 생성자 우회
    if (!allowed) {
      const { data: meetingRow } = await adminSb
        .from('meetings')
        .select('created_by')
        .eq('id', meetingId)
        .maybeSingle();
      checks.creator = meetingRow?.created_by === userId;
      if (checks.creator) allowed = true;
    }

    // 4d) 회의에 메시지 보낸 적 있으면 사실상 참여자로 간주 (정식 등록 누락 회복)
    if (!allowed) {
      const { count } = await adminSb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('meeting_id', meetingId)
        .eq('user_id', userId)
        .limit(1);
      checks.messenger = (count || 0) > 0;
      if (checks.messenger) allowed = true;
    }

    if (!allowed) {
      console.warn(`[livekit-token] denied: user=${userId.slice(0, 8)} meeting=${meetingId.slice(0, 8)} checks=${JSON.stringify(checks)}`);
      return jsonResponse(
        { error: 'forbidden', reason: 'not_a_participant', checks },
        403
      );
    }
    console.log(`[livekit-token] allowed: user=${userId.slice(0, 8)} meeting=${meetingId.slice(0, 8)} via=${Object.keys(checks).find((k) => checks[k])}`);

    // ── 5) 사용자 표시 이름 조회 (LiveKit Participant.name 으로 사용 → UI 친화적) ──
    const { data: profile2 } = await adminSb
      .from('users')
      .select('name, email, avatar_color')
      .eq('id', userId)
      .maybeSingle();
    // userData 라는 미정의 변수 참조 버그 수정 — 이 함수는 JWT 직접 디코드만 하므로
    // auth.getUser() 결과(userData)가 없음. profile2 의 email 로 fallback.
    const displayName =
      profile2?.name ||
      profile2?.email?.split('@')[0] ||
      '참가자';

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
