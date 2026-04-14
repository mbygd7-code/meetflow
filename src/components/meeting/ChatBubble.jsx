import { useState } from 'react';
import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles, Copy, Check, Reply } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

// 메시지 [이름] 접두사에서 AI 직원 ID 감지
const NAME_TO_ID = {};
AI_EMPLOYEES.forEach((e) => {
  NAME_TO_ID[e.nameKo] = e.id;
  NAME_TO_ID[e.name.toLowerCase()] = e.id;
});

function detectAiEmployee(message) {
  if (message.ai_employee) return message.ai_employee;
  const match = message.content?.match(/^\[([\u3131-\uD79D\w]+)\]/);
  if (match) {
    const name = match[1];
    const id = NAME_TO_ID[name] || NAME_TO_ID[name.toLowerCase()];
    if (id) return id;
  }
  return 'drucker';
}

export default function ChatBubble({ message, currentUserId, onQuote }) {
  const [copied, setCopied] = useState(false);
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

  const displayContent = isAi
    ? message.content?.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '')
    : message.content;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(displayContent || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleQuote = () => {
    onQuote?.({ senderName, content: displayContent, messageId: message.id });
  };

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
        <div
          className={`flex items-center gap-2 mb-1 text-xs ${
            isMine ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <span className={`font-medium ${isAi ? 'text-brand-purple' : 'text-txt-secondary'}`}>
            {senderName}
          </span>
          {isAi && (
            <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
              <Sparkles size={10} strokeWidth={2.4} /> AI
            </Badge>
          )}
          {message.source === 'slack' && (
            <Badge variant="outline" className="!px-2 !py-0.5 !text-[10px]">
              via Slack
            </Badge>
          )}
          <span className="text-txt-muted">{time}</span>
        </div>

        {/* 말풍선 + 액션 */}
        <div className="relative">
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
            {displayContent}
          </div>

          {/* 호버 액션: 말풍선 하단에 자연스럽게 */}
          <div className={`flex gap-2 mt-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity ${isMine ? 'justify-end' : 'justify-start'}`}>
            <button
              onClick={handleCopy}
              className="p-1 text-txt-muted hover:text-txt-primary transition-colors"
              title="복사"
            >
              {copied ? <Check size={14} className="text-status-success" /> : <Copy size={14} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleQuote(); }}
              className="p-1 text-txt-muted hover:text-txt-primary transition-colors"
              title="인용 답글"
            >
              <Reply size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
