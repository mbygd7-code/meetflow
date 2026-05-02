// 발표 세션 그룹핑 유틸 — 메시지 metadata.during_screen_share 기반.
//
// 클라이언트 두 컴포넌트(PresentationSessions, MeetingSummaryPrintable)가 동일 로직을
// 중복 보유하던 것을 통합. Edge function(generate-summary)은 Deno 환경이라 별도 카피 유지.
//
// 그룹핑 규칙:
//   - 같은 발표자 메시지가 연달아 오면 한 그룹
//   - 발표 메타 없는 메시지가 끼어들면 그룹 종료 (분리)
//   - 메타데이터 누락/잘못된 형식은 안전하게 skip

/**
 * @typedef {Object} PresentationSession
 * @property {string} presenter
 * @property {string} presenter_name
 * @property {string|null} start_at
 * @property {string|null} end_at
 * @property {Array} messages
 */

/**
 * 메시지 배열을 발표자별 연속 세션으로 그룹핑.
 *
 * @param {Array} messages
 * @returns {PresentationSession[]}
 */
export function groupPresentations(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const groups = [];
  let current = null;
  for (const m of messages) {
    if (!m) continue;
    const ds = m.metadata?.during_screen_share;
    const presenter = ds?.presenter;

    if (presenter) {
      if (current && current.presenter === presenter) {
        current.messages.push(m);
        if (m.created_at) current.end_at = m.created_at;
      } else {
        if (current) groups.push(current);
        current = {
          presenter,
          presenter_name: ds?.presenter_name || '발표자',
          start_at: m.created_at || null,
          end_at: m.created_at || null,
          messages: [m],
        };
      }
    } else if (current) {
      groups.push(current);
      current = null;
    }
  }
  if (current) groups.push(current);
  return groups;
}

/**
 * 시작/종료 시각으로 소요 분 계산. 24h 초과는 timestamp 이상치로 보고 0 반환.
 * (다른 통계 계산과 동일 가드 정책)
 */
export function presentationDurationMinutes(startAt, endAt) {
  if (!startAt || !endAt) return 0;
  try {
    const ms = new Date(endAt) - new Date(startAt);
    if (!Number.isFinite(ms)) return 0;
    const min = Math.round(ms / 60000);
    return min > 0 && min < 1440 ? min : 0;
  } catch {
    return 0;
  }
}
