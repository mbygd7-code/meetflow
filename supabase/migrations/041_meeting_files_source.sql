-- 041: meeting_files — 외부 출처(Google Docs/Sheets/Slides 등) 추적 컬럼 추가
-- 배경: URL로 첨부된 외부 클라우드 문서를 PDF로 자동 변환해서 Storage에 저장하는데,
--      재변환("다시 가져오기") 및 원본 URL 표시를 위해 출처 메타데이터가 필요.
-- 일반 직접 업로드 파일은 source_url/source_kind가 NULL.

ALTER TABLE public.meeting_files
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT;
  -- source_kind 예시: 'google_docs' | 'google_sheets' | 'google_slides'
  -- 향후 'notion' | 'office365' 등 확장 가능

COMMENT ON COLUMN public.meeting_files.source_url IS '외부 원본 URL (예: Google Docs 편집 링크) — PDF 변환 시 자동 기록';
COMMENT ON COLUMN public.meeting_files.source_kind IS '외부 문서 유형 식별자 — UI 출처 뱃지/아이콘에 사용';

-- 외부 출처 파일 빠른 조회 (재변환·통계용)
CREATE INDEX IF NOT EXISTS idx_meeting_files_source
  ON public.meeting_files (meeting_id)
  WHERE source_url IS NOT NULL;
