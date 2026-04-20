-- 013: 예정 회의 자동 취소 백업 (서버 측 pg_cron)
--
-- 클라이언트 측(useAutoCancelMeetings)이 1차 처리하지만,
-- 사용자가 장기간 접속 안 할 경우 대비 서버 측에서도 매시간 정리.
--
-- 동작:
--   - 매시간 실행
--   - scheduled 상태 + scheduled_at이 24시간 이상 지난 회의 DELETE
--   - Slack 알림은 클라이언트 경로가 담당 (서버는 조용히 정리만)
--   - 7일 이상 지난 회의는 강제 정리 (Slack 알림 없이)

-- pg_cron 확장 활성화 (Supabase 지원)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 자동 취소 함수
CREATE OR REPLACE FUNCTION auto_cancel_overdue_meetings()
RETURNS TABLE (cancelled_count INT, details TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  -- 7일(168시간) 이상 지난 scheduled 회의는 무조건 정리
  -- (클라이언트 backup 역할: 장기간 아무도 접속 안 한 경우 DB 청소)
  DELETE FROM meetings
  WHERE status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, format('Deleted %s scheduled meetings older than 7 days', v_count)::TEXT;
END;
$$;

-- 기존 스케줄 제거 (재실행 가능하도록)
SELECT cron.unschedule('auto-cancel-meetings')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-cancel-meetings'
);

-- 매시간 실행 스케줄 등록
SELECT cron.schedule(
  'auto-cancel-meetings',
  '0 * * * *',  -- 매시간 정각
  $$ SELECT auto_cancel_overdue_meetings(); $$
);

-- 실행 결과 수동 확인용:
-- SELECT * FROM cron.job WHERE jobname = 'auto-cancel-meetings';
-- SELECT * FROM cron.job_run_details WHERE jobname = 'auto-cancel-meetings' ORDER BY start_time DESC LIMIT 10;
