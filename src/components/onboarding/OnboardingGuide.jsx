// OnboardingGuide — 풀스크린 가이드 모달
//   탭 1: 회의 임하는 자세 (Etiquette) — 8가지 원칙을 아이콘 카드로
//   탭 2: 사용 설명서 (Tutorial) — 페이지별 step-by-step
// 사용:
//   const [open, setOpen] = useState(false);
//   <OnboardingGuide open={open} onClose={() => setOpen(false)} initialTab="etiquette" />

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ChevronLeft, ChevronRight,
  // 회의 자세 아이콘
  Target, Clock, Mic2, FileEdit, Users, BarChart3, CheckSquare, BellOff,
  // 사용 설명서 아이콘
  Plus, Calendar, MessageSquare, Headphones, FolderOpen, Sparkles, FileText, ListChecks,
  Pencil, AtSign, Zap, ZapOff, Keyboard, Search, Video,
  BookOpen, Compass, Lightbulb,
} from 'lucide-react';

// ════════════════════════════════════════
// 회의 자세 — 8가지 원칙
// ════════════════════════════════════════
const ETIQUETTE = [
  {
    icon: Target, color: 'text-brand-purple', bg: 'bg-brand-purple/15',
    title: '명확한 목적',
    desc: '회의 시작 전 어젠다를 확인하세요. 무엇을 결정해야 하는지가 명확해야 시간 낭비가 없습니다.',
    tip: '💡 어젠다 없는 회의는 시작하지 마세요 — 모든 발언과 결정은 어젠다 위에서 이뤄져야 시간이 헛되지 않습니다',
  },
  {
    icon: Clock, color: 'text-brand-orange', bg: 'bg-brand-orange/15',
    title: '시간 약속',
    desc: '정시에 시작하고 정시에 끝냅니다. 발언 시간도 골고루 분배하세요.',
    tip: '⏱ 계획된 시간 안에서 어젠다 중심으로 — 핵심만 짧게, 곁가지는 다음 회의로 미루세요',
  },
  {
    icon: Mic2, color: 'text-status-success', bg: 'bg-status-success/15',
    title: '한 명씩 발언',
    desc: '음성 모드에서는 동시 발언 시 음질이 저하됩니다. PTT 모드를 활용하세요.',
    tip: '🎙 Space 키 길게 누르고 말하기 (PTT)',
  },
  {
    icon: FileEdit, color: 'text-status-info', bg: 'bg-status-info/15',
    title: '결정 사항 명시',
    desc: '"이렇게 하기로 했어요" 라고 명확히 말하면 Milo 가 자동으로 결정 사항으로 기록합니다.',
    tip: '✅ "결정", "정해졌어요" 같은 키워드가 효과적',
  },
  {
    icon: Users, color: 'text-brand-purple', bg: 'bg-brand-purple/15',
    title: '존중과 경청',
    desc: '발언 중인 사람의 말을 끊지 마세요. 의견이 다르면 채팅으로 메모를 남기세요.',
    tip: '✋ 끼어들기보다 어젠다 다음 차례에 발언',
  },
  {
    icon: BarChart3, color: 'text-brand-orange', bg: 'bg-brand-orange/15',
    title: '데이터 기반',
    desc: '추측보다 데이터로 말하세요. @Milo 를 호출하면 과거 회의·태스크에서 근거를 찾아줍니다.',
    tip: '🔍 "@Milo 지난주 결정사항 알려줘"',
  },
  {
    icon: CheckSquare, color: 'text-status-success', bg: 'bg-status-success/15',
    title: '액션 아이템 확정',
    desc: '회의 종료 전 누가, 무엇을, 언제까지 할지 명확히 정합니다. Milo 가 태스크로 자동 생성해요.',
    tip: '📌 담당자 + 마감일 + 명확한 산출물',
  },
  {
    icon: BellOff, color: 'text-status-error', bg: 'bg-status-error/15',
    title: '집중',
    desc: '회의 중에는 다른 알림을 끄세요. 짧고 집중된 회의가 긴 회의보다 효과적입니다.',
    tip: '🔕 알림 OFF · 다른 탭 닫기',
  },
];

