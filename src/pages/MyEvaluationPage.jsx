// 내 평가 페이지 — 본인의 AI 평가 결과를 한눈에 정리해서 보여줌
// 관리자 권한 없이도 접근 가능 (RLS: users read own evaluations)
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Target, Award, TrendingUp, MessageCircle,
  ThumbsUp, ThumbsDown, Minus, Star, AlertTriangle, Sparkles,
  Calendar, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { gradeToStyle } from '@/utils/gradeUtils';
import { Badge } from '@/components/ui';
import EmptyState from '@/components/ui/EmptyState';

// ── 점수 진행 막대 ──
function ScoreBar({ label, value, icon: Icon }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  const color =
    pct >= 70 ? 'from-brand-purple to-brand-orange' :
    pct >= 40 ? 'from-brand-orange to-brand-yellow' :
                'from-status-error to-brand-orange';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-txt-secondary">
          {Icon && <Icon size={14} />}{label}
        </span>
        <span className="text-xs font-bold text-txt-primary">{Math.round(pct)}</span>
      </div>
      <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SentimentIcon({ sentiment }) {
  if (sentiment === 'positive') return <ThumbsUp size={14} className="text-status-success" />;
  if (sentiment === 'negative') return <ThumbsDown size={14} className="text-status-error" />;
  return <Minus size={14} className="text-txt-muted" />;
}

const CATEGORY_LABEL = {
  constructive: '건설적',
  leadership: '리더십',
  collaboration: '협업',
  insight: '인사이트',
  concern: '우려',
};

// month 'YYYY-MM' → '2026년 5월'
function formatMonth(month) {
  if (!month) return '';
  const [y, m] = month.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

export default function MyEvaluationPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [history, setHistory] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('employee_evaluations')
          .select('*')
          .eq('user_id', user.id)
          .order('month', { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        setHistory(data || []);
        if (data && data.length > 0) setSelectedMonth(data[0].month);
      } catch (err) {
        console.error('[MyEvaluationPage] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const evaluation = useMemo(
    () => history.find((h) => h.month === selectedMonth) || history[0] || null,
    [history, selectedMonth]
  );

  // 빈 상태
  if (!loading && history.length === 0) {
    return (
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-12 max-w-[1100px] mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-txt-secondary hover:text-txt-primary mb-4"
        >
          <ArrowLeft size={14} /> 뒤로
        </button>
        <EmptyState
          icon={Sparkles}
          title="아직 AI 평가가 없어요"
          description="회의에 참여하고 태스크를 처리하면 매월 자동으로 AI 평가가 생성돼요."
          actions={[{ label: '마이보드로', to: '/', variant: 'primary' }]}
        />
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-12 max-w-[1100px] mx-auto">
        <p className="text-sm text-txt-secondary">불러오는 중…</p>
      </div>
    );
  }

  const {
    scores = {}, speech_detail = {}, grade, overall_score, ai_report,
    evidence = [], strengths = [], improvements = [], month,
    meeting_count, message_count, task_count,
  } = evaluation;

  const gs = gradeToStyle(grade);

  return (
    <div className="px-4 md:px-6 lg:px-8 pt-4 pb-12 max-w-[1100px] mx-auto space-y-5">
      {/* 뒤로 */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-txt-secondary hover:text-txt-primary"
      >
        <ArrowLeft size={14} /> 뒤로
      </button>

      {/* 히어로 — 등급 + 종합 점수 + 메타 */}
      <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
          {/* 등급 큰 카드 */}
          <div className={`shrink-0 w-28 h-28 md:w-32 md:h-32 rounded-2xl ${gs.bg} flex flex-col items-center justify-center`}>
            <span className={`text-5xl md:text-6xl font-extrabold ${gs.color} leading-none`}>{grade}</span>
            <span className="text-[10px] text-txt-muted mt-1.5 uppercase tracking-wider">Grade</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} className="text-brand-purple" />
              <p className="text-xs text-txt-muted uppercase tracking-wider">{formatMonth(month)} 평가</p>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-txt-primary">
              {user?.name || '나'} 님의 평가
            </h1>
            <p className="text-sm text-txt-secondary mt-1">
              종합 점수 <span className="text-txt-primary font-bold text-base">{Math.round(overall_score || 0)}</span> 점
            </p>

            {/* 활동 메트릭 */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="outline">
                <Calendar size={11} className="mr-1" /> 회의 {meeting_count || 0}건
              </Badge>
              <Badge variant="outline">
                <MessageCircle size={11} className="mr-1" /> 발언 {message_count || 0}건
              </Badge>
              <Badge variant="outline">
                <Target size={11} className="mr-1" /> 태스크 {task_count || 0}건
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* 메인 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 종합 점수 (5축) */}
        <section className="lg:col-span-2 bg-bg-secondary border border-border-subtle rounded-2xl p-5">
          <h2 className="text-sm font-bold text-txt-primary mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-purple" />
            종합 점수
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
            <ScoreBar label="참여도" value={scores.participation} icon={User} />
            <ScoreBar label="태스크 완수율" value={scores.task_completion} icon={Target} />
            <ScoreBar label="리더십" value={scores.leadership} icon={Award} />
            <ScoreBar label="적극성" value={scores.proactivity} icon={TrendingUp} />
            <ScoreBar label="발언 태도" value={scores.speech_attitude} icon={MessageCircle} />
          </div>

          {/* 발언 태도 세부 */}
          {speech_detail.constructiveness != null && (
            <div className="mt-5 pt-4 border-t border-border-subtle">
              <p className="text-[11px] font-semibold text-txt-secondary uppercase tracking-wider mb-3">발언 태도 세부</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <ScoreBar label="건설성" value={speech_detail.constructiveness} />
                <ScoreBar label="전문성" value={speech_detail.professionalism} />
                <ScoreBar label="기여 품질" value={speech_detail.contribution_quality} />
                <ScoreBar label="협업" value={speech_detail.collaboration} />
              </div>
            </div>
          )}
        </section>

        {/* 월별 이력 */}
        <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5">
          <h2 className="text-sm font-bold text-txt-primary mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-brand-purple" />
            월별 이력
          </h2>
          {history.length === 1 ? (
            <p className="text-xs text-txt-muted">이번 달 평가 1건</p>
          ) : (
            <ul className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
              {history.map((h) => {
                const hgs = gradeToStyle(h.grade);
                const active = h.month === selectedMonth;
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(h.month)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-brand-purple/10 border border-brand-purple/30'
                          : 'hover:bg-bg-tertiary border border-transparent'
                      }`}
                    >
                      <span className={`w-9 h-9 shrink-0 rounded-md ${hgs.bg} flex items-center justify-center`}>
                        <span className={`text-sm font-bold ${hgs.color}`}>{h.grade}</span>
                      </span>
                      <span className="flex-1 text-left">
                        <span className="block text-xs font-semibold text-txt-primary">{formatMonth(h.month)}</span>
                        <span className="block text-[10px] text-txt-muted">{Math.round(h.overall_score || 0)}점</span>
                      </span>
                      {active && <ChevronRight size={14} className="text-brand-purple" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* 강점 / 개선점 */}
      {(strengths.length > 0 || improvements.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strengths.length > 0 && (
            <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5">
              <h2 className="text-sm font-bold text-status-success mb-3 flex items-center gap-2">
                <Star size={16} /> 강점
              </h2>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="text-sm text-txt-secondary leading-relaxed flex items-start gap-2">
                    <span className="text-status-success mt-1 shrink-0">●</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {improvements.length > 0 && (
            <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5">
              <h2 className="text-sm font-bold text-brand-orange mb-3 flex items-center gap-2">
                <AlertTriangle size={16} /> 개선 영역
              </h2>
              <ul className="space-y-2">
                {improvements.map((s, i) => (
                  <li key={i} className="text-sm text-txt-secondary leading-relaxed flex items-start gap-2">
                    <span className="text-brand-orange mt-1 shrink-0">●</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* AI 분석 리포트 */}
      {ai_report && (
        <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5">
          <h2 className="text-sm font-bold text-txt-primary mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-brand-purple" />
            AI 분석 리포트
          </h2>
          <div className="text-sm text-txt-secondary leading-relaxed whitespace-pre-wrap">
            {ai_report}
          </div>
        </section>
      )}

      {/* 주요 발언 증거 */}
      {evidence.length > 0 && (
        <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5">
          <h2 className="text-sm font-bold text-txt-primary mb-3 flex items-center gap-2">
            <MessageCircle size={16} className="text-brand-purple" />
            주요 발언 증거
          </h2>
          <div className="space-y-2.5">
            {evidence.map((ev, i) => {
              const borderColor =
                ev.sentiment === 'positive' ? 'border-l-status-success' :
                ev.sentiment === 'negative' ? 'border-l-status-error' :
                                              'border-l-txt-muted';
              return (
                <div key={i} className={`bg-bg-primary rounded-lg p-3 border-l-[3px] ${borderColor}`}>
                  <div className="flex items-start gap-2">
                    <SentimentIcon sentiment={ev.sentiment} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-txt-primary leading-snug">"{ev.content}"</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline">
                          {CATEGORY_LABEL[ev.category] || ev.category}
                        </Badge>
                        {ev.ai_comment && (
                          <p className="text-[10px] text-txt-muted italic">{ev.ai_comment}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 등급 안내 */}
      <section className="bg-bg-secondary border border-border-subtle rounded-2xl p-5">
        <h2 className="text-sm font-bold text-txt-primary mb-3">등급 안내</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { g: 'S',  range: '95+',    desc: '탁월' },
            { g: 'A+', range: '88-94',  desc: '매우 우수' },
            { g: 'A',  range: '80-87',  desc: '우수' },
            { g: 'B+', range: '70-79',  desc: '양호' },
            { g: 'B',  range: '60-69',  desc: '보통' },
            { g: 'C',  range: '45-59',  desc: '개선 필요' },
            { g: 'D',  range: '30-44',  desc: '미흡' },
            { g: 'F',  range: '<30',    desc: '주의' },
          ].map((row) => {
            const s = gradeToStyle(row.g);
            const active = row.g === grade;
            return (
              <div
                key={row.g}
                className={`rounded-lg p-2.5 text-center border ${
                  active ? 'border-brand-purple bg-brand-purple/5' : 'border-border-subtle'
                }`}
              >
                <div className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${s.bg} mb-1.5`}>
                  <span className={`text-base font-bold ${s.color}`}>{row.g}</span>
                </div>
                <p className="text-[10px] font-semibold text-txt-primary">{row.desc}</p>
                <p className="text-[10px] text-txt-muted">{row.range}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
