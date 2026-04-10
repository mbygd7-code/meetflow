---
name: meetflow
description: MeetFlow는 AI 팀원 Milo가 참여하는 실시간 텍스트 기반 회의 + 태스크 관리 플랫폼이다. React + Vite + Supabase + Claude API 스택으로 구축한다. 이 스킬은 MeetFlow의 전체 서비스를 개발할 때 사용한다. 회의, 채팅, 태스크, AI 분석, Slack 연동, Notion 연동 등 관련 기능 개발 시 반드시 이 스킬을 참조한다. UI/UX는 CentralFlow CRM 스타일(다크 모드, 오렌지↔퍼플 그라디언트 액센트)을 따른다.
---

# MeetFlow — AI 팀원 Milo와 함께하는 스마트 회의 플랫폼

## 1. 서비스 개요

MeetFlow는 "회의는 짧게, 실행은 빠르게, AI는 똑똑하게"를 모토로 하는 비대면 텍스트 기반 회의 플랫폼이다.

### 핵심 차별점
- **텍스트 기반 회의**: 음성/영상 없이 타이핑으로 동시 의견 제출. 내향적 직원도 동등 참여
- **AI 팀원 Milo**: 회의에 항상 참여하는 AI 동료. 데이터 근거 제시, 사각지대 환기, 논의 교착 중재, 결정 확인
- **자동 정리**: 회의 종료 즉시 AI가 회의록 생성 + 태스크 자동 추출 + 담당자 배정
- **멀티 플랫폼**: MeetFlow 웹 + Slack + Notion 어디서든 참여 가능

### 타겟 사용자
- 10~100명 규모 조직 (스타트업, 교육기관, 원격근무 팀)
- 비개발 직군도 별도 학습 없이 사용 가능한 심플 UX

---

## 2. 기술 스택

```
Frontend:  React 18+ / Vite / Tailwind CSS 3
Backend:   Supabase (Auth, PostgreSQL, Realtime, Edge Functions, Storage)
AI:        Claude API (Anthropic) — 프롬프트 체인, 스트리밍 응답
연동:       Slack Bolt SDK + Slack MCP / Notion API
배포:       Vercel (Frontend) / Supabase Hosting (Backend)
CI/CD:     GitHub Actions
```

### 패키지 의존성
```json
{
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6",
    "@supabase/supabase-js": "^2",
    "@anthropic-ai/sdk": "^0.30",
    "tailwindcss": "^3.4",
    "lucide-react": "latest",
    "date-fns": "^3",
    "zustand": "^4",
    "framer-motion": "^11"
  }
}
```

---

## 3. 디자인 시스템 (CentralFlow CRM 스타일)

> 참고: https://www.behance.net/gallery/208923943/CentralFlow-CRM-Email-SaaS-UI-UX-Design

### 디자인 철학
- 다크 모드 기반의 프리미엄 SaaS 대시보드 스타일
- 미니멀하되, 오렌지↔퍼플 그라디언트 액센트로 생동감 부여
- 넉넉한 여백(whitespace)으로 고급스러운 호흡감 유지
- 깔끔한 카드 기반 레이아웃, 부드러운 라운딩

### 컬러 팔레트
```css
:root {
  /* 배경 */
  --bg-primary: #131313;
  --bg-secondary: #1A1A1A;
  --bg-tertiary: #252525;

  /* 텍스트 */
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0A0;
  --text-muted: #6B6B6B;

  /* 브랜드 */
  --brand-purple: #723CEB;
  --brand-purple-deep: #4C11CE;
  --brand-orange: #FF902F;
  --brand-yellow: #FFEF63;

  /* 그라디언트 */
  --gradient-brand: linear-gradient(135deg, #FF902F 0%, #723CEB 50%, #4C11CE 100%);
  --gradient-warm: linear-gradient(180deg, #723CEB 0%, #FF902F 100%);
  --gradient-card: linear-gradient(135deg, #723CEB 0%, #4C11CE 100%);

  /* 보더 */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-default: rgba(255, 255, 255, 0.12);
  --border-focus: rgba(114, 60, 235, 0.5);

  /* 상태 */
  --status-success: #34D399;
  --status-warning: #FFEF63;
  --status-error: #EF4444;
  --status-info: #723CEB;

  /* 그림자 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(114, 60, 235, 0.3);
}
```