// ════════════════════════════════════════
// 사용 설명서 — 페이지별 튜토리얼
// ════════════════════════════════════════
const TUTORIAL_PAGES = [
  {
    id: 'create',
    title: '1. 회의 만들기',
    icon: Plus,
    intro: '주제와 참가자를 정한 회의방을 만들어 보세요.',
    steps: [
      { icon: Plus, text: '"새 회의" 버튼 클릭 → 모달 열림' },
      { icon: Calendar, text: '제목 + 날짜 + 시간 입력 (어젠다는 여러 개 가능)' },
      { icon: Users, text: '참가자 선택 — 팀 멤버 또는 외부 게스트 초대' },
      { icon: FileText, text: '자료 첨부 (선택) — PDF, 이미지, Google Docs URL' },
      { icon: Mic2, text: '"회의 시작" 클릭 → 회의방 진입' },
    ],
  },
  {
    id: 'voice',
    title: '2. 음성 회의',
    icon: Headphones,
    intro: '15~20명까지 동시 음성 통화 가능. STT 자막도 자동.',
    steps: [
      { icon: Mic2, text: '회의방 헤더의 "음성 참여" 버튼 클릭' },
      { icon: Headphones, text: '마이크 권한 허용 → 자동으로 음성 송수신 시작 (음소거 상태)' },
      { icon: Keyboard, text: 'Space 키 1번 = 음소거 토글 (토글 모드)' },
      { icon: Keyboard, text: 'Space 길게 누르기 = 발언, 떼면 음소거 (PTT 모드)' },
      { icon: Sparkles, text: '발언 내용은 자동으로 채팅에 자막으로 기록 (STT)' },
    ],
  },
  {
    id: 'docs',
    title: '3. 자료 공유',
    icon: FolderOpen,
    intro: 'PDF · 이미지 · Google Docs 를 모두에게 동시 공유.',
    steps: [
      { icon: FolderOpen, text: '좌측 자료 패널 — 헤더 클릭으로 접고 펼치기' },
      { icon: Plus, text: '+ 메뉴 → "자료 업로드" 또는 "URL 로 자료 추가"' },
      { icon: Search, text: '자료 카드 클릭 → 풀사이즈 뷰어 (페이지 네비, 줌 50~300%)' },
      { icon: Pencil, text: '드로잉 켜기 → 모든 참가자에게 실시간 공유 (라이브)' },
      { icon: Compass, text: '"라이브" 토글 → 다른 참가자가 페이지 넘기면 자동 따라가기' },
    ],
  },
  {
    id: 'chat',
    title: '4. 채팅 + Milo AI',
    icon: MessageSquare,
    intro: 'AI 동료 Milo 가 회의에 함께 참여합니다.',
    steps: [
      { icon: MessageSquare, text: '하단 입력창에 메시지 입력 → Enter 전송' },
      { icon: AtSign, text: '@Milo 입력 → AI 직접 호출 (질문·요약·근거 검색)' },
      { icon: Zap, text: '헤더 "AI 자동 개입" ON → 데이터 부족·합의 감지 시 Milo 가 자동 발언' },
      { icon: ZapOff, text: 'OFF → @ 호출 시에만 발언 (조용한 모드)' },
      { icon: Sparkles, text: '메시지 클릭 → 인용 답장 / 반응 (👍 ❤️ 🤔)' },
    ],
  },
  {
    id: 'summary',
    title: '5. 회의록 자동 생성',
    icon: FileText,
    intro: '종료 버튼만 누르면 Milo 가 회의록을 만듭니다.',
    steps: [
      { icon: CheckSquare, text: '회의 요청자 → "회의 종료" 버튼 (참가자는 "나가기")' },
      { icon: Sparkles, text: 'Milo 가 결정 사항 / 논의 / 액션 아이템 자동 분류' },
      { icon: FileText, text: '회의록 페이지 (/summaries) 에서 모든 참가자가 조회' },
      { icon: ListChecks, text: '액션 아이템은 자동으로 태스크로 생성 (담당자 지정)' },
      { icon: BarChart3, text: '회의 평가 (좋아요/별로) — Milo 가 다음 회의에 반영' },
    ],
  },
  {
    id: 'tasks',
    title: '6. 태스크 관리',
    icon: ListChecks,
    intro: '회의에서 나온 결정을 잊지 않도록.',
    steps: [
      { icon: ListChecks, text: '대시보드 — 내 태스크 + 팀 태스크 한눈에' },
      { icon: Calendar, text: '마감일순 정렬 — 긴급/중요/일반 자동 분류' },
      { icon: CheckSquare, text: '체크박스 클릭 → 완료 처리 (Slack 자동 알림 가능)' },
      { icon: BarChart3, text: '주간 분석 — 완료율, 지연 태스크, 팀 부하 분석' },
      { icon: Lightbulb, text: 'Milo 인사이트 — 미루는 패턴 발견, 우선순위 추천' },
    ],
  },
];

