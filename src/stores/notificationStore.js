import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 모드 mock — Supabase 미연결 시
const MOCK_NOTIFICATIONS = [
  {
    id: 'n-mock-1',
    user_id: 'mock-1',
    type: 'task.assigned',
    priority: 'urgent',
    title: '새 태스크가 배정되었어요',
    body: '랜딩페이지 카피 초안 작성',
    source_type: 'task',
    source_id: 'task-mock-1',
    ai_specialist: 'gantt',
    action_url: '/members',
    metadata: {},
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'n-mock-2',
    user_id: 'mock-1',
    type: 'meeting.live_now',
    priority: 'urgent',
    title: '회의가 시작됐어요',
    body: '주간 프로덕트 스탠드업',
    source_type: 'meeting',
    source_id: 'mtg-001',
    ai_specialist: null,
    action_url: '/meetings/mtg-001',
    metadata: {},
    read_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'n-mock-3',
    user_id: 'mock-1',
    type: 'meeting.summary_ready',
    priority: 'normal',
    title: '회의록이 준비됐어요',
    body: 'Q2 로드맵 킥오프',
    source_type: 'summary',
    source_id: 'mtg-003',
    ai_specialist: 'milo',
    action_url: '/summaries/mtg-003',
    metadata: {},
    read_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

let realtimeChannel = null;

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  loading: false,
  error: null,
  filter: 'all',          // 카테고리 필터 (NOTIFICATION_CATEGORIES.id)

  // 미읽음 수 — derived selector 로 외부에서 사용 권장
  // get unreadCount() { ... } 는 zustand 패턴상 함수로 노출
  getUnreadCount: () => get().notifications.filter((n) => !n.read_at).length,

  setFilter: (filter) => set({ filter }),

  // ── 초기 로드 + Realtime 구독 ──
  init: async () => {
    const user = useAuthStore.getState().user;
    const isDemo = !user || user.id?.startsWith('mock-');
    if (!SUPABASE_ENABLED || isDemo) {
      set({ notifications: MOCK_NOTIFICATIONS });
      return;
    }

    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      set({ notifications: data || [], loading: false });
    } catch (err) {
      console.error('[notificationStore] init error:', err);
      set({ error: err.message, loading: false });
    }

    // Realtime 구독
    if (realtimeChannel) {
      try { supabase.removeChannel(realtimeChannel); } catch {}
      realtimeChannel = null;
    }
    realtimeChannel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        get().addNotification(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        get().patchNotification(payload.new.id, payload.new);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        get().removeNotification(payload.old.id);
      })
      .subscribe();
  },

  cleanup: () => {
    if (realtimeChannel) {
      try { supabase.removeChannel(realtimeChannel); } catch {}
      realtimeChannel = null;
    }
  },

  addNotification: (n) =>
    set((state) => {
      if (state.notifications.some((x) => x.id === n.id)) return state;
      return { notifications: [n, ...state.notifications] };
    }),

  patchNotification: (id, patch) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),

  removeNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),

  markRead: async (id) => {
    const now = new Date().toISOString();
    // optimistic
    get().patchNotification(id, { read_at: now });
    if (!SUPABASE_ENABLED) return;
    const user = useAuthStore.getState().user;
    if (!user || user.id?.startsWith('mock-')) return;
    try {
      await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', id);
    } catch (err) {
      console.warn('[notificationStore] markRead failed:', err?.message);
    }
  },

  markAllRead: async () => {
    const now = new Date().toISOString();
    set((state) => ({
      notifications: state.notifications.map((n) => (n.read_at ? n : { ...n, read_at: now })),
    }));
    if (!SUPABASE_ENABLED) return;
    const user = useAuthStore.getState().user;
    if (!user || user.id?.startsWith('mock-')) return;
    try {
      await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null);
    } catch (err) {
      console.warn('[notificationStore] markAllRead failed:', err?.message);
    }
  },

  remove: async (id) => {
    get().removeNotification(id);
    if (!SUPABASE_ENABLED) return;
    const user = useAuthStore.getState().user;
    if (!user || user.id?.startsWith('mock-')) return;
    try {
      await supabase.from('notifications').delete().eq('id', id);
    } catch (err) {
      console.warn('[notificationStore] remove failed:', err?.message);
    }
  },
}));
