import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Users, Calendar, CheckCircle2, Clock, Shield, FileText, ArrowRight, Sparkles } from 'lucide-react';
import { Card, MetricCard, Badge, SectionPanel } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import EmployeeTable from '@/components/admin/EmployeeTable';
import TeamOverview from '@/components/admin/TeamOverview';
import { format, parseISO } from 'date-fns';
import WeeklyChart from '@/components/ui/WeeklyChart';

export default function AdminDashboardPage() {
  const { pageTitle } = useOutletContext() || {};
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();

  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAdminData() {
      setLoading(true);
      try {
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

  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const totalMeetings = meetings.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const completionRate = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    return { totalEmployees, totalMeetings, completionRate, avgDuration: '24분' };
  }, [employees, meetings, tasks]);

  const weeklyData = [
    { label: '월', value: 3 }, { label: '화', value: 5 }, { label: '수', value: 2 },
    { label: '목', value: 4 }, { label: '금', value: 3 }, { label: '토', value: 0 },
    { label: '일', value: 0 },
  ];

  const recentSummaries = meetings.filter((m) => m.status === 'completed').slice(0, 5);

  return (
    <div className="p-2 md:p-3 lg:p-4 mx-auto mr-1 mb-1 md:mr-2 md:mb-2 lg:mr-3 lg:mb-3 min-h-full">
      <div className="bg-[var(--bg-content)] rounded-[12px] p-2 md:p-3 lg:p-4 space-y-3">

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center">
            <Shield size={20} className="text-brand-purple" />
          </div>
          <div>
            {pageTitle && (
              <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-0.5">{pageTitle}</h2>
            )}
            <p className="text-sm text-txt-secondary">팀 운영 현황과 직원 평가를 한눈에 확인하세요</p>
          </div>
        </div>

        {/* ═══ 섹션 1: 전체 메트릭 ═══ */}
        <SectionPanel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <MetricCard label="총 직원 수" value={stats.totalEmployees} icon={Users} />
            <MetricCard label="이번 주 전체 회의" value={stats.totalMeetings} icon={Calendar} />
            <MetricCard label="전체 태스크 완수율" value={`${stats.completionRate}%`} variant="gradient" icon={CheckCircle2} />
            <MetricCard label="평균 회의 시간" value={stats.avgDuration} icon={Clock} />
          </div>
        </SectionPanel>

        {/* ═══ 섹션 2: 팀 & 회의 분석 ═══ */}
        <SectionPanel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {/* 주간 회의 트렌드 */}
            <div className="bg-bg-tertiary subsection-olive rounded-[7px] p-5">
              <h3 className="text-sm font-semibold text-txt-primary mb-1">주간 회의 트렌드</h3>
              <p className="text-[11px] text-txt-secondary mb-3">전체 팀 합산</p>
              <WeeklyChart data={weeklyData} />
            </div>

            {/* 팀별 현황 */}
            <div className="bg-bg-tertiary subsection-teal rounded-[7px] p-5">
              <h3 className="text-sm font-semibold text-txt-primary mb-4">팀별 회의 현황</h3>
              <TeamOverview teams={teams} />
            </div>
          </div>
        </SectionPanel>

        {/* ═══ 섹션 3: 직원 평가 ═══ */}
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

        {/* ═══ 섹션 4: 최근 회의 요약 ═══ */}
        <SectionPanel title="최근 완료 회의">
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
