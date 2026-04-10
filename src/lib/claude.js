// Claude API 호출 래퍼
// 실제 호출은 Supabase Edge Function에서 수행합니다 (API 키 보호).
// 이 파일은 클라이언트에서 Edge Function을 호출하는 래퍼입니다.

import { supabase } from './supabase';

/**
 * milo-analyze Edge Function 호출
 * @param {Object} params
 * @param {Array} params.messages - 최근 메시지 배열
 * @param {Object} params.agenda - 현재 어젠다
 * @param {string} params.preset - Milo 프리셋 (default/coach/analyst/recorder)
 * @param {Object} params.context - 추가 컨텍스트
 */
export async function analyzeMilo({ messages, agenda, preset = 'default', context = {} }) {
  const { data, error } = await supabase.functions.invoke('milo-analyze', {
    body: { messages, agenda, preset, context },
  });
  if (error) throw error;
  return data;
}

/**
 * generate-summary Edge Function 호출
 * 회의 종료 시 전체 요약 생성
 */
export async function generateSummary({ meetingId, messages, agendas }) {
  const { data, error } = await supabase.functions.invoke('generate-summary', {
    body: { meetingId, messages, agendas },
  });
  if (error) throw error;
  return data;
}
