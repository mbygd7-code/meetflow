-- 033: meeting-files 버킷 — 모든 파일 타입 허용 + 50MB 제한 명시
-- 배경: 032에서 버킷만 생성하고 MIME type / size 제한을 설정하지 않음.
-- 기본값이 null이면 모든 타입 허용이지만, 프로젝트/환경에 따라 global 제한이 걸릴 수 있어 명시적으로 설정.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,  -- 50MB (50 * 1024 * 1024)
  allowed_mime_types = ARRAY[
    -- 이미지
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
    -- 문서
    'application/pdf',
    'application/msword',                                                          -- .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',     -- .docx
    'application/vnd.ms-excel',                                                    -- .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',           -- .xlsx
    'application/vnd.ms-powerpoint',                                               -- .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',   -- .pptx
    'application/vnd.oasis.opendocument.text',                                     -- .odt
    'application/vnd.oasis.opendocument.spreadsheet',                              -- .ods
    -- 텍스트
    'text/plain', 'text/csv', 'text/markdown', 'text/html',
    -- 압축
    'application/zip', 'application/x-zip-compressed',
    -- 기타
    'application/octet-stream'
  ]
WHERE id = 'meeting-files';
