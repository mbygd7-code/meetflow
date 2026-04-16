// Claude API 호출 래퍼
// Supabase Edge Function을 통해 서버사이드에서 Claude API 호출 (API 키 미노출)

import { supabase } from '@/lib/supabase';

/**
 * Milo 분석 — Supabase Edge Function 'milo-analyze' 호출
 * @param {AbortSignal} signal - 요청 취소용 (옵션)
 */
export async function analyzeMilo({ messages, agenda, preset = 'default', context = {}, miloSettings = null, compressedContext = '', googleDocsSummary = null, signal = null, skipKnowledge = false }) {
  const invokeOptions = {
    body: {
      messages: (messages || []).slice(-15),
      agenda,
      preset,
      context,
      compressedContext,
      googleDocsSummary,
      skipKnowledge, // Milo 호출 시 true (retrieval 생략, 토큰 절약)
      miloSettings: miloSettings
        ? {
            systemPromptOverride: miloSettings.systemPromptOverride,
            apiModelId: miloSettings.apiModelId,
            aiEmployee: miloSettings.aiEmployee, // Edge Function에서 retrieval 대상 결정
          }
        : null,
    },
  };
  // AbortSignal 지원 (Supabase JS v2.46+)
  if (signal) invokeOptions.signal = signal;

  const { data, error } = await supabase.functions.invoke('milo-analyze', invokeOptions);

  if (error) {
    // AbortError는 조용히 처리 (타임아웃/취소)
    if (error.name === 'AbortError' || signal?.aborted) {
      console.warn('[analyzeMilo] Request aborted');
      return null;
    }
    console.error('[analyzeMilo] Edge Function error:', error.message || error);
    // 에러 시 사용자에게 피드백 메시지 반환
    return {
      should_respond: true,
      response_text: '[밀로] 죄송합니다, 잠시 응답 처리에 문제가 있었습니다. 다시 시도해주세요.',
      ai_type: 'nudge',
      ai_employee: 'milo',
    };
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
 * 대화 압축 — 이전 메시지들을 3줄 요약으로 압축
 * Edge Function을 재사용하되, 요약 전용 프롬프트를 주입
 */
export async function compressConversation(messages) {
  if (!messages?.length) return '';
  const transcript = messages
    .map((m) => `[${m.user?.name || (m.is_ai ? 'AI' : '참가자')}] ${m.content?.slice(0, 150)}`)
    .join('\n');

  const { data, error } = await supabase.functions.invoke('milo-analyze', {
    body: {
      messages: [],
      agenda: { title: '대화 압축' },
      preset: 'default',
      context: {},
      miloSettings: {
        systemPromptOverride: `당신은 회의 대화 요약 전문가입니다. 반드시 아래 JSON으로만 응답하세요.
{"should_respond":true,"response_text":"요약 내용","ai_type":"summary"}`,
        apiModelId: 'claude-haiku-4-5-20251001',
      },
      compressedContext: `다음 대화를 3~5줄로 요약하라. 핵심 결정사항, 미해결 질문, 주요 의견 대립점을 포함하라. 간결하게.\n\n${transcript}`,
    },
  });

  if (error || !data?.response_text) return '';
  return data.response_text;
}

/**
 * 지식 파일 Contextual Retrieval 인덱싱
 * — 파일 업로드 후 호출. Haiku로 청크별 맥락 생성 + OpenAI 임베딩 + pgvector 저장
 * @returns { ok, chunks, summary_length }
 */
export async function processKnowledgeFile({ fileId, employeeId, content }) {
  if (!fileId || !employeeId || !content) {
    throw new Error('fileId, employeeId, content required');
  }
  const { data, error } = await supabase.functions.invoke('contextualize-knowledge', {
    body: { fileId, employeeId, content },
  });
  if (error) {
    console.error('[processKnowledgeFile] Edge Function error:', error.message || error);
    throw new Error(error.message || 'Indexing failed');
  }
  return data || { ok: false };
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
