-- 018: 태스크 & 댓글 첨부파일
-- - tasks.attachments / task_comments.attachments JSONB 컬럼
-- - Supabase Storage 'task-attachments' 버킷 + 정책

-- ── 컬럼 추가 ──
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.tasks.attachments IS
  'JSONB array: [{ name, path, url, size, type, uploaded_at, uploaded_by }]';

ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.task_comments.attachments IS
  'JSONB array: same schema as tasks.attachments';

-- ── Storage 버킷 ──
-- public=true: 인증되지 않은 URL로도 이미지/파일 preview 가능
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  true,
  50 * 1024 * 1024,  -- 50MB
  NULL  -- 모든 MIME 허용
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;  -- NULL = 모든 MIME 허용 (PDF 포함)

-- ── Storage 정책 (storage.objects) ──

-- 인증된 사용자는 업로드 가능
DROP POLICY IF EXISTS "authenticated_upload_task_attachments" ON storage.objects;
CREATE POLICY "authenticated_upload_task_attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

-- 모든 사용자가 읽기 가능 (public bucket)
DROP POLICY IF EXISTS "public_read_task_attachments" ON storage.objects;
CREATE POLICY "public_read_task_attachments"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'task-attachments');

-- 인증된 사용자는 자기 파일 삭제 가능 (owner 체크)
DROP POLICY IF EXISTS "authenticated_delete_task_attachments" ON storage.objects;
CREATE POLICY "authenticated_delete_task_attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'task-attachments' AND owner = auth.uid());

-- 인증된 사용자 업데이트 (거의 사용 안 함)
DROP POLICY IF EXISTS "authenticated_update_task_attachments" ON storage.objects;
CREATE POLICY "authenticated_update_task_attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'task-attachments' AND owner = auth.uid());
