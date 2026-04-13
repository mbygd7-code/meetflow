-- ═══ meeting_summaries 테이블 ═══
CREATE TABLE IF NOT EXISTS meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  decisions JSONB DEFAULT '[]'::jsonb,
  discussions JSONB DEFAULT '[]'::jsonb,
  deferred JSONB DEFAULT '[]'::jsonb,
  action_items JSONB DEFAULT '[]'::jsonb,
  milo_insights TEXT,
  generated_by TEXT DEFAULT 'milo',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_summaries_meeting ON meeting_summaries(meeting_id);

-- ═══ tasks 테이블 ═══
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  due_date DATE,
  assignee_id UUID REFERENCES users(id),
  meeting_id UUID REFERENCES meetings(id),
  meeting_title TEXT,
  ai_suggested BOOLEAN DEFAULT false,
  service_name TEXT,
  page_name TEXT,
  feature_name TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_meeting ON tasks(meeting_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- ═══ Realtime 활성화 ═══
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_summaries;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- ═══ RLS ═══
ALTER TABLE meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_read_summaries" ON meeting_summaries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN team_members tm ON tm.team_id = m.team_id
      WHERE m.id = meeting_summaries.meeting_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_read_tasks" ON tasks
  FOR SELECT USING (
    assignee_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM meetings m
      JOIN team_members tm ON tm.team_id = m.team_id
      WHERE m.id = tasks.meeting_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "assignee_update_tasks" ON tasks
  FOR UPDATE USING (assignee_id = auth.uid());
