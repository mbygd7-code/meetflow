-- ══════════════════════════════════════════════════════════════════
-- Migration 040: messages.metadata (JSONB) 컬럼 추가
-- ══════════════════════════════════════════════════════════════════
-- 목적: 드로잉 주석, 인용, 첨부 참조 등 "메시지 본문 외 구조화 컨텍스트"를
--       담을 수 있는 범용 필드. AI(Milo)가 메시지를 해석할 때 "이 메시지는
--       자료 주석"임을 인식하여 오해를 방지.
--
-- 구조 예시:
--   metadata = {
--     "drawing_annotations": [
--       { "target_key": "img:uuid", "file_name": "ui.png",
--         "user_name": "명배영", "seq": 6, "stroke_id": "s-abc-1234" }
--     ]
--   }
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- JSONB 쿼리 성능을 위한 GIN 인덱스 (containment/keys 모두 대응)
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin
  ON public.messages USING GIN (metadata);

COMMENT ON COLUMN public.messages.metadata IS
  '메시지 부가 컨텍스트 (JSONB). drawing_annotations 등 구조화된 참조 포함.';
