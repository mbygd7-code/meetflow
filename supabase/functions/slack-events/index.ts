// Supabase Edge Function — Slack Events API 수신
// 구독 이벤트: url_verification, message.channels, app_mention
//
// Deploy: supabase functions deploy slack-events --no-verify-jwt
// Secrets: supabase secrets set SLACK_SIGNING_SECRET=... SLACK_BOT_TOKEN=...

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-slack-signature, x-slack-request-timestamp',
};

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function postToSlack(channel: string, text: string, thread_ts?: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, text, thread_ts }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json();

  // 1. URL verification challenge
  if (body.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. Event callback
  if (body.type === 'event_callback') {
    const event = body.event;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 봇 자신의 메시지는 무시
    if (event.bot_id || event.subtype === 'bot_message') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (event.type === 'message' || event.type === 'app_mention') {
      // Slack channel_id로 team 찾기
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('slack_channel_id', event.channel)
        .single();

      if (!team) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 현재 active 상태인 meeting 찾기
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id')
        .eq('team_id', team.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (!meeting) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // messages INSERT (source: slack)
      await supabase.from('messages').insert({
        meeting_id: meeting.id,
        content: event.text,
        source: 'slack',
        is_ai: false,
      });

      // @Milo 멘션이거나 app_mention 이벤트면 milo-analyze 호출
      if (event.type === 'app_mention' || /@milo|milo/i.test(event.text)) {
        const analyzeRes = await fetch(
          `${SUPABASE_URL}/functions/v1/milo-analyze`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
              messages: [{ content: event.text, user: { name: 'Slack 사용자' } }],
              agenda: null,
              preset: 'default',
            }),
          }
        );
        const result = await analyzeRes.json();

        if (result?.should_respond && result.response_text) {
          await postToSlack(event.channel, result.response_text, event.ts);
          await supabase.from('messages').insert({
            meeting_id: meeting.id,
            content: result.response_text,
            source: 'slack',
            is_ai: true,
            ai_type: result.ai_type,
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
