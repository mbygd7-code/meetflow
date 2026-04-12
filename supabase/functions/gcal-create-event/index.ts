// Supabase Edge Function — MeetFlow 회의 요청 → Google Calendar 이벤트 생성
// 호출: 프론트엔드 requestMeeting()에서 HTTP POST
// Body: { title, date, time, duration, participants, meeting_id }
//
// 필요한 환경변수:
//   GOOGLE_SERVICE_ACCOUNT_JSON — Google 서비스 계정 JSON 키
//   GOOGLE_CALENDAR_ID — 대상 캘린더 ID (기본: primary)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google 서비스 계정 JWT 생성
async function createJWT(serviceAccount: any): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const unsignedToken = `${encode(header)}.${encode(claim)}`;

  // PEM → CryptoKey
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${unsignedToken}.${sig}`;
}

// JWT → Access Token
async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwt = await createJWT(serviceAccount);
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
    const { title, date, time, duration, participants, meeting_id } = await req.json();

    if (!title || !date || !time) {
      return new Response(
        JSON.stringify({ error: 'title, date, time은 필수입니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 환경변수에서 서비스 계정 로드
    const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON 환경변수가 설정되지 않았습니다.', skipped: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceAccount = JSON.parse(saJson);
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') || 'primary';
    const accessToken = await getAccessToken(serviceAccount);

    // 시작/종료 시간 계산
    const startDateTime = `${date}T${time}:00`;
    const startMs = new Date(startDateTime).getTime();
    const endMs = startMs + (duration || 30) * 60 * 1000;
    const endDateTime = new Date(endMs).toISOString().replace('Z', '');

    // Google Calendar API 호출
    const event = {
      summary: `[MeetFlow] ${title}`,
      description: [
        `MeetFlow 회의 요청`,
        `참석자: ${(participants || []).join(', ')}`,
        meeting_id ? `회의 ID: ${meeting_id}` : '',
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: `${startDateTime}+09:00`, // KST
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: new Date(endMs).toISOString().split('.')[0] + '+09:00',
        timeZone: 'Asia/Seoul',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    const gcalData = await gcalRes.json();

    if (!gcalRes.ok) {
      console.error('[gcal-create-event] API error:', gcalData);
      return new Response(
        JSON.stringify({ error: 'Google Calendar API 오류', details: gcalData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        eventId: gcalData.id,
        htmlLink: gcalData.htmlLink,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[gcal-create-event]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
