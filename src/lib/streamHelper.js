// Phase 1.5 스트리밍 호출 헬퍼
// milo-stream Edge Function을 POST로 호출.
// 클라이언트는 응답 JSON은 최소 메타정보만 확인 (실제 UI는 Broadcast 이벤트로 진행).

import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

/**
 * 스트리밍으로 AI 응답 생성 (전문가 응답·Milo 종합 전용)
 *
 * @param {object} params
 * @param {string} params.meetingId
 * @param {string} params.systemPrompt       — 완성된 시스템 프롬프트
 * @param {string} params.userPrompt         — 완성된 유저 프롬프트
 * @param {string} params.model              — 'claude-haiku-4-5' 등 API model id
 * @param {string} params.aiEmployee         — 'milo' | 'kotler' | ...
 * @param {string} [params.agendaId]
 * @param {string} [params.aiType]
 * @param {string} [params.orchestrationVersion]
 * @param {string|null} [params.miloSynthesisId]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{tempId:string, finalMsgId?:string, elapsed:number, length:number}>}
 */
export async function streamAiResponse(params) {
  if (!SUPABASE_ENABLED) throw new Error('SUPABASE_DISABLED');

  const tempId =
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const body = {
    meetingId: params.meetingId,
    tempId,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    model: params.model,
    aiEmployee: params.aiEmployee,
    agendaId: params.agendaId || null,
    aiType: params.aiType || 'insight',
    orchestrationVersion: params.orchestrationVersion || null,
    miloSynthesisId: params.miloSynthesisId || null,
  };

  const { data, error } = await supabase.functions.invoke('milo-stream', {
    body,
  });

  if (error) {
    console.error('[streamAiResponse] Edge Function error:', error);
    throw new Error(error.message || 'stream_failed');
  }

  return { tempId, ...(data || {}) };
}
