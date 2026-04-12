import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Calendar, CheckCircle2, MessageSquare,
  Clock, Target, TrendingUp, Award, FileText, AlertCircle,
  MessageCircle, Sparkles, History,
} from 'lucide-react';
import { Card, Avatar, Badge, SectionPanel, MetricCard } from '@/components/ui';
import EvaluationReportModal from '@/components/admin/EvaluationReportModal';
import { getOverallGrade, gradeToStyle } from '@/utils/gradeUtils';
import { supabase } from '@/lib/supabase';
import { format, parseISO, differenceInDays } from 'date-fns';

// ── 참여도 점수 계산 ──
function calcParticipationScore(msgCount, meetingCount) {
  if (!meetingCount) return 0;
  const avgMsg = msgCount / meetingCount;
  if (avgMsg >= 8) return 100;
  if (avgMsg >= 5) return 80;
  if (avgMsg >= 3) return 60;
  if (avgMsg >= 1) return 40;
  return 20;
}

// ── 평가 항목 바 ──
function RatingBar({ label, icon: Icon, value, max = 100, delay = 0 }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 70 ? 'from-brand-purple to-brand-orange' :
    pct >= 40 ? 'from-brand-orange to-brand-yellow' : 'from-status-error to-brand-orange';

  const [animated, setAnimated] = useState(false);
  const [displayValue, setDisplayValue] = useState(0);
  const barRef = useRef(null);

  useEffect(() => {
    // IntersectionObserver로 뷰포트에 보일 때 애니메이션 시작
    const el = barRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated) {
          const timer = setTimeout(() => {
            setAnimated(true);
            // 숫자 카운트업 애니메이션
            const duration = 800;
            const start = performance.now();
            const target = Math.round(value);
            const step = (now) => {
              const elapsed = now - start;
              const progress = Math.min(elapsed / duration, 1);
              // easeOutCubic
              const eased = 1 - Math.pow(1 - progress, 3);
              setDisplayValue(Math.round(target * eased));
              if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }, delay);
          return () => clearTimeout(timer);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, delay, animated]);

  return (
    <div className="space-y-1.5" ref={barRef}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-txt-secondary">
          <Icon size={13} />
          <span>{label}</span>
        </div>
        <span className="text-xs font-semibold text-txt-primary">{displayValue}점</span>
      </div>
      <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{
            width: animated ? `${pct}%` : '0%',
            transition: `width 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  // AI 평가 관련
  const [evaluation, setEvaluation] = useState(null);
  const [evalHistory, setEvalHistory] = useState([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function fetchAll() {
      setLoading(true);
      try {
        // 1) 프로필
        const { data: userData } = await supabase
          .from('users')
          .select('id, email, name, avatar_color, role, created_at')
          .eq('id', id)
          .single();
        setProfile(userData);

        // 2) 참여 회의 (messages 테이블에서 user_id로 참여한 회의 ID 추출)
        const { data: msgData } = await supabase
          .from('messages')
          .select('id, meeting_id, content, created_at')
          .eq('user_id', id)
          .eq('is_ai', false)
          .order('created_at', { ascending: false });
        setMessages(msgData || []);

        // 참여 회의 ID 목록
        const meetingIds = [...new Set((msgData || []).map((m) => m.meeting_id))];

        // 3) 회의 상세
        if (meetingIds.length > 0) {
          const { data: mtgData } = await supabase
            .from('meetings')
            .select('id, title, status, started_at, ended_at, scheduled_at, created_at, team_id')
            .in('id', meetingIds)
            .order('created_at', { ascending: false });
          setMeetings(mtgData || []);
        }

        // 4) 배정된 태스크
        const { data: taskData } = await supabase
          .from('tasks')
          .select('id, title, status, priority, due_date, meeting_id, created_at, updated_at')
          .eq('assignee_id', id)
          .order('created_at', { ascending: false });
        setTasks(taskData || []);

        // 5) AI 평가 이력
        const { data: evalData } = await supabase
          .from('employee_evaluations')
          .select('*')
          .eq('user_id', id)
          .order('month', { ascending: false });
        setEvalHistory(evalData || []);
        if (evalData && evalData.length > 0) {
          setEvaluation(evalData[0]);
        }
      } catch (err) {
        console.error('[EmployeeDetail]', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [id]);

  // ── AI 리포트 생성 ──
  async function handleGenerateReport() {
    setReportLoading(true);
    try {
      const month = format(new Date(), 'yyyy-MM');
      const { data, error } = await supabase.functions.invoke('evaluate-employee', {
        body: { userId: id, month },
      });
      if (error) throw error;
      setEvaluation(data);
      setReportOpen(true);
      // 이력 갱신
      const { data: updated } = await supabase
        .from('employee_evaluations')
        .select('*')
        .eq('user_id', id)
        .order('month', { ascending: false });
      setEvalHistory(updated || []);
    } catch (err) {
      console.error('[AI Report]', err);
    } finally {
      setReportLoading(false);
    }
  }

  // ── 통계 계산 ──
  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const completedMeetings = meetings.filter((m) => m.status === 'completed').length;
    const totalMessages = messages.length;
    const avgMsgPerMeeting = totalMeetings > 0 ? Math.round(totalMessages / totalMeetings) : 0;

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
    const todoTasks = tasks.filter((t) => t.status === 'todo').length;
    const overdueTasks = tasks.filter(
      (t) => t.due_date && t.status !== 'done' && differenceInDays(new Date(), parseISO(t.due_date)) > 0,
    ).length;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // AI 평가 존재 시 AI 점수 사용, 없으면 프론트 계산
    const hasAI = !!evaluation?.scores?.participation;

    const participationScore = hasAI ? evaluation.scores.participation : calcParticipationScore(totalMessages, totalMeetings);
    const completionScore = hasAI ? evaluation.scores.task_completion : completionRate;
    const leadershipScore = hasAI ? evaluation.scores.leadership : Math.min(
      Math.round((totalMeetings * 15 + totalMessages * 2) / 2), 100,
    );
    const proactiveScore = hasAI ? evaluation.scores.proactivity : Math.min(avgMsgPerMeeting * 12, 100);

    // 발언 태도 점수
    const speechAttitudeScore = hasAI
      ? evaluation.scores.speech_attitude
      : Math.min(Math.round(
          (totalMessages > 0
            ? (messages.reduce((sum, m) => sum + m.content.length, 0) / totalMessages > 20 ? 55 : 30)
            : 0) + totalMeetings * 5
        ), 100);

    // 가중 평균 (5지표)
    const overallScore = (
      participationScore * 0.2 +
      completionScore * 0.25 +
      leadershipScore * 0.2 +
      proactiveScore * 0.15 +
      speechAttitudeScore * 0.2
    );

    // 등급
    const grade = hasAI
      ? gradeToStyle(evaluation.grade)
      : getOverallGrade(overallScore);
    const gradeLabel = hasAI ? evaluation.grade : grade.label;

    // 회의별 발언 수
    const msgByMeeting = {};
    for (const m of messages) {
      msgByMeeting[m.meeting_id] = (msgByMeeting[m.meeting_id] || 0) + 1;
    }

    return {
      totalMeetings, completedMeetings, totalMessages, avgMsgPerMeeting,
      totalTasks, doneTasks, inProgressTasks, todoTasks, overdueTasks, completionRate,
      participationScore, completionScore, leadershipScore, proactiveScore, speechAttitudeScore,
      overallScore, grade, gradeLabel, hasAI,
      msgByMeeting,
    };
  }, [meetings, tasks, messages, evaluation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="loader-symbol w-12 h-12 rounded-xl bg-gradient-brand shadow-glow flex items-center justify-center">
          <Sparkles size={22} className="text-white" strokeWidth={2.5} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle size={48} className="text-status-error" />
        <p className="text-txt-secondary">직원 정보를 찾을 수 없습니다</p>
        <button
          onClick={() => navigate('/admin')}
          className="text-sm text-brand-purple hover:underline"
        >
          관리자 대시보드로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-3 lg:p-4 mx-auto mr-1 mb-1 md:mr-2 md:mb-2 lg:mr-3 lg:mb-3 min-h-full">
      <div className="bg-[var(--bg-content)] rounded-[12px] p-2 md:p-3 lg:p-4 space-y-3">

        {/* ── 헤더: 뒤로가기 + 프로필 ── */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-tertiary/80 text-txt-secondary hover:text-txt-primary transition-colors"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-4 flex-1">
            <Avatar name={profile.name} color={profile.avatar_color} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-txt-primary">{profile.name}</h1>
                <Badge variant={profile.role === 'admin' ? 'info' : 'outline'}>
                  {profile.role === 'admin' ? '관리자' : '멤버'}
                </Badge>
                {stats.hasAI && (
                  <Badge variant="info">AI 평가</Badge>
                )}
              </div>
              <p className="text-sm text-txt-muted">{profile.email}</p>
              <p className="text-[11px] text-txt-muted mt-0.5">
                가입일: {profile.created_at ? format(parseISO(profile.created_at), 'yyyy.MM.dd') : '-'}
              </p>
            </div>

            {/* 종합 등급 */}
            <div className={`w-16 h-16 rounded-xl ${stats.grade.bg} flex items-center justify-center shrink-0`}>
              <span className={`text-2xl font-bold ${stats.grade.color}`}>{stats.gradeLabel}</span>
            </div>
          </div>
        </div>

        {/* ═══ 섹션 1: 핵심 메트릭 ═══ */}
        <SectionPanel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <MetricCard label="참여 회의" value={stats.totalMeetings} icon={Calendar} />
            <MetricCard label="총 발언 수" value={stats.totalMessages} icon={MessageSquare} />
            <MetricCard
              label="태스크 완수율"
              value={`${stats.completionRate}%`}
              variant="gradient"
              icon={CheckCircle2}
            />
            <MetricCard label="회의당 평균 발언" value={`${stats.avgMsgPerMeeting}회`} icon={TrendingUp} />
          </div>
        </SectionPanel>

        {/* ═══ 섹션 2: 종합 평가 ═══ */}
        <SectionPanel
          title="종합 평가"
          subtitle="참여도·완수율·리더십·적극성·발언 태도 기반"
          action={
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-purple rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Sparkles size={13} />
              {reportLoading ? 'AI 분석 중...' : '세부 리포트'}
            </button>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* 평가 바 차트 (5개) */}
            <div className="bg-bg-tertiary rounded-[7px] p-5 space-y-4">
              <RatingBar label="참여도 (회의 참석 + 발언)" icon={User} value={stats.participationScore} delay={0} />
              <RatingBar label="태스크 완수율" icon={Target} value={stats.completionScore} delay={120} />
              <RatingBar label="리더십 (기여도)" icon={Award} value={stats.leadershipScore} delay={240} />
              <RatingBar label="적극성 (발언 빈도)" icon={TrendingUp} value={stats.proactiveScore} delay={360} />
              <RatingBar label="발언 태도 (건설성·전문성·기여도)" icon={MessageCircle} value={stats.speechAttitudeScore} delay={480} />
            </div>

            {/* 태스크 현황 */}
            <div className="bg-bg-tertiary rounded-[7px] p-5">
              <h4 className="text-sm font-semibold text-txt-primary mb-4">태스크 현황</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-primary rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-txt-primary">{stats.doneTasks}</p>
                  <p className="text-[10px] text-status-success mt-1">완료</p>
                </div>
                <div className="bg-bg-primary rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-txt-primary">{stats.inProgressTasks}</p>
                  <p className="text-[10px] text-brand-purple mt-1">진행 중</p>
                </div>
                <div className="bg-bg-primary rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-txt-primary">{stats.todoTasks}</p>
                  <p className="text-[10px] text-txt-muted mt-1">대기</p>
                </div>
                <div className="bg-bg-primary rounded-md p-3 text-center">
                  <p className="text-2xl font-bold text-status-error">{stats.overdueTasks}</p>
                  <p className="text-[10px] text-status-error mt-1">마감 초과</p>
                </div>
              </div>
            </div>
          </div>
        </SectionPanel>

        {/* ═══ 섹션 3: 월별 AI 평가 이력 ═══ */}
        <SectionPanel
          title="월별 AI 평가 이력"
          subtitle={`총 ${evalHistory.length}건`}
        >
          {evalHistory.length === 0 ? (
            <div className="text-center py-8">
              <History size={32} className="text-txt-muted mx-auto mb-2" />
              <p className="text-sm text-txt-muted">아직 AI 평가 기록이 없습니다</p>
              <p className="text-[11px] text-txt-muted mt-1">위의 "세부 리포트" 버튼으로 첫 평가를 생성하세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {evalHistory.map((ev) => {
                const gs = gradeToStyle(ev.grade);
                return (
                  <Card
                    key={ev.id}
                    className="!p-3.5 cursor-pointer"
                    onClick={() => { setEvaluation(ev); setReportOpen(true); }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-lg ${gs.bg} flex items-center justify-center shrink-0`}>
                        <span className={`text-lg font-bold ${gs.color}`}>{ev.grade}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-txt-primary">{ev.month} 평가</p>
                        <p className="text-[11px] text-txt-muted">
                          회의 {ev.meeting_count}건 · 발언 {ev.message_count}건 · 태스크 {ev.task_count}건
                        </p>
                      </div>
                      <Badge variant={
                        ev.grade === 'S' || ev.grade.startsWith('A') ? 'success' :
                        ev.grade.startsWith('B') ? 'warning' : 'danger'
                      }>
                        종합 {Math.round(ev.overall_score)}점
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </SectionPanel>

        {/* ═══ 섹션 4: 회의 참여 이력 ═══ */}
        <SectionPanel title="회의 참여 이력" subtitle={`총 ${stats.totalMeetings}건`}>
          {meetings.length === 0 ? (
            <p className="text-sm text-txt-muted text-center py-8">참여한 회의가 없습니다</p>
          ) : (
            <div className="space-y-2">
              {meetings.map((mtg) => {
                const msgCount = stats.msgByMeeting[mtg.id] || 0;
                return (
                  <Card key={mtg.id} className="!p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded bg-brand-purple/10 border border-brand-purple/15 flex items-center justify-center shrink-0">
                        <FileText size={14} className="text-brand-purple" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-txt-primary truncate">{mtg.title}</p>
                        <p className="text-[11px] text-txt-muted mt-0.5">
                          {mtg.started_at
                            ? format(parseISO(mtg.started_at), 'yyyy.MM.dd HH:mm')
                            : mtg.scheduled_at
                              ? format(parseISO(mtg.scheduled_at), 'yyyy.MM.dd HH:mm')
                              : '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center">
                          <p className="text-xs font-semibold text-txt-primary">{msgCount}</p>
                          <p className="text-[9px] text-txt-muted">발언</p>
                        </div>
                        <Badge variant={mtg.status === 'completed' ? 'success' : mtg.status === 'active' ? 'info' : 'outline'}>
                          {mtg.status === 'completed' ? '완료' : mtg.status === 'active' ? '진행 중' : '예정'}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </SectionPanel>

        {/* ═══ 섹션 5: 배정 태스크 목록 ═══ */}
        <SectionPanel title="배정 태스크" subtitle={`총 ${stats.totalTasks}건 · 완료 ${stats.doneTasks}건`}>
          {tasks.length === 0 ? (
            <p className="text-sm text-txt-muted text-center py-8">배정된 태스크가 없습니다</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => {
                const isOverdue = task.due_date && task.status !== 'done' &&
                  differenceInDays(new Date(), parseISO(task.due_date)) > 0;
                return (
                  <Card key={task.id} className="!p-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        task.status === 'done' ? 'bg-status-success' :
                        task.status === 'in_progress' ? 'bg-brand-purple' :
                        isOverdue ? 'bg-status-error' : 'bg-txt-muted'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          task.status === 'done' ? 'text-txt-muted line-through' : 'text-txt-primary'
                        }`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.due_date && (
                            <span className={`text-[10px] flex items-center gap-0.5 ${
                              isOverdue ? 'text-status-error' : 'text-txt-muted'
                            }`}>
                              <Clock size={9} />
                              {format(parseISO(task.due_date), 'MM/dd')}
                              {isOverdue && ' (초과)'}
                            </span>
                          )}
                          <Badge variant={
                            task.priority === 'urgent' ? 'danger' :
                            task.priority === 'high' ? 'warning' :
                            'outline'
                          }>
                            {task.priority === 'urgent' ? '긴급' :
                             task.priority === 'high' ? '높음' :
                             task.priority === 'medium' ? '보통' : '낮음'}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant={
                        task.status === 'done' ? 'success' :
                        task.status === 'in_progress' ? 'info' :
                        task.status === 'cancelled' ? 'danger' : 'outline'
                      }>
                        {task.status === 'done' ? '완료' :
                         task.status === 'in_progress' ? '진행 중' :
                         task.status === 'cancelled' ? '취소' : '대기'}
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </SectionPanel>

      </div>

      {/* ── AI 리포트 모달 ── */}
      <EvaluationReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        evaluation={evaluation}
        employeeName={profile?.name}
      />
    </div>
  );
}
