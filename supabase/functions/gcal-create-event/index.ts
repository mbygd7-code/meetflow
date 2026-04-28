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
    const { title, date, time, duration, participants, meeting_id, agendas, files } = await req.json();

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

    // 어젠다 / 첨부파일 텍스트 빌드
    const agendaLines = (agendas || [])
      .filter((a: any) => a?.title?.trim())
      .map((a: any, i: number) => `  ${i + 1}. ${a.title}${a.duration_minutes ? ` (${a.duration_minutes}분)` : ''}`)
      .join('\n');
    const fileLines = (files || [])
      .filter((f: any) => f?.name)
      .map((f: any) => `  • ${f.name}`)
      .join('\n');

    // 캘린더 이벤트 설명 — 회의 제목 + 어젠다 + 참석자 + 첨부파일 + 안내 멘트
    const descriptionParts: string[] = [];
    descriptionParts.push(`[MeetFlow] ${title}`);
    if (agendaLines) descriptionParts.push(`📋 어젠다\n${agendaLines}`);
    if ((participants || []).length > 0) descriptionParts.push(`👥 참석자\n  ${(participants || []).join(', ')}`);
    if (fileLines) descriptionParts.push(`📎 첨부 파일\n${fileLines}`);
    // 안내 멘트 — 어젠다 또는 첨부파일이 있을 때만 표시
    if (agendaLines || fileLines) {
      let subject: string;
      if (agendaLines && fileLines) subject = '어젠다와 첨부 파일을';
      else if (agendaLines) subject = '어젠다를';
      else subject = '첨부 파일을';
      descriptionParts.push(
        `💡 회의 시작 전 위 ${subject} 미리 확인해 주세요.\n` +
        `   준비된 회의가 짧고 효율적인 회의를 만듭니다.`
      );
    }

    // Google Calendar API 호출
    const event = {
      summary: `[MeetFlow] ${title}`,
      description: descriptionParts.join('\n\n'),
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
