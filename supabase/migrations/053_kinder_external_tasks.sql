-- ═══════════════════════════════════════════════════════════════
-- KinderStick ↔ MeetFlow 외부 태스크 연동 (Phase 1: 수신)
-- 인증: HMAC-SHA256, 헤더 x-hmac-signature, 시크릿 KINDER_HMAC_SECRET (양방향 공통)
-- ═══════════════════════════════════════════════════════════════
-- 1) tasks 테이블 확장: external_* 컬럼 + KPI/도메인 태그 + 콜백 URL
-- 2) external_task_events: 콜백 전송 큐 (재시도 가능)
-- 3) kinder_team_mapping: kinder.team 문자열 ↔ MeetFlow team_id 매핑
-- ═══════════════════════════════════════════════════════════════

-- ── 1. tasks 확장 ─────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_task_id TEXT,
  ADD COLUMN IF NOT EXISTS external_workspace TEXT,
  ADD COLUMN IF NOT EXISTS external_meta JSONB,
  ADD COLUMN IF NOT EXISTS external_callback_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS kpi_sub_items TEXT[],
  ADD COLUMN IF NOT EXISTS boost_domains TEXT[];

COMMENT ON COLUMN public.tasks.external_source IS '외부 소스 식별자 (예: kinder)';
COMMENT ON COLUMN public.tasks.external_task_id IS '외부 시스템의 태스크 고유 ID — 팬아웃 형제 그룹 키';
COMMENT ON COLUMN public.tasks.external_meta IS 'tier/phase/cadence/why/hint/expected_evidence 등 외부 메타';

-- 같은 외부 태스크의 형제 (팀원 fan-out) 조회 가속
CREATE INDEX IF NOT EXISTS idx_tasks_external
  ON public.tasks(external_source, external_task_id)
  WHERE external_source IS NOT NULL;

-- ── 2. external_task_events: 콜백 큐 ──────────────────────────
CREATE TABLE IF NOT EXISTS public.external_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                  -- 'kinder'
  external_task_id TEXT NOT NULL,        -- payload.kinder.task_id
  event_id TEXT UNIQUE NOT NULL,         -- 멱등성 키 (UUID 권장)
  event_type TEXT NOT NULL,              -- 'task.completed' 등
  payload JSONB NOT NULL,                -- 콜백 본문 전체
  callback_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_etx_events_pending
  ON public.external_task_events(status, created_at)
  WHERE status = 'pending';

-- ── 3. kinder_team_mapping: kinder.team → MeetFlow team ──────
CREATE TABLE IF NOT EXISTS public.kinder_team_mapping (
  kinder_team TEXT PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kinder_team_mapping IS
  'KinderStick payload의 kinder.team 문자열을 MeetFlow team_id에 매핑. 없으면 ingest 함수가 teams.name 자동 매칭 시도.';

-- ── 4. RLS ────────────────────────────────────────────────────
ALTER TABLE public.external_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kinder_team_mapping  ENABLE ROW LEVEL SECURITY;

-- external_task_events: service_role 만 (Edge Function 전용)
DROP POLICY IF EXISTS etx_events_service_all ON public.external_task_events;
CREATE POLICY etx_events_service_all ON public.external_task_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- kinder_team_mapping: 관리자 읽기/쓰기
DROP POLICY IF EXISTS kinder_mapping_admin_read ON public.kinder_team_mapping;
CREATE POLICY kinder_mapping_admin_read ON public.kinder_team_mapping
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS kinder_mapping_admin_write ON public.kinder_team_mapping;
CREATE POLICY kinder_mapping_admin_write ON public.kinder_team_mapping
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

DO $$ BEGIN RAISE NOTICE '✅ 053 KinderStick external tasks migration complete'; END $$;