### 그라디언트 사용 규칙
- 브랜드 그라디언트(오렌지→퍼플)는 CTA 버튼, 차트, 강조 카드, 히어로 영역에 사용
- 일반 UI 요소에는 솔리드 컬러(--brand-purple) 사용
- 그라디언트를 과도하게 사용하지 않음 — 페이지당 1~2개 포인트에만 적용

### 타이포그래피
```css
--font-heading: 'Gilroy', 'Inter', sans-serif;
--font-subheading: 'Lufga', 'Inter', sans-serif;
--font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

타입 스케일:
- Display: 60px/700 — 히어로 제목
- H1: 48px/700 — 페이지 제목
- H2: 36px/600 — 섹션 제목
- H3: 28px/600 — 서브 섹션
- H4: 22px/500 — 카드 제목
- Body Large: 18px/400 — 본문
- Body: 16px/400 — 기본 텍스트
- Caption: 14px/400 — 보조 설명
- Small: 12px/500 — 태그, 라벨

### 간격 & 라운딩

Spacing (8px 기반): 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80

Border Radius:
- sm: 8px (버튼, 인풋, 태그)
- md: 12px (카드, 드롭다운)
- lg: 16px (모달, 대형 카드)
- xl: 24px (히어로 카드, 피처 섹션)
- full: 9999px (아바타, 필 태그)

### 주요 컴포넌트 CSS

#### 카드
```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 24px;
  transition: border-color 0.2s ease;
}
.card:hover {
  border-color: var(--border-default);
}
```

#### 버튼
```css
.btn-primary {
  background: var(--brand-purple);
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-weight: 600;
  font-size: 14px;
  transition: opacity 0.2s ease;
}
.btn-primary:hover { opacity: 0.9; }

.btn-gradient {
  background: var(--gradient-brand);
  color: #FFFFFF;
  border: none;
  border-radius: 8px;
  padding: 12px 28px;
  font-weight: 600;
}

