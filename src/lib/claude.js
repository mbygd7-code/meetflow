// Claude API 호출 래퍼 — Harness Layer 적용
// Supabase Edge Function을 통해 서버사이드에서 Claude API 호출 (API 키 미노출)
// Retry + Circuit Breaker + Structured Logging으로 안정성·관찰성 보장

import { supabase } from '@/lib/supabase';
import {
  withRetry,
  CircuitBreaker,
  CircuitOpenError,
  createRequestContext,
  logAiCall,
} from '@/lib/harness';

// ── 글로벌 Circuit Breaker (모든 AI 호출 공유) ──
// 연속 3회 실패 → 30초 차단 → HALF_OPEN 1회 시험
const aiCircuitBreaker = new CircuitBreaker({ threshold: 3, resetMs: 30000 });

/**
 * Milo 분석 — Supabase Edge Function 'milo-analyze' 호출
 * Harness: withRetry(1회 재시도) + CircuitBreaker(3연속 실패 시 30초 차단) + 구조화 로깅
 */
export async function analyzeMilo({ messages, agenda, preset = 'default', context = {}, miloSettings = null, compressedContext = '', googleDocsSummary = null, signal = null, skipKnowledge = false }) {
  const employeeId = miloSettings?.aiEmployee || 'milo';
  const ctx = createRequestContext(null, employeeId);

  try {
    const data = await aiCircuitBreaker.call(() =>
      withRetry(
        async () => {
          const invokeOptions = {
            body: {
              messages: (messages || []).slice(-15),
              agenda,
              preset,
              context,
              compressedContext,
              googleDocsSummary,
              skipKnowledge,
              miloSettings: miloSettings
                ? {
                    systemPromptOverride: miloSettings.systemPromptOverride,
                    apiModelId: miloSettings.apiModelId,
                    aiEmployee: miloSettings.aiEmployee,
                    skipGoogleDocsFullInject: miloSettings.skipGoogleDocsFullInject || false,
                  }
                : null,
            },
          };
          if (signal) invokeOptions.signal = signal;

          const { data, error } = await supabase.functions.invoke('milo-analyze', invokeOptions);
          if (error) {
            // AbortError는 재시도 없이 즉시 throw (withRetry가 re-throw)
            if (error.name === 'AbortError' || signal?.aborted) throw error;
            throw error;
          }
          return data;
        },
        { maxRetries: 1, baseMs: 1500, signal }
      )
    );

    // response_text 정제
    if (data?.response_text) {
      data.response_text = data.response_text
        .replace(/\*\*판단 결과[^*]*\*\*/g, '')
        .replace(/^---\s*/gm, '')
        .replace(/^##\s*코멘트\s*/gm, '')
        .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim())
        .trim();
    }

    logAiCall(ctx, data);
    return data || { should_respond: false };
  } catch (err) {
    // AbortError는 조용히 처리 (타임아웃/취소)
    if (err?.name === 'AbortError' || signal?.aborted) {
      return null;
    }

    logAiCall(ctx, null, err);

    // CircuitOpenError → 서킷이 열려있어 즉시 실패
    if (err instanceof CircuitOpenError) {
      return {
        should_respond: true,
        response_text: '[밀로] AI 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.',
        ai_type: 'nudge',
        ai_employee: employeeId,
        _harnessError: 'circuit_open',
      };
    }

    // 일반 에러 → 사용자 피드백
    return {
      should_respond: true,
      response_text: '[밀로] 죄송합니다, 잠시 응답 처리에 문제가 있었습니다. 다시 시도해주세요.',
      ai_type: 'nudge',
      ai_employee: employeeId,
      _harnessError: 'invoke_failed',
    };
  }
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
export async function generateSummary({ meetingId, messages, agendas, meetingTitle = null }) {
  const { data, error } = await supabase.functions.invoke('generate-summary', {
    body: { meetingId, messages, agendas, meetingTitle },
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
