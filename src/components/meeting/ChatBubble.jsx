import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles } from 'lucide-react';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

export default function ChatBubble({ message, currentUserId }) {
  const isAi = message.is_ai;
  const isMine = !isAi && message.user_id === currentUserId;
  const senderName = isAi ? (message.user?.name || 'Milo') : (message.user?.name || '알 수 없음');
  const senderColor = message.user?.color || message.user?.avatar_color || '#723CEB';
  const time = formatTime(message.created_at);
  const isMilo = isAi && (!message.ai_employee || message.ai_employee === 'drucker');

  // AI 직원 사진 찾기
  const aiEmployee = isAi ? AI_EMPLOYEES.find((e) => e.id === message.ai_employee) : null;

  return (
    <div
      className={`flex gap-3 fade-in ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 아바타 */}
      {isAi ? (
        isMilo ? (
          <Avatar variant="ai" size="md" label="Mi" />
        ) : aiEmployee?.avatar ? (
          <Avatar
            name={aiEmployee.nameKo}
            src={aiEmployee.avatar}
            color={aiEmployee.color}
            size="md"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: senderColor }}
          >
            {senderName.slice(0, 2)}
          </div>
        )
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
          className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isAi
              ? 'text-txt-primary bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm'
              : isMine
                ? 'bg-brand-purple text-white rounded-xl rounded-tr-sm'
                : 'text-txt-primary bg-bg-tertiary border border-border-subtle rounded-xl rounded-tl-sm'
          }`}
        >
          {isAi
            ? message.content.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '')
            : message.content}
        </div>
      </div>
    </div>
  );
}
