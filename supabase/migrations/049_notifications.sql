-- ═══ notifications 테이블 ═══
-- 사용자별 인앱 알림. Bell 아이콘 → /notifications 페이지에서 노출.
-- 트리거 기반 자동 생성 (tasks/meetings/meeting_summaries) + Edge Function/cron에서 직접 INSERT 도 허용.

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,                  -- e.g. 'task.assigned', 'meeting.live_now'
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('urgent','normal','low')),
  title         TEXT NOT NULL,
  body          TEXT,
  source_type   TEXT,                            -- 'meeting' | 'task' | 'summary' | 'system'
  source_id     UUID,
  ai_specialist TEXT,                            -- 'milo' | 'gantt' | ... | NULL
  action_url    TEXT,                            -- 클릭 이동지
  metadata      JSONB DEFAULT '{}'::jsonb,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON notifications(user_id, created_at DESC);

-- ═══ Realtime 활성화 ═══
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ═══ RLS — 본인 알림만 ═══
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_notifications_select" ON notifications;
CREATE POLICY "own_notifications_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_notifications_update" ON notifications;
CREATE POLICY "own_notifications_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_notifications_delete" ON notifications;
CREATE POLICY "own_notifications_delete" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- INSERT 는 service_role / SECURITY DEFINER 트리거 만 허용
-- (앱 클라이언트는 직접 INSERT 금지 — RLS INSERT policy 미설정)

-- ═══════════════════════════════════════════════
-- Phase 1 트리거: tasks / meetings / meeting_summaries
-- ═══════════════════════════════════════════════

-- ── 1) task.assigned — 본인이 새로 배정받음 ──
CREATE OR REPLACE FUNCTION notify_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT: 새 태스크에 assignee가 있고 자기 자신이 아닌 경우 (자가 배정 알림 X)
  IF (TG_OP = 'INSERT') THEN
    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, priority, title, body, source_type, source_id, ai_specialist, action_url, metadata)
      VALUES (
        NEW.assignee_id,
        'task.assigned',
        CASE WHEN NEW.priority = 'urgent' THEN 'urgent' ELSE 'normal' END,
        '새 태스크가 배정되었어요',
        NEW.title,
        'task',
        NEW.id,
        CASE WHEN NEW.ai_suggested THEN 'gantt' ELSE NULL END,
        '/members?task=' || NEW.id,
        jsonb_build_object('priority', NEW.priority, 'due_date', NEW.due_date)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: assignee_id 가 바뀐 경우 (재배정)
  IF (TG_OP = 'UPDATE') THEN
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, priority, title, body, source_type, source_id, ai_specialist, action_url, metadata)
      VALUES (
        NEW.assignee_id,
        'task.assigned',
        CASE WHEN NEW.priority = 'urgent' THEN 'urgent' ELSE 'normal' END,
        '태스크가 재배정되었어요',
        NEW.title,
        'task',
        NEW.id,
        NULL,
        '/members?task=' || NEW.id,
        jsonb_build_object('priority', NEW.priority, 'due_date', NEW.due_date)
      );
    END IF;

    -- priority urgent 승격
    IF NEW.priority = 'urgent' AND OLD.priority IS DISTINCT FROM 'urgent' AND NEW.assignee_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, priority, title, body, source_type, source_id, ai_specialist, action_url, metadata)
      VALUES (
        NEW.assignee_id,
        'task.priority_raised_to_urgent',
        'urgent',
        '태스크 우선순위가 긴급으로 변경됐어요',
        NEW.title,
        'task',
        NEW.id,
        'gantt',
        '/members?task=' || NEW.id,
        '{}'::jsonb
      );
    END IF;

    -- status: done 으로 변경 → 태스크 생성/소유자에게 알림 (현재 schema에 created_by 없으므로 skip)
    -- (향후 created_by 컬럼 추가되면 task.completed_by_assignee 알림 활성화)
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON tasks;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_assigned();

-- ── 2) meeting.live_now — 회의가 active 로 전환되면 같은 팀 멤버 전원 ──
CREATE OR REPLACE FUNCTION notify_meeting_live_now()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    INSERT INTO notifications (user_id, type, priority, title, body, source_type, source_id, ai_specialist, action_url)
    SELECT
      tm.user_id,
      'meeting.live_now',
      'urgent',
      '회의가 시작됐어요',
      NEW.title,
      'meeting',
      NEW.id,
      NULL,
      '/meetings/' || NEW.id
    FROM team_members tm
    WHERE tm.team_id = NEW.team_id
      AND tm.user_id IS NOT NULL
      AND tm.user_id <> COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_meeting_live_now ON meetings;
CREATE TRIGGER trg_notify_meeting_live_now
  AFTER UPDATE OF status ON meetings
  FOR EACH ROW EXECUTE FUNCTION notify_meeting_live_now();

-- ── 3) meeting.summary_ready — 회의록 생성 완료 ──
-- 요청자(created_by) + 회의 참석한 사람들(messages.user_id distinct, AI 제외) 모두에게
CREATE OR REPLACE FUNCTION notify_meeting_summary_ready()
RETURNS TRIGGER AS $$
DECLARE
  v_meeting record;
BEGIN
  SELECT m.id, m.title, m.team_id, m.created_by
    INTO v_meeting
    FROM meetings m
    WHERE m.id = NEW.meeting_id;

  IF v_meeting IS NULL THEN
    RETURN NEW;
  END IF;

  -- 요청자
  IF v_meeting.created_by IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, priority, title, body, source_type, source_id, ai_specialist, action_url)
    VALUES (
      v_meeting.created_by,
      'meeting.summary_ready',
      'normal',
      '회의록이 준비됐어요',
      v_meeting.title,
      'summary',
      NEW.meeting_id,
      'milo',
      '/summaries/' || NEW.meeting_id
    );
  END IF;

  -- 참석자(메시지 작성한 사람) — 요청자 제외
  INSERT INTO notifications (user_id, type, priority, title, body, source_type, source_id, ai_specialist, action_url)
  SELECT DISTINCT
    msg.user_id,
    'summary.you_were_mentioned',
    'normal',
    '참여한 회의의 회의록이 준비됐어요',
    v_meeting.title,
    'summary',
    NEW.meeting_id,
    'milo',
    '/summaries/' || NEW.meeting_id
  FROM messages msg
  WHERE msg.meeting_id = NEW.meeting_id
    AND msg.is_ai = false
    AND msg.user_id IS NOT NULL
    AND msg.user_id <> COALESCE(v_meeting.created_by, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_meeting_summary_ready ON meeting_summaries;
CREATE TRIGGER trg_notify_meeting_summary_ready
  AFTER INSERT ON meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION notify_meeting_summary_ready();

-- ═══ 30일 이상 read 알림 자동 cleanup 함수 (cron 에서 매일 호출용 — 본 마이그레이션은 함수만 등록) ═══
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications
   WHERE read_at IS NOT NULL
     AND read_at < (now() - interval '30 days');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
