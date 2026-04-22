-- 016: task_comments 테이블 — 태스크별 댓글 + @멘션 + 리액션
--
-- 용도:
-- - 팀원의 태스크에 커뮤니케이션 (질문/의견/답변)
-- - @mention으로 특정 사용자 태깅
-- - 리액션(👍 등)으로 간단 표현
-- - soft delete (삭제돼도 히스토리 유지)

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES public.task_comments(id) ON DELETE CASCADE,  -- 답글용
  content TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}',  -- @멘션된 user_id 배열
  reactions JSONB DEFAULT '{}',  -- { "👍": ["user_id1", "user_id2"], "❤️": [...] }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ  -- soft delete
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON public.task_comments(task_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_comments_user
  ON public.task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent
  ON public.task_comments(parent_id)
  WHERE parent_id IS NOT NULL;

-- Realtime (댓글 실시간 동기화)
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;

-- RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: 모든 인증 사용자 조회 가능
DROP POLICY IF EXISTS "authenticated_read_task_comments" ON public.task_comments;
CREATE POLICY "authenticated_read_task_comments"
  ON public.task_comments FOR SELECT TO authenticated USING (deleted_at IS NULL);

-- INSERT: 본인 댓글만 작성
DROP POLICY IF EXISTS "users_insert_own_comments" ON public.task_comments;
CREATE POLICY "users_insert_own_comments"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: 본인 댓글만 수정
DROP POLICY IF EXISTS "users_update_own_comments" ON public.task_comments;
CREATE POLICY "users_update_own_comments"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: 본인 댓글만 삭제 (관리자는 추후 별도 정책)
DROP POLICY IF EXISTS "users_delete_own_comments" ON public.task_comments;
CREATE POLICY "users_delete_own_comments"
  ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 관리자는 모든 댓글 삭제 가능 (선택)
DROP POLICY IF EXISTS "admins_delete_any_comment" ON public.task_comments;
CREATE POLICY "admins_delete_any_comment"
  ON public.task_comments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
