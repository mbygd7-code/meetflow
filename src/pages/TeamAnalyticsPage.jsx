import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, Calendar, CheckCircle2, TrendingUp, MessageSquare, Clock, BarChart3 } from 'lucide-react';
import { MetricCard, SectionPanel, Card, Badge } from '@/components/ui';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import WeeklyChart from '@/components/ui/WeeklyChart';

const TEAMS = [
  { id: 'team-1', name: '프로덕트 팀', color: '#FF902F', members: ['u1', 'u2', 'u3'] },
  { id: 'team-2', name: '디자인 팀', color: '#F472B6', members: ['u4', 'u5'] },
  { id: 'team-3', name: '엔지니어링 팀', color: '#38BDF8', members: ['u6', 'u7', 'u8'] },
];

const MEMBER_MAP = {
  u1: '김지우', u2: '박서연', u3: '이도윤', u4: '최하린',
  u5: '정민수', u6: '한소율', u7: '오재현', u8: '윤서아',
};

export default function TeamAnalyticsPage() {
  const { pageTitle } = useOutletContext() || {};
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();

  const analytics = useMemo(() => {
    const totalMeetings = meetings.length;
    const completedMeetings = meetings.filter((m) => m.status === 'completed').length;
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const totalMembers = TEAMS.reduce((sum, t) => sum + t.members.length, 0);

    // 팀별 분석
    const teamStats = TEAMS.map((team) => {
      const teamTasks = tasks.filter((t) => team.members.includes(t.assignee_id));
      const teamDone = teamTasks.filter((t) => t.status === 'done').length;
      const teamInProgress = teamTasks.filter((t) => t.status === 'in_progress').length;
      const teamRate = teamTasks.length > 0 ? Math.round((teamDone / teamTasks.length) * 100) : 0;

      const teamMeetings = meetings.filter((m) => {
        const pIds = (m.participants || []).map((p) => p.id);
        return team.members.some((id) => pIds.includes(id));
      });

      return {
        ...team,
        totalTasks: teamTasks.length,
        doneTasks: teamDone,
        inProgress: teamInProgress,
        completionRate: teamRate,
        meetingCount: teamMeetings.length,
        avgMsgPerMeeting: Math.round(Math.random() * 5 + 5), // 데모
      };
    });

    // 상위 기여자
    const topContributors = Object.entries(MEMBER_MAP).map(([id, name]) => {
      const memberTasks = tasks.filter((t) => t.assignee_id === id);
      const done = memberTasks.filter((t) => t.status === 'done').length;
      return { id, name, done, total: memberTasks.length, rate: memberTasks.length > 0 ? Math.round((done / memberTasks.length) * 100) : 0 };
    }).sort((a, b) => b.rate - a.rate);

    return { totalMeetings, completedMeetings, totalTasks, doneTasks, completionRate, totalMembers, teamStats, topContributors };
  }, [meetings, tasks]);

  return (
    <div className="p-3 md:p-4 lg:p-4 max-w-[1400px] bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3 space-y-4">
      {/* 헤더 */}
      <div>
        {pageTitle && (
          <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
        )}
        <p className="text-sm text-txt-secondary">팀별 회의 참여, 태스크 완수율, 기여도를 한눈에 확인하세요</p>
      </div>

      {/* 전체 메트릭 */}
      <SectionPanel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="전체 팀원" value={analytics.totalMembers} icon={Users} />
          <MetricCard label="전체 회의" value={analytics.totalMeetings} icon={Calendar} />
          <MetricCard label="태스크 완수율" value={`${analytics.completionRate}%`} variant="gradient" icon={CheckCircle2} />
          <MetricCard label="완료 태스크" value={analytics.doneTasks} icon={TrendingUp} />
        </div>
      </SectionPanel>

      {/* 팀별 분석 카드 */}
      <SectionPanel title="팀별 성과">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {analytics.teamStats.map((team) => (
            <Card key={team.id} className="!p-0 overflow-hidden">
              {/* 팀 헤더 */}
              <div className="px-5 py-4 border-b border-border-divider flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: team.color + '20' }}>
                  <Users size={16} style={{ color: team.color }} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-txt-primary">{team.name}</h3>
                  <p className="text-[11px] text-txt-muted">{team.members.length}명</p>
                </div>
                <Badge variant={team.completionRate >= 70 ? 'success' : team.completionRate >= 40 ? 'warning' : 'danger'}>
                  {team.completionRate}%
                </Badge>
              </div>

              {/* 팀 지표 */}
              <div className="px-5 py-4 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-txt-muted flex items-center gap-1"><Calendar size={11} /> 회의</span>
                  <span className="font-medium text-txt-primary">{team.meetingCount}회</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-txt-muted flex items-center gap-1"><CheckCircle2 size={11} /> 완료 태스크</span>
                  <span className="font-medium text-txt-primary">{team.doneTasks}/{team.totalTasks}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-txt-muted flex items-center gap-1"><Clock size={11} /> 진행 중</span>
                  <span className="font-medium text-txt-primary">{team.inProgress}건</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-txt-muted flex items-center gap-1"><MessageSquare size={11} /> 평균 발언</span>
                  <span className="font-medium text-txt-primary">{team.avgMsgPerMeeting}회/회의</span>
                </div>

                {/* 완수율 바 */}
                <div className="pt-1">
                  <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-purple to-brand-orange transition-all duration-500"
                      style={{ width: `${team.completionRate}%` }}
                    />
                  </div>
                </div>

                {/* 팀원 아바타 */}
                <div className="flex gap-1 pt-1">
                  {team.members.map((mid) => (
                    <div
                      key={mid}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ backgroundColor: team.color }}
                      title={MEMBER_MAP[mid]}
                    >
                      {MEMBER_MAP[mid]?.[0]}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </SectionPanel>

      {/* 상위 기여자 */}
      <SectionPanel title="개인 기여도 랭킹" subtitle="태스크 완수율 기준">
        <div className="space-y-2">
          {analytics.topContributors.map((member, i) => (
            <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                i < 3 ? 'bg-brand-purple text-white' : 'bg-bg-tertiary text-txt-muted'
              }`}>
                {i + 1}
              </span>
              <p className="text-sm font-medium text-txt-primary flex-1">{member.name}</p>
              <span className="text-xs text-txt-muted">{member.done}/{member.total}</span>
              <div className="w-24 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    member.rate >= 70 ? 'bg-status-success' : member.rate >= 40 ? 'bg-brand-orange' : 'bg-status-error'
                  }`}
                  style={{ width: `${member.rate}%` }}
                />
              </div>
              <span className={`text-xs font-semibold w-10 text-right ${
                member.rate >= 70 ? 'text-status-success' : member.rate >= 40 ? 'text-brand-orange' : 'text-status-error'
              }`}>
                {member.rate}%
              </span>
            </div>
          ))}
        </div>
      </SectionPanel>
    </div>
  );
}
