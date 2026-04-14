import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { AI_EMPLOYEE_MAP } from '@/lib/constants';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 사용자인지 + mock 회의 ID인지 확인
function isDemoMode(userId, meetingId) {
  const isDemo = userId?.startsWith('mock-');
  if (isDemo) return true; // 데모 사용자는 항상 로컬 모드
  if (!SUPABASE_ENABLED) return true;
  return !meetingId || meetingId.startsWith('mtg-');
}

// 데모 초기 메시지 생성기
function makeMockSeed(meetingId) {
  const now = Date.now();
  return [
    {
      id: `m-${meetingId}-1`,
      meeting_id: meetingId,
      user_id: 'u1',
      user: { id: 'u1', name: '김지우', color: '#FF902F' },
      content: '이번 주 우선순위 먼저 정리할까요?',
      is_ai: false,
      source: 'web',
      created_at: new Date(now - 8 * 60 * 1000).toISOString(),
    },
    {
      id: `m-${meetingId}-2`,
      meeting_id: meetingId,
      user_id: 'u2',
      user: { id: 'u2', name: '박서연', color: '#34D399' },
      content: '저는 온보딩 플로우 A/B 테스트 분석이 가장 급합니다.',
      is_ai: false,
      source: 'web',
      created_at: new Date(now - 6 * 60 * 1000).toISOString(),
    },
    {
      id: `m-${meetingId}-3`,
      meeting_id: meetingId,
      user_id: 'milo',
      user: { id: 'milo', name: 'Milo', color: '#723CEB' },
      content:
        '참고로 지난주 온보딩 이탈률이 34%였고, 주요 이탈 지점은 3단계(팀 초대)였어요. A/B 테스트 설계 시 이 지점을 우선 보시면 인사이트가 빠를 것 같습니다.',
      is_ai: true,
      ai_type: 'data',
      source: 'web',
      created_at: new Date(now - 5 * 60 * 1000).toISOString(),
    },
    {
      id: `m-${meetingId}-4`,
      meeting_id: meetingId,
      user_id: 'u3',
      user: { id: 'u3', name: '이도윤', color: '#38BDF8' },
      content: '@Milo 좋은 지적이에요. 그럼 3단계 개선안을 2개 정도 뽑아서 비교해볼까?',
      is_ai: false,
      source: 'slack',
      created_at: new Date(now - 2 * 60 * 1000).toISOString(),
    },
  ];
}

export function useRealtimeMessages(meetingId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const channelRef = useRef(null);

  useEffect(() => {
    if (!meetingId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      if (isDemoMode(user?.id, meetingId)) {
        const seed = makeMockSeed(meetingId);
        if (!cancelled) {
          setMessages(seed);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('messages')
        .select('*, user:users(id,name,avatar_color)')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });

      if (error) console.error('[useRealtimeMessages]', error);
      if (!cancelled) {
        setMessages(data || []);
        setLoading(false);
      }
    }
    load();

    if (isDemoMode(user?.id, meetingId)) return () => (cancelled = true);

    // Realtime 구독
    const channel = supabase
      .channel(`messages:${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `meeting_id=eq.${meetingId}`,
        },
        async (payload) => {
          const msg = payload.new;
          // Realtime payload에는 JOIN 데이터가 없으므로 user 정보 보강
          if (msg.user_id && !msg.user) {
            const { data: userData } = await supabase
              .from('users')
              .select('id, name, avatar_color')
              .eq('id', msg.user_id)
              .single();
            msg.user = userData;
          }
          setMessages((prev) => {
            // 이미 동일 ID가 있으면 중복 방지
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [meetingId]);

  const sendMessage = useCallback(
    async (content, { agendaId, isAi = false, aiType, aiEmployee, source = 'web' } = {}) => {
      if (!content?.trim()) return;

      if (isDemoMode(user?.id, meetingId)) {
        // AI 직원 정보 조회
        let aiUser = { id: 'milo', name: 'Milo', color: '#723CEB' };
        if (isAi && aiEmployee) {
          aiUser = AI_EMPLOYEE_MAP[aiEmployee] || aiUser;
        }

        // 로컬 데모: 직접 state 업데이트
        const newMsg = {
          id: `m-local-${Date.now()}`,
          meeting_id: meetingId,
          agenda_id: agendaId,
          user_id: isAi ? null : user?.id,
          content: content.trim(),
          is_ai: isAi,
          ai_type: aiType,
          ai_employee: isAi ? (aiEmployee || 'drucker') : undefined,
          source,
          user: isAi ? aiUser : { id: user?.id, name: user?.name || '나', color: '#723CEB' },
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newMsg]);
        return newMsg;
      }

      // Supabase INSERT — ai_employee 컬럼이 DB에 없으므로 제외
      const { data, error } = await supabase
        .from('messages')
        .insert({
          meeting_id: meetingId,
          agenda_id: agendaId,
          user_id: isAi ? null : user?.id,
          content: content.trim(),
          is_ai: isAi,
          ai_type: aiType,
          source,
        })
        .select('*, user:users(id,name,avatar_color)')
        .single();
      if (error) {
        console.error('[sendMessage]', error);
        return null;
      }
      // Realtime이 지연되거나 미작동할 수 있으므로 즉시 로컬 state에 추가
      // ai_employee는 DB에 없으므로 로컬에서 보강
      if (data) {
        const enriched = isAi ? { ...data, ai_employee: aiEmployee || 'drucker' } : data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === enriched.id)) return prev;
          return [...prev, enriched];
        });
        return enriched;
      }
      return data;
    },
    [meetingId, user]
  );

  return { messages, loading, sendMessage };
}
