import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useMeetingStore } from '@/stores/meetingStore';
import { useAuthStore } from '@/stores/authStore';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

export function useMeeting() {
  const { meetings, setMeetings, addMeeting, updateMeeting, removeMeeting, getById } =
    useMeetingStore();
  const { user } = useAuthStore();

  // 회의 목록 로드
  const fetchMeetings = useCallback(async () => {
    if (!SUPABASE_ENABLED) return meetings; // 목 데이터 그대로 사용
    const { data, error } = await supabase
      .from('meetings')
      .select('*, agendas(*)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[fetchMeetings]', error);
      return [];
    }
    setMeetings(data || []);
    return data;
  }, [meetings, setMeetings]);

  // 회의 생성
  const createMeeting = useCallback(
    async ({ title, team_id, agendas = [] }) => {
      if (!SUPABASE_ENABLED) {
        // 데모 모드 — 로컬 스토어에만 추가
        const newMeeting = {
          id: `mtg-${Date.now()}`,
          title,
          status: 'scheduled',
          team_id: team_id || 'team-1',
          created_by: user?.id || 'mock-1',
          scheduled_at: new Date().toISOString(),
          started_at: null,
          ended_at: null,
          created_at: new Date().toISOString(),
          agendas: agendas.map((a, i) => ({
            id: `a-${Date.now()}-${i}`,
            title: a.title,
            duration_minutes: a.duration_minutes || 10,
            status: 'pending',
            sort_order: i,
          })),
          participants: [
            {
              id: user?.id || 'mock-1',
              name: user?.name || '나',
              color: '#723CEB',
            },
          ],
        };
        addMeeting(newMeeting);
        return newMeeting;
      }

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert({
          title,
          team_id,
          created_by: user?.id,
          status: 'scheduled',
        })
        .select()
        .single();
      if (error) throw error;

      if (agendas.length > 0) {
        const agendaRows = agendas.map((a, i) => ({
          meeting_id: meeting.id,
          title: a.title,
          duration_minutes: a.duration_minutes || 10,
          sort_order: i,
        }));
        await supabase.from('agendas').insert(agendaRows);
      }
      addMeeting({ ...meeting, agendas });
      return meeting;
    },
    [user, addMeeting]
  );

  // 회의 시작
  const startMeeting = useCallback(
    async (id) => {
      const patch = { status: 'active', started_at: new Date().toISOString() };
      if (SUPABASE_ENABLED) {
        await supabase.from('meetings').update(patch).eq('id', id);
      }
      updateMeeting(id, patch);
    },
    [updateMeeting]
  );

  // 회의 종료
  const endMeeting = useCallback(
    async (id) => {
      const patch = { status: 'completed', ended_at: new Date().toISOString() };
      if (SUPABASE_ENABLED) {
        await supabase.from('meetings').update(patch).eq('id', id);
      }
      updateMeeting(id, patch);
    },
    [updateMeeting]
  );

  // 회의 삭제
  const deleteMeeting = useCallback(
    async (id) => {
      if (SUPABASE_ENABLED) {
        await supabase.from('meetings').delete().eq('id', id);
      }
      removeMeeting(id);
    },
    [removeMeeting]
  );

  return {
    meetings,
    getById,
    fetchMeetings,
    createMeeting,
    startMeeting,
    endMeeting,
    deleteMeeting,
  };
}
