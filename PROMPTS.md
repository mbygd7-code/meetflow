# MeetFlow — Claude Code 개발 프롬프트 모음

아래 프롬프트를 Claude Code에서 순서대로 실행하면 MeetFlow 서비스를 단계별로 구축할 수 있습니다.
프로젝트 루트에 `CLAUDE.md`가 있어야 디자인 시스템이 자동 적용됩니다.

---

## 🚀 PROMPT 1: 프로젝트 초기 세팅

```
CLAUDE.md를 참고해서 MeetFlow 프로젝트를 처음부터 세팅해줘.

1. Vite로 React 프로젝트 생성
2. 패키지 설치: react-router-dom, @supabase/supabase-js, zustand, lucide-react, framer-motion, date-fns
3. Tailwind CSS 설치 및 설정 — CLAUDE.md의 tailwind.config.js 그대로 적용
4. src/index.css에 CLAUDE.md의 CSS 변수(:root) 전체 정의 + 기본 body 스타일(bg-[#131313], text-white, font-body)
5. Google Fonts에서 Inter 폰트 임포트
6. src/lib/supabase.js — createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
7. vite.config.js에 @ → src alias 설정
8. 폴더 구조 생성: components/(layout, meeting, milo, task, summary, ui), pages/, stores/, hooks/, utils/, lib/
9. .env.local 생성 (키 값은 비워두기)

CLAUDE.md의 디자인 시스템(#131313 배경, 오렌지↔퍼플 그라디언트, 12px 카드 라운딩 등)을 정확히 반영해.
```

---

## 🚀 PROMPT 2: UI 컴포넌트 라이브러리

```
CLAUDE.md의 "컴포넌트 스타일 레퍼런스"를 참고해서 src/components/ui/ 폴더에 재사용 가능한 기본 컴포넌트를 만들어줘.

만들 컴포넌트:

1. Button.jsx
   - variant: primary(솔리드 #723CEB), gradient(오렌지→퍼플 그라디언트), secondary(투명+보더), ghost(텍스트만), danger
   - size: sm(px-4 py-1.5), md(px-6 py-2.5), lg(px-7 py-3)
   - disabled, loading(스피너), icon(왼쪽 아이콘) props

2. Card.jsx
   - bg-[#1A1A1A], border-white/[0.08], rounded-[12px], p-6
   - hover 시 border-white/[0.12]
   - variant: default, gradient(퍼플 그라디언트 배경)
   - className을 외부에서 추가 가능하게

3. Avatar.jsx
   - 이니셜 표시, color prop (배경색)
   - size: sm(32px), md(40px), lg(48px)
   - variant: default, ai (오렌지→퍼플 그라디언트 + shadow-glow)
   - 온라인 상태 인디케이터 옵션 (초록 점)

4. Badge.jsx
   - variant: purple, yellow, success, warning, danger, outline
   - CLAUDE.md의 Tag/Badge 스타일 그대로 적용
   - pill 형태 (rounded-full)

5. Input.jsx
   - bg-[#252525], border-white/[0.08], 포커스 시 퍼플 보더+링
   - label, error, helperText props
   - 아이콘(왼쪽/오른쪽) 지원

6. Modal.jsx
   - 배경: bg-black/60 + backdrop-blur-sm
   - 카드: bg-[#1A1A1A], rounded-[16px], shadow-lg
   - 닫기 버튼 (X 아이콘), ESC로 닫기, 배경 클릭 닫기
   - title, children props

7. MetricCard.jsx
   - 라벨(12px, uppercase, #6B6B6B) + 큰 숫자(32px, 700, white)
   - 변화량 표시 (상승: 초록, 하락: 빨강)
   - variant: default, gradient(퍼플 배경)

Lucide React 아이콘 사용. 모든 컴포넌트에 children이나 className 확장 가능하게.
```

---

## 🚀 PROMPT 3: 레이아웃 + 인증

