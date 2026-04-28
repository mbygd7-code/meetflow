-- 045: meeting_summaries / tasks RLS 확장 — 참가자 접근 허용
--   기존: team_members 만 SELECT → 팀 무관 게스트/외부 초대 참가자가 회의록 못 봄
--   신규: meeting_participants 에 등록된 사용자, 회의 created_by 본인 도 접근 허용
--   배경: 022 에서 messages 는 이미 동일 패턴 적용. summaries/tasks 도 동일하게 확장.

-- ══════════════════════════════════════════════════════
-- meeting_summaries: 참가자 / 생성자 SELECT 허용
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "participants_read_summaries" ON meeting_summaries;
CREATE POLICY "participants_read_summaries" ON meeting_summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meeting_participants mp
      WHERE mp.meeting_id = meeting_summaries.meeting_id
        AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "creator_read_summaries" ON meeting_summaries;
CREATE POLICY "creator_read_summaries" ON meeting_summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = meeting_summaries.meeting_id
        AND m.created_by = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════
-- tasks: 참가자 / 생성자 SELECT 허용 (assignee 는 기존 정책으로 이미 가능)
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "participants_read_tasks" ON tasks;
CREATE POLICY "participants_read_tasks" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meeting_participants mp
      WHERE mp.meeting_id = tasks.meeting_id
        AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "creator_read_tasks" ON tasks;
CREATE POLICY "creator_read_tasks" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      WHERE m.id = tasks.meeting_id
        AND m.created_by = auth.uid()
    )
  );
