import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Target,
  FileText,
  Sparkles,
  ArrowRight,
  Circle,
  CircleDot,
} from 'lucide-react';
import { Card, MetricCard, Avatar, Badge, Button, SectionPanel } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import MeetingCard from '@/components/meeting/MeetingCard';
import TaskCard from '@/components/task/TaskCard';
import WeeklyChart from '@/components/ui/WeeklyChart';

export default function DashboardPage() {
  const { pageTitle } = useOutletContext() || {};
  const { user } = useAuthStore();
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();

  const today = format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko });

  const stats = useMemo(() => {
    const weekMeetings = meetings.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const completionRate = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
    return { weekMeetings, avgDuration: '24분', completionRate, decidedRate: 82 };
  }, [meetings, tasks]);

  const todayMeetings = meetings.filter((m) => m.status === 'active' || m.status === 'scheduled');
  const urgentTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === 'done' || !t.due_date) return false;
      return differenceInDays(parseISO(t.due_date), new Date()) <= 3;
    }).slice(0, 3);
  }, [tasks]);
  const recentSummaries = meetings.filter((m) => m.status === 'completed').slice(0, 3);

  const weeklyData = [
    { label: '월', value: 3 }, { label: '화', value: 5 }, { label: '수', value: 2 },
    { label: '목', value: 4 }, { label: '금', value: 3 }, { label: '토', value: 0 },
    { label: '일', value: 0 },
  ];

  const myTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== 'done');
  }, [tasks]);

  return (
    <div className="flex gap-3 p-2 md:p-3 lg:p-4 mx-auto mr-1 mb-1 md:mr-2 md:mb-2 lg:mr-3 lg:mb-3 min-h-full lg:h-full">
      {/* 메인 콘텐츠 */}
      <div className="flex-1 min-w-0 bg-[var(--bg-content)] rounded-[12px] p-2 md:p-3 lg:p-4 lg:overflow-y-auto scrollbar-hide space-y-3">
      {/* 페이지 타이틀 + 인사말 */}
      <div>
        {pageTitle && (
          <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
        )}
        <h1 className="text-[26px] font-semibold text-txt-primary">
          안녕하세요, {user?.name || '사용자'}님 👋
        </h1>
        <p className="text-sm text-txt-secondary mt-0.5">{today}</p>
      </div>

      {/* ═══ 패널 1: 메트릭 + Milo ═══ */}
      <SectionPanel>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <MetricCard label="이번 주 내 회의" value={stats.weekMeetings} change="+2" changeType="up" icon={Calendar} />
          <MetricCard label="내 태스크 완수율" value={`${stats.completionRate}%`} change="+12%" changeType="up" variant="gradient" icon={CheckCircle2} />
        </div>

        {/* Milo 인사이트 */}
        <Card className="!bg-bg-tertiary subsection-gold">
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
      </SectionPanel>

      {/* ═══ 패널 2: 오늘의 회의 ═══ */}
      <SectionPanel
        title="오늘의 회의"
        action={
          <Link to="/meetings" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
            모두 보기 <ArrowRight size={12} />
          </Link>
        }
      >
        {todayMeetings.length === 0 ? (
          <div className="text-center py-10 bg-bg-tertiary rounded-[7px]">
            <Calendar size={24} className="mx-auto text-txt-muted mb-2" />
            <p className="text-sm text-txt-secondary mb-4">오늘 예정된 회의가 없습니다</p>
            <Link to="/meetings">
              <Button variant="gradient" size="sm">새 회의 만들기</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {todayMeetings.slice(0, 3).map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ═══ 패널 3: 태스크 + 회의록 ═══ */}
      <SectionPanel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {/* 마감 임박 태스크 */}
          <div className="bg-bg-tertiary subsection-peach rounded-[7px] p-5">
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
                {urgentTasks.map((t) => <TaskCard key={t.id} task={t} compact />)}
              </div>
            )}
          </div>

          {/* 최근 회의록 */}
          <div className="bg-bg-tertiary subsection-teal rounded-[7px] p-5">
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
                    <Card className="!p-3 hover:border-border-hover-strong">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-brand-purple/10 border border-brand-purple/15 flex items-center justify-center shrink-0">
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

      {/* My Task 사이드바 */}
      <aside className="hidden lg:block w-[300px] shrink-0 bg-[var(--bg-content)] rounded-[12px] p-3 self-start sticky top-3">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-txt-primary">My Tasks</h2>
          <Link to="/tasks" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
            전체 <ArrowRight size={12} />
          </Link>
        </div>
        {myTasks.length === 0 ? (
          <p className="text-sm text-txt-secondary text-center py-8">할당된 태스크가 없습니다</p>
        ) : (
          <div className="space-y-3">
            {myTasks.map((t) => {
              const daysLeft = differenceInDays(parseISO(t.due_date), new Date());
              const isUrgent = daysLeft <= 1;
              const priorityColors = {
                urgent: 'text-red-500',
                high: 'text-orange-500',
                medium: 'text-yellow-600',
                low: 'text-txt-muted',
              };
              return (
                <div
                  key={t.id}
                  className="bg-[var(--card-bg)] rounded-[6px] border border-border-subtle p-3.5 hover:border-border-hover-strong transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-2.5">
                    {t.status === 'in_progress' ? (
                      <CircleDot size={16} className="text-brand-purple mt-0.5 shrink-0" />
                    ) : (
                      <Circle size={16} className="text-txt-muted mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary leading-snug line-clamp-2">{t.title}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {t.assignee && (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: t.assignee.color }}
                          >
                            {t.assignee.name[0]}
                          </span>
                        )}
                        <span className={`text-[11px] ${isUrgent ? 'text-red-500 font-semibold' : 'text-txt-muted'}`}>
                          {daysLeft === 0 ? 'D-Day' : daysLeft > 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)}`}
                        </span>
                        <span className={`text-[10px] font-medium ${priorityColors[t.priority]}`}>
                          {t.priority === 'urgent' ? '긴급' : t.priority === 'high' ? '높음' : t.priority === 'medium' ? '보통' : '낮음'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