.btn-secondary {
  background: transparent;
  color: #FFFFFF;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 10px 24px;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: none;
  padding: 8px 16px;
}
```

#### 인풋
```css
.input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 10px 16px;
  color: #FFFFFF;
  font-size: 14px;
}
.input:focus {
  border-color: var(--border-focus);
  outline: none;
  box-shadow: 0 0 0 3px rgba(114, 60, 235, 0.15);
}
.input::placeholder { color: var(--text-muted); }
```

#### 사이드바 네비게이션
```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  transition: all 0.2s ease;
}
.nav-item:hover {
  background: var(--bg-tertiary);
  color: #FFFFFF;
}
.nav-item.active {
  background: rgba(114, 60, 235, 0.12);
  color: #FFFFFF;
}
```

#### 태그/라벨
```css
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
}
.tag-yellow { background: #FFEF63; color: #131313; }
.tag-purple { background: rgba(114, 60, 235, 0.2); color: #723CEB; }
.tag-outline { background: transparent; border: 1px solid var(--border-default); color: var(--text-secondary); }
```

#### 아바타
```css
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}
.avatar-ai {
  background: var(--gradient-brand);
  color: white;
  box-shadow: var(--shadow-glow);
}
```

#### 채팅 버블
```css
.bubble-user {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: 16px 16px 16px 4px;
  padding: 12px 16px;
  max-width: 75%;
}
.bubble-ai {
  background: rgba(114, 60, 235, 0.1);
  border: 1px solid rgba(114, 60, 235, 0.2);
  border-radius: 16px 16px 4px 16px;
  padding: 12px 16px;
  max-width: 75%;
}
```

#### 메트릭 카드
```css
.metric-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 20px 24px;
}
.metric-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.metric-value {
  font-size: 32px;
  font-weight: 700;
  color: #FFFFFF;
}
```

### 레이아웃 패턴

대시보드 3-패널 구조:
```
┌──────────────┬───────────────────┬──────────────────┐
│   Sidebar    │    Main Content   │   Detail Panel   │
│   (240px)    │    (flex: 1)      │    (400px)       │
└──────────────┴───────────────────┴──────────────────┘
```

### 트랜지션
```css
--transition-fast: 0.15s ease;
--transition-base: 0.2s ease;
--transition-slow: 0.3s ease;
```

### 데이터 시각화
- 차트 컬러: 오렌지→퍼플 그라디언트를 바/도넛 차트에 적용
- 라인 차트: 오렌지(#FF902F) 라인 + 체크포인트 도트
- 통계 숫자: Display 사이즈로 대담하게 표현
- 통계 카드: 그라디언트 배경 카드 위에 큰 숫자 + 설명

### Tailwind 설정
```js
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#131313',
          secondary: '#1A1A1A',
          tertiary: '#252525',
        },
        brand: {
          purple: '#723CEB',
          'purple-deep': '#4C11CE',
          orange: '#FF902F',
          yellow: '#FFEF63',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A0A0A0',
          muted: '#6B6B6B',
        },
        status: {
          success: '#34D399',
          warning: '#FFEF63',
          error: '#EF4444',
          info: '#723CEB',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          default: 'rgba(255, 255, 255, 0.12)',
          focus: 'rgba(114, 60, 235, 0.5)',
        },
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      fontFamily: {
        heading: ['Gilroy', 'Inter', 'sans-serif'],
        sub: ['Lufga', 'Inter', 'sans-serif'],
        body: ['Inter', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
        md: '0 4px 12px rgba(0, 0, 0, 0.4)',
        lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
        glow: '0 0 20px rgba(114, 60, 235, 0.3)',
      },
    },
  },
  plugins: [],
};
```

---

## 4. Supabase 데이터베이스 스키마

```sql
-- 사용자
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT DEFAULT '#723CEB',
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 팀
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slack_channel_id TEXT,
  notion_database_id TEXT,
  milo_preset TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 팀 멤버
CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  PRIMARY KEY (team_id, user_id)
);

-- 회의
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id),
  title TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  created_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 어젠다
CREATE TABLE agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INT DEFAULT 10,
  sort_order INT DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 메시지
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES agendas(id),
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT false,
  ai_type TEXT,
  source TEXT DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 투표
CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  agenda_id UUID REFERENCES agendas(id),
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 투표 응답
CREATE TABLE poll_votes (
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  option_index INT NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);

-- AI 회의록
CREATE TABLE meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  decisions JSONB,
  discussions JSONB,
  deferred JSONB,
  action_items JSONB,
  milo_insights TEXT,
  notion_page_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 태스크
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id),
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  notion_block_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE messages, meetings, tasks, polls, poll_votes;
```

---

## 5. 프로젝트 구조

```
meetflow/
├── public/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── lib/
│   │   ├── supabase.js
│   │   ├── claude.js
│   │   └── constants.js
│   ├── stores/
│   │   ├── authStore.js
│   │   ├── meetingStore.js
│   │   └── taskStore.js
│   ├── hooks/
│   │   ├── useRealtimeMessages.js
│   │   ├── useMeeting.js
│   │   └── useMilo.js
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── TopBar.jsx
│   │   │   └── Layout.jsx
│   │   ├── meeting/
│   │   │   ├── MeetingLobby.jsx
│   │   │   ├── MeetingRoom.jsx
│   │   │   ├── AgendaBar.jsx
│   │   │   ├── ChatArea.jsx
│   │   │   ├── ChatBubble.jsx
│   │   │   ├── AISummaryPanel.jsx
│   │   │   ├── PollCard.jsx
│   │   │   └── ParticipantList.jsx
│   │   ├── milo/
│   │   │   ├── MiloAvatar.jsx
│   │   │   └── MiloMessage.jsx
│   │   ├── task/
│   │   │   ├── TaskDashboard.jsx
│   │   │   ├── TaskCard.jsx
│   │   │   └── TaskBoard.jsx
│   │   ├── summary/
│   │   │   ├── MeetingSummary.jsx
│   │   │   └── SummaryExport.jsx
│   │   └── ui/
│   │       ├── Avatar.jsx
│   │       ├── Badge.jsx
│   │       ├── Button.jsx
│   │       ├── Card.jsx
│   │       ├── Input.jsx
│   │       ├── MetricCard.jsx
│   │       └── Modal.jsx
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── MeetingPage.jsx
│   │   ├── TasksPage.jsx
│   │   ├── SummaryPage.jsx
│   │   └── SettingsPage.jsx
│   └── utils/
│       ├── miloPrompts.js
│       └── formatters.js
├── supabase/
│   ├── migrations/
│   └── functions/
│       ├── milo-analyze/
│       ├── generate-summary/
│       ├── slack-webhook/
│       └── notion-sync/
├── .env.local
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 6. Milo AI 시스템

