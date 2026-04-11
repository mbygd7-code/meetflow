-- ═══════════════════════════════════════════════════════════════
-- 직원 상세 조회를 위한 admin 전용 함수 & 정책
-- ═══════════════════════════════════════════════════════════════

-- ── is_admin() 헬퍼 (이미 없을 경우만) ──
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── get_employee_stats: 관리자 대시보드용 직원 통계 ──
CREATE OR REPLACE FUNCTION public.get_employee_stats()
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  avatar_color TEXT,
  meeting_count BIGINT,
  total_tasks BIGINT,
  done_tasks BIGINT,
  completion_rate INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- admin 전용
  IF NOT is_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.name AS user_name,
    u.email AS user_email,
    u.avatar_color,
    COALESCE(m.cnt, 0) AS meeting_count,
    COALESCE(t.total, 0) AS total_tasks,
    COALESCE(t.done, 0) AS done_tasks,
    CASE WHEN COALESCE(t.total, 0) > 0
         THEN (COALESCE(t.done, 0) * 100 / t.total)::INT
         ELSE 0
    END AS completion_rate
  FROM public.users u
  LEFT JOIN (
    SELECT msg.user_id, COUNT(DISTINCT msg.meeting_id) AS cnt
    FROM public.messages msg
    WHERE msg.is_ai = false
    GROUP BY msg.user_id
  ) m ON m.user_id = u.id
  LEFT JOIN (
    SELECT tk.assignee_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE tk.status = 'done') AS done
    FROM public.tasks tk
    GROUP BY tk.assignee_id
  ) t ON t.assignee_id = u.id
  ORDER BY completion_rate DESC, u.name;
END;
$$;

-- ── Admin이 모든 유저 데이터를 읽을 수 있도록 RLS 보강 ──
-- users
DROP POLICY IF EXISTS "admins read all users" ON public.users;
CREATE POLICY "admins read all users" ON public.users
  FOR SELECT USING (is_admin());

-- messages
DROP POLICY IF EXISTS "admins read all messages" ON public.messages;
CREATE POLICY "admins read all messages" ON public.messages
  FOR SELECT USING (is_admin());

-- meetings
DROP POLICY IF EXISTS "admins read all meetings" ON public.meetings;
CREATE POLICY "admins read all meetings" ON public.meetings
  FOR SELECT USING (is_admin());

-- tasks
DROP POLICY IF EXISTS "admins read all tasks" ON public.tasks;
CREATE POLICY "admins read all tasks" ON public.tasks
  FOR SELECT USING (is_admin());

DO $$
BEGIN
  RAISE NOTICE '✅ 직원 상세 조회 기능 배포 완료';
END $$;
