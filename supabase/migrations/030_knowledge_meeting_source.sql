-- 030: ai_knowledge_files에 meeting_id + source 추가 (Phase 2 — 회의록 자동 RAG 축적)
--
-- 배경:
--   Phase 2에서 회의 종료 시 요약을 전문가 RAG에 자동 인덱싱함.
--   - 같은 회의 재인덱싱 방지 (idempotency)
--   - 사용자 업로드 파일과 회의 자동 생성 파일 구분
--   - 회의가 삭제되면 연관 지식도 정리 가능하게 FK 연결
--
-- 추가 컬럼:
--   1. meeting_id UUID NULL → meetings(id) ON DELETE CASCADE
--      회의별 출처 추적. 회의 삭제 시 자동 정리.
--      NULL이면 사용자 수동 업로드 또는 기본 md 파일
--   2. source TEXT NULL
--      - 'user_upload' : 사용자가 UI로 업로드
--      - 'default_md'  : public/docs의 기본 md 파일 인덱싱
--      - 'meeting_auto': 회의 종료 시 자동 축적 (Phase 2)
--      - NULL          : 레거시 (마이그레이션 이전 업로드)

ALTER TABLE public.ai_knowledge_files
  ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE;

ALTER TABLE public.ai_knowledge_files
  ADD COLUMN IF NOT EXISTS source TEXT;

-- 동일 회의 + 동일 전문가 조합에 한 번만 인덱싱 (재실행 방지)
-- Phase 2 generate-summary 재실행 시 동일 (meeting_id, employee_id) 조합은 UPDATE 경로 타도록 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_meeting_employee_unique
  ON public.ai_knowledge_files(meeting_id, employee_id)
  WHERE meeting_id IS NOT NULL AND source = 'meeting_auto';

-- 회의별 조회용 (관리 UI에서 "이 회의에서 축적된 지식" 보기)
CREATE INDEX IF NOT EXISTS idx_knowledge_meeting_id
  ON public.ai_knowledge_files(meeting_id)
  WHERE meeting_id IS NOT NULL;

COMMENT ON COLUMN public.ai_knowledge_files.meeting_id IS
  '회의에서 자동 축적된 지식의 출처 회의 ID (Phase 2). NULL이면 사용자 업로드 또는 기본 md.';
COMMENT ON COLUMN public.ai_knowledge_files.source IS
  '지식 파일 출처: user_upload / default_md / meeting_auto / NULL(legacy)';
