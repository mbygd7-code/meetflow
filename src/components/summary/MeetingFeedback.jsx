import { useState, useEffect, useCallback } from 'react';
import { Heart, Lightbulb, Meh, ThumbsDown, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

// 리액션 종류 정의 — migration 034의 CHECK 제약과 일치해야 함
const REACTIONS = [
  {
    key: 'loved',
    label: '아주 좋음',
    Icon: Heart,
    color: 'text-status-error',      // 빨강 하트
    bg: 'bg-status-error/10',
    border: 'border-status-error/30',
    hoverBg: 'hover:bg-status-error/15',
  },
  {
    key: 'useful',
    label: '유용했음',
    Icon: Lightbulb,
    color: 'text-brand-orange',
    bg: 'bg-brand-orange/10',
    border: 'border-brand-orange/30',
    hoverBg: 'hover:bg-brand-orange/15',
  },
  {
    key: 'okay',
    label: '보통',
    Icon: Meh,
    color: 'text-txt-secondary',
    bg: 'bg-bg-tertiary',
    border: 'border-border-default',
    hoverBg: 'hover:bg-bg-tertiary',
  },
  {
    key: 'poor',
    label: '개선 필요',
    Icon: ThumbsDown,
    color: 'text-status-warning',
    bg: 'bg-status-warning/10',
    border: 'border-status-warning/30',
    hoverBg: 'hover:bg-status-warning/15',
  },
];

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDemoMeeting = (id) => !id || !UUID_RE.test(id);

export default function MeetingFeedback({ meetingId, compact = false }) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [reactions, setReactions] = useState([]); // 전체 리액션 목록
  const [myReaction, setMyReaction] = useState(null); // 내 리액션 key
  const [busy, setBusy] = useState(null); // 현재 클릭 처리 중인 key
  const [loading, setLoading] = useState(true);

  // 로드 + Realtime 구독
  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    let channel = null;

    async function load() {
      setLoading(true);
      if (!SUPABASE_ENABLED || isDemoMeeting(meetingId)) {
        // 데모 모드: localStorage에서 로컬 리액션 복원
        try {
          const raw = localStorage.getItem(`meetflow_reaction:${meetingId}`);
          if (raw && !cancelled) setMyReaction(raw);
        } catch {}
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('meeting_reactions')
          .select('user_id, reaction')
          .eq('meeting_id', meetingId);
        if (cancelled) return;
        const list = data || [];
        setReactions(list);
        setMyReaction(list.find((r) => r.user_id === user?.id)?.reaction || null);
      } catch (err) {
        console.error('[MeetingFeedback] load failed:', err);
      }
      if (!cancelled) setLoading(false);
    }
    load();

    // Realtime — 다른 사용자 피드백 즉시 반영
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

  // 카운트 집계
  const countOf = (key) => reactions.filter((r) => r.reaction === key).length;

  // 리액션 토글/변경
  const handleClick = useCallback(async (key) => {
    if (busy) return;
    setBusy(key);
    const isToggleOff = myReaction === key;
    const prev = myReaction;
    // 낙관적 업데이트
    setMyReaction(isToggleOff ? null : key);

    try {
      if (!SUPABASE_ENABLED || isDemoMeeting(meetingId)) {
        try {
          if (isToggleOff) localStorage.removeItem(`meetflow_reaction:${meetingId}`);
          else localStorage.setItem(`meetflow_reaction:${meetingId}`, key);
        } catch {}
        addToast?.(isToggleOff ? '피드백을 취소했습니다' : '피드백을 저장했습니다', 'success', 1800);
        return;
      }

      if (!user?.id) {
        addToast?.('로그인이 필요합니다', 'error', 3000);
        setMyReaction(prev);
        return;
      }

      if (isToggleOff) {
        // 취소 → DELETE
        const { error } = await supabase
          .from('meeting_reactions')
          .delete()
          .eq('meeting_id', meetingId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // 등록 또는 변경 → UPSERT
        const { error } = await supabase
          .from('meeting_reactions')
          .upsert(
            { meeting_id: meetingId, user_id: user.id, reaction: key },
            { onConflict: 'meeting_id,user_id' }
          );
        if (error) throw error;
      }
      // 카운트는 Realtime으로 갱신됨
    } catch (err) {
      console.error('[MeetingFeedback] save failed:', err);
      setMyReaction(prev); // 롤백
      addToast?.('피드백 저장 실패', 'error', 3000);
    } finally {
      setBusy(null);
    }
  }, [myReaction, busy, meetingId, user?.id, addToast]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-txt-muted">
        <Loader2 size={11} className="animate-spin" />
        피드백 로드 중...
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="회의 피드백">
      {REACTIONS.map(({ key, label, Icon, color, bg, border, hoverBg }) => {
        const active = myReaction === key;
        const count = countOf(key);
        const isBusy = busy === key;
        return (
          <button
            key={key}
            onClick={() => handleClick(key)}
            disabled={!!busy}
            className={`group/rx inline-flex items-center gap-1 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded-md border transition-all ${
              active
                ? `${bg} ${border} ${color}`
                : `bg-transparent border-transparent text-txt-muted ${hoverBg} hover:${color}`
            } ${busy && !isBusy ? 'opacity-50' : ''}`}
            title={`${label}${count > 0 ? ` · ${count}명` : ''}${active ? ' (내 피드백)' : ''}`}
            aria-pressed={active}
          >
            {isBusy ? (
              <Loader2 size={compact ? 12 : 14} className="animate-spin" />
            ) : (
              <Icon
                size={compact ? 12 : 14}
                strokeWidth={active ? 2.4 : 2}
                fill={active && key === 'loved' ? 'currentColor' : 'none'}
              />
            )}
            {count > 0 && (
              <span className={`text-[10px] font-semibold ${active ? color : 'text-txt-muted'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
