import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign, X, Plus, Paperclip, Mic, MicOff, Keyboard } from 'lucide-react';
import ChatBubble from './ChatBubble';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { useAuthStore } from '@/stores/authStore';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useVoiceInput } from '@/hooks/useVoiceInput';

export default function ChatArea({ messages, onSend, disabled, aiThinking, onFileUpload }) {
  const [input, setInput] = useState('');
  const [quotedMessage, setQuotedMessage] = useState(null);
  const [reactions, setReactions] = useState({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // STT 설정 읽기
  const sttProvider = (() => {
    try { return JSON.parse(localStorage.getItem('meetflow_integrations') || '{}').sttProvider || 'google'; } catch { return 'google'; }
  })();

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
    const text = quotedMessage
      ? `[quote:${quotedMessage.senderName}]${quotedMessage.content.slice(0, 100)}${quotedMessage.content.length > 100 ? '...' : ''}[/quote]\n${input}`
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

      {/* 입력창 */}
      <div className="px-6 pb-5 pt-2">
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

        <div className="relative flex items-end gap-2 bg-bg-tertiary border border-border-subtle rounded-full pl-2 pr-2 py-2 focus-within:border-brand-purple/50 focus-within:ring-[3px] focus-within:ring-brand-purple/15 transition-all">
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
            onClick={() => {
              setInput((v) => (v ? v + ' @Milo ' : '@Milo '));
              textareaRef.current?.focus();
            }}
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
        {!voiceMode && (
          <p className="text-[11px] text-txt-muted mt-2 text-center">
            Enter로 전송 · Shift + Enter로 줄바꿈
          </p>
        )}

        {/* ── 음성 모드 ── */}
        {voiceMode && (
          <div className="mt-3 flex flex-col items-center gap-3">
            {/* 중간 인식 텍스트 */}
            {(interim || isListening) && (
              <div className="w-full px-4 py-2 rounded-lg bg-bg-tertiary border border-border-subtle text-sm text-txt-primary text-center min-h-[40px]">
                {interim || <span className="text-txt-muted animate-pulse">듣고 있습니다...</span>}
              </div>
            )}

            {/* 발언권 버튼 */}
            <button
              onClick={isListening ? stopSTT : startSTT}
              disabled={disabled}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                isListening
                  ? 'bg-status-error text-white scale-110 shadow-status-error/30 animate-pulse'
                  : 'bg-brand-purple text-white hover:scale-105 shadow-brand-purple/30'
              } disabled:opacity-40`}
            >
              {isListening ? <MicOff size={32} /> : <Mic size={32} />}
            </button>
            <p className="text-[11px] text-txt-muted">
              {isListening ? '발언 중... 클릭하여 종료' : '클릭하여 발언 시작'}
            </p>

            {sttError && <p className="text-[10px] text-status-error">{sttError}</p>}

            {/* 텍스트 모드로 전환 */}
            <button
              onClick={() => { setVoiceMode(false); if (isListening) stopSTT(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-txt-secondary hover:text-txt-primary bg-bg-tertiary border border-border-subtle hover:border-border-hover transition-colors"
            >
              <Keyboard size={13} />
              텍스트 모드
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
