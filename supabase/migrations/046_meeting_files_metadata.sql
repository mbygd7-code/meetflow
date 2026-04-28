-- 046: meeting_files.metadata JSONB 컬럼 추가
--   pptx → pdf 변환 시 원본 정보 (original_pptx_path, original_pptx_name, converted_at)
--   향후 다른 변환/메타정보도 이 컬럼으로 일원화

ALTER TABLE meeting_files
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_meeting_files_metadata
  ON meeting_files USING GIN (metadata);
