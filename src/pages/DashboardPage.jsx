import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Calendar, Clock, FileText, Sparkles, ArrowRight,
  Zap, CircleDot, MessageSquare, TrendingUp,
} from 'lucide-react';
import { Avatar, Button, SectionPanel } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import MeetingCard from '@/components/meeting/MeetingCard';
import MyTaskCard from '@/components/task/MyTaskCard';
import TaskDetailPanel from '@/components/members/TaskDetailPanel';
import EmptyState from '@/components/ui/EmptyState';
import { useToastStore } from '@/stores/toastStore';
import { getDueDateStatus, safeFormatDate } from '@/utils/formatters';
import { DASHBOARD_LIMITS, URGENT_DUE_DAYS } from '@/lib/taskConstants';

export default function DashboardPage() {
  const { pageTitle } = useOutletContext() || {};
  const { user } = useAuthStore();
  const { meetings } = useMeetingStore();
  const { tasks, updateTask } = useTaskStore();
  const addToast = useToastStore((s) => s.addToast);

  // 태스크 상세 모달 상태 (id만 저장 → Realtime 업데이트 시 최신 객체 조회)
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [members, setMembers] = useState([]);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null),
    [selectedTaskId, tasks]
  );

  // 멤버 목록 로드 (담당자 드롭다운용 + 카드 인라인 편집용) — 마운트 시 1회
  useEffect(() => {
    if (members.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, email, avatar_color, role, slack_user_id')
          .order('name');
        if (!cancelled) setMembers(data || []);
      } catch (err) {
        console.error('[DashboardPage] members load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [members.length]);

  const today = format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko });

  // ─── 내 태스크 분류 + 카운트 한 번에 ───
  const myTaskStats = useMemo(() => {
    const userId = user?.id;
    const userName = user?.name;
    const active = [];
    const counts = { inProgress: 0, todo: 0, done: 0, overdue: 0, dueSoon: 0 };
    const now = new Date();

    for (const t of tasks) {
      // 담당자 매칭 (id 우선, fallback으로 이름)
      const isMine =
        (userId && t.assignee_id === userId) ||
        (userName && (t.assignee?.name === userName || t.assignee_name === userName));
      if (!isMine) continue;

      if (t.status === 'done') {
        counts.done++;
        continue;
      }

      active.push(t);
      if (t.status === 'in_progress') counts.inProgress++;
      else if (t.status === 'todo') counts.todo++;

      if (t.due_date) {
        const d = differenceInDays(parseISO(t.due_date), now);
        if (d < 0) counts.overdue++;
        else if (d <= URGENT_DUE_DAYS) counts.dueSoon++;
      }
    }
    return { active, counts };
  }, [tasks, user]);

  const myActiveTasks = myTaskStats.active;
  const taskCounts = myTaskStats.counts;

  // ─── 긴급 업무 (priority='urgent' 만, 완료 제외, 마감일 임박순 상위 2건) ───
  //   - 완료된 태스크 제외 (myActiveTasks가 이미 완료 제외 상태)
  //   - priority === 'urgent' 태깅된 것만
  //   - 마감일 오름차순(임박한 순). 마감일 없으면 맨 뒤
  const focusTasks = useMemo(() => {
    return myActiveTasks
      .filter((t) => t.priority === 'urgent')
      .map((t) => ({
        task: t,
        dueTime: t.due_date ? parseISO(t.due_date).getTime() : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.dueTime - b.dueTime)
      .slice(0, 2)
      .map(({ task }) => task);
  }, [myActiveTasks]);

  // ─── 회의 분류 ───
  // 활성(진행중) 또는 예정된 회의 — 단, 예정인데 시간이 이미 지났고 시작 안 된 회의는 제외
  // (MeetingCard의 scheduledPassed 로직과 동일: scheduled_at 우선, 없으면 created_at)
  const todayMeetings = useMemo(() => {
    const now = Date.now();
    return meetings.filter((m) => {
      if (m.status === 'active') return true;
      if (m.status === 'scheduled') {
        const effective = m.scheduled_at || m.created_at;
        if (!effective) return true; // 시간 정보 전혀 없으면 포함
        const when = new Date(effective).getTime();
        if (isNaN(when)) return true;
        // 10분 이상 지난 회의는 "놓친 회의"로 보고 오늘 일정에서 제외
        return (now - when) <= 10 * 60 * 1000;
      }
      return false;
    });
  }, [meetings]);

  const recentSummaries = useMemo(
    () =>
      meetings
        .filter((m) => m.status === 'completed')
        .slice(0, DASHBOARD_LIMITS.RECENT_SUMMARIES),
    [meetings]
  );

  // ─── 하루 요약 문장 ───
  const summarySentence = useMemo(() => {
    const parts = [];
    if (todayMeetings.length > 0) parts.push(`회의 ${todayMeetings.length}개`);
    if (taskCounts.overdue > 0) parts.push(`지연 ${taskCounts.overdue}건`);
    if (taskCounts.dueSoon > 0) parts.push(`마감 임박 ${taskCounts.dueSoon}건`);
    if (parts.length === 0) return '오늘은 여유로운 하루네요 ☕';
    return `오늘 ${parts.join(' · ')} 있어요`;
  }, [todayMeetings, taskCounts]);

  // ─── 태스크 카드 클릭 → 이 페이지 내에서 TaskDetailPanel 모달 열기 ───
  // (MembersPage로 이동하지 않고 현재 대시보드에서 전체 상세/코멘트/첨부 확인)
  const handleSelectTask = useCallback((task) => {
    if (!task?.id) return;
    setSelectedTaskId(task.id);
  }, []);

  const handleCloseTask = useCallback(() => setSelectedTaskId(null), []);

  // 태스크 상태 변경
  const handleStatusChange = useCallback(async (taskId, newStatus) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('편집 권한이 없습니다');
      updateTask(taskId, data);
    } catch (err) {
      console.error('[DashboardPage] status change failed:', err);
      addToast?.('상태 변경 실패', 'error', 3000);
    }
  }, [updateTask, addToast]);

  // 태스크 필드 업데이트 (제목/설명/담당자/기한 등)
  const handleUpdateTask = useCallback(async (taskId, patch, { silent = false } = {}) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('편집 권한이 없습니다 (RLS)');
      updateTask(taskId, data);
      if (!silent) addToast?.('변경되었습니다', 'success', 2000);
    } catch (err) {
      console.error('[DashboardPage] update failed:', err);
      if (!silent) addToast?.(err.message || '업데이트 실패', 'error', 3000);
    }
  }, [updateTask, addToast]);

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

        {/* ═══ 긴급 업무 ═══ */}
        <SectionPanel
          title="긴급 업무"
          subtitle={focusTasks.length > 0 ? '가장 먼저 처리하면 좋을 업무' : '아직 할당된 업무가 없어요'}
          action={
            <Link to="/tasks" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
              모든 태스크 <ArrowRight size={14} />
            </Link>
          }
        >
          {focusTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {focusTasks.map((t) => (
                <FocusCard
                  key={t.id}
                  task={t}
                  onClick={handleSelectTask}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title={myActiveTasks.length > 0 ? '긴급 업무가 없어요' : '아직 할당된 업무가 없어요'}
              description={
                myActiveTasks.length > 0
                  ? '긴급으로 태깅된 미완료 업무가 없습니다. 일반 업무는 "모든 태스크"에서 확인하세요.'
                  : todayMeetings.length > 0
                  ? '오늘 예정된 회의가 있어요. 회의가 끝나면 AI가 태스크를 자동으로 추출해 드릴게요.'
                  : recentSummaries.length > 0
                    ? '최근 회의록을 확인하거나 새 회의를 시작해 업무를 정리해보세요.'
                    : '새 회의를 시작하면 AI가 결정사항을 태스크로 자동 정리합니다.'
              }
              actions={[
                { label: '새 회의 시작', to: '/meetings', icon: MessageSquare, variant: 'gradient' },
                { label: '태스크 직접 만들기', to: '/tasks', icon: CircleDot, variant: 'secondary' },
              ]}
            />
          )}
        </SectionPanel>

        {/* ═══ 오늘의 회의 ═══ */}
        <SectionPanel
          title="오늘의 회의"
          subtitle={todayMeetings.length > 0 ? `회의 ${todayMeetings.length}개 예정` : undefined}
          action={
            <Link to="/meetings" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
              모두 보기 <ArrowRight size={14} />
            </Link>
          }
        >
          {todayMeetings.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="오늘 예정된 회의가 없습니다"
              actions={[
                { label: '새 회의 만들기', to: '/meetings', variant: 'gradient' },
              ]}
              variant="solid"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {todayMeetings.slice(0, DASHBOARD_LIMITS.TODAY_MEETINGS).map((m) => (
                <MeetingCard key={m.id} meeting={m} />
              ))}
            </div>
          )}
        </SectionPanel>

        {/* ═══ Milo 인사이트 + 최근 회의록 ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionPanel className="subsection-gold">
            <div className="flex items-center gap-3 mb-3">
              <Avatar variant="ai" size="md" label="M" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">Milo 인사이트</p>
                <p className="text-[10px] text-txt-muted">실시간 현황 요약</p>
              </div>
            </div>
            <p className="text-xs text-txt-secondary leading-relaxed mb-3">
              {myActiveTasks.length > 0 ? (
                <>
                  진행 중인 태스크 <span className="text-txt-primary font-semibold">{taskCounts.inProgress}건</span>,
                  대기 중 <span className="text-txt-primary font-semibold">{taskCounts.todo}건</span>이에요.
                  {taskCounts.done > 0 && (
                    <> 지금까지 <span className="text-status-success font-semibold">{taskCounts.done}건</span>을 완료했습니다.</>
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
              전체 분석 보기 <ArrowRight size={14} />
            </Link>
          </SectionPanel>

          <SectionPanel
            title="최근 회의록"
            subtitle="놓친 회의 없이 빠르게 파악"
            action={
              <Link to="/summaries" className="text-[11px] text-txt-secondary hover:text-txt-primary flex items-center gap-1">
                모두 보기 <ArrowRight size={13} />
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
                      <FileText size={15} className="text-brand-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-txt-primary truncate">{m.title}</p>
                      <p className="text-[10px] text-txt-muted">
                        {safeFormatDate(m.ended_at || m.created_at, 'MM/dd HH:mm', '시간 미상')}
                        {' · '}어젠다 {m.agendas?.length || 0} · 참여 {m.participants?.length || 0}
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-txt-muted group-hover:text-txt-primary" />
                  </Link>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>

        {/* ═══ 모바일 전용: 내 태스크 ═══ */}
        <SectionPanel
          className="lg:hidden"
          title="내 태스크"
          subtitle={
            myActiveTasks.length > 0
              ? `진행 ${taskCounts.inProgress} · 대기 ${taskCounts.todo}${taskCounts.done > 0 ? ` · 완료 ${taskCounts.done}` : ''}`
              : undefined
          }
          action={
            <Link to="/tasks" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
              전체 <ArrowRight size={13} />
            </Link>
          }
        >
          {myActiveTasks.length === 0 ? (
            <EmptyState
              icon={CircleDot}
              title="담당 태스크가 없어요"
              description={
                todayMeetings.length > 0
                  ? '회의가 끝나면 AI가 자동으로 내게 필요한 일을 정리해 줍니다.'
                  : '회의에 참여하거나 직접 만들어 업무를 정리해 보세요.'
              }
              actions={[{ label: '새 태스크', to: '/tasks', icon: CircleDot, variant: 'secondary' }]}
              compact
            />
          ) : (
            <div className="space-y-2">
              {myActiveTasks.map((t) => (
                <MyTaskCard
                  key={t.id}
                  task={t}
                  members={members}
                  onSelect={handleSelectTask}
                  onQuickStatus={handleStatusChange}
                  onQuickUpdate={handleUpdateTask}
                />
              ))}
            </div>
          )}
        </SectionPanel>
      </div>

      {/* ═══ 데스크톱 오른쪽: 내 태스크 ═══ */}
      <aside className="hidden lg:block w-[340px] shrink-0 bg-[var(--bg-content)] rounded-[12px] p-3 self-start sticky top-3 relative">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-txt-primary">내 태스크</h2>
            <p className="text-[10px] text-txt-muted mt-0.5">
              진행 {taskCounts.inProgress} · 대기 {taskCounts.todo}
              {taskCounts.done > 0 && <> · 완료 {taskCounts.done}</>}
            </p>
          </div>
          <Link to="/tasks" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
            전체 <ArrowRight size={13} />
          </Link>
        </div>

        {myActiveTasks.length === 0 ? (
          <EmptyState
            icon={CircleDot}
            title="담당 태스크가 없어요"
            description={
              todayMeetings.length > 0
                ? '회의가 끝나면 AI가 자동으로 내게 필요한 일을 정리해 줍니다.'
                : '회의에 참여하거나 직접 만들어 업무를 정리해 보세요.'
            }
            actions={[{ label: '새 태스크', to: '/tasks', icon: CircleDot, variant: 'secondary' }]}
            compact
          />
        ) : (
          <div className="space-y-2 max-h-[calc(100vh-160px)] overflow-y-auto scrollbar-hide pr-0.5">
            {myActiveTasks.map((t) => (
              <MyTaskCard
                key={t.id}
                task={t}
                members={members}
                onSelect={handleSelectTask}
                onQuickStatus={handleStatusChange}
                onQuickUpdate={handleUpdateTask}
              />
            ))}
          </div>
        )}
      </aside>

      {/* 태스크 상세 모달 — 전용 페이지로 이동하지 않고 대시보드에서 바로 열림 */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          members={members}
          currentUser={user}
          onClose={handleCloseTask}
          onStatusChange={handleStatusChange}
          onUpdate={handleUpdateTask}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 긴급 업무 카드 — 가장 급한 태스크 1~2건 하이라이트
// ═══════════════════════════════════════════════════
function FocusCard({ task, onClick }) {
  const dday = getDueDateStatus(task.due_date);
  const isOverdue = dday?.overdue ?? false;
  const isToday = dday?.today ?? false;

  const tone = isOverdue
    ? 'border-status-error/40 bg-status-error/5'
    : isToday
      ? 'border-brand-orange/40 bg-brand-orange/5'
      : task.status === 'in_progress'
        ? 'border-brand-purple/30 bg-brand-purple/5'
        : 'border-border-subtle bg-bg-tertiary';

  const ddayLabel = dday?.text || '기한 없음';
  const ddayColor = isOverdue
    ? 'text-status-error'
    : isToday
      ? 'text-brand-orange'
      : 'text-txt-secondary';

  const IconComp = dday?.urgent ? Zap : Clock;

  return (
    <button
      type="button"
      onClick={() => onClick?.(task)}
      className={`
        text-left p-4 rounded-[8px] border transition-colors
        hover:border-border-hover-strong ${tone}
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ddayColor}`}>
          <IconComp size={12} strokeWidth={2.6} />
          <span>{ddayLabel}</span>
        </div>
        {task.ai_suggested && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-brand-purple font-semibold">
            <Sparkles size={11} strokeWidth={2.6} /> AI
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
            <MessageSquare size={11} />
            {task.meeting_title}
          </span>
        )}
        {task.status === 'in_progress' && (
          <span className="inline-flex items-center gap-0.5 text-brand-purple">
            <TrendingUp size={11} strokeWidth={2.4} />
            진행중
          </span>
        )}
      </div>
    </button>
  );
}
