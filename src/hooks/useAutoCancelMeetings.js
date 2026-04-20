import { useEffect, useRef } from 'react';
import { useMeeting } from '@/hooks/useMeeting';
import { useMeetingStore } from '@/stores/meetingStore';

// 예정 시간이 24시간 이상 지난 scheduled 회의를 자동 취소
// Slack 취소 알림 포함 (auto_cancel=true로 발송)
//
// 사용처: MeetingLobby, DashboardPage 등 회의 목록 페이지에서 마운트
// 동작: 페이지 진입 시 1회 체크 + 1시간마다 재체크
const AUTO_CANCEL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24시간
const RECHECK_INTERVAL_MS = 60 * 60 * 1000; // 1시간

export function useAutoCancelMeetings({ enabled = true } = {}) {
  const { deleteMeeting } = useMeeting();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const runCheck = async () => {
      if (runningRef.current) return;
      runningRef.current = true;

      try {
        const now = Date.now();
        // 최신 스토어 상태에서 scheduled 회의만 필터
        const overdueScheduled = useMeetingStore.getState().meetings.filter((m) => {
          if (m.status !== 'scheduled') return false;
          const scheduledAt = m.scheduled_at || m.created_at;
          if (!scheduledAt) return false;
          const scheduledMs = new Date(scheduledAt).getTime();
          if (isNaN(scheduledMs)) return false;
          return (now - scheduledMs) > AUTO_CANCEL_THRESHOLD_MS;
        });

        if (overdueScheduled.length === 0) return;

        console.log(`[useAutoCancelMeetings] ${overdueScheduled.length}개 회의 자동 취소 대상 감지`);

        // 순차 처리 (동시 요청 폭주 방지)
        for (const meeting of overdueScheduled) {
          try {
            await deleteMeeting(meeting.id, {
              autoCancel: true,
              reason: '24시간 경과, 시작 안 됨',
            });
            console.log(`[useAutoCancelMeetings] 자동 취소 완료: ${meeting.title}`);
          } catch (err) {
            console.warn(`[useAutoCancelMeetings] 자동 취소 실패: ${meeting.title}`, err);
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    // 진입 시 즉시 1회 체크 (약간 지연으로 초기 로딩 완료 후 실행)
    const initialTimer = setTimeout(runCheck, 2000);
    // 이후 1시간마다 재체크
    const intervalTimer = setInterval(runCheck, RECHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [enabled, deleteMeeting]);
}
