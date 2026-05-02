// PDF 저장 전용 A4 단일 페이지 템플릿 — 화면 렌더와 분리된 타이트한 레이아웃
// 목표: A4 210×297mm 한 장에 제목·메타·평가·어젠다·핵심 섹션·후속 태스크까지
// 논리적으로 들어가도록 고정 크기·인쇄 친화 색상·절제된 여백

import { forwardRef } from 'react';
import { safeFormatDate } from '@/utils/formatters';
import { groupPresentations, presentationDurationMinutes } from '@/utils/presentations';

function fmtDuration(min) {
  if (!min || min <= 0) return '-';
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

const A4_W = 794;   // 96dpi 기준 약 210mm
const A4_H = 1123;  // 297mm
const PAD  = 36;    // ~9.5mm 외부 여백 (html2pdf 마진과 별개로 내부 여유)

const SectionTitle = ({ children, count }) => (
  <div style={{
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
    color: '#3f3f46', textTransform: 'uppercase',
    borderBottom: '1px solid #d4d4d8', paddingBottom: 3,
    marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
  }}>
    <span>{children}</span>
    {typeof count === 'number' && (
      <span style={{ fontSize: 9, color: '#71717a', fontWeight: 500 }}>{count}건</span>
    )}
  </div>
);

const Chip = ({ label, value }) => (
  <div style={{ display: 'inline-flex', gap: 4, fontSize: 10 }}>
    <span style={{ color: '#71717a' }}>{label}</span>
    <span style={{ color: '#18181b', fontWeight: 600 }}>{value}</span>
  </div>
);

const MeetingSummaryPrintable = forwardRef(function MeetingSummaryPrintable(
  // meetingScore prop은 더 이상 PDF에 포함하지 않음 (평가 뱃지 제거 요청)
  { meeting, summary, stats, messages = [] },
  ref
) {
  if (!meeting) return null;
  const decisions = summary?.decisions || [];
  const discussions = summary?.discussions || [];
  const deferred = summary?.deferred || [];
  const actions = summary?.action_items || [];
  const agendas = meeting.agendas || [];
  const insight = summary?.milo_insights || '';
  // 화면 공유 발표 세션 — messages metadata 기반. 없으면 빈 배열 → 섹션 자체 미렌더
  const presentations = groupPresentations(messages);
  const MAX_PRESENTATIONS = 4;

  // ── 각 섹션 최대 항목 수 제한 (A4 overflow 방지) ──
  const MAX_ACTIONS = 8;
  const MAX_DECISIONS = 6;
  const MAX_DISCUSSIONS = 5;
  const MAX_DEFERRED = 4;
  const MAX_AGENDAS = 8;
  const INSIGHT_MAX_CHARS = 260;

  const truncatedInsight = insight.length > INSIGHT_MAX_CHARS
    ? insight.slice(0, INSIGHT_MAX_CHARS) + '…'
    : insight;

  return (
    // 외부 래퍼: 0×0으로 클립하되 부모 위치는 정상 (fixed top/left 0)
    // 안쪽 요소는 794×1123로 풀 페인트 → 브라우저는 렌더하지만 사용자엔 안 보임
    // html2canvas는 painted pixel을 읽으므로 정상 캡처
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
    <div
      ref={ref}
      data-pdf-printable
      style={{
        width: A4_W,
        minHeight: A4_H,
        padding: PAD,
        boxSizing: 'border-box',
        background: '#ffffff',
        color: '#18181b',
        fontFamily: '"Pretendard", "Inter", -apple-system, sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      {/* ═══ 1. 헤더 (평가 뱃지 제거) ═══ */}
      <header style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#a855f7', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>
          MEETING MINUTES
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#18181b', margin: 0, lineHeight: 1.2 }}>
          {meeting.title || '회의록'}
        </h1>

        {/* 메타 정보 한 줄 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10,
          paddingTop: 8, borderTop: '1px solid #e4e4e7',
          fontSize: 10,
        }}>
          {meeting.creator?.name && <Chip label="요청" value={meeting.creator.name} />}
          {meeting.started_at && <Chip label="시작" value={safeFormatDate(meeting.started_at, 'MM/dd HH:mm', '-')} />}
          {meeting.ended_at && <Chip label="종료" value={safeFormatDate(meeting.ended_at, 'MM/dd HH:mm', '-')} />}
          {stats?.durationMin > 0 && <Chip label="소요" value={fmtDuration(stats.durationMin)} />}
          {agendas.length > 0 && <Chip label="어젠다" value={`${agendas.length}개`} />}
          {stats && <Chip label="참여" value={`${stats.participants?.length || 0}명`} />}
          {stats && <Chip label="메시지" value={`${stats.total}건`} />}
        </div>
      </header>

      {/* ═══ 2. Milo 인사이트 ═══ */}
      {truncatedInsight && (
        <section style={{
          marginBottom: 12,
          padding: '10px 12px',
          background: '#faf5ff',
          borderLeft: '3px solid #a855f7',
          borderRadius: 4,
          fontSize: 10.5,
          lineHeight: 1.55,
          color: '#27272a',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#a855f7', marginBottom: 4, letterSpacing: 0.5 }}>
            MILO 인사이트
          </div>
          {truncatedInsight}
        </section>
      )}

      {/* ═══ 2.5. 화면 공유 발표 세션 (있을 때만) ═══ */}
      {presentations.length > 0 && (
        <section style={{ marginBottom: 12 }}>
          <SectionTitle count={presentations.length}>화면 공유 발표</SectionTitle>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {presentations.slice(0, MAX_PRESENTATIONS).map((p, i) => {
              const start = safeFormatDate(p.start_at, 'HH:mm', '-');
              const end = safeFormatDate(p.end_at, 'HH:mm', '-');
              const durMin = presentationDurationMinutes(p.start_at, p.end_at);
              return (
                <li
                  key={`${p.presenter}-${i}`}
                  style={{
                    display: 'flex',
                    gap: 6,
                    fontSize: 10.5,
                    padding: '2px 0',
                    color: '#18181b',
                  }}
                >
                  <span style={{ color: '#a855f7', fontWeight: 700, flexShrink: 0 }}>▸</span>
                  <span style={{ fontWeight: 600, color: '#18181b', flexShrink: 0 }}>
                    {p.presenter_name}
                  </span>
                  <span style={{ color: '#52525b' }}>
                    {start} ~ {end}
                    {durMin > 0 && ` · ${durMin}분`}
                    {' · '}
                    {p.messages.length}건
                  </span>
                </li>
              );
            })}
            {presentations.length > MAX_PRESENTATIONS && (
              <li style={{ fontSize: 9, color: '#71717a', fontStyle: 'italic', paddingLeft: 12 }}>
                외 {presentations.length - MAX_PRESENTATIONS}건 더
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ═══ 3. 어젠다 ═══ */}
      {agendas.length > 0 && (
        <section style={{ marginBottom: 12 }}>
          <SectionTitle count={agendas.length}>어젠다</SectionTitle>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {agendas.slice(0, MAX_AGENDAS).map((a, i) => (
              <li key={a.id || i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10.5,
                padding: '2px 0', color: a.status === 'completed' ? '#71717a' : '#18181b',
              }}>
                <span style={{
                  display: 'inline-block', width: 14, textAlign: 'center',
                  color: a.status === 'completed' ? '#10b981' : '#71717a',
                  fontWeight: 700, flexShrink: 0,
                }}>
                  {a.status === 'completed' ? '✓' : i + 1}
                </span>
                <span style={{
                  flex: 1,
                  textDecoration: a.status === 'completed' ? 'line-through' : 'none',
                }}>
                  {a.title || '제목 없음'}
                </span>
                {a.duration_minutes != null && (
                  <span style={{ fontSize: 9, color: '#71717a', flexShrink: 0 }}>
                    {a.duration_minutes}분
                  </span>
                )}
              </li>
            ))}
            {agendas.length > MAX_AGENDAS && (
              <li style={{ fontSize: 9, color: '#71717a', fontStyle: 'italic', paddingLeft: 20 }}>
                외 {agendas.length - MAX_AGENDAS}개 더
              </li>
            )}
          </ol>
        </section>
      )}

      {/* ═══ 4. 결정 사항 + 논의 중 (2단 그리드) ═══ */}
      <section style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12,
      }}>
        {/* 결정 사항 */}
        <div>
          <SectionTitle count={decisions.length}>결정 사항</SectionTitle>
          {decisions.length === 0 ? (
            <div style={{ fontSize: 10, color: '#71717a', fontStyle: 'italic' }}>
              확정된 결정 없음
            </div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 14, fontSize: 10.5 }}>
              {decisions.slice(0, MAX_DECISIONS).map((d, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: '#059669' }}>{d.title}</span>
                  {d.detail && <span style={{ color: '#52525b' }}> — {d.detail}</span>}
                  {d.owner && <span style={{ color: '#a855f7', fontWeight: 500 }}> ({d.owner})</span>}
                </li>
              ))}
              {decisions.length > MAX_DECISIONS && (
                <li style={{ fontSize: 9, color: '#71717a', fontStyle: 'italic', listStyle: 'none' }}>
                  외 {decisions.length - MAX_DECISIONS}건 더
                </li>
              )}
            </ol>
          )}
        </div>

        {/* 논의 중 */}
        <div>
          <SectionTitle count={discussions.length}>논의 중</SectionTitle>
          {discussions.length === 0 ? (
            <div style={{ fontSize: 10, color: '#71717a', fontStyle: 'italic' }}>
              논의 중인 주제 없음
            </div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 14, fontSize: 10.5 }}>
              {discussions.slice(0, MAX_DISCUSSIONS).map((d, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: '#ca8a04' }}>{d.title}</span>
                  {d.detail && <span style={{ color: '#52525b' }}> — {d.detail}</span>}
                </li>
              ))}
              {discussions.length > MAX_DISCUSSIONS && (
                <li style={{ fontSize: 9, color: '#71717a', fontStyle: 'italic', listStyle: 'none' }}>
                  외 {discussions.length - MAX_DISCUSSIONS}건 더
                </li>
              )}
            </ol>
          )}
        </div>
      </section>

      {/* ═══ 5. 후속 태스크 ═══ */}
      {actions.length > 0 && (
        <section style={{ marginBottom: 12 }}>
          <SectionTitle count={actions.length}>후속 태스크</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: '#f4f4f5', color: '#3f3f46' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 20, fontWeight: 600 }}>#</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>업무</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 72, fontWeight: 600 }}>담당</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 64, fontWeight: 600 }}>기한</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', width: 58, fontWeight: 600 }}>우선순위</th>
              </tr>
            </thead>
            <tbody>
              {actions.slice(0, MAX_ACTIONS).map((a, i) => {
                const priMap = {
                  urgent: { label: '긴급', color: '#dc2626' },
                  high:   { label: '높음', color: '#ea580c' },
                  medium: { label: '보통', color: '#a855f7' },
                  low:    { label: '낮음', color: '#71717a' },
                };
                const pri = priMap[a.priority] || priMap.medium;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <td style={{ padding: '4px 6px', color: '#71717a', verticalAlign: 'top' }}>{i + 1}</td>
                    <td style={{ padding: '4px 6px', color: '#18181b', verticalAlign: 'top', wordBreak: 'break-word' }}>{a.title}</td>
                    <td style={{ padding: '4px 6px', color: '#52525b', verticalAlign: 'top' }}>{a.assignee_hint || '-'}</td>
                    <td style={{ padding: '4px 6px', color: '#52525b', verticalAlign: 'top' }}>{a.due_hint || '-'}</td>
                    <td style={{ padding: '4px 6px', verticalAlign: 'top', color: pri.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {pri.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {actions.length > MAX_ACTIONS && (
            <div style={{ fontSize: 9, color: '#71717a', fontStyle: 'italic', marginTop: 4 }}>
              외 {actions.length - MAX_ACTIONS}건 더
            </div>
          )}
        </section>
      )}

      {/* ═══ 6. 보류 ═══ */}
      {deferred.length > 0 && (
        <section style={{ marginBottom: 10 }}>
          <SectionTitle count={deferred.length}>보류</SectionTitle>
          <ol style={{ margin: 0, paddingLeft: 14, fontSize: 10 }}>
            {deferred.slice(0, MAX_DEFERRED).map((d, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: '#52525b' }}>{d.title}</span>
                {d.reason && <span style={{ color: '#71717a' }}> — {d.reason}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ═══ 7. 푸터 ═══ */}
      <footer style={{
        marginTop: 'auto',
        paddingTop: 8,
        borderTop: '1px solid #e4e4e7',
        fontSize: 8.5,
        color: '#a1a1aa',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>MeetFlow · AI 기반 회의록</span>
        <span>{safeFormatDate(new Date().toISOString(), 'yyyy.MM.dd HH:mm', '')} 생성</span>
      </footer>
    </div>
    </div>
  );
});

export default MeetingSummaryPrintable;
