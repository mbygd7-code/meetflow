// 회의 참여자 섹션 — 사람 + AI 전문가
import { Avatar } from '@/components/ui';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

/**
 * @param {{
 *   humanNames: string[],        // 사람 참가자 이름 배열 (메시지에서 추출)
 *   humanCounts?: Record<string, number>, // 이름별 메시지 수
 *   aiEmployees: string[],       // AI 직원 ID 배열
 *   aiCounts?: Record<string, number>,    // id별 메시지 수
 * }} props
 */
export default function MeetingParticipants({
  humanNames = [],
  humanCounts = {},
  aiEmployees = [],
  aiCounts = {},
}) {
  const hasHuman = humanNames.length > 0;
  const hasAi = aiEmployees.length > 0;
  if (!hasHuman && !hasAi) return null;

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-[10px] p-4 mb-5">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* 사람 참가자 */}
        {hasHuman && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] text-txt-muted uppercase tracking-wider font-semibold">
                참가자
              </span>
              <span className="text-xs text-txt-muted">{humanNames.length}명</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {humanNames.map((name) => {
                const count = humanCounts[name] || 0;
                return (
                  <div
                    key={name}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-tertiary border border-border-subtle"
                  >
                    <Avatar name={name} size="sm" className="!w-5 !h-5 !text-[9px]" />
                    <span className="text-[11px] font-medium text-txt-primary">{name}</span>
                    {count > 0 && (
                      <span className="text-[10px] text-txt-muted">{count}건</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 구분선 */}
        {hasHuman && hasAi && (
          <div className="hidden md:block w-px self-stretch bg-border-divider" />
        )}

        {/* AI 전문가 */}
        {hasAi && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[10px] text-txt-muted uppercase tracking-wider font-semibold">
                참여 AI
              </span>
              <span className="text-xs text-txt-muted">{aiEmployees.length}명</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {aiEmployees.map((id) => {
                const emp = AI_EMPLOYEES.find((e) => e.id === id);
                if (!emp) return null;
                const count = aiCounts[id] || 0;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-purple/[0.08] border border-brand-purple/20"
                  >
                    <MiloAvatar employeeId={id} size="sm" />
                    <span className="text-[11px] font-medium text-txt-primary">
                      {emp.nameKo}
                    </span>
                    {count > 0 && (
                      <span className="text-[10px] text-brand-purple">{count}건</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
