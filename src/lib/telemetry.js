// ═══ 클라이언트 텔레메트리 유틸 ═══
//
// 목적: AI 오케스트레이션 단계별 이벤트를 구조화 로그로 찍어
//       브라우저 콘솔·DevTools에서 필터링·분석 가능하게 함.
//
// 설계 원칙:
//   - 모든 이벤트는 JSON 한 줄 (grep/JSON 파서로 바로 처리)
//   - 공통 필드: type, ts, meetingId, orchestrationVersion
//   - 이벤트별 추가 필드는 payload로 전개
//
// 확장:
//   - 향후 Supabase ai_usage_logs 테이블로 배치 전송 가능 (현재는 콘솔만)
//   - 개발 환경에서는 verbose, 운영에서는 info 레벨 이상만

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

// 텔레메트리 켜고/끄기 (문제 발생 시 즉시 끌 수 있도록)
let ENABLED = true;
export function setTelemetryEnabled(enabled) {
  ENABLED = !!enabled;
}

// 핵심 로거 — JSON 한 줄로 출력
export function telemetry(type, payload = {}) {
  if (!ENABLED) return;
  const event = {
    type,
    ts: new Date().toISOString(),
    ...payload,
  };
  // 개발: 가독성 좋게, 운영: JSON 한 줄
  if (IS_DEV) {
    console.log(`[${type}]`, event);
  } else {
    console.log(JSON.stringify(event));
  }
}

// ═══ Pre-defined 이벤트 헬퍼 (오타 방지) ═══

// AI 호출 시작 — useMilo가 analyzeMilo 호출하기 직전
export function logAiCallStart({ meetingId, employeeId, trigger, messageId }) {
  telemetry('ai_call_start', {
    meetingId,
    employeeId,
    trigger, // 'mention' | 'auto' | 'direct_request' | 'follow_up' | 'always_respond'
    messageId, // 트리거가 된 사용자 메시지 ID
  });
}

// AI 호출 응답 완료
export function logAiCallEnd({ meetingId, employeeId, elapsed, shouldRespond, orchestrationVersion, usage }) {
  telemetry('ai_call_end', {
    meetingId,
    employeeId,
    elapsed, // ms
    shouldRespond,
    orchestrationVersion,
    usage: usage ? {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cacheRead,
    } : null,
  });
}

// AI 호출 실패
export function logAiCallError({ meetingId, employeeId, error, type }) {
  telemetry('ai_call_error', {
    meetingId,
    employeeId,
    error: String(error).slice(0, 200),
    errorType: type, // 'timeout' | 'abort' | 'network' | 'exception'
  });
}

// 오케스트레이션 단계 전환 (Phase 1 이후 의미 있어짐)
export function logOrchestrationStep({ meetingId, step, employees, orchestrationVersion }) {
  telemetry('orchestration_step', {
    meetingId,
    step, // 'conductor_start' | 'specialists_parallel' | 'milo_synthesize' | 'done'
    employees, // 호출된 ID 배열
    orchestrationVersion,
  });
}

// 오케스트레이션 스킵 (자동개입 OFF 등)
export function logOrchestrationSkip({ meetingId, reason, messageId }) {
  telemetry('orchestration_skip', {
    meetingId,
    reason, // 'auto_intervene_off' | 'cooldown' | 'max_interventions' | 'min_turns' | 'running' | 'already_processed'
    messageId,
  });
}