```
CLAUDE.md의 레이아웃 섹션을 참고해서 인증과 메인 레이아웃을 구현해줘.

1. Supabase Auth (이메일/패스워드):
   - src/stores/authStore.js (Zustand): user, session, loading, signIn, signUp, signOut
   - onAuthStateChange 리스너

2. LoginPage.jsx:
   - 전체 화면 #131313 배경
   - 가운데 카드(bg-[#1A1A1A], rounded-[16px])
   - MeetFlow 로고 + "AI 팀원 Milo와 함께하는 스마트 회의" 서브타이틀
   - 이메일/패스워드 인풋 (CLAUDE.md Input 스타일)
   - 로그인/회원가입 토글
   - CTA 버튼: 그라디언트(오렌지→퍼플) — 이 페이지의 유일한 그라디언트 버튼
   - 배경에 퍼플/오렌지 컬러 블롭 (부드러운 블러 원형 광원, 장식)

3. Layout.jsx (CLAUDE.md의 메인 앱 레이아웃):
   - 좌측 Sidebar (240px, #131313, border-r)
   - 상단 TopBar (64px, border-b)
   - 콘텐츠 영역 (flex-1, overflow-y-auto, p-6)

4. Sidebar.jsx:
   - 상단: MeetFlow 로고
   - 메뉴 (CLAUDE.md nav-item 스타일):
     - 대시보드 (LayoutDashboard)
     - 회의 (MessageSquare)
     - 태스크 (CheckSquare)
     - 회의록 (FileText)
     - 설정 (Settings)
   - active 상태: bg-[rgba(114,60,235,0.12)] + text-white
   - 하단: 유저 아바타 + 이름 + 로그아웃 버튼

5. TopBar.jsx:
   - 좌: 현재 페이지 타이틀 (H4, 22px, 500)
   - 우: 검색 아이콘 + 알림 벨 아이콘 + 유저 아바타

6. React Router v6 라우팅:
   - /login → LoginPage (비인증)
   - / → DashboardPage
   - /meetings → MeetingsPage (빈 페이지)
   - /meetings/:id → MeetingRoomPage (빈 페이지)
   - /tasks → TasksPage (빈 페이지)
   - /summaries → SummariesPage (빈 페이지)
   - /settings → SettingsPage (빈 페이지)
   - 비인증 시 /login 리다이렉트
```

---

## 🚀 PROMPT 4: 회의 CRUD + 로비

```
회의 관리 기능과 로비 화면을 구현해줘.

1. Supabase 마이그레이션 SQL 파일 생성:
   - SKILL.md의 전체 스키마 (users, teams, team_members, meetings, agendas, messages, polls, poll_votes, meeting_summaries, tasks)
   - RLS 정책

2. src/hooks/useMeeting.js:
   - fetchMeetings() — 내 팀의 회의 목록 (scheduled/active/completed)
   - createMeeting({ title, team_id, agendas[] })
   - startMeeting(id) — status → active, started_at 업데이트
   - endMeeting(id) — status → completed, ended_at
   - deleteMeeting(id)

3. MeetingLobby.jsx (pages/MeetingsPage에서 사용):
   - 상단: "회의" H4 타이틀 + 그라디언트 "새 회의" 버튼
   - 탭: 전체 / 진행 중 / 예정 / 완료
   - 회의 카드 그리드 (2~3컬럼):
     - bg-[#1A1A1A] 카드
     - 회의 제목 (16px, 500)
     - 시간 + 어젠다 수 (14px, #A0A0A0)
     - 참여자 아바타 행 (겹치는 스택)
     - Milo 아바타 항상 포함 (그라디언트+글로우)
     - 상태 배지: 진행중(success), 예정(purple), 완료(outline)
     - 진행중 카드: 좌측에 초록 펄스 도트

4. CreateMeetingModal.jsx:
   - 회의 제목 인풋
   - 팀 선택 (셀렉트)
   - 어젠다 리스트: 추가(+ 버튼)/삭제(X)/시간설정(분)
   - 하단: "회의 시작" 그라디언트 버튼 + "예약" 보조 버튼
```

---

