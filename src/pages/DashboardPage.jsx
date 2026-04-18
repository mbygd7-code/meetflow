import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Calendar, Clock, FileText, Sparkles, ArrowRight,
  Zap, AlertCircle, CircleDot, MessageSquare, TrendingUp,
} from 'lucide-react';
import { Avatar, Button, SectionPanel } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import MeetingCard from '@/components/meeting/MeetingCard';
import MyTaskCard from '@/components/task/MyTaskCard';
import TaskSlidePanel from '@/components/task/TaskSlidePanel';

export default function DashboardPage() {
  const { pageTitle } = useOutletContext() || {};
  const [selectedTask, setSelectedTask] = useState(null);
  const { user } = useAuthStore();
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();

  const today = format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko });

  // 내 태스크만 필터링 (완료 제외는 초점 섹션에서만)
  const myTasks = useMemo(() => {
    const userId = user?.id;
    const userName = user?.name;
    return tasks.filter((t) => {
      if (t.assignee_id === userId) return true;
      if (t.assignee?.name === userName || t.assignee_name === userName) return true;
      return false;
    });
  }, [tasks, user]);

  const myActiveTasks = myTasks.filter((t) => t.status !== 'done');
  const myDoneCount = myTasks.length - myActiveTasks.length;

  // 오늘의 초점 — 마감 임박 + 진행중 우선
  const focusTasks = useMemo(() => {
    return [...myActiveTasks]
      .map((t) => {
        const days = t.due_date ? differenceInDays(parseISO(t.due_date), new Date()) : 999;
        const priorityWeight = { urgent: 0, high: 1, medium: 2, low: 3 }[t.priority] || 2;
        const statusWeight = t.status === 'in_progress' ? -0.5 : 0;
        return { ...t, _score: days + priorityWeight + statusWeight };
      })
      .sort((a, b) => a._score - b._score)
      .slice(0, 2);
  }, [myActiveTasks]);

  // 오늘의 회의
  const todayMeetings = meetings.filter(
    (m) => m.status === 'active' || m.status === 'scheduled'
  );

  // 최근 회의록 (놓친 것 확인용)
  const recentSummaries = meetings
    .filter((m) => m.status === 'completed')
    .slice(0, 4);

  // 하루 요약 (인사말 아래 한 줄)
  const summarySentence = useMemo(() => {
    const parts = [];
    if (todayMeetings.length > 0) parts.push(`회의 ${todayMeetings.length}개`);
    const overdueCount = myActiveTasks.filter((t) => {
      if (!t.due_date) return false;
      return differenceInDays(parseISO(t.due_date), new Date()) < 0;
    }).length;
    const dueSoon = myActiveTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = differenceInDays(parseISO(t.due_date), new Date());
      return d >= 0 && d <= 2;
    }).length;
    if (overdueCount > 0) parts.push(`지연 ${overdueCount}건`);
    if (dueSoon > 0) parts.push(`마감 임박 ${dueSoon}건`);
    if (parts.length === 0) return '오늘은 여유로운 하루네요 ☕';
    return `오늘 ${parts.join(' · ')} 있어요`;
  }, [todayMeetings, myActiveTasks]);

  return (
    <div className="flex gap-3 p-2 md:p-3 lg:p-4 mx-auto mr-1 mb-1 md:mr-2 md:mb-2 lg:mr-3 lg:mb-3 min-h-full lg:h-full">
      {/* ═══ 메인 콘텐츠 ═══ */}
      <div className="flex-1 min-w-0 bg-[var(--bg-content)] rounded-[12px] p-2 md:p-3 lg:p-4 lg:overflow-y-auto scrollbar-hide space-y-3">
        {/* 인사말 + 하루 요약 */}
        <div>
          {pageTitle && (
            <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
          )}
          <h1 className="text-[26px] font-semibold text-txt-primary">
            안녕하세요, {user?.name || '사용자'}님 👋
          </h1>
          <p className="text-sm text-txt-secondary mt-0.5">
            {today} · <span className="text-txt-primary font-medium">{summarySentence}</span>
          </p>
        </div>

        {/* ═══ 오늘의 초점 ═══ */}
        <SectionPanel
          title="오늘의 초점"
          subtitle={focusTasks.length > 0 ? '가장 먼저 처리하면 좋을 업무' : '아직 할당된 업무가 없어요'}
          action={
            <Link to="/tasks" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
              모든 태스크 <ArrowRight size={12} />
            </Link>
          }
        >
          {focusTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {focusTasks.map((t) => (
                <FocusCard
                  key={t.id}
                  task={t}
                  onClick={() => setSelectedTask(selectedTask?.id === t.id ? null : t)}
                />
              ))}
            </div>
          ) : (
            <FocusEmptyState
              hasMeetings={todayMeetings.length > 0}
              hasRecentSummaries={recentSummaries.length > 0}
            />
          )}
        </SectionPanel>

        {/* ═══ 오늘의 회의 ═══ */}
        <SectionPanel
          title="오늘의 일정"
          subtitle={todayMeetings.length > 0 ? `회의 ${todayMeetings.length}개 예정` : undefined}
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

        {/* ═══ Milo 개인 인사이트 + 최근 회의록 ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Milo 개인 메시지 */}
          <SectionPanel className="subsection-gold">
            <div className="flex items-center gap-3 mb-3">
              <Avatar variant="ai" size="md" label="M" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">Milo 인사이트</p>
                <p className="text-[10px] text-txt-muted">자동 생성 · 방금</p>
              </div>
            </div>
            <p className="text-xs text-txt-secondary leading-relaxed mb-3">
              {myActiveTasks.length > 0 ? (
                <>
                  진행 중인 태스크 <span className="text-txt-primary font-semibold">{myActiveTasks.filter((t) => t.status === 'in_progress').length}건</span>,
                  대기 중 <span className="text-txt-primary font-semibold">{myActiveTasks.filter((t) => t.status === 'todo').length}건</span>이에요.
                  {myDoneCount > 0 && (
                    <> 최근 <span className="text-status-success font-semibold">{myDoneCount}건</span>을 완료했습니다.</>
                  )}
                </>
              ) : (
                <>할당된 업무가 없어요. 새 회의에 참여하거나 태스크를 직접 만들어보세요.</>
              )}
            </p>
            <Link
              to="/summaries"
              className="flex items-center gap-1 text-xs text-brand-purple hover:text-txt-primary transition-colors"
            >
              전체 분석 보기 <ArrowRight size={12} />
            </Link>
          </SectionPanel>

          {/* 놓치지 말아야 할 회의록 */}
          <SectionPanel
            title="최근 회의록"
            subtitle="놓친 회의 없이 빠르게 파악"
            action={
              <Link to="/summaries" className="text-[11px] text-txt-secondary hover:text-txt-primary flex items-center gap-1">
                모두 보기 <ArrowRight size={11} />
              </Link>
            }
          >
            {recentSummaries.length === 0 ? (
              <p className="text-sm text-txt-secondary text-center py-6">아직 완료된 회의가 없습니다</p>
            ) : (
              <div className="space-y-1.5">
                {recentSummaries.map((m) => (
                  <Link
                    key={m.id}
                    to={`/summaries/${m.id}`}
                    className="flex items-center gap-2.5 p-2 rounded hover:bg-bg-tertiary transition-colors group"
                  >
                    <div className="w-8 h-8 rounded bg-brand-purple/10 border border-brand-purple/15 flex items-center justify-center shrink-0">
                      <FileText size={13} className="text-brand-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-txt-primary truncate">{m.title}</p>
                      <p className="text-[10px] text-txt-muted">
                        {format(parseISO(m.ended_at || m.created_at), 'MM/dd HH:mm')}
                        {' · '}어젠다 {m.agendas?.length || 0} · 참여 {m.participants?.length || 0}
                      </p>
                    </div>
                    <ArrowRight size={12} className="text-txt-muted group-hover:text-txt-primary" />
                  </Link>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>
      </div>

      {/* ═══ 오른쪽: 내 태스크 ═══ */}
      <aside className="hidden lg:block w-[340px] shrink-0 bg-[var(--bg-content)] rounded-[12px] p-3 self-start sticky top-3 relative">
        <TaskSlidePanel task={selectedTask} onClose={() => setSelectedTask(null)} />

        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-txt-primary">내 태스크</h2>
            <p className="text-[10px] text-txt-muted mt-0.5">
              진행 {myActiveTasks.filter((t) => t.status === 'in_progress').length} ·
              대기 {myActiveTasks.filter((t) => t.status === 'todo').length}
              {myDoneCount > 0 && <> · 완료 {myDoneCount}</>}
            </p>
          </div>
          <Link to="/tasks" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
            전체 <ArrowRight size={11} />
          </Link>
        </div>

        {myActiveTasks.length === 0 ? (
          <MyTasksEmptyState hasMeetings={todayMeetings.length > 0} />
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-160px)] overflow-y-auto scrollbar-hide pr-0.5">
            {myActiveTasks.map((t) => (
              <MyTaskCard
                key={t.id}
                task={t}
                selected={selectedTask?.id === t.id}
                onSelect={(task) => setSelectedTask(selectedTask?.id === task.id ? null : task)}
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 오늘의 초점 카드 — 가장 급한 태스크 1~2건 하이라이트
// ═══════════════════════════════════════════════════
function FocusCard({ task, onClick }) {
  const dday = task.due_date ? differenceInDays(parseISO(task.due_date), new Date()) : null;
  const isOverdue = dday !== null && dday < 0;
  const isToday = dday === 0;
  const isUrgent = task.priority === 'urgent' || isOverdue || isToday;

  const tone = isOverdue
    ? 'border-status-error/40 bg-status-error/5'
    : isToday
      ? 'border-brand-orange/40 bg-brand-orange/5'
      : task.status === 'in_progress'
        ? 'border-brand-purple/30 bg-brand-purple/5'
        : 'border-border-subtle bg-bg-tertiary';

  const ddayLabel = isOverdue
    ? `${Math.abs(dday)}일 지연`
    : isToday
      ? '오늘 마감'
      : dday !== null
        ? `D-${dday}`
        : '기한 없음';

  const ddayColor = isOverdue
    ? 'text-status-error'
    : isToday
      ? 'text-brand-orange'
      : 'text-txt-secondary';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        text-left p-4 rounded-[8px] border transition-all
        hover:border-border-hover-strong hover:shadow-md ${tone}
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ddayColor}`}>
          {isUrgent ? <Zap size={10} strokeWidth={2.6} /> : <Clock size={10} />}
          <span>{ddayLabel}</span>
        </div>
        {task.ai_suggested && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-brand-purple font-semibold">
            <Sparkles size={9} strokeWidth={2.6} /> AI
          </span>
        )}
      </div>

      <h3 className="text-sm font-semibold text-txt-primary leading-snug mb-1.5">
        {task.title}
      </h3>

      {task.description && (
        <p className="text-[11px] text-txt-secondary leading-relaxed line-clamp-2 mb-2">
          {task.description}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap text-[10px] text-txt-muted">
        {task.service_name && (
          <span className="inline-flex items-center gap-0.5">
            <span className="text-txt-secondary font-medium">{task.service_name}</span>
            {task.feature_name && <span>· {task.feature_name}</span>}
          </span>
        )}
        {task.meeting_title && (
          <span className="inline-flex items-center gap-0.5 text-brand-purple">
            <MessageSquare size={9} />
            {task.meeting_title}
          </span>
        )}
        {task.status === 'in_progress' && (
          <span className="inline-flex items-center gap-0.5 text-brand-purple">
            <TrendingUp size={9} strokeWidth={2.4} />
            진행중
          </span>
        )}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════
// 오늘의 초점 — 빈 상태 (할당 태스크 0건일 때)
// ═══════════════════════════════════════════════════
function FocusEmptyState({ hasMeetings, hasRecentSummaries }) {
  return (
    <div className="bg-bg-tertiary rounded-[8px] p-6 text-center border border-dashed border-border-default">
      <div className="w-12 h-12 rounded-full bg-brand-purple/10 mx-auto mb-3 flex items-center justify-center">
        <Sparkles size={20} className="text-brand-purple" strokeWidth={2} />
      </div>
      <p className="text-sm font-medium text-txt-primary mb-1">
        아직 할당된 업무가 없어요
      </p>
      <p className="text-xs text-txt-secondary mb-4 leading-relaxed">
        {hasMeetings
          ? '오늘 예정된 회의가 있어요. 회의가 끝나면 AI가 태스크를 자동으로 추출해 드릴게요.'
          : hasRecentSummaries
            ? '최근 회의록을 확인하거나 새 회의를 시작해 업무를 정리해보세요.'
            : '새 회의를 시작하면 AI가 결정사항을 태스크로 자동 정리합니다.'}
      </p>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Link to="/meetings">
          <Button variant="gradient" size="sm" icon={MessageSquare}>
            새 회의 시작
          </Button>
        </Link>
        <Link to="/tasks">
          <Button variant="secondary" size="sm" icon={CircleDot}>
            태스크 직접 만들기
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 오른쪽 사이드바 — 빈 상태
// ═══════════════════════════════════════════════════
function MyTasksEmptyState({ hasMeetings }) {
  return (
    <div className="bg-bg-tertiary rounded-[8px] p-5 text-center border border-dashed border-border-default">
      <CircleDot size={22} className="mx-auto text-txt-muted mb-2" strokeWidth={1.8} />
      <p className="text-sm font-medium text-txt-primary mb-1">
        담당 태스크가 없어요
      </p>
      <p className="text-[11px] text-txt-secondary mb-4 leading-relaxed">
        {hasMeetings
          ? '회의가 끝나면 AI가 자동으로\n내게 필요한 일을 정리해 줍니다.'
          : '회의에 참여하거나 직접 만들어\n업무를 정리해 보세요.'}
      </p>
      <Link to="/tasks">
        <Button variant="secondary" size="sm" icon={CircleDot}>
          새 태스크
        </Button>
      </Link>
    </div>
  );
}
