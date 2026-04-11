// Claude API 호출 래퍼
// Vite 프록시를 통해 /api/claude → https://api.anthropic.com 으로 포워딩

import { MILO_SYSTEM_PROMPT, MILO_ANALYZE_PROMPT, buildMiloSystemPrompt } from '@/utils/miloPrompts';

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

async function callClaude({ system, userPrompt, maxTokens = 1024, model }) {
  const useModel = model || DEFAULT_MODEL;
  console.log(`[claude] Using model: ${useModel}`);

  const res = await fetch('/api/claude/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[1]);
  } catch {
    return null;
  }
}

/**
 * Milo 분석 — Claude API 호출
 */
export async function analyzeMilo({ messages, agenda, preset = 'default', context = {}, miloSettings = null }) {
  if (!API_KEY) {
    console.warn('[claude] VITE_ANTHROPIC_API_KEY not set, skipping API call');
    return { should_respond: false };
  }

  // AI 팀원의 시스템 프롬프트 + JSON 응답 형식 지시 항상 추가
  const JSON_FORMAT_INSTRUCTION = `

## 응답 형식 (반드시 준수)
반드시 순수 JSON만 응답하세요. 마크다운이나 설명 텍스트를 포함하지 마세요.
response_text에는 회의 참가자에게 보여줄 깔끔한 메시지만 작성하세요.
내부 판단 과정, should_respond 설명 등을 response_text에 넣지 마세요.
{
  "should_respond": boolean,
  "response_text": "회의 참가자에게 보여줄 깔끔한 응답 메시지",
  "ai_type": "data" | "insight" | "question" | "summary" | "nudge"
}`;

  let basePrompt = miloSettings?.systemPromptOverride
    ? miloSettings.systemPromptOverride
    : miloSettings ? buildMiloSystemPrompt(miloSettings) : MILO_SYSTEM_PROMPT;

  // AI팀원 전용 프롬프트에는 JSON 형식이 없을 수 있으므로 항상 추가
  const systemPrompt = basePrompt + JSON_FORMAT_INSTRUCTION;
  const userPrompt = MILO_ANALYZE_PROMPT(messages, agenda);

  const raw = await callClaude({
    system: systemPrompt,
    userPrompt,
    maxTokens: 512,
    model: miloSettings?.apiModelId || undefined,
  });

  const parsed = parseJSON(raw);
  if (parsed) {
    // response_text에서 내부 메타데이터 제거
    if (parsed.response_text) {
      parsed.response_text = parsed.response_text
        .replace(/\*\*판단 결과[^*]*\*\*/g, '')
        .replace(/^---\s*/gm, '')
        .replace(/^##\s*코멘트\s*/gm, '')
        .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
        .trim();
    }
    return parsed;
  }

  // JSON 파싱 실패 시 — raw 텍스트에서 메타데이터 제거 후 사용
  let cleanText = raw
    .replace(/\*\*판단 결과[^*]*\*\*/g, '')
    .replace(/^---\s*/gm, '')
    .replace(/^##\s*코멘트\s*/gm, '')
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
    .replace(/should_respond[^}]*/g, '')
    .trim();

  if (!cleanText) cleanText = '논의 내용을 검토 중입니다.';

  return {
    should_respond: true,
    response_text: cleanText,
    ai_type: 'insight',
  };
}

/**
 * 회의 요약 생성 — Claude API 호출
 */
export async function generateSummary({ meetingId, messages, agendas }) {
  if (!API_KEY) {
    throw new Error('VITE_ANTHROPIC_API_KEY is not configured');
  }

  const { MILO_SUMMARY_PROMPT } = await import('@/utils/miloPrompts');
  const userPrompt = MILO_SUMMARY_PROMPT(messages, agendas);

  const raw = await callClaude({
    system: MILO_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2048,
  });

  const parsed = parseJSON(raw);
  if (parsed) return parsed;

  return {
    decisions: [],
    discussions: [],
    deferred: [],
    action_items: [],
    milo_insights: raw.trim(),
  };
}
