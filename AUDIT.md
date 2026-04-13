# MeetFlow 프로젝트 전체 점검 보고서

## Context
CLAUDE.md와 SKILL.md를 기준으로 프로젝트의 폴더 구조, DB 스키마, AI 시스템, Realtime 구독, 미구현 기능을 전수 점검한 결과.

---

## 1. 폴더 구조 점검

### ✅ 일치하는 항목
- `src/lib/` — supabase.js, claude.js, constants.js 모두 존재
- `src/stores/` — authStore, meetingStore, taskStore + 추가로 themeStore, miloStore, aiTeamStore, toastStore
- `src/hooks/` — useMeeting.js, useMilo.js, useRealtimeMessages.js 존재
- `src/components/ui/` — Avatar, Badge, Button, Card, Input, MetricCard, Modal + SectionPanel, Toast, WeeklyChart, index.js
- `src/components/layout/` — Layout.jsx, Sidebar.jsx, TopBar.jsx
- `src/components/meeting/` — MeetingLobby, MeetingRoom, AgendaBar, ChatArea, ChatBubble, AISummaryPanel, ParticipantList + CreateMeetingModal, MeetingCard
- `src/components/task/` — TaskDashboard, TaskCard, TaskBoard + TaskDetailModal
- `src/components/summary/` — MeetingSummary.jsx
- `src/utils/` — miloPrompts.js, formatters.js + gradeUtils.js
- `supabase/migrations/` — 001_initial_schema.sql + 003, 004 추가 마이그레이션

### ⚠️ 이름 불일치
| SKILL.md 기대값 | 실제 파일명 | 영향 |
|---|---|---|
| `MeetingPage.jsx` | `MeetingsPage.jsx` | 라우팅 정상 동작, 네이밍만 다름 |
| `SummaryPage.jsx` | `SummariesPage.jsx` | 위와 동일 |
| `useRealtimeMessages.js` | `useRealtimeMessages.js` | ✅ 일치 (SKILL.md는 `useRealtimeMessages`로 기재) |
| `slack-webhook/` | `slack-commands/ + slack-events/ + slack-notify/` | 3개로 분리됨 (기능적으로 더 나음) |

### ❌ 누락된 파일
| 파일 | SKILL.md 기대 기능 | 현재 상태 |
|---|---|---|
| `src/components/milo/MiloAvatar.jsx` | Milo 전용 아바타 (그라디언트+글로우) | 디렉토리 빈 상태. Avatar.jsx variant="ai"로 대체 |
| `src/components/milo/MiloMessage.jsx` | Milo 전용 말풍선 | ChatBubble.jsx에서 isAi 분기로 대체 |
| `src/components/meeting/PollCard.jsx` | 회의 중 투표 UI | **미구현** |
| `src/components/summary/SummaryExport.jsx` | 회의록 내보내기 (PDF/MD) | **미구현** |

### SKILL.md에 없는 추가 파일 (프로젝트 진화)
- `src/components/admin/` — AdminUserManagement, EmployeeTable, EvaluationReportModal, TeamOverview
- `src/pages/AdminDashboardPage.jsx`, `EmployeeDetailPage.jsx`
- `supabase/functions/evaluate-employee/`, `gcal-create-event/`, `notion-poll/`
- `api/cron/evaluate.js`

---

## 2. Supabase 테이블 점검

### ✅ 10개 테이블 모두 존재 (SKILL.md 완전 일치)
users, teams, team_members, meetings, agendas, messages, polls, poll_votes, meeting_summaries, tasks

### ✅ 컬럼 구조 정확
모든 필수 컬럼이 SKILL.md와 일치. FK, composite PK 모두 정상.

### 추가된 컬럼 (SKILL.md 대비 확장)
| 테이블 | 추가 컬럼 | 목적 |
|---|---|---|
| users | `slack_user_id` | Slack 연동 |
| teams | `created_by` | 팀 생성자 추적 |
| team_members | `joined_at` | 멤버 가입 시점 |
| meetings | `scheduled_at` | 예약 시간 분리 |
| tasks | `team_id`, `description`, `ai_suggested` | 팀 소속, 설명, AI 제안 플래그 |

