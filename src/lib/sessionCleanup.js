// 세션 격리 유틸 — 계정 전환/로그아웃 시 로컬 데이터 정리
//
// 목적: localStorage 기반 캐시/설정이 사용자 간 누수되는 것을 방지
// - 로그아웃 시 모든 meetflow 전용 키 삭제
// - 사용자 ID 변경 감지 시 이전 사용자 데이터 정리
//
// Supabase auth 관련 키(sb-*)는 유지 (로그인 상태 복원용)

// meetflow 전용 localStorage 키 패턴
const MEETFLOW_KEY_PATTERNS = [
  /^meetflow-/,        // meetflow-ai-team, meetflow-milo-settings 등
  /^meetflow_/,        // meetflow_integrations 등
  /^meeting-/,         // 개별 회의 임시 저장
];

// 보존해야 할 키 (지우지 말 것)
const PRESERVE_KEYS = [
  'theme',                    // 테마는 사용자 선호로 유지
  'meetflow-last-user-id',    // 사용자 ID 추적용 (본 유틸 전용)
];

// meetflow 전용 키만 찾아서 삭제
export function clearMeetflowStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (PRESERVE_KEYS.includes(key)) continue;
    if (MEETFLOW_KEY_PATTERNS.some((p) => p.test(key))) {
      toRemove.push(key);
    }
  }

  toRemove.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn('[sessionCleanup] Failed to remove', key, err);
    }
  });

  // sessionStorage도 함께 정리 (밀로 세션 상태 등)
  if (window.sessionStorage) {
    const sessionToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (MEETFLOW_KEY_PATTERNS.some((p) => p.test(key))) {
        sessionToRemove.push(key);
      }
      // 밀로 세션 상태 (meeting-{id}-session 형태)
      if (key.startsWith('meeting-') && key.endsWith('-session')) {
        sessionToRemove.push(key);
      }
    }
    sessionToRemove.forEach((key) => sessionStorage.removeItem(key));
  }

  console.log(`[sessionCleanup] Cleared ${toRemove.length} localStorage keys`);
}

// 사용자 변경 감지 & 자동 정리
// 앱 시작 시 & 로그인 후 호출. 이전 사용자와 다르면 이전 데이터 정리.
export function handleUserChange(currentUserId) {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  const LAST_USER_KEY = 'meetflow-last-user-id';
  const lastUserId = localStorage.getItem(LAST_USER_KEY);

  // 첫 로그인 (이전 사용자 없음)
  if (!lastUserId) {
    if (currentUserId) {
      localStorage.setItem(LAST_USER_KEY, currentUserId);
    }
    return false;
  }

  // 동일 사용자 → 정리 불필요
  if (lastUserId === currentUserId) {
    return false;
  }

  // 다른 사용자 → 이전 데이터 정리
  console.log(`[sessionCleanup] User changed: ${lastUserId} → ${currentUserId}. Clearing previous data.`);
  clearMeetflowStorage();

  if (currentUserId) {
    localStorage.setItem(LAST_USER_KEY, currentUserId);
  } else {
    localStorage.removeItem(LAST_USER_KEY);
  }

  return true; // 정리했음
}

// 로그아웃 시: 모든 meetflow 데이터 + 사용자 추적 키 삭제
export function clearOnLogout() {
  clearMeetflowStorage();
  try {
    localStorage.removeItem('meetflow-last-user-id');
  } catch {}
}