### 프롬프트 체인 아키텍처
```
메시지 수신 (Supabase Realtime)
  → [1] 패턴 감지 (추측/합의/교착/@호출)
  → [2] 개입 판단 (빈도/타이밍/관련성)
  → [3] Claude API 호출 (응답 생성)
  → [4] 멀티 플랫폼 발송 (DB + Slack)
```

### Milo 시스템 프롬프트
```
당신은 MeetFlow의 AI 팀원 "Milo"입니다.

역할: 회의에 참여하는 조용하지만 날카로운 동료
원칙:
1. 최소 개입 — 필요한 순간에만 한마디
2. 의견이 아닌 정보 — "~라는 데이터가 있어요"
3. 겸손한 톤 — "참고로~", "검토해볼 만합니다"
4. 투명한 출처 — 데이터 인용 시 반드시 출처 명시
5. 침묵도 선택지

개입 시점: 데이터 근거 / 사각지대 / 시간 초과 / 결정 확인 / 용어 설명 / 과거 연결
금지: 특정인 비판, 성과 언급, 결정 강요, 감정적 표현
응답: 한국어, 최대 3-4문장 (@호출 시 5-8문장)
```

### Milo 역할 프리셋
- default (조용한 비서): 어젠다당 2회, 3턴 후, 쿨다운 2분
- coach (퍼실리테이터): 어젠다당 4회, 2턴 후, 쿨다운 1분
- analyst (데이터 분석가): 어젠다당 3회, 3턴 후, 쿨다운 2분
- recorder (기록자): 발언 안 함, 회의 종료 후 요약만

---

## 7. Slack 연동

### 메시지 동기화
```
Slack → Events API → Edge Function → messages INSERT (source:'slack')
  → Supabase Realtime → MeetFlow 웹 수신

MeetFlow → messages INSERT (source:'web')
  → Edge Function → Slack API chat.postMessage
```

### Slash Commands
- /meetflow start — 새 회의 시작
- /meetflow tasks — 내 태스크 목록
- /meetflow summary — 마지막 회의 요약
- @Milo [질문] — AI 데이터 기반 질문

---

## 8. Notion 연동

### 회의록 자동 저장
- 회의 종료 → Notion pages.create
- 결정/논의/보류/액션 4섹션 구조화
- 태스크 → Notion DB row 자동 생성
- 양방향 동기화 (Notion 상태 변경 → MeetFlow 반영)

---

## 9. 개발 순서

### Phase 1: MVP (4주)
프로젝트 세팅 → 인증 → 팀/사용자 → 회의방 → 실시간 채팅 → 어젠다 → Milo 기본 → AI 요약

### Phase 2: 핵심 기능 (4주)
아바타 → 실시간 AI 요약 → Milo 고도화 → 태스크 자동생성 → 투표 → 칸반

### Phase 3: 연동 (4주)
Slack Bot → Notion 회의록 → Notion 태스크 → 팀 분석 → Milo 프리셋 UI

### Phase 4: 고도화 (지속)
모바일 → AI 코치 → 다국어 → 캘린더 → API 오픈

---

## 10. 환경변수

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ANTHROPIC_API_KEY=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
NOTION_API_KEY=
```
