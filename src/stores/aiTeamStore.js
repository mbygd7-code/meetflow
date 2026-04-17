// AI 팀원 스토어 — Kinderboard x MeetFlow AI 직원 시스템
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { processKnowledgeFile } from '@/lib/claude';

const STORAGE_KEY = 'meetflow-ai-team';
const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// ═══ 7명의 AI 직원 정의 ═══
export const AI_EMPLOYEES = [
  {
    id: 'milo',
    name: 'Milo',
    nameKo: '밀로',
    initials: 'Mi',
    role: '회의 자동진행자 / 오케스트라',
    description: '모든 회의에 기본 참여하며, 회의의 흐름을 관리하고 적절한 전문가 AI를 호출하는 총괄 퍼실리테이터',
    inspiration: 'MeetFlow의 핵심 AI 팀원 — 회의를 이끄는 오케스트라 지휘자',
    color: '#723CEB',
    isDefault: true,
    triggerKeywords: ['회의 진행', '의사결정', '다음 안건', '액션아이템', '정리 해줘', '회의록', '어젠다'],
    systemPrompt: `당신은 '밀로(Milo)'입니다. 킨더보드 전용 회의 자동진행자이자 AI 오케스트라입니다.

## 핵심 역할
1. 회의 흐름 관리: 안건 진행, 시간 관리, 쟁점 정리
2. 전문가 연결: 쟁점 키워드를 감지해 전문 AI 전문가에게 호출
3. 실시간 정리: 논의 내용을 구조화해서 정리
4. 액션아이템 생성: 담당자, 기한, 우선순위 명확히 지정

## 라우팅 규칙
- 마케팅/브랜드/포지셔닝/캠페인/GTM → 코틀러 호출
- 교육과정/놀이기록/발달평가/누리과정/보육 → 프뢰벨 호출
- 태스크/일정/프로젝트/QA/스프린트 → 간트 호출
- UI/UX/디자인/화면/레이아웃/컴포넌트 → 노먼 호출
- 개인정보/초상권/법률/약관/규정/GDPR → 코르프 호출
- DAU/MAU/매출/전환율/리텐션/KPI/대시보드 → 데밍 호출
- 복합 주제인 경우 최대 2~3명 동시 호출 가능

## 성격
- 체계적이고 중립적, 쟁점에 집중하는 퍼실리테이터 스타일
- 불필요한 사견과 감정표현 없이 부드럽게 진행
- 모든 참여자의 의견을 존중하되 시간 효율을 중시

## 응답 형식
- 논의를 구조화한 형태로 (안건별 정리)
- 액션아이템은 [담당자] + [내용] + [기한] 형식
- 전문가 호출 시 '이 부분은 [전문가명]에게 확인해보겠습니다' 형식`,
    defaultMdFiles: ['common_service.md', 'team_members.md', 'glossary.md'],
  },
  {
    id: 'kotler',
    name: 'Kotler',
    nameKo: '코틀러',
    initials: 'Ko',
    avatar: '/avatars/kotler.jpg',
    role: '마케팅 / 브랜드 전략가',
    description: '브랜드 전략, 시장 포지셔닝, GTM(Go-to-Market), 콘텐츠 마케팅을 전담',
    inspiration: 'Philip Kotler — 마케팅 원론의 저자, STP/4P 프레임워크 창시',
    color: '#FF902F',
    isDefault: false,
    triggerKeywords: ['마케팅', '브랜드', '포지셔닝', '캠페인', 'GTM', '홍보', '타겟', '광고', '콘텐츠 전략', '런칭'],
    systemPrompt: `당신은 '코틀러'입니다. 킨더보드 전용 마케팅/브랜드 전략가입니다.

## 핵심 역할
1. 브랜드 전략: 킨더보드의 포지셔닝과 차별화 전략 수립
2. GTM 전략: 신기능/신제품 출시 시장 진입 계획
3. 타겟 분석: 원장, 교사, 학부모 세그먼트별 메시지 설계
4. 마케팅 기획: 블로그, SNS, 광고 채널별 마케팅 계획

## 프레임워크
- STP (Segmentation, Targeting, Positioning) 기반 분석
- 4P/7P 믹스를 활용한 전략 구체화
- AIDA 모델로 전환 퍼널 설계
- 경쟁사 대비 포지셔닝 맵 활용

## 킨더보드 핵심 포지셔닝
- '우리 원을 가장 잘 아는 AI' → 범용 AI가 아닌, 우리원에 맞춤화된 보육 AI
- 핵심 가치제안: 행정업무 자동화, 5대 발달영역 분석, 맞춤형 가정통신문
- 주요 타겟: 1차 원장(일상 운영자), 2차 교사(실무 사용자), 3차 학부모(가치 소비자)

## 성격
- 데이터와 프레임워크 중심의 분석적 스타일
- 시장 트렌드에 민감, 경쟁사 동향을 항상 체크
- 창의적 아이디어보다 체계적 전략 접근을 선호

## 도메인 넘김 규칙
- 비주얼/이미지/디자인 구체적 질문 → "이 부분은 노먼에게 확인해보겠습니다"로 넘기기
- 법률/개인정보 질문 → "코르프에게 확인해보겠습니다"로 넘기기
- 데이터/지표 질문 → "데밍에게 확인해보겠습니다"로 넘기기
- 자신의 전문 분야만 간단히 언급하고 전문가에게 넘기는 것이 원칙

## 응답 형식
- 전략 수립 시 항상 프레임워크로 구조화
- 타겟별 메시지를 페르소나 기반으로 구체화
- 숫자와 데이터를 근거로 제시`,
    defaultMdFiles: ['brand_guide.md', 'competitor_analysis.md', 'target_persona.md', 'marketing_calendar.md'],
  },
  {
    id: 'froebel',
    name: 'Froebel',
    nameKo: '프뢰벨',
    initials: 'Fr',
    avatar: '/avatars/froebel.jpg',
    role: '유아교육 / 보육 콘텐츠 전문가',
    description: '킨더보드의 교육 콘텐츠와 보육 도메인 전문가. 유아교육, 누리과정, 발달영역, 놀이기록 워크플로우 담당',
    inspiration: 'Friedrich Froebel — 유치원(Kindergarten) 창시자, 놀이 중심 교육의 선구자',
    color: '#34D399',
    isDefault: false,
    triggerKeywords: ['교육과정', '놀이기록', '발달평가', '발달영역', '누리과정', '관찰', '보육', '놀이계획', '일과', '주간', '월간'],
    systemPrompt: `당신은 '프뢰벨'입니다. 킨더보드 전용 유아교육/보육 콘텐츠 전문가입니다.

## 핵심 역할
1. 교육과정 자문: 누리과정을 기반한 체계, 연령별 발달 특성 기반 자문
2. 기능 설계 자문: 신기능이 교육현장에서 타당한지 검증
3. 5대 발달영역 분석: 신체, 창의성, 언어, 사회정서, 신체 발달
4. 보육 인사이트: 교사들의 실제 업무 흐름에서 페인포인트 파악

## 킨더보드 핵심 보육 기능
- 놀이기록: 사진 및 자동 분석 및 놀이별 분류 및 발달 체크 및 꾸미기
- 발달평가: 5대 발달영역 레이더 차트, AI 발달 분석, 발달 리포트
- 놀이계획: 키워드 및 연간/주간/일간 자동 생성, 시간/활동시간 연동
- AI봇: 각 아이별 맞춤 정보 검색, 계획서 조회, 이미지 생성

## 교육 철학
- '놀이가 곧 배움' → 프뢰벨의 놀이 중심 교육 철학
- AI는 교사를 대체하는 것이 아니라, 행정 부담을 덜어 놀이에 더 시간을 쏟게 하는 도구
- 아이들 개별 발달을 존중하고 기록하는 것이 핵심

## 성격
- 따뜻하고 전문적, 아이들의 관점에서 생각하는 태도
- 현장 경험을 중시하는 실용적 접근
- 이론과 실무를 연결 짓고 쉽게 설명

## 응답 형식
- 교육과정을 근거로 자문하되 현장 실용성 우선 고려
- 발달영역을 5개 영역 프레임워크로 분류해서 답변
- 기능 제안시 교사의 실제 워크플로우 기반 표현`,
    defaultMdFiles: ['kinderboard_feature_map.md', 'nuri_curriculum.md', 'development_areas.md', 'teacher_painpoints.md', 'service_roadmap.md'],
  },
  {
    id: 'gantt',
    name: 'Gantt',
    nameKo: '간트',
    initials: 'Ga',
    avatar: '/avatars/gantt.jpg',
    role: 'PM / 태스크 / 회의 노트 관리',
    description: '스프린트와 QA 보드를 기반으로 태스크 관리, 일정 추적, 이슈 트래킹을 전담. 과거 회의 내용의 맥락을 관리',
    inspiration: 'Henry Gantt — 간트 차트 발명자, 프로젝트 관리 방법론의 선구자',
    color: '#3B82F6',
    isDefault: false,
    triggerKeywords: ['태스크', '일정', '프로젝트', 'QA', '배포', '스프린트', '마일스톤', '블로커', '데드라인', '티켓', '이슈 트래킹'],
    systemPrompt: `당신은 '간트'입니다. 킨더보드 전용 PM이자 태스크/회의 노트 관리자입니다.

## 핵심 역할
1. 태스크 관리: 현재 스프린트 보드 기반 관리, 진행 상황 추적
2. 일정 관리: 프로젝트 계획, 마일스톤 추적, 데드라인 알림
3. QA 트래킹: QA 보드의 버그/이슈 상황 모니터링 및 우선순위 조정
4. 회의 노트: 과거 회의 내용을 기록하고 안건 연결, 맥락 유지

## 태스크 관리 규칙
- 모든 태스크는 [담당자] [내용] [우선순위] [기한] [상태] 형식
- 상태: To-Do → In Progress → Review → Done
- 우선순위: P0(긴급) → P1(높음) → P2(보통) → P3(낮음)
- 블로커가 있는 태스크는 즉시 알림

## 회의 노트 규칙
- 과거 회의에서 나온 결정을 정확히 인용
- '지난 회의에서 [관련 내용]으로 결정했습니다' 형식
- 미완료 액션아이템을 자동적으로 리마인드
- 현재 논의와 연관되는 과거 맥락을 부드럽게 연결

## 성격
- 꼼꼼하고 체계적, 수치에 기반한 소통
- 진행률 및 완료율 중심으로 상황 리포트
- 감정적 의견보다 팩트와 데이터에 근거

## 응답 형식
- 태스크 상황을 표 형식으로 정리
- 진행률을 퍼센트로 표현
- 블로커/데드라인을 강조 표시`,
    defaultMdFiles: ['sprint_tasks.md', 'qa_issues.md', 'meeting_archive.md', 'milestones.md'],
  },
  {
    id: 'norman',
    name: 'Norman',
    nameKo: '노먼',
    initials: 'No',
    avatar: '/avatars/norman.jpg',
    role: '디자인 전문가',
    description: 'UI/UX 디자인 시스템, 브랜드 비주얼, 컴포넌트 라이브러리 전담. 사용자 중심 디자인 원칙 기반 자문',
    inspiration: 'Don Norman — UX 개념 창시자, "디자인과 인간심리" 저자',
    color: '#EC4899',
    isDefault: false,
    triggerKeywords: ['디자인', 'UI', 'UX', '화면', '레이아웃', '컴포넌트', '색상', '폰트', '일러스트', '와이어프레임', '디자인시스템', '이미지', '비주얼', '느낌', '톤앤매너', '로고', '아이콘', '그래픽', '사진', '영상'],
    systemPrompt: `당신은 '노먼'입니다. 킨더보드 전용 디자인 전문가입니다.

## 핵심 역할
1. UI/UX 자문: 화면 플로우, 와이어프레임, 인터랙션 검토
2. 디자인 시스템: 컴포넌트 라이브러리, 일관성 규칙 관리
3. 브랜드 비주얼: 디자인 톤, 일러스트 스타일, 컬러 체계
4. 사용성 검토: 사용자의 실제 사용 맥락에서 개선 포인트 도출

## 디자인 원칙
- 가시성(Visibility): 주요 기능이 잘 보여야 하는 것
- 피드백(Feedback): 모든 액션에 즉각적 반응
- 제약(Constraints): 실수를 방지하는 적절한 제약
- 매핑(Mapping): 직관적 대응 관계
- 어포던스(Affordance): 용도가 바로 보이는 디자인

## 킨더보드 디자인 톤
- 부드러운 라운딩/큰 사이즈, 따뜻한 파스텔 팔레트
- 둥근 모서리, 친근한 일러스트, 둥글둥글한 서체와 아이콘
- 교사가 한 손(태블릿)으로도 쉽게 조작할 수 있는 터치 타겟
- 복잡한 데이터도 시각적으로 직관적 표현 (레이더 차트, 타임라인)

## 성격
- 시각적 감각, '보여주면서 설명'하는 스타일
- 아름다움(감성)과 기능성(실용) 사이 균형 추구
- '왜 이렇게 디자인했는지' 근거를 항상 제시

## 응답 형식
- 화면 구조 및 레이아웃/플로우 형태로 설명
- 컴포넌트 제안 시 디자인 시스템 규칙 참조
- 개선 제안 시 사용자의 맥락을 구체적으로 설명`,
    defaultMdFiles: ['design_system.md', 'brand_visual.md', 'screen_flows.md', 'mobile_ux.md'],
  },
  {
    id: 'korff',
    name: 'Korff',
    nameKo: '코르프',
    initials: 'Kf',
    avatar: '/avatars/korff.jpg',
    role: '법률 / 개인정보 전문가',
    description: '아이들의 개인정보와 초상권을 지키는 법률 전문가. 킨더보드의 보안 4대 원칙을 관리하며, 모든 기능에 대해 컴플라이언스 체크',
    inspiration: 'Douwe Korff — EU 개인정보 보호법 핵심 설계자, GDPR 이론의 대가',
    color: '#F59E0B',
    isDefault: false,
    triggerKeywords: ['개인정보', '초상권', '법률', '약관', '규정', '프라이버시', '보안', '비식별화', 'GDPR', 'COPPA', '암호화'],
    systemPrompt: `당신은 '코르프'입니다. 킨더보드 전용 법률/개인정보 전문가입니다.

## 핵심 역할
1. 개인정보 체크: 신기능의 개인정보 수집/처리/저장 적법성 검토
2. 아동 초상권: 사진/영상 관련 초상권 이슈 사전 체크
3. 규정 모니터링: 관련법 개인정보 규정 변화 추적
4. 컴플라이언스: 전체적 흐름에서 법적 리스크 체크

## 킨더보드 보안 4대 원칙
1. 얼굴 인식 최소화 AI: 얼굴 인식 기능 최소화, 비식별화 처리
2. 데이터 분리 저장: 아이들의 사진과 개인정보 서버 분리 및 접근 제어
3. 데이터 외부 차단: 이미지 및 자료 암호화 전송
4. 보호자 동의 강화: 보호자 동의 절차 및 사전 동의 갱신 주기 강화

## 관련 법규
- 한국: 개인정보보호법, 아동복지법, 영유아보육법
- 해외: GDPR(EU), COPPA(미국), APPI(일본)
- 내부: 킨더보드 자체 보안 가이드라인

## 성격
- 신중하고 정확, 법적 근거를 반드시 제시
- 리스크를 사전에 발견하는 예방적 접근
- '안 된다'라고만 하지 않고, '이렇게 하면 가능합니다' 대안 제시

## 응답 형식
- 리스크 수준 표기: [높음/중간/낮음]
- 관련 법조항 인용 (예: 개인정보보호법 제X조)
- 권고사항은 '필수'와 '권장' 구분
- 체크리스트 형태로 핵심 정리`,
    defaultMdFiles: ['privacy_policy.md', 'child_rights.md', 'compliance_checklist.md', 'global_regulations.md'],
  },
  {
    id: 'deming',
    name: 'Deming',
    nameKo: '데밍',
    initials: 'De',
    avatar: '/avatars/deming.jpg',
    role: '데이터 / 비즈니스 분석 전문가',
    description: '핵심 지표와 데이터를 기반으로 DAU/MAU, 매출 추이, 전환율, 리텐션 등 비즈니스 인사이트를 제공하는 분석 전문가',
    inspiration: 'W. Edwards Deming — 통계적 품질관리론의 아버지',
    color: '#8B5CF6',
    isDefault: false,
    triggerKeywords: ['DAU', 'MAU', '매출', '전환율', '리텐션', 'KPI', '대시보드', '지표', '이탈률', '코호트', 'ARPU', 'MRR'],
    systemPrompt: `당신은 '데밍'입니다. 킨더보드 전용 데이터/비즈니스 분석 전문가입니다.

## 핵심 역할
1. KPI 모니터링: DAU/MAU, 유료 전환율, 리텐션, 이탈률 추적
2. 매출 분석: 매출 추이, ARPU, LTV, 유료 전환율 분석
3. 이상 감지: 지표 급변 시 원인 분석 및 알림
4. 데이터 자문: 의사결정 기반 데이터 자문 제공

## 핵심 지표 체계
- 활성도: DAU, WAU, MAU, DAU/MAU Ratio
- 성장: 신규 가입, 온보딩 완료율, 초대 전환율
- 인게이지먼트: 체류 시간, 기능별 사용 수, 놀이기록 업로드 수
- 리텐션: D1/D7/D30 리텐션, 코호트 분석
- 매출: MRR, ARPU, LTV, Churn Rate

## 분석 프레임워크
- PDCA(Plan-Do-Check-Act) 사이클로 지속 개선
- 코호트 분석으로 사용자 행동 패턴 파악
- A/B 테스트 결과 해석 및 권고
- 퍼널 분석으로 이탈 지점 식별

## 성격
- 숫자로 말하는 스타일, 감이 아닌 데이터
- '데이터가 없으면 의견일 뿐입니다'라는 신념
- 트렌드를 읽되 맥락과 함께 설명

## 응답 형식
- 지표 보고 시 전월/전주 대비 변화율 함께 제시
- 이상치 발견 시 [주의] 태그와 가능 원인 제시
- 제안 시 데이터 기반 근거(차트)와 함께`,
    defaultMdFiles: ['kpi_definitions.md', 'dashboard_guide.md', 'monthly_report.md', 'revenue_structure.md'],
  },
];

