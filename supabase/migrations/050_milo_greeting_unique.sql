-- ════════════════════════════════════════════════════════════════════
-- 050_milo_greeting_unique
-- Milo 첫 인사 메시지(ai_type='nudge') 중복 방지 unique index
-- ════════════════════════════════════════════════════════════════════
-- 배경:
--   다중 클라이언트가 거의 동시에 회의방에 진입하면
--   각 클라가 setTimeout 콜백에서 sendMessage 를 호출 → 중복 INSERT 발생.
--   클라이언트 측 ref/타이머 가드로는 race를 100% 막을 수 없음.
--
-- 해결:
--   회의 1개당 ai_type='nudge' 메시지는 단 1개만 INSERT 가능하도록
--   부분 unique index (partial unique index) 적용.
--   두 번째 INSERT 시도 시 23505 (unique violation) → 클라/Edge Function이
--   silent skip 처리.
--
-- 동시 사용:
--   - milo-greeting Edge Function: SELECT pre-check + INSERT (race 1차 방어)
--   - 이 unique index: INSERT 단계 race 최후 방어 (ms 단위 동시성도 차단)
-- ════════════════════════════════════════════════════════════════════

-- 기존 데이터에 중복이 있다면 먼저 정리 (각 회의별 가장 오래된 nudge만 남김)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY meeting_id
           ORDER BY created_at ASC
         ) AS rn
  FROM messages
  WHERE is_ai = TRUE AND ai_type = 'nudge'
)
DELETE FROM messages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 부분 unique index 생성
CREATE UNIQUE INDEX IF NOT EXISTS milo_nudge_unique_per_meeting
  ON messages (meeting_id)
  WHERE is_ai = TRUE AND ai_type = 'nudge';

COMMENT ON INDEX milo_nudge_unique_per_meeting IS
  'Milo 첫 인사 메시지(ai_type=nudge)는 회의당 1개만 허용 — 다중 클라 race INSERT 차단';
