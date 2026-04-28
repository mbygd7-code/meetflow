-- 044: service_usage_logs INSERT RLS 강화 — 클라이언트 직접 INSERT 차단
--   변경 전: authenticated 사용자가 본인 user_id 로 INSERT 가능 → estimated_cost 등 위조 위험
--   변경 후: service_role 만 INSERT (Edge Function service-usage-log 경유 강제)
--   read 정책은 그대로 (대시보드 표시용)

DROP POLICY IF EXISTS "authenticated_insert_own_service_usage" ON service_usage_logs;

-- service_role 키로 호출되는 Edge Function 만 INSERT — RLS 자체는 service_role 우회 정책으로 충분하지만
-- 명시적으로 INSERT 정책을 'false' 로 두어 RLS-aware 클라이언트 코드 실수 방지
DROP POLICY IF EXISTS "service_only_insert_service_usage" ON service_usage_logs;
CREATE POLICY "service_only_insert_service_usage" ON service_usage_logs
  FOR INSERT WITH CHECK (false);
