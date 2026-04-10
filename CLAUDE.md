# CLAUDE.md — MeetFlow 프로젝트 가이드

이 파일은 Claude Code가 MeetFlow 프로젝트를 개발할 때 참조하는 시스템 가이드입니다.
모든 코드 생성, UI 구현, 아키텍처 결정 시 이 문서를 따르세요.

---

## 프로젝트 개요

**MeetFlow**는 AI 팀원 Milo가 참여하는 실시간 텍스트 기반 회의 + 태스크 관리 플랫폼입니다.

핵심 기능:
- 텍스트 기반 실시간 회의 (Supabase Realtime)
- AI 팀원 Milo가 회의에 직접 참여 (Claude API)
- 회의 종료 시 AI 자동 요약 + 태스크 추출
- Slack / Notion 연동으로 멀티 플랫폼 참여
- 개인 태스크 대시보드 + 팀 분석

기술 스택: React 18 + Vite + Tailwind CSS 3 + Supabase + Claude API + Zustand

---

## 디자인 시스템 — CentralFlow CRM 스타일

> 모든 UI 컴포넌트는 아래 디자인 시스템을 엄격하게 따릅니다.
> 참고: https://www.behance.net/gallery/208923943/CentralFlow-CRM-Email-SaaS-UI-UX-Design

### 디자인 철학

1. **다크 모드 기본**: 메인 배경 #131313, 카드 #1A1A1A, 서페이스 #252525
2. **오렌지↔퍼플 그라디언트 액센트**: CTA, 차트, 강조 요소에 사용. 페이지당 1~2개만
3. **넉넉한 여백**: 요소 간 충분한 브레싱 룸으로 고급스러운 호흡감
4. **깔끔한 카드 기반**: 부드러운 라운딩(12px), 미세한 보더, 호버 시 보더 밝아짐
5. **미니멀 인터랙션**: 0.2s ease 트랜지션, 과도한 애니메이션 금지

### 컬러 팔레트

```css
:root {
  /* ── 배경 ── */
  --bg-primary: #131313;
  --bg-secondary: #1A1A1A;
  --bg-tertiary: #252525;

  /* ── 텍스트 ── */
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0A0;
  --text-muted: #6B6B6B;

  /* ── 브랜드 ── */
  --brand-purple: #723CEB;
  --brand-purple-deep: #4C11CE;
  --brand-orange: #FF902F;
  --brand-yellow: #FFEF63;

  /* ── 그라디언트 ── */
  --gradient-brand: linear-gradient(135deg, #FF902F 0%, #723CEB 50%, #4C11CE 100%);
  --gradient-warm: linear-gradient(180deg, #723CEB 0%, #FF902F 100%);
  --gradient-card: linear-gradient(135deg, #723CEB 0%, #4C11CE 100%);

  /* ── 보더 ── */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-default: rgba(255, 255, 255, 0.12);
  --border-focus: rgba(114, 60, 235, 0.5);

  /* ── 상태 컬러 ── */
  --status-success: #34D399;
  --status-warning: #FFEF63;
  --status-error: #EF4444;
  --status-info: #723CEB;

  /* ── 그림자 ── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(114, 60, 235, 0.3);

  /* ── 트랜지션 ── */
  --transition-fast: 0.15s ease;
  --transition-base: 0.2s ease;
  --transition-slow: 0.3s ease;
}
```

### 그라디언트 사용 규칙

| 사용처 | 스타일 |
|--------|--------|
| CTA 버튼 (핵심 1개) | `var(--gradient-brand)` |
| Milo AI 아바타 | `var(--gradient-brand)` + `box-shadow: var(--shadow-glow)` |
| 강조 메트릭 카드 | `var(--gradient-card)` |
| 차트/데이터 시각화 | 오렌지→퍼플 그라디언트 |
| 일반 버튼 | 솔리드 `var(--brand-purple)` (그라디언트 아님) |
| 일반 UI | 솔리드 컬러만 |

### 타이포그래피

```
폰트:
  헤딩: Gilroy → Inter fallback
  서브헤딩: Lufga → Inter fallback
  본문: Inter → system sans-serif

타입 스케일:
  Display:     60px / 700 / 1.1    히어로 제목
  H1:          48px / 700 / 1.15   페이지 제목
  H2:          36px / 600 / 1.2    섹션 제목
  H3:          28px / 600 / 1.3    서브 섹션
  H4:          22px / 500 / 1.4    카드 제목
  Body Large:  18px / 400 / 1.6    본문
  Body:        16px / 400 / 1.6    기본 텍스트
  Caption:     14px / 400 / 1.5    보조 설명
  Small:       12px / 500 / 1.4    태그, 라벨
```

### 간격 (8px grid)

4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80

### Border Radius

