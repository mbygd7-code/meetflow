import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Coins, Zap, AlertTriangle, ArrowLeft, RefreshCw,
  TrendingDown, Database, Headphones, Mic, Server, FileText,
} from 'lucide-react';
import { MetricCard, SectionPanel, Badge } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { SERVICE_PRICING } from '@/lib/serviceUsage';

// AI 직원 이름 맵
const EMP_NAME = {};
AI_EMPLOYEES.forEach((e) => { EMP_NAME[e.id] = e.nameKo; });
EMP_NAME['milo'] = '밀로';
EMP_NAME['unknown'] = '알 수 없음';

// 모델별 비용 ($/1M tokens 기준, 입력 기준)
const MODEL_COST = {
  'claude-haiku-4-5': { label: 'Haiku 4.5', inputCost: 0.80, outputCost: 4.00 },
  'claude-haiku-4-5-20251001': { label: 'Haiku 4.5', inputCost: 0.80, outputCost: 4.00 },
  'claude-sonnet-4-5': { label: 'Sonnet 4.5', inputCost: 3.00, outputCost: 15.00 },
  'claude-sonnet-4-5-20241022': { label: 'Sonnet 4.5', inputCost: 3.00, outputCost: 15.00 },
  'claude-opus-4-5': { label: 'Opus 4.5', inputCost: 15.00, outputCost: 75.00 },
};

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(dollars) {
  if (dollars < 0.01) return '$0.00';
  return '$' + dollars.toFixed(2);
}

