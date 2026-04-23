-- 028: AI 오케스트레이션 계측 기반 (Phase 0)
--
-- 목적: 향후 B안(병렬+Milo종합) / C안(서브에이전트) 전환 시
--       어느 버전으로 응답했는지, 어떤 메시지가 "종합"인지 추적 가능하게 함
--
-- 설계 원칙:
--   - nullable 컬럼만 추가 — 기존 메시지/쿼리에 영향 0
--   - 기존 RLS 정책 무수정
--   - 인덱스는 버전 분석 쿼리용 최소한만 추가
--
-- 스키마 변경:
--   1. orchestration_version TEXT NULL
--      - 어느 오케스트레이션 버전으로 만들어진 AI 메시지인지 기록
--      - 'parallel_v1'        : 현재 병렬 fan-out (Phase 0~1 초기)
--      - 'parallel_synthesize_v1' : 병렬 + Milo 종합 (Phase 1 적용 후)
--      - 'agent_loop_v1'      : 서브에이전트 루프 (Phase C 전환 후)
--
--   2. milo_synthesis_id UUID NULL → messages(id)
--      - Phase 1 이후 Milo 종합 메시지가 어느 전문가 메시지들을 종합한 건지 연결
--      - 예: 코틀러/노먼/데밍 3명 응답 → Milo 종합 메시지가 이들과 같은 synthesis_id 그룹으로 묶임
--      - 현재는 NULL, 미래 버전에서 활용

-- ══════════════════════════════════════════════════════
-- 1) 컬럼 추가 (nullable → 기존 행은 NULL 유지)
-- ══════════════════════════════════════════════════════
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS orchestration_version TEXT;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS milo_synthesis_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════
-- 2) 분석용 인덱스
-- ══════════════════════════════════════════════════════

-- 버전별 AI 응답 수 집계용 부분 인덱스 (AI 메시지만, NULL 제외)
CREATE INDEX IF NOT EXISTS idx_messages_orchestration_version
  ON public.messages(orchestration_version, created_at DESC)
  WHERE orchestration_version IS NOT NULL;

-- 종합 그룹 조회용 (같은 종합 세션의 메시지들 묶어 보기)
CREATE INDEX IF NOT EXISTS idx_messages_milo_synthesis_id
  ON public.messages(milo_synthesis_id)
  WHERE milo_synthesis_id IS NOT NULL;

-- ══════════════════════════════════════════════════════
-- 3) 코멘트 (DB 스키마 가독성)
-- ══════════════════════════════════════════════════════
COMMENT ON COLUMN public.messages.orchestration_version IS
  'AI 오케스트레이션 버전: parallel_v1 / parallel_synthesize_v1 / agent_loop_v1 (NULL=사용자 메시지 또는 레거시)';
COMMENT ON COLUMN public.messages.milo_synthesis_id IS
  'Milo 종합 메시지 ID — 같은 종합 세션에서 생성된 전문가 응답들을 묶는 그룹 키';

-- ══════════════════════════════════════════════════════
-- 4) 분석용 뷰 (선택 — 관리자 대시보드에서 활용)
-- ══════════════════════════════════════════════════════

-- 일별 버전별 AI 응답 수 집계
CREATE OR REPLACE VIEW public.v_ai_orchestration_daily AS
SELECT
  DATE(created_at) AS day,
  orchestration_version,
  ai_employee,
  COUNT(*) AS response_count
FROM public.messages
WHERE is_ai = true AND orchestration_version IS NOT NULL
GROUP BY DATE(created_at), orchestration_version, ai_employee
ORDER BY day DESC, orchestration_version, ai_employee;

COMMENT ON VIEW public.v_ai_orchestration_daily IS
  'AI 오케스트레이션 버전별 일일 응답 수 — Phase 전환 효과 측정용';
