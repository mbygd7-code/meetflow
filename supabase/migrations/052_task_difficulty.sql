-- ═══════════════════════════════════════════════════════════════
-- tasks.difficulty 컬럼 추가 — 평가 시 난이도 가중 적용
-- ═══════════════════════════════════════════════════════════════
-- easy   = 단순 작업 (가중치 1)
-- medium = 표준 작업 (가중치 2, 기본값)
-- hard   = 복합/고난도 작업 (가중치 3)
--
-- 평가 점수 계산 시:
--   weighted_completion = sum(difficulty_weight where status='done')
--                       / sum(difficulty_weight)  × 100
--   → 어려운 태스크를 완료하면 더 높은 점수
--   → 쉬운 것만 골라받으면 종합 점수가 떨어짐 (가중치 불균형)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard'));

COMMENT ON COLUMN public.tasks.difficulty IS
  'Task difficulty: easy(1x) / medium(2x default) / hard(3x). 평가 시 난이도 가중 적용.';

-- 기존 행은 모두 medium 으로 마이그레이션 (DEFAULT 가 자동 적용됨)
-- 인덱스 필요 시 추가 (현재는 평가 계산이 메모리에서 이뤄지므로 생략)

DO $$ BEGIN RAISE NOTICE '✅ tasks.difficulty 컬럼 추가 완료'; END $$;
