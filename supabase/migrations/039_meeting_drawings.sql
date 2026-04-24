-- 039: 자료 드로잉 주석 영속화
-- 회의 자료(이미지/PDF/문서)에 그린 드로잉을 저장해 재진입 시 복원.
-- 완료 회의 뷰에서도 동일 데이터를 읽어 기록 확인 가능.

CREATE TABLE IF NOT EXISTS public.meeting_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  -- 자료별 고유 키: `img:<file-id>` 또는 `doc:<file-id>`
  target_key TEXT NOT NULL,
  -- strokes JSONB: [{ id, user_id, user_name, user_color, color, points:[{x,y},...] }, ...]
  strokes JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_meeting_drawings_meeting ON public.meeting_drawings(meeting_id);

-- Realtime (여러 클라이언트가 저장/불러오기 시 동기화)
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_drawings;

-- RLS
ALTER TABLE public.meeting_drawings ENABLE ROW LEVEL SECURITY;

-- 인증 사용자 모두 조회 가능 (공개 협업 기록)
DROP POLICY IF EXISTS "authenticated_read_drawings" ON public.meeting_drawings;
CREATE POLICY "authenticated_read_drawings"
  ON public.meeting_drawings
  FOR SELECT
  TO authenticated
  USING (true);

-- 인증 사용자 모두 upsert 가능 (협업 중 저장)
DROP POLICY IF EXISTS "authenticated_write_drawings" ON public.meeting_drawings;
CREATE POLICY "authenticated_write_drawings"
  ON public.meeting_drawings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_drawings" ON public.meeting_drawings;
CREATE POLICY "authenticated_update_drawings"
  ON public.meeting_drawings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 관리자만 삭제 가능
DROP POLICY IF EXISTS "admins_delete_drawings" ON public.meeting_drawings;
CREATE POLICY "admins_delete_drawings"
  ON public.meeting_drawings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_meeting_drawings_ts()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meeting_drawings_ts ON public.meeting_drawings;
CREATE TRIGGER trg_meeting_drawings_ts
  BEFORE UPDATE ON public.meeting_drawings
  FOR EACH ROW EXECUTE FUNCTION update_meeting_drawings_ts();

COMMENT ON TABLE public.meeting_drawings IS
  '회의 자료 위 드로잉 주석 영속 저장 (target_key 단위 upsert)';
