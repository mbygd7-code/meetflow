-- 019: tasks UPDATE RLS 완화 + created_by 컬럼 추가
-- 기존: assignee_id = auth.uid() 만 허용 → 미배정 태스크/다른 팀원 태스크 편집 불가
-- 신규: SELECT 가능한 사용자(담당자 / 같은 팀 멤버 / admin / 작성자)면 UPDATE 허용
-- 사용 맥락: 멤버 페이지 태스크 상세 — 담당자 지정, 설명/마감일/우선순위 편집, 첨부/서브태스크 저장

-- created_by 컬럼 (태스크 작성자 추적용, UI/RLS 모두 사용)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.tasks.created_by IS '태스크를 만든 사용자';

-- 기존 정책 제거
DROP POLICY IF EXISTS "assignee_update_tasks" ON public.tasks;
DROP POLICY IF EXISTS "team_members_update_tasks" ON public.tasks;

-- 새 정책: 관련 팀 멤버 전원 + admin + 담당자 + 작성자
CREATE POLICY "team_members_update_tasks"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE m.id = tasks.meeting_id AND tm.user_id = auth.uid()
    )
    -- 미배정 + meeting_id 없는 수동 태스크: 인증 사용자면 편집 가능
    OR (tasks.assignee_id IS NULL AND tasks.meeting_id IS NULL)
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE m.id = tasks.meeting_id AND tm.user_id = auth.uid()
    )
    OR (tasks.assignee_id IS NULL AND tasks.meeting_id IS NULL)
  );

COMMENT ON POLICY "team_members_update_tasks" ON public.tasks IS
  'V11: 담당자/작성자/관리자/관련 팀멤버가 태스크를 편집 가능 (멤버 페이지 인라인 편집용)';
