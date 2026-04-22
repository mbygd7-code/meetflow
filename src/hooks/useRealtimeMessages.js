import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { AI_EMPLOYEE_MAP } from '@/lib/constants';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 사용자인지 + mock 회의 ID인지 확인
function isDemoMode(userId, meetingId) {
  const isDemo = userId?.startsWith('mock-');
  if (isDemo) return true;
  if (!SUPABASE_ENABLED) return true;
  return !meetingId || meetingId.startsWith('mtg-');
}

// 데모 초기 메시지 생성기
function makeMockSeed(meetingId) {
  const now = Date.now();
  return [
    {
      id: `m-${meetingId}-1`, meeting_id: meetingId, user_id: 'u1',
      user: { id: 'u1', name: '김지우', color: '#FF902F' },
      content: '이번 주 우선순위 먼저 정리할까요?',
      is_ai: false, source: 'web',
      created_at: new Date(now - 8 * 60 * 1000).toISOString(),
    },
    {
      id: `m-${meetingId}-2`, meeting_id: meetingId, user_id: 'u2',
      user: { id: 'u2', name: '박서연', color: '#34D399' },
      content: '저는 온보딩 플로우 A/B 테스트 분석이 가장 급합니다.',
      is_ai: false, source: 'web',
      created_at: new Date(now - 6 * 60 * 1000).toISOString(),
    },
    {
      id: `m-${meetingId}-3`, meeting_id: meetingId, user_id: 'milo',
      user: { id: 'milo', name: 'Milo', color: '#723CEB' },
      content: '참고로 지난주 온보딩 이탈률이 34%였고, 주요 이탈 지점은 3단계(팀 초대)였어요. A/B 테스트 설계 시 이 지점을 우선 보시면 인사이트가 빠를 것 같습니다.',
      is_ai: true, ai_type: 'data', ai_employee: 'milo', source: 'web',
      created_at: new Date(now - 5 * 60 * 1000).toISOString(),
    },
    {
      id: `m-${meetingId}-4`, meeting_id: meetingId, user_id: 'u3',
      user: { id: 'u3', name: '이도윤', color: '#38BDF8' },
      content: '@Milo 좋은 지적이에요. 그럼 3단계 개선안을 2개 정도 뽑아서 비교해볼까?',
      is_ai: false, source: 'slack',
      created_at: new Date(now - 2 * 60 * 1000).toISOString(),
    },
  ];
}

/**
 * 회의 메시지 실시간 동기화 — 프로덕션급 3계층 방어
 *
 * 계층:
 *  ① Broadcast emit/listen    — 가장 빠른 경로 (0.1s, RLS 우회, WS 가벼움)
 *  ② postgres_changes INSERT  — 신뢰 가능한 DB 레플리케이션 (0.5~2s)
 *  ③ 폴링 백업 (3초 간격)      — 양쪽이 모두 실패해도 REST로 복구
 *
 *  세 경로 모두 같은 dedupAdd()를 거쳐 중복 메시지는 한 번만 표시.
 *
 * 중요: Broadcast가 동작하려면 **송신자와 수신자가 같은 채널 이름**에 subscribe해야 함.
 *       따라서 채널 이름은 `meeting:${meetingId}` (고정) — Date.now() 같은 동적값 X.
 */
