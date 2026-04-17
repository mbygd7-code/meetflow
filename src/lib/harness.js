/**
 * Harness Engineering Layer — MeetFlow AI Pipeline
 *
 * Retry · Circuit Breaker · Request Context · Token Budget · Session Persistence
 * ─────────────────────────────────────────────────────────────────────────────
 * 모든 AI 호출은 이 계층을 통과해야 안정성·관찰성·비용 추적이 보장된다.
 */

// ═══════════════════════════════════════════════════
//  A. Retry with Exponential Backoff
// ═══════════════════════════════════════════════════

/**
 * 함수를 exponential backoff로 재시도한다.
 * @param {(attempt: number) => Promise<T>} fn - 실행할 비동기 함수
 * @param {object} opts
 * @param {number} opts.maxRetries - 최대 재시도 횟수 (기본 2)
 * @param {number} opts.baseMs - 기본 대기 시간 (기본 1000ms)
 * @param {AbortSignal} opts.signal - 취소 시그널
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { maxRetries = 2, baseMs = 1000, signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      // 취소된 요청은 재시도하지 않음
      if (signal?.aborted || err?.name === 'AbortError') throw err;
      // 최대 재시도 초과
      if (attempt >= maxRetries) throw err;

      const delay = baseMs * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[harness] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms:`, err?.message || err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ═══════════════════════════════════════════════════
//  B. Circuit Breaker (인메모리)
// ═══════════════════════════════════════════════════

/**
 * 연속 실패 시 회로를 열어 API 과부하를 방지한다.
 *
 * States: CLOSED (정상) → OPEN (차단) → HALF_OPEN (시험 1회 허용)
 *
 * @param {object} opts
 * @param {number} opts.threshold - 연속 실패 횟수 임계값 (기본 3)
 * @param {number} opts.resetMs - OPEN 상태 유지 시간 (기본 30초)
 */
export class CircuitBreaker {
  constructor({ threshold = 3, resetMs = 30000 } = {}) {
    this.threshold = threshold;
    this.resetMs = resetMs;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.failures = 0;
    this.openedAt = 0;
  }

  async call(fn) {
    // OPEN 상태 체크
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.resetMs) {
        throw new CircuitOpenError(`Circuit open (${Math.round((this.resetMs - elapsed) / 1000)}s remaining)`);
      }
      // 타임아웃 경과 → HALF_OPEN으로 전환하여 1회 시험
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      // 성공 → 회로 닫기
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.threshold || this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.openedAt = Date.now();
        console.warn(`[harness] Circuit OPEN after ${this.failures} failures. Reset in ${this.resetMs / 1000}s`);
      }
      throw err;
    }
  }

  get isOpen() {
    return this.state === 'OPEN';
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.openedAt = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CircuitOpenError';
  }
}

// ═══════════════════════════════════════════════════
//  C. Request Context (Tracing & Observability)
// ═══════════════════════════════════════════════════

/**
 * 각 AI 호출에 고유 ID + 타이밍을 부여한다.
 * @returns {{ requestId, meetingId, employeeId, startedAt }}
 */
export function createRequestContext(meetingId, employeeId) {
  return {
    requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    meetingId: meetingId || 'unknown',
    employeeId: employeeId || 'milo',
    startedAt: performance.now(),
  };
}

/**
 * AI 호출 결과를 구조화 로그로 기록 + 메트릭 누적
 */
export function logAiCall(ctx, result, error) {
  const elapsed = Math.round(performance.now() - ctx.startedAt);
  const entry = {
    requestId: ctx.requestId,
    employee: ctx.employeeId,
    elapsed,
    responded: result?.should_respond ?? null,
    error: error ? (error.message || String(error)).slice(0, 120) : null,
    timestamp: Date.now(),
  };

  if (error) {
    console.error('[harness]', JSON.stringify(entry));
  } else {
    console.log('[harness]', JSON.stringify(entry));
  }

  // 세션 메트릭 누적
  accumulateMetrics(entry);
}

/**
 * sessionStorage에 호출 메트릭을 누적한다 (간이 대시보드용)
 */
