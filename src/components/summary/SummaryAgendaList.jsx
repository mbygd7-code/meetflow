// 회의록 어젠다 리스트 — 읽기 전용 + 진행 통계
// 목표 시간 vs 실제 진행 시간, 관련 메시지 %, 미진행 표시
import { Check, Clock, CircleDot, CircleSlash, MessageSquare } from 'lucide-react';

/**
 * @param {{
 *   agendas: Array<{
 *     id: string,
 *     title: string,
 *     status?: 'pending' | 'active' | 'completed',
 *     duration_minutes?: number,
 *     sort_order?: number,
 *     messageCount?: number,       // 이 어젠다에 속한 메시지 수
 *     focusPct?: number,           // 전체 메시지 대비 비중 (%)
 *     actualDurationMin?: number,  // 실제 진행 시간 (분)
 *     wasExecuted?: boolean,       // 진행 여부
 *   }>
 * }} props
 */
export default function SummaryAgendaList({ agendas = [] }) {
  if (!agendas.length) return null;

  const sorted = [...agendas].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-[10px] p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-txt-primary">어젠다</h3>
        <span className="text-xs text-txt-muted">{sorted.length}개</span>
      </div>

      <ol className="space-y-1.5">
        {sorted.map((a, i) => {
          const isDone = a.status === 'completed';
          const isActive = a.status === 'active';
          const wasExecuted = a.wasExecuted ?? (isDone || (a.messageCount || 0) > 0);
          const notExecuted = !wasExecuted && !isActive;

          // 시간 비교: 목표 vs 실제
          const planned = a.duration_minutes;
          const actual = a.actualDurationMin;
          const hasActual = actual != null && actual > 0;
          const overrun = hasActual && planned && actual > planned;
          const underrun = hasActual && planned && actual < planned;

          return (
            <li
              key={a.id || i}
              className={`
                flex flex-col gap-1.5 px-3 py-2.5 rounded-[8px] border
                ${notExecuted
                  ? 'bg-bg-tertiary/20 border-border-divider opacity-70'
                  : isDone
                    ? 'bg-status-success/[0.04] border-status-success/15'
                    : isActive
                      ? 'bg-brand-purple/[0.06] border-brand-purple/25'
                      : 'bg-bg-tertiary/40 border-border-subtle'
                }
              `}
            >
              {/* 상단 행: 아이콘 + 제목 + 시간 비교 */}
              <div className="flex items-start gap-3">
                {/* 상태 아이콘 */}
                <span className="mt-0.5 shrink-0">
                  {notExecuted ? (
                    <span className="w-5 h-5 rounded-full bg-txt-muted/15 flex items-center justify-center">
                      <CircleSlash size={13} className="text-txt-muted" strokeWidth={2.2} />
                    </span>
                  ) : isDone ? (
                    <span className="w-5 h-5 rounded-full bg-status-success/20 flex items-center justify-center">
                      <Check size={13} className="text-status-success" strokeWidth={3} />
                    </span>
                  ) : isActive ? (
                    <span className="w-5 h-5 rounded-full bg-brand-purple flex items-center justify-center">
                      <CircleDot size={13} className="text-white" strokeWidth={2.4} />
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full border border-border-default text-[10px] font-semibold text-txt-muted flex items-center justify-center">
                      {i + 1}
                    </span>
                  )}
                </span>

                {/* 제목 */}
                <p
                  className={`flex-1 text-sm leading-snug ${
                    notExecuted
                      ? 'text-txt-muted'
                      : isDone
                        ? 'text-txt-secondary line-through decoration-txt-muted'
                        : 'text-txt-primary font-medium'
                  }`}
                >
                  {a.title}
                  {notExecuted && (
                    <span className="ml-2 text-[10px] font-semibold text-txt-muted bg-bg-tertiary border border-border-subtle px-1.5 py-0.5 rounded">
                      진행 안됨
                    </span>
                  )}
                </p>

                {/* 시간 비교 */}
                <div className="shrink-0 flex items-center gap-1.5 text-[11px]">
                  {planned != null && (
                    <span className="inline-flex items-center gap-1 text-txt-muted">
                      <Clock size={12} strokeWidth={2} />
                      목표 {planned}분
                    </span>
                  )}
                  {hasActual && (
                    <>
                      <span className="text-border-default">→</span>
                      <span
                        className={`font-semibold ${
                          overrun
                            ? 'text-status-error'
                            : underrun
                              ? 'text-status-success'
                              : 'text-txt-primary'
                        }`}
                      >
                        실제 {actual}분
                        {overrun && ` (+${actual - planned})`}
                        {underrun && ` (-${planned - actual})`}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 하단 행: 메시지 집중도 바 (진행된 경우만) */}
              {!notExecuted && (a.messageCount || 0) > 0 && (
                <div className="flex items-center gap-2 ml-8">
                  <div className="flex-1 h-1 rounded-full bg-bg-tertiary overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        (a.focusPct || 0) >= 50
                          ? 'bg-brand-purple'
                          : (a.focusPct || 0) >= 20
                            ? 'bg-brand-orange'
                            : 'bg-txt-muted'
                      }`}
                      style={{ width: `${Math.min(a.focusPct || 0, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-txt-muted inline-flex items-center gap-1 shrink-0">
                    <MessageSquare size={11} strokeWidth={2} />
                    {a.messageCount}건
                    <span className="text-txt-secondary font-semibold ml-0.5">
                      {a.focusPct || 0}%
                    </span>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
