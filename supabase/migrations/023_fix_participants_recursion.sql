-- 023: meeting_participants RLS 무한 재귀 수정
--
-- 문제: 022의 participants_select 정책이 내부에서 meeting_participants를 다시 조회 → 무한 루프
--       "infinite recursion detected in policy for relation 'meeting_participants'" (42P17)
--
-- 해결: SECURITY DEFINER 함수로 RLS 우회하는 체크 헬퍼 작성
--       → 정책에서 이 함수 호출 시 RLS가 비활성화 상태로 조회 → 재귀 없음

-- ══════════════════════════════════════════════════════
-- 1) SECURITY DEFINER 헬퍼 함수
-- ══════════════════════════════════════════════════════

-- 특정 user가 특정 meeting의 참석자인지 확인 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_meeting_participant(
  check_meeting_id UUID,
  check_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = check_meeting_id
      AND user_id = check_user_id
  );
$$;

-- 특정 user가 접근 가능한 모든 meeting_id 반환 (팀 멤버 + 참석자 통합, RLS 우회)
CREATE OR REPLACE FUNCTION public.accessible_meeting_ids(check_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT m.id FROM public.meetings m
  JOIN public.team_members tm ON tm.team_id = m.team_id
  WHERE tm.user_id = check_user_id
  UNION
  SELECT mp.meeting_id FROM public.meeting_participants mp
  WHERE mp.user_id = check_user_id;
$$;

-- 함수 실행 권한
GRANT EXECUTE ON FUNCTION public.is_meeting_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accessible_meeting_ids(UUID) TO authenticated;

-- ══════════════════════════════════════════════════════
-- 2) meeting_participants 정책 재작성 (재귀 제거)
-- ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "participants_select" ON public.meeting_participants;
DROP POLICY IF EXISTS "participants_insert" ON public.meeting_participants;
DROP POLICY IF EXISTS "participants_delete" ON public.meeting_participants;

-- SELECT: 본인 레코드 OR 회의 소속 팀 멤버 OR 회의 생성자
-- (같은 회의 참석자끼리 서로 볼 수 있는 것은 함수로 처리해 재귀 회피)
CREATE POLICY "participants_select"
  ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
        AND (
          m.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = m.team_id AND tm.user_id = auth.uid()
          )
        )
    )
    -- 같은 회의의 참석자 간 상호 조회: 헬퍼 함수 사용 (재귀 X)
    OR public.is_meeting_participant(meeting_participants.meeting_id, auth.uid())
  );

-- INSERT: 본인 등록 / 회의 생성자 / admin / 팀 멤버
CREATE POLICY "participants_insert"
  ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
        AND m.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE m.id = meeting_participants.meeting_id
        AND tm.user_id = auth.uid()
    )
  );

-- DELETE
CREATE POLICY "participants_delete"
  ON public.meeting_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
        AND m.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ══════════════════════════════════════════════════════
-- 3) messages / agendas RLS — 헬퍼 함수 사용해 재작성
-- ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "messages_accessible" ON public.messages;
CREATE POLICY "messages_accessible"
  ON public.messages FOR ALL TO authenticated
  USING (
    meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "agendas_accessible" ON public.agendas;
CREATE POLICY "agendas_accessible"
  ON public.agendas FOR ALL TO authenticated
  USING (
    meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
  );

-- ══════════════════════════════════════════════════════
-- 4) meetings SELECT도 동일 패턴
-- ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "meetings_select_expanded" ON public.meetings;
CREATE POLICY "meetings_select_expanded"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    id IN (SELECT public.accessible_meeting_ids(auth.uid()))
    OR created_by = auth.uid()
  );
