// ═══ AI 메시지 피드백 스토어 (Phase 3) ═══
// 목적:
//   사용자가 AI 응답에 👍/👎 + 이유를 남긴 것을 수집·캐시.
//   본 Phase에서는 수집만, 학습 활용은 Phase 5.
//
// 설계:
//   - myFeedbacks: Map<message_id, { rating, reason, id }> — 내 피드백 캐시
//   - 낙관적 업데이트 → Supabase upsert → 실패 시 롤백
//   - 같은 메시지에 재클릭 시 토글 (👍→해제, 👎→이유 재선택)

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

export const useFeedbackStore = create((set, get) => ({
  // Map<message_id, { rating, reason, id, user_id }>
  myFeedbacks: new Map(),
  // Map<message_id, { up: number, down: number }> — 팀 전체 집계 (선택적 로드)
  aggregates: new Map(),
  loading: false,

  // ── 특정 회의의 메시지 ID들에 대한 내 피드백 로드 ──
  loadMyFeedbacks: async (messageIds) => {
    if (!SUPABASE_ENABLED || !messageIds?.length) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('ai_message_feedback')
        .select('id, message_id, rating, reason, user_id')
        .eq('user_id', session.user.id)
        .in('message_id', messageIds);

      if (error) {
        console.warn('[feedbackStore] loadMyFeedbacks failed:', error.message);
        return;
      }

      const map = new Map(get().myFeedbacks);
      for (const row of data || []) {
        map.set(row.message_id, {
          id: row.id,
          rating: row.rating,
          reason: row.reason,
          user_id: row.user_id,
        });
      }
      set({ myFeedbacks: map });
    } catch (e) {
      console.warn('[feedbackStore] loadMyFeedbacks exception:', e?.message);
    }
  },

  // ── 팀 전체 집계 로드 (관리자 대시보드 / 메시지별 👍 수 표시용) ──
  loadAggregates: async (messageIds) => {
    if (!SUPABASE_ENABLED || !messageIds?.length) return;
    try {
      const { data, error } = await supabase
        .from('ai_message_feedback')
        .select('message_id, rating')
        .in('message_id', messageIds);

      if (error) return;

      const aggs = new Map();
      for (const row of data || []) {
        const prev = aggs.get(row.message_id) || { up: 0, down: 0 };
        if (row.rating === 1) prev.up += 1;
        else if (row.rating === -1) prev.down += 1;
        aggs.set(row.message_id, prev);
      }
      set({ aggregates: aggs });
    } catch { /* 무시 */ }
  },

  // ── 피드백 제출/토글 (낙관적 업데이트) ──
  // rating: 1 (👍) | -1 (👎) | 0 (취소)
  // reason: 'too_long' | 'incorrect' | 'off_topic' | 'repetitive' | 'other' | null
  submitFeedback: async (messageId, rating, reason = null) => {
    if (!messageId) return;
    const prev = new Map(get().myFeedbacks);
    const current = prev.get(messageId);

    // 같은 rating 재클릭 → 취소 (토글)
    const isToggleOff = current && current.rating === rating && current.reason === reason;
    const effectiveRating = isToggleOff ? 0 : rating;

    // 낙관적 업데이트
    const next = new Map(prev);
    if (effectiveRating === 0) {
      next.delete(messageId);
    } else {
      next.set(messageId, {
        ...(current || {}),
        rating: effectiveRating,
        reason,
        pending: true,
      });
    }
    set({ myFeedbacks: next });

    // 집계 낙관 갱신
    const aggs = new Map(get().aggregates);
    const agg = { ...(aggs.get(messageId) || { up: 0, down: 0 }) };
    // 이전 rating 차감
    if (current?.rating === 1) agg.up = Math.max(0, agg.up - 1);
    else if (current?.rating === -1) agg.down = Math.max(0, agg.down - 1);
    // 새 rating 가산
    if (effectiveRating === 1) agg.up += 1;
    else if (effectiveRating === -1) agg.down += 1;
    aggs.set(messageId, agg);
    set({ aggregates: aggs });

    // Supabase 반영
    if (!SUPABASE_ENABLED) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('not_authenticated');
      const userId = session.user.id;

      if (effectiveRating === 0) {
        // 삭제
        const { error } = await supabase
          .from('ai_message_feedback')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        // upsert
        const { data, error } = await supabase
          .from('ai_message_feedback')
          .upsert(
            {
              message_id: messageId,
              user_id: userId,
              rating: effectiveRating,
              reason,
            },
            { onConflict: 'message_id,user_id' }
          )
          .select('id')
          .single();
        if (error) throw error;

        // pending 제거 + id 기록
        const confirmed = new Map(get().myFeedbacks);
        const cur = confirmed.get(messageId);
        if (cur) {
          confirmed.set(messageId, { ...cur, id: data?.id, pending: false });
          set({ myFeedbacks: confirmed });
        }
      }
    } catch (e) {
      // 실패 시 롤백
      console.error('[feedbackStore] submitFeedback failed:', e?.message);
      set({ myFeedbacks: prev });
      // 집계도 롤백 (간단하게 재조회)
      get().loadAggregates([messageId]);
      throw e;
    }
  },

  // 특정 메시지의 내 피드백 조회 (렌더용)
  getMyFeedback: (messageId) => get().myFeedbacks.get(messageId) || null,
  getAggregate: (messageId) => get().aggregates.get(messageId) || { up: 0, down: 0 },
}));
