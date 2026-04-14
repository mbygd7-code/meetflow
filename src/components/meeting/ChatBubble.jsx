import { useState } from 'react';
import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles, Copy, Check, Reply, SmilePlus, ThumbsUp, ThumbsDown, Heart } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

const NAME_TO_ID = {};
AI_EMPLOYEES.forEach((e) => {
  NAME_TO_ID[e.nameKo] = e.id;
  NAME_TO_ID[e.name.toLowerCase()] = e.id;
});

function detectAiEmployee(message) {
  if (message.ai_employee) return message.ai_employee;
  const match = message.content?.match(/^\[([\u3131-\uD79D\w]+)\]/);
  if (match) {
    const id = NAME_TO_ID[match[1]] || NAME_TO_ID[match[1].toLowerCase()];
    if (id) return id;
  }
  return 'drucker';
}

const REACTIONS = [
  { key: 'like', icon: ThumbsUp, label: '좋아요' },
  { key: 'dislike', icon: ThumbsDown, label: '별로예요' },
  { key: 'heart', icon: Heart, label: '하트' },
];

export default function ChatBubble({ message, currentUserId, onQuote, onReact, reactions = {} }) {
  const [copied, setCopied] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const isAi = message.is_ai;
  const isMine = !isAi && message.user_id === currentUserId;

  const employeeId = isAi ? detectAiEmployee(message) : null;
  const emp = employeeId ? AI_EMPLOYEES.find((e) => e.id === employeeId) : null;

  let senderName;
  if (isAi) {
    senderName = emp?.nameKo || emp?.name || message.user?.name || 'Milo';
  } else {
    senderName = message.user?.name || '알 수 없음';
  }

  const senderColor = message.user?.color || message.user?.avatar_color || '#723CEB';
  const time = formatTime(message.created_at);

  const rawContent = isAi
    ? message.content?.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '')
    : message.content;

  // 인용문 파싱: [quote:이름]내용[/quote]\n본문
  const quoteMatch = rawContent?.match(/^\[quote:(.+?)\]([\s\S]*?)\[\/quote\]\n?([\s\S]*)$/);
  // 레거시 호환: > 이름: 내용\n\n본문
  const legacyMatch = !quoteMatch && rawContent?.match(/^>\s*(.+?):\s*(.+?)(?:\n\n)([\s\S]*)$/);
  const match = quoteMatch || legacyMatch;
  const quotedSender = match?.[1];
  const quotedText = match?.[2]?.trim();
  const displayContent = match ? match[3] : rawContent;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(displayContent || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleQuote = () => {
    onQuote?.({ senderName, content: displayContent, messageId: message.id });
  };

  const handleReact = (key) => {
    onReact?.(message.id, key);
    setReactOpen(false);
  };

  // 이 메시지의 리액션 집계
  const msgReactions = reactions[message.id] || {};
  const hasReactions = Object.values(msgReactions).some((v) => v?.count > 0);

  return (
    <div
      className={`group/bubble flex gap-3 fade-in ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 아바타 */}
      {isAi ? (
        <MiloAvatar employeeId={employeeId} size="md" />
      ) : (
        <Avatar name={senderName} color={senderColor} size="md" />
      )}

      {/* 메시지 컨테이너 */}
      <div className={`flex flex-col max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
        {/* 발신자 정보 */}
        <div className={`flex items-center gap-2 mb-1 text-xs ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className={`font-medium ${isAi ? 'text-brand-purple' : 'text-txt-secondary'}`}>
            {senderName}
          </span>
          {isAi && (
            <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
              <Sparkles size={10} strokeWidth={2.4} /> AI
            </Badge>
          )}
          {message.source === 'slack' && (
            <Badge variant="outline" className="!px-2 !py-0.5 !text-[10px]">via Slack</Badge>
          )}
          <span className="text-txt-muted">{time}</span>
        </div>

        {/* 말풍선 */}
        <div className="relative">
          {/* 리액션 표시 — 말풍선 상단 */}
          {hasReactions && (
            <div className={`flex gap-1.5 mb-1.5 ${isMine ? 'justify-start' : 'justify-end'}`}>
              {REACTIONS.map(({ key, icon: Icon }) => {
                const data = msgReactions[key];
                if (!data?.count) return null;
                return (
                  <span
                    key={key}
                    className="group/react relative inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary cursor-default"
                  >
                    <Icon size={14} />
                    {data.count}
                    {/* 호버 시 리액션한 직원 이름 */}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md text-[10px] whitespace-nowrap bg-bg-primary border border-border-subtle shadow-md opacity-0 pointer-events-none group-hover/react:opacity-100 transition-opacity z-10">
                      {data.users.join(', ')}
                    </span>
                  </span>
                );
              })}
            </div>
          )}

          <div
            onClick={handleQuote}
            className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap cursor-pointer ${
              isAi
                ? 'text-txt-primary bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm hover:border-brand-purple/40'
                : isMine
                  ? 'bg-brand-purple text-white rounded-xl rounded-tr-sm hover:opacity-90'
                  : 'text-txt-primary bg-bg-tertiary border border-border-subtle rounded-xl rounded-tl-sm hover:border-border-default'
            } transition-all`}
          >
            {/* 인용 블록 */}
            {quotedSender && (
              <div className={`mb-2 pl-3 py-1.5 text-xs leading-relaxed rounded-md ${
                isMine
                  ? 'border-l-2 border-white/40 bg-white/10'
                  : 'border-l-2 border-brand-purple/40 bg-brand-purple/5'
              }`}>
                <span className="font-semibold">{quotedSender}</span>
                <p className="mt-0.5 opacity-80 line-clamp-2">{quotedText}</p>
              </div>
            )}
            {displayContent}
          </div>

          {/* 호버 액션 */}
          <div className="flex gap-2 mt-1.5 justify-end opacity-0 group-hover/bubble:opacity-100 transition-opacity">
            <button onClick={handleCopy} className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors" title="복사">
              {copied ? <Check size={16} className="text-status-success" /> : <Copy size={16} />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); handleQuote(); }} className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors" title="인용 답글">
              <Reply size={16} />
            </button>
            {/* 리액션 토글 */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setReactOpen(!reactOpen); }}
                className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors"
                title="반응"
              >
                <SmilePlus size={16} />
              </button>
              {reactOpen && (
                <div className="absolute bottom-full right-0 mb-1 flex gap-1 px-2 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle shadow-md z-10">
                  {REACTIONS.map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={(e) => { e.stopPropagation(); handleReact(key); }}
                      className="p-1.5 rounded-md hover:bg-bg-tertiary text-txt-muted hover:text-txt-primary transition-colors"
                      title={label}
                    >
                      <Icon size={18} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
