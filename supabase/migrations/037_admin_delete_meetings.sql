-- 037: 관리자의 회의 삭제 권한
-- 기존 "meetings delete by creator" 정책은 생성자만 삭제 가능.
-- 관리자(users.role = 'admin')는 모든 회의를 삭제할 수 있어야 함.

DROP POLICY IF EXISTS "admins delete all meetings" ON public.meetings;
CREATE POLICY "admins delete all meetings"
  ON public.meetings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMENT ON POLICY "admins delete all meetings" ON public.meetings IS
  '관리자는 회의 삭제 가능 (회의록 목록/상세에서 삭제 버튼 노출)';
