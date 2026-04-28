-- 047: meetings.acknowledged_by — Slack "확인했어요" 클릭 추적
-- 회의 요청 Slack 메시지의 ack_meeting 액션 클릭 시 누가 확인했는지 기록
-- 형식: [{ user_id, slack_user_id, name, acknowledged_at }]

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS acknowledged_by JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_meetings_acknowledged_by_gin
  ON meetings USING GIN (acknowledged_by);
