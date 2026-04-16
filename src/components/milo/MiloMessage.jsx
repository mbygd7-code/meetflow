import { Badge } from '@/components/ui';
import { Sparkles } from 'lucide-react';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import MiloAvatar from './MiloAvatar';
import { formatTime } from '@/utils/formatters';

/**
 * MiloMessage — AI 직원의 채팅 메시지 버블
 *
 * @param {object} message - 메시지 객체 { content, ai_employee, created_at, user }
 */
export default function MiloMessage({ message }) {
  // 하위 호환: 레거시 'drucker' ID를 'milo'로 정규화
  const rawId = message.ai_employee || 'milo';
  const employeeId = rawId === 'drucker' ? 'milo' : rawId;
  const emp = AI_EMPLOYEES.find((e) => e.id === employeeId);
  const name = message.user?.name || emp?.name || 'Milo';
  const time = formatTime(message.created_at);

  // [이름] 접두사 제거
  const cleanContent = message.content?.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '') || '';

  return (
    <div className="flex gap-3 fade-in flex-row">
      <MiloAvatar employeeId={employeeId} size="md" />

      <div className="flex flex-col max-w-[75%] items-start">
        {/* 발신자 정보 */}
        <div className="flex items-center gap-2 mb-1 text-xs">
          <span className="font-medium text-brand-purple">{name}</span>
          <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
            <Sparkles size={10} strokeWidth={2.4} /> AI
          </Badge>
          <span className="text-txt-muted">{time}</span>
        </div>

        {/* 말풍선 */}
        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-txt-primary bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm">
          {cleanContent}
        </div>
      </div>
    </div>
  );
}
