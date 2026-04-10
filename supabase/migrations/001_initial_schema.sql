-- ═══════════════════════════════════════════════════════════════
-- MeetFlow 초기 스키마 (Supabase Auth 통합 포함)
-- 실행: Supabase Dashboard → SQL Editor → 전체 복사 붙여넣기 → Run
-- ═══════════════════════════════════════════════════════════════

-- ───── USERS (auth.users와 연동) ─────
-- public.users.id는 auth.users.id와 동일 (FK 연결)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT DEFAULT '#723CEB',
  role TEXT DEFAULT 'member',
  slack_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ───── TEAMS ─────
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slack_channel_id TEXT,
  notion_database_id TEXT,
  milo_preset TEXT DEFAULT 'default',
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ───── TEAM_MEMBERS ─────
CREATE TABLE IF NOT EXISTS public.team_members (
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);

-- ───── MEETINGS ─────
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','cancelled')),
  created_by UUID REFERENCES public.users(id),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_team_id ON public.meetings(team_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);

-- ───── AGENDAS ─────
CREATE TABLE IF NOT EXISTS public.agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INT DEFAULT 10,
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agendas_meeting_id ON public.agendas(meeting_id);

-- ───── MESSAGES ─────
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES public.agendas(id),
  user_id UUID REFERENCES public.users(id),
  content TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT false,
  ai_type TEXT,
  source TEXT DEFAULT 'web' CHECK (source IN ('web','slack','notion')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_meeting_id ON public.messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- ───── POLLS ─────
CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES public.agendas(id),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ───── POLL_VOTES ─────
CREATE TABLE IF NOT EXISTS public.poll_votes (
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id),
  option_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

-- ───── MEETING_SUMMARIES ─────
CREATE TABLE IF NOT EXISTS public.meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  decisions JSONB,
  discussions JSONB,
  deferred JSONB,
  action_items JSONB,
  milo_insights TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ───── TASKS ─────
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.users(id),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_date DATE,
  notion_block_id TEXT,
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON public.tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

-- ═══════════════════════════════════════════════════════════════
-- AUTH 트리거: auth.users에 가입 시 public.users + 기본 팀 자동 생성
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_team_id UUID;
  user_name TEXT;
  colors TEXT[] := ARRAY['#723CEB','#FF902F','#FFEF63','#34D399','#38BDF8','#F472B6'];
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- public.users에 프로필 삽입
  INSERT INTO public.users (id, email, name, avatar_color)
  VALUES (
    NEW.id,
    NEW.email,
    user_name,
    colors[1 + floor(random() * array_length(colors,1))::int]
  )
  ON CONFLICT (id) DO NOTHING;

  -- 기본 "My Workspace" 팀 생성
  INSERT INTO public.teams (name, created_by, milo_preset)
  VALUES (user_name || '의 팀', NEW.id, 'default')
  RETURNING id INTO new_team_id;

  -- 본인을 팀 오너로 추가
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (new_team_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- REALTIME 활성화
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks             ENABLE ROW LEVEL SECURITY;

-- ───── USERS ─────
DROP POLICY IF EXISTS "users read self and teammates" ON public.users;
CREATE POLICY "users read self and teammates" ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR id IN (
      SELECT user_id FROM public.team_members WHERE team_id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "users update self" ON public.users;
CREATE POLICY "users update self" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- ───── TEAMS ─────
DROP POLICY IF EXISTS "teams read by members" ON public.teams;
CREATE POLICY "teams read by members" ON public.teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "teams create by auth" ON public.teams;
CREATE POLICY "teams create by auth" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "teams update by owners" ON public.teams;
CREATE POLICY "teams update by owners" ON public.teams
  FOR UPDATE USING (
    id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- ───── TEAM_MEMBERS ─────
DROP POLICY IF EXISTS "team_members read by same team" ON public.team_members;
CREATE POLICY "team_members read by same team" ON public.team_members
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "team_members insert by owners" ON public.team_members;
CREATE POLICY "team_members insert by owners" ON public.team_members
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid() AND role = 'owner')
    OR user_id = auth.uid()  -- 본인 가입 허용 (트리거에서 사용)
  );

-- ───── MEETINGS ─────
DROP POLICY IF EXISTS "meetings read by team members" ON public.meetings;
CREATE POLICY "meetings read by team members" ON public.meetings
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "meetings create by team members" ON public.meetings;
CREATE POLICY "meetings create by team members" ON public.meetings
  FOR INSERT WITH CHECK (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "meetings update by team members" ON public.meetings;
CREATE POLICY "meetings update by team members" ON public.meetings
  FOR UPDATE USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "meetings delete by creator" ON public.meetings;
CREATE POLICY "meetings delete by creator" ON public.meetings
  FOR DELETE USING (created_by = auth.uid());

-- ───── AGENDAS ─────
DROP POLICY IF EXISTS "agendas full by team members" ON public.agendas;
CREATE POLICY "agendas full by team members" ON public.agendas
  FOR ALL USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE team_id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
      )
    )
  );

-- ───── MESSAGES ─────
DROP POLICY IF EXISTS "messages full by team members" ON public.messages;
CREATE POLICY "messages full by team members" ON public.messages
  FOR ALL USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE team_id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
      )
    )
  );

-- ───── POLLS ─────
DROP POLICY IF EXISTS "polls full by team members" ON public.polls;
CREATE POLICY "polls full by team members" ON public.polls
  FOR ALL USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE team_id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
      )
    )
  );

-- ───── POLL_VOTES ─────
DROP POLICY IF EXISTS "poll_votes full by team members" ON public.poll_votes;
CREATE POLICY "poll_votes full by team members" ON public.poll_votes
  FOR ALL USING (
    poll_id IN (
      SELECT id FROM public.polls WHERE meeting_id IN (
        SELECT id FROM public.meetings WHERE team_id IN (
          SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ───── MEETING_SUMMARIES ─────
DROP POLICY IF EXISTS "summaries full by team members" ON public.meeting_summaries;
CREATE POLICY "summaries full by team members" ON public.meeting_summaries
  FOR ALL USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE team_id IN (
        SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
      )
    )
  );

-- ───── TASKS ─────
DROP POLICY IF EXISTS "tasks full by team members or assignee" ON public.tasks;
CREATE POLICY "tasks full by team members or assignee" ON public.tasks
  FOR ALL USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    OR assignee_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════════════════
-- 완료 확인
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '✅ MeetFlow 스키마 배포 완료';
  RAISE NOTICE '   테이블 10개, RLS 활성화, Auth 트리거 연결됨';
  RAISE NOTICE '   이제 회원가입하면 자동으로 팀이 생성됩니다';
END $$;
