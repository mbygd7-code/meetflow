import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useMeetingStore } from '@/stores/meetingStore';
import { useAuthStore } from '@/stores/authStore';
import { generateSummary } from '@/lib/claude';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

export function useMeeting() {
  const { meetings, setMeetings, addMeeting, updateMeeting, removeMeeting, getById } =
    useMeetingStore();
  const { user } = useAuthStore();

  // 데모 사용자(mockSignIn)인 경우 Supabase DB 사용 안 함
  const isDemo = user?.id?.startsWith('mock-');
  const canUseDB = SUPABASE_ENABLED && !isDemo;

  // 회의 목록 로드
  const fetchMeetings = useCallback(async () => {
    if (!canUseDB) return meetings; // 목 데이터 그대로 사용
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
    async ({ title, team_id, agendas = [], participants: meetingParticipants, scheduledDate, scheduledTime }) => {
      // scheduled_at 계산: 날짜+시간이 있으면 조합, 없으면 현재 시간
      const scheduledAt = scheduledDate && scheduledTime
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : scheduledDate
          ? new Date(`${scheduledDate}T09:00`).toISOString()
          : new Date().toISOString();

      if (!canUseDB) {
        // 데모 모드 — 로컬 스토어에만 추가
        const newMeeting = {
          id: `mtg-${Date.now()}`,
          title,
          status: 'scheduled',
          team_id: team_id || 'team-1',
          created_by: user?.id || 'mock-1',
          scheduled_at: scheduledAt,
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

      const insertData = {
        title,
        created_by: user?.id,
        status: 'scheduled',
        scheduled_at: scheduledAt,
      };
      if (team_id) insertData.team_id = team_id;

      const { data: meeting, error } = await supabase
        .from('meetings')
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;

      let insertedAgendas = [];
      if (agendas.length > 0) {
        const agendaRows = agendas.map((a, i) => ({
          meeting_id: meeting.id,
          title: a.title,
          duration_minutes: a.duration_minutes || 10,
          status: 'pending',
          sort_order: i,
        }));
        const { data: savedAgendas, error: agendaErr } = await supabase
          .from('agendas')
          .insert(agendaRows)
          .select();
        if (agendaErr) console.error('[createMeeting] agenda insert error:', agendaErr);
        insertedAgendas = savedAgendas || agendaRows.map((a, i) => ({ ...a, id: `local-${Date.now()}-${i}` }));
      }
      // 참석자 정보 포함
      const participants = [
        { id: user?.id, name: user?.name || '사용자', color: '#723CEB' },
        ...(meetingParticipants || []),
      ];
      addMeeting({ ...meeting, agendas: insertedAgendas, participants });
      return meeting;
    },
    [user, addMeeting]
  );

  // 회의 시작
  const startMeeting = useCallback(
    async (id) => {
      const patch = { status: 'active', started_at: new Date().toISOString() };
      if (canUseDB) {
        await supabase.from('meetings').update(patch).eq('id', id);
      }
      updateMeeting(id, patch);

      // 첫 번째 어젠다를 active로 설정
      const meeting = useMeetingStore.getState().meetings.find((m) => m.id === id);
      const firstAgenda = meeting?.agendas?.[0];
      if (firstAgenda) {
        if (canUseDB && firstAgenda.id && !firstAgenda.id.startsWith('local-')) {
          await supabase.from('agendas').update({ status: 'active' }).eq('id', firstAgenda.id);
        }
        const updatedAgendas = (meeting.agendas || []).map((a, i) => ({
          ...a,
          status: i === 0 ? 'active' : a.status || 'pending',
        }));
        updateMeeting(id, { agendas: updatedAgendas });
      }
    },
    [updateMeeting]
  );

  // 회의 종료 + AI 요약 생성
  const endMeeting = useCallback(
    async (id, { messages = [], agendas = [] } = {}) => {
      // ─── 빈 회의 판단 ───
      // 사람 메시지가 한 개도 없으면 기록할 가치가 없으므로 회의를 자동 삭제하고 종료.
      // (AI 인사말만 있거나 아무도 말하지 않은 회의 → 회의록 리스트 오염 방지)
      const humanMessages = (messages || []).filter((m) => !m?.is_ai);
      const isEmptyMeeting = humanMessages.length === 0;

      if (isEmptyMeeting) {
        console.log('[endMeeting] 빈 회의 — 자동 삭제합니다:', id);
        try {
          if (canUseDB) {
            // FK 제약 회피: 자식 테이블부터 정리
            await supabase.from('messages').delete().eq('meeting_id', id);
            await supabase.from('agendas').delete().eq('meeting_id', id);
            await supabase.from('meeting_summaries').delete().eq('meeting_id', id);
            await supabase.from('meetings').delete().eq('id', id);
          }
        } catch (err) {
          console.warn('[endMeeting] 빈 회의 삭제 중 일부 실패:', err.message);
        }
        // 로컬 state 에서도 제거
        useMeetingStore.setState((s) => ({
          meetings: s.meetings.filter((m) => m.id !== id),
        }));
        return null;
      }

      const patch = { status: 'completed', ended_at: new Date().toISOString() };
      if (canUseDB) {
        await supabase.from('meetings').update(patch).eq('id', id);
      }
      updateMeeting(id, patch);

      // AI 요약 생성 시도
      let summary = null;
      try {
        summary = await generateSummary({ meetingId: id, messages, agendas });
        console.log('[endMeeting] AI 요약 생성 완료:', summary);
      } catch (err) {
        console.warn('[endMeeting] AI 요약 생성 실패 (데모 요약 사용):', err.message);
      }

      // DB 저장은 Edge Function(generate-summary)에서 자동 처리됨
      // canUseDB일 때 프론트엔드에서 별도 저장하지 않음

      // 데모 모드: localStorage에 저장
      if (summary && !canUseDB) {
        try {
          const stored = JSON.parse(localStorage.getItem('meetflow-summaries') || '{}');
          stored[id] = { ...summary, meeting_id: id, created_at: new Date().toISOString() };
          localStorage.setItem('meetflow-summaries', JSON.stringify(stored));
        } catch {}
      }

      // Slack 종료 알림
      if (canUseDB) {
        const meeting = useMeetingStore.getState().meetings.find((m) => m.id === id);
        try {
          await supabase.functions.invoke('slack-notify', {
            body: {
              event: 'meeting_ended',
              payload: {
                title: meeting?.title || '회의',
                meeting_id: id,
                ended_by: user?.name || '사용자',
                summary_preview: summary?.milo_insights || '',
                decisions_count: summary?.decisions?.length || 0,
                action_items_count: summary?.action_items?.length || 0,
              },
            },
          });
        } catch (err) {
          console.warn('[endMeeting] Slack 종료 알림 실패:', err);
        }

        // Notion 동기화 — 회의록 자동 아카이브
        try {
          await supabase.functions.invoke('notion-sync', {
            body: {
              meeting_id: id,
              title: meeting?.title,
              summary,
            },
          });
          console.log('[endMeeting] Notion 동기화 완료');
        } catch (err) {
          console.warn('[endMeeting] Notion 동기화 실패:', err);
        }
      }

      // 데모 모드: 콘솔 로그
      if (!canUseDB && summary) {
        console.log('[데모] 회의 종료 — Slack 종료 알림 + Notion 동기화는 Supabase 연결 후 활성화됩니다.');
      }

      return summary;
    },
    [updateMeeting, user]
  );

  // 회의 요청 — Slack 통지 + Google Calendar 연동
  const requestMeeting = useCallback(
    async ({ title, team_id, agendas = [], participants = [], files = [], scheduledDate, scheduledTime, duration }) => {
      // 1. 회의 생성 (날짜/시간 포함)
      const meeting = await createMeeting({ title, team_id, agendas, participants, scheduledDate, scheduledTime });

      // 2. Slack 통지 (Edge Function 호출)
      if (canUseDB && team_id) {
        try {
          console.log('[requestMeeting] Slack 통지 시작 — team_id:', team_id, '파일 수:', files.length, '파일명:', files.map(f => f.name));
          const { data: slackRes, error: slackErr } = await supabase.functions.invoke('slack-notify', {
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
                files: files.slice(0, 5),
              },
            },
          });
          if (slackErr) {
            console.error('[requestMeeting] Slack Edge Function 에러:', slackErr);
          } else {
            console.log('[requestMeeting] Slack 통지 응답:', slackRes);
          }
        } catch (err) {
          console.error('[requestMeeting] Slack 통지 실패:', err);
        }
      }

      // 3. Google Calendar 이벤트 생성 (Edge Function 호출)
      if (canUseDB && scheduledDate && scheduledTime) {
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
      if (!canUseDB) {
        console.log('[데모] 회의 요청 완료 — Slack/Calendar 연동은 Supabase 연결 후 활성화됩니다.');
        console.log('[데모] Slack 통지 대상:', participants.map((p) => p.name).join(', '));
        console.log('[데모] Calendar 일정:', `${scheduledDate} ${scheduledTime} (${duration}분)`);
      }

      return meeting;
    },
    [user, createMeeting]
  );

  // 회의 삭제 (취소) — Slack 알림 포함
  // options.autoCancel: 자동 취소 여부 (기본 false = 수동)
  // options.reason: 자동 취소 사유 (선택)
  const deleteMeeting = useCallback(
    async (id, options = {}) => {
      const { autoCancel = false, reason = null } = options;

      // Slack 알림용 회의 정보 먼저 스냅샷 (DELETE 후엔 조회 불가)
      const meeting = useMeetingStore.getState().meetings.find((m) => m.id === id);

      if (canUseDB) {
        // Slack 취소 알림 — DB 삭제 전에 발송 (팀 채널 조회는 slack-notify 내부에서)
        if (meeting?.team_id) {
          try {
            await supabase.functions.invoke('slack-notify', {
              body: {
                event: 'meeting_cancelled',
                payload: {
                  title: meeting.title,
                  team_id: meeting.team_id,
                  scheduled_at: meeting.scheduled_at,
                  cancelled_by: user?.name || '사용자',
                  auto_cancel: autoCancel,
                  reason: reason || (autoCancel ? '24시간 경과, 시작 안 됨' : null),
                },
              },
            });
          } catch (err) {
            console.warn('[deleteMeeting] Slack 취소 알림 실패:', err);
          }
        }

        await supabase.from('meetings').delete().eq('id', id);
      }
      removeMeeting(id);
    },
    [removeMeeting, user, canUseDB]
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
