-- 043: 외부 유료 서비스 사용량 로그 (LiveKit / STT / Edge Functions / Storage 등)
--   ai_usage_logs 가 Anthropic Claude 전용이라면 이 테이블은 그 외 모든 인프라 비용을 추적
--
-- 옵션 A 자체 계측: 클라이언트/서버에서 사용량 발생 즉시 INSERT
-- 옵션 B 외부 정산:  매월 1회 cron 이 외부 API 호출해 일별 청구액 INSERT (service_usage_billing)

CREATE TABLE IF NOT EXISTS service_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 서비스 식별: 'livekit' | 'stt' | 'edge_function' | 'storage' | 'realtime' | 'db'
  service TEXT NOT NULL,
  -- 이벤트 타입: 'connection' | 'recognize' | 'invocation' | 'upload' 등
  event_type TEXT NOT NULL,
  -- 사용량 단위: 분/초/MB/호출수 등
  units NUMERIC(14, 4) NOT NULL DEFAULT 0,
  -- 단위 종류: 'minutes' | 'seconds' | 'mb' | 'count'
  unit_type TEXT NOT NULL,
  -- 추정 비용 (USD) — 클라이언트가 최신 단가로 계산해 함께 저장
  estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  -- 컨텍스트 — 회의/사용자/모델 등 자유로운 메타데이터
  meeting_id UUID,
  user_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_usage_created ON service_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_usage_service ON service_usage_logs (service);
CREATE INDEX IF NOT EXISTS idx_service_usage_meeting ON service_usage_logs (meeting_id);

-- RLS: authenticated 사용자는 읽기, service role 만 쓰기 (Edge Function 에서 INSERT)
ALTER TABLE service_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_service_usage" ON service_usage_logs;
CREATE POLICY "authenticated_read_service_usage" ON service_usage_logs
  FOR SELECT USING (auth.role() = 'authenticated');
-- 클라이언트(useLiveKitVoice 등)에서 직접 INSERT — 본인 user_id 일치 시에만 허용
DROP POLICY IF EXISTS "authenticated_insert_own_service_usage" ON service_usage_logs;
CREATE POLICY "authenticated_insert_own_service_usage" ON service_usage_logs
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND (user_id = auth.uid() OR user_id IS NULL)
  );

-- ── 옵션 B: 월별 정확 청구액 동기화 ──────────────────────────────────────
-- cron 이 외부 API (LiveKit Server, Supabase Management, GCP Billing 등) 호출해
-- 일별 또는 월별 실제 청구액을 받아 INSERT.
CREATE TABLE IF NOT EXISTS service_usage_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  -- 정산 기간 시작/끝 (일별 또는 월별)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- 외부 청구액 (USD)
  amount NUMERIC(12, 4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- 청구액 출처 — 'livekit_api' | 'supabase_mgmt' | 'gcp_billing' | 'manual'
  source TEXT NOT NULL,
  raw_response JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (service, period_start, period_end, source)
);

CREATE INDEX IF NOT EXISTS idx_billing_period ON service_usage_billing (period_start, period_end);

ALTER TABLE service_usage_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_billing" ON service_usage_billing;
CREATE POLICY "authenticated_read_billing" ON service_usage_billing
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "service_insert_billing" ON service_usage_billing;
CREATE POLICY "service_insert_billing" ON service_usage_billing
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "service_update_billing" ON service_usage_billing;
CREATE POLICY "service_update_billing" ON service_usage_billing
  FOR UPDATE USING (true);
