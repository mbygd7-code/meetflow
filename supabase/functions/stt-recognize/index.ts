// Supabase Edge Function — Google Cloud Speech-to-Text
// POST body: { audio: base64, language: 'ko-KR', meetingId?, durationMs? }
// Returns: { transcript: string, billedSeconds?: number }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google STT 가격 (USD per minute, Standard 모델 ko-KR)
const STT_USD_PER_MINUTE = 0.024;

// 사용량 기록 — service_usage_logs 에 service_role 로 INSERT
async function logSttUsage({
  audioSeconds, meetingId, userId, model, transcriptLen,
}: {
  audioSeconds: number; meetingId: string | null; userId: string | null;
  model: string; transcriptLen: number;
}) {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const minutes = audioSeconds / 60;
    const cost = minutes * STT_USD_PER_MINUTE;
    await sb.from('service_usage_logs').insert({
      service: 'stt',
      event_type: 'recognize',
      units: minutes,
      unit_type: 'minutes',
      estimated_cost: cost,
      meeting_id: meetingId,
      user_id: userId,
      metadata: { model, transcriptLen, audioSeconds },
    });
  } catch (e) {
    console.warn('[stt-recognize] usage log failed:', e);
  }
}

// Google 서비스 계정 JWT 생성 (gcal-create-event와 동일 패턴)
async function createJWT(serviceAccount: any, scope: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const unsignedToken = `${encode(header)}.${encode(claim)}`;

  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedToken)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${unsignedToken}.${sig}`;
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwt = await createJWT(serviceAccount, 'https://www.googleapis.com/auth/cloud-platform');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { audio, language = 'ko-KR', meetingId = null, durationMs = null } = await req.json();
    // 인증 헤더에서 user_id 추출 — 사용량 로그에 기록
    let userId: string | null = null;
    try {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace(/^Bearer\s+/i, '');
      if (jwt) {
        const payload = JSON.parse(atob(jwt.split('.')[1]));
        userId = payload?.sub || null;
      }
    } catch { /* 익명 OK */ }

    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'audio field required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(serviceAccount);

    // Google Cloud Speech-to-Text API 호출
    const sttRes = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: language,
          enableAutomaticPunctuation: true,
          model: 'default',
        },
        audio: {
          content: audio,
        },
      }),
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      console.error('[stt-recognize] Google STT error:', sttRes.status, errText);
      return new Response(
        JSON.stringify({ error: 'STT API error', detail: errText }),
        { status: sttRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sttData = await sttRes.json();
    const transcript = (sttData.results || [])
      .map((r: any) => r.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();

    // ── 사용량 기록 ──
    // 우선순위: Google 응답의 totalBilledTime ("15s") → 클라이언트 durationMs → 0
    let billedSec = 0;
    const billed = (sttData.totalBilledTime || '').replace(/s$/, '');
    if (billed && !Number.isNaN(parseFloat(billed))) {
      billedSec = parseFloat(billed);
    } else if (typeof durationMs === 'number') {
      billedSec = Math.max(0, durationMs / 1000);
    }
    if (billedSec > 0) {
      // 비차단 — 응답 지연 0
      logSttUsage({
        audioSeconds: billedSec,
        meetingId,
        userId,
        model: 'default',
        transcriptLen: transcript.length,
      });
    }

    return new Response(
      JSON.stringify({ transcript, billedSeconds: billedSec }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[stt-recognize]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
