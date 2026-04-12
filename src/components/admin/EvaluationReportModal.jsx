import {
  User, Target, Award, TrendingUp, MessageCircle,
  ThumbsUp, ThumbsDown, Minus, Star, AlertTriangle,
} from 'lucide-react';
import { Modal, Badge } from '@/components/ui';

// ── 등급 스타일 ──
function gradeStyle(grade) {
  const map = {
    S: { color: 'text-brand-purple', bg: 'bg-brand-purple/15' },
    'A+': { color: 'text-status-success', bg: 'bg-status-success/15' },
    A: { color: 'text-status-success', bg: 'bg-status-success/15' },
    'B+': { color: 'text-brand-orange', bg: 'bg-brand-orange/15' },
    B: { color: 'text-brand-orange', bg: 'bg-brand-orange/15' },
    C: { color: 'text-status-warning', bg: 'bg-status-warning/15' },
    D: { color: 'text-status-error', bg: 'bg-status-error/15' },
    F: { color: 'text-status-error', bg: 'bg-status-error/15' },
  };
  return map[grade] || map.F;
}

// ── 미니 프로그레스 바 ──
function MiniBar({ label, value, icon: Icon }) {
  const pct = Math.min(value, 100);
  const color = pct >= 70 ? 'from-brand-purple to-brand-orange' :
    pct >= 40 ? 'from-brand-orange to-brand-yellow' : 'from-status-error to-brand-orange';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-txt-secondary">
          {Icon && <Icon size={11} />}{label}
        </span>
        <span className="text-[11px] font-semibold text-txt-primary">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── 감정 아이콘 ──
function SentimentIcon({ sentiment }) {
  if (sentiment === 'positive') return <ThumbsUp size={12} className="text-status-success" />;
  if (sentiment === 'negative') return <ThumbsDown size={12} className="text-status-error" />;
  return <Minus size={12} className="text-txt-muted" />;
}

// ── 카테고리 라벨 ──
const CATEGORY_LABEL = {
  constructive: '건설적',
  leadership: '리더십',
  collaboration: '협업',
  insight: '인사이트',
  concern: '우려',
};

export default function EvaluationReportModal({ open, onClose, evaluation, employeeName }) {
  if (!evaluation) return null;

  const { scores = {}, speech_detail = {}, grade, overall_score, ai_report,
    evidence = [], strengths = [], improvements = [], month,
    meeting_count, message_count, task_count } = evaluation;

  const gs = gradeStyle(grade);

  return (
    <Modal open={open} onClose={onClose} title="AI 세부 평가 리포트" size="xl">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-txt-primary">{employeeName}</h4>
            <p className="text-xs text-txt-muted mt-0.5">{month} 평가 · 회의 {meeting_count}건 · 발언 {message_count}건 · 태스크 {task_count}건</p>
          </div>
          <div className={`w-14 h-14 rounded-xl ${gs.bg} flex items-center justify-center`}>
            <span className={`text-2xl font-bold ${gs.color}`}>{grade}</span>
          </div>
        </div>

        {/* ── 종합 점수 ── */}
        <div className="bg-bg-tertiary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h5 className="text-xs font-semibold text-txt-primary uppercase tracking-wider">종합 점수</h5>
            <span className="text-sm font-bold text-txt-primary">{Math.round(overall_score)}점</span>
          </div>
          <MiniBar label="참여도" value={scores.participation || 0} icon={User} />
          <MiniBar label="태스크 완수율" value={scores.task_completion || 0} icon={Target} />
          <MiniBar label="리더십" value={scores.leadership || 0} icon={Award} />
          <MiniBar label="적극성" value={scores.proactivity || 0} icon={TrendingUp} />
          <MiniBar label="발언 태도" value={scores.speech_attitude || 0} icon={MessageCircle} />
        </div>

        {/* ── 발언 태도 세부 ── */}
        {(speech_detail.constructiveness != null) && (
          <div className="bg-bg-tertiary rounded-lg p-4">
            <h5 className="text-xs font-semibold text-txt-primary uppercase tracking-wider mb-3">발언 태도 세부</h5>
            <div className="grid grid-cols-2 gap-3">
              <MiniBar label="건설성" value={speech_detail.constructiveness || 0} />
              <MiniBar label="전문성" value={speech_detail.professionalism || 0} />
              <MiniBar label="기여 품질" value={speech_detail.contribution_quality || 0} />
              <MiniBar label="협업" value={speech_detail.collaboration || 0} />
            </div>
          </div>
        )}

        {/* ── AI 서술형 리포트 ── */}
        {ai_report && (
          <div className="bg-bg-tertiary rounded-lg p-4">
            <h5 className="text-xs font-semibold text-txt-primary uppercase tracking-wider mb-3">AI 분석 리포트</h5>
            <div className="text-sm text-txt-secondary leading-relaxed whitespace-pre-wrap">
              {ai_report}
            </div>
          </div>
        )}

        {/* ── 증거 발언 ── */}
        {evidence.length > 0 && (
          <div className="bg-bg-tertiary rounded-lg p-4">
            <h5 className="text-xs font-semibold text-txt-primary uppercase tracking-wider mb-3">주요 발언 증거</h5>
            <div className="space-y-2.5">
              {evidence.map((ev, i) => {
                const borderColor = ev.sentiment === 'positive' ? 'border-l-status-success' :
                  ev.sentiment === 'negative' ? 'border-l-status-error' : 'border-l-txt-muted';
                return (
                  <div key={i} className={`bg-bg-primary rounded-md p-3 border-l-[3px] ${borderColor}`}>
                    <div className="flex items-start gap-2">
                      <SentimentIcon sentiment={ev.sentiment} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-txt-primary leading-snug">"{ev.content}"</p>
                        <div className="flex items-center gap-2 mt-1.5">
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
          </div>
        )}

        {/* ── 강점 / 개선점 ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {strengths.length > 0 && (
            <div className="bg-bg-tertiary rounded-lg p-4">
              <h5 className="text-xs font-semibold text-status-success uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Star size={12} /> 강점
              </h5>
              <ul className="space-y-1.5">
                {strengths.map((s, i) => (
                  <li key={i} className="text-sm text-txt-secondary flex items-start gap-2">
                    <span className="text-status-success mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {improvements.length > 0 && (
            <div className="bg-bg-tertiary rounded-lg p-4">
              <h5 className="text-xs font-semibold text-brand-orange uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> 개선 영역
              </h5>
              <ul className="space-y-1.5">
                {improvements.map((s, i) => (
                  <li key={i} className="text-sm text-txt-secondary flex items-start gap-2">
                    <span className="text-brand-orange mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
