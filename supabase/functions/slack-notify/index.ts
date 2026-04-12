// Supabase Edge Function — DB 변경 → Slack 통지
// 호출: 다른 함수/DB 트리거에서 HTTP POST
// Body: { event: 'meeting_start'|'meeting_end'|'task_assigned'|'message'|..., payload }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function postSlack(channel: string, payload: any) {
  return fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel, ...payload }),
  });
}

async function uploadFileToSlack(channel: string, file: any, threadTs?: string) {
  // base64 → binary
  const binaryStr = atob(file.base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const formData = new FormData();
  formData.append('file', new Blob([bytes], { type: file.type }), file.name);
  formData.append('channels', channel);
  formData.append('filename', file.name);
  formData.append('title', file.name);
  if (threadTs) formData.append('thread_ts', threadTs);

  const res = await fetch('https://slack.com/api/files.upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    body: formData,
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { event, payload } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    switch (event) {
      case 'meeting_start': {
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', payload.team_id)
          .single();
        if (!team?.slack_channel_id) break;

        const agendaList = (payload.agendas || [])
          .map((a: any, i: number) => `${i + 1}. ${a.title} (${a.duration_minutes}분)`)
          .join('\n');

        await postSlack(team.slack_channel_id, {
          text: `🚀 *${payload.title}* 회의가 시작되었어요\n\n*어젠다*\n${agendaList}`,
        });
        break;
      }

      case 'meeting_end': {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('team_id,title')
          .eq('id', payload.meeting_id)
          .single();
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', meeting?.team_id)
          .single();
        if (!team?.slack_channel_id) break;

        const { data: summary } = await supabase
          .from('meeting_summaries')
          .select('decisions,action_items,milo_insights')
          .eq('meeting_id', payload.meeting_id)
          .single();

        const decisions = (summary?.decisions || [])
          .map((d: any) => `• ${d.title}`)
          .join('\n');
        const tasks = (summary?.action_items || [])
          .map((a: any) => `✓ ${a.title}`)
          .join('\n');

        await postSlack(team.slack_channel_id, {
          text: `✅ *${meeting?.title}* 회의가 종료되었어요`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `✅ ${meeting?.title}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*결정 사항*\n${decisions || '_없음_'}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*후속 태스크*\n${tasks || '_없음_'}` },
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `🤖 Milo: ${summary?.milo_insights || ''}` },
              ],
            },
          ],
        });
        break;
      }

      case 'message': {
        // web → slack 동기화
        if (payload.source !== 'web') break;
        const { data: meeting } = await supabase
          .from('meetings')
          .select('team_id')
          .eq('id', payload.meeting_id)
          .single();
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', meeting?.team_id)
          .single();
        if (!team?.slack_channel_id) break;

        const senderName = payload.user?.name || 'MeetFlow 사용자';
        await postSlack(team.slack_channel_id, {
          text: `*${senderName}*: ${payload.content}`,
        });
        break;
      }

      case 'meeting_request': {
        const { data: reqTeam } = await supabase
          .from('teams')
          .select('slack_channel_id')
          .eq('id', payload.team_id)
          .single();
        if (!reqTeam?.slack_channel_id) break;

        const reqAgendas = (payload.agendas || [])
          .map((a: any, i: number) => `${i + 1}. ${a.title} (${a.duration_minutes}분)`)
          .join('\n');
        const participantNames = (payload.participants || []).join(', ');
        const scheduleInfo = payload.scheduled_date && payload.scheduled_time
          ? `📅 ${payload.scheduled_date} ${payload.scheduled_time} (${payload.duration || 30}분)`
          : '📅 시간 미정';

        const fileCount = (payload.files || []).length;
        const fileNotice = fileCount > 0 ? `\n📎 첨부 파일 ${fileCount}개` : '';

        const msgRes = await postSlack(reqTeam.slack_channel_id, {
          text: `📋 *${payload.requested_by}*님이 새 회의를 요청했어요`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `📋 회의 요청: ${payload.title}` },
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*요청자:* ${payload.requested_by}\n${scheduleInfo}\n*참석자:* ${participantNames}${fileNotice}` },
            },
            ...(reqAgendas ? [{
              type: 'section',
              text: { type: 'mrkdwn', text: `*어젠다*\n${reqAgendas}` },
            }] : []),
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: '🤖 MeetFlow에서 전송됨 · Google Calendar에도 등록되었습니다' },
              ],
            },
          ],
        });

        // 첨부 파일 업로드 (메시지 스레드에 연결)
        if (fileCount > 0) {
          const msgJson = await msgRes.json();
          const threadTs = msgJson?.ts;
          console.log('[slack-notify] 메시지 응답:', JSON.stringify(msgJson));
          console.log('[slack-notify] threadTs:', threadTs);
          console.log('[slack-notify] 파일 개수:', payload.files.length);
          for (const file of payload.files) {
            try {
              console.log('[slack-notify] 파일 업로드 시작:', file.name, 'base64 길이:', file.base64?.length);
              const uploadResult = await uploadFileToSlack(reqTeam.slack_channel_id, file, threadTs);
              console.log('[slack-notify] 파일 업로드 결과:', JSON.stringify(uploadResult));
            } catch (fileErr) {
              console.error('[slack-notify] 파일 업로드 실패:', file.name, fileErr);
            }
          }
        }
        break;
      }

      case 'task_assigned': {
        if (!payload.assignee_slack_id) break;
        await postSlack(payload.assignee_slack_id, {
          text: `📌 새 태스크가 배정되었어요: *${payload.title}*\n마감: ${payload.due_date || '미정'}\n우선순위: ${payload.priority}`,
        });
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[slack-notify]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
