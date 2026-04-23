-- 038: 태스크 확인 워크플로우
-- AI가 회의록에서 제안한 태스크는 담당자가 "확인"해야 정식 태스크로 간주.
-- confirmed=false 는 AI 초안 / confirmed=true 는 담당자 승인 상태.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 사람이 직접 만든 태스크(ai_suggested=false)는 기본 확인 상태로 간주
UPDATE public.tasks
  SET confirmed = true,
      confirmed_at = created_at
  WHERE ai_suggested IS NOT TRUE AND confirmed IS NOT TRUE;

COMMENT ON COLUMN public.tasks.confirmed IS
  '담당자가 AI 제안 태스크를 확인(승인)했는지 여부';
COMMENT ON COLUMN public.tasks.confirmed_by IS
  '확인한 사용자 id (AI 제안 → 담당자 승인 기록)';
COMMENT ON COLUMN public.tasks.confirmed_at IS
  '확인 시각';
