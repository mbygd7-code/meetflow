import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Square, Sparkles, Zap, ZapOff, FileText, FolderOpen, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { clearSessionState } from '@/lib/harness';
import { Badge } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useMilo } from '@/hooks/useMilo';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useMeetingStore } from '@/stores/meetingStore';
import ChatArea from './ChatArea';
import AgendaBar from './AgendaBar';
import PollPanel from './PollPanel';

// ── 자료 패널 (왼쪽 접힘/펼침) ──
function DocumentPanel({ files = [], expanded, onToggle }) {
  const [previewFile, setPreviewFile] = useState(null);

  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="hidden md:flex flex-col items-center justify-start gap-2 w-10 shrink-0 pt-4 border-r border-border-subtle bg-bg-primary hover:bg-bg-tertiary transition-colors"
        title="자료 패널 열기"
      >
        <FolderOpen size={16} className="text-txt-muted" />
        {files.length > 0 && (
          <span className="text-[9px] font-bold text-brand-purple bg-brand-purple/10 rounded-full w-5 h-5 flex items-center justify-center">
            {files.length}
          </span>
        )}
        <ChevronRight size={12} className="text-txt-muted" />
      </button>
    );
  }

  return (
    <aside className="hidden md:flex flex-col w-[280px] shrink-0 border-r border-border-subtle bg-bg-primary transition-all">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-divider">
        <div className="flex items-center gap-2">
          <FolderOpen size={14} className="text-brand-purple" />
          <span className="text-sm font-semibold text-txt-primary">자료</span>
          <span className="text-[10px] text-txt-muted">{files.length}개</span>
        </div>
        <button onClick={onToggle} className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded transition-colors">
          <ChevronLeft size={14} />
        </button>
      </div>

      {/* 프리뷰 (전체 패널 사용) */}
      {previewFile ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-divider">
            <span className="text-[11px] font-medium text-txt-primary truncate flex-1 mr-2">{previewFile.name}</span>
            <button onClick={() => setPreviewFile(null)} className="p-1 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-bg-tertiary/30">
            {previewFile.type?.startsWith('image/') ? (
              <img src={previewFile.url || previewFile.preview} alt={previewFile.name} className="max-w-full max-h-full rounded-md object-contain shadow-md" />
            ) : previewFile.type === 'application/pdf' ? (
              <iframe
                src={previewFile.url || previewFile.preview}
                className="w-full h-full rounded-md border border-border-subtle"
                title={previewFile.name}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-txt-muted">
                <FileText size={48} strokeWidth={1.5} />
                <p className="text-sm font-medium">{previewFile.name}</p>
                <p className="text-[11px]">{(previewFile.size / 1024).toFixed(0)}KB · {previewFile.type || '알 수 없는 형식'}</p>
              </div>
            )}
          </div>
          {/* 파일 목록 (축소) */}
          <div className="border-t border-border-divider px-3 py-2 space-y-1 max-h-24 overflow-y-auto">
            {files.map((f) => (
              <button
                key={f.id || f.name}
                onClick={() => setPreviewFile(f)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[10px] transition-colors ${
                  previewFile?.name === f.name ? 'bg-brand-purple/10 text-brand-purple font-medium' : 'text-txt-secondary hover:bg-bg-tertiary'
                }`}
              >
                <FileText size={10} className="shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
      /* 파일 리스트 (프리뷰 없을 때) */
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {files.length === 0 ? (
          <div className="text-center py-8 text-txt-muted">
            <FolderOpen size={20} className="mx-auto mb-2 opacity-40" />
            <p className="text-[11px]">첨부된 자료가 없습니다</p>
            <p className="text-[10px] mt-1">채팅 입력창의 + 버튼으로 업로드하세요</p>
          </div>
        ) : (
          files.map((f) => (
            <button
              key={f.id || f.name}
              onClick={() => setPreviewFile(previewFile?.name === f.name ? null : f)}
              className={`w-full flex items-center gap-2.5 p-2 rounded-md text-left transition-colors ${
                previewFile?.name === f.name
                  ? 'bg-brand-purple/10 border border-brand-purple/20'
                  : 'bg-bg-tertiary/50 border border-transparent hover:border-border-subtle'
              }`}
            >
              <div className="w-8 h-8 rounded bg-bg-tertiary flex items-center justify-center shrink-0">
                {f.type?.startsWith('image/') ? (
                  <img src={f.url || f.preview} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <FileText size={14} className="text-txt-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-txt-primary truncate">{f.name}</p>
                <p className="text-[9px] text-txt-muted">{(f.size / 1024).toFixed(0)}KB</p>
              </div>
            </button>
          ))
        )}
      </div>
      )}
    </aside>
  );
}

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getById, endMeeting } = useMeeting();
  const setActiveMeetingId = useMeetingStore((s) => s.setActiveMeetingId);
  const meeting = getById(id);
  const [activeAgendaId, setActiveAgendaId] = useState(null);
  const [aiThinking, setAiThinking] = useState(null);
  const [polls, setPolls] = useState([]);
  const [ending, setEnding] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [leavingConfirmed, setLeavingConfirmed] = useState(false);
  // 자동개입 상태: localStorage에 영속 저장 (페이지 새로고침 유지)
  const [aiAutoIntervene, setAiAutoIntervene] = useState(() => {
    try {
      const saved = localStorage.getItem('meetflow_auto_intervene');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try { localStorage.setItem('meetflow_auto_intervene', String(aiAutoIntervene)); } catch {}
  }, [aiAutoIntervene]);
  const [docPanelExpanded, setDocPanelExpanded] = useState(false);
  const [meetingFiles, setMeetingFiles] = useState([]); // 회의 자료
  const { messages, sendMessage } = useRealtimeMessages(id);

  // 활성 회의 등록
  useEffect(() => {
    if (meeting?.status === 'active') setActiveMeetingId(id);
    return () => { if (ending) setActiveMeetingId(null); };
  }, [id, meeting?.status, ending, setActiveMeetingId]);

  // 브라우저 탭 닫기 방지
  useEffect(() => {
    if (meeting?.status !== 'active' || ending) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [meeting?.status, ending]);

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
      : meeting?.agendas?.find((a) => a.status === 'active')?.id || meeting?.agendas?.[0]?.id;
    return meeting?.agendas?.find((a) => a.id === targetId);
  }, [activeAgendaId, meeting]);

  const isAiOnlyMeeting = useMemo(() => {
    const aiIds = AI_EMPLOYEES.map((e) => e.id);
    const humanParticipants = (meeting?.participants || []).filter(
      (p) => p.id !== 'milo' && !aiIds.includes(p.id)
    );
    return humanParticipants.length <= 1;
  }, [meeting]);

  // Polls
  const handleCreatePoll = useCallback(({ question, options }) => {
    const newPoll = { id: `poll-${Date.now()}`, question, options, votes: {}, myVote: null, created_at: new Date().toISOString() };
    setPolls((prev) => [newPoll, ...prev]);
    sendMessage(`📊 투표가 생성되었습니다: "${question}"`, { agendaId: currentAgenda?.id, isAi: true, aiType: 'nudge', aiEmployee: 'milo' });
  }, [sendMessage, currentAgenda]);

  const handleVote = useCallback((pollId, optionIndex) => {
    setPolls((prev) => prev.map((p) => {
      if (p.id !== pollId) return p;
      const votes = { ...p.votes };
      votes[optionIndex] = (votes[optionIndex] || 0) + 1;
      return { ...p, votes, myVote: optionIndex };
    }));
  }, []);

  // Milo AI
  // 동일 응답 텍스트가 짧은 시간 내에 중복 전송되는 것을 방어 (최종 방어선)
  const sentResponseHashesRef = useRef(new Map()); // text → timestamp
  const handleMiloRespond = useCallback(async (result) => {
    if (!result?.response_text) return;
    const hash = `${result.ai_employee || 'milo'}::${result.response_text.slice(0, 100)}`;
    const now = Date.now();
    const prevTime = sentResponseHashesRef.current.get(hash);
    if (prevTime && now - prevTime < 10000) {
      console.warn('[MeetingRoom] Duplicate AI response blocked:', hash.slice(0, 60));
      return;
    }
    sentResponseHashesRef.current.set(hash, now);
    // 오래된 해시 정리 (메모리 누수 방지)
    if (sentResponseHashesRef.current.size > 50) {
      const cutoff = now - 60000;
      for (const [k, t] of sentResponseHashesRef.current.entries()) {
        if (t < cutoff) sentResponseHashesRef.current.delete(k);
      }
    }
    await sendMessage(result.response_text, {
      agendaId: currentAgenda?.id, isAi: true, aiType: result.ai_type,
      aiEmployee: result.ai_employee || 'milo', searchSources: result.search_sources || null,
    });
  }, [sendMessage, currentAgenda]);

  const handleThinking = useCallback((active, employeeId) => {
    setAiThinking(active ? { active: true, employeeId } : null);
  }, []);

  // AI 에러 토스트 (3초 자동 사라짐)
  const [aiError, setAiError] = useState(null);
  const aiErrorTimerRef = useRef(null);
  const handleAiError = useCallback((err) => {
    setAiError(err);
    clearTimeout(aiErrorTimerRef.current);
    aiErrorTimerRef.current = setTimeout(() => setAiError(null), 4000);
  }, []);

  useMilo({
    messages, agenda: currentAgenda, onRespond: handleMiloRespond,
    onThinking: handleThinking, onError: handleAiError,
    meetingId: id, alwaysRespond: isAiOnlyMeeting, autoIntervene: aiAutoIntervene,
  });

  // AI 인사
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current || !meeting || meeting.status !== 'active') return;
    const hasAiMessage = messages.some((m) => m.is_ai);
    if (hasAiMessage) { greetedRef.current = true; return; }
    if (messages.length === 0 && !greetedRef.current) {
      const checkTimer = setTimeout(() => {
        greetedRef.current = true;
        const userName = meeting.participants?.[0]?.name || '여러분';
        sendMessage(
          `안녕하세요, ${userName}님! 킨더보드 회의 진행자 밀로입니다. 오늘 회의 주제나 논의하고 싶은 안건이 있으시면 알려주세요.`,
          { agendaId: meeting?.agendas?.[0]?.id, isAi: true, aiType: 'nudge', aiEmployee: 'milo' }
        );
      }, 2000);
      return () => clearTimeout(checkTimer);
    }
  }, [meeting, messages, sendMessage]);

  // 파일 업로드 핸들러 (ChatArea에서 호출)
  const handleFileUpload = useCallback((file) => {
    const preview = file.type?.startsWith('image/') ? URL.createObjectURL(file) : null;
    setMeetingFiles((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, preview, file }]);
    if (!docPanelExpanded) setDocPanelExpanded(true);
  }, [docPanelExpanded]);

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center text-txt-secondary">
        <div className="text-center">
          <p className="text-sm mb-3">회의를 찾을 수 없습니다.</p>
          <button onClick={() => navigate('/meetings')} className="text-brand-purple hover:text-txt-primary text-xs">회의 목록으로 돌아가기</button>
        </div>
      </div>
    );
  }

  const handleEndClick = () => {
    setConfirmingEnd(true);
  };

  const handleCancelEnd = () => {
    setConfirmingEnd(false);
  };

  const handleConfirmEnd = async () => {
    setConfirmingEnd(false);
    setEnding(true);
    setActiveMeetingId(null);
    try { await endMeeting(id, { messages, agendas: meeting.agendas || [] }); } catch (err) { console.error('[handleConfirmEnd]', err); }
    clearSessionState(id); // AI 세션 데이터 정리
    setEnding(false);
    setLeavingConfirmed(true);
    navigate(`/summaries/${id}`);
  };

  const handleSend = async (content) => {
    await sendMessage(content, { agendaId: currentAgenda?.id });
  };

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* 종료 확인 / 로딩 오버레이 — Portal로 body 직접 렌더링 (LNB 위로) */}
      {(ending || confirmingEnd) && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/10 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-bg-secondary border border-border-subtle rounded-xl p-8 max-w-sm mx-4 text-center shadow-lg">
            <div className="w-14 h-14 rounded-full bg-gradient-brand shadow-glow flex items-center justify-center mx-auto mb-4">
              <Sparkles size={24} className={`text-white ${ending ? 'animate-pulse' : ''}`} strokeWidth={2} />
            </div>
            {ending ? (
              <>
                <h3 className="text-lg font-semibold text-txt-primary mb-2">AI 인사이트 준비 중</h3>
                <p className="text-sm text-txt-secondary">Milo가 회의 내용을 분석하고 요약을 생성하고 있습니다...</p>
                <div className="flex justify-center gap-1 mt-4">
                  <span className="w-2 h-2 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-brand-purple animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-txt-primary mb-2">회의를 종료하시겠습니까?</h3>
                <p className="text-sm text-txt-secondary mb-6">Milo가 자동으로 회의록과 요약을 생성합니다.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelEnd}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-border-default text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleConfirmEnd}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    회의록 작성
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ═══ 헤더 ═══ */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-border-divider">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => safeNavigate('/meetings')} className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors shrink-0">
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

        {/* 우측 액션: 자동개입 토글 + 요약 + 회의 종료 */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* 자동개입 토글 */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-[10px] text-txt-muted font-medium">자동개입</span>
            <button
              onClick={() => setAiAutoIntervene((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                aiAutoIntervene ? 'bg-brand-purple' : 'bg-bg-tertiary border border-border-default'
              }`}
              title={aiAutoIntervene ? 'AI 자동 개입 ON' : 'AI 직접 호출만'}
            >
              <span className={`absolute top-1/2 -translate-y-1/2 ${aiAutoIntervene ? 'left-[18px]' : 'left-[3px]'} w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm`} />
            </button>
          </div>

          {/* 모바일 자동개입 */}
          <button
            onClick={() => setAiAutoIntervene((v) => !v)}
            className={`md:hidden p-1.5 rounded-md transition-colors ${aiAutoIntervene ? 'text-brand-purple bg-brand-purple/10' : 'text-txt-muted'}`}
            title={aiAutoIntervene ? 'AI 자동 개입 ON' : 'AI 직접 호출만'}
          >
            {aiAutoIntervene ? <Zap size={16} /> : <ZapOff size={16} />}
          </button>

          {/* 요약 버튼 */}
          <Link
            to={`/summaries/${id}`}
            className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium text-brand-purple bg-brand-purple/10 border border-brand-purple/20 hover:bg-brand-purple/20 transition-colors"
          >
            <Sparkles size={13} />
            <span className="hidden md:inline">요약</span>
          </Link>

          {/* 회의 종료 */}
          <button
            onClick={handleEndClick}
            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-xs md:text-sm font-medium hover:bg-status-error/20 transition-colors"
          >
            <Square size={14} strokeWidth={2.4} />
            <span className="hidden md:inline">회의 종료</span>
            <span className="md:hidden">종료</span>
          </button>
        </div>
      </div>

      {/* 어젠다 바 */}
      <AgendaBar agendas={meeting.agendas || []} activeId={currentAgenda?.id} onSelect={setActiveAgendaId} />

      {/* ═══ 메인: 자료 패널 + 채팅 ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 자료 패널 (데스크톱) */}
        <DocumentPanel
          files={meetingFiles}
          expanded={docPanelExpanded}
          onToggle={() => setDocPanelExpanded((v) => !v)}
        />

        {/* 채팅 영역 */}
        <ChatArea
          messages={messages}
          onSend={handleSend}
          disabled={meeting.status === 'completed'}
          aiThinking={aiThinking}
          onFileUpload={handleFileUpload}
          autoIntervene={aiAutoIntervene}
          aiError={aiError}
        />
      </div>
    </div>
  );
}
