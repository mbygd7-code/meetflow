// Supabase Edge Function — Milo AI 분석
// Deploy: supabase functions deploy milo-analyze
//
// POST body: { messages, agenda, preset, context }
// Returns: { should_respond, response_text, ai_type, suggested_tasks? }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.30.0';

const MILO_SYSTEM_PROMPT = `당신은 MeetFlow의 AI 팀원 "Milo"입니다.

역할: 회의에 참여하는 조용하지만 날카로운 동료
원칙:
1. 최소 개입 — 필요한 순간에만 한마디
2. 의견이 아닌 정보 — "~라는 데이터가 있어요"
3. 겸손한 톤 — "참고로~", "검토해볼 만합니다"
4. 투명한 출처 — 데이터 인용 시 반드시 출처 명시
5. 침묵도 선택지

개입 시점: 데이터 근거 / 사각지대 / 시간 초과 / 결정 확인 / 용어 설명 / 과거 연결
금지: 특정인 비판, 성과 언급, 결정 강요, 감정적 표현
응답: 한국어, 최대 3-4문장 (@호출 시 5-8문장)

반드시 다음 JSON 스키마로만 응답:
{
  "should_respond": boolean,
  "response_text": string,
  "ai_type": "data" | "insight" | "question" | "summary" | "nudge",
  "suggested_tasks": [{ "title": string, "priority": "low"|"medium"|"high"|"urgent" }]
}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, agenda, preset, context, miloSettings, compressedContext, googleDocsSummary } = await req.json();

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const transcript = (messages || [])
      .slice(-15)
      .map((m: any) => `[${m.user?.name || (m.is_ai ? 'Milo' : '참가자')}] ${m.content}`)
      .join('\n');

    // 미리 요약된 Google 문서 데이터 (클라이언트에서 동기화됨)
    let sheetsSection = '';
    if (googleDocsSummary) {
      sheetsSection = `## 참조 데이터 (사전 동기화)\n이 데이터는 실제 DB/문서에서 동기화된 것입니다. 이 수치를 근거로 답변하세요.\n\n${googleDocsSummary}\n\n`;
    }
    // 참가자 목록 (AI가 @멘션할 수 있도록)
    const participantList = (context?.participants || []).length > 0
      ? `## 회의 참가자 (실제 사람)\n${context.participants.map((n: string) => `- ${n}`).join('\n')}\n`
      : '';

    // 압축된 이전 컨텍스트
    const compressedSection = compressedContext
      ? `## 이전 논의 요약 (압축)\n${compressedContext}\n\n`
      : '';

    const userPrompt = `## 현재 어젠다
${agenda?.title || '미지정'} (${agenda?.duration_minutes || 10}분)

${participantList}${compressedSection}${sheetsSection}## 최근 대화
${transcript}

## 프리셋
${preset || 'default'}

## 도메인 넘김 규칙 (중요!)
- 자신의 전문 분야가 아닌 질문은 해당 전문가에게 넘겨라
- 비주얼/이미지/디자인 → "노먼에게 확인해보겠습니다"
- 법률/개인정보 → "코르프에게 확인해보겠습니다"
- 데이터/지표 → "데밍에게 확인해보겠습니다"
- 마케팅/브랜드 → "코틀러에게 확인해보겠습니다"
- 교육/보육 → "프뢰벨에게 확인해보겠습니다"
- 자신의 전문 분야만 간단히 코멘트하고 전문가 이름을 반드시 언급하여 넘겨라

## 과제
위 대화 흐름을 검토하고 Milo가 개입할지 판단하라. 개입이 필요하면 짧은 코멘트만 작성 (3~4문장).
@Milo 직접 호출이 있다면 반드시 응답 (5~8문장).
참가자에게 질문할 때 반드시 @이름 형식으로 멘션하라 (예: "@명배영님, ...").
응답이 필요 없다면 should_respond=false.`;

    // miloSettings에서 커스텀 시스템 프롬프트 / 모델 지원
    const systemPrompt = miloSettings?.systemPromptOverride || MILO_SYSTEM_PROMPT;
    const model = miloSettings?.apiModelId || 'claude-sonnet-4-20250514';

    const JSON_FORMAT_INSTRUCTION = `\n\n## 응답 형식 (반드시 준수)\n반드시 순수 JSON만 응답하세요. 마크다운이나 설명 텍스트를 포함하지 마세요.\nresponse_text에는 회의 참가자에게 보여줄 깔끔한 메시지만 작성하세요.\n{\n  "should_respond": boolean,\n  "response_text": "회의 참가자에게 보여줄 깔끔한 응답 메시지",\n  "ai_type": "data" | "insight" | "question" | "summary" | "nudge"\n}`;

    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      system: systemPrompt + JSON_FORMAT_INSTRUCTION,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    const raw = textBlock?.text || '{}';

    // JSON 추출
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { should_respond: false };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[milo-analyze]', err);
    return new Response(
      JSON.stringify({ error: String(err), should_respond: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