### ✅ Realtime Publication
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages, meetings, tasks, polls, poll_votes;
```
SKILL.md 기준 5개 테이블 모두 등록됨.

### ✅ RLS 정책
10개 테이블 모두 RLS 활성화. 팀 기반 접근 제어 구현됨.

### 추가 테이블 (SKILL.md 이후)
- `employee_evaluations` — 004 마이그레이션에서 추가 (AI 직원 평가 시스템)

---

## 3. Milo AI 시스템 점검

### ✅ 시스템 프롬프트 — SKILL.md 준수
- `src/utils/miloPrompts.js` — MILO_SYSTEM_PROMPT가 SKILL.md 6절과 일치
  - 역할, 5대 원칙, 개입 시점, 금지사항, 응답 형식 모두 포함
  - 한국어, 3-4문장 (호출 시 5-8문장)

### ✅ 프롬프트 체인 아키텍처
SKILL.md: `메시지 수신 → 패턴 감지 → 개입 판단 → Claude API 호출 → 발송`
- Step 1: `useRealtimeMessages.js` — Supabase realtime INSERT 감지
- Step 2: `useMilo.js` — TRIGGER 패턴 매칭 (MENTION, GUESS, AGREEMENT, DEADLINE)
- Step 3: `useMilo.js` — 빈도/쿨다운/턴 수 체크
- Step 4: `claude.js` — Claude API 호출 (프론트엔드) / `milo-analyze/index.ts` (Edge Function)
- Step 5: DB INSERT + Slack 발송

### ✅ 7명 AI 직원 시스템
`aiTeamStore.js`에 drucker(Milo), kotler, froebel, gantt, norman, korff, deming 7명 정의. 각각 systemPrompt, triggerKeywords, defaultMdFiles 보유.

### ⚠️ 이슈: 프롬프트 이중화
| 위치 | 모델 | 프롬프트 |
|---|---|---|
| `src/lib/claude.js` (프론트엔드) | claude-sonnet-4 | miloPrompts.js 동적 빌드 |
| `milo-analyze/index.ts` (Edge) | claude-opus-4-6 | 자체 내장 프롬프트 |

→ 모델도 다르고 프롬프트도 다름. Edge Function은 miloStore 설정 미반영.

### ⚠️ 이슈: 프리셋 불완전
SKILL.md 프리셋(default/coach/analyst/recorder)의 빈도/쿨다운 설정이 `miloPrompts.js`에 상수로 정의되어 있지 않음. `aiTeamStore.js`의 MEETING_PRESETS는 전문가 배정용이지 개입 빈도 설정이 아님.

---

## 4. Realtime 구독 점검

### ❌ 심각: 5개 중 1개만 구독됨

| 테이블 | Publication 등록 | 클라이언트 구독 | 상태 |
|---|---|---|---|
| messages | ✅ | ✅ `useRealtimeMessages.js` | 정상 |
| meetings | ✅ | ❌ | **미구현** — 상태 변경 실시간 반영 안 됨 |
| tasks | ✅ | ❌ | **미구현** — 태스크 변경 실시간 반영 안 됨 |
| polls | ✅ | ❌ | **미구현** — 투표 실시간 업데이트 안 됨 |
| poll_votes | ✅ | ❌ | **미구현** — 투표 결과 실시간 반영 안 됨 |

→ DB 레벨에서는 준비되었으나 프론트엔드 구독이 messages만 구현됨.

---

## 5. 미구현 기능 목록

### 기능 레벨
| 기능 | SKILL.md 섹션 | 구현 상태 | 우선순위 |
|---|---|---|---|
| 회의 중 투표 (PollCard) | §4 polls/poll_votes | ❌ 미구현 | 높음 |
| 회의록 내보내기 (SummaryExport) | §5 구조 | ❌ 미구현 | 중간 |
| Notion 양방향 동기화 | §8 | ⚠️ 단방향만 (MeetFlow→Notion) | 중간 |
| meetings/tasks/polls Realtime 구독 | §4, §6 | ❌ 미구현 | 높음 |
| Milo 프리셋별 빈도 설정 상수 | §6 프리셋 | ⚠️ 불완전 | 낮음 |

### 의존성 레벨
| 패키지 | SKILL.md 기재 | 설치 여부 |
|---|---|---|
| framer-motion | ✅ 명시됨 | ❌ 미설치 (Tailwind transition으로 대체) |
| @anthropic-ai/sdk | ✅ 명시됨 | ❌ 미설치 (fetch 직접 호출로 대체) |

→ 두 패키지 모두 대체 구현이 있어 기능적 문제는 없음. 코드 일관성 차원.

---

## 6. 수정 제안 (우선순위순)

### P0: Realtime 구독 확장 — `src/hooks/useRealtimeMessages.js`
meetings, tasks 테이블 구독 추가. 회의 상태 변경/태스크 업데이트가 실시간 반영되도록.

### P1: PollCard 컴포넌트 — `src/components/meeting/PollCard.jsx` 신규
투표 생성 + 실시간 투표 + 결과 시각화. polls/poll_votes 테이블 활용.

### P2: SummaryExport — `src/components/summary/SummaryExport.jsx` 신규
Markdown/PDF 다운로드 버튼. meeting_summaries 데이터 포맷팅.

### P3: Edge Function 프롬프트 통합
`milo-analyze/index.ts`가 `miloPrompts.js`와 동일한 프롬프트를 사용하도록 통일. 모델도 일치시키기.

### P4: Notion 역방향 동기화
Notion webhook → Edge Function → tasks 테이블 업데이트.

---

## 전체 평가

| 영역 | 점수 | 비고 |
|---|---|---|
| 폴더 구조 | 90% | 4개 파일 누락, 네이밍 2건 불일치 |
| DB 스키마 | 100% | SKILL.md 완전 준수 + 확장 |
| AI 시스템 | 85% | 프롬프트 일치, 이중화/프리셋 이슈 |
| Realtime | 20% | 5개 중 1개만 구독 |
| 기능 완성도 | 75% | 핵심 기능 동작, 투표/내보내기 미구현 |
