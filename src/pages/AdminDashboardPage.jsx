import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  Users, Calendar, CheckCircle2, Clock, Shield, FileText, ArrowRight,
  Sparkles, Coins, MessageSquare, Trophy, TrendingUp,
} from 'lucide-react';
import { Card, MetricCard, Badge, SectionPanel } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import EmployeeTable from '@/components/admin/EmployeeTable';
import TeamOverview from '@/components/admin/TeamOverview';
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

  // ── 종합 기여도 랭킹 (완수율 50% + 완수량 30% + 담당량 20%) ──
  // 완수율: 품질 (맡은 일을 얼마나 잘 해내나)
  // 완수량: 실행력 (실제로 얼마나 끝냈나) — done_tasks 정규화
  // 담당량: 책임 범위 (얼마나 많이 맡고 있나) — total_tasks 정규화
  const topContributors = useMemo(() => {
    if (employees.length === 0) return [];
    const maxDone = Math.max(...employees.map((e) => e.done_tasks || 0), 1);
    const maxTotal = Math.max(...employees.map((e) => e.total_tasks || 0), 1);

    return [...employees]
      .map((e) => {
        const completion = e.completion_rate || 0;                        // 0~100
        const execution = ((e.done_tasks || 0) / maxDone) * 100;          // 0~100
        const responsibility = ((e.total_tasks || 0) / maxTotal) * 100;   // 0~100
        const score = Math.round(completion * 0.5 + execution * 0.3 + responsibility * 0.2);
        return {
          ...e,
          _score: score,
          _completion: completion,
          _execution: Math.round(execution),
          _responsibility: Math.round(responsibility),
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);
  }, [employees]);

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <MetricCard label="총 직원 수" value={stats.totalEmployees} icon={Users} />
            <MetricCard label="전체 회의" value={stats.totalMeetings} change={`완료 ${stats.completedMeetings}건`} icon={Calendar} />
            <MetricCard label="태스크 완수율" value={`${stats.completionRate}%`} change={`완료 ${stats.doneTasks}건`} variant="gradient" icon={CheckCircle2} />
            <MetricCard label="평균 회의 시간" value={stats.avgDuration} icon={Clock} />
          </div>
        </SectionPanel>

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

        {/* ═══ 섹션 4: 직원 평가 테이블 ═══ */}
        <SectionPanel title="직원 평가" subtitle="태스크 완수율 기준 정렬">
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

        {/* ═══ 섹션 5: 종합 기여도 랭킹 (완수율 50% + 완수량 30% + 담당량 20%) ═══ */}
        {topContributors.length > 0 && (
          <SectionPanel
            title="종합 기여도 랭킹"
            subtitle="완수율(품질) 50% + 완수량(실행력) 30% + 담당량(책임) 20% · 상위 10명"
          >
            {/* 가중치 범례 */}
            <div className="flex items-center gap-3 mb-3 px-1 text-[10px] text-txt-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-status-success" />
                완수율 (품질)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-purple" />
                완수량 (실행력)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-orange" />
                담당량 (책임)
              </span>
            </div>

            <div className="space-y-1.5">
              {topContributors.map((m, i) => {
                const score = m._score;
                const rankColor = i === 0 ? 'bg-brand-orange text-white'
                  : i === 1 ? 'bg-brand-purple text-white'
                    : i === 2 ? 'bg-brand-yellow text-txt-primary'
                      : 'bg-bg-tertiary text-txt-muted';
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-tertiary/50 transition-colors"
                  >
                    {/* 순위 */}
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${rankColor}`}>
                      {i < 3 ? <Trophy size={12} /> : i + 1}
                    </span>

                    {/* 아바타 + 이름 + 팀 */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: m.avatar_color || '#723CEB' }}
                    >
                      {m.user_name?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary truncate">{m.user_name}</p>
                      <p className="text-[10px] text-txt-muted truncate">{m.team || '미지정'}</p>
                    </div>

                    {/* 세부 지표 (데스크톱 전용) */}
                    <div className="hidden lg:flex items-center gap-2 text-[10px] text-txt-muted">
                      <span title="완수율" className="flex items-center gap-0.5">
                        <CheckCircle2 size={10} className="text-status-success" />
                        {m._completion}%
                      </span>
                      <span title="완수 태스크 수" className="flex items-center gap-0.5">
                        <Trophy size={10} className="text-brand-purple" />
                        {m.done_tasks || 0}건 완수
                      </span>
                      <span title="담당 태스크 총량" className="flex items-center gap-0.5">
                        <TrendingUp size={10} className="text-brand-orange" />
                        {m.total_tasks || 0}건 담당
                      </span>
                    </div>

                    {/* 종합 점수 스택 바 (품질 · 실행력 · 책임 비율 반영) */}
                    <div
                      className="w-20 md:w-32 h-1.5 bg-bg-primary rounded-full overflow-hidden flex"
                      title={`완수율 ${m._completion}% · 완수량 ${m._execution}% · 담당량 ${m._responsibility}%`}
                    >
                      <div
                        className="h-full bg-status-success transition-all"
                        style={{ width: `${m._completion * 0.5}%` }}
                      />
                      <div
                        className="h-full bg-brand-purple transition-all"
                        style={{ width: `${m._execution * 0.3}%` }}
                      />
                      <div
                        className="h-full bg-brand-orange transition-all"
                        style={{ width: `${m._responsibility * 0.2}%` }}
                      />
                    </div>

                    {/* 종합 점수 */}
                    <span className={`text-xs font-bold w-10 text-right shrink-0 ${
                      score >= 70 ? 'text-status-success' : score >= 40 ? 'text-brand-orange' : 'text-status-error'
                    }`}>
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </SectionPanel>
        )}

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
