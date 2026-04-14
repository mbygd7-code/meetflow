// Claude API 호출 래퍼
// Supabase Edge Function을 통해 서버사이드에서 Claude API 호출 (API 키 미노출)

import { supabase } from '@/lib/supabase';

/**
 * Milo 분석 — Supabase Edge Function 'milo-analyze' 호출
 */
export async function analyzeMilo({ messages, agenda, preset = 'default', context = {}, miloSettings = null }) {
  const { data, error } = await supabase.functions.invoke('milo-analyze', {
    body: {
      messages: (messages || []).slice(-15),
      agenda,
      preset,
      context,
      miloSettings: miloSettings
        ? {
            systemPromptOverride: miloSettings.systemPromptOverride,
            apiModelId: miloSettings.apiModelId,
          }
        : null,
    },
  });

  if (error) {
    console.error('[analyzeMilo] Edge Function error:', error);
    return { should_respond: false };
  }

  // response_text 정제
  if (data?.response_text) {
    data.response_text = data.response_text
      .replace(/\*\*판단 결과[^*]*\*\*/g, '')
      .replace(/^---\s*/gm, '')
      .replace(/^##\s*코멘트\s*/gm, '')
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
      .trim();
  }

  return data || { should_respond: false };
}

/**
 * 회의 요약 생성 — Supabase Edge Function 'generate-summary' 호출
 */
export async function generateSummary({ meetingId, messages, agendas }) {
  const { data, error } = await supabase.functions.invoke('generate-summary', {
    body: { meetingId, messages, agendas },
  });

  if (error) {
    console.error('[generateSummary] Edge Function error:', error);
    throw new Error(error.message || 'Summary generation failed');
  }

  return data || {
    decisions: [],
    discussions: [],
    deferred: [],
    action_items: [],
    milo_insights: '',
  };
}
