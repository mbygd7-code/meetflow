-- 028: meeting_files 테이블 + Storage 버킷
-- 배경: 회의 요청 시 첨부 파일 / 회의 중 업로드 파일을 영구 저장
-- Storage: meeting-files 버킷 (private)
-- DB: meeting_files 테이블로 메타데이터 + storage_path 관리

-- ══════════════════════════════════════════════════════
-- 1) meeting_files 테이블
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meeting_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT,
  size BIGINT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting ON public.meeting_files(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_files_uploader ON public.meeting_files(uploaded_by);

COMMENT ON TABLE public.meeting_files IS '회의별 첨부 파일 (Storage 버킷 meeting-files와 연동)';
COMMENT ON COLUMN public.meeting_files.storage_path IS 'Storage 내부 경로: meetings/{meeting_id}/{file_uuid}_{filename}';

-- ══════════════════════════════════════════════════════
-- 2) Realtime publication
-- ══════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_files;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════
-- 3) RLS
-- ══════════════════════════════════════════════════════

ALTER TABLE public.meeting_files ENABLE ROW LEVEL SECURITY;

-- 읽기: 해당 회의 참여자(meeting_participants) + 회의 생성자 + 같은 팀 멤버
DROP POLICY IF EXISTS "meeting_files_read" ON public.meeting_files;
CREATE POLICY "meeting_files_read"
  ON public.meeting_files FOR SELECT TO authenticated
  USING (
    meeting_id IN (
      SELECT meeting_id FROM public.meeting_participants
      WHERE user_id = auth.uid()
    )
    OR meeting_id IN (
      SELECT id FROM public.meetings
      WHERE created_by = auth.uid()
    )
    OR meeting_id IN (
      SELECT m.id FROM public.meetings m
      WHERE m.team_id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
      )
    )
  );

-- 생성: 인증된 사용자 (uploaded_by는 본인)
DROP POLICY IF EXISTS "meeting_files_insert" ON public.meeting_files;
CREATE POLICY "meeting_files_insert"
  ON public.meeting_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- 삭제: 업로더 또는 회의 생성자
DROP POLICY IF EXISTS "meeting_files_delete" ON public.meeting_files;
CREATE POLICY "meeting_files_delete"
  ON public.meeting_files FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR meeting_id IN (SELECT id FROM public.meetings WHERE created_by = auth.uid())
  );

-- ══════════════════════════════════════════════════════
-- 4) Storage 버킷
-- ══════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-files', 'meeting-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage 정책 (모든 인증 사용자가 meeting-files 버킷 사용 가능 — 세부 접근 제어는 meeting_files 테이블 RLS로)
DROP POLICY IF EXISTS "meeting_files_storage_read" ON storage.objects;
CREATE POLICY "meeting_files_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'meeting-files');

DROP POLICY IF EXISTS "meeting_files_storage_insert" ON storage.objects;
CREATE POLICY "meeting_files_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meeting-files');

DROP POLICY IF EXISTS "meeting_files_storage_delete" ON storage.objects;
CREATE POLICY "meeting_files_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'meeting-files');
