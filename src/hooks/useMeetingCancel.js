import { useCallback } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useToastStore } from '@/stores/toastStore';
import { useMeeting } from './useMeeting';

const DECLINED_KEY = 'meetflow-declined-meeting-ids';

function loadDeclined() {
  try { return new Set(JSON.parse(localStorage.getItem(DECLINED_KEY) || '[]')); }
  catch { return new Set(); }
}

// 본인이 불참 표시한 회의 ID — 전역 Zustand 스토어
const useDeclinedStore = create((set, get) => ({
  declinedIds: loadDeclined(),
  markDeclined: (meetingId) => {
    const next = new Set(get().declinedIds);
    next.add(meetingId);
    try { localStorage.setItem(DECLINED_KEY, JSON.stringify([...next])); } catch {}
    set({ declinedIds: next });
  },
}));

// 취소/불참 확인 다이얼로그 — App 단위 단일 인스턴스
export const useCancelDialogStore = create((set) => ({
  pending: null, // { meeting, isCreator, onConfirm } | null
  openDialog: (meeting, isCreator, onConfirm) => set({ pending: { meeting, isCreator, onConfirm } }),
  closeDialog: () => set({ pending: null }),
}));

/**
 * 회의 카드 취소(요청자) / 불참(참가자) 처리 공통 훅.
 * 클릭 시 커스텀 다이얼로그를 띄우고 사용자 확인 후 처리.
 */
