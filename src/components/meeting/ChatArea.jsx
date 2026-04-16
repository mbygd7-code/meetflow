import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign, X, Plus, Paperclip, Mic, MicOff, Keyboard, ZapOff, Zap } from 'lucide-react';
import ChatBubble from './ChatBubble';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { useAuthStore } from '@/stores/authStore';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useVoiceInput } from '@/hooks/useVoiceInput';

export default function ChatArea({ messages, onSend, disabled, aiThinking, onFileUpload, autoIntervene = true }) {
  const [input, setInput] = useState('');
  const [quotedMessage, setQuotedMessage] = useState(null);
  const [reactions, setReactions] = useState({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // 자동개입 상태 배너: 초기 OFF 상태면 10초, 토글 변경 시 5초 표시 후 자동 숨김
  const [banner, setBanner] = useState(null); // { kind: 'off' | 'on', visible: bool }
  const bannerTimerRef = useRef(null);
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    const firstMount = isFirstMountRef.current;
    isFirstMountRef.current = false;

    // 첫 마운트 & ON 상태 → 배너 표시 안 함
    if (firstMount && autoIntervene) return;

    const kind = autoIntervene ? 'on' : 'off';
    const duration = firstMount ? 10000 : 5000;
    setBanner({ kind, visible: true });
    clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setBanner((b) => (b ? { ...b, visible: false } : b));
    }, duration);
    return () => clearTimeout(bannerTimerRef.current);
  }, [autoIntervene]);

  // STT 설정 읽기 (state로 관리하여 설정 변경 즉시 반영)
  const [sttProvider] = useState(() => {
    try { return JSON.parse(localStorage.getItem('meetflow_integrations') || '{}').sttProvider || 'web-speech'; } catch { return 'web-speech'; }
  });

  const { isListening, start: startSTT, stop: stopSTT, interim, error: sttError, supported: sttSupported } = useVoiceInput({
    provider: sttProvider,
    language: 'ko-KR',
    onTranscript: (text) => {
      if (text.trim()) onSend?.(text.trim());
    },
    onInterim: () => {},
  });
  const { user } = useAuthStore();

  const handleReact = (messageId, key) => {
    const userName = user?.name || '나';
    setReactions((prev) => {
      const msg = { ...(prev[messageId] || {}) };
      const existing = msg[key] || { count: 0, users: [] };
      // 이미 반응한 경우 토글 (제거)
      if (existing.users.includes(userName)) {
        msg[key] = { count: existing.count - 1, users: existing.users.filter((u) => u !== userName) };
        if (msg[key].count <= 0) delete msg[key];
      } else {
        msg[key] = { count: existing.count + 1, users: [...existing.users, userName] };
      }
      return { ...prev, [messageId]: msg };
    });
  };

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, aiThinking]);

  const handleSend = async () => {
    if (!input.trim() || disabled) return;
    // 인용 원문 전체 저장 (클릭 시 전체 펼침 가능하도록) — 디스플레이는 line-clamp로 제어
    const text = quotedMessage
      ? `[quote:${quotedMessage.senderName}]${quotedMessage.content}[/quote]\n${input}`
      : input;
    setInput('');
    setQuotedMessage(null);
    await onSend?.(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuote = (quote) => {
    setQuotedMessage(quote);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 메시지 리스트 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-txt-muted text-sm">
            첫 메시지를 보내 회의를 시작하세요
          </div>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} message={m} currentUserId={user?.id} onQuote={handleQuote} onReact={handleReact} reactions={reactions} />
          ))
        )}

        {/* AI 생각 중 표시 */}
        {aiThinking?.active && (
          <div className="flex gap-3 fade-in">
            <MiloAvatar employeeId={aiThinking.employeeId} size="md" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium text-brand-purple mb-1">
                {AI_EMPLOYEES.find((e) => e.id === aiThinking.employeeId)?.nameKo || 'Milo'}
              </span>
              <div className="px-4 py-3 bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-purple/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-brand-purple/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-brand-purple/60 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 입력창 — 섹션은 솔리드 bg로 고정, 위쪽에 별도 페이드 레이어를 올려 메시지 페이드 효과 */}
      <div className="relative px-6 pb-5 pt-2" style={{ background: 'var(--bg-primary)' }}>
        {/* 메시지창 위로 올라가는 페이드 레이어 (더 높이 올림) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-16"
          style={{ background: 'linear-gradient(to top, var(--bg-primary) 0%, transparent 100%)' }}
        />
        {/* 자동개입 상태 배너 — 토글 변경/초기 OFF 시 일정 시간 표시 후 자동 사라짐 */}
        {banner && (
          <div
            className={`inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all duration-300 ${
              banner.visible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-1 pointer-events-none'
            } ${
              banner.kind === 'off'
                ? 'bg-status-error text-white border border-status-error'
                : 'bg-status-success text-white border border-status-success'
            }`}
          >
            {banner.kind === 'off' ? (
              <>
                <ZapOff size={13} strokeWidth={2.4} />
                <span>AI 자동 개입 OFF — <span className="font-bold">@밀로</span>/<span className="font-bold">@전문가</span>로 호출하세요</span>
              </>
            ) : (
              <>
                <Zap size={13} strokeWidth={2.4} />
                <span>AI 자동 개입 ON — 필요한 순간 AI가 자동 응답합니다</span>
              </>
            )}
          </div>
        )}
        {/* 인용 프리뷰 */}
        {quotedMessage && (
          <div className="flex items-start gap-2 mb-2 px-4 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-xs">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-brand-purple">{quotedMessage.senderName}</span>
              <p className="text-txt-secondary mt-0.5 line-clamp-2">{quotedMessage.content}</p>
            </div>
            <button onClick={() => setQuotedMessage(null)} className="p-0.5 text-txt-muted hover:text-txt-primary shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
          onChange={(e) => {
            Array.from(e.target.files || []).forEach((f) => onFileUpload?.(f));
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* 입력 영역: 텍스트 ↔ 음성 트랜지션 */}
        <div className="flex flex-col items-center gap-0">
          {!voiceMode ? ( <>
            {/* ── 텍스트 모드 (필 형태) ── */}
            <div className="w-full relative flex items-end gap-2 bg-bg-tertiary border border-border-subtle rounded-full pl-2 pr-2 py-2 focus-within:border-brand-purple/50 focus-within:ring-[3px] focus-within:ring-brand-purple/15 transition-all duration-500 ease-out">
              {/* + 메뉴 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                  className={`p-2 rounded-full transition-colors ${plusMenuOpen ? 'text-brand-purple bg-brand-purple/10' : 'text-txt-muted hover:text-brand-purple'}`}
                >
                  <Plus size={16} strokeWidth={2.4} />
                </button>
                {plusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPlusMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-44 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-20 py-1">
                      <button
                        onClick={() => { setPlusMenuOpen(false); fileInputRef.current?.click(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors"
                      >
                        <Paperclip size={15} className="text-txt-muted" />
                        자료 업로드
                      </button>
                      <button
                        onClick={() => { setPlusMenuOpen(false); setVoiceMode(true); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors"
                      >
                        <Mic size={15} className="text-txt-muted" />
                        음성 모드
                      </button>
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="의견을 입력하세요..."
                rows={1}
                disabled={disabled}
                className="flex-1 bg-transparent text-sm text-txt-primary placeholder:text-txt-muted resize-none focus:outline-none py-2 max-h-32"
              />
              <button
                type="button"
                className="p-2 text-txt-muted hover:text-brand-purple transition-colors"
                onClick={() => { setInput((v) => (v ? v + ' @Milo ' : '@Milo ')); textareaRef.current?.focus(); }}
                title="Milo 호출"
              >
                <AtSign size={16} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || disabled}
                className="w-9 h-9 rounded-full bg-brand-purple text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            </div>
            <p className="text-[11px] text-txt-muted mt-2 text-center w-full">
              Enter로 전송 · Shift + Enter로 줄바꿈
            </p>
            </> ) : (
            /* ── 음성 모드 ── */
            <div className="flex flex-col items-center gap-3 transition-all duration-500 ease-out">
              {/* 인식 텍스트 */}
              {(interim || isListening) && (
                <div className="px-5 py-2 rounded-full bg-bg-tertiary/80 border border-border-subtle text-sm text-txt-primary text-center max-w-[80%]">
                  {interim || <span className="text-txt-muted animate-pulse">듣고 있습니다...</span>}
                </div>
              )}

              {/* 상단: [@] 멘션 버튼 (마이크 위) */}
              <div className="flex items-center justify-center">
                <button
                  onClick={() => { setVoiceMode(false); setInput((v) => (v ? v + ' @Milo ' : '@Milo ')); textareaRef.current?.focus(); }}
                  className="w-7 h-7 rounded-full bg-bg-tertiary border border-border-subtle text-txt-muted hover:text-brand-purple hover:border-brand-purple/30 hover:scale-125 hover:shadow-md flex items-center justify-center transition-all duration-200"
                  title="Milo 호출"
                >
                  <AtSign size={13} />
                </button>
              </div>

              {/* 하단: [+] [마이크] [T] 가로 */}
              <div className="flex items-center gap-3">
                {/* + 자료 업로드 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 rounded-full bg-bg-tertiary border border-border-subtle text-txt-muted hover:text-brand-purple hover:border-brand-purple/30 hover:scale-125 hover:shadow-md flex items-center justify-center transition-all duration-200"
                  title="자료 업로드"
                >
                  <Plus size={13} />
                </button>

                {/* 마이크 */}
                <button
                  onClick={isListening ? stopSTT : startSTT}
                  disabled={disabled || !sttSupported}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-110 ${
                    isListening
                      ? 'bg-status-error text-white shadow-status-error/40'
                      : 'bg-brand-purple text-white hover:shadow-brand-purple/40'
                  } disabled:opacity-40`}
                >
                  {isListening && (
                    <span className="absolute inset-0 rounded-full bg-status-error/30 animate-ping" />
                  )}
                  {isListening ? <MicOff size={26} /> : <Mic size={26} />}
                </button>

                {/* 텍스트 모드 */}
                <button
                  onClick={() => { setVoiceMode(false); if (isListening) stopSTT(); }}
                  className="w-7 h-7 rounded-full bg-bg-tertiary border border-border-subtle text-txt-muted hover:text-txt-primary hover:border-border-hover hover:scale-125 hover:shadow-md flex items-center justify-center transition-all duration-200"
                  title="텍스트 모드"
                >
                  <Keyboard size={13} />
                </button>
              </div>

              <p className="text-[10px] text-txt-muted">
                {isListening ? '발언 중 · 클릭하여 종료' : '클릭하여 발언'}
              </p>
              {sttError && <p className="text-xs text-status-error">{sttError}</p>}
              {!sttSupported && <p className="text-xs text-status-error">이 브라우저에서 음성 인식이 지원되지 않습니다</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
