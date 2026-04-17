-- 011: messages 테이블에 ai_employee 컬럼 추가
-- AI 메시지의 직원 ID를 DB에 영속 저장하여 회의 요약에서 AI 참여자 집계 가능

ALTER TABLE messages ADD COLUMN IF NOT EXISTS ai_employee TEXT;

-- 인덱스: AI 직원별 메시지 조회
CREATE INDEX IF NOT EXISTS idx_messages_ai_employee ON messages (ai_employee) WHERE ai_employee IS NOT NULL;
