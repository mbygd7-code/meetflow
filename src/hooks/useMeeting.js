import { useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useMeetingStore } from '@/stores/meetingStore';
import { useAuthStore } from '@/stores/authStore';
import { generateSummary } from '@/lib/claude';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

export function useMeeting() {
  const { meetings: rawMeetings, setMeetings, addMeeting, updateMeeting, removeMeeting, getById } =
    useMeetingStore();
  const { user } = useAuthStore();

  // store 차원에서 race 로 같은 id 가 두 번 들어가는 케이스 방어 — 항상 unique 한 배열만 노출
  const meetings = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of (rawMeetings || [])) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [rawMeetings]);

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
    async ({ title, team_id, agendas = [], participants: meetingParticipants, files = [], scheduledDate, scheduledTime }) => {
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

      // ═══ meeting_participants INSERT ═══
      // 회의 생성자(host) + 초대된 사용자(participant) 등록
      // AI 직원(ai-xxx, milo 등 UUID 형식 아닌 id)은 제외 — 실제 계정 사용자만
      const isValidUuid = (id) =>
        typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      const participantRows = [];
      if (user?.id && isValidUuid(user.id)) {
        participantRows.push({ meeting_id: meeting.id, user_id: user.id, role: 'host' });
      }
      for (const p of meetingParticipants || []) {
        if (!p?.id || !isValidUuid(p.id)) continue;  // AI 직원 스킵
        if (p.id === user?.id) continue;  // host와 중복 방지
        participantRows.push({ meeting_id: meeting.id, user_id: p.id, role: 'participant' });
      }

      if (participantRows.length > 0) {
        const { error: partErr } = await supabase
          .from('meeting_participants')
          .upsert(participantRows, { onConflict: 'meeting_id,user_id' });
        if (partErr) console.error('[createMeeting] participants insert error:', partErr);
      }

      // ═══ 파일 업로드 (base64 → Storage + DB) — 병렬 처리 ═══
      // 각 파일 독립 업로드 (Promise.all). 실패한 파일은 결과 배열에서 추적해 호출자에게 보고.
      let uploadFailures = [];
      if (files.length > 0 && user?.id) {
        const OFFICE_RE = /\.(pptx|ppt|docx|doc|xlsx|xls|odp|odt|ods|rtf|csv|txt|md)$/i;
        const isOffice = (f) => OFFICE_RE.test(f.name || '')
          || /presentation|wordprocessing|spreadsheet|msword|ms-excel|ms-powerpoint|opendocument|application\/rtf|text\/csv/.test(f.type || '');

        const results = await Promise.all(files.map(async (f) => {
          try {
            if (!f.base64) return { name: f.name, ok: false, reason: 'no_base64' };
            const fileUuid = crypto.randomUUID();
            // Supabase Storage 는 ASCII 만 허용 — 한글/특수문자 모두 _ 로 치환.
            // 원본 파일명은 DB 의 name 컬럼에 그대로 보존.
            const ext = (f.name || '').match(/\.[^.]+$/)?.[0] || '';
            const safeName = `file${ext}`.replace(/[^\w.\-]/g, '_');
            const storagePath = `meetings/${meeting.id}/${fileUuid}_${safeName}`;

            const binary = atob(f.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: f.type || 'application/octet-stream' });

            const { error: upErr } = await supabase.storage
              .from('meeting-files')
              .upload(storagePath, blob, { cacheControl: '3600' });
            if (upErr) {
              console.error('[createMeeting] file upload error:', f.name, upErr);
              return { name: f.name, ok: false, reason: upErr.message || 'storage_error' };
            }

            const { data: insData, error: insErr } = await supabase.from('meeting_files').insert({
              meeting_id: meeting.id,
              uploaded_by: user.id,
              name: f.name,
              type: f.type || null,
              size: f.size || 0,
              storage_path: storagePath,
            }).select().single();
            if (insErr) {
              console.error('[createMeeting] meeting_files insert error:', f.name, insErr);
              return { name: f.name, ok: false, reason: insErr.message || 'db_error' };
            }

            // Office 파일 → 백그라운드로 PDF 변환 (비차단)
            if (insData?.id && isOffice(f)) {
              supabase.functions.invoke('office-to-pdf', { body: { fileId: insData.id } })
                .catch((e) => console.warn('[createMeeting] office 변환 실패:', f.name, e));
            }
            return { name: f.name, ok: true, row: insData };
          } catch (err) {
            console.error('[createMeeting] file process error:', f.name, err);
            return { name: f.name, ok: false, reason: String(err?.message || err) };
          }
        }));
        uploadFailures = results.filter((r) => !r.ok);
      }

      // 실패 정보를 meeting 객체에 첨부 (호출자가 toast 로 안내)
      if (uploadFailures.length > 0) {
        meeting._uploadFailures = uploadFailures;
      }

      // 로컬 store에 참석자 정보 포함 (UI 렌더용)
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

      const patch = {
        status: 'completed',
        ended_at: new Date().toISOString(),
        summary_skipped: false,  // 요약 시도했음 (취소 아님)
      };
      if (canUseDB) {
        await supabase.from('meetings').update(patch).eq('id', id);
      }
      updateMeeting(id, patch);

      // AI 요약 생성 시도 — Phase 2: meetingTitle 전달 (RAG 인덱싱 시 파일명 가독성↑)
      const meetingTitle = useMeetingStore.getState().meetings.find((m) => m.id === id)?.title || null;
      let summary = null;
      let summaryError = null;
      try {
        summary = await generateSummary({ meetingId: id, messages, agendas, meetingTitle });
        console.log('[endMeeting] AI 요약 생성 완료:', summary);
      } catch (err) {
        summaryError = err;
        console.warn('[endMeeting] AI 요약 생성 실패:', err?.message);
      }

      // 실패 시 summary_failed=true 기록 → SummariesPage에서 "요약 실패" 뱃지 표시
      if (!summary || summaryError) {
        const failPatch = { summary_failed: true };
        if (canUseDB) {
          try { await supabase.from('meetings').update(failPatch).eq('id', id); } catch {}
        }
        updateMeeting(id, failPatch);
      } else {
        // 성공했으면 summary_failed=false (재시도로 복구되는 경우도 처리)
        const okPatch = { summary_failed: false };
        if (canUseDB) {
          try { await supabase.from('meetings').update(okPatch).eq('id', id); } catch {}
        }
        updateMeeting(id, okPatch);
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

      // 요약 결과 + 실패 정보 반환 — 호출자가 UI 피드백에 활용
      return { summary, error: summaryError, failed: !summary || !!summaryError };
    },
    [updateMeeting, user]
  );

  // 회의 요청 — Slack 통지 + Google Calendar 연동
  const requestMeeting = useCallback(
    async ({ title, team_id, agendas = [], participants = [], files = [], scheduledDate, scheduledTime, duration }) => {
      // 1. 회의 생성 (날짜/시간 + 첨부 파일 포함)
      const meeting = await createMeeting({ title, team_id, agendas, participants, files, scheduledDate, scheduledTime });

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
