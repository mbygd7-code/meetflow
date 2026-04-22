# MeetFlow 실시간 메시지 진단 가이드

> 작성일: 2026-04-22
> 증상: **"내 화면에는 다 보이는데, 상대방은 새로고침해야 내 메시지가 보임"**
> 이 문서는 다른 컴퓨터/환경에서 동일 증상 재발 시 재사용하도록 작성.

---

## 0. 현재 구현 상태 요약

3계층 방어가 이미 적용되어 있음:

| 계층 | 경로 | 파일 |
|---|---|---|
| ① Broadcast emit/listen | 0.1s, RLS 우회 | `src/hooks/useRealtimeMessages.js:173-210, 345-356` |
| ② postgres_changes INSERT | 0.5~2s, DB 레플리케이션 | `src/hooks/useRealtimeMessages.js:180-202` |
| ③ 폴링 (1.5s/5s 동적) | REST, WS 장애 시 안전망 | `src/hooks/useRealtimeMessages.js:230-246` |
| ④ 가시성/포커스 재조회 | 탭 복귀 시 즉시 | `src/hooks/useRealtimeMessages.js:252-264` |

DB 레벨:
- `supabase/migrations/022_meeting_participants.sql` — 팀과 독립된 참석자 관리
- `supabase/migrations/023_fix_participants_recursion.sql` — RLS 42P17 재귀 해결 (SECURITY DEFINER 함수)

---

## 1. 증상별 원인 매핑

### "상대방만 새로고침해야 보임" = 다음 3개 중 하나

| 가설 | 원인 | 판별 신호 |
|---|---|---|
| **A. 탭 throttle** | Chrome/Edge가 백그라운드 탭 setTimeout을 1분에 1회로 제한 | 상대방 탭이 비활성 상태일 때만 재현 |
| **B. JWT 세션 문제** | WS 401 거부 + REST 폴링도 간헐적 401 | 콘솔에 `HTTP Authentication failed; no valid credentials available` |
| **C. UI 리렌더 누락** | state는 업데이트되는데 리스트 컴포넌트가 다시 안 그림 | 폴링 로그는 찍히는데 화면은 그대로 |

---

## 2. 진단 절차 (상대방 브라우저 DevTools Console)

회의방을 연 상태에서 아래를 붙여넣기:

```js
// 1. 세션 상태
const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
const s = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
console.log('[진단] 세션 있음?', !!s, '| 만료까지(분):', s ? Math.round((s.expires_at*1000 - Date.now())/60000) : 'N/A');

// 2. 탭 가시성
console.log('[진단] 탭 가시성:', document.visibilityState, '| 포커스:', document.hasFocus());

// 3. 메시지 DOM 변화 30초 관측 (이 동안 상대가 메시지 전송)
let before;
setTimeout(() => { before = document.querySelectorAll('[data-message-id], .message-bubble').length; console.log('[진단] T=0:', before); }, 0);
setTimeout(() => { const n = document.querySelectorAll('[data-message-id], .message-bubble').length; console.log('[진단] T=30s:', n, '| Δ:', n - before); }, 30000);

// 4. REST 직접 fetch — 401이면 가설 B 확정
(async () => {
  const projRef = key.match(/sb-(.+?)-auth-token/)[1];
  const r = await fetch(`https://${projRef}.supabase.co/rest/v1/messages?select=id,created_at&limit=3&order=created_at.desc`, {
    headers: { apikey: '<VITE_SUPABASE_ANON_KEY>', Authorization: `Bearer ${s.access_token}` }
  });
  console.log('[진단] REST 상태:', r.status, '| OK?', r.ok);
})();
```

→ `<VITE_SUPABASE_ANON_KEY>`는 `.env.local`에서 복사.

### 결과 해석

| 콘솔 출력 | 판정 |
|---|---|
| `③ 폴링 #N — 신규 N건 반영` 찍힘 | 가설 C (UI 문제) |
| `② Realtime INSERT 수신` 찍힘 | 정상 경로 동작 — 다른 문제 |
| 아무 로그 없음 + 탭 visibility=hidden | 가설 A |
| `REST 상태: 401` | 가설 B 확정 |
| `만료까지(분): 음수` | 가설 B (만료된 토큰) |

---

## 3. Supabase 측 검증 SQL (SQL Editor)

```sql
-- 3-1) publication에 messages 포함 확인
SELECT tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename IN ('messages','meetings','meeting_participants');
-- messages 빠졌으면:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 3-2) REPLICA IDENTITY
SELECT relname, relreplident FROM pg_class
WHERE relname IN ('messages','meeting_participants');
-- 'd'(default) 또는 'f'(full)이면 OK

-- 3-3) 최근 7일 회의 참석자 누락 확인
SELECT m.id, m.title, m.created_at,
       (SELECT count(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) AS cnt,
       (SELECT array_agg(u.name) FROM meeting_participants mp
        JOIN users u ON u.id = mp.user_id WHERE mp.meeting_id = m.id) AS participants
FROM meetings m
WHERE m.created_at > now() - interval '7 days'
ORDER BY m.created_at DESC;

-- 3-4) 특정 사용자가 접근 가능한 회의 (RLS 통과 여부)
SELECT count(*) FROM accessible_meeting_ids('사용자UUID'::uuid);
```

---

## 4. 가설별 수정 가이드