export default function OnboardingGuide({ open, onClose, initialTab = 'etiquette' }) {
  const [tab, setTab] = useState(initialTab);
  const [tutorialIdx, setTutorialIdx] = useState(0);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 모달 열릴 때 초기 탭 설정
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  const currentPage = TUTORIAL_PAGES[tutorialIdx];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch md:items-center md:justify-center bg-black/70 backdrop-blur-sm overflow-hidden">
      <div className="w-full h-full md:h-[92vh] md:max-h-[900px] md:max-w-5xl md:rounded-2xl bg-bg-secondary border border-border-subtle shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center">
              <BookOpen size={20} className="text-brand-purple" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-txt-primary">MeetFlow 가이드</h2>
              <p className="text-[11px] md:text-xs text-txt-muted">회의 자세와 사용법을 한 번에</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border-subtle px-4 md:px-8 shrink-0 bg-bg-secondary">
          <button
            onClick={() => setTab('etiquette')}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors flex items-center gap-2 ${
              tab === 'etiquette' ? 'text-brand-purple' : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            <Compass size={16} />
            회의 자세
            {tab === 'etiquette' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple rounded-t" />
            )}
          </button>
          <button
            onClick={() => setTab('tutorial')}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors flex items-center gap-2 ${
              tab === 'tutorial' ? 'text-brand-purple' : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            <BookOpen size={16} />
            사용 설명서
            {tab === 'tutorial' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple rounded-t" />
            )}
          </button>
        </div>

        {/* 본문 — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 [overscroll-behavior:contain]">
          {tab === 'etiquette' ? (
            // ─── 회의 자세 ───
            <div>
              <div className="mb-6">
                <h3 className="text-xl md:text-2xl font-bold text-txt-primary mb-2">
                  좋은 회의를 만드는 8가지 자세
                </h3>
                <p className="text-sm text-txt-secondary">
                  MeetFlow 는 도구일 뿐. 좋은 회의는 사람의 태도에서 시작합니다.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {ETIQUETTE.map((e, i) => (
                  <div
                    key={i}
                    className="p-4 md:p-5 rounded-xl bg-bg-tertiary border border-border-subtle hover:border-border-default transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 rounded-lg ${e.bg} flex items-center justify-center shrink-0`}>
                        <e.icon size={22} className={e.color} strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm md:text-base font-semibold text-txt-primary mb-1">
                          <span className="text-txt-muted text-xs mr-1.5">{String(i + 1).padStart(2, '0')}</span>
                          {e.title}
                        </h4>
                        <p className="text-[12px] md:text-[13px] text-txt-secondary leading-relaxed mb-2">
                          {e.desc}
                        </p>
                        <p className="text-[11px] md:text-xs text-brand-purple font-medium">
                          {e.tip}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // ─── 사용 설명서 ───
            <div>
              {/* 페이지 네비게이션 (모바일은 스크롤, 데스크톱은 가로 정렬) */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-6 -mx-4 md:mx-0 px-4 md:px-0 scrollbar-hide">
                {TUTORIAL_PAGES.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setTutorialIdx(i)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors ${
                      tutorialIdx === i
                        ? 'bg-brand-purple text-white shadow-sm'
                        : 'bg-bg-tertiary text-txt-secondary hover:text-txt-primary'
                    }`}
                  >
                    <p.icon size={14} />
                    {p.title}
                  </button>
                ))}
              </div>

              {/* 현재 페이지 */}
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0">
                    <currentPage.icon size={28} className="text-white" strokeWidth={2.2} />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold text-txt-primary">
                      {currentPage.title}
                    </h3>
                    <p className="text-sm text-txt-secondary mt-0.5">{currentPage.intro}</p>
                  </div>
                </div>

                <ol className="space-y-3">
                  {currentPage.steps.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 p-3 md:p-4 rounded-lg bg-bg-tertiary/60 border border-border-subtle"
                    >
                      <div className="w-8 h-8 rounded-full bg-brand-purple/15 text-brand-purple flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 flex items-start gap-3 min-w-0">
                        <s.icon size={18} className="text-brand-purple shrink-0 mt-0.5" />
                        <p className="text-sm md:text-[15px] text-txt-primary leading-relaxed">
                          {s.text}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>

                {/* 페이지 이동 */}
                <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                  <button
                    onClick={() => setTutorialIdx((i) => Math.max(0, i - 1))}
                    disabled={tutorialIdx === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                    이전
                  </button>
                  <span className="text-xs text-txt-muted">
                    {tutorialIdx + 1} / {TUTORIAL_PAGES.length}
                  </span>
                  <button
                    onClick={() => setTutorialIdx((i) => Math.min(TUTORIAL_PAGES.length - 1, i + 1))}
                    disabled={tutorialIdx === TUTORIAL_PAGES.length - 1}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    다음
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-4 md:px-8 py-3 border-t border-border-subtle bg-bg-primary/40 shrink-0">
          <p className="text-[11px] md:text-xs text-txt-muted text-center">
            언제든 이 가이드를 다시 열려면 <kbd className="px-1.5 py-0.5 bg-bg-tertiary border border-border-subtle rounded text-[10px] mx-0.5">정보 아이콘</kbd> 을 클릭하세요
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
