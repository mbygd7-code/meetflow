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

    // 참가자 이름 집합 (assignee_hint 검증용)
    const participantNames = Array.from(
      new Set(
        (messages || [])
          .map((m: any) => m.user?.name)
          .filter((n: any) => typeof n === 'string' && n.trim().length > 0)
      )
    );

    const transcript = (messages || [])
      .map((m: any) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
      .join('\n');

    const agendaList = (agendas || [])
      .map((a: any, i: number) => `${i + 1}. ${a.title}`)
      .join('\n');

    const prompt = `## 회의 전체 기록

### 어젠다
${agendaList || '(등록된 어젠다 없음)'}

### 대화 참가자 (실제 발언자)
${participantNames.length ? participantNames.join(', ') : '(없음)'}

### 대화 기록
${transcript || '(대화 내용 없음)'}

## 절대 규칙 (중요 — 위반 시 사용자가 치명적으로 오해함)
1. 위 대화 기록에 실제로 등장한 내용만 추출한다. 추측·창작·일반적 지식으로 내용을 만들어내지 않는다.
2. 대화에 해당 내용이 없으면 해당 섹션은 **반드시 빈 배열 []** 로 반환한다. 빈 칸을 채우기 위해 내용을 지어내지 말 것.
3. 사람 이름(담당자, assignee_hint, detail 안의 이름 등)은 **반드시 위 "실제 발언자" 목록에 있는 이름만** 사용한다. 목록에 없는 이름(예: 박서연, 이도윤, 김지우 등 샘플 이름)을 절대 쓰지 않는다. 담당자가 불분명하면 빈 문자열 "" 로 둔다.
4. 숫자/날짜/수치/KPI는 대화에 명시적으로 등장한 것만 인용한다. 추정 수치("15% 개선", "7일 이탈률" 등)를 임의로 만들어내지 않는다.
5. milo_insights는 실제 대화에서 드러난 패턴만 언급한다. 정보가 부족하면 "이번 회의는 기록된 대화량이 적어 요약 가능한 결정·토론이 많지 않습니다." 와 같이 사실대로 적는다.
6. action_items의 due_hint는 대화에서 기한을 언급한 경우에만 채우고, 없으면 빈 문자열 "" 로 둔다.
7. priority는 대화에서 긴급성을 표현한 경우에만 high/urgent를 붙이고, 근거가 없으면 "medium".
8. 반드시 한국어 JSON으로만 응답 (코드 펜스 금지, 설명 문장 금지).

## 출력 스키마
{
  "decisions": [{ "title": string, "detail": string, "owner": string }],
  "discussions": [{ "title": string, "detail": string }],
  "deferred": [{ "title": string, "reason": string }],
  "action_items": [{ "title": string, "assignee_hint": string, "priority": "low"|"medium"|"high"|"urgent", "due_hint": string }],
  "milo_insights": string
}`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system:
        '당신은 회의록 요약 전문가입니다. 기록된 대화에서 "명시적으로 확인 가능한 사실"만 추출합니다. 추측·창작·샘플 이름 주입을 절대 하지 않으며, 근거가 없으면 빈 배열/빈 문자열로 응답합니다. 출력은 한국어 JSON만.',
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
