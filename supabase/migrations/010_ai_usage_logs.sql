-- 010: AI usage logs -- token consumption tracking per call
-- Every milo-analyze invocation logs tokens, model, latency, errors

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  meeting_id TEXT,
  employee_id TEXT NOT NULL DEFAULT 'milo',
  model TEXT NOT NULL DEFAULT 'unknown',
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_read_tokens INT NOT NULL DEFAULT 0,
  cache_create_tokens INT NOT NULL DEFAULT 0,
  retries INT NOT NULL DEFAULT 0,
  elapsed_ms INT NOT NULL DEFAULT 0,
  chunks_used INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON ai_usage_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_employee ON ai_usage_logs (employee_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON ai_usage_logs (model);

-- RLS: authenticated users can read, service role can insert
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON ai_usage_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "service_insert" ON ai_usage_logs FOR INSERT WITH CHECK (true);
