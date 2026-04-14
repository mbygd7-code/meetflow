import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

// 메시지 [이름] 접두사에서 AI 직원 ID 감지 (DB 새로고침 후 ai_employee 없을 때 폴백)
const NAME_TO_ID = {};
AI_EMPLOYEES.forEach((e) => {
  NAME_TO_ID[e.nameKo] = e.id;
  NAME_TO_ID[e.name.toLowerCase()] = e.id;
});

function detectAiEmployee(message) {
  // 1. ai_employee 필드가 있으면 그대로 사용
  if (message.ai_employee) return message.ai_employee;
  // 2. 메시지 내용의 [이름] 접두사에서 감지
  const match = message.content?.match(/^\[([\u3131-\uD79D\w]+)\]/);
  if (match) {
    const name = match[1];
    const id = NAME_TO_ID[name] || NAME_TO_ID[name.toLowerCase()];
    if (id) return id;
  }
  // 3. 기본값: drucker (Milo)
  return 'drucker';
}

export default function ChatBubble({ message, currentUserId }) {
  const isAi = message.is_ai;
  const isMine = !isAi && message.user_id === currentUserId;

  // AI 직원 감지: ai_employee 필드 → [이름] 접두사 → 기본 Milo
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

  // AI 메시지: [이름] 접두사 제거
  const displayContent = isAi
    ? message.content?.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '')
    : message.content;

  return (
    <div
      className={`flex gap-3 fade-in ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
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
          {displayContent}
        </div>
      </div>
    </div>
  );
}
