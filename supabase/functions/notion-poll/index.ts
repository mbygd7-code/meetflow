// Supabase Edge Function — Notion → MeetFlow 역동기화 (폴링)
// 스케줄: 5분 간격으로 pg_cron 또는 외부 스케줄러에서 호출
//
// POST (no body)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NOTION_API_KEY = Deno.env.get('NOTION_API_KEY')!;
const NOTION_VERSION = '2022-06-28';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id,notion_block_id,status')
    .not('notion_block_id', 'is', null);

  let updated = 0;

  for (const task of tasks || []) {
    try {
      const res = await fetch(
        `https://api.notion.com/v1/pages/${task.notion_block_id}`,
        {
          headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': NOTION_VERSION,
          },
        }
      );
      if (!res.ok) continue;
      const page = await res.json();

      const notionStatus = page.properties?.Status?.select?.name?.toLowerCase();
      if (notionStatus && notionStatus !== task.status) {
        await supabase
          .from('tasks')
          .update({ status: notionStatus, updated_at: new Date().toISOString() })
          .eq('id', task.id);
        updated++;
      }
    } catch (err) {
      console.error('[notion-poll]', task.id, err);
    }
  }

  return new Response(JSON.stringify({ ok: true, updated }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
