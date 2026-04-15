-- AI 직원 설정 (overrides)을 팀 단위로 DB에 저장
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS ai_overrides JSONB DEFAULT '{}';

-- 인덱스 (GIN)
CREATE INDEX IF NOT EXISTS idx_teams_ai_overrides ON public.teams USING gin(ai_overrides);
