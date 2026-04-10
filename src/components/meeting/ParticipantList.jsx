import { Avatar } from '@/components/ui';
import { Slack, Globe } from 'lucide-react';

export default function ParticipantList({ participants = [] }) {
  return (
    <aside className="w-[200px] shrink-0 border-r border-white/[0.08] bg-bg-primary flex flex-col">
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">
          참여자 {participants.length + 1}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {/* Milo AI 항상 첫 줄 */}
        <div className="flex items-center gap-3 p-2 rounded-md bg-brand-purple/[0.06]">
          <Avatar variant="ai" size="sm" label="M" online />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Milo</p>
            <p className="text-[10px] text-brand-purple">AI 팀원</p>
          </div>
        </div>

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
              <p className="text-sm font-medium text-white truncate">
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