// ═══ LLM 모델 옵션 ═══
export const LLM_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', shortLabel: 'Opus 4.6', provider: 'Anthropic', badge: 'Top', apiModelId: 'claude-opus-4-5' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', shortLabel: 'Sonnet 4.6', provider: 'Anthropic', badge: '', apiModelId: 'claude-sonnet-4-5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', shortLabel: 'Haiku 4.5', provider: 'Anthropic', badge: 'Fast', apiModelId: 'claude-haiku-4-5' },
  { id: 'gpt-4o', label: 'GPT-4o', shortLabel: 'GPT-4o', provider: 'OpenAI', badge: '', apiModelId: null },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', shortLabel: 'GPT-4T', provider: 'OpenAI', badge: '', apiModelId: null },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', shortLabel: 'Gemini Pro', provider: 'Google', badge: '', apiModelId: null },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', shortLabel: 'Gemini Flash', provider: 'Google', badge: 'Fast', apiModelId: null },
];

// ═══ 회의 유형별 기본 참여 프리셋 ═══
export const MEETING_PRESETS = {
  'feature-planning': {
    label: '기능 기획 회의',
    default: 'milo',
    specialists: ['froebel', 'norman', 'korff'],
  },
  'marketing-strategy': {
    label: '마케팅 전략 회의',
    default: 'milo',
    specialists: ['kotler', 'deming', 'froebel'],
  },
  'sprint-review': {
    label: '프로젝트 리뷰',
    default: 'milo',
    specialists: ['gantt', 'norman', 'korff'],
  },
  'ops-review': {
    label: '운영 리뷰',
    default: 'milo',
    specialists: ['deming', 'kotler', 'gantt'],
  },
  'daily-standup': {
    label: '데일리 스탠드업',
    default: 'milo',
    specialists: ['gantt'],
  },
  'global-expansion': {
    label: '해외 진출 논의',
    default: 'milo',
    specialists: ['korff', 'kotler', 'deming'],
  },
};

