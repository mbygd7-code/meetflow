-- 025: messages RLS 정리 — 중복 정책 제거 & 보안 강화
--
-- 문제:
--   messages 테이블에 6개 정책이 겹쳐 있고, 그 중 `messages_select USING true`가
--   모든 authenticated 사용자에게 모든 메시지 SELECT를 허용 → 팀 간 격리 파괴
--   (A팀 직원이 B팀 회의 메시지 조회 가능 상태)
--
-- 해결: 023의 accessible_meeting_ids() 헬퍼 기반 단일 정책으로 통합
--   - 회의 접근 권한자만 SELECT/INSERT/UPDATE/DELETE
--   - admin은 별도 SELECT 정책으로 전체 조회 허용 (관리자 대시보드)
--   - INSERT 시 user_id 위변조 방지 (본인 또는 AI만)
--
-- 영향: Realtime postgres_changes는 그대로 동작 (권한자에게만 이벤트 전달 — 정상)

-- ══════════════════════════════════════════════════════
-- 1) 기존 중복 정책 전부 제거
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admins read all messages" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages accessible to team_members_OR_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_accessible" ON public.messages;
DROP POLICY IF EXISTS "messages full by team members" ON public.messages;
DROP POLICY IF EXISTS "messages by meeting access" ON public.messages;

-- ══════════════════════════════════════════════════════
-- 2) SELECT — 회의 접근 권한자 또는 admin
-- ══════════════════════════════════════════════════════
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT TO authenticated
  USING (
    meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ══════════════════════════════════════════════════════
-- 3) INSERT — 회의 접근 권한자 & 본인 또는 AI 메시지만
-- ══════════════════════════════════════════════════════
CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
    AND (
      user_id = auth.uid()      -- 본인 메시지
      OR (is_ai = true AND user_id IS NULL)  -- AI 메시지 (Milo 등)
    )
  );

-- ══════════════════════════════════════════════════════
-- 4) UPDATE — 본인 메시지만
-- ══════════════════════════════════════════════════════
CREATE POLICY "messages_update"
  ON public.messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ══════════════════════════════════════════════════════
-- 5) DELETE — 본인 메시지 또는 admin
-- ══════════════════════════════════════════════════════
CREATE POLICY "messages_delete"
  ON public.messages FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ══════════════════════════════════════════════════════
-- 6) 확인 쿼리 (주석) — 실행 후 SQL Editor에서 직접 돌려볼 것
-- ══════════════════════════════════════════════════════
-- SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_clause
-- FROM pg_policy WHERE polrelid = 'public.messages'::regclass
-- ORDER BY polcmd;
-- 기대 결과: 4개 정책 (select/insert/update/delete), 각 1개씩

COMMENT ON POLICY "messages_select" ON public.messages IS
  '회의 접근 권한자(팀 멤버 또는 참석자) + admin만 SELECT';
COMMENT ON POLICY "messages_insert" ON public.messages IS
  '회의 접근 권한자가 본인 또는 AI 메시지로만 INSERT (user_id 위변조 방지)';
COMMENT ON POLICY "messages_update" ON public.messages IS
  '본인 메시지만 수정 가능';
COMMENT ON POLICY "messages_delete" ON public.messages IS
  '본인 메시지 또는 admin만 삭제 가능';
