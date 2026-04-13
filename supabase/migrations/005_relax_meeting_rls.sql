-- ═══ 회의 RLS 정책 완화 ═══
-- 인증된 사용자는 team_id 없이도 회의를 생성할 수 있도록 허용
-- (AI 전용 회의, 개인 회의 등)

-- INSERT: 인증된 사용자는 누구나 회의 생성 가능
DROP POLICY IF EXISTS "meetings create by team members" ON public.meetings;
CREATE POLICY "meetings create by authenticated" ON public.meetings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- SELECT: 본인이 생성했거나 팀 멤버인 회의 조회 가능
DROP POLICY IF EXISTS "meetings read by team members" ON public.meetings;
CREATE POLICY "meetings read by owner or team" ON public.meetings
  FOR SELECT USING (
    created_by = auth.uid()
    OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- UPDATE: 본인이 생성했거나 팀 멤버인 회의 수정 가능
DROP POLICY IF EXISTS "meetings update by team members" ON public.meetings;
CREATE POLICY "meetings update by owner or team" ON public.meetings
  FOR UPDATE USING (
    created_by = auth.uid()
    OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- DELETE: 본인이 생성한 회의만 삭제
-- (기존 정책 유지)

-- ═══ 어젠다 RLS도 완화 ═══
DROP POLICY IF EXISTS "agendas full by team members" ON public.agendas;
CREATE POLICY "agendas by meeting access" ON public.agendas
  FOR ALL USING (
    meeting_id IN (
      SELECT id FROM public.meetings
      WHERE created_by = auth.uid()
        OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    )
  );

-- ═══ 메시지 RLS도 완화 ═══
DROP POLICY IF EXISTS "messages full by team members" ON public.messages;
CREATE POLICY "messages by meeting access" ON public.messages
  FOR ALL USING (
    meeting_id IN (
      SELECT id FROM public.meetings
      WHERE created_by = auth.uid()
        OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    )
  );
