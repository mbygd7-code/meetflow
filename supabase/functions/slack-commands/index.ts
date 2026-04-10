// Supabase Edge Function — Slack Slash Commands
// /meetflow start, /meetflow tasks, /meetflow summary
//
// Deploy: supabase functions deploy slack-commands --no-verify-jwt

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const formData = await req.formData();
  const text = formData.get('text')?.toString() || '';
  const channel_id = formData.get('channel_id')?.toString() || '';
  const user_id = formData.get('user_id')?.toString() || '';

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const [subcommand, ...rest] = text.trim().split(/\s+/);

  if (subcommand === 'start') {
    return jsonResponse({
      response_type: 'in_channel',
      text: '🚀 MeetFlow 웹에서 회의를 시작해주세요: ' + Deno.env.get('MEETFLOW_WEB_URL'),
    });
  }

  if (subcommand === 'tasks') {
    // Slack user_id → MeetFlow user 매핑 필요 (users 테이블에 slack_user_id 컬럼 추가)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('title,priority,due_date,status')
      .eq('status', 'todo')
      .limit(10);

    const list = (tasks || [])
      .map((t) => `• *${t.title}* (${t.priority}) ${t.due_date || ''}`)
      .join('\n') || '_할당된 태스크가 없습니다_';

    return jsonResponse({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📋 내 태스크' },
        },
        { type: 'section', text: { type: 'mrkdwn', text: list } },
      ],
    });
  }

  if (subcommand === 'summary') {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('slack_channel_id', channel_id)
      .single();
    if (!team) {
      return jsonResponse({
        response_type: 'ephemeral',
        text: '이 채널에 연결된 팀을 찾을 수 없습니다.',
      });
    }

    const { data: meeting } = await supabase
      .from('meetings')
      .select('id,title')
      .eq('team_id', team.id)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(1)
      .single();

    if (!meeting) {
      return jsonResponse({
        response_type: 'ephemeral',
        text: '최근 완료된 회의가 없습니다.',
      });
    }

    const { data: summary } = await supabase
      .from('meeting_summaries')
      .select('decisions,action_items,milo_insights')
      .eq('meeting_id', meeting.id)
      .single();

    const decisions = (summary?.decisions || [])
      .map((d: any) => `• ${d.title}`)
      .join('\n') || '_없음_';
    const tasks = (summary?.action_items || [])
      .map((a: any) => `✓ ${a.title}`)
      .join('\n') || '_없음_';

    return jsonResponse({
      response_type: 'in_channel',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📝 ${meeting.title}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*결정 사항*\n${decisions}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*후속 태스크*\n${tasks}` },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `🤖 Milo: ${summary?.milo_insights || ''}` },
          ],
        },
      ],
    });
  }

  return jsonResponse({
    response_type: 'ephemeral',
    text: '사용법: `/meetflow [start|tasks|summary]`',
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}
