-- 034: 회의록 피드백 리액션
-- 각 사용자가 완료된 회의에 대해 한 종류의 리액션을 남길 수 있음.
-- UNIQUE(meeting_id, user_id) 로 한 사용자 1표 보장.

CREATE TABLE IF NOT EXISTS public.meeting_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 리액션 종류: loved(아주좋음) / useful(유용) / okay(보통) / poor(개선필요)
  reaction TEXT NOT NULL CHECK (reaction IN ('loved', 'useful', 'okay', 'poor')),
  comment TEXT,  -- 선택적 짧은 메모
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_reactions_meeting ON public.meeting_reactions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reactions_user ON public.meeting_reactions(user_id);

-- Realtime (다른 사용자 피드백 실시간 반영)
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_reactions;

-- RLS
ALTER TABLE public.meeting_reactions ENABLE ROW LEVEL SECURITY;

-- 팀 멤버는 자기 팀 회의의 피드백을 읽을 수 있음
DROP POLICY IF EXISTS "team_members_read_reactions" ON public.meeting_reactions;
CREATE POLICY "team_members_read_reactions"
  ON public.meeting_reactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN team_members tm ON tm.team_id = m.team_id
      WHERE m.id = meeting_reactions.meeting_id
        AND tm.user_id = auth.uid()
    )
  );

-- 본인만 자신의 리액션을 생성/수정/삭제 가능
DROP POLICY IF EXISTS "users_insert_own_reactions" ON public.meeting_reactions;
CREATE POLICY "users_insert_own_reactions"
  ON public.meeting_reactions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_reactions" ON public.meeting_reactions;
CREATE POLICY "users_update_own_reactions"
  ON public.meeting_reactions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_reactions" ON public.meeting_reactions;
CREATE POLICY "users_delete_own_reactions"
  ON public.meeting_reactions
  FOR DELETE
  USING (user_id = auth.uid());

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_meeting_reactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meeting_reactions_updated_at ON public.meeting_reactions;
CREATE TRIGGER trg_meeting_reactions_updated_at
  BEFORE UPDATE ON public.meeting_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_reactions_updated_at();

COMMENT ON TABLE public.meeting_reactions IS '회의록 피드백 리액션 (사용자당 1표, 좋음/유용/보통/개선필요)';
