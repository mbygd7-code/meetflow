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

  // 회의 요청 — Slack 통지 + Google Calendar 연동
  const requestMeeting = useCallback(
    async ({ title, team_id, agendas = [], participants = [], scheduledDate, scheduledTime, duration }) => {
      // 1. 회의 생성
      const meeting = await createMeeting({ title, team_id, agendas, participants });

      // 2. Slack 통지 (Edge Function 호출)
      if (SUPABASE_ENABLED && team_id) {
        try {
          await supabase.functions.invoke('slack-notify', {
            body: {
              event: 'meeting_request',
              payload: {
                title,
                team_id,
                meeting_id: meeting.id,
                agendas,
                participants: participants.map((p) => p.name),
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                duration,
                requested_by: user?.name || '사용자',
              },
            },
          });
        } catch (err) {
          console.warn('[requestMeeting] Slack 통지 실패:', err);
        }
      }

      // 3. Google Calendar 이벤트 생성 (Edge Function 호출)
      if (SUPABASE_ENABLED && scheduledDate && scheduledTime) {
        try {
          await supabase.functions.invoke('gcal-create-event', {
            body: {
              title,
              date: scheduledDate,
              time: scheduledTime,
              duration: duration || 30,
              participants: participants.map((p) => p.name),
              meeting_id: meeting.id,
            },
          });
        } catch (err) {
          console.warn('[requestMeeting] Google Calendar 연동 실패:', err);
        }
      }

      // 데모 모드에서도 시각적 피드백을 위해 콘솔 로그
      if (!SUPABASE_ENABLED) {
        console.log('[데모] 회의 요청 완료 — Slack/Calendar 연동은 Supabase 연결 후 활성화됩니다.');
        console.log('[데모] Slack 통지 대상:', participants.map((p) => p.name).join(', '));
        console.log('[데모] Calendar 일정:', `${scheduledDate} ${scheduledTime} (${duration}분)`);
      }

      return meeting;
    },
    [user, createMeeting]
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
    requestMeeting,
    startMeeting,
    endMeeting,
    deleteMeeting,
  };
}