| 토큰 | 값 | 사용처 |
|------|-----|--------|
| sm | 8px | 버튼, 인풋, 태그 |
| md | 12px | 카드, 드롭다운 |
| lg | 16px | 모달, 대형 카드 |
| xl | 24px | 히어로 카드 |
| full | 9999px | 아바타, 필(pill) |

---

## 컴포넌트 스타일 레퍼런스

### Card
```jsx
// Tailwind 예시
<div className="bg-[#1A1A1A] border border-white/[0.08] rounded-[12px] p-6
  hover:border-white/[0.12] transition-colors duration-200">
  {children}
</div>
```

### Button — Primary
```jsx
<button className="bg-[#723CEB] text-white font-semibold text-sm
  px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity duration-200">
  {label}
</button>
```

### Button — Gradient (핵심 CTA만)
```jsx
<button className="bg-gradient-to-r from-[#FF902F] via-[#723CEB] to-[#4C11CE]
  text-white font-semibold px-7 py-3 rounded-lg">
  {label}
</button>
```

### Button — Secondary
```jsx
<button className="bg-transparent text-white border border-white/[0.12]
  px-6 py-2.5 rounded-lg hover:border-white/[0.15] transition-colors duration-200">
  {label}
</button>
```

### Input
```jsx
<input className="w-full bg-[#252525] border border-white/[0.08] rounded-lg
  px-4 py-2.5 text-white text-sm placeholder-[#6B6B6B]
  focus:border-[rgba(114,60,235,0.5)] focus:ring-[3px] focus:ring-[rgba(114,60,235,0.15)]
  focus:outline-none transition-colors duration-200" />
```

### Sidebar Nav Item
```jsx
<button className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm w-full
  transition-all duration-200
  ${active
    ? 'bg-[rgba(114,60,235,0.12)] text-white'
    : 'text-[#A0A0A0] hover:bg-[#252525] hover:text-white'
  }`}>
  <Icon size={18} />
  <span>{label}</span>
</button>
```

### Avatar — 일반
```jsx
<div className="w-10 h-10 rounded-full flex items-center justify-center
  text-sm font-semibold" style={{ backgroundColor: color }}>
  {initials}
