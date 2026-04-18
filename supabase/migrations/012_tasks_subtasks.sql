-- 태스크에 서브태스크 + 담당자 이름 스냅샷 컬럼 추가
-- MyTaskCard에서 진행률 표시, assignee 조인 실패 시 fallback으로 활용

-- subtasks: 경량 체크리스트. 별도 테이블 대신 JSONB로 간단히 저장
-- 스키마: [{ title: string, done: boolean }]
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;

-- assignee_name: join 실패(사용자 삭제 등) 시에도 이름을 보존하기 위한 스냅샷
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS assignee_name TEXT;

-- 인덱스 (선택): subtasks 검색은 드물어 생략
COMMENT ON COLUMN tasks.subtasks IS 'JSONB array: [{ title: string, done: boolean }]';
COMMENT ON COLUMN tasks.assignee_name IS 'Denormalized snapshot of assignee name (for resilience)';
