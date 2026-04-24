import { Avatar } from '@/components/ui';
import { Slack, Globe } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

export default function ParticipantList({ participants = [], activeAiEmployees = [], autoIntervene = true, onToggleAutoIntervene }) {
  // Milo는 항상 표시, 나머지 AI는 응답한 것만
  const aiIds = ['milo', ...activeAiEmployees.filter((id) => id !== 'milo')];
  const uniqueAiIds = [...new Set(aiIds)];

  return (
    <aside className="w-[52px] lg:w-[200px] shrink-0 border-r border-border-subtle bg-bg-primary flex flex-col transition-all duration-200 overflow-visible">
      {/* 헤더: 태블릿에서는 숫자만 */}
      <div className="px-2 lg:px-4 py-4 border-b border-border-divider">
        <h3 className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider text-center lg:text-left">
          <span className="hidden lg:inline">참여자 {participants.length + uniqueAiIds.length}</span>
          <span className="lg:hidden">{participants.length + uniqueAiIds.length}</span>
        </h3>
      </div>

      {/* AI 자동 개입 토글 */}
      <label className="flex items-center justify-between px-2 lg:px-3 pt-3 pb-1 cursor-pointer group">
        <span className="hidden lg:block text-[11px] text-txt-secondary font-medium">자동 개입</span>
        <button
          type="button"
          onClick={onToggleAutoIntervene}
          className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${
            autoIntervene ? 'bg-brand-purple' : 'bg-bg-tertiary border border-border-default'
          }`}
          title={autoIntervene ? 'AI가 상황에 따라 자동 개입합니다' : 'AI는 직접 호출할 때만 응답합니다'}
        >
          <span
            className={`absolute top-1/2 -translate-y-1/2 ${autoIntervene ? 'left-[22px]' : 'left-[3px]'} w-4 h-4 rounded-full bg-white transition-all shadow-sm`}
          />
        </button>
      </label>

      <div className="flex-1 overflow-visible lg:overflow-y-auto px-1.5 lg:px-3 py-3 space-y-1">
        {/* AI 직원 목록 */}
        {uniqueAiIds.map((id) => {
          const emp = AI_EMPLOYEES.find((e) => e.id === id);
          const isMilo = id === 'milo';
          return (
            <div
              key={id}
              className={`group relative flex items-center gap-3 p-1.5 lg:p-2 rounded-md justify-center lg:justify-start ${
                isMilo ? 'bg-brand-purple/[0.06]' : 'bg-bg-tertiary/50'
              }`}
              title={emp?.nameKo || emp?.name || 'AI'}
            >
              <MiloAvatar employeeId={id} size="sm" />
              <div className="flex-1 min-w-0 hidden lg:block">
                <p className="text-sm font-medium text-txt-primary truncate">
                  {emp?.nameKo || emp?.name || 'AI'}
                </p>
                <p className="text-[10px] text-brand-purple truncate">
                  {isMilo ? 'AI 팀원' : emp?.role || 'AI 전문가'}
                </p>
              </div>
              {/* 태블릿: 호버 툴팁 */}
              <span className="lg:hidden absolute left-full ml-2 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-md bg-bg-tertiary text-txt-primary border border-border-subtle">
                {emp?.nameKo || emp?.name || 'AI'}
              </span>
            </div>
          );
        })}

        {/* 인간 참여자 */}
        {participants.map((p) => (
          <div
            key={p.id}
            className="group relative flex items-center gap-3 p-1.5 lg:p-2 rounded-md hover:bg-bg-tertiary transition-colors justify-center lg:justify-start"
            title={p.name}
          >
            <Avatar
              name={p.name}
              color={p.color}
              size="sm"
              online={p.online !== false}
            />
            <div className="flex-1 min-w-0 hidden lg:block">
              <p className="text-sm font-medium text-txt-primary truncate">
                {p.name}
              </p>
              <div className="flex items-center gap-1">
                {p.source === 'slack' ? (
                  <>
                    <Slack size={12} className="text-txt-muted" />
                    <p className="text-[10px] text-txt-muted">Slack</p>
                  </>
                ) : (
                  <>
                    <Globe size={12} className="text-txt-muted" />
                    <p className="text-[10px] text-txt-muted">Web</p>
                  </>
                )}
                {p.typing && (
                  <span className="text-[10px] text-brand-purple ml-1">입력 중…</span>
                )}
              </div>
            </div>
            {/* 태블릿: 호버 툴팁 */}
            <span className="lg:hidden absolute left-full ml-2 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-md bg-bg-tertiary text-txt-primary border border-border-subtle">
              {p.name}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