const METRICS_KEY = 'meetflow_ai_metrics';
function accumulateMetrics(entry) {
  try {
    const raw = sessionStorage.getItem(METRICS_KEY);
    const metrics = raw ? JSON.parse(raw) : { totalCalls: 0, totalErrors: 0, totalMs: 0, calls: [] };
    metrics.totalCalls++;
    if (entry.error) metrics.totalErrors++;
    metrics.totalMs += entry.elapsed;
    // 최근 50개만 유지
    metrics.calls.push(entry);
    if (metrics.calls.length > 50) metrics.calls = metrics.calls.slice(-50);
    sessionStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
  } catch { /* sessionStorage 불가 환경 무시 */ }
}

/**
 * 현재 세션 메트릭 요약 (디버깅/대시보드용)
 */
export function getMetricsSummary() {
  try {
    const raw = sessionStorage.getItem(METRICS_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    return {
      totalCalls: m.totalCalls,
      totalErrors: m.totalErrors,
      errorRate: m.totalCalls > 0 ? ((m.totalErrors / m.totalCalls) * 100).toFixed(1) + '%' : '0%',
      avgLatency: m.totalCalls > 0 ? Math.round(m.totalMs / m.totalCalls) + 'ms' : '0ms',
      recentCalls: m.calls.slice(-10),
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════
//  D. Token Budget Manager
// ═══════════════════════════════════════════════════

/**
 * 프롬프트 섹션들에 토큰 예산을 우선순위 기반으로 배분한다.
 * 높은 priority 섹션(숫자 낮을수록 높음)이 먼저 예산을 확보하고,
 * 나머지를 낮은 priority가 나눠 가진다.
 *
 * @param {number} totalBudget - 총 토큰 예산
 * @param {Array<{name: string, content: string, priority: number, minTokens?: number}>} sections
 * @returns {Array<{name: string, content: string, tokens: number, truncated: boolean}>}
 */
export function allocateTokenBudget(totalBudget, sections) {
  // 토큰 ≈ 문자 / 4 (근사치)
  const estimateTokens = (text) => Math.ceil((text || '').length / 4);

  let remaining = totalBudget;
  const sorted = [...sections].sort((a, b) => a.priority - b.priority);
  const results = [];

  for (const sec of sorted) {
    const needed = estimateTokens(sec.content);
    const min = sec.minTokens || 0;

    if (needed <= remaining) {
      // 전체 할당 가능
      results.push({ name: sec.name, content: sec.content, tokens: needed, truncated: false });
      remaining -= needed;
    } else if (remaining >= min && remaining > 0) {
      // 부분 할당 (자르기)
      const charLimit = remaining * 4;
      const truncated = (sec.content || '').slice(0, charLimit) + '\n[...토큰 예산 초과로 일부 생략]';
      results.push({ name: sec.name, content: truncated, tokens: remaining, truncated: true });
      remaining = 0;
    } else {
      // 할당 불가 — 스킵
      results.push({ name: sec.name, content: '', tokens: 0, truncated: true });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════
//  E. Session Persistence (meetingId 기준)
// ═══════════════════════════════════════════════════

const SESSION_KEY = 'meetflow_session_';

/**
 * 회의별 AI 세션 상태를 sessionStorage에 저장한다.
 * (compressedContext, interventionCount, lastRespondingEmployee 등)
 */
export function saveSessionState(meetingId, state) {
  if (!meetingId) return;
  try {
    sessionStorage.setItem(SESSION_KEY + meetingId, JSON.stringify({
      ...state,
      savedAt: Date.now(),
    }));
  } catch { /* sessionStorage 불가 환경 무시 */ }
}

/**
 * 회의별 AI 세션 상태를 sessionStorage에서 복원한다.
 * 1시간 이상 지난 데이터는 무효 처리 (stale guard)
 */
export function loadSessionState(meetingId) {
  if (!meetingId) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY + meetingId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 1시간 이상 지난 데이터는 무효
    if (parsed.savedAt && Date.now() - parsed.savedAt > 60 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_KEY + meetingId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 회의 세션 데이터 삭제 (회의 종료 시)
 */
export function clearSessionState(meetingId) {
  if (!meetingId) return;
  try { sessionStorage.removeItem(SESSION_KEY + meetingId); } catch {}
}
