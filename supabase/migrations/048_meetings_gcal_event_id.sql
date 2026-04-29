-- 048: meetings.gcal_event_id — Google Calendar 이벤트 ID 저장
-- 회의 취소 시 Calendar 이벤트도 함께 삭제하기 위해 필요

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_meetings_gcal_event_id
  ON meetings(gcal_event_id) WHERE gcal_event_id IS NOT NULL;