## 🚀 PROMPT 5: 실시간 채팅 + 회의 진행

```
MeetFlow의 핵심 — 실시간 회의 진행 화면을 구현해줘.

1. src/hooks/useRealtimeMessages.js:
   - Supabase Realtime channel 구독 (messages 테이블, meeting_id 필터)
   - 기존 메시지 로드 + 새 메시지 실시간 수신
   - sendMessage(content) — messages INSERT

2. MeetingRoom.jsx — CLAUDE.md의 "회의 진행 레이아웃 (3컬럼)":
   좌(200px): ParticipantList — 아바타 + 이름 + 상태(온라인/타이핑/이탈) + 플랫폼 배지(Web/Slack)
   중앙(flex-1): 채팅 영역
   우(320px): AISummaryPanel — 일단 "AI 요약이 여기에 표시됩니다" 플레이스홀더

3. 상단 바 (회의 전용):
   - 회의 제목 + 상태 배지(진행중)
   - 어젠다 탭 바: 현재 어젠다 퍼플 하이라이트, 완료된 건 체크, 나머지 dim
   - 각 어젠다 옆 남은시간 표시
   - "회의 종료" 빨간 버튼

4. ChatArea.jsx:
   - 메시지 리스트 (새 메시지 시 자동 스크롤 to bottom)
   - ChatBubble.jsx:
     - 일반: CLAUDE.md의 bubble-user 스타일 (bg-[#252525], rounded-bl-sm)
     - AI: CLAUDE.md의 bubble-ai 스타일 (퍼플 배경, rounded-br-sm)
     - 발신자 이름(12px, #A0A0A0) + 아바타 + 시간 + 플랫폼 배지
   - MiloMessage.jsx: 퍼플 그라디언트 아바타(글로우) + "AI" 배지 + 퍼플 버블

5. 하단 입력창:
   - bg-[#252525], rounded-full(pill 형태), px-5 py-3
   - placeholder: "의견을 입력하세요... (@Milo로 AI에게 질문)"
   - 우측: 퍼플 전송 버튼 (ArrowUp 아이콘)
   - Enter 전송, Shift+Enter 줄바꿈

Supabase Realtime으로 양방향 실시간 메시지 동기화.
```

---

## 🚀 PROMPT 6: Milo AI 통합

```
SKILL.md와 CLAUDE.md의 Milo AI 시스템을 구현해줘.

1. src/utils/miloPrompts.js:
   - MILO_SYSTEM_PROMPT — SKILL.md의 Milo 시스템 프롬프트 그대로
   - MILO_ANALYZE_PROMPT(messages, agenda) — 최근 대화 분석 + 개입 여부 판단
   - MILO_DECISION_PROMPT(messages, agenda) — 합의/결정 감지 + 태스크 추출
   - MILO_SUMMARY_PROMPT(allMessages, agendas) — 전체 회의 요약 4섹션 구조화

2. src/hooks/useMilo.js:
   - 새 메시지 수신 시 개입 판단:
     a. 프리셋별 maxInterventionsPerAgenda 체크
     b. 사람 턴 수 >= minTurnsBefore
     c. 마지막 Milo 발언 후 cooldownMinutes 경과
     d. @Milo 감지 시 즉시 응답 (쿨다운 무시)
   - triggerMilo() — Edge Function 호출 → Claude API → 응답을 messages INSERT (is_ai: true)

3. Supabase Edge Function: supabase/functions/milo-analyze/index.ts
   - Deno 런타임
   - POST body: { messages, agenda, preset, context }
   - Anthropic SDK로 Claude API 호출 (스트리밍 아님, 짧은 응답)
   - 응답 JSON: { should_respond, response_text, ai_type, suggested_tasks? }

4. AISummaryPanel.jsx (우측 사이드바):
   - 헤더: Milo 아바타(글로우) + "Milo 실시간 요약"
   - 섹션 (자동 업데이트):
     - "결정 사항" (border-l-2 border-[#34D399])
     - "논의 중" (border-l-2 border-[#FFEF63])
     - "보류" (border-l-2 border-[#A0A0A0])
   - 각 항목: 짧은 요약 텍스트 + 관련 메시지 수
   - 하단: "전체 회의록 보기" 링크

5. 회의 종료 시:
   - 전체 메시지 → MILO_SUMMARY_PROMPT → Claude API
   - 결과를 meeting_summaries 테이블에 저장
   - 태스크 자동 추출 → tasks 테이블 INSERT (status: 'todo')
   - MeetingSummary.jsx 페이지에서 조회

Milo 프리셋 (default/coach/analyst/recorder)은 teams.milo_preset에서 읽기.
```