</div>
```

### Avatar — Milo AI (글로우 효과)
```jsx
<div className="w-10 h-10 rounded-full flex items-center justify-center
  text-sm font-bold text-white shadow-[0_0_20px_rgba(114,60,235,0.3)]
  bg-gradient-to-br from-[#FF902F] via-[#723CEB] to-[#4C11CE]">
  M
</div>
```

### Chat Bubble — 일반 사용자
```jsx
<div className="bg-[#252525] border border-white/[0.08] rounded-2xl rounded-bl-sm
  px-4 py-3 max-w-[75%] text-sm text-white">
  {content}
</div>
```

### Chat Bubble — Milo AI
```jsx
<div className="bg-[rgba(114,60,235,0.1)] border border-[rgba(114,60,235,0.2)]
  rounded-2xl rounded-br-sm px-4 py-3 max-w-[75%] text-sm text-white">
  {content}
</div>
```

### Badge / Tag
```jsx
// 퍼플
<span className="px-3 py-1 rounded-full text-xs font-semibold
  bg-[rgba(114,60,235,0.2)] text-[#723CEB]">진행 중</span>

// 옐로우
<span className="px-3 py-1 rounded-full text-xs font-semibold
  bg-[#FFEF63] text-[#131313]">신규</span>

// 성공
<span className="px-3 py-1 rounded-full text-xs font-semibold
  bg-[rgba(52,211,153,0.15)] text-[#34D399]">완료</span>

// 위험
<span className="px-3 py-1 rounded-full text-xs font-semibold
  bg-[rgba(239,68,68,0.15)] text-[#EF4444]">마감 임박</span>

// 아웃라인
<span className="px-3 py-1 rounded-full text-xs font-semibold
  border border-white/[0.12] text-[#A0A0A0]">via Slack</span>
```

### Metric Card
```jsx
<div className="bg-[#1A1A1A] border border-white/[0.08] rounded-[12px] p-5">
  <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-2">{label}</p>
  <p className="text-[32px] font-bold text-white">{value}</p>
  {change && <p className="text-sm text-[#34D399] mt-1">{change}</p>}
</div>
```

### Metric Card — 그라디언트 (강조)
```jsx
<div className="bg-gradient-to-br from-[#723CEB] to-[#4C11CE] rounded-[12px] p-5">
  <p className="text-xs text-white/60 uppercase tracking-wider mb-2">{label}</p>
  <p className="text-[32px] font-bold text-white">{value}</p>
</div>
```

### Modal
```jsx
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
  <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-[16px]
    p-8 max-w-lg w-full mx-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
    {children}
  </div>
</div>
```

---

## 레이아웃

### 메인 앱 레이아웃
```jsx
<div className="flex h-screen bg-[#131313]">
  {/* Sidebar — 240px */}
  <aside className="w-60 bg-[#131313] border-r border-white/[0.08] flex flex-col p-3">
    {/* 로고 */}
    {/* 네비게이션 */}
    {/* 하단 유저 정보 */}
  </aside>

  {/* 메인 콘텐츠 */}
  <main className="flex-1 flex flex-col overflow-hidden">
    {/* TopBar */}
    <header className="h-16 border-b border-white/[0.08] flex items-center px-6">
      {/* 페이지 타이틀 + 우측 액션 */}
    </header>

    {/* 콘텐츠 영역 */}
    <div className="flex-1 overflow-y-auto p-6">
      {children}
    </div>
  </main>
</div>
```

### 회의 진행 레이아웃 (3컬럼)
```jsx
<div className="flex flex-1 overflow-hidden">
  {/* 참여자 패널 — 200px */}
  <aside className="w-[200px] border-r border-white/[0.08] p-4">
    {/* 참여자 아바타 + 상태 */}
  </aside>

  {/* 채팅 영역 — flex-1 */}
  <div className="flex-1 flex flex-col">
    {/* 어젠다 바 */}
    {/* 메시지 리스트 */}
    {/* 입력창 */}
  </div>

  {/* AI 요약 패널 — 320px */}
  <aside className="w-80 border-l border-white/[0.08] p-4">
    {/* Milo 실시간 요약 */}
  </aside>
</div>
```

---

## Tailwind 설정

```js
// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#131313', secondary: '#1A1A1A', tertiary: '#252525' },
        brand: { purple: '#723CEB', 'purple-deep': '#4C11CE', orange: '#FF902F', yellow: '#FFEF63' },
        txt: { primary: '#FFFFFF', secondary: '#A0A0A0', muted: '#6B6B6B' },
        status: { success: '#34D399', warning: '#FFEF63', error: '#EF4444', info: '#723CEB' },
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
      fontFamily: {
        heading: ['Gilroy', 'Inter', 'sans-serif'],
        sub: ['Lufga', 'Inter', 'sans-serif'],
        body: ['Inter', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.3)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 8px 32px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(114,60,235,0.3)',
      },
    },
  },
  plugins: [],
};
```

---

## 코드 컨벤션

1. **파일명**: PascalCase 컴포넌트 (MeetingRoom.jsx), camelCase 훅/유틸 (useMeeting.js)
2. **컴포넌트**: 함수형 컴포넌트 + Hooks. forwardRef 필요 시 적용
3. **상태관리**: Zustand 스토어 (authStore, meetingStore, taskStore)
4. **API**: Supabase JS SDK 직접 호출. Edge Functions는 Deno 런타임
5. **아이콘**: Lucide React (라인 스타일, size={18} 기본)
6. **애니메이션**: Tailwind transition 우선. 복잡한 건 Framer Motion
7. **다크 모드**: 기본값. 라이트 모드 대응 시 배경 #FFFFFF, 카드 #F5F5F5, 텍스트 #131313
8. **반응형**: 모바일(< 768px)에서 사이드바 드로어, 상세 패널 오버레이

---

## Milo AI 시스템

### 행동 원칙
1. 최소 개입 — 어젠다당 최대 2~3회, 사람 3턴 이후
2. 의견이 아닌 정보 — "~라는 데이터가 있어요"
3. 겸손한 톤 — "참고로~", "검토해볼 만합니다"
4. @호출 시 적극적 — 직접 호출하면 상세 분석 응답
5. 침묵도 선택지 — 필요 없으면 안 말함

### 개입 시점
- 추측 발언 → 데이터 근거 제시
- 빠진 관점 → 사각지대 환기
- 시간 초과 → 요약 + 결정 방법 제안
- 합의 감지 → 정리 + 태스크화 제안
- 전문 용어 → 간단 설명
- 과거 동일 주제 → 이전 결정 연결

### 프리셋
- default: 조용한 비서 (2회/어젠다)
- coach: 적극적 퍼실리테이터 (4회/어젠다)
- analyst: 데이터 분석가 (3회/어젠다)
- recorder: 기록자 (발언 0, 종료 후 요약만)

---

## 데이터베이스 (Supabase)

주요 테이블: users, teams, team_members, meetings, agendas, messages, polls, poll_votes, meeting_summaries, tasks

Realtime 활성화: messages, meetings, tasks, polls, poll_votes

RLS: 같은 팀 멤버만 데이터 접근 가능

---

## 환경변수

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ANTHROPIC_API_KEY=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
NOTION_API_KEY=
```

---

## 참조 파일

- `.claude/skills/meetflow/SKILL.md` — 전체 스키마, Milo 프롬프트, 연동 상세
- 디자인 참고: https://www.behance.net/gallery/208923943/CentralFlow-CRM-Email-SaaS-UI-UX-Design