export default function TokenUsagePage() {
  const [logs, setLogs] = useState([]);
  const [serviceLogs, setServiceLogs] = useState([]);  // service_usage_logs (LiveKit/STT 등)
  const [billings, setBillings] = useState([]);        // service_usage_billing (Phase B 외부 정산)
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d'); // 7d | 30d | all
  // 에러 상세 — 사용자에게 노출 (마이그레이션 미적용 vs RLS 차단 vs 네트워크 등 구분)
  const [loadErrors, setLoadErrors] = useState({ ai: null, svc: null, bill: null });

  // DB에서 사용량 로그 로드 — Anthropic + 외부 인프라 + 외부 정산 동시
  const loadLogs = async () => {
    setLoading(true);
    setLoadErrors({ ai: null, svc: null, bill: null });
    try {
      const sinceIso = period === '7d'
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : period === '30d'
          ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;

      let aiQuery = supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (sinceIso) aiQuery = aiQuery.gte('created_at', sinceIso);

      let svcQuery = supabase
        .from('service_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (sinceIso) svcQuery = svcQuery.gte('created_at', sinceIso);

      const billingQuery = supabase
        .from('service_usage_billing')
        .select('*')
        .order('period_start', { ascending: false })
        .limit(36);

      const [aiRes, svcRes, billRes] = await Promise.all([aiQuery, svcQuery, billingQuery]);
      setLogs(aiRes.data || []);
      setServiceLogs(svcRes.data || []);
      setBillings(billRes.data || []);
      setLoadErrors({
        ai: aiRes.error?.message || null,
        svc: svcRes.error?.message || null,
        bill: billRes.error?.message || null,
      });
    } catch (err) {
      console.error('[TokenUsagePage] Load failed:', err);
      setLoadErrors((p) => ({ ...p, ai: err?.message || String(err) }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, [period]);

  // 집계 계산
  const stats = useMemo(() => {
    const totalCalls = logs.length;
    const totalErrors = logs.filter((l) => l.error).length;
    const totalInput = logs.reduce((s, l) => s + (l.input_tokens || 0), 0);
    const totalOutput = logs.reduce((s, l) => s + (l.output_tokens || 0), 0);
    const totalCacheRead = logs.reduce((s, l) => s + (l.cache_read_tokens || 0), 0);
    const totalCacheCreate = logs.reduce((s, l) => s + (l.cache_create_tokens || 0), 0);
    const totalTokens = totalInput + totalOutput;
    const avgLatency = totalCalls > 0 ? Math.round(logs.reduce((s, l) => s + (l.elapsed_ms || 0), 0) / totalCalls) : 0;
    const cacheRate = totalInput > 0 ? ((totalCacheRead / totalInput) * 100).toFixed(1) : '0.0';
    const errorRate = totalCalls > 0 ? ((totalErrors / totalCalls) * 100).toFixed(1) : '0.0';

    // 직원별 집계
    const byEmployee = {};
    logs.forEach((l) => {
      const id = l.employee_id || 'unknown';
      if (!byEmployee[id]) byEmployee[id] = { calls: 0, inputTokens: 0, outputTokens: 0 };
      byEmployee[id].calls++;
      byEmployee[id].inputTokens += l.input_tokens || 0;
      byEmployee[id].outputTokens += l.output_tokens || 0;
    });

    // 모델별 집계
    const byModel = {};
    logs.forEach((l) => {
      const m = l.model || 'unknown';
      if (!byModel[m]) byModel[m] = { calls: 0, inputTokens: 0, outputTokens: 0 };
      byModel[m].calls++;
      byModel[m].inputTokens += l.input_tokens || 0;
      byModel[m].outputTokens += l.output_tokens || 0;
    });

    // 예상 비용 계산
    let estimatedCost = 0;
    Object.entries(byModel).forEach(([model, data]) => {
      const pricing = MODEL_COST[model];
      if (pricing) {
        estimatedCost += (data.inputTokens / 1000000) * pricing.inputCost;
        estimatedCost += (data.outputTokens / 1000000) * pricing.outputCost;
      }
    });

    // 캐시 절감 비용 추정
    const cacheSavings = (totalCacheRead / 1000000) * 3.0 * 0.9; // 캐시 읽기는 90% 할인

    return {
      totalCalls, totalErrors, totalTokens, totalInput, totalOutput,
      totalCacheRead, totalCacheCreate, avgLatency, cacheRate, errorRate,
      byEmployee, byModel, estimatedCost, cacheSavings,
    };
  }, [logs]);

  const maxEmployeeTokens = Math.max(1, ...Object.values(stats.byEmployee).map((e) => e.inputTokens + e.outputTokens));

  // ── 인프라 사용량 집계 (LiveKit / STT / Edge Functions / Storage) ──
  const infraStats = useMemo(() => {
    const byService = {};
    serviceLogs.forEach((l) => {
      const s = l.service || 'unknown';
      if (!byService[s]) byService[s] = { count: 0, units: 0, unitType: l.unit_type, cost: 0 };
      byService[s].count++;
      byService[s].units += parseFloat(l.units || 0);
      byService[s].cost += parseFloat(l.estimated_cost || 0);
    });
    const total = Object.values(byService).reduce((s, v) => s + v.cost, 0);
    return { byService, total };
  }, [serviceLogs]);

  // 외부 정산 합계 (Phase B — 월 1회 외부 API 동기화 결과)
  const billingTotals = useMemo(() => {
    const byService = {};
    let latestPeriod = null;
    billings.forEach((b) => {
      const s = b.service;
      if (!byService[s]) byService[s] = { amount: 0, source: b.source, period_start: b.period_start, period_end: b.period_end };
      byService[s].amount += parseFloat(b.amount || 0);
      const ps = new Date(b.period_start).getTime();
      if (!latestPeriod || ps > latestPeriod) latestPeriod = ps;
    });
    const total = Object.values(byService).reduce((s, v) => s + v.amount, 0);
    return { byService, total, latestPeriod };
  }, [billings]);

  // 서비스별 아이콘/라벨 매핑
  const SERVICE_META = {
    livekit: { icon: Headphones, label: SERVICE_PRICING.livekit.label, color: 'text-brand-purple' },
    stt: { icon: Mic, label: SERVICE_PRICING.stt.label, color: 'text-brand-orange' },
    edge_function: { icon: Server, label: SERVICE_PRICING.edge_function.label, color: 'text-status-info' },
    storage: { icon: Database, label: SERVICE_PRICING.storage.label, color: 'text-status-success' },
    cloudconvert: { icon: FileText, label: SERVICE_PRICING.cloudconvert.label, color: 'text-status-error' },
  };

  return (
    <div className="max-w-[1400px] mx-auto p-3 md:p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="p-2 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="w-10 h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center">
            <Coins size={20} className="text-brand-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-txt-primary">토큰 사용량</h2>
            <p className="text-xs text-txt-secondary">AI API 호출 비용과 성능을 추적합니다</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 기간 필터 */}
          <div className="flex bg-bg-tertiary rounded-md p-0.5">
            {[
              { value: '7d', label: '7일' },
              { value: '30d', label: '30일' },
              { value: 'all', label: '전체' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  period === value
                    ? 'bg-brand-purple text-white font-medium'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={loadLogs} className="p-2 text-txt-muted hover:text-brand-purple transition-colors" title="새로고침">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 에러 배너 — 어떤 테이블/쿼리가 실패했는지 사용자에게 명시 */}
      {(loadErrors.ai || loadErrors.svc || loadErrors.bill) && (
        <div className="rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error space-y-1">
          {loadErrors.ai && <p>⚠️ ai_usage_logs 로드 실패: {loadErrors.ai}</p>}
          {loadErrors.svc && <p>⚠️ service_usage_logs 로드 실패: {loadErrors.svc} (마이그레이션 043 미적용 가능)</p>}
          {loadErrors.bill && <p>⚠️ service_usage_billing 로드 실패: {loadErrors.bill}</p>}
        </div>
      )}

      {/* 상단 메트릭 카드 */}
      <SectionPanel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricCard label="총 AI 호출" value={formatNumber(stats.totalCalls)} icon={Zap} />
          <MetricCard
            label="총 토큰 사용"
            value={formatNumber(stats.totalTokens)}
            change={`입력 ${formatNumber(stats.totalInput)} · 출력 ${formatNumber(stats.totalOutput)}`}
            icon={Database}
          />
          <MetricCard
            label="캐시 절감율"
            value={stats.cacheRate + '%'}
            change={cacheSavingsLabel(stats.cacheSavings)}
            changeType="up"
            variant="gradient"
            icon={TrendingDown}
          />
          <MetricCard
            label="에러율"
            value={stats.errorRate + '%'}
            change={`${stats.totalErrors}건 실패 · 평균 ${stats.avgLatency}ms`}
            icon={AlertTriangle}
          />
        </div>
      </SectionPanel>

      {/* 중단: 직원별 + 모델별 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 직원별 토큰 사용량 */}
        <SectionPanel title="직원별 사용량" subtitle="AI 직원별 토큰 소비 현황">
          <div className="space-y-2.5">
            {Object.entries(stats.byEmployee)
              .sort(([, a], [, b]) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
              .map(([empId, data]) => {
                const total = data.inputTokens + data.outputTokens;
                const pct = maxEmployeeTokens > 0 ? (total / maxEmployeeTokens) * 100 : 0;
                return (
                  <div key={empId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-txt-primary">{EMP_NAME[empId] || empId}</span>
                      <span className="text-txt-muted">{formatNumber(total)} tokens · {data.calls}회</span>
                    </div>
                    <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-purple rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.keys(stats.byEmployee).length === 0 && (
              <p className="text-xs text-txt-muted text-center py-4">아직 데이터가 없습니다</p>
            )}
          </div>
        </SectionPanel>

        {/* 모델별 호출 비율 + 비용 */}
        <SectionPanel title="모델별 비용" subtitle="모델 선택에 따른 예상 API 비용">
          <div className="space-y-3">
            {Object.entries(stats.byModel)
              .sort(([, a], [, b]) => b.calls - a.calls)
              .map(([model, data]) => {
                const pricing = MODEL_COST[model];
                const inputCost = pricing ? (data.inputTokens / 1000000) * pricing.inputCost : 0;
                const outputCost = pricing ? (data.outputTokens / 1000000) * pricing.outputCost : 0;
                const totalCost = inputCost + outputCost;
                return (
                  <div key={model} className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg border border-border-subtle">
                    <div>
                      <p className="text-sm font-medium text-txt-primary">{pricing?.label || model}</p>
                      <p className="text-[10px] text-txt-muted mt-0.5">
                        {data.calls}회 호출 · {formatNumber(data.inputTokens)} in · {formatNumber(data.outputTokens)} out
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-brand-purple">{formatCost(totalCost)}</p>
                      <p className="text-[10px] text-txt-muted">예상 비용</p>
                    </div>
                  </div>
                );
              })}

            {/* 총 비용 요약 */}
            <div className="flex items-center justify-between pt-3 border-t border-border-divider">
              <span className="text-sm font-medium text-txt-primary">총 예상 비용</span>
              <div className="text-right">
                <span className="text-lg font-bold text-brand-purple">{formatCost(stats.estimatedCost)}</span>
                {stats.cacheSavings > 0.001 && (
                  <p className="text-[10px] text-status-success">캐시로 ~{formatCost(stats.cacheSavings)} 절감</p>
                )}
              </div>
            </div>
          </div>
        </SectionPanel>
      </div>

      {/* ═══ 인프라 비용 (LiveKit / STT / Edge Functions / Storage) ═══ */}
      <SectionPanel
        title="인프라 비용"
        subtitle="음성 회의·자막·서버리스·저장소 등 외부 유료 서비스 추정 비용"
      >
        <div className="space-y-3">
          {Object.entries(infraStats.byService).length === 0 && (
            <p className="text-xs text-txt-muted text-center py-4">
              아직 인프라 사용량 데이터가 없습니다. 음성 회의를 진행하거나 STT 를 사용하면 여기에 기록됩니다.
            </p>
          )}
          {Object.entries(infraStats.byService)
            .sort(([, a], [, b]) => b.cost - a.cost)
            .map(([service, data]) => {
              const meta = SERVICE_META[service] || { icon: Server, label: service, color: 'text-txt-secondary' };
              const Icon = meta.icon;
              const billed = billingTotals.byService[service]?.amount;
              return (
                <div key={service} className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg border border-border-subtle">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center shrink-0 ${meta.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-txt-primary truncate">{meta.label}</p>
                      <p className="text-[10px] text-txt-muted mt-0.5">
                        {data.count}건 · {data.units.toFixed(1)} {data.unitType}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-brand-purple">{formatCost(data.cost)}</p>
                    <p className="text-[10px] text-txt-muted">
                      {billed != null ? `정산 ${formatCost(billed)}` : '추정'}
                    </p>
                  </div>
                </div>
              );
            })}

          {/* 합계 */}
          {Object.keys(infraStats.byService).length > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-border-divider">
              <span className="text-sm font-medium text-txt-primary">인프라 총 추정 비용</span>
              <div className="text-right">
                <span className="text-lg font-bold text-brand-purple">{formatCost(infraStats.total)}</span>
                {billingTotals.total > 0 && (
                  <p className="text-[10px] text-status-success">
                    외부 정산 합계 {formatCost(billingTotals.total)}
                    {billingTotals.latestPeriod && (
                      <> · 최근 {new Date(billingTotals.latestPeriod).toLocaleDateString('ko-KR')}</>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 종합 — Anthropic + 인프라 합계 */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-brand-purple/30">
            <span className="text-sm font-semibold text-txt-primary">전체 추정 비용 (AI + 인프라)</span>
            <span className="text-xl font-bold text-brand-purple">
              {formatCost(stats.estimatedCost + infraStats.total)}
            </span>
          </div>
        </div>
      </SectionPanel>

      {/* 하단: 최근 호출 로그 테이블 */}
      <SectionPanel title="최근 호출 로그" subtitle={`최근 ${Math.min(logs.length, 50)}건`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-txt-muted border-b border-border-divider">
                <th className="text-left py-2 px-2 font-medium">시각</th>
                <th className="text-left py-2 px-2 font-medium">직원</th>
                <th className="text-left py-2 px-2 font-medium">모델</th>
                <th className="text-right py-2 px-2 font-medium">입력</th>
                <th className="text-right py-2 px-2 font-medium">출력</th>
                <th className="text-right py-2 px-2 font-medium">캐시</th>
                <th className="text-right py-2 px-2 font-medium">소요</th>
                <th className="text-center py-2 px-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 50).map((log) => (
                <tr key={log.id} className="border-b border-border-divider-faint hover:bg-bg-tertiary/30 transition-colors">
                  <td className="py-2 px-2 text-txt-muted whitespace-nowrap">
                    {log.created_at ? new Date(log.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="py-2 px-2 text-txt-primary font-medium">{EMP_NAME[log.employee_id] || log.employee_id}</td>
                  <td className="py-2 px-2 text-txt-secondary">
                    {MODEL_COST[log.model]?.label || (log.model || '-').replace('claude-', '').replace(/-\d+$/, '')}
                  </td>
                  <td className="py-2 px-2 text-right text-txt-primary">{formatNumber(log.input_tokens || 0)}</td>
                  <td className="py-2 px-2 text-right text-txt-primary">{formatNumber(log.output_tokens || 0)}</td>
                  <td className="py-2 px-2 text-right text-status-success">{formatNumber(log.cache_read_tokens || 0)}</td>
                  <td className="py-2 px-2 text-right text-txt-muted">{log.elapsed_ms || 0}ms</td>
                  <td className="py-2 px-2 text-center">
                    {log.error ? (
                      <Badge variant="error" className="!text-[9px] !px-1.5">에러</Badge>
                    ) : (
                      <Badge variant="success" className="!text-[9px] !px-1.5">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-txt-muted">
                    {loading ? '로딩 중...' : '아직 AI 호출 데이터가 없습니다. 회의에서 AI를 사용하면 여기에 기록됩니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </div>
  );
}

function cacheSavingsLabel(savings) {
  if (savings < 0.001) return '캐시 절감 데이터 없음';
  return `캐시로 ~${formatCost(savings)} 절감`;
}