---

## 🚀 PROMPT 7: 태스크 관리

```
태스크 관리 시스템을 구현해줘.

1. src/stores/taskStore.js (Zustand):
   - myTasks[], teamTasks[], loading
   - fetchMyTasks(), fetchTeamTasks(teamId)
   - updateTaskStatus(id, status), updateTask(id, data)
   - Realtime 구독으로 tasks 변경 실시간 반영

2. TasksPage.jsx — 내 태스크 대시보드:
   상단: 4개 MetricCard 그리드
   - 전체 태스크 / 진행 중 / 완료 / 마감 임박(D-3 이내)
   - "마감 임박" 카드는 그라디언트 variant로 강조

   뷰 토글: 리스트 뷰 / 칸반 뷰 (탭)
   필터: 상태, 우선순위, 출처 회의

3. TaskList 뷰:
   - TaskCard: 체크 원형 + 태스크명 + 출처 회의명(#A0A0A0) + 마감일 + 우선순위 배지
   - 마감 D-2 이하: danger 배지 "D-2"
   - 완료: line-through + opacity-50
   - 클릭 시 상세 모달

4. TaskBoard 뷰 (칸반):
   - 3컬럼: To Do / In Progress / Done
   - 각 컬럼: bg-[#1A1A1A] 카드
   - 카드: 태스크명 + 담당자 아바타(sm) + 마감일 + 우선순위 컬러 점
   - 상태 변경: 카드 내 드롭다운 또는 버튼 (드래그앤드롭은 나중)

5. TaskDetailModal:
   - 태스크명 편집 (인라인)
   - 담당자 변경 (아바타 드롭다운)
   - 마감일 변경 (date input)
   - 우선순위 변경 (low/medium/high/urgent 선택)
   - 상태 변경 버튼
   - 출처 회의 링크
   - Milo 제안 태스크면 "AI 추천" 퍼플 배지
```

---

## 🚀 PROMPT 8: Slack 연동

```
Slack 연동을 구현해줘.

1. supabase/functions/slack-events/index.ts:
   - Slack Events API 수신 (URL verification + message.channels + app_mention)
   - 메시지 수신 → teams.slack_channel_id 매칭 → 해당 meeting의 messages에 INSERT (source: 'slack')
   - @Milo 멘션 → milo-analyze Edge Function 호출 → 응답을 Slack 쓰레드에 포스팅

2. supabase/functions/slack-notify/index.ts:
   - 트리거: messages INSERT (source: 'web') → 해당 팀의 Slack 채널 쓰레드에 포스팅
   - 트리거: meetings status → 'active' → Slack 채널에 회의 시작 알림 (어젠다 포함)
   - 트리거: meetings status → 'completed' → Slack에 AI 요약 포스팅
   - 트리거: tasks INSERT → 담당자에게 Slack DM 알림

3. Slash Commands (slack-commands/index.ts):
   - /meetflow start → 새 회의 모달 트리거 → 쓰레드 시작
   - /meetflow tasks → Block Kit 포맷으로 내 태스크 목록 응답
   - /meetflow summary → 마지막 회의 AI 요약 응답

4. SettingsPage.jsx에 Slack 설정 섹션:
   - 팀별 Slack 채널 ID 매핑 인풋
   - 알림 설정 토글: 회의 시작, 회의 종료, 태스크 배정, Milo 요약
```

