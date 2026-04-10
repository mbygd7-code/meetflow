import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles } from 'lucide-react';

export default function ChatBubble({ message, currentUserId }) {
  const isAi = message.is_ai;
  const isMine = !isAi && message.user_id === currentUserId;
  const senderName = isAi ? 'Milo' : message.user?.name || '알 수 없음';
  const senderColor = message.user?.color || message.user?.avatar_color || '#723CEB';
  const time = formatTime(message.created_at);

  return (
    <div
      className={`flex gap-3 fade-in ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 아바타 */}
      {isAi ? (
        <Avatar variant="ai" size="md" label="M" />
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

        {/* 말풍선 */}
        <div
          className={`px-4 py-3 text-sm text-white leading-relaxed ${
            isAi
              ? 'bg-brand-purple/10 border border-brand-purple/20 rounded-2xl rounded-tl-sm'
              : isMine
                ? 'bg-brand-purple text-white rounded-2xl rounded-tr-sm'
                : 'bg-bg-tertiary border border-white/[0.08] rounded-2xl rounded-tl-sm'
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