export function useRealtimeMessages(meetingId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  const channelRef = useRef(null);
  const pollRef = useRef(null);
  const realtimeOkRef = useRef(false);
  // 항상 최신 메시지 배열을 참조 (incremental 폴링/broadcast 시 stale closure 방지)
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // 재연결 제어
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const reconnectingRef = useRef(false);

  // 3경로 공통 진입점 — ID로 중복 제거 후 시간순 정렬 유지
  const dedupAdd = useCallback((msg) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!meetingId) return;

    let cancelled = false;

    // ═══════════ 초기 로드 + 폴링 공용 fetch ═══════════
    // incremental=true면 마지막 메시지의 created_at 이후만 가져옴 (대역폭 최적화)
    async function fetchMessages({ incremental = false } = {}) {
      let query = supabase
        .from('messages')
        .select('*, user:users(id,name,avatar_color)')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });

      if (incremental) {
        const lastTs = messagesRef.current.at(-1)?.created_at;
        if (lastTs) query = query.gt('created_at', lastTs);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[useRealtimeMessages] fetch 실패:', error);
        return null;
      }
      if (cancelled) return null;

      if (incremental) {
        let addedCount = 0;
        for (const msg of data || []) {
          if (!messagesRef.current.some((m) => m.id === msg.id)) {
            dedupAdd(msg);
            addedCount++;
          }
        }
        return { data, addedCount };
      } else {
        setMessages(data || []);
        return { data, addedCount: (data || []).length };
      }
    }

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
      await fetchMessages();
      if (!cancelled) setLoading(false);
    }
    load();

    if (isDemoMode(user?.id, meetingId)) return () => (cancelled = true);

    // WebSocket Realtime 비활성화 옵션 — 폴링만으로 충분한 네트워크 환경 대비
    // VITE_DISABLE_REALTIME_WS=true 설정 시 postgres_changes/broadcast 구독 스킵
    // localStorage('disable_realtime_ws', '1')로 런타임 토글도 가능
    const disableRealtime =
      import.meta.env.VITE_DISABLE_REALTIME_WS === 'true' ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('disable_realtime_ws') === '1');

    if (disableRealtime) {
      console.log('[useRealtimeMessages] ⚠ Realtime WS 비활성화됨 — 폴링만 사용');
      realtimeOkRef.current = false;
      // 바로 폴링 섹션으로 (Realtime 채널 생성 스킵)
    }

    // ═══════════ Realtime 채널 ═══════════
    // 이전 채널 정리 (StrictMode 이중 실행 대비)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // WebSocket 비활성화 시 채널 섹션 전체 스킵
    if (disableRealtime) {
      // 폴링 + 가시성/포커스 이벤트만 설정
    } else {

    // 핵심: 채널 이름은 고정 (meetingId만) — 모든 참여자가 같은 이름에 subscribe해야 Broadcast 전달됨
    const channelName = `meeting:${meetingId}`;

    // 채널 빌더 — 재연결 시 재사용 가능하도록 함수화
    function buildChannel() {
      console.log('[useRealtimeMessages] 구독 시작:', channelName, `(시도 #${reconnectAttemptsRef.current + 1})`);

      const ch = supabase.channel(channelName, {
        config: {
          broadcast: { self: false, ack: false },
        },
      });

      // ─── ② postgres_changes 수신 (DB INSERT 감지) ───
      ch.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `meeting_id=eq.${meetingId}`,
        },
        async (payload) => {
          const msg = payload.new;
          console.log('[useRealtimeMessages] ② Realtime INSERT 수신:', msg?.id);
          if (msg.user_id && !msg.user) {
            const { data: userData } = await supabase
              .from('users')
              .select('id, name, avatar_color')
              .eq('id', msg.user_id)
              .maybeSingle();
            msg.user = userData;
          }
          dedupAdd(msg);
        }
      );

      // ─── ① Broadcast 수신 (즉시성 최상 경로) ───
      ch.on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload?.payload;
        if (!msg?.id) return;
        console.log('[useRealtimeMessages] ① Broadcast 수신:', msg.id);
        dedupAdd(msg);
      });

      ch.subscribe((status, err) => {
        console.log('[useRealtimeMessages] 구독 상태:', status, err ? `에러: ${err.message}` : '');
        if (status === 'SUBSCRIBED') {
          realtimeOkRef.current = true;
          reconnectAttemptsRef.current = 0;  // 성공 시 백오프 리셋
          reconnectingRef.current = false;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeOkRef.current = false;
          console.warn(`[useRealtimeMessages] Realtime ${status} — 자동 재구독 스케줄 (폴링은 백업 동작 중)`);
          scheduleReconnect();
        }
      });

      return ch;
    }

    // 지수 백오프 재연결 — 1s → 2s → 4s → 8s → 16s → 30s(상한)
    function scheduleReconnect() {
      if (cancelled) return;
      if (reconnectingRef.current) return;  // 이미 예약됨 → 중복 방지
      reconnectingRef.current = true;

      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttemptsRef.current = attempt + 1;

      console.log(`[useRealtimeMessages] ${delay}ms 후 재구독 시도 (attempt #${reconnectAttemptsRef.current})`);

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        // 이전 채널 정리
        if (channelRef.current) {
          try { supabase.removeChannel(channelRef.current); } catch {}
          channelRef.current = null;
        }
        reconnectingRef.current = false;
        channelRef.current = buildChannel();
      }, delay);
    }

    channelRef.current = buildChannel();
    }  // ← end of if (!disableRealtime) else { ... }

    // ═══════════ ③ 폴링 백업 ═══════════
    // Realtime 작동 여부에 따라 주기 자동 조절
    //   - Realtime OK: 5초 (가벼운 체크)
    //   - Realtime 실패: 1.5초 (체감 지연 최소화)
    // setTimeout으로 재귀 호출 → 매번 최신 상태 반영
    let pollCount = 0;
    let pollTimer = null;
    async function scheduleNextPoll() {
      const delay = realtimeOkRef.current ? 5000 : 1500;
      pollTimer = setTimeout(async () => {
        if (cancelled) return;
        pollCount++;
        const result = await fetchMessages({ incremental: true });
        if (result?.addedCount > 0) {
          console.log(`[useRealtimeMessages] ③ 폴링 #${pollCount} — 신규 ${result.addedCount}건 반영 (Realtime: ${realtimeOkRef.current ? '✓' : '✗'}, 간격: ${delay}ms)`);
        } else if (pollCount % 20 === 0) {
          console.log(`[useRealtimeMessages] 폴링 #${pollCount} heartbeat — Realtime: ${realtimeOkRef.current ? '✓' : '✗'}, 메시지 수: ${messagesRef.current.length}, 간격: ${delay}ms`);
        }
        if (!cancelled) scheduleNextPoll();
      }, delay);
    }
    scheduleNextPoll();

    // 이전 setInterval API 호환용 ref
    pollRef.current = { clear: () => { if (pollTimer) clearTimeout(pollTimer); } };

    // ═══════════ 탭 가시성 / 포커스 ═══════════
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        console.log('[useRealtimeMessages] 탭 활성화 — 즉시 재조회');
        fetchMessages({ incremental: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onFocus = () => {
      console.log('[useRealtimeMessages] 창 포커스 — 즉시 재조회');
      fetchMessages({ incremental: true });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (pollRef.current) {
        if (typeof pollRef.current.clear === 'function') {
          pollRef.current.clear();
        } else if (typeof pollRef.current === 'number') {
          clearInterval(pollRef.current);
        }
        pollRef.current = null;
      }
    };
    // dedupAdd는 stable (useCallback with []) — 의존성 meetingId만으로 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // ═══════════ sendMessage — DB INSERT + Broadcast emit ═══════════
  const sendMessage = useCallback(
    async (content, { agendaId, isAi = false, aiType, aiEmployee, source = 'web', searchSources = null } = {}) => {
      if (!content?.trim()) return;

      // 데모 모드 (mock 회의) — 로컬 state만 갱신
      if (isDemoMode(user?.id, meetingId)) {
        let aiUser = { id: 'milo', name: 'Milo', color: '#723CEB' };
        if (isAi && aiEmployee) aiUser = AI_EMPLOYEE_MAP[aiEmployee] || aiUser;

        const newMsg = {
          id: `m-local-${Date.now()}`,
          meeting_id: meetingId,
          agenda_id: agendaId,
          user_id: isAi ? null : user?.id,
          content: content.trim(),
          is_ai: isAi,
          ai_type: aiType,
          ai_employee: isAi ? (aiEmployee || 'milo') : undefined,
          search_sources: searchSources || undefined,
          source,
          user: isAi ? aiUser : { id: user?.id, name: user?.name || '나', color: '#723CEB' },
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newMsg]);
        return newMsg;
      }

      // ① DB INSERT (authoritative)
      const insertData = {
        meeting_id: meetingId,
        agenda_id: agendaId,
        user_id: isAi ? null : user?.id,
        content: content.trim(),
        is_ai: isAi,
        ai_type: aiType,
        source,
      };
      if (isAi && aiEmployee) insertData.ai_employee = aiEmployee;

      const { data, error } = await supabase
        .from('messages')
        .insert(insertData)
        .select('*, user:users(id,name,avatar_color)')
        .single();
      if (error) {
        console.error('[sendMessage]', error);
        return null;
      }

      // 즉시 로컬 state에 추가 (본인 화면 표시)
      const enriched = isAi
        ? { ...data, ai_employee: data.ai_employee || aiEmployee || 'milo', search_sources: searchSources || undefined }
        : data;
      dedupAdd(enriched);

      // ② Broadcast emit — 같은 채널 구독자(다른 참여자)에게 즉시 전달
      //    postgres_changes가 도착하기 전에 이 메시지로 먼저 표시됨 (ID 중복 제거로 안전)
      try {
        if (channelRef.current) {
          await channelRef.current.send({
            type: 'broadcast',
            event: 'new_message',
            payload: enriched,
          });
          console.log('[sendMessage] Broadcast emit 완료:', enriched.id);
        }
      } catch (e) {
        console.warn('[sendMessage] Broadcast emit 실패 (postgres_changes/폴링으로 복구):', e);
      }

      return enriched;
    },
    [meetingId, user, dedupAdd]
  );

  return { messages, loading, sendMessage };
}
