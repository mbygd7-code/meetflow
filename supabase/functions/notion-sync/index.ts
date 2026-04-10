// Supabase Edge Function — Notion 동기화
// Deploy: supabase functions deploy notion-sync
//
// POST body: { action: 'archive_meeting' | 'create_task' | 'update_task', payload }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NOTION_API_KEY = Deno.env.get('NOTION_API_KEY')!;
const NOTION_VERSION = '2022-06-28';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

async function notionFetch(path: string, method: string, body?: any) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Notion API ${res.status}: ${errorText}`);
  }
  return res.json();
}

// ───── 회의록 → Notion 페이지 ─────
async function archiveMeeting(supabase: any, meetingId: string) {
  const { data: meeting } = await supabase
    .from('meetings')
    .select('*, team:teams(notion_database_id)')
    .eq('id', meetingId)
    .single();

  if (!meeting?.team?.notion_database_id) throw new Error('No Notion DB configured');

  const { data: summary } = await supabase
    .from('meeting_summaries')
    .select('*')
    .eq('meeting_id', meetingId)
    .single();

  const children: any[] = [];

  const addHeading = (text: string) =>
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
    });

  const addBullet = (text: string) =>
    children.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] },
    });

  const addTodo = (text: string) =>
    children.push({
      object: 'block',
      type: 'to_do',
      to_do: {
        rich_text: [{ type: 'text', text: { content: text } }],
        checked: false,
      },
    });

  const addParagraph = (text: string) =>
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
    });

  addHeading('결정 사항');
  (summary?.decisions || []).forEach((d: any) =>
    addBullet(`${d.title}${d.detail ? ' — ' + d.detail : ''}`)
  );

  addHeading('논의 중');
  (summary?.discussions || []).forEach((d: any) =>
    addBullet(`${d.title}${d.detail ? ' — ' + d.detail : ''}`)
  );

  addHeading('보류');
  (summary?.deferred || []).forEach((d: any) =>
    addBullet(`${d.title}${d.reason ? ' — ' + d.reason : ''}`)
  );

  addHeading('후속 태스크');
  (summary?.action_items || []).forEach((a: any) =>
    addTodo(`${a.title} (${a.assignee_hint || '미정'}, ${a.due_hint || ''})`)
  );

  addHeading('Milo 인사이트');
  addParagraph(summary?.milo_insights || '');

  const page = await notionFetch('/pages', 'POST', {
    parent: { database_id: meeting.team.notion_database_id },
    properties: {
      Title: { title: [{ text: { content: meeting.title } }] },
      Status: { select: { name: 'Completed' } },
      Date: { date: { start: meeting.started_at || meeting.created_at } },
    },
    children,
  });

  // 저장
  await supabase
    .from('meeting_summaries')
    .update({ notion_page_id: page.id })
    .eq('meeting_id', meetingId);

  return page;
}

// ───── 태스크 → Notion DB row ─────
async function createNotionTask(supabase: any, taskId: string) {
  const { data: task } = await supabase
    .from('tasks')
    .select('*, team:teams(notion_database_id), meeting:meetings(title)')
    .eq('id', taskId)
    .single();

  if (!task?.team?.notion_database_id) throw new Error('No Notion DB');

  const page = await notionFetch('/pages', 'POST', {
    parent: { database_id: task.team.notion_database_id },
    properties: {
      Name: { title: [{ text: { content: task.title } }] },
      Status: { select: { name: task.status } },
      Priority: { select: { name: task.priority } },
      ...(task.due_date && { DueDate: { date: { start: task.due_date } } }),
      ...(task.meeting?.title && {
        Meeting: { rich_text: [{ text: { content: task.meeting.title } }] },
      }),
    },
  });

  await supabase
    .from('tasks')
    .update({ notion_block_id: page.id })
    .eq('id', taskId);

  return page;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let result;
    switch (action) {
      case 'archive_meeting':
        result = await archiveMeeting(supabase, payload.meeting_id);
        break;
      case 'create_task':
        result = await createNotionTask(supabase, payload.task_id);
        break;
      case 'update_task':
        if (!payload.notion_block_id) break;
        result = await notionFetch(`/pages/${payload.notion_block_id}`, 'PATCH', {
          properties: {
            Status: { select: { name: payload.status } },
          },
        });
        break;
      default:
        return new Response(JSON.stringify({ error: 'unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notion-sync]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
