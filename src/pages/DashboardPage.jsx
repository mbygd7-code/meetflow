import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Calendar, Clock, FileText, Sparkles, ArrowRight,
  Zap, CircleDot, MessageSquare, TrendingUp,
  AlertTriangle, Flame, CheckCircle2, Activity,
} from 'lucide-react';
import { gradeToStyle } from '@/utils/gradeUtils';
import { computeUserEvaluation, fetchMyMessageStats } from '@/utils/evaluation';
import { Avatar, Button, SectionPanel } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import MeetingCard from '@/components/meeting/MeetingCard';
import { useMeetingCancel, isDeclinedByMe, isMyMeeting } from '@/hooks/useMeetingCancel';
import MemberTaskCard from '@/components/task/MemberTaskCard';
import TaskDetailPanel from '@/components/members/TaskDetailPanel';
import EmptyState from '@/components/ui/EmptyState';
import { useToastStore } from '@/stores/toastStore';
import { getDueDateStatus, safeFormatDate } from '@/utils/formatters';
import { DASHBOARD_LIMITS, URGENT_DUE_DAYS } from '@/lib/taskConstants';

export default function DashboardPage() {
  const { pageTitle } = useOutletContext() || {};
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { meetings } = useMeetingStore();
  const { tasks, updateTask } = useTaskStore();
  const addToast = useToastStore((s) => s.addToast);
  const { handleCancel: handleMeetingCancel, handleJoin: handleMeetingJoin, declinedIds } = useMeetingCancel();

  // ── 내 평가 (공통 유틸 사용 → /me/evaluation 페이지와 항상 동일한 점수) ──
  const [myEval, setMyEval] = useState(null);
  // null = 아직 로딩 중 / 객체 = 로딩 완료
  const [myMessageStats, setMyMessageStats] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        // AI 월간 평가
        const { data: evalData } = await supabase
          .from('employee_evaluations')
          .select('*')
          .eq('user_id', user.id)
          .order('month', { ascending: false })
          .limit(1);
        if (!cancelled && evalData && evalData.length > 0) setMyEval(evalData[0]);

        // 메시지 통계 (공통 유틸)
        const stats = await fetchMyMessageStats(supabase, user.id);
        if (!cancelled) setMyMessageStats(stats);
      } catch (err) {
        console.warn('[DashboardPage] eval load failed:', err?.message);
        if (!cancelled) setMyMessageStats({ count: 0, meetingIds: [], totalChars: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // 공통 유틸로 점수 계산 — MyEvaluationPage 와 동일 결과 보장
  const myEvaluation = useMemo(
    () => computeUserEvaluation({ aiEval: myEval, tasks, msgStats: myMessageStats, userId: user?.id }),
    [myEval, tasks, myMessageStats, user?.id]
  );
  const evalLoading = myMessageStats === null;

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
  const isAdmin = user?.role === 'admin';
  const todayMeetings = useMemo(() => {
    const now = Date.now();
    return meetings.filter((m) => {
      // 비관리자는 본인 관련 회의만
      if (!isAdmin && user?.id && !isMyMeeting(m, user.id)) return false;
      // 본인이 불참 표시한 회의 숨김
      if (m.status === 'scheduled' && isDeclinedByMe(m, user?.id, declinedIds)) return false;
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
  }, [meetings, user?.id, declinedIds, isAdmin]);

  const recentSummaries = useMemo(
    () =>
      meetings
        .filter((m) => m.status === 'completed')
        .slice(0, DASHBOARD_LIMITS.RECENT_SUMMARIES),
    [meetings]
  );

  // ─── Milo 인사이트 — 가장 액션 가치 높은 1건 + 헤드라인 ───
  const miloInsight = useMemo(() => {
    const now = Date.now();
    // 1) 활성 회의 (지금 진행 중)
    const liveMeeting = todayMeetings.find((m) => m.status === 'active');
    // 2) 다음 예정 회의 (지금부터 가까운 순)
    const upcoming = todayMeetings
      .filter((m) => m.status === 'scheduled')
      .map((m) => ({ m, t: new Date(m.scheduled_at || m.created_at).getTime() }))
      .filter((x) => !isNaN(x.t) && x.t >= now)
      .sort((a, b) => a.t - b.t);
    const nextMeeting = upcoming[0]?.m || null;
    const minutesToNext = nextMeeting ? Math.max(0, Math.round((upcoming[0].t - now) / 60000)) : null;

    // 3) 가장 급한 태스크
    const overdueTasks = myActiveTasks
      .filter((t) => t.due_date && differenceInDays(parseISO(t.due_date), new Date()) < 0)
      .sort((a, b) => parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime());
    const dueSoonTasks = myActiveTasks
      .filter((t) => {
        if (!t.due_date) return false;
        const d = differenceInDays(parseISO(t.due_date), new Date());
        return d >= 0 && d <= URGENT_DUE_DAYS;
      })
      .sort((a, b) => parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime());
    const urgentNoDate = myActiveTasks.filter(
      (t) => t.priority === 'urgent' && (!t.due_date || differenceInDays(parseISO(t.due_date), new Date()) > URGENT_DUE_DAYS)
    );
    const focusTask = overdueTasks[0] || dueSoonTasks[0] || urgentNoDate[0] || null;

    // 4) 헤드라인 (한 줄, 가장 시급한 것)
    let headline;
    let headlineIcon = Sparkles;
    let headlineColor = 'text-brand-purple';
    if (liveMeeting) {
      headline = `회의 진행 중: "${liveMeeting.title}" — 지금 참여`;
      headlineIcon = Activity;
      headlineColor = 'text-status-success';
    } else if (nextMeeting && minutesToNext !== null && minutesToNext <= 60) {
      headline = `${minutesToNext}분 후 회의: "${nextMeeting.title}"`;
      headlineIcon = Clock;
      headlineColor = 'text-brand-orange';
    } else if (overdueTasks.length > 0) {
      headline = `지연 태스크 ${overdueTasks.length}건이 있어요. 즉시 확인이 필요합니다`;
      headlineIcon = AlertTriangle;
      headlineColor = 'text-status-error';
    } else if (dueSoonTasks.length > 0) {
      const d = differenceInDays(parseISO(dueSoonTasks[0].due_date), new Date());
      headline = d === 0
        ? `오늘 마감 ${dueSoonTasks.length}건 — 가장 급한 건 "${dueSoonTasks[0].title}"`
        : `${d}일 내 마감 ${dueSoonTasks.length}건 — 첫 마감 "${dueSoonTasks[0].title}"`;
      headlineIcon = Clock;
      headlineColor = 'text-brand-orange';
    } else if (urgentNoDate.length > 0) {
      headline = `긴급 태스크 ${urgentNoDate.length}건이 대기 중`;
      headlineIcon = Flame;
      headlineColor = 'text-status-error';
    } else if (todayMeetings.length > 0) {
      headline = `오늘 회의 ${todayMeetings.length}개 — 첫 회의 ${
        nextMeeting ? format(new Date(nextMeeting.scheduled_at || nextMeeting.created_at), 'HH:mm') : ''
      }${nextMeeting ? ` "${nextMeeting.title}"` : ''}`;
      headlineIcon = Calendar;
      headlineColor = 'text-brand-purple';
    } else if (taskCounts.done > 0) {
      headline = `급한 일 없음 · 지금까지 ${taskCounts.done}건 완료. 좋은 페이스예요`;
      headlineIcon = CheckCircle2;
      headlineColor = 'text-status-success';
    } else {
      headline = '할당된 업무가 없어요. 새 회의에 참여하거나 태스크를 만들어보세요';
      headlineIcon = Sparkles;
      headlineColor = 'text-txt-secondary';
    }

    return {
      headline,
      headlineIcon,
      headlineColor,
      focusTask,
      focusKind:
        overdueTasks.length > 0 ? 'overdue' :
        dueSoonTasks.length > 0 ? 'dueSoon' :
        urgentNoDate.length > 0 ? 'urgent' : null,
      liveMeeting,
      nextMeeting,
      minutesToNext,
      counts: {
        overdue: overdueTasks.length,
        dueSoon: dueSoonTasks.length,
        urgent: urgentNoDate.length,
        inProgress: taskCounts.inProgress,
        done: taskCounts.done,
        meetings: todayMeetings.length,
      },
    };
  }, [todayMeetings, myActiveTasks, taskCounts]);

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
        {/* 인사말 + 하루 요약 + 내 평가 등급 */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
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

          {/* 내 평가 버튼 — 기본은 '내 평가' 라벨만 노출.
              · 호버 시 등급 배지 + 점수가 페이드 인
              · 클릭 시 /me/evaluation 으로 이동 */}
          <button
            type="button"
            onClick={() => navigate('/me/evaluation')}
            className="shrink-0 group relative flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle hover:border-brand-purple/40 hover:bg-bg-tertiary/40 transition-colors"
            title="내 평가 보기"
            aria-label="내 평가 보기"
          >
            <Sparkles size={14} className="text-brand-purple" />
            <span className="text-sm font-semibold text-txt-primary">내 평가</span>

            {/* 호버 시 노출되는 등급 + 점수 (가로로 슬라이드 인) */}
            {!evalLoading && myEvaluation && (() => {
              const gs = gradeToStyle(myEvaluation.grade);
              return (
                <span
                  className="hidden sm:inline-flex items-center gap-2 max-w-0 overflow-hidden opacity-0
                             group-hover:max-w-[180px] group-hover:opacity-100 group-focus-visible:max-w-[180px] group-focus-visible:opacity-100
                             transition-all duration-300"
                  aria-hidden="true"
                >
                  <span className="w-px h-5 bg-border-subtle" />
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${gs.bg}`}>
                    <span className={`text-xs font-extrabold ${gs.color}`}>{myEvaluation.grade}</span>
                  </span>
                  <span className="text-xs font-semibold text-txt-primary whitespace-nowrap">
                    {Math.round(myEvaluation.overall_score)}점
                  </span>
                </span>
              );
            })()}

            <ArrowRight size={14} className="text-txt-muted group-hover:text-brand-purple transition-colors" />
          </button>
        </div>

        {/* ═══ 긴급 업무 ═══ */}
        <SectionPanel
          title="긴급 업무"
          subtitle={focusTasks.length > 0 ? '가장 먼저 처리하면 좋을 업무' : '아직 할당된 업무가 없어요'}
          action={
            <Link to="/members" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
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
                { label: '태스크 직접 만들기', to: '/members', icon: CircleDot, variant: 'secondary' },
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
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  onCancel={m.status === 'scheduled' ? (e) => handleMeetingCancel(e, m) : undefined}
                  onJoin={m.status === 'scheduled' ? (e) => handleMeetingJoin(e, m) : undefined}
                />
              ))}
            </div>
          )}
        </SectionPanel>

        {/* ═══ Milo 인사이트 + 최근 회의록 ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionPanel className="subsection-gold">
            {/* 헤더 */}
            <div className="flex items-center gap-3 mb-3">
              <Avatar variant="ai" size="md" label="M" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-txt-primary">Milo 인사이트</p>
                <p className="text-[10px] text-txt-muted">우선순위 + 액션 추천</p>
              </div>
            </div>

            {/* 핵심 헤드라인 — 가장 시급한 것 한 줄 */}
            {(() => {
              const Icon = miloInsight.headlineIcon;
              return (
                <div className="flex items-start gap-2 mb-3 p-2.5 rounded-md bg-bg-tertiary/50">
                  <Icon size={16} className={`${miloInsight.headlineColor} shrink-0 mt-0.5`} />
                  <p className="text-xs text-txt-primary leading-relaxed">
                    {miloInsight.headline}
                  </p>
                </div>
              );
            })()}

            {/* 핵심 액션 카드 — 가장 급한 태스크 1개 OR 다음 회의 */}
            {miloInsight.liveMeeting ? (
              <button
                type="button"
                onClick={() => navigate(`/meetings/${miloInsight.liveMeeting.id}`)}
                className="w-full text-left p-3 rounded-md border border-status-success/30 bg-status-success/5 hover:bg-status-success/10 transition-colors mb-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
                  <p className="text-[10px] font-semibold text-status-success uppercase tracking-wider">진행 중</p>
                </div>
                <p className="text-sm font-semibold text-txt-primary truncate">{miloInsight.liveMeeting.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-status-success mt-1.5">
                  지금 참여하기 <ArrowRight size={11} />
                </p>
              </button>
            ) : miloInsight.focusTask ? (
              <button
                type="button"
                onClick={() => setSelectedTaskId(miloInsight.focusTask.id)}
                className={`w-full text-left p-3 rounded-md border mb-3 transition-colors ${
                  miloInsight.focusKind === 'overdue'
                    ? 'border-status-error/30 bg-status-error/5 hover:bg-status-error/10'
                    : miloInsight.focusKind === 'dueSoon'
                      ? 'border-brand-orange/30 bg-brand-orange/5 hover:bg-brand-orange/10'
                      : 'border-status-error/25 bg-bg-tertiary hover:bg-bg-tertiary/70'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {miloInsight.focusKind === 'overdue' ? (
                    <>
                      <AlertTriangle size={11} className="text-status-error" />
                      <p className="text-[10px] font-semibold text-status-error uppercase tracking-wider">
                        지연 · {Math.abs(differenceInDays(parseISO(miloInsight.focusTask.due_date), new Date()))}일 경과
                      </p>
                    </>
                  ) : miloInsight.focusKind === 'dueSoon' ? (
                    <>
                      <Clock size={11} className="text-brand-orange" />
                      <p className="text-[10px] font-semibold text-brand-orange uppercase tracking-wider">
                        {differenceInDays(parseISO(miloInsight.focusTask.due_date), new Date()) === 0
                          ? '오늘 마감' : `D-${differenceInDays(parseISO(miloInsight.focusTask.due_date), new Date())}`}
                      </p>
                    </>
                  ) : (
                    <>
                      <Flame size={11} className="text-status-error" />
                      <p className="text-[10px] font-semibold text-status-error uppercase tracking-wider">긴급</p>
                    </>
                  )}
                </div>
                <p className="text-sm font-semibold text-txt-primary truncate">{miloInsight.focusTask.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-txt-secondary mt-1.5">
                  처리하기 <ArrowRight size={11} />
                </p>
              </button>
            ) : miloInsight.nextMeeting ? (
              <button
                type="button"
                onClick={() => navigate(`/meetings/${miloInsight.nextMeeting.id}`)}
                className="w-full text-left p-3 rounded-md border border-brand-purple/25 bg-brand-purple/5 hover:bg-brand-purple/10 transition-colors mb-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={11} className="text-brand-purple" />
                  <p className="text-[10px] font-semibold text-brand-purple uppercase tracking-wider">
                    {miloInsight.minutesToNext != null && miloInsight.minutesToNext < 60
                      ? `${miloInsight.minutesToNext}분 후`
                      : format(new Date(miloInsight.nextMeeting.scheduled_at || miloInsight.nextMeeting.created_at), 'HH:mm')}
                  </p>
                </div>
                <p className="text-sm font-semibold text-txt-primary truncate">{miloInsight.nextMeeting.title}</p>
                <p className="flex items-center gap-1 text-[11px] text-brand-purple mt-1.5">
                  회의방으로 <ArrowRight size={11} />
                </p>
              </button>
            ) : null}

            {/* 보조 메트릭 — 한 줄 칩 */}
            <div className="flex items-center flex-wrap gap-1.5 mb-3 text-[11px]">
              {miloInsight.counts.overdue > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-error/10 text-status-error font-semibold">
                  <AlertTriangle size={10} /> 지연 {miloInsight.counts.overdue}
                </span>
              )}
              {miloInsight.counts.dueSoon > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange font-semibold">
                  <Clock size={10} /> 임박 {miloInsight.counts.dueSoon}
                </span>
              )}
              {miloInsight.counts.urgent > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-error/10 text-status-error font-semibold">
                  <Flame size={10} /> 긴급 {miloInsight.counts.urgent}
                </span>
              )}
              {miloInsight.counts.inProgress > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple font-semibold">
                  <Activity size={10} /> 진행 {miloInsight.counts.inProgress}
                </span>
              )}
              {miloInsight.counts.done > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success/10 text-status-success font-semibold">
                  <CheckCircle2 size={10} /> 완료 {miloInsight.counts.done}
                </span>
              )}
            </div>

            <Link
              to="/members"
              className="flex items-center gap-1 text-xs text-brand-purple hover:text-txt-primary transition-colors"
            >
              내 태스크 전체 보기 <ArrowRight size={14} />
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
            <Link to="/members" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
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
              actions={[{ label: '새 태스크', to: '/members', icon: CircleDot, variant: 'secondary' }]}
              compact
            />
          ) : (
            <div className="space-y-1.5">
              {myActiveTasks.map((t) => (
                <MemberTaskCard
                  key={t.id}
                  task={t}
                  members={members}
                  onClick={handleSelectTask}
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
          <Link to="/members" className="text-xs text-txt-secondary hover:text-txt-primary flex items-center gap-1">
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
            actions={[{ label: '새 태스크', to: '/members', icon: CircleDot, variant: 'secondary' }]}
            compact
          />
        ) : (
          <div className="space-y-1.5 pr-0.5">
            {myActiveTasks.map((t) => (
              <MemberTaskCard
                key={t.id}
                task={t}
                members={members}
                onClick={handleSelectTask}
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
