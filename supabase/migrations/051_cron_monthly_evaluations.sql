-- ═══════════════════════════════════════════════════════════════
-- 매월 1일 자동 직원 평가 생성 — pg_cron + pg_net + Edge Function
-- ═══════════════════════════════════════════════════════════════
--
-- 동작:
--   매월 1일 KST 03:00 (UTC 18:00 of previous day) 에 cron-monthly-evaluations
--   Edge Function 을 호출 → 모든 사용자의 지난달 평가를 employee_evaluations 에 upsert.
--
-- 사전 준비 (1회만):
--   1) supabase secrets set APP_SUPABASE_URL=<프로젝트 URL>
--      supabase secrets set APP_SERVICE_ROLE_KEY=<service_role 키>
--      ↑ 위 두 값은 cron 이 Edge Function 호출 시 사용. Vault 권장.
--   2) cron-monthly-evaluations Edge Function 배포:
--      supabase functions deploy cron-monthly-evaluations
--   3) 본 마이그레이션 실행 (이미 적용 시 멱등)
--
-- 수동 실행 (테스트):
--   SELECT run_monthly_evaluations_now();
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Vault 헬퍼: Supabase URL / service_role key 안전하게 저장 ──
-- (이미 다른 cron 작업에서 등록된 경우 INSERT 만 무시)
DO $$
BEGIN
  -- 키가 없으면 NOTICE 만, 사용자가 supabase dashboard 에서 직접 등록해야 함
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'app_supabase_url') THEN
    RAISE NOTICE '⚠️  Vault 에 app_supabase_url 비밀이 없습니다. Supabase Dashboard → Database → Vault 에서 추가 필요.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'app_service_role_key') THEN
    RAISE NOTICE '⚠️  Vault 에 app_service_role_key 비밀이 없습니다. Supabase Dashboard → Database → Vault 에서 추가 필요.';
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'vault.secrets 테이블이 없습니다. Supabase 호스티드 환경에서만 사용 가능.';
END $$;

-- ── 헬퍼 함수: cron 본체 + 수동 실행용 동일 로직 ──
CREATE OR REPLACE FUNCTION public.trigger_monthly_evaluations()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url   TEXT;
  v_key   TEXT;
  v_req_id BIGINT;
BEGIN
  -- Vault 에서 비밀 조회
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'app_supabase_url';
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'app_service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'Vault 에 app_supabase_url 또는 app_service_role_key 가 설정되지 않았습니다.';
  END IF;

  -- pg_net 으로 비동기 POST → cron 차단 없음
  SELECT INTO v_req_id net.http_post(
    url     := v_url || '/functions/v1/cron-monthly-evaluations',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 600000  -- 10분 (모든 사용자 직렬 평가 대비)
  );

  RAISE NOTICE 'Triggered monthly evaluations, request_id=%', v_req_id;
  RETURN v_req_id;
END;
$$;

-- 수동 실행용 별칭
CREATE OR REPLACE FUNCTION public.run_monthly_evaluations_now()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.trigger_monthly_evaluations();
$$;

-- ── cron 작업 등록 (멱등) ──
-- 매월 1일 18:00 UTC = KST 03:00 (한국 새벽)
DO $$
BEGIN
  -- 기존 작업 있으면 unschedule
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'monthly-employee-evaluations';

  PERFORM cron.schedule(
    'monthly-employee-evaluations',
    '0 18 1 * *',  -- 매월 1일 18:00 UTC
    'SELECT public.trigger_monthly_evaluations();'
  );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'pg_cron 이 설치되지 않았습니다. Supabase 호스티드 환경에서만 자동 스케줄링 가능.';
END $$;

DO $$ BEGIN RAISE NOTICE '✅ 매월 1일 자동 직원 평가 cron 등록 완료'; END $$;
