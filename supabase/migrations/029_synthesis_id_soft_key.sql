-- 029: milo_synthesis_id FK 제거 — 소프트 그룹 키로 전환
--
-- 배경:
--   028에서 milo_synthesis_id를 messages(id) 참조 FK로 만듦.
--   하지만 Phase 1 구현 시 전문가 응답이 Milo 종합 메시지보다 먼저 INSERT되어야 함.
--   → 아직 존재하지 않는 synthesis 메시지의 UUID를 참조하려 하면 FK 제약 위반.
--
-- 해결:
--   FK 제거. milo_synthesis_id는 "같은 종합 세션의 AI 메시지들"을 묶는 소프트 그룹 키.
--   같은 턴의 전문가 2명 + Milo 종합 메시지가 모두 동일한 UUID를 공유.
--
-- 영향:
--   - 기존 데이터: 없음 (아직 해당 컬럼에 값이 들어간 행 없음)
--   - 쿼리: 그룹핑 쿼리는 그대로 동작 (인덱스도 유지)
--   - ON DELETE SET NULL: FK 제거로 더 이상 자동 정리 안 됨 → 메시지 삭제 시 그룹 키는 남음 (손해 미미)

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_milo_synthesis_id_fkey;

COMMENT ON COLUMN public.messages.milo_synthesis_id IS
  '종합 세션 그룹 키 (UUID) — 같은 턴에서 생성된 전문가 응답들과 Milo 종합 메시지가 동일 UUID 공유. FK 아님 (소프트 키).';
