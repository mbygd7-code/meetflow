import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign } from 'lucide-react';
import ChatBubble from './ChatBubble';
import { useAuthStore } from '@/stores/authStore';

export default function ChatArea({ messages, onSend, disabled }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const { user } = useAuthStore();

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  const handleSend = async () => {
    if (!input.trim() || disabled) return;
    const text = input;
    setInput('');
    await onSend?.(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
            <ChatBubble key={m.id} message={m} currentUserId={user?.id} />
          ))
        )}
      </div>

      {/* 입력창 */}
      <div className="px-6 pb-5 pt-2">
        <div className="relative flex items-end gap-2 bg-bg-tertiary border border-white/[0.08] rounded-full pl-5 pr-2 py-2 focus-within:border-brand-purple/50 focus-within:ring-[3px] focus-within:ring-brand-purple/15 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="의견을 입력하세요... (@Milo로 AI에게 질문)"
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-txt-muted resize-none focus:outline-none py-2 max-h-32"
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
        <p className="text-[11px] text-txt-muted mt-2 text-center">
          Enter로 전송 · Shift + Enter로 줄바꿈
        </p>
      </div>
    </div>
  );
}
