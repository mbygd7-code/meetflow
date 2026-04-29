import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import TaskDetailPanel from '@/components/members/TaskDetailPanel';
import { useAuthStore } from '@/stores/authStore';
import MemberTaskCard from '@/components/task/MemberTaskCard';
import { useTaskStore } from '@/stores/taskStore';
import { useToastStore } from '@/stores/toastStore';

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
          <Icon size={15} />
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

  // 기간 필터
  const [dateRange, setDateRange] = useState('all');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const dateRangeStart = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateRange === 'all') return null;
    if (dateRange === 'day') return d;
    if (dateRange === 'week') {
      const dow = (d.getDay() + 6) % 7;
      const start = new Date(d);
      start.setDate(d.getDate() - dow);
      return start;
    }
    if (dateRange === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (dateRange === 'year') return new Date(now.getFullYear(), 0, 1);
    if (dateRange === 'custom' && customStart) return new Date(`${customStart}T00:00:00`);
    return null;
  }, [dateRange, customStart]);

  const dateRangeEnd = useMemo(() => {
    if (dateRange === 'custom' && customEnd) {
      const d = new Date(`${customEnd}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d;
    }
    return null;
  }, [dateRange, customEnd]);

  const inDateRange = (iso) => {
    if (!dateRangeStart && !dateRangeEnd) return true;
    if (!iso) return false;
    const ts = new Date(iso).getTime();
    if (isNaN(ts)) return false;
    if (dateRangeStart && ts < dateRangeStart.getTime()) return false;
    if (dateRangeEnd && ts >= dateRangeEnd.getTime()) return false;
    return true;
  };

  // 기간 필터 적용된 데이터
  const filteredMessages = useMemo(
    () => messages.filter((m) => inDateRange(m.created_at)),
    [messages, dateRangeStart, dateRangeEnd]
  );
  const filteredMeetings = useMemo(
    () => meetings.filter((m) => inDateRange(m.ended_at || m.started_at || m.scheduled_at || m.created_at)),
    [meetings, dateRangeStart, dateRangeEnd]
  );
  const filteredTasks = useMemo(
    () => tasks.filter((t) => inDateRange(t.created_at)),
    [tasks, dateRangeStart, dateRangeEnd]
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const { user: currentUser } = useAuthStore();
  const [reportLoading, setReportLoading] = useState(false);

  const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;
  const updateTaskInStore = useTaskStore((s) => s.updateTask);
  const addToast = useToastStore((s) => s.addToast);
  const [members, setMembers] = useState([]);

  // 멤버 목록 (담당자 드롭다운용)
  useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, email, avatar_color, role, slack_user_id')
          .order('name');
        if (!cancelled) setMembers(data || []);
      } catch (err) {
        console.error('[EmployeeDetailPage] members load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [SUPABASE_ENABLED]);

  // ── 태스크 인라인 편집 핸들러 ──
  const updateTaskFieldDb = useCallback(async (taskId, patch) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('편집 권한이 없습니다');
      // 로컬 state + 글로벌 store 양쪽 동기화
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
      updateTaskInStore(taskId, data);
      return data;
    } catch (err) {
      console.error('[EmployeeDetailPage] update failed:', err);
      addToast?.('업데이트 실패: ' + (err.message || err), 'error', 3000);
      return null;
    }
  }, [updateTaskInStore, addToast]);

  const handleStatusChange = useCallback(
    (taskId, newStatus) => updateTaskFieldDb(taskId, { status: newStatus }),
    [updateTaskFieldDb]
  );
  const handleUpdateTask = useCallback(
    (taskId, patch) => updateTaskFieldDb(taskId, patch),
    [updateTaskFieldDb]
  );

  // 데모 직원 데이터
  const MOCK_EMPLOYEES = {
    u1: { name: '김지우', email: 'jiwoo@meetflow.ai', avatar_color: '#FF902F', role: 'member', team: '프로덕트 팀' },
    u2: { name: '박서연', email: 'seoyeon@meetflow.ai', avatar_color: '#34D399', role: 'member', team: '프로덕트 팀' },
    u3: { name: '이도윤', email: 'doyun@meetflow.ai', avatar_color: '#38BDF8', role: 'member', team: '프로덕트 팀' },
    u4: { name: '최하린', email: 'harin@meetflow.ai', avatar_color: '#F472B6', role: 'member', team: '디자인 팀' },
    u5: { name: '정민수', email: 'minsu@meetflow.ai', avatar_color: '#A78BFA', role: 'member', team: '디자인 팀' },
    u6: { name: '한소율', email: 'soyul@meetflow.ai', avatar_color: '#FBBF24', role: 'member', team: '엔지니어링 팀' },
    u7: { name: '오재현', email: 'jaehyun@meetflow.ai', avatar_color: '#F87171', role: 'member', team: '엔지니어링 팀' },
    u8: { name: '윤서아', email: 'seoa@meetflow.ai', avatar_color: '#2DD4BF', role: 'member', team: '엔지니어링 팀' },
  };

  useEffect(() => {
    if (!id) return;

    async function fetchAll() {
      setLoading(true);
      try {
        if (!SUPABASE_ENABLED) {
          // 데모 모드
          const mock = MOCK_EMPLOYEES[id];
          if (mock) {
            setProfile({ id, ...mock, created_at: '2025-01-15T00:00:00Z' });
            setMeetings([
              { id: 'm1', title: '주간 프로덕트 스탠드업', status: 'completed', created_at: '2026-04-07T09:00:00Z' },
              { id: 'm2', title: '디자인 시스템 리뷰', status: 'completed', created_at: '2026-04-09T14:00:00Z' },
              { id: 'm3', title: 'Q2 로드맵 킥오프', status: 'completed', created_at: '2026-04-10T10:00:00Z' },
            ]);
            setTasks([
              {
                id: 't1', title: '온보딩 A/B 와이어프레임 작성', status: 'in_progress', priority: 'high',
                due_date: '2026-04-14', created_at: '2026-04-08T00:00:00Z',
                description: '3단계(팀 초대) 플로우에서 이탈률이 34%로 높은 상황.\n개선안 A: 초대 스킵 허용\n개선안 B: 초대 단계를 2-step으로 분리',
                assignee_name: mock.name, meeting_title: '주간 프로덕트 스탠드업',
                service_name: '킨더보드', page_name: '온보딩 플로우', feature_name: '팀 초대 (3단계)',
                tags: ['UX', 'A/B테스트', '이탈률개선'],
                subtasks: [
                  { title: '현재 이탈 데이터 분석', done: true },
                  { title: '와이어프레임 A안 작성', done: false },
                  { title: '와이어프레임 B안 작성', done: false },
                ],
              },
              {
                id: 't2', title: '성공 지표 대시보드 구성', status: 'todo', priority: 'medium',
                due_date: '2026-04-18', created_at: '2026-04-09T00:00:00Z',
                description: '온보딩 완료율, 7일 리텐션, DAU/MAU 비율 대시보드 설계.',
                assignee_name: mock.name, meeting_title: '주간 프로덕트 스탠드업',
                service_name: '킨더보드', page_name: '관리자 대시보드', feature_name: 'KPI 지표 패널',
                tags: ['데이터', 'KPI'],
              },
              {
                id: 't3', title: '사용자 인터뷰 정리', status: 'done', priority: 'medium',
                due_date: '2026-04-06', created_at: '2026-04-01T00:00:00Z',
                description: '원장/교사 10명 인터뷰 녹취록 정리 및 인사이트 추출.',
                assignee_name: mock.name, meeting_title: 'Q2 로드맵 킥오프',
                service_name: '킨더보드', page_name: '-', feature_name: '사용자 리서치',
                tags: ['리서치', '인터뷰'],
              },
            ]);
            setMessages(Array.from({ length: 25 }, (_, i) => ({
              id: `msg-${i}`, meeting_id: `m${(i % 3) + 1}`, content: '발언 내용', created_at: new Date().toISOString(),
            })));
          }
          setLoading(false);
          return;
        }

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

  // ── 통계 계산 (기간 필터 적용) ──
  const stats = useMemo(() => {
    const meetings = filteredMeetings;
    const messages = filteredMessages;
    const tasks = filteredTasks;
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
  }, [filteredMeetings, filteredTasks, filteredMessages, evaluation]);

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
    <div className="flex gap-3 p-2 md:p-3 lg:p-4 mr-1 mb-1 md:mr-2 md:mb-2 lg:mr-3 lg:mb-3 min-h-full lg:h-full">
      {/* 메인 콘텐츠 */}
      <div className="flex-1 min-w-0 bg-[var(--bg-content)] rounded-[12px] p-3 md:p-4 lg:p-4 lg:overflow-y-auto scrollbar-hide space-y-3">

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
                계정 생성일: {profile.created_at ? format(parseISO(profile.created_at), 'yyyy.MM.dd') : '-'}
              </p>
            </div>

            {/* 기간 필터 드롭다운 */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setDateMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 bg-bg-tertiary rounded-md px-3 py-1.5 border border-border-subtle hover:border-brand-purple/40 transition-colors"
              >
                <Calendar size={13} className="text-txt-muted" />
                <span className="text-xs font-medium text-txt-primary">
                  {{ day: '일', week: '주', month: '월', year: '년', all: '전체', custom: '기간' }[dateRange] || '전체'}
                </span>
                <span className="text-[10px] text-txt-muted">▾</span>
              </button>
              {dateMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDateMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-bg-secondary border border-border-default rounded-md shadow-lg overflow-hidden min-w-[140px]">
                    {[
                      { id: 'day', label: '일 (오늘)' },
                      { id: 'week', label: '주 (이번 주)' },
                      { id: 'month', label: '월 (이번 달)' },
                      { id: 'year', label: '년 (올해)' },
                      { id: 'all', label: '전체' },
                      { id: 'custom', label: '기간 (직접 선택)' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDateRange(opt.id);
                          if (opt.id !== 'custom') setDateMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          dateRange === opt.id
                            ? 'bg-brand-purple/15 text-brand-purple font-semibold'
                            : 'text-txt-secondary hover:bg-bg-tertiary hover:text-txt-primary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {dateRange === 'custom' && (
                      <div className="px-3 py-2 border-t border-border-divider flex flex-col gap-1.5 bg-bg-tertiary/30">
                        <input
                          type="date"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-[11px] text-txt-primary focus:outline-none focus:border-brand-purple/50"
                        />
                        <input
                          type="date"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="bg-bg-tertiary border border-border-subtle rounded px-2 py-1 text-[11px] text-txt-primary focus:outline-none focus:border-brand-purple/50"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
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
          title="종합 평가 (개인 균형 평가)"
          subtitle="참여도·완수율·리더십·적극성·발언 태도 5지표 가중 평균 · 관리자 대시보드의 기여도와 다른 관점"
          action={
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-purple rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Sparkles size={15} />
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
                        <FileText size={16} className="text-brand-purple" />
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

      </div>
      {/* 메인 콘텐츠 끝 */}

      {/* ═══ 오른쪽 사이드바: 배정 태스크 (MemberTaskCard 재사용) ═══ */}
      <aside className="hidden lg:block w-[340px] shrink-0 bg-[var(--bg-content)] rounded-[12px] p-3 self-start sticky top-3 lg:overflow-y-auto lg:max-h-[calc(100vh-120px)] scrollbar-hide relative">
        {/* 태스크 상세 슬라이드 패널 */}
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            members={members}
            currentUser={currentUser}
            onClose={() => setSelectedTask(null)}
            onStatusChange={handleStatusChange}
            onUpdate={handleUpdateTask}
          />
        )}

        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-txt-primary">
              {profile?.name}의 태스크
            </h2>
            <p className="text-[10px] text-txt-muted mt-0.5">
              총 {stats.totalTasks}건 · 완료 {stats.doneTasks}건
              {stats.overdueTasks > 0 && (
                <> · <span className="text-status-error">지연 {stats.overdueTasks}건</span></>
              )}
            </p>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <p className="text-sm text-txt-muted text-center py-8">
            {dateRange === 'all' ? '배정된 태스크가 없습니다' : '선택한 기간에 태스크가 없습니다'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredTasks.map((task) => (
              <MemberTaskCard
                key={task.id}
                task={task}
                members={members}
                onClick={(t) => setSelectedTask(selectedTask?.id === t.id ? null : t)}
                onQuickStatus={handleStatusChange}
                onQuickUpdate={handleUpdateTask}
              />
            ))}
          </div>
        )}
      </aside>

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
