// AI 오케스트레이션 + 피드백 대시보드 패널 (Phase B)
// - v_ai_orchestration_daily, v_ai_feedback_daily 뷰 활용
// - ai_message_feedback 테이블 직접 조회 (최근 👎 리스트)
//
// 설계:
//   - 의존성 최소화 — 순수 CSS/SVG (recharts 미도입)
//   - 로딩은 스토어 아님, 컴포넌트 자체 상태 (대시보드 재진입 시 refetch)
//   - 실패 시 조용히 empty state

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { SectionPanel, Badge, Card } from '@/components/ui';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { ThumbsUp, ThumbsDown, MessageSquare, Sparkles, TrendingUp } from 'lucide-react';

const EMP_MAP = {};
for (const e of AI_EMPLOYEES) EMP_MAP[e.id] = e;

// ═══ 로직 유틸 ═══

// 오늘 기준 N일 전의 YYYY-MM-DD (Asia/Seoul 기반)
function daysAgoLocal(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function AiAnalyticsPanel() {
  const [loading, setLoading] = useState(true);
  const [orchStats, setOrchStats] = useState([]);      // v_ai_orchestration_daily rows
  const [feedbackStats, setFeedbackStats] = useState([]); // v_ai_feedback_daily rows
  const [recentNeg, setRecentNeg] = useState([]);       // 최근 👎 상세

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const sevenDaysAgo = daysAgoLocal(6); // 오늘 포함 7일

        const [orchRes, fbRes, negRes] = await Promise.all([
          supabase
            .from('v_ai_orchestration_daily')
            .select('day, orchestration_version, ai_employee, response_count')
            .gte('day', sevenDaysAgo)
            .order('day', { ascending: true }),
          supabase
            .from('v_ai_feedback_daily')
            .select('day, ai_employee, orchestration_version, thumbs_up, thumbs_down, satisfaction_pct')
            .gte('day', sevenDaysAgo)
            .order('day', { ascending: true }),
          supabase
            .from('ai_message_feedback')
            .select('id, rating, reason, comment, created_at, message_id, messages(content, ai_employee, meeting_id, orchestration_version)')
            .eq('rating', -1)
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        setOrchStats(orchRes.data || []);
        setFeedbackStats(fbRes.data || []);
        setRecentNeg(negRes.data || []);
      } catch (e) {
        console.error('[AiAnalyticsPanel]', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ═══ 파생 데이터 ═══

  // 1) 버전별 총 응답 수
  const versionTotals = useMemo(() => {
    const acc = {};
    for (const r of orchStats) {
      acc[r.orchestration_version] = (acc[r.orchestration_version] || 0) + (r.response_count || 0);
    }
    return acc;
  }, [orchStats]);

  const totalResponses = Object.values(versionTotals).reduce((a, b) => a + b, 0);

  // 2) 전문가별 만족도 (7일 누적)
  const employeeSatisfaction = useMemo(() => {
    const agg = {};
    for (const r of feedbackStats) {
      const empId = r.ai_employee || 'milo';
      const prev = agg[empId] || { up: 0, down: 0 };
      prev.up += r.thumbs_up || 0;
      prev.down += r.thumbs_down || 0;
      agg[empId] = prev;
    }
    return Object.entries(agg)
      .map(([empId, v]) => ({
        empId,
        emp: EMP_MAP[empId] || { nameKo: empId, color: '#888' },
        up: v.up,
        down: v.down,
        total: v.up + v.down,
        satisfaction: v.up + v.down === 0 ? null : Math.round((v.up / (v.up + v.down)) * 100),
      }))
      .sort((a, b) => b.total - a.total);
  }, [feedbackStats]);

  const totalFeedback = employeeSatisfaction.reduce((s, e) => s + e.total, 0);
  const totalUp = employeeSatisfaction.reduce((s, e) => s + e.up, 0);
  const overallSat = totalFeedback > 0 ? Math.round((totalUp / totalFeedback) * 100) : null;

  // 3) 일별 응답 수 (스택 바 차트용)
  const dailyResponses = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(daysAgoLocal(i));
    return days.map((day) => {
      const dayRows = orchStats.filter((r) => r.day === day);
      const v1 = dayRows.filter((r) => r.orchestration_version === 'parallel_v1').reduce((s, r) => s + r.response_count, 0);
      // 종합: 비스트리밍 + 스트리밍 둘 다 포함 (UI에서는 하나로 묶음)
      const v2 = dayRows
        .filter((r) => r.orchestration_version?.startsWith('parallel_synthesize_v1'))
        .reduce((s, r) => s + r.response_count, 0);
      const v3 = dayRows.filter((r) => r.orchestration_version === 'agent_loop_v1').reduce((s, r) => s + r.response_count, 0);
      return { day, v1, v2, v3, total: v1 + v2 + v3, label: day.slice(5) };
    });
  }, [orchStats]);

  const maxDaily = Math.max(...dailyResponses.map((d) => d.total), 1);

  if (loading) {
    return (
      <SectionPanel title="AI 사용 현황" subtitle="최근 7일 · 오케스트레이션/피드백 집계">
        <div className="flex items-center justify-center py-12">
          <div className="loader-symbol w-10 h-10 rounded-xl bg-gradient-brand shadow-glow flex items-center justify-center">
            <Sparkles size={18} className="text-white" strokeWidth={2.5} />
          </div>
        </div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel
      title="AI 사용 현황"
      subtitle={`최근 7일 · 총 ${totalResponses}개 응답 · 피드백 ${totalFeedback}건${overallSat !== null ? ` · 만족도 ${overallSat}%` : ''}`}
    >
      <div className="space-y-4">
        {/* ── 메트릭 카드 3개 ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="!p-3.5">
            <div className="flex items-center gap-2 text-[10px] text-txt-muted uppercase tracking-wider mb-1.5">
              <MessageSquare size={13} /> AI 응답
            </div>
            <p className="text-2xl font-bold text-txt-primary">{totalResponses}</p>
            <p className="text-[10px] text-txt-muted mt-1">최근 7일</p>
          </Card>
          <Card className="!p-3.5">
            <div className="flex items-center gap-2 text-[10px] text-txt-muted uppercase tracking-wider mb-1.5">
              <TrendingUp size={13} /> Milo 종합률
            </div>
            <p className="text-2xl font-bold text-txt-primary">
              {totalResponses > 0
                ? Math.round((
                    ((versionTotals['parallel_synthesize_v1'] || 0)
                      + (versionTotals['parallel_synthesize_v1_streaming'] || 0)
                    ) / totalResponses) * 100)
                : 0}%
            </p>
            <p className="text-[10px] text-txt-muted mt-1">
              Phase 1 효과
              {versionTotals['parallel_synthesize_v1_streaming'] > 0
                ? ` · 스트리밍 ${versionTotals['parallel_synthesize_v1_streaming']}건`
                : ''}
            </p>
          </Card>
          <Card className="!p-3.5">
            <div className="flex items-center gap-2 text-[10px] text-txt-muted uppercase tracking-wider mb-1.5">
              <ThumbsUp size={13} className="text-status-success" /> 만족도
            </div>
            <p className="text-2xl font-bold text-txt-primary">
              {overallSat === null ? '—' : `${overallSat}%`}
            </p>
            <p className="text-[10px] text-txt-muted mt-1">피드백 {totalFeedback}건 기준</p>
          </Card>
          <Card className="!p-3.5">
            <div className="flex items-center gap-2 text-[10px] text-txt-muted uppercase tracking-wider mb-1.5">
              <ThumbsDown size={13} className="text-status-error" /> 개선 제안
            </div>
            <p className="text-2xl font-bold text-txt-primary">
              {totalFeedback - totalUp}
            </p>
            <p className="text-[10px] text-txt-muted mt-1">👎 건수</p>
          </Card>
        </div>

        {/* ── 일별 응답 수 (스택 바 차트) ── */}
        <Card className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-txt-primary">일별 AI 응답 추이</p>
              <p className="text-[10px] text-txt-muted">최근 7일 · 버전 색상 구분</p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-purple" />병렬</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-brand-orange" />종합</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-status-success" />에이전트</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 h-32 pt-2">
            {dailyResponses.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                {d.total > 0 && (
                  <div
                    className="absolute -top-5 text-[9px] text-txt-muted opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {d.total}
                  </div>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: `${(d.total / maxDaily) * 100}%`, minHeight: d.total > 0 ? '4px' : '0' }}>
                  {d.v3 > 0 && <div className="w-full bg-status-success" style={{ height: `${(d.v3 / d.total) * 100}%` }} title={`에이전트: ${d.v3}`} />}
                  {d.v2 > 0 && <div className="w-full bg-brand-orange" style={{ height: `${(d.v2 / d.total) * 100}%` }} title={`종합: ${d.v2}`} />}
                  {d.v1 > 0 && <div className="w-full bg-brand-purple rounded-t" style={{ height: `${(d.v1 / d.total) * 100}%` }} title={`병렬: ${d.v1}`} />}
                </div>
                <span className="text-[10px] text-txt-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── 전문가별 만족도 ── */}
        <Card className="!p-4">
          <p className="text-sm font-semibold text-txt-primary mb-3">AI 전문가별 만족도</p>
          {employeeSatisfaction.length === 0 ? (
            <p className="text-xs text-txt-muted py-6 text-center">아직 피드백이 없습니다. 👍/👎 버튼으로 수집이 시작되면 표시됩니다.</p>
          ) : (
            <div className="space-y-2.5">
              {employeeSatisfaction.map((e) => (
                <div key={e.empId} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: e.emp.color || '#723CEB' }}>
                    {e.emp.initials || e.emp.nameKo?.[0] || '?'}
                  </div>
                  <span className="text-xs font-medium text-txt-primary w-16 shrink-0">{e.emp.nameKo}</span>
                  <div className="flex-1 flex items-center gap-2">
                    {e.total === 0 ? (
                      <span className="text-[10px] text-txt-muted">피드백 없음</span>
                    ) : (
                      <>
                        <div className="flex-1 h-2 rounded-full bg-bg-tertiary overflow-hidden relative">
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-status-success transition-all"
                            style={{ width: `${(e.up / e.total) * 100}%` }}
                          />
                          <div
                            className="absolute top-0 bottom-0 bg-status-error transition-all"
                            style={{ left: `${(e.up / e.total) * 100}%`, width: `${(e.down / e.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-txt-primary w-9 text-right">{e.satisfaction}%</span>
                        <span className="text-[10px] text-txt-muted w-14 text-right">👍 {e.up} / 👎 {e.down}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── 최근 👎 상세 (디버깅·프롬프트 개선 소스) ── */}
        {recentNeg.length > 0 && (
          <Card className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-txt-primary">최근 개선 제안 ({recentNeg.length})</p>
                <p className="text-[10px] text-txt-muted">Phase 5에서 이 데이터로 프롬프트 자동 보강</p>
              </div>
            </div>
            <div className="space-y-2">
              {recentNeg.map((r) => {
                const empId = r.messages?.ai_employee || 'milo';
                const emp = EMP_MAP[empId];
                const content = (r.messages?.content || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 120);
                return (
                  <div key={r.id} className="p-2.5 rounded-md bg-bg-tertiary/50 border border-border-subtle">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-txt-primary" style={{ color: emp?.color }}>
                        {emp?.nameKo || empId}
                      </span>
                      <Badge variant="outline" className="!text-[9px] !px-1.5 !py-0">
                        {REASON_LABELS[r.reason] || '사유 없음'}
                      </Badge>
                      <span className="text-[9px] text-txt-muted ml-auto">
                        {new Date(r.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] text-txt-secondary line-clamp-2 leading-snug">{content}{content.length >= 120 ? '…' : ''}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </SectionPanel>
  );
}

const REASON_LABELS = {
  too_long: '너무 길다',
  incorrect: '틀렸다',
  off_topic: '범위 밖',
  repetitive: '반복',
  other: '기타',
};
