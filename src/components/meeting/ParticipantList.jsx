import { Avatar } from '@/components/ui';
import { Slack, Globe } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

export default function ParticipantList({ participants = [], activeAiEmployees = [] }) {
  // Milo(drucker)는 항상 표시, 나머지 AI는 응답한 것만
  const aiIds = ['drucker', ...activeAiEmployees.filter((id) => id !== 'drucker')];
  const uniqueAiIds = [...new Set(aiIds)];

  return (
    <aside className="w-[200px] shrink-0 border-r border-border-subtle bg-bg-primary flex flex-col">
      <div className="px-4 py-4 border-b border-border-divider">
        <h3 className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">
          참여자 {participants.length + uniqueAiIds.length}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {/* AI 직원 목록 */}
        {uniqueAiIds.map((id) => {
          const emp = AI_EMPLOYEES.find((e) => e.id === id);
          const isMilo = id === 'drucker';
          return (
            <div
              key={id}
              className={`flex items-center gap-3 p-2 rounded-md ${
                isMilo ? 'bg-brand-purple/[0.06]' : 'bg-bg-tertiary/50'
              }`}
            >
              <MiloAvatar employeeId={id} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-txt-primary truncate">
                  {emp?.nameKo || emp?.name || 'AI'}
                </p>
                <p className="text-[10px] text-brand-purple">
                  {isMilo ? 'AI 팀원' : emp?.role || 'AI 전문가'}
                </p>
              </div>
            </div>
          );
        })}

        {/* 인간 참여자 */}
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-tertiary transition-colors"
          >
            <Avatar
              name={p.name}
              color={p.color}
              size="sm"
              online={p.online !== false}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-txt-primary truncate">
                {p.name}
              </p>
              <div className="flex items-center gap-1">
                {p.source === 'slack' ? (
                  <>
                    <Slack size={10} className="text-txt-muted" />
                    <p className="text-[10px] text-txt-muted">Slack</p>
                  </>
                ) : (
                  <>
                    <Globe size={10} className="text-txt-muted" />
                    <p className="text-[10px] text-txt-muted">Web</p>
                  </>
                )}
                {p.typing && (
                  <span className="text-[10px] text-brand-purple ml-1">입력 중…</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
