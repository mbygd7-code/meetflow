// Supabase Edge Function — 회의 종료 시 전체 요약 생성
// Deploy: supabase functions deploy generate-summary
//
// POST body: { meetingId, messages, agendas }
// Returns: { decisions, discussions, deferred, action_items, milo_insights }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { meetingId, messages, agendas } = await req.json();

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey });

    const transcript = messages
      .map((m: any) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
      .join('\n');

    const agendaList = agendas.map((a: any, i: number) => `${i + 1}. ${a.title}`).join('\n');

    const prompt = `## 회의 전체 기록

### 어젠다
${agendaList}

### 대화
${transcript}

## 과제
회의 전체를 다음 4개 섹션으로 구조화하라. 반드시 JSON 형식으로만 응답.

{
  "decisions": [{ "title": string, "detail": string }],
  "discussions": [{ "title": string, "detail": string }],
  "deferred": [{ "title": string, "reason": string }],
  "action_items": [{ "title": string, "assignee_hint": string, "priority": "low"|"medium"|"high"|"urgent", "due_hint": string }],
  "milo_insights": string
}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system:
        '당신은 회의록을 정확하고 간결하게 구조화하는 전문가입니다. 반드시 한국어 JSON으로만 응답하세요.',
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock: any = response.content.find((b: any) => b.type === 'text');
    const raw = textBlock?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const summary = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // DB에 저장
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('meeting_summaries').insert({
      meeting_id: meetingId,
      decisions: summary.decisions || [],
      discussions: summary.discussions || [],
      deferred: summary.deferred || [],
      action_items: summary.action_items || [],
      milo_insights: summary.milo_insights || '',
    });

    // action_items -> tasks 자동 생성
    if (Array.isArray(summary.action_items) && summary.action_items.length > 0) {
      const taskRows = summary.action_items.map((a: any) => ({
        meeting_id: meetingId,
        title: a.title,
        priority: a.priority || 'medium',
        status: 'todo',
        ai_suggested: true,
      }));
      await supabase.from('tasks').insert(taskRows);
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-summary]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
