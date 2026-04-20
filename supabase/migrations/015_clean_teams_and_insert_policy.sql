-- 015: 기존 자동 생성 팀 정리 + 팀 생성/멤버 추가 RLS 완화
--
-- 배경:
-- 1. 회원가입 시 "{이름}의 팀" 자동 생성 트리거로 불필요한 개인 팀 다수 생김
-- 2. 관리자가 의도적으로 팀을 만들고 직원을 배정하는 UX로 전환
-- 3. 팀 관리 모달에서 INSERT/UPDATE/DELETE 가능하려면 RLS 정책 필요

-- ─── 1) 기존 팀 데이터 정리 ───
-- "XX의 팀" 패턴의 자동 생성 팀 삭제 (team_members는 CASCADE로 자동 삭제)
-- 주의: 이미 meetings에 연결된 team_id가 있으면 FK 제약으로 실패할 수 있음
-- → meetings.team_id를 먼저 NULL로 설정
UPDATE public.meetings SET team_id = NULL
WHERE team_id IN (
  SELECT id FROM public.teams WHERE name LIKE '%의 팀'
);

-- team_members 먼저 삭제 (FK 방지)
DELETE FROM public.team_members
WHERE team_id IN (
  SELECT id FROM public.teams WHERE name LIKE '%의 팀'
);

-- 자동 생성 팀 삭제
DELETE FROM public.teams WHERE name LIKE '%의 팀';

-- ─── 2) 회원가입 시 자동 팀 생성 트리거 비활성화 ───
-- 기존 트리거가 있으면 삭제 (관리자가 명시적으로 팀을 만들도록 함)
DROP TRIGGER IF EXISTS create_personal_team_on_signup ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- 함수도 제거 (있으면)
DROP FUNCTION IF EXISTS public.create_personal_team() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- ─── 3) users 테이블 자동 동기화 (auth.users → public.users) ───
-- 위 트리거 제거로 인해 public.users에 신규 회원 안 들어갈 수 있음 → 재정의
CREATE OR REPLACE FUNCTION public.sync_new_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- public.users에 새 사용자 추가 (팀은 안 만듦)
  INSERT INTO public.users (id, name, email, avatar_color, role, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    '#723CEB',  -- 기본 브랜드 색
    'member',
    NEW.created_at
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 트리거 재등록 (팀 생성 없이 user 레코드만)
DROP TRIGGER IF EXISTS sync_user_to_public ON auth.users;
CREATE TRIGGER sync_user_to_public
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_new_user_to_public();

-- ─── 4) 팀 INSERT/UPDATE/DELETE RLS 완화 ───
-- 인증된 사용자가 팀 CRUD 가능 (관리 제약은 UI 레벨에서)
DROP POLICY IF EXISTS "authenticated_insert_teams" ON public.teams;
DROP POLICY IF EXISTS "authenticated_update_teams" ON public.teams;
DROP POLICY IF EXISTS "authenticated_delete_teams" ON public.teams;

CREATE POLICY "authenticated_insert_teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_teams"
  ON public.teams FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_teams"
  ON public.teams FOR DELETE TO authenticated
  USING (true);

-- ─── 5) team_members INSERT/DELETE RLS 완화 ───
DROP POLICY IF EXISTS "authenticated_insert_team_members" ON public.team_members;
DROP POLICY IF EXISTS "authenticated_delete_team_members" ON public.team_members;

CREATE POLICY "authenticated_insert_team_members"
  ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_team_members"
  ON public.team_members FOR DELETE TO authenticated
  USING (true);

-- ─── 완료 메시지 ───
-- 이제 관리자 대시보드에서 팀을 만들고 직원을 배정할 수 있습니다.
-- 기존 "XX의 팀" 자동 생성 팀은 모두 제거되었습니다.
