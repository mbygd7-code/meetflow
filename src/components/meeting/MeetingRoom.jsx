import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { X, Square, Users, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useMilo } from '@/hooks/useMilo';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useMeetingStore } from '@/stores/meetingStore';
import ParticipantList from './ParticipantList';
import ChatArea from './ChatArea';
import AISummaryPanel from './AISummaryPanel';
import AgendaBar from './AgendaBar';
import PollPanel from './PollPanel';

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getById, endMeeting } = useMeeting();
  const setActiveMeetingId = useMeetingStore((s) => s.setActiveMeetingId);
  const meeting = getById(id);
  const [activeAgendaId, setActiveAgendaId] = useState(null);
  const [mobilePanel, setMobilePanel] = useState(null); // 'participants' | 'summary' | null
  const [aiThinking, setAiThinking] = useState(null); // { active: bool, employeeId: string }
  const [polls, setPolls] = useState([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false); // 태블릿 AI 요약 패널
  const [ending, setEnding] = useState(false);
  const [leavingConfirmed, setLeavingConfirmed] = useState(false);
  const { messages, sendMessage } = useRealtimeMessages(id);

  // 활성 회의 등록 — 회의방 입장 시
  useEffect(() => {
    if (meeting?.status === 'active') {
      setActiveMeetingId(id);
    }
    return () => {
      // 종료 시에만 해제 (이탈 시에는 유지)
      if (ending) setActiveMeetingId(null);
    };
  }, [id, meeting?.status, ending, setActiveMeetingId]);

  // 브라우저 탭 닫기/새로고침 방지
  useEffect(() => {
    if (meeting?.status !== 'active' || ending) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [meeting?.status, ending]);

  // X 버튼 / 사이드바 네비게이션 이탈 가드
  const safeNavigate = useCallback((to) => {
    if (meeting?.status === 'active' && !ending && !leavingConfirmed) {
      if (window.confirm('회의가 진행 중입니다. 나가시겠습니까?\n(회의는 유지됩니다)')) {
        setLeavingConfirmed(true);
        navigate(to);
      }
      return;
    }
    navigate(to);
  }, [meeting?.status, ending, leavingConfirmed, navigate]);

  const currentAgenda = useMemo(() => {
    const targetId = activeAgendaId
      ? activeAgendaId
      : meeting?.agendas?.find((a) => a.status === 'active')?.id ||
        meeting?.agendas?.[0]?.id;
    return meeting?.agendas?.find((a) => a.id === targetId);
  }, [activeAgendaId, meeting]);

  // AI-only 회의 감지: 인간 참여자가 나 혼자면 모든 메시지에 AI 자동 응답
  const isAiOnlyMeeting = useMemo(() => {
    const aiIds = AI_EMPLOYEES.map((e) => e.id);
    const humanParticipants = (meeting?.participants || []).filter(
      (p) => p.id !== 'milo' && !aiIds.includes(p.id)
    );
    return humanParticipants.length <= 1;
  }, [meeting]);

  // ── Polls ──
  const handleCreatePoll = useCallback(({ question, options }) => {
    const newPoll = {
      id: `poll-${Date.now()}`,
      question,
      options,
      votes: {},
      myVote: null,
      created_at: new Date().toISOString(),
    };
    setPolls((prev) => [newPoll, ...prev]);
    sendMessage(`📊 투표가 생성되었습니다: "${question}"`, {
      agendaId: currentAgenda?.id,
      isAi: true,
      aiType: 'nudge',
      aiEmployee: 'drucker',
    });
  }, [sendMessage, currentAgenda]);

  const handleVote = useCallback((pollId, optionIndex) => {
    setPolls((prev) =>
      prev.map((p) => {
        if (p.id !== pollId) return p;
        const votes = { ...p.votes };
        votes[optionIndex] = (votes[optionIndex] || 0) + 1;
        return { ...p, votes, myVote: optionIndex };
      })
    );
  }, []);

  // Milo AI hook — 새 메시지가 들어올 때마다 개입 판단
  const handleMiloRespond = useCallback(
    async (result) => {
      await sendMessage(result.response_text, {
        agendaId: currentAgenda?.id,
        isAi: true,
        aiType: result.ai_type,
        aiEmployee: result.ai_employee || 'drucker',
      });
    },
    [sendMessage, currentAgenda]
  );

  const handleThinking = useCallback((active, employeeId) => {
    setAiThinking(active ? { active: true, employeeId } : null);
  }, []);

  useMilo({
    messages,
    agenda: currentAgenda,
    onRespond: handleMiloRespond,
    onThinking: handleThinking,
    alwaysRespond: isAiOnlyMeeting,
  });

  // 응답한 AI 직원 추출 (참여자 리스트에 표시)
  const activeAiEmployees = useMemo(() => {
    const ids = new Set();
    messages.forEach((m) => {
      if (m.is_ai && m.ai_employee) ids.add(m.ai_employee);
    });
    return [...ids];
  }, [messages]);

  // AI 인사 — 회의 입장 시 AI 메시지가 없으면 Milo가 먼저 인사
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current || !meeting || meeting.status !== 'active') return;
    // AI 메시지가 이미 있으면 인사 생략
    const hasAiMessage = messages.some((m) => m.is_ai);
    if (hasAiMessage) { greetedRef.current = true; return; }
    // 메시지 로딩 중이면 대기 (빈 배열일 때 바로 인사하지 않도록)
    if (messages.length === 0 && !greetedRef.current) {
      // 약간 대기 후 재확인 (Supabase 로딩 완료 대기)
      const checkTimer = setTimeout(() => {
        greetedRef.current = true;
        const agendaList = (meeting.agendas || []).map((a) => a.title).join(', ');
        const userName = meeting.participants?.[0]?.name || '여러분';
        const greeting = agendaList
          ? `안녕하세요, ${userName}님! 킨더보드 회의 진행자 밀로입니다. 오늘 회의 주제나 논의하고 싶은 안건이 있으시면 알려주세요. 효율적인 회의 진행을 도와드리겠습니다.`
          : '안녕하세요! 회의가 시작되었습니다. 무엇을 논의해볼까요?';

        sendMessage(greeting, {
          agendaId: meeting?.agendas?.[0]?.id,
          isAi: true,
          aiType: 'nudge',
          aiEmployee: 'drucker',
        });
      }, 2000);
      return () => clearTimeout(checkTimer);
    }
  }, [meeting, messages, sendMessage]);

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center text-txt-secondary">
        <div className="text-center">
          <p className="text-sm mb-3">회의를 찾을 수 없습니다.</p>
          <button
            onClick={() => navigate('/meetings')}
            className="text-brand-purple hover:text-txt-primary text-xs"
          >
            회의 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const handleEnd = async () => {
    if (!confirm('회의를 종료하시겠습니까? 자동 요약이 생성됩니다.')) return;
    setEnding(true);
    setActiveMeetingId(null);
    try {
      await endMeeting(id, { messages, agendas: meeting.agendas || [] });
    } catch (err) {
      console.error('[handleEnd]', err);
    }
    setEnding(false);
    setLeavingConfirmed(true);
    navigate(`/summaries/${id}`);
  };

  const handleSend = async (content) => {
    await sendMessage(content, { agendaId: currentAgenda?.id });
  };

  // AI 요약 패널용 섹션 생성 (데모)
  const summarySections = useMemo(() => {
    const aiMessages = messages.filter((m) => m.is_ai);
    return [
      {
        key: 'decisions',
        title: '결정 사항',
        border: 'border-status-success',
        items: aiMessages
          .filter((m) => m.ai_type === 'summary')
          .map((m) => m.content.slice(0, 60) + (m.content.length > 60 ? '…' : '')),
      },
      {
        key: 'discussions',
        title: '논의 중',
        border: 'border-brand-yellow',
        items: aiMessages
          .filter((m) => m.ai_type === 'insight' || m.ai_type === 'data')
          .map((m) => m.content.slice(0, 60) + (m.content.length > 60 ? '…' : '')),
      },
      {
        key: 'deferred',
        title: '보류',
        border: 'border-txt-secondary',
        items: [],
      },
    ];
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* 회의 종료 로딩 오버레이 */}
      {ending && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-8 max-w-sm mx-4 text-center shadow-lg">
            <div className="w-14 h-14 rounded-full bg-gradient-brand shadow-glow flex items-center justify-center mx-auto mb-4">
              <Sparkles size={24} className="text-white animate-pulse" strokeWidth={2} />
            </div>
            <h3 className="text-lg font-semibold text-txt-primary mb-2">AI 인사이트 준비 중</h3>
            <p className="text-sm text-txt-secondary">Milo가 회의 내용을 분석하고 요약을 생성하고 있습니다...</p>
            <div className="flex justify-center gap-1 mt-4">
              <span className="w-2 h-2 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      {/* 회의 헤더 */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-border-divider">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button
            onClick={() => safeNavigate('/meetings')}
            className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors shrink-0"
          >
            <X size={16} />
          </button>
          <h1 className="text-base md:text-[22px] font-medium text-txt-primary tracking-tight truncate">
            {meeting.title}
          </h1>
          {meeting.status === 'active' && (
            <Badge variant="success">
              <span className="w-3 h-3 rounded-full bg-status-error pulse-dot mr-1" />
              <span className="hidden md:inline">진행 중</span>
            </Badge>
          )}
        </div>

        <button
          onClick={handleEnd}
          className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-xs md:text-sm font-medium hover:bg-status-error/20 transition-colors shrink-0"
        >
          <Square size={14} strokeWidth={2.4} />
          <span className="hidden md:inline">회의 종료</span>
          <span className="md:hidden">종료</span>
        </button>
      </div>

      {/* 어젠다 바 */}
      <AgendaBar
        agendas={meeting.agendas || []}
        activeId={currentAgenda?.id}
        onSelect={setActiveAgendaId}
      />

      {/* 모바일: 참여자/요약 토글 버튼 */}
      <div className="flex md:hidden items-center gap-1 px-3 py-2 border-b border-border-divider">
        <button
          onClick={() => setMobilePanel(mobilePanel === 'participants' ? null : 'participants')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mobilePanel === 'participants'
              ? 'bg-brand-purple/10 text-brand-purple'
              : 'text-txt-secondary hover:bg-bg-tertiary'
          }`}
        >
          <Users size={14} />
          참여자 {meeting.participants?.length || 0}
        </button>
        <button
          onClick={() => setMobilePanel(mobilePanel === 'summary' ? null : 'summary')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mobilePanel === 'summary'
              ? 'bg-brand-purple/10 text-brand-purple'
              : 'text-txt-secondary hover:bg-bg-tertiary'
          }`}
        >
          <Sparkles size={14} />
          AI 요약
        </button>
      </div>

      {/* 모바일 패널 오버레이 */}
      {mobilePanel && (
        <div className="md:hidden border-b border-border-divider max-h-48 overflow-y-auto">
          {mobilePanel === 'participants' && (
            <ParticipantList participants={meeting.participants || []} activeAiEmployees={activeAiEmployees} />
          )}
          {mobilePanel === 'summary' && (
            <div>
              <AISummaryPanel meetingId={id} sections={summarySections} />
              <div className="border-t border-border-divider p-4">
                <PollPanel polls={polls} onCreatePoll={handleCreatePoll} onVote={handleVote} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 데스크톱: 3컬럼 / 모바일: 채팅만 */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className="hidden md:block">
          <ParticipantList participants={meeting.participants || []} activeAiEmployees={activeAiEmployees} />
        </div>
        <ChatArea
          messages={messages}
          onSend={handleSend}
          disabled={meeting.status === 'completed'}
          aiThinking={aiThinking}
        />
        {/* 오른쪽: AI 요약 — lg+ 인라인, 태블릿 플로팅 토글 */}
        {/* lg+: 항상 보이는 인라인 패널 */}
        <div className="hidden lg:block">
          <AISummaryPanel meetingId={id} sections={summarySections} polls={polls} onCreatePoll={handleCreatePoll} onVote={handleVote} />
        </div>
        {/* md~lg: 토글 버튼 + 오버레이 패널 */}
        <button
          className="hidden md:flex lg:hidden flex-col items-center justify-start gap-1.5 w-10 shrink-0 pt-4 border-l border-border-subtle bg-bg-primary hover:bg-bg-tertiary transition-colors"
          onClick={() => setSummaryExpanded(!summaryExpanded)}
          onMouseEnter={() => setSummaryExpanded(true)}
          title="AI 요약"
        >
          <Sparkles size={16} className="text-brand-purple" />
          <span className="text-[9px] text-txt-muted font-medium">요약</span>
        </button>
        {summaryExpanded && (
          <>
            {/* 백드롭 — 바깥 클릭 시 패널 닫힘 */}
            <div
              className="lg:hidden fixed inset-0 z-30"
              onClick={() => setSummaryExpanded(false)}
            />
            <div className="lg:hidden absolute right-0 top-0 bottom-0 w-80 z-40 bg-bg-primary border-l border-border-subtle shadow-lg flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-divider">
                <span className="text-sm font-semibold text-txt-primary">AI 요약</span>
                <button onClick={() => setSummaryExpanded(false)} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <AISummaryPanel meetingId={id} sections={summarySections} polls={polls} onCreatePoll={handleCreatePoll} onVote={handleVote} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
