// 회의 품질 점수 뱃지 — 등급(S/A+/A/B+/...) + hover breakdown
// - 카드 리스트(compact)와 상세 헤더(detailed) 모두에서 재사용

import { useState } from 'react';

export default function MeetingScoreBadge({ score: scoreData, compact = false }) {
  const [open, setOpen] = useState(false);
  if (!scoreData) return null;
  const { score, grade, breakdown = [], strengths = [], weaknesses = [] } = scoreData;

  const sizeCls = compact
    ? 'px-2 py-1 gap-1'
    : 'px-3 py-1.5 gap-1.5';
  const labelCls = compact ? 'text-[9px]' : 'text-[10px]';
  const gradeCls = compact ? 'text-sm' : 'text-lg';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={`inline-flex items-center rounded-lg border transition-colors ${sizeCls} ${grade.bg} ${grade.color} border-current/20 hover:border-current/40`}
        title="회의 품질 점수 — 6개 축 가중 평균"
      >
        <span className={`font-semibold uppercase tracking-wider opacity-70 ${labelCls}`}>평가</span>
        <span className={`font-bold leading-none ${gradeCls}`}>{grade.label}</span>
      </button>

      {/* Hover 상세 */}
      {open && breakdown.length > 0 && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={`absolute ${compact ? 'right-0' : 'right-0'} top-full mt-2 w-72 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-20 p-3`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-border-divider">
            <div>
              <span className={`text-2xl font-bold ${grade.color}`}>{grade.label}</span>
              <span className="text-xs text-txt-muted ml-2">{score}/100</span>
            </div>
            <span className="text-[10px] text-txt-muted">6개 축 가중 평균</span>
          </div>

          <div className="space-y-1.5">
            {breakdown.map((b) => {
              const barColor =
                b.score >= 80 ? 'bg-status-success'
                : b.score >= 60 ? 'bg-brand-orange'
                : b.score >= 40 ? 'bg-status-warning'
                : 'bg-status-error';
              return (
                <div key={b.key} className="text-[11px]">
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span className="text-txt-primary font-medium">{b.label}</span>
                    <span className="text-txt-muted">
                      {b.score}점 <span className="text-[9px] opacity-60">× {b.weight}%</span>
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${b.score}%` }} />
                  </div>
                  {b.hint && <p className="text-[10px] text-txt-muted mt-0.5">{b.hint}</p>}
                </div>
              );
            })}
          </div>

          {(strengths.length > 0 || weaknesses.length > 0) && (
            <div className="mt-2 pt-2 border-t border-border-divider space-y-1 text-[10px]">
              {strengths.length > 0 && (
                <p className="text-status-success">
                  ✓ 강점: {strengths.map((s) => s.label).join(', ')}
                </p>
              )}
              {weaknesses.length > 0 && (
                <p className="text-status-warning">
                  ⚠ 개선: {weaknesses.map((s) => s.label).join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
