-- 026: accessible_meeting_ids() 헬퍼에 누락된 케이스 보강
--
-- 문제: 025 적용 후 메시지 INSERT 시 42501 발생
--   원인: accessible_meeting_ids()가 다음 케이스를 포함하지 않음
--     (1) 회의 생성자(created_by) 본인 — meeting_participants에 자동 등록 X
--     (2) team_id = NULL인 개인/즉석 회의 — INNER JOIN에서 탈락
--
-- 해결: UNION에 meetings.created_by = user_id 절 추가

CREATE OR REPLACE FUNCTION public.accessible_meeting_ids(check_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- 1) 팀 멤버로서 접근 (team_id NOT NULL)
  SELECT m.id FROM public.meetings m
  JOIN public.team_members tm ON tm.team_id = m.team_id
  WHERE tm.user_id = check_user_id
  UNION
  -- 2) 참석자로서 접근
  SELECT mp.meeting_id FROM public.meeting_participants mp
  WHERE mp.user_id = check_user_id
  UNION
  -- 3) 회의 생성자 — team_id 유무와 무관하게 본인이 만든 회의 접근 (NEW)
  SELECT m.id FROM public.meetings m
  WHERE m.created_by = check_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.accessible_meeting_ids(UUID) TO authenticated;

COMMENT ON FUNCTION public.accessible_meeting_ids(UUID) IS
  '사용자가 접근 가능한 meeting_id 집합 — 팀 멤버/참석자/생성자 통합 (RLS 우회)';
