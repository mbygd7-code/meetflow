-- 016: users.slack_user_id 팀원 간 업데이트 허용
-- V10 '담당자 Slack ID 매핑' 기능: 다른 팀원의 slack_user_id를 업데이트할 수 있어야 함.
-- 기존 "users update self" 정책은 id = auth.uid()로만 허용 → 다른 사용자 수정 불가.
-- 이 정책은 같은 팀 소속 사용자끼리만 slack_user_id 매핑을 허용함.

-- 기존 정책 제거 (있으면)
DROP POLICY IF EXISTS "team_members_update_slack_id" ON public.users;

-- 같은 팀 멤버는 서로의 slack_user_id를 업데이트할 수 있음
CREATE POLICY "team_members_update_slack_id"
  ON public.users
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm_me
      JOIN public.team_members tm_target ON tm_me.team_id = tm_target.team_id
      WHERE tm_me.user_id = auth.uid()
        AND tm_target.user_id = users.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_members tm_me
      JOIN public.team_members tm_target ON tm_me.team_id = tm_target.team_id
      WHERE tm_me.user_id = auth.uid()
        AND tm_target.user_id = users.id
    )
  );

COMMENT ON POLICY "team_members_update_slack_id" ON public.users IS
  'V10: 팀원끼리 slack_user_id를 매핑할 수 있도록 허용 (DM 알림용)';