export function useMeetingCancel() {
  const { user } = useAuthStore();
  const { deleteMeeting } = useMeeting();
  const updateMeetingInStore = useMeetingStore((s) => s.updateMeeting);
  const addToast = useToastStore((s) => s.addToast);

  const declinedIds = useDeclinedStore((s) => s.declinedIds);
  const markDeclinedLocal = useDeclinedStore((s) => s.markDeclined);
  const openDialog = useCancelDialogStore((s) => s.openDialog);

  const handleCancel = useCallback((e, meeting) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();

    const isCreator = !!(meeting?.created_by && user?.id && meeting.created_by === user.id);

    openDialog(meeting, isCreator, async (reason) => {
      if (isCreator) {
        // 요청자 → 회의 취소
        try {
          await deleteMeeting(meeting.id, { reason: reason || null });
          addToast(`"${meeting.title}" 회의가 취소되었습니다. Slack · Calendar 취소 알림이 전송되었습니다.`, 'success');
        } catch (err) {
          console.error('[useMeetingCancel] 취소 실패:', err);
          addToast(`회의 취소 실패: ${err.message || '알 수 없는 오류'}`, 'error');
        }
        return;
      }

      // 참가자 → 불참 처리
      markDeclinedLocal(meeting.id); // 즉시 카드 숨김

      try {
        const { data: latest, error: fetchErr } = await supabase
          .from('meetings')
          .select('acknowledged_by')
          .eq('id', meeting.id)
          .single();
        if (fetchErr) throw fetchErr;

        const list = Array.isArray(latest?.acknowledged_by) ? latest.acknowledged_by : [];
        const filtered = list.filter((a) => a?.user_id !== user.id);
        filtered.push({
          user_id: user.id,
          name: user.name || '참가자',
          status: 'declined',
          reason: reason || null,
          declined_at: new Date().toISOString(),
          source: 'app',
        });

        const { error: updErr } = await supabase
          .from('meetings')
          .update({ acknowledged_by: filtered })
          .eq('id', meeting.id);
        if (updErr) throw updErr;

        updateMeetingInStore(meeting.id, { acknowledged_by: filtered });

        try {
          await supabase.functions.invoke('slack-notify', {
            body: {
              event: 'meeting_declined',
              payload: {
                meeting_id: meeting.id,
                title: meeting.title,
                created_by: meeting.created_by,
                declined_by_id: user.id,
                declined_by_name: user.name || '참가자',
                reason: reason || null,
                scheduled_at: meeting.scheduled_at,
              },
            },
          });
        } catch (slackErr) {
          console.warn('[useMeetingCancel] Slack 불참 알림 실패:', slackErr);
        }

        addToast(`"${meeting.title}" 회의에 불참 표시했습니다. 요청자에게 Slack 알림이 전송되었습니다.`, 'success');
      } catch (err) {
        console.error('[useMeetingCancel] 불참 처리 실패:', err);
        addToast(`불참 처리 실패: ${err.message || '알 수 없는 오류'}`, 'error');
      }
    });
  }, [user, deleteMeeting, updateMeetingInStore, addToast, markDeclinedLocal, openDialog]);

  // 미초대 회의에 참석 — meeting_participants에 추가 + Slack 알림
  const handleJoin = useCallback(async (e, meeting) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!user?.id || !meeting?.id) return;
    if (!confirm(`"${meeting.title}" 회의에 참석하시겠습니까?\n\n요청자에게 Slack 알림이 전송됩니다.`)) return;

    try {
      // 1) meeting_participants 등록 (이미 있으면 onConflict로 무시)
      const { error: insertErr } = await supabase
        .from('meeting_participants')
        .upsert(
          { meeting_id: meeting.id, user_id: user.id, role: 'participant' },
          { onConflict: 'meeting_id,user_id' }
        );
      if (insertErr) throw insertErr;

      // 2) acknowledged_by에 attending 응답 기록
      const { data: latest } = await supabase
        .from('meetings')
        .select('acknowledged_by')
        .eq('id', meeting.id)
        .single();
      const list = Array.isArray(latest?.acknowledged_by) ? latest.acknowledged_by : [];
      const filtered = list.filter((a) => a?.user_id !== user.id);
      filtered.push({
        user_id: user.id,
        name: user.name || '참가자',
        status: 'attending',
        attended_at: new Date().toISOString(),
        source: 'app-self-join',
      });
      await supabase.from('meetings').update({ acknowledged_by: filtered }).eq('id', meeting.id);

      // 3) 로컬 store 갱신 — 참가자 추가 + ack 갱신
      const newParticipant = {
        id: user.id,
        name: user.name || '참가자',
        color: user.avatar_color || undefined,
        role: 'participant',
      };
      const existingParts = Array.isArray(meeting.participants) ? meeting.participants : [];
      const newParts = existingParts.some((p) => p?.id === user.id)
        ? existingParts
        : [...existingParts, newParticipant];
      updateMeetingInStore(meeting.id, { participants: newParts, acknowledged_by: filtered });

      // 4) Slack 알림 — 요청자 DM
      try {
        await supabase.functions.invoke('slack-notify', {
          body: {
            event: 'meeting_self_join',
            payload: {
              meeting_id: meeting.id,
              title: meeting.title,
              created_by: meeting.created_by,
              joined_by_id: user.id,
              joined_by_name: user.name || '참가자',
              scheduled_at: meeting.scheduled_at,
            },
          },
        });
      } catch (slackErr) {
        console.warn('[useMeetingCancel] Slack 참석 알림 실패:', slackErr);
      }

      addToast(`"${meeting.title}" 회의에 참석으로 등록했습니다. 요청자에게 Slack 알림이 전송되었습니다.`, 'success');
    } catch (err) {
      console.error('[useMeetingCancel] 참석 처리 실패:', err);
      addToast(`참석 처리 실패: ${err.message || '알 수 없는 오류'}`, 'error');
    }
  }, [user, updateMeetingInStore, addToast]);

  return { handleCancel, handleJoin, declinedIds };
}

/**
 * 본인과 무관한 회의(요청자도, 참가자도 아닌)를 가리는 필터.
 * 관리자는 모든 회의를 봅니다 — 호출 측에서 isAdmin이면 이 함수를 거치지 마세요.
 */
export function isMyMeeting(meeting, userId) {
  if (!userId || !meeting) return false;
  // 1) 요청자 본인
  if (meeting.created_by === userId) return true;
  // 2) 명시적 참가자 (meeting_participants 테이블 → meeting.participants 배열)
  const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
  if (participants.some((p) => p?.id === userId)) return true;
  return false;
}

/**
 * 본인이 불참 표시했거나 acknowledged_by에 declined가 있는 예정 회의를 숨기는 필터.
 * (요청자 본인 회의는 숨기지 않음)
 */
export function isDeclinedByMe(meeting, userId, declinedIds) {
  if (!userId) return false;
  if (meeting?.created_by === userId) return false;
  if (declinedIds?.has?.(meeting?.id)) return true;
  const ack = Array.isArray(meeting?.acknowledged_by) ? meeting.acknowledged_by : [];
  const mine = ack.find((a) => a?.user_id === userId);
  return mine?.status === 'declined';
}
