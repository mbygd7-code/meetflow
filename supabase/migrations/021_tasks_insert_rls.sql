-- 021: tasks INSERT RLS 추가
-- 문제: 002 마이그레이션에 tasks RLS 활성화했으나 INSERT 정책 누락
--       → 멤버 페이지의 "+ 새 태스크" 등 모든 수동 태스크 생성 실패
--       (회의 AI 추출 태스크는 service_role key로 넣어서 우회하고 있었음)
--
-- 신규: 인증된 사용자는 자기 자신이 created_by인 태스크를 생성 가능
--       assignee_id는 본인/타인 모두 허용 (다른 사람에게 배정 OK)

DROP POLICY IF EXISTS "authenticated_insert_tasks" ON public.tasks;

CREATE POLICY "authenticated_insert_tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR created_by IS NULL  -- created_by 미설정 태스크(시스템/AI 생성)도 허용
  );

COMMENT ON POLICY "authenticated_insert_tasks" ON public.tasks IS
  'V11: 인증 사용자가 태스크 생성 가능. created_by를 본인으로 설정하거나 NULL 허용';

-- DELETE 정책도 함께 추가 (관리자/작성자/담당자)
DROP POLICY IF EXISTS "authenticated_delete_tasks" ON public.tasks;

CREATE POLICY "authenticated_delete_tasks"
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMENT ON POLICY "authenticated_delete_tasks" ON public.tasks IS
  'V11: 작성자/담당자/관리자가 태스크 삭제 가능';
