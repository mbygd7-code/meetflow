-- 027: messages RLS — admin 우회 보강
--
-- 문제: 025에서 INSERT/UPDATE 정책이 admin을 고려하지 않음
--   → admin이 "created_by NULL + 본인 비멤버 팀" 회의에 메시지 전송 시 42501
--   (024의 ON DELETE SET NULL로 창작자 NULL된 레거시 회의가 존재)
--
-- 해결: INSERT/UPDATE에도 admin 우회 절 추가 (SELECT/DELETE는 025에서 이미 admin 허용)

-- ══════════════════════════════════════════════════════
-- INSERT — admin은 회의 접근 권한 체크 면제
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    -- user_id 위변조 방지는 유지 (admin도 타인 이름으로 INSERT 불가)
    (user_id = auth.uid() OR (is_ai = true AND user_id IS NULL))
    AND (
      meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
    )
  );

-- ══════════════════════════════════════════════════════
-- UPDATE — 본인 메시지 또는 admin
-- ══════════════════════════════════════════════════════
DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

COMMENT ON POLICY "messages_insert" ON public.messages IS
  'INSERT: user_id 위변조 방지 + 회의 접근 권한자 또는 admin';
COMMENT ON POLICY "messages_update" ON public.messages IS
  'UPDATE: 본인 메시지 또는 admin만 가능';
