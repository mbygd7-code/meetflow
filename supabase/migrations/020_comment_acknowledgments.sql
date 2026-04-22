-- 020: 댓글 확인(acknowledgment) 기능
-- Slack DM의 "확인했어요" 버튼을 누르면 누가/언제 확인했는지 기록
-- JSONB array: [{ user_id, user_name, acknowledged_at, source }]

ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS acknowledged_by JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.task_comments.acknowledged_by IS
  'JSONB array: [{ user_id, user_name, acknowledged_at, source: "slack"|"web" }]';

-- 기존 댓글도 빈 배열 보장
UPDATE public.task_comments
SET acknowledged_by = '[]'::jsonb
WHERE acknowledged_by IS NULL;
