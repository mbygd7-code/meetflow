-- 042: 관리자의 회의 자료(meeting_files) 삭제 권한
-- 배경: 기존 "meeting_files_delete" 정책은 업로더 또는 회의 생성자만 삭제 허용.
-- 관리자(users.role = 'admin')도 모든 회의 자료를 삭제할 수 있어야 함.
-- 추가 정책으로 분리 — 기존 정책 유지하면서 OR 조건처럼 동작.

DROP POLICY IF EXISTS "admins delete all meeting_files" ON public.meeting_files;
CREATE POLICY "admins delete all meeting_files"
  ON public.meeting_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMENT ON POLICY "admins delete all meeting_files" ON public.meeting_files IS
  '관리자는 회의에 첨부된 모든 자료를 삭제할 수 있음 (UI에서 X 버튼 노출)';