### 가설 A — 백그라운드 탭 throttle
**즉시 우회**: 상대방에게 MeetFlow 탭을 맨 앞에 두라고 안내.
**코드 조치**: `useRealtimeMessages.js`의 setTimeout 폴링을 Web Worker 기반 polling으로 교체. Worker는 throttle 영향 받지 않음. 30분 작업.

### 가설 B — JWT 세션 문제
**즉시 우회**: 상대방 로그아웃 → 재로그인.
**코드 조치**: `src/lib/supabase.js`에 추가:
```js
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session) {
    supabase.realtime.setAuth(session.access_token);
  }
});
```
+ 각 채널이 `CHANNEL_ERROR` 시 자동 재구독. 1시간 작업.

### 가설 C — UI 리렌더 누락
메시지 리스트 컴포넌트(`MessageList`, `MeetingRoom`)의 `key` prop과 `React.memo` 의존성 점검. `messages` 배열 참조가 바뀌는지 확인 (dedupAdd가 `[...prev, msg]` 새 배열 반환하므로 정상이어야 함).

---

## 5. 즉시 우회책 (진단 전에도 가능)

1. **상대방 탭을 맨 앞에 유지** → 가설 A 해결
2. **상대방 로그아웃 → 재로그인** → 가설 B 해결
3. **`VITE_DISABLE_REALTIME_WS=true`** 환경변수 → WS 완전 차단하고 폴링만 사용 (Vercel env 추가 후 재배포)
4. 런타임 토글: 콘솔에 `localStorage.setItem('disable_realtime_ws','1'); location.reload();`

---

## 6. 다른 컴퓨터에서 재진단 체크리스트

- [ ] 이 문서(`docs/realtime-diagnosis.md`) 열기
- [ ] 상대방 콘솔에서 2절 진단 스크립트 실행
- [ ] Supabase SQL Editor에서 3절 검증 쿼리 실행
- [ ] 결과로 A/B/C 중 하나 특정
- [ ] 4절 가설별 수정 적용
- [ ] 검증: 두 브라우저/두 계정에서 메시지 왕복 500ms~3초 내 표시

---

## 7. 원 설계 계획 (3계층 방어 아키텍처)

> 출처: `C:\Users\rimmma\.claude\plans\immutable-strolling-rivest.md` (사용자 홈 디렉토리, 다른 PC에서는 접근 불가하므로 여기에 병합)

### 배경
- **PoC 아님 — 실제 업무 도구로 매일 쓸 제품**. "가끔 안 오는" 수준은 업무용으로 치명적.
- 외부 서비스(Ably/Pusher) 추가 없이 Supabase 안에서 프로덕션급 신뢰성 확보.
- 현재 단계는 리스크 최소화를 위해 **회의 메시지 한 곳만 먼저** 프로덕션급 개선, 나머지(태스크 댓글/목록/멤버)는 현행 유지.

### 아키텍처 다이어그램

```
[송신자 A]  sendMessage()
     │
     ├── ① DB INSERT (authoritative)
     │       └─> postgres_changes → 모든 수신자 (0.5~2s)
     │
     ├── ② Broadcast emit (optimistic, 같은 채널 구독자에게 즉시)
     │       └─> 수신자 (0.1s, RLS 우회, WS 가벼움)
     │
     └── ③ (수신 측) 1.5~5초 폴링 — ①②가 모두 실패해도 복구
             └─> REST 기반이라 WS 장애에 영향 0

[수신자 B]  3개 중 아무거나 먼저 오면 화면 표시
         ID로 중복 제거 → 어느 경로로 와도 동일 결과
```

**설계 이유**
- Broadcast는 DB 레플리케이션 파이프라인을 거치지 않아 더 가볍고 빠름. RLS 우회라 publication/권한 이슈에 영향 없음.
- postgres_changes는 "DB에 저장되었음"을 보장하는 신뢰 소스.
- 폴링은 WS가 완전히 죽어도 동작하는 최종 안전망.

### 채널 이름 규약
```js
const channelName = `meeting:${meetingId}`;  // 고정 — Date.now() 같은 동적값 금지
```
송신자와 수신자가 **반드시 같은 이름**에 subscribe해야 Broadcast가 전달됨.

### 운영 지표 기준 (1시간 사용 후)
- Broadcast 수신 비율 ≥ 90% → 건강
- Realtime fallback ≤ 8%
- 폴링 fallback ≤ 2% (0이 이상적)

운영 2주 데이터 기준 누락률 > 1% 또는 평균 지연 > 1s면 Ably/Pusher 도입 ROI 재평가.

### 다음 단계 (이 작업 이후)
- 회의 메시지 안정화 확인되면 같은 패턴을 `useTaskComments.js`에 이식
- Realtime 상태 UI 배너 추가 (🟢/🟡/🔴)
- 관리자용 `/admin/realtime-health` 진단 페이지 (접속자별 WS 상태, RLS 시뮬레이션, publication 점검)

---

## 8. 참고 파일

- 계획 문서: `C:\Users\rimmma\.claude\plans\immutable-strolling-rivest.md`
- 핵심 훅: `src/hooks/useRealtimeMessages.js`
- 회의 생성/참석자 등록: `src/hooks/useMeeting.js:106-127`
- Supabase 클라이언트 설정: `src/lib/supabase.js`
- 참석자 테이블: `supabase/migrations/022_meeting_participants.sql`
- RLS 재귀 수정: `supabase/migrations/023_fix_participants_recursion.sql`
