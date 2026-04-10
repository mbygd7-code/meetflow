import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Target,
  FileText,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Card, MetricCard, Avatar, Badge, Button, SectionPanel } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import MeetingCard from '@/components/meeting/MeetingCard';
import TaskCard from '@/components/task/TaskCard';

function WeeklyChart({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end justify-between gap-3 h-28 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-brand-purple-deep via-brand-purple to-brand-orange transition-all hover:opacity-90"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: '4px' }}
          />
          <span className="text-[10px] text-txt-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();

  const today = format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko });

  const stats = useMemo(() => {
    const weekMeetings = meetings.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const completionRate =
      tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    return { weekMeetings, avgDuration: '24분', completionRate, decidedRate: 82 };
  }, [meetings, tasks]);

  const todayMeetings = meetings.filter(
    (m) => m.status === 'active' || m.status === 'scheduled'
  );

  const urgentTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.status === 'done' || !t.due_date) return false;
        return differenceInDays(parseISO(t.due_date), new Date()) <= 3;
      })
      .slice(0, 3);
  }, [tasks]);

  const recentSummaries = meetings
    .filter((m) => m.status === 'completed')
    .slice(0, 3);

  const weeklyData = [
    { label: '월', value: 3 }, { label: '화', value: 5 }, { label: '수', value: 2 },
    { label: '목', value: 4 }, { label: '금', value: 3 }, { label: '토', value: 0 },
    { label: '일', value: 0 },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 bg-[var(--bg-content)] rounded-[24px] ml-0 mr-4 my-4 lg:ml-0 lg:mr-6 lg:my-6">
      {/* ═══ 인사말 (배경 위에 바로) ═══ */}
      <div>
        <h1 className="text-[26px] font-semibold text-txt-primary">
          안녕하세요, {user?.name || '사용자'}님 👋
        </h1>
        <p className="text-sm text-txt-secondary mt-0.5">{today}</p>
      </div>

      {/* ═══ 패널 1: 메트릭 + 차트 + Milo (큰 섹션 안에 작은 섹션들) ═══ */}
      <SectionPanel>
        {/* 메트릭 그리드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard label="이번 주 회의" value={stats.weekMeetings} change="+2" changeType="up" icon={Calendar} />
          <MetricCard label="평균 회의 시간" value={stats.avgDuration} change="-8분" changeType="up" icon={Clock} />
          <MetricCard label="태스크 완수율" value={`${stats.completionRate}%`} change="+12%" changeType="up" variant="gradient" icon={CheckCircle2} />
          <MetricCard label="결정 실행률" value={`${stats.decidedRate}%`} change="+5%" changeType="up" icon={Target} />
        </div>

        {/* 차트 + Milo 2컬럼 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 !bg-bg-tertiary">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-txt-primary">주간 회의 횟수</h3>
                <p className="text-[11px] text-txt-secondary mt-0.5">지난 주 대비 20% 감소</p>
              </div>
              <Badge variant="success">↓ 효율 개선</Badge>
            </div>
            <WeeklyChart data={weeklyData} />
          </Card>

          <Card className="!bg-bg-tertiary border-brand-purple/20">
            <div className="flex items-center gap-3 mb-3">
              <Avatar variant="ai" size="md" label="M" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">Milo 인사이트</p>
                <p className="text-[10px] text-txt-muted">자동 생성</p>
              </div>
            </div>
            <p className="text-xs text-txt-secondary leading-relaxed mb-3">
              이번 주 회의 시간이 지난주 대비 <span className="text-txt-primary font-semibold">20% 줄었어요</span>.
              결정 실행률도 <span className="text-txt-primary font-semibold">82%</span>로 높아졌습니다.
            </p>
            <Link to="/summaries" className="flex items-center gap-1 text-xs text-brand-purple hover:text-txt-primary transition-colors">
              전체 분석 보기 <ArrowRight size={12} />
            </Link>
          </Card>
        </div>
      </SectionPanel>

      {/* ═══ 패널 2: 오늘의 회의 (큰 섹션) ═══ */}
      <SectionPanel
        title="오늘의 회의"
        action={
          <Link to="/meetings" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
            모두 보기 <ArrowRight size={12} />
          </Link>
        }
      >
        {todayMeetings.length === 0 ? (
          <div className="text-center py-10 bg-bg-tertiary rounded-[14px]">
            <Calendar size={24} className="mx-auto text-txt-muted mb-2" />
            <p className="text-sm text-txt-secondary mb-4">오늘 예정된 회의가 없습니다</p>
            <Link to="/meetings">
              <Button variant="gradient" size="sm">새 회의 만들기</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {todayMeetings.slice(0, 3).map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ═══ 패널 3: 태스크 + 회의록 (큰 섹션 안에 2개 작은 섹션) ═══ */}
      <SectionPanel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 작은 섹션 A: 마감 임박 태스크 */}
          <div className="bg-bg-tertiary rounded-[14px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-txt-primary">마감 임박 태스크</h3>
              <Link to="/tasks" className="text-[11px] text-txt-secondary hover:text-txt-primary flex items-center gap-1">
                모두 보기 <ArrowRight size={11} />
              </Link>
            </div>
            {urgentTasks.length === 0 ? (
              <p className="text-sm text-txt-secondary text-center py-6">임박한 태스크가 없습니다</p>
            ) : (
              <div className="space-y-2.5">
                {urgentTasks.map((t) => (
                  <TaskCard key={t.id} task={t} compact />
                ))}
              </div>
            )}
          </div>

          {/* 작은 섹션 B: 최근 회의록 */}
          <div className="bg-bg-tertiary rounded-[14px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-txt-primary">최근 회의록</h3>
              <Link to="/summaries" className="text-[11px] text-txt-secondary hover:text-txt-primary flex items-center gap-1">
                모두 보기 <ArrowRight size={11} />
              </Link>
            </div>
            {recentSummaries.length === 0 ? (
              <p className="text-sm text-txt-secondary text-center py-6">아직 완료된 회의가 없습니다</p>
            ) : (
              <div className="space-y-2.5">
                {recentSummaries.map((m) => (
                  <Link key={m.id} to={`/summaries/${m.id}`}>
                    <Card className="!p-3 !bg-bg-secondary hover:border-border-hover-strong">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center shrink-0">
                          <FileText size={14} className="text-brand-purple" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-txt-primary truncate">{m.title}</p>
                          <p className="text-[11px] text-txt-muted mt-0.5">
                            {format(parseISO(m.ended_at || m.created_at), 'MM/dd HH:mm')}
                            {' · '}어젠다 {m.agendas?.length || 0} · 참여 {m.participants?.length || 0}
                          </p>
                        </div>
                        <ArrowRight size={13} className="text-txt-muted" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionPanel>
    </div>
  );
}