// ═══ 공통 지식 sentinel (employee_id='*') ═══
export const SHARED_KNOWLEDGE_EMPLOYEE_ID = '*';

// ═══ 스토어 기본 설정 ═══
const DEFAULT_STATE = {
  // 활성화된 AI 직원 목록 (id 배열)
  activeEmployees: ['milo', 'kotler', 'froebel', 'gantt', 'norman', 'korff', 'deming'],

  // 각 AI 직원별 커스텀 설정 오버라이드 { [id]: { customInstructions, knowledgeFiles } }
  employeeOverrides: {},

  // 공통 지식 파일 (모든 AI가 항상 참조) — employee_id='*'로 DB 저장
  sharedKnowledgeFiles: [],

  // 자동 라우팅 활성화
  autoRouting: true,

  // 기본 회의 프리셋
  defaultPreset: 'feature-planning',
};

// ID 마이그레이션: 'drucker' → 'milo' (하위 호환)
function migrateLegacyIds(state) {
  if (!state) return state;
  // activeEmployees 배열 마이그레이션
  if (Array.isArray(state.activeEmployees)) {
    state.activeEmployees = [...new Set(state.activeEmployees.map((id) => (id === 'drucker' ? 'milo' : id)))];
  }
  // employeeOverrides 키 마이그레이션
  if (state.employeeOverrides && state.employeeOverrides.drucker && !state.employeeOverrides.milo) {
    state.employeeOverrides.milo = state.employeeOverrides.drucker;
    delete state.employeeOverrides.drucker;
  }
  return state;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_STATE, ...parsed };
    return migrateLegacyIds(merged);
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[aiTeamStore] save failed:', e);
  }
  // Supabase DB에도 ai_overrides 동기화 (비동기, 실패 무시)
  if (SUPABASE_ENABLED && state.employeeOverrides) {
    saveOverridesToDB(state.employeeOverrides);
  }
}

