-- 022: meeting_participants 테이블 + messages RLS 확장
-- 배경: 기존 messages RLS는 "회의 소속 팀의 멤버"만 메시지 접근 가능 → 게스트/외부/팀 무관 초대자 차단
-- 신규: meeting_participants에 등록된 사용자도 메시지 접근 허용 (팀 멤버십과 독립)

-- ══════════════════════════════════════════════════════
-- 1) meeting_participants 테이블
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meeting_participants (
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant'
    CHECK (role IN ('host', 'participant', 'guest', 'observer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON public.meeting_participants(user_id);

COMMENT ON TABLE public.meeting_participants IS
  '회의별 참석자 — 팀 소속과 독립적으로 특정 회의에 초대된 사용자 관리';
COMMENT ON COLUMN public.meeting_participants.role IS
  'host: 회의 주관자 / participant: 일반 참석 / guest: 외부/타팀 게스트 / observer: 참관';

-- ══════════════════════════════════════════════════════
-- 2) Realtime publication
-- ══════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════
-- 3) RLS — meeting_participants 자체 정책
-- ══════════════════════════════════════════════════════

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- SELECT: 인증된 사용자는 본인이 관련된 회의의 참석자 목록을 읽을 수 있음
-- (같은 회의 참석자 or 같은 팀 소속인 경우)
DROP POLICY IF EXISTS "participants_select" ON public.meeting_participants;
CREATE POLICY "participants_select"
  ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    -- 본인
    user_id = auth.uid()
    -- 같은 회의에 나도 참석자
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.meeting_id = meeting_participants.meeting_id
        AND mp.user_id = auth.uid()
    )
    -- 회의 소속 팀의 멤버
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE m.id = meeting_participants.meeting_id
        AND tm.user_id = auth.uid()
    )
  );

-- INSERT: 회의 생성자 / admin / 팀 멤버가 참석자 추가 가능
DROP POLICY IF EXISTS "participants_insert" ON public.meeting_participants;
CREATE POLICY "participants_insert"
  ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (
    -- 본인을 본인으로 등록 (회의 입장 시 자동)
    user_id = auth.uid()
    -- 회의 생성자가 타인을 초대
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
        AND m.created_by = auth.uid()
    )
    -- 관리자
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
    -- 같은 팀 멤버
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE m.id = meeting_participants.meeting_id
        AND tm.user_id = auth.uid()
    )
  );

-- DELETE: 본인이 나가거나 / 회의 생성자 / admin이 제거
DROP POLICY IF EXISTS "participants_delete" ON public.meeting_participants;
CREATE POLICY "participants_delete"
  ON public.meeting_participants FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_participants.meeting_id
        AND m.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- ══════════════════════════════════════════════════════
-- 4) messages RLS 정책 확장 — 팀 멤버 OR 참석자
-- ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "messages full by team members" ON public.messages;
DROP POLICY IF EXISTS "messages_accessible" ON public.messages;

CREATE POLICY "messages_accessible"
  ON public.messages FOR ALL TO authenticated
  USING (
    meeting_id IN (
      -- 기존 경로: 회의 소속 팀 멤버
      SELECT m.id FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE tm.user_id = auth.uid()
      UNION
      -- 신규 경로: 회의에 명시적으로 등록된 참석자
      SELECT mp.meeting_id FROM public.meeting_participants mp
      WHERE mp.user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════
-- 5) meetings RLS 확장 — 참석자도 회의 정보 읽기 가능
-- ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "meetings_select_expanded" ON public.meetings;
CREATE POLICY "meetings_select_expanded"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    -- 팀 멤버
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = meetings.team_id
        AND tm.user_id = auth.uid()
    )
    -- 생성자
    OR created_by = auth.uid()
    -- 참석자
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.meeting_id = meetings.id
        AND mp.user_id = auth.uid()
    )
  );

-- agendas / meeting_summaries 도 동일하게 참석자 접근 허용
DROP POLICY IF EXISTS "agendas_accessible" ON public.agendas;
CREATE POLICY "agendas_accessible"
  ON public.agendas FOR ALL TO authenticated
  USING (
    meeting_id IN (
      SELECT m.id FROM public.meetings m
      JOIN public.team_members tm ON tm.team_id = m.team_id
      WHERE tm.user_id = auth.uid()
      UNION
      SELECT mp.meeting_id FROM public.meeting_participants mp
      WHERE mp.user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════
-- 6) 기존 데이터 마이그레이션 — 팀 멤버를 참석자로 복제
-- ══════════════════════════════════════════════════════
-- 기존 회의에 대해 팀 멤버 전원을 participants로 자동 등록 → 기존 동작 보존
-- 새 회의는 생성 시 초대자만 등록되므로 더 세밀한 제어 가능

INSERT INTO public.meeting_participants (meeting_id, user_id, role)
SELECT DISTINCT m.id, tm.user_id, 'participant'
FROM public.meetings m
JOIN public.team_members tm ON tm.team_id = m.team_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.meeting_participants mp
  WHERE mp.meeting_id = m.id AND mp.user_id = tm.user_id
);

-- 회의 생성자도 participants에 host로 등록 (없는 경우만)
INSERT INTO public.meeting_participants (meeting_id, user_id, role)
SELECT m.id, m.created_by, 'host'
FROM public.meetings m
WHERE m.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.meeting_participants mp
    WHERE mp.meeting_id = m.id AND mp.user_id = m.created_by
  );
