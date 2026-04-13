import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모용 초기 목 데이터 (Supabase 미설정 시 사용)
const MOCK_MEETINGS = [
  {
    id: 'mtg-001',
    title: '주간 프로덕트 스탠드업',
    status: 'active',
    team_id: 'team-1',
    created_by: 'mock-1',
    started_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    ended_at: null,
    scheduled_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    agendas: [
      { id: 'a1', title: '지난 주 회고', duration_minutes: 10, status: 'completed', sort_order: 0 },
      { id: 'a2', title: '이번 주 우선순위', duration_minutes: 15, status: 'active', sort_order: 1 },
      { id: 'a3', title: '블로커 공유', duration_minutes: 10, status: 'pending', sort_order: 2 },
    ],
    participants: [
      { id: 'u1', name: '김지우', color: '#FF902F' },
      { id: 'u2', name: '박서연', color: '#34D399' },
      { id: 'u3', name: '이도윤', color: '#38BDF8' },
    ],
  },
  {
    id: 'mtg-002',
    title: '디자인 시스템 리뷰',
    status: 'scheduled',
    team_id: 'team-1',
    created_by: 'mock-1',
    scheduled_at: new Date(Date.now() + 86400 * 1000).toISOString(),
    started_at: null,
    ended_at: null,
    created_at: new Date().toISOString(),
    agendas: [
      { id: 'a4', title: '컴포넌트 API 확정', duration_minutes: 20, status: 'pending', sort_order: 0 },
      { id: 'a5', title: '토큰 네이밍 합의', duration_minutes: 15, status: 'pending', sort_order: 1 },
    ],
    participants: [
      { id: 'u2', name: '박서연', color: '#34D399' },
      { id: 'u4', name: '최하린', color: '#F472B6' },
    ],
  },
  {
    id: 'mtg-003',
    title: 'Q2 로드맵 킥오프',
    status: 'completed',
    team_id: 'team-1',
    created_by: 'mock-1',
    started_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    ended_at: new Date(Date.now() - 2 * 86400 * 1000 + 45 * 60 * 1000).toISOString(),
    scheduled_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    agendas: [
      { id: 'a6', title: '지난 분기 회고', duration_minutes: 15, status: 'completed', sort_order: 0 },
      { id: 'a7', title: '핵심 목표 3가지', duration_minutes: 20, status: 'completed', sort_order: 1 },
      { id: 'a8', title: '실행 계획', duration_minutes: 15, status: 'completed', sort_order: 2 },
    ],
    participants: [
      { id: 'u1', name: '김지우', color: '#FF902F' },
      { id: 'u2', name: '박서연', color: '#34D399' },
      { id: 'u3', name: '이도윤', color: '#38BDF8' },
      { id: 'u4', name: '최하린', color: '#F472B6' },
    ],
  },
];

let realtimeChannel = null;

export const useMeetingStore = create((set, get) => ({
  meetings: MOCK_MEETINGS, // init()에서 Supabase 데이터로 교체됨
  loading: false,
  error: null,

  // ── 초기 로드 + Realtime 구독 ──
  init: async () => {
    if (!SUPABASE_ENABLED) {
      // 데모 모드: 목 데이터 유지
      set({ meetings: MOCK_MEETINGS });
      return;
    }
    // Supabase 모드: 실제 데이터 로드 (목 데이터 제거)

    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*, agendas(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ meetings: data || [], loading: false });
    } catch (err) {
      console.error('[meetingStore] init error:', err);
      set({ error: err.message, loading: false });
    }

    // Realtime 구독
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase
      .channel('meetings-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetings' }, (payload) => {
        console.log('[meetingStore] INSERT:', payload.new.id);
        get().addMeeting(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetings' }, (payload) => {
        console.log('[meetingStore] UPDATE:', payload.new.id);
        get().updateMeeting(payload.new.id, payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meetings' }, (payload) => {
        console.log('[meetingStore] DELETE:', payload.old.id);
        get().removeMeeting(payload.old.id);
      })
      .subscribe();
  },

  // ── 구독 해제 ──
  cleanup: () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  },

  setMeetings: (meetings) => set({ meetings }),

  getById: (id) => get().meetings.find((m) => m.id === id),

  addMeeting: (meeting) =>
    set((state) => {
      if (state.meetings.some((m) => m.id === meeting.id)) return state;
      return { meetings: [meeting, ...state.meetings] };
    }),

  updateMeeting: (id, patch) =>
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  removeMeeting: (id) =>
    set((state) => ({ meetings: state.meetings.filter((m) => m.id !== id) })),
}));
