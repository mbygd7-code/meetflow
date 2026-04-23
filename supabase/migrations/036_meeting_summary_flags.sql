-- 036: 회의록 상태 플래그
-- - summary_skipped: 사용자가 "요약 취소"로 종료한 경우 (회의록 리스트 제외)
-- - summary_failed:  AI 요약 생성이 실패한 경우 (리스트엔 노출하되 "요약 실패" 뱃지 표시)
-- 둘 다 null이고 meeting_summaries row가 있으면 정상 요약 완료 상태

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS summary_skipped BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_failed  BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.meetings.summary_skipped IS
  'true = 사용자가 요약 없이 회의 종료 (회의록 리스트에서 숨김)';
COMMENT ON COLUMN public.meetings.summary_failed IS
  'true = AI 요약 생성 실패 — 리스트엔 노출하되 재시도 유도';
