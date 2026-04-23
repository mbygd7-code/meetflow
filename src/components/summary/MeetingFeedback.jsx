// 회의록 피드백 — AI 메시지 FeedbackButtons와 동일한 스타일/개수(👍/👎)
// 차이점: 사이즈를 키워 헤더에서 눈에 띄게 표시
// DB 매핑: 👍 → reaction='loved', 👎 → reaction='poor' (migration 034 CHECK 호환)

import { useState, useEffect, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDemoMeeting = (id) => !id || !UUID_RE.test(id);

// UI key ↔ DB reaction 매핑 (기존 테이블 CHECK와 호환)
const UP_KEY = 'loved';   // 👍
const DOWN_KEY = 'poor';  // 👎

export default function MeetingFeedback({ meetingId, compact = false }) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [reactions, setReactions] = useState([]);
  const [myReaction, setMyReaction] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(true);

  // 로드 + Realtime 구독
  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    let channel = null;

    async function load() {
      setLoading(true);
      if (!SUPABASE_ENABLED || isDemoMeeting(meetingId)) {
        try {
          const raw = localStorage.getItem(`meetflow_reaction:${meetingId}`);
          if (raw && !cancelled) setMyReaction(raw);
        } catch {}
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('meeting_reactions')
          .select('user_id, reaction')
          .eq('meeting_id', meetingId);
        if (cancelled) return;
        if (error) {
          // 테이블이 없으면 콘솔에만 경고 (UI는 빈 상태로 표시)
          if (error.code === '42P01') {
            console.warn('[MeetingFeedback] meeting_reactions 테이블 없음 — migration 034 실행 필요');
          } else {
            console.error('[MeetingFeedback] load failed:', error);
          }
        } else {
          const list = data || [];
          setReactions(list);
          setMyReaction(list.find((r) => r.user_id === user?.id)?.reaction || null);
        }
      } catch (err) {
        console.error('[MeetingFeedback] load exception:', err);
      }
      if (!cancelled) setLoading(false);
    }
    load();

    if (SUPABASE_ENABLED && !isDemoMeeting(meetingId)) {
      channel = supabase
        .channel(`meeting_reactions:${meetingId}:${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'meeting_reactions',
            filter: `meeting_id=eq.${meetingId}`,
          },
          () => { if (!cancelled) load(); }
        )
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [meetingId, user?.id]);

  const countOf = (key) => reactions.filter((r) => r.reaction === key).length;

  const handleClick = useCallback(async (key) => {
    if (busy) return;
    setBusy(key);
    const isToggleOff = myReaction === key;
    const prev = myReaction;
    setMyReaction(isToggleOff ? null : key);

    try {
      if (!SUPABASE_ENABLED || isDemoMeeting(meetingId)) {
        try {
          if (isToggleOff) localStorage.removeItem(`meetflow_reaction:${meetingId}`);
          else localStorage.setItem(`meetflow_reaction:${meetingId}`, key);
        } catch {}
        return;
      }

      if (!user?.id) {
        addToast?.('로그인이 필요합니다', 'error', 3000);
        setMyReaction(prev);
        return;
      }

      if (isToggleOff) {
        const { error } = await supabase
          .from('meeting_reactions')
          .delete()
          .eq('meeting_id', meetingId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('meeting_reactions')
          .upsert(
            { meeting_id: meetingId, user_id: user.id, reaction: key },
            { onConflict: 'meeting_id,user_id' }
          );
        if (error) throw error;
      }
    } catch (err) {
      console.error('[MeetingFeedback] save failed:', err);
      setMyReaction(prev);
      // 원인별 구체적 메시지 (디버깅 용이)
      const code = err?.code;
      const msg = err?.message || '';
      let friendly = '피드백 저장 실패';
      if (code === '42P01' || msg.includes('meeting_reactions') && msg.includes('does not exist')) {
        friendly = 'DB 테이블 없음 — migration 034 실행 필요 (관리자 문의)';
      } else if (code === '42501' || msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('policy')) {
        friendly = '권한 오류 — RLS 정책 확인 필요 (migration 034)';
      } else if (code === '23514') {
        friendly = '잘못된 피드백 종류';
      } else if (code === '23503') {
        friendly = '사용자 정보 동기화 오류';
      } else if (msg) {
        friendly = `피드백 저장 실패: ${msg.slice(0, 60)}`;
      }
      addToast?.(friendly, 'error', 5000);
    } finally {
      setBusy(null);
    }
  }, [myReaction, busy, meetingId, user?.id, addToast]);

  // 사이즈 — AI 메시지 FeedbackButtons 대비 1.5배 이상
  const iconSize = compact ? 16 : 18;
  const padX = compact ? 'px-2' : 'px-2.5';
  const padY = compact ? 'py-1' : 'py-1.5';
  const textSize = compact ? 'text-xs' : 'text-sm';
  const btnBase = `inline-flex items-center gap-1.5 ${padX} ${padY} rounded-md transition-colors ${textSize} font-medium`;

  const isUp = myReaction === UP_KEY;
  const isDown = myReaction === DOWN_KEY;
  const upCount = countOf(UP_KEY);
  const downCount = countOf(DOWN_KEY);
  const hasAnyFeedback = upCount > 0 || downCount > 0;

  if (loading) {
    return (
      <div className={`inline-flex items-center gap-1 ${padX} ${padY} ${textSize} text-txt-muted`}>
        <Loader2 size={iconSize} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1" role="group" aria-label="회의 피드백">
      <button
        onClick={() => handleClick(UP_KEY)}
        disabled={!!busy}
        className={`${btnBase} ${
          isUp
            ? 'text-status-success bg-status-success/10'
            : 'text-txt-muted hover:text-status-success hover:bg-status-success/5'
        } ${busy && busy !== UP_KEY ? 'opacity-60' : ''}`}
        title={isUp ? '피드백 취소' : '도움됐어요'}
        aria-pressed={isUp}
      >
        {busy === UP_KEY ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <ThumbsUp size={iconSize} strokeWidth={isUp ? 2.4 : 2} />
        )}
        {hasAnyFeedback && upCount > 0 && <span>{upCount}</span>}
      </button>

      <button
        onClick={() => handleClick(DOWN_KEY)}
        disabled={!!busy}
        className={`${btnBase} ${
          isDown
            ? 'text-status-error bg-status-error/10'
            : 'text-txt-muted hover:text-status-error hover:bg-status-error/5'
        } ${busy && busy !== DOWN_KEY ? 'opacity-60' : ''}`}
        title={isDown ? '피드백 취소' : '개선이 필요해요'}
        aria-pressed={isDown}
      >
        {busy === DOWN_KEY ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <ThumbsDown size={iconSize} strokeWidth={isDown ? 2.4 : 2} />
        )}
        {hasAnyFeedback && downCount > 0 && <span>{downCount}</span>}
      </button>
    </div>
  );
}