---

## 🚀 PROMPT 9: Notion 연동

```
Notion 연동을 구현해줘.

1. supabase/functions/notion-sync/index.ts:
   회의 종료 트리거 →
   - Notion API pages.create:
     parent: teams.notion_database_id
     properties: Title(회의 제목), Date(날짜), Status(Completed), Participants
     children blocks:
       heading_2 "결정 사항" + bulleted_list_items
       heading_2 "논의 중" + bulleted_list_items
       heading_2 "보류" + bulleted_list_items
       heading_2 "후속 태스크" + to_do items (태스크명 → 담당자 (마감일))
       heading_2 "Milo 인사이트" + paragraph
   - notion_page_id를 meeting_summaries에 저장

   태스크 생성 트리거 →
   - Notion DB에 row 생성: 태스크명, 담당자, 마감일, 상태, 우선순위, 출처회의
   - notion_block_id를 tasks에 저장

2. Notion → MeetFlow 역동기화:
   - 폴링 방식 (5분 간격) 또는 Notion webhook
   - 태스크 상태 변경 감지 → tasks 테이블 update

3. SettingsPage.jsx에 Notion 설정 섹션:
   - Notion API Key 입력
   - 회의록 저장 Database 선택/입력
   - 태스크 DB 매핑
   - 연결 테스트 버튼
```

---

## 🚀 PROMPT 10: 대시보드 + 팀 분석

```
메인 대시보드와 팀 분석 기능을 구현해줘.

1. DashboardPage.jsx:
   상단 인사말: "안녕하세요, {name}님" (H3) + 오늘 날짜

   메트릭 그리드 (4개):
   - 이번 주 회의 (MetricCard default)
   - 평균 회의 시간 (MetricCard default)
   - 태스크 완수율 (MetricCard gradient — 강조)
   - 결정 실행률 (MetricCard default)

   "오늘의 회의" 섹션:
   - 예정/진행중 회의 카드 (MeetingLobby 카드 재활용)
   - 없으면 "오늘 예정된 회의가 없습니다" 빈 상태

   "마감 임박 태스크" 섹션:
   - 상위 3개 태스크 카드 (TaskCard 재활용)
   - 마감 D-3 이내만 표시, danger 배지

   "최근 회의록" 섹션:
   - 최근 3개 회의 요약 카드 (제목 + 날짜 + 결정 수 + 태스크 수)
   - 클릭 시 /summaries/:id로 이동

   "Milo 인사이트" 카드 (하단):
   - 퍼플 보더 카드 + Milo 아바타
   - 주간 분석 코멘트 예시: "이번 주 회의 시간이 지난주 대비 20% 줄었어요. 결정 실행률도 85%로 높아졌습니다."
   - 이건 정적 데이터로 일단 구현, 나중에 AI 분석 연결

2. 데이터 시각화:
   - 주간 회의 횟수 바 차트 (CSS로 간단 구현 또는 recharts)
   - 차트 컬러: 오렌지→퍼플 그라디언트 바
   - 통계 숫자: 큰 폰트(32px+)로 대담하게
```

---

## 사용 방법

### 1. 파일 배치
```
meetflow/
├── CLAUDE.md                           ← 프로젝트 루트에 배치
├── .claude/
│   └── skills/
│       └── meetflow/
│           └── SKILL.md                ← 스킬 폴더에 배치
└── ...
```

### 2. 실행 순서
1. Claude Code 열기
2. PROMPT 1 붙여넣기 → 프로젝트 생성
3. PROMPT 2~10 순서대로 실행
4. .env.local에 실제 키 입력
5. `npm run dev`

### 3. 팁
- 각 프롬프트는 이전 단계 결과물에 의존하므로 순서 지켜주세요
- 에러 발생 시 "CLAUDE.md 참고해서 고쳐줘"라고 하면 디자인 일관성 유지됨
- 개별 컴포넌트 수정 시 "CLAUDE.md의 Button 스타일 참고해서 수정해줘" 식으로 레퍼런스
