-- 031: AI 메시지 피드백 수집 (Phase 3)
--
-- 배경:
--   진화 시스템의 세 번째 축 — 사용자 👍/👎와 이유를 수집해서
--   Phase 5에서 프롬프트 자동 보강의 학습 소스로 활용.
--   본 Phase에서는 "수집만" — 학습 활용은 데이터 누적 후 Phase 5.
--
-- 설계 원칙:
--   - message_id 기반 (턴 기반 X) → 미래 서브에이전트 전환해도 그대로 동작
--   - 한 사용자가 한 메시지에 1개 피드백만 (UNIQUE) + 토글/수정 가능 (UPDATE)
--   - 조회는 팀 단위 (관리자가 자기 팀 피드백 통계 볼 수 있게)

CREATE TABLE IF NOT EXISTS public.ai_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  reason TEXT, -- 'too_long' | 'incorrect' | 'off_topic' | 'repetitive' | 'other' (NULL이면 단순 👍)
  comment TEXT, -- 자유 기입 (선택)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_message_id ON public.ai_message_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.ai_message_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating_created ON public.ai_message_feedback(rating, created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.touch_ai_message_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_feedback_updated_at ON public.ai_message_feedback;
CREATE TRIGGER trg_touch_feedback_updated_at
  BEFORE UPDATE ON public.ai_message_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ai_message_feedback_updated_at();

-- ══════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════
ALTER TABLE public.ai_message_feedback ENABLE ROW LEVEL SECURITY;

-- SELECT: 접근 가능한 회의의 메시지에 달린 피드백 모두 조회 (팀 통계용)
--   accessible_meeting_ids() 헬퍼 재사용 (025~027에서 검증됨)
DROP POLICY IF EXISTS "feedback_select" ON public.ai_message_feedback;
CREATE POLICY "feedback_select"
  ON public.ai_message_feedback FOR SELECT TO authenticated
  USING (
    message_id IN (
      SELECT m.id FROM public.messages m
      WHERE m.meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- INSERT: 본인 user_id로만, 접근 가능한 메시지에만
DROP POLICY IF EXISTS "feedback_insert" ON public.ai_message_feedback;
CREATE POLICY "feedback_insert"
  ON public.ai_message_feedback FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND message_id IN (
      SELECT m.id FROM public.messages m
      WHERE m.meeting_id IN (SELECT public.accessible_meeting_ids(auth.uid()))
    )
  );

-- UPDATE: 본인 피드백만
DROP POLICY IF EXISTS "feedback_update" ON public.ai_message_feedback;
CREATE POLICY "feedback_update"
  ON public.ai_message_feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: 본인 피드백만
DROP POLICY IF EXISTS "feedback_delete" ON public.ai_message_feedback;
CREATE POLICY "feedback_delete"
  ON public.ai_message_feedback FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════
-- 분석 뷰 — Phase 5에서 활용
-- ══════════════════════════════════════════════════════

-- AI 직원별 일일 피드백 집계
CREATE OR REPLACE VIEW public.v_ai_feedback_daily AS
SELECT
  DATE(f.created_at) AS day,
  m.ai_employee,
  m.orchestration_version,
  COUNT(*) FILTER (WHERE f.rating = 1) AS thumbs_up,
  COUNT(*) FILTER (WHERE f.rating = -1) AS thumbs_down,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE f.rating = 1) / NULLIF(COUNT(*), 0),
    1
  ) AS satisfaction_pct
FROM public.ai_message_feedback f
JOIN public.messages m ON m.id = f.message_id
WHERE m.is_ai = true
GROUP BY DATE(f.created_at), m.ai_employee, m.orchestration_version
ORDER BY day DESC, m.ai_employee;

COMMENT ON TABLE public.ai_message_feedback IS
  'AI 메시지 피드백 수집 (Phase 3) — 👍/👎 + 이유. Phase 5에서 프롬프트 자동 보강에 사용.';
COMMENT ON VIEW public.v_ai_feedback_daily IS
  'AI 직원별 일일 만족도 집계 — 관리자 대시보드 및 Phase 5 학습 소스.';