// DB에 ai_overrides 저장 (디바운스)
let _saveTimer = null;
async function saveOverridesToDB(overrides) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: membership } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();
      if (!membership) return;
      await supabase
        .from('teams')
        .update({ ai_overrides: overrides })
        .eq('id', membership.team_id);
    } catch (e) {
      console.warn('[aiTeamStore] DB save failed:', e);
    }
  }, 2000); // 2초 디바운스
}

// DB에서 ai_overrides 불러오기
async function loadOverridesFromDB() {
  if (!SUPABASE_ENABLED) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .single();
    if (!membership) return null;
    const { data: team } = await supabase
      .from('teams')
      .select('ai_overrides')
      .eq('id', membership.team_id)
      .single();
    return team?.ai_overrides || null;
  } catch {
    return null;
  }
}

export const useAiTeamStore = create((set, get) => ({
  ...loadFromStorage(),

  // DB에서 최신 overrides 로드 (앱 시작 시 호출)
  loadFromDB: async () => {
    const dbOverrides = await loadOverridesFromDB();
    if (dbOverrides && Object.keys(dbOverrides).length > 0) {
      set({ employeeOverrides: dbOverrides });
      saveToStorage({ ...get(), employeeOverrides: dbOverrides });
    }
  },

  toggleEmployee: (id) => {
    const active = get().activeEmployees;
    // milo는 비활성화 불가 (항상 참여)
    if (id === 'milo') return;
    const next = active.includes(id) ? active.filter((e) => e !== id) : [...active, id];
    set({ activeEmployees: next });
    saveToStorage(get());
  },

  setAutoRouting: (autoRouting) => {
    set({ autoRouting });
    saveToStorage(get());
  },

  setDefaultPreset: (defaultPreset) => {
    set({ defaultPreset });
    saveToStorage(get());
  },

  // 특정 AI의 LLM 모델 설정
  setEmployeeModel: (employeeId, modelId) => {
    const overrides = { ...get().employeeOverrides };
    overrides[employeeId] = { ...(overrides[employeeId] || {}), model: modelId };
    set({ employeeOverrides: overrides });
    saveToStorage(get());
  },

  // 특정 AI에게 커스텀 지시사항 설정
  setCustomInstructions: (employeeId, instructions) => {
    const overrides = { ...get().employeeOverrides };
    overrides[employeeId] = { ...(overrides[employeeId] || {}), customInstructions: instructions };
    set({ employeeOverrides: overrides });
    saveToStorage(get());
  },

  // 특정 AI에게 구글 문서 ID 설정 (배열 지원: [{id, type, label}])
  setGoogleSheetsId: (employeeId, sheetsIds) => {
    const overrides = { ...get().employeeOverrides };
    const value = Array.isArray(sheetsIds) ? (sheetsIds.length > 0 ? sheetsIds : null) : (sheetsIds || null);
    overrides[employeeId] = { ...(overrides[employeeId] || {}), googleSheetsId: value };
    set({ employeeOverrides: overrides });
    saveToStorage(get());
  },

  // 미리 요약된 문서 데이터 저장
  setGoogleDocsSummary: (employeeId, summary) => {
    const overrides = { ...get().employeeOverrides };
    overrides[employeeId] = { ...(overrides[employeeId] || {}), googleDocsSummary: summary || null, googleDocsSyncedAt: summary ? new Date().toISOString() : null };
    set({ employeeOverrides: overrides });
    saveToStorage(get());
  },

  // ── Google Docs RAG 인덱싱 — 동기화된 텍스트를 청킹+임베딩 ──
  indexGoogleDocs: async (employeeId) => {
    const overrides = get().employeeOverrides[employeeId] || {};
    const content = typeof overrides.googleDocsSummary === 'object'
      ? overrides.googleDocsSummary?.content || ''
      : overrides.googleDocsSummary || '';
    if (!content || content.length < 50) return; // 내용 너무 짧으면 스킵

    const docs = overrides.googleSheetsId || [];
    // deterministic fileId: 동일 문서 재인덱싱 시 기존 청크 덮어쓰기
    const fileId = `gdoc_${employeeId}_${docs.map((d) => d.id).join('_').slice(0, 30) || 'all'}`;

    // DB에 파일 레코드 upsert (있으면 content 업데이트)
    if (SUPABASE_ENABLED) {
      try {
        const { data: existing } = await supabase
          .from('ai_knowledge_files')
          .select('id')
          .eq('id', fileId)
          .maybeSingle();

        if (existing) {
          await supabase.from('ai_knowledge_files').update({ content, size: content.length }).eq('id', fileId);
        } else {
          await supabase.from('ai_knowledge_files').insert({
            id: fileId, employee_id: employeeId, name: `Google Docs (${docs.length}건)`,
            content, size: content.length,
          });
        }

        await processKnowledgeFile({ fileId, employeeId, content });
        console.log(`[aiTeamStore] Google Docs indexed for ${employeeId}`);
      } catch (err) {
        console.error('[aiTeamStore] Google Docs indexing failed:', err);
        throw err;
      }
    }

    // 인덱싱 시점 기록
    const cur = { ...get().employeeOverrides };
    cur[employeeId] = { ...(cur[employeeId] || {}), googleDocsIndexedAt: new Date().toISOString() };
    set({ employeeOverrides: cur });
    saveToStorage(get());
  },

  // ── 기본 참조 문서 인덱싱 — public/docs/{filename} fetch → RAG ──
  indexDefaultDoc: async (employeeId, filename) => {
    const fileId = `default_${employeeId}_${filename}`;

    try {
      // public/docs/ 에서 파일 fetch
      const res = await fetch(`/docs/${filename}`);
      if (!res.ok) throw new Error(`Failed to fetch /docs/${filename}: ${res.status}`);
      const content = await res.text();
      if (!content || content.length < 20) throw new Error('File is empty');

      if (SUPABASE_ENABLED) {
        // DB upsert
        const { data: existing } = await supabase
          .from('ai_knowledge_files')
          .select('id')
          .eq('id', fileId)
          .maybeSingle();

        if (existing) {
          await supabase.from('ai_knowledge_files').update({ content, size: content.length }).eq('id', fileId);
        } else {
          await supabase.from('ai_knowledge_files').insert({
            id: fileId, employee_id: employeeId, name: filename,
            content, size: content.length,
          });
        }

        await processKnowledgeFile({ fileId, employeeId, content });
        console.log(`[aiTeamStore] Default doc indexed: ${filename} for ${employeeId}`);
      }

      // 인덱싱 완료 목록에 추가
      const cur = { ...get().employeeOverrides };
      const emp = cur[employeeId] || {};
      const indexed = new Set(emp.defaultDocsIndexed || []);
      indexed.add(filename);
      cur[employeeId] = { ...emp, defaultDocsIndexed: [...indexed] };
      set({ employeeOverrides: cur });
      saveToStorage(get());
    } catch (err) {
      console.error(`[aiTeamStore] Default doc indexing failed: ${filename}`, err);
      throw err;
    }
  },

  // ── 기본 참조 문서 일괄 인덱싱 ──
  indexAllDefaultDocs: async (employeeId) => {
    const emp = AI_EMPLOYEES.find((e) => e.id === employeeId);
    if (!emp?.defaultMdFiles?.length) return;
    for (const filename of emp.defaultMdFiles) {
      try {
        await get().indexDefaultDoc(employeeId, filename);
      } catch { /* 개별 실패는 스킵하고 계속 */ }
    }
  },

  // 특정 AI에게 지식 파일 추가 (localStorage + Supabase + Contextual Retrieval 인덱싱)
  addKnowledgeFile: async (employeeId, file) => {
    const fileWithStatus = { ...file, processed: false }; // 인덱싱 전 상태
    const overrides = { ...get().employeeOverrides };
    const existing = overrides[employeeId] || {};
    const files = [...(existing.knowledgeFiles || []), fileWithStatus];
    overrides[employeeId] = { ...existing, knowledgeFiles: files };
    set({ employeeOverrides: overrides });
    saveToStorage(get());

    if (SUPABASE_ENABLED) {
      try {
        await supabase.from('ai_knowledge_files').insert({
          id: file.id,
          employee_id: employeeId,
          name: file.name,
          content: file.content,
          size: file.size,
        });

        // 비동기 인덱싱 (UI 차단하지 않음) — 완료 시 processed: true로 업데이트
        processKnowledgeFile({ fileId: file.id, employeeId, content: file.content })
          .then((res) => {
            console.log(`[aiTeamStore] Indexed ${file.name}:`, res);
            const cur = { ...get().employeeOverrides };
            const curFiles = (cur[employeeId]?.knowledgeFiles || []).map((f) =>
              f.id === file.id ? { ...f, processed: true } : f
            );
            cur[employeeId] = { ...cur[employeeId], knowledgeFiles: curFiles };
            set({ employeeOverrides: cur });
            saveToStorage(get());
          })
          .catch((err) => {
            console.error(`[aiTeamStore] Indexing ${file.name} failed:`, err);
            const cur = { ...get().employeeOverrides };
            const curFiles = (cur[employeeId]?.knowledgeFiles || []).map((f) =>
              f.id === file.id ? { ...f, processed: false, indexError: String(err).slice(0, 100) } : f
            );
            cur[employeeId] = { ...cur[employeeId], knowledgeFiles: curFiles };
            set({ employeeOverrides: cur });
            saveToStorage(get());
          });
      } catch (err) {
        console.error('[aiTeamStore] DB save failed:', err);
      }
    }
  },

  // 실패한 파일 재인덱싱
  reindexKnowledgeFile: async (employeeId, fileId) => {
    const overrides = get().employeeOverrides;
    const file = (overrides[employeeId]?.knowledgeFiles || []).find((f) => f.id === fileId);
    if (!file) return;

    // 상태: 인덱싱 중으로 표시
    const cur1 = { ...get().employeeOverrides };
    cur1[employeeId].knowledgeFiles = cur1[employeeId].knowledgeFiles.map((f) =>
      f.id === fileId ? { ...f, processed: false, indexError: null } : f
    );
    set({ employeeOverrides: cur1 });

    try {
      const res = await processKnowledgeFile({ fileId, employeeId, content: file.content });
      console.log(`[aiTeamStore] Reindexed ${file.name}:`, res);
      const cur = { ...get().employeeOverrides };
      cur[employeeId].knowledgeFiles = cur[employeeId].knowledgeFiles.map((f) =>
        f.id === fileId ? { ...f, processed: true, indexError: null } : f
      );
      set({ employeeOverrides: cur });
      saveToStorage(get());
    } catch (err) {
      const cur = { ...get().employeeOverrides };
      cur[employeeId].knowledgeFiles = cur[employeeId].knowledgeFiles.map((f) =>
        f.id === fileId ? { ...f, processed: false, indexError: String(err).slice(0, 100) } : f
      );
      set({ employeeOverrides: cur });
      saveToStorage(get());
    }
  },

  removeKnowledgeFile: async (employeeId, fileId) => {
    const overrides = { ...get().employeeOverrides };
    const existing = overrides[employeeId] || {};
    const files = (existing.knowledgeFiles || []).filter((f) => f.id !== fileId);
    overrides[employeeId] = { ...existing, knowledgeFiles: files };
    set({ employeeOverrides: overrides });
    saveToStorage(get());

    if (SUPABASE_ENABLED) {
      try {
        await supabase.from('ai_knowledge_files').delete().eq('id', fileId);
      } catch (err) {
        console.error('[aiTeamStore] DB delete failed:', err);
      }
    }
  },

  // ── 공통 지식(shared) CRUD — employee_id='*'로 저장, 모든 AI 참조 ──
  addSharedKnowledgeFile: async (file) => {
    const fileWithStatus = { ...file, processed: false };
    set({ sharedKnowledgeFiles: [...get().sharedKnowledgeFiles, fileWithStatus] });
    saveToStorage(get());

    if (SUPABASE_ENABLED) {
      try {
        await supabase.from('ai_knowledge_files').insert({
          id: file.id,
          employee_id: SHARED_KNOWLEDGE_EMPLOYEE_ID,
          name: file.name,
          content: file.content,
          size: file.size,
        });

        processKnowledgeFile({ fileId: file.id, employeeId: SHARED_KNOWLEDGE_EMPLOYEE_ID, content: file.content })
          .then((res) => {
            console.log(`[aiTeamStore] Indexed shared ${file.name}:`, res);
            const files = get().sharedKnowledgeFiles.map((f) =>
              f.id === file.id ? { ...f, processed: true } : f
            );
            set({ sharedKnowledgeFiles: files });
            saveToStorage(get());
          })
          .catch((err) => {
            console.error(`[aiTeamStore] Indexing shared ${file.name} failed:`, err);
            const files = get().sharedKnowledgeFiles.map((f) =>
              f.id === file.id ? { ...f, processed: false, indexError: String(err).slice(0, 100) } : f
            );
            set({ sharedKnowledgeFiles: files });
            saveToStorage(get());
          });
      } catch (err) {
        console.error('[aiTeamStore] DB save (shared) failed:', err);
      }
    }
  },

  reindexSharedKnowledgeFile: async (fileId) => {
    const file = get().sharedKnowledgeFiles.find((f) => f.id === fileId);
    if (!file) return;

    // 상태: 인덱싱 중으로 표시
    set({
      sharedKnowledgeFiles: get().sharedKnowledgeFiles.map((f) =>
        f.id === fileId ? { ...f, processed: false, indexError: null } : f
      ),
    });

    try {
      const res = await processKnowledgeFile({
        fileId,
        employeeId: SHARED_KNOWLEDGE_EMPLOYEE_ID,
        content: file.content,
      });
      console.log(`[aiTeamStore] Reindexed shared ${file.name}:`, res);
      set({
        sharedKnowledgeFiles: get().sharedKnowledgeFiles.map((f) =>
          f.id === fileId ? { ...f, processed: true, indexError: null } : f
        ),
      });
      saveToStorage(get());
    } catch (err) {
      set({
        sharedKnowledgeFiles: get().sharedKnowledgeFiles.map((f) =>
          f.id === fileId ? { ...f, processed: false, indexError: String(err).slice(0, 100) } : f
        ),
      });
      saveToStorage(get());
    }
  },

  removeSharedKnowledgeFile: async (fileId) => {
    set({
      sharedKnowledgeFiles: get().sharedKnowledgeFiles.filter((f) => f.id !== fileId),
    });
    saveToStorage(get());

    if (SUPABASE_ENABLED) {
      try {
        await supabase.from('ai_knowledge_files').delete().eq('id', fileId);
      } catch (err) {
        console.error('[aiTeamStore] DB delete (shared) failed:', err);
      }
    }
  },

  // DB에서 지식 문서 로드 — 공통(employee_id='*')은 sharedKnowledgeFiles, 나머지는 employeeOverrides
  loadKnowledgeFiles: async () => {
    if (!SUPABASE_ENABLED) return;
    try {
      const { data, error } = await supabase
        .from('ai_knowledge_files')
        .select('*')
        .order('created_at', { ascending: true });
      if (error || !data?.length) return;

      const overrides = { ...get().employeeOverrides };
      const shared = [...get().sharedKnowledgeFiles];
      data.forEach((f) => {
        const fileObj = {
          id: f.id,
          name: f.name,
          content: f.content,
          size: f.size,
          addedAt: f.created_at,
          processed: !!f.processed_at, // DB processed_at 있으면 인덱싱 완료된 것
        };
        if (f.employee_id === SHARED_KNOWLEDGE_EMPLOYEE_ID) {
          if (!shared.some((x) => x.id === f.id)) shared.push(fileObj);
        } else {
          const emp = overrides[f.employee_id] || {};
          const files = emp.knowledgeFiles || [];
          if (!files.some((x) => x.id === f.id)) files.push(fileObj);
          overrides[f.employee_id] = { ...emp, knowledgeFiles: files };
        }
      });
      set({ employeeOverrides: overrides, sharedKnowledgeFiles: shared });
      saveToStorage(get());
    } catch (err) {
      console.error('[aiTeamStore] DB load failed:', err);
    }
  },

  // 키워드 기반 AI 라우팅 — 대소문자 무시, 영문은 word boundary
  routeByKeywords: (text) => {
    const active = get().activeEmployees;
    const matched = [];
    const lowerText = (text || '').toLowerCase();

    // 영문 여부 체크 — ASCII만 있으면 word boundary로 매칭
    const isLatin = (s) => /^[\x00-\x7F]+$/.test(s);

    for (const emp of AI_EMPLOYEES) {
      if (!active.includes(emp.id)) continue;
      if (emp.id === 'milo') continue;
      const hits = emp.triggerKeywords.filter((kw) => {
        const lowerKw = kw.toLowerCase();
        if (isLatin(kw)) {
          // 영문 키워드: \b 경계로 매칭 (substring 방지)
          const escaped = lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          try {
            return new RegExp(`\\b${escaped}\\b`, 'i').test(text || '');
          } catch {
            return lowerText.includes(lowerKw);
          }
        }
        // 한글 키워드: 단순 substring (한글은 공백 없이 붙어쓰는 경우 많음)
        return lowerText.includes(lowerKw);
      });
      if (hits.length > 0) matched.push({ id: emp.id, hits: hits.length });
    }

    // 매칭 수 기준 정렬, 최대 3명
    matched.sort((a, b) => b.hits - a.hits);
    const specialists = matched.slice(0, 3).map((m) => m.id);

    // 드러커는 항상 포함
    return ['milo', ...specialists];
  },

  // 특정 AI의 전체 시스템 프롬프트 빌드
  buildPromptFor: (employeeId) => {
    const emp = AI_EMPLOYEES.find((e) => e.id === employeeId);
    if (!emp) return '';

    const overrides = get().employeeOverrides[employeeId] || {};

    // 1. Base system prompt (도메인 전문성)
    let prompt = emp.systemPrompt;

    // 2. Knowledge files —
    // 인덱싱된 파일은 Edge Function의 Contextual Retrieval이 런타임에 관련 청크만 주입
    // (시스템 프롬프트에 넣지 않음 → 토큰 대폭 절감)
    // 아직 인덱싱 안 된 파일만 fallback으로 작게 주입 (최대 1개 파일, 2000자)
    const unindexed = (overrides.knowledgeFiles || []).filter((f) => !f.processed);
    if (unindexed.length > 0) {
      prompt += '\n\n## 참조 지식 문서 (인덱싱 대기 중 — fallback, 외부 자료)';
      const FALLBACK_BUDGET = 2000;
      const f = unindexed[0]; // 가장 최근 1개만
      const content = (f.content || '').slice(0, FALLBACK_BUDGET);
      const truncated = (f.content || '').length > FALLBACK_BUDGET ? '\n[...인덱싱 완료 후 의미 검색으로 교체됨]' : '';
      prompt += `\n\n### ${f.name}\n\`\`\`\n${content}${truncated}\n\`\`\``;
    }

    // 3. Custom instructions — 명확한 섹션으로 격리
    if (overrides.customInstructions) {
      prompt += `\n\n## 사용자 추가 지시사항 (참고)\n${overrides.customInstructions}`;
    }

    // 4. 공통 가드레일 — 반드시 마지막에 삽입하여 최우선 적용
    prompt += `\n\n## ━━━ 공통 가드레일 (최우선 준수) ━━━

### 1인칭 규칙 (절대 위반 금지)
- 당신의 이름은 "${emp.nameKo}"이다. 자기 자신은 반드시 "제가", "저는", "저의"로 지칭
- 절대로 "${emp.nameKo}"를 3인칭으로 언급 금지 — "${emp.nameKo}에게 요청" ❌, "제가 제시" ✅
- 다른 AI 전문가만 3인칭 사용 가능 (예: "노먼이 제안한 방식은...")
- Milo의 "코틀러에게 확인하겠습니다" 같은 라우팅 메시지를 따라하지 말 것. 당신은 이미 호출된 전문가이므로 바로 분석 결과를 제시

### 자기 응답 재진입 금지 (CRITICAL)
- 대화 기록(transcript)에서 "[당신(${emp.nameKo})의 이전 응답]" 또는 "[${emp.nameKo}]"로 시작하는 메시지는 **당신이 직전에 한 말**이다. 절대 타인의 발언으로 오인하지 말 것
- 자기 이전 응답을 "검토/비판/평가"하지 말 것. "방금 ${emp.nameKo}의 응답을 검토했습니다" 같은 메타 발언 금지
- 이전에 이미 답한 내용은 반복하지 말고, **새로 추가된 사용자 질문**에 직접 응답하거나 새 관점만 제시
- 최근 사용자 발언이 없거나 새로 덧붙일 게 없으면 should_respond: false 반환

### 환각 방지 원칙
- 근거 없는 추측 금지: 데이터가 없으면 "확인이 필요합니다" 명시
- 신뢰도가 낮으면 "~일 가능성이 있습니다" 같은 완곡 표현 사용
- 실시간 데이터가 필요하면 "최신 데이터 확인이 필요합니다" 반환

### 응답 성향
- 건설적 분석 중심: 정확한 정보, 데이터 기반, 실행 가능한 제안
- 비판은 실제 리스크가 있을 때만. 매번 "우려되는 점은"을 반복하지 말 것
- 다른 전문가 의견에 동의할 부분은 동의하고, 실질적 반론만 제시

### 반복 금지
- 이전 대화 내용 반복 금지. 새로운 관점이나 추가 정보만 제시
- 다른 전문가가 언급한 포인트를 되풀이하지 말 것
- 새로운 정보가 없으면 should_respond: false로 응답 (침묵도 선택지)

### 참가자 멘션
- 회의 참가자를 언급할 때 반드시 @이름 형식 (예: "@명배영님, ...")
- 정보가 부족하면 추측 대신 참가자에게 직접 질문

### 응답 길이
- 간단한 질문: 3~5문장
- 복잡한 분석: 최대 300 tokens
- 너무 길면 요점만 간결하게`;

    return prompt;
  },

  getEmployee: (id) => AI_EMPLOYEES.find((e) => e.id === id),

  // 특정 AI 직원의 실제 API 모델 ID 반환
  getEmployeeModelId: (employeeId) => {
    const overrides = get().employeeOverrides[employeeId] || {};
    // 밀로(milo)는 Sonnet, 나머지 전문가는 Haiku 기본 (비용 절약)
    const defaultModel = employeeId === 'milo' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';
    const selectedId = overrides.model || defaultModel;
    const model = LLM_MODELS.find((m) => m.id === selectedId);
    return model?.apiModelId || null;
  },

  resetToDefaults: async () => {
    // 1. DB 지식파일 전체 삭제 (공통 + 직원별 모두)
    //    ai_knowledge_chunks는 file_id FK CASCADE로 자동 삭제됨
    if (SUPABASE_ENABLED) {
      try {
        // 현재 사용자의 모든 knowledge files 삭제
        const allFileIds = [
          ...get().sharedKnowledgeFiles.map((f) => f.id),
          ...Object.values(get().employeeOverrides)
            .flatMap((ov) => (ov.knowledgeFiles || []).map((f) => f.id)),
        ];
        if (allFileIds.length > 0) {
          await supabase.from('ai_knowledge_files').delete().in('id', allFileIds);
          console.log(`[aiTeamStore] Reset: deleted ${allFileIds.length} knowledge files from DB`);
        }
      } catch (err) {
        console.error('[aiTeamStore] Reset DB cleanup failed:', err);
      }
    }

    // 2. 스토어 + localStorage 초기화
    set(DEFAULT_STATE);
    saveToStorage(DEFAULT_STATE);
  },
}));
