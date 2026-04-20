-- 014: users 테이블 RLS 완화 — 모든 인증 사용자가 전체 회원 목록 조회 가능
--
-- 배경: 기존 RLS는 "같은 팀 멤버만 조회 가능"이라 회의 참석자 선택 시
-- 다른 팀의 직원들이 안 보이는 문제 발생. 회사 내 직원 간 협업이 기본인
-- MeetFlow 특성상 전체 직원 조회는 안전하고 필요함.
--
-- 영향:
-- - 로그인한 사용자는 모든 users 행의 id, name, email, avatar_color, role 조회 가능
-- - password 등 민감 정보는 Supabase auth.users 테이블에 있고 public.users에는 저장 안 함
-- - 개인정보 영향 낮음 (회사 내부 협업 툴)

-- 기존 select 정책 제거
DROP POLICY IF EXISTS "users_select_own_team" ON public.users;
DROP POLICY IF EXISTS "users select" ON public.users;
DROP POLICY IF EXISTS "Users can view own team members" ON public.users;
DROP POLICY IF EXISTS "authenticated_read_users" ON public.users;

-- 새 정책: 모든 인증 사용자는 모든 users 행 조회 가능
CREATE POLICY "authenticated_read_users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- team_members 테이블도 동일하게 완화 (참석자 선택 시 팀 관계 조회 필요)
DROP POLICY IF EXISTS "team_members_select_own_team" ON public.team_members;
DROP POLICY IF EXISTS "Team members view" ON public.team_members;

CREATE POLICY "authenticated_read_team_members"
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (true);

-- teams 테이블도 완화 (모든 팀 목록 표시용)
DROP POLICY IF EXISTS "teams_select_own" ON public.teams;
DROP POLICY IF EXISTS "Teams view own" ON public.teams;

CREATE POLICY "authenticated_read_teams"
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (true);

-- 참고:
-- - INSERT/UPDATE/DELETE 정책은 기존 그대로 유지 (본인 정보만 수정 가능)
-- - 관리자만 users 수정 가능한 정책이 이미 있으면 그것도 유지
