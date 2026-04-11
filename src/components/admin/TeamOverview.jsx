import { Users } from 'lucide-react';

export default function TeamOverview({ teams = [] }) {
  return (
    <div className="space-y-2">
      {teams.length === 0 ? (
        <p className="text-sm text-txt-muted text-center py-6">팀 데이터가 없습니다</p>
      ) : (
        teams.map((team) => (
          <div
            key={team.id}
            className="flex items-center justify-between p-3 bg-bg-primary rounded-md border border-border-subtle"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-brand-purple/10 flex items-center justify-center">
                <Users size={14} className="text-brand-purple" />
              </div>
              <div>
                <p className="text-sm font-medium text-txt-primary">{team.name}</p>
                <p className="text-[10px] text-txt-muted">멤버 {team.member_count}명</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-txt-secondary">
              <span>진행 중 <strong className="text-txt-primary">{team.active_meetings}</strong></span>
              <span>완료 <strong className="text-txt-primary">{team.completed_meetings}</strong></span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
