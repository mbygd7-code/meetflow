import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  Users, Calendar, CheckCircle2, Clock, Shield, FileText, ArrowRight,
  Sparkles, Coins, MessageSquare, UsersRound, Settings2,
} from 'lucide-react';
import { Card, MetricCard, Badge, SectionPanel } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import EmployeeTable from '@/components/admin/EmployeeTable';
import TeamOverview from '@/components/admin/TeamOverview';
import EmployeeTaskOverview from '@/components/admin/EmployeeTaskOverview';
import TeamManagementModal from '@/components/admin/TeamManagementModal';
import AiAnalyticsPanel from '@/components/admin/AiAnalyticsPanel';
import { format, parseISO } from 'date-fns';
import WeeklyChart from '@/components/ui/WeeklyChart';

// 팀별 고정 색상 (순환)
const TEAM_COLORS = ['#FF902F', '#F472B6', '#38BDF8', '#A78BFA', '#34D399', '#FBBF24'];

export default function AdminDashboardPage() {
  const { pageTitle } = useOutletContext() || {};
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();

  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  // 팀 관리 모달 상태
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalTab, setTeamModalTab] = useState('teams');

  const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    async function fetchAdminData() {
      setLoading(true);
      try {
        if (!SUPABASE_ENABLED) {
          // 데모 모드: 목 데이터
          setEmployees([
            { user_id: 'u1', user_name: '김지우', email: 'jiwoo@meetflow.ai', avatar_color: '#FF902F', role: 'member', team: '프로덕트 팀', done_tasks: 5, total_tasks: 8, meeting_count: 12, completion_rate: 63 },
            { user_id: 'u2', user_name: '박서연', email: 'seoyeon@meetflow.ai', avatar_color: '#34D399', role: 'member', team: '프로덕트 팀', done_tasks: 3, total_tasks: 6, meeting_count: 9, completion_rate: 50 },
            { user_id: 'u3', user_name: '이도윤', email: 'doyun@meetflow.ai', avatar_color: '#38BDF8', role: 'member', team: '프로덕트 팀', done_tasks: 7, total_tasks: 10, meeting_count: 15, completion_rate: 70 },
            { user_id: 'u4', user_name: '최하린', email: 'harin@meetflow.ai', avatar_color: '#F472B6', role: 'member', team: '디자인 팀', done_tasks: 4, total_tasks: 5, meeting_count: 8, completion_rate: 80 },
            { user_id: 'u5', user_name: '정민수', email: 'minsu@meetflow.ai', avatar_color: '#A78BFA', role: 'member', team: '디자인 팀', done_tasks: 2, total_tasks: 4, meeting_count: 6, completion_rate: 50 },
            { user_id: 'u6', user_name: '한소율', email: 'soyul@meetflow.ai', avatar_color: '#FBBF24', role: 'member', team: '엔지니어링 팀', done_tasks: 6, total_tasks: 7, meeting_count: 11, completion_rate: 86 },
            { user_id: 'u7', user_name: '오재현', email: 'jaehyun@meetflow.ai', avatar_color: '#F87171', role: 'member', team: '엔지니어링 팀', done_tasks: 8, total_tasks: 9, meeting_count: 14, completion_rate: 89 },
            { user_id: 'u8', user_name: '윤서아', email: 'seoa@meetflow.ai', avatar_color: '#2DD4BF', role: 'member', team: '엔지니어링 팀', done_tasks: 1, total_tasks: 3, meeting_count: 5, completion_rate: 33 },
          ]);
          setTeams([
            { id: 'team-1', name: '프로덕트 팀', member_count: 3, active_meetings: 1, completed_meetings: 5 },
            { id: 'team-2', name: '디자인 팀', member_count: 2, active_meetings: 0, completed_meetings: 3 },
            { id: 'team-3', name: '엔지니어링 팀', member_count: 3, active_meetings: 1, completed_meetings: 4 },
          ]);
          setLoading(false);
          return;
        }

        // 직원 통계 (RPC)
        const { data: empData } = await supabase.rpc('get_employee_stats');
        setEmployees(empData || []);

        // 팀 데이터
        const { data: teamData } = await supabase
          .from('teams')
          .select('id, name, team_members(user_id)');

        if (teamData) {
          const enriched = teamData.map((t) => ({
            id: t.id,
            name: t.name,
            member_count: t.team_members?.length || 0,
            active_meetings: meetings.filter((m) => m.team_id === t.id && m.status === 'active').length,
            completed_meetings: meetings.filter((m) => m.team_id === t.id && m.status === 'completed').length,
          }));
          setTeams(enriched);
        }
      } catch (err) {
        console.error('[AdminDashboard]', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAdminData();
  }, [meetings]);

  // ── 전체 통계 ──
  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const totalMeetings = meetings.length;
    const completedMeetings = meetings.filter((m) => m.status === 'completed').length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const completionRate = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    return {
      totalEmployees, totalMeetings, completedMeetings, doneTasks, completionRate,
      avgDuration: '24분',
    };
  }, [employees, meetings, tasks]);

  // ── 팀별 성과 집계 (팀 분석에서 흡수) ──
  const teamStats = useMemo(() => {
    const byTeam = {};
    employees.forEach((e) => {
      const teamName = e.team || '미지정';
      if (!byTeam[teamName]) {
        byTeam[teamName] = {
          name: teamName,
          members: [],
          totalTasks: 0,
          doneTasks: 0,
          meetingCount: 0,
        };
      }
      byTeam[teamName].members.push(e);
      byTeam[teamName].totalTasks += e.total_tasks || 0;
      byTeam[teamName].doneTasks += e.done_tasks || 0;
      byTeam[teamName].meetingCount += e.meeting_count || 0;
    });
    return Object.values(byTeam).map((t, i) => ({
      ...t,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      inProgress: t.totalTasks - t.doneTasks,
      completionRate: t.totalTasks > 0 ? Math.round((t.doneTasks / t.totalTasks) * 100) : 0,
      avgMeetingPerMember: t.members.length > 0 ? Math.round(t.meetingCount / t.members.length) : 0,
    }));
  }, [employees]);

  // (종합 기여도 랭킹은 EmployeeTable 내부에서 직접 계산·정렬)

  const weeklyData = [
    { label: '월', value: 3 }, { label: '화', value: 5 }, { label: '수', value: 2 },
    { label: '목', value: 4 }, { label: '금', value: 3 }, { label: '토', value: 0 },
    { label: '일', value: 0 },
  ];

  const recentSummaries = meetings.filter((m) => m.status === 'completed').slice(0, 5);

  return (
    <div className="p-3 md:p-4 lg:p-4 max-w-[1400px] bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3 min-h-full">
      <div className="space-y-3">

        {/* ═══ 헤더 ═══ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center">
              <Shield size={20} className="text-brand-purple" />
            </div>
            <div>
              {pageTitle && (
                <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-0.5">{pageTitle}</h2>
              )}
              <p className="text-sm text-txt-secondary">팀 운영 현황, 팀별 성과, 직원 평가를 한눈에 확인하세요</p>
            </div>
          </div>
          <Link
            to="/admin/tokens"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-brand-purple bg-brand-purple/10 border border-brand-purple/20 hover:bg-brand-purple/20 transition-colors"
          >
            <Coins size={14} />
            <span className="hidden md:inline">토큰 관리</span>
          </Link>
        </div>

        {/* ═══ 섹션 1: 전체 메트릭 ═══ */}
        <SectionPanel>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {/* 팀 수 — 클릭 시 팀 관리 모달 */}
            <button
              onClick={() => { setTeamModalTab('teams'); setTeamModalOpen(true); }}
              className="rounded-[6px] p-5 transition-all duration-200 bg-bg-secondary border border-border-subtle hover:border-brand-purple/40 hover:shadow-glow text-left group"
            >
              <div className="flex items-start justify-between">
                <p className="text-xs uppercase tracking-wider mb-3 text-txt-muted">팀 수</p>
                <UsersRound size={16} className="text-txt-muted group-hover:text-brand-purple transition-colors" />
              </div>
              <p className="text-[32px] font-bold leading-none text-txt-primary">{teams.length}</p>
              <p className="text-[10px] text-brand-purple mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <Settings2 size={9} /> 관리하기
              </p>
            </button>

            {/* 직원 수 — 클릭 시 팀 관리 모달 (멤버 뷰) */}
            <button
              onClick={() => { setTeamModalTab('members'); setTeamModalOpen(true); }}
              className="rounded-[6px] p-5 transition-all duration-200 bg-bg-secondary border border-border-subtle hover:border-brand-purple/40 hover:shadow-glow text-left group"
            >
              <div className="flex items-start justify-between">
                <p className="text-xs uppercase tracking-wider mb-3 text-txt-muted">직원 수</p>
                <Users size={16} className="text-txt-muted group-hover:text-brand-purple transition-colors" />
              </div>
              <p className="text-[32px] font-bold leading-none text-txt-primary">{stats.totalEmployees}</p>
              <p className="text-[10px] text-brand-purple mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <Settings2 size={9} /> 팀 배정
              </p>
            </button>

            <MetricCard label="전체 회의" value={stats.totalMeetings} change={`완료 ${stats.completedMeetings}건`} icon={Calendar} />
            <MetricCard label="태스크 완수율" value={`${stats.completionRate}%`} change={`완료 ${stats.doneTasks}건`} variant="gradient" icon={CheckCircle2} />
            <MetricCard label="평균 회의 시간" value={stats.avgDuration} icon={Clock} />
          </div>
        </SectionPanel>

        {/* 팀 관리 모달 */}
        <TeamManagementModal
          open={teamModalOpen}
          onClose={() => {
            setTeamModalOpen(false);
            // 닫을 때 팀 데이터 리로드 (변경사항 반영)
            if (SUPABASE_ENABLED) {
              supabase.from('teams').select('id, name, team_members(user_id)').then(({ data }) => {
                if (data) {
                  setTeams(data.map((t) => ({
                    id: t.id,
                    name: t.name,
                    member_count: t.team_members?.length || 0,
                    active_meetings: meetings.filter((m) => m.team_id === t.id && m.status === 'active').length,
                    completed_meetings: meetings.filter((m) => m.team_id === t.id && m.status === 'completed').length,
                  })));
                }
              });
            }
          }}
          initialTab={teamModalTab}
        />

        {/* ═══ 섹션 2: 운영 트렌드 (2컬럼) ═══ */}
        <SectionPanel title="운영 트렌드" subtitle="주간 활동 + 팀별 회의 현황">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <div className="bg-bg-tertiary subsection-olive rounded-[7px] p-5">
              <h3 className="text-sm font-semibold text-txt-primary mb-1">주간 회의 트렌드</h3>
              <p className="text-[11px] text-txt-secondary mb-3">전체 팀 합산</p>
              <WeeklyChart data={weeklyData} />
            </div>
            <div className="bg-bg-tertiary subsection-teal rounded-[7px] p-5">
              <h3 className="text-sm font-semibold text-txt-primary mb-4">팀별 회의 현황</h3>
              <TeamOverview teams={teams} />
            </div>
          </div>
        </SectionPanel>

        {/* ═══ 섹션 3: 팀별 성과 (팀 분석 흡수) ═══ */}
        {teamStats.length > 0 && (
          <SectionPanel title="팀별 성과" subtitle="각 팀의 태스크 완수율과 활동량">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {teamStats.map((team) => (
                <Card key={team.name} className="!p-0 overflow-hidden">
                  {/* 팀 헤더 */}
                  <div className="px-5 py-4 border-b border-border-divider flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: team.color + '20' }}
                    >
                      <Users size={16} style={{ color: team.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-txt-primary truncate">{team.name}</h3>
                      <p className="text-[11px] text-txt-muted">{team.members.length}명</p>
                    </div>
                    <Badge variant={team.completionRate >= 70 ? 'success' : team.completionRate >= 40 ? 'warning' : 'danger'}>
                      {team.completionRate}%
                    </Badge>
                  </div>

                  {/* 팀 지표 */}
                  <div className="px-5 py-4 space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-txt-muted flex items-center gap-1"><Calendar size={11} /> 회의 참여</span>
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
                      <span className="text-txt-muted flex items-center gap-1"><MessageSquare size={11} /> 1인 평균</span>
                      <span className="font-medium text-txt-primary">{team.avgMeetingPerMember}회</span>
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
                    <div className="flex gap-1 pt-1 flex-wrap">
                      {team.members.slice(0, 8).map((m) => (
                        <div
                          key={m.user_id}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ backgroundColor: m.avatar_color || team.color }}
                          title={m.user_name}
                        >
                          {m.user_name?.[0]}
                        </div>
                      ))}
                      {team.members.length > 8 && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold bg-bg-primary text-txt-muted">
                          +{team.members.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </SectionPanel>
        )}

        {/* ═══ 섹션 4: 직원 현재 업무 현황 ═══ */}
        <SectionPanel
          title="직원 현재 업무"
          subtitle="누가 무엇을 진행 중인지, 지연·마감 임박 태스크 한눈에"
        >
          <EmployeeTaskOverview employees={employees} tasks={tasks} />
        </SectionPanel>

        {/* ═══ 섹션 5: 직원 평가 & 기여도 랭킹 (통합) ═══ */}
        <SectionPanel
          title="직원 평가 & 기여도 (팀 내 순위)"
          subtitle="완수율·완수량·담당량으로 본 상대 평가 · 개인 균형 평가는 직원 상세에서 확인"
        >
          <div className="bg-bg-tertiary rounded-[7px] p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="loader-symbol w-10 h-10 rounded-xl bg-gradient-brand shadow-glow flex items-center justify-center">
                  <Sparkles size={18} className="text-white" strokeWidth={2.5} />
                </div>
              </div>
            ) : (
              <EmployeeTable employees={employees} />
            )}
          </div>
        </SectionPanel>

        {/* ═══ 섹션 AI: AI 오케스트레이션 + 피드백 (Phase B) ═══ */}
        <AiAnalyticsPanel />

        {/* ═══ 섹션 6: 최근 완료 회의 ═══ */}
        <SectionPanel title="최근 완료 회의" subtitle="최근 5건">
          {recentSummaries.length === 0 ? (
            <p className="text-sm text-txt-secondary text-center py-8">완료된 회의가 없습니다</p>
          ) : (
            <div className="space-y-2">
              {recentSummaries.map((m) => (
                <Card key={m.id} className="!p-3.5 hover:border-border-hover-strong">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded bg-brand-purple/10 border border-brand-purple/15 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-brand-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary truncate">{m.title}</p>
                      <p className="text-[11px] text-txt-muted mt-0.5">
                        {m.ended_at ? format(parseISO(m.ended_at), 'MM/dd HH:mm') : ''}
                        {' · '}어젠다 {m.agendas?.length || 0} · 참여 {m.participants?.length || 0}
                      </p>
                    </div>
                    <ArrowRight size={13} className="text-txt-muted shrink-0" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </SectionPanel>

      </div>
    </div>
  );
}
