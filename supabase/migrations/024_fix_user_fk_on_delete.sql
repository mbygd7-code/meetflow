-- 024: 직원 삭제 시 FK 충돌 해결
--
-- 문제: 001/002 마이그레이션의 여러 테이블이 public.users(id)를 참조하면서
--       ON DELETE 절이 없어 기본값 NO ACTION 적용됨
--       → 퇴사 직원 삭제 시 "update or delete on table violates foreign key constraint" 에러
--
-- 해결: 업무 기록 보존 목적으로 SET NULL 적용
--       (CASCADE는 회의/메시지/태스크까지 모두 삭제해 기록 손실 → 부적합)
--
-- 영향 테이블: teams, meetings, messages, polls, poll_votes, tasks, tasks(002)

-- ══════════════════════════════════════════════════════
-- 1) teams.created_by
-- ══════════════════════════════════════════════════════
ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_created_by_fkey,
  ADD CONSTRAINT teams_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════
-- 2) meetings.created_by
-- ══════════════════════════════════════════════════════
ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_created_by_fkey,
  ADD CONSTRAINT meetings_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════
-- 3) messages.user_id
-- ══════════════════════════════════════════════════════
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_user_id_fkey,
  ADD CONSTRAINT messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════
-- 4) polls.created_by
-- ══════════════════════════════════════════════════════
ALTER TABLE public.polls
  DROP CONSTRAINT IF EXISTS polls_created_by_fkey,
  ADD CONSTRAINT polls_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════
-- 5) poll_votes.user_id — PK 일부라 CASCADE로 처리 (투표 제거)
-- ══════════════════════════════════════════════════════
ALTER TABLE public.poll_votes
  DROP CONSTRAINT IF EXISTS poll_votes_user_id_fkey,
  ADD CONSTRAINT poll_votes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ══════════════════════════════════════════════════════
-- 6) tasks.assignee_id
-- ══════════════════════════════════════════════════════
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey,
  ADD CONSTRAINT tasks_assignee_id_fkey
    FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- tasks.created_by (019에서 이미 SET NULL로 설정되어 있음 — 스킵)

-- ══════════════════════════════════════════════════════
-- 7) knowledge_files.created_by (006) — auth.users 참조
-- ══════════════════════════════════════════════════════
-- auth.users → public.users는 CASCADE라 auth가 먼저 삭제되면 public.users도 날아감
-- 이때 knowledge_files.created_by는 auth.users를 직접 참조 → auth 삭제 시 동반 삭제 원치 않음
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'knowledge_files') THEN
    ALTER TABLE public.knowledge_files
      DROP CONSTRAINT IF EXISTS knowledge_files_created_by_fkey;
    ALTER TABLE public.knowledge_files
      ADD CONSTRAINT knowledge_files_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════
-- 8) 기타 잠재 테이블 — 존재 시에만 처리
-- ══════════════════════════════════════════════════════
-- tasks.created_by (019), task_comments.user_id (017 SET NULL), meeting_participants (022 CASCADE)
-- employee_evaluations.user_id (004 CASCADE) — 이미 설정됨

COMMENT ON CONSTRAINT teams_created_by_fkey ON public.teams IS
  '팀 생성자 — 퇴사 시 SET NULL로 팀 기록 보존';
COMMENT ON CONSTRAINT meetings_created_by_fkey ON public.meetings IS
  '회의 생성자 — 퇴사 시 SET NULL로 회의 기록 보존';
COMMENT ON CONSTRAINT messages_user_id_fkey ON public.messages IS
  '메시지 작성자 — 퇴사 시 SET NULL로 대화 기록 보존';
