-- ═══════════════════════════════════════════════════════════════
-- 직원 월별 AI 평가 테이블 + RLS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.employee_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,  -- 'YYYY-MM'

  -- 개별 점수 (0-100)
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { participation, task_completion, leadership, proactivity, speech_attitude }

  speech_detail JSONB DEFAULT '{}'::jsonb,
  -- { constructiveness, professionalism, contribution_quality, collaboration }

  grade TEXT NOT NULL,  -- S, A+, A, B+, B, C, D, F
  overall_score NUMERIC(5,2) DEFAULT 0,

  ai_report TEXT,              -- 서술형 리포트 (마크다운)
  evidence JSONB DEFAULT '[]'::jsonb,   -- 증거 발언 목록
  strengths JSONB DEFAULT '[]'::jsonb,
  improvements JSONB DEFAULT '[]'::jsonb,

  meeting_count INT DEFAULT 0,
  message_count INT DEFAULT 0,
  task_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_eval_user_month ON public.employee_evaluations(user_id, month);
CREATE INDEX IF NOT EXISTS idx_eval_month ON public.employee_evaluations(month);

-- RLS
ALTER TABLE public.employee_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage evaluations" ON public.employee_evaluations;
CREATE POLICY "admins manage evaluations" ON public.employee_evaluations
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS "users read own evaluations" ON public.employee_evaluations;
CREATE POLICY "users read own evaluations" ON public.employee_evaluations
  FOR SELECT USING (user_id = auth.uid());

DO $$
BEGIN
  RAISE NOTICE '✅ employee_evaluations 테이블 생성 완료';
END $$;
