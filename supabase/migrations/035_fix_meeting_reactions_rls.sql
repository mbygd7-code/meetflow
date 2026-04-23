-- 035: meeting_reactions RLS 수정
-- 문제: 034의 SELECT 정책이 team_members JOIN 기반 → 팀 멤버십 설정이
-- 없거나 meeting.team_id가 null인 경우 upsert가 SELECT 단계에서 실패.
-- 해결: 인증된 사용자는 리액션을 조회할 수 있도록 정책 완화 +
-- 본인 리액션은 항상 조회/수정 가능하도록 보장.

-- 기존 SELECT 정책 제거
DROP POLICY IF EXISTS "team_members_read_reactions" ON public.meeting_reactions;

-- 새 SELECT 정책: 인증 사용자는 모두 조회 가능 (리액션은 공개 집계 정보)
-- 카운트 표시 용도이므로 팀 범위 제한 불필요
CREATE POLICY "authenticated_read_reactions"
  ON public.meeting_reactions
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE 정책은 그대로 (본인만 수정 가능)
-- 기존 정책이 남아있으면 중복되지 않으므로 유지
DROP POLICY IF EXISTS "users_insert_own_reactions" ON public.meeting_reactions;
CREATE POLICY "users_insert_own_reactions"
  ON public.meeting_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_reactions" ON public.meeting_reactions;
CREATE POLICY "users_update_own_reactions"
  ON public.meeting_reactions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_reactions" ON public.meeting_reactions;
CREATE POLICY "users_delete_own_reactions"
  ON public.meeting_reactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON POLICY "authenticated_read_reactions" ON public.meeting_reactions IS
  '인증된 사용자 모두 조회 가능 (upsert 호환 + 공개 카운트용)';
