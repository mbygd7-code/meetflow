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
import { Card, MetricCard, Avatar, Badge, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import MeetingCard from '@/components/meeting/MeetingCard';
import TaskCard from '@/components/task/TaskCard';

// 주간 바 차트 (CSS로 단순 구현)
function WeeklyChart({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end justify-between gap-3 h-32 pt-2">
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

  // 메트릭 계산
  const stats = useMemo(() => {
    const activeMeetings = meetings.filter((m) => m.status === 'active').length;
    const weekMeetings = meetings.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const completionRate =
      tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    const decidedRate = 82; // 데모 수치

    return {
      weekMeetings,
      avgDuration: '24분',
      completionRate,
      decidedRate,
      activeMeetings,
    };
  }, [meetings, tasks]);

  // 오늘의 회의
  const todayMeetings = meetings.filter(
    (m) => m.status === 'active' || m.status === 'scheduled'
  );

  // 마감 임박 태스크
  const urgentTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.status === 'done') return false;
        if (!t.due_date) return false;
        const d = differenceInDays(parseISO(t.due_date), new Date());
        return d <= 3;
      })
      .slice(0, 3);
  }, [tasks]);

  // 최근 회의록
  const recentSummaries = meetings
    .filter((m) => m.status === 'completed')
    .slice(0, 3);

  // 주간 데이터 (데모)
  const weeklyData = [
    { label: '월', value: 3 },
    { label: '화', value: 5 },
    { label: '수', value: 2 },
    { label: '목', value: 4 },
    { label: '금', value: 3 },
    { label: '토', value: 0 },
    { label: '일', value: 0 },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 인사말 */}
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold text-white">
          안녕하세요, {user?.name || '사용자'}님 👋
        </h1>
        <p className="text-sm text-txt-secondary mt-1">{today}</p>
      </div>

      {/* 메트릭 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="이번 주 회의"
          value={stats.weekMeetings}
          change="+2"
          changeType="up"
          icon={Calendar}
        />
        <MetricCard
          label="평균 회의 시간"
          value={stats.avgDuration}
          change="-8분"
          changeType="up"
          icon={Clock}
        />
        <MetricCard
          label="태스크 완수율"
          value={`${stats.completionRate}%`}
          change="+12%"
          changeType="up"
          variant="gradient"
          icon={CheckCircle2}
        />
        <MetricCard
          label="결정 실행률"
          value={`${stats.decidedRate}%`}
          change="+5%"
          changeType="up"
          icon={Target}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* 주간 차트 */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-white">주간 회의 횟수</h3>
              <p className="text-xs text-txt-secondary mt-0.5">
                지난 주 대비 20% 감소
              </p>
            </div>
            <Badge variant="success">↓ 효율 개선</Badge>
          </div>
          <WeeklyChart data={weeklyData} />
        </Card>

        {/* Milo 인사이트 */}
        <Card className="border-brand-purple/30 bg-brand-purple/[0.04]">
          <div className="flex items-center gap-3 mb-3">
            <Avatar variant="ai" size="md" label="M" />
            <div>
              <p className="text-sm font-semibold text-white">Milo 주간 인사이트</p>
              <p className="text-[10px] text-txt-muted">자동 생성</p>
            </div>
          </div>
          <p className="text-xs text-txt-secondary leading-relaxed mb-4">
            이번 주 회의 시간이 지난주 대비 <span className="text-white font-semibold">20% 줄었어요</span>.
            결정 실행률도 <span className="text-white font-semibold">82%</span>로 높아졌습니다.
            짧은 회의가 실행력에 긍정적으로 작용하고 있네요.
          </p>
          <Link
            to="/summaries"
            className="flex items-center gap-1 text-xs text-brand-purple hover:text-white transition-colors"
          >
            전체 분석 보기
            <ArrowRight size={12} />
          </Link>
        </Card>
      </div>

      {/* 오늘의 회의 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-semibold text-white">오늘의 회의</h2>
          <Link
            to="/meetings"
            className="text-xs text-txt-secondary hover:text-white flex items-center gap-1"
          >
            모두 보기 <ArrowRight size={12} />
          </Link>
        </div>
        {todayMeetings.length === 0 ? (
          <Card className="text-center py-10">
            <Calendar size={24} className="mx-auto text-txt-muted mb-2" />
            <p className="text-sm text-txt-secondary mb-4">
              오늘 예정된 회의가 없습니다
            </p>
            <Link to="/meetings">
              <Button variant="gradient" size="sm">
                새 회의 만들기
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {todayMeetings.slice(0, 3).map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </div>

      {/* 마감 임박 태스크 + 최근 회의록 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[18px] font-semibold text-white">마감 임박 태스크</h2>
            <Link
              to="/tasks"
              className="text-xs text-txt-secondary hover:text-white flex items-center gap-1"
            >
              모두 보기 <ArrowRight size={12} />
            </Link>
          </div>
          {urgentTasks.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-sm text-txt-secondary">임박한 태스크가 없습니다</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {urgentTasks.map((t) => (
                <TaskCard key={t.id} task={t} compact />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[18px] font-semibold text-white">최근 회의록</h2>
            <Link
              to="/summaries"
              className="text-xs text-txt-secondary hover:text-white flex items-center gap-1"
            >
              모두 보기 <ArrowRight size={12} />
            </Link>
          </div>
          {recentSummaries.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-sm text-txt-secondary">아직 완료된 회의가 없습니다</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {recentSummaries.map((m) => (
                <Link key={m.id} to={`/summaries/${m.id}`}>
                  <Card className="!p-4 hover:border-white/[0.16]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-brand-purple" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {m.title}
                        </p>
                        <p className="text-[11px] text-txt-muted mt-0.5">
                          {format(parseISO(m.ended_at || m.created_at), 'MM/dd HH:mm')}
                          {' · '}
                          어젠다 {m.agendas?.length || 0} · 참여 {m.participants?.length || 0}
                        </p>
                      </div>
                      <ArrowRight size={14} className="text-txt-muted" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
