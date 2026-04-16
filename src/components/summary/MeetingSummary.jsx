import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2, MessageCircle, PauseCircle, ListTodo, Sparkles, ArrowLeft,
  Loader, Clock, Users, MessageSquare, BarChart3, AlertTriangle, Target,
  ChevronDown, ChevronUp, Copy, Check, FileText,
} from 'lucide-react';
import { Card, Badge, Avatar } from '@/components/ui';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/utils/formatters';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 요약
const DEMO_SUMMARY = {
  decisions: [
    { title: '온보딩 3단계 개선 A/B 테스트 진행', detail: '팀 초대 플로우를 2가지 버전으로 실험', owner: '박서연' },
    { title: '결과 집계 기준: 7일 이탈률', detail: '기존 대비 15% 개선을 기준선으로 설정', owner: '이도윤' },
  ],
  discussions: [
    { title: '개선안 디자인 책임자', detail: '박서연, 이도윤 공동 담당 가능성 논의', status: 'open' },
    { title: '테스트 시작 시점', detail: '다음 주 월요일 릴리즈 후 즉시 시작 검토', status: 'open' },
  ],
  deferred: [
    { title: '팀 초대 플로우의 UX 전면 리뉴얼', reason: '다음 스프린트에서 별도 논의' },
  ],
  action_items: [
    { title: '개선안 A/B 와이어프레임 작성', assignee_hint: '박서연', priority: 'high', due_hint: 'D-3' },
    { title: '성공 지표 대시보드 구성', assignee_hint: '이도윤', priority: 'medium', due_hint: 'D-7' },
    { title: '실험 결과 발표 자료 준비', assignee_hint: '김지우', priority: 'low', due_hint: 'D-14' },
  ],
  milo_insights: '이번 회의는 데이터 중심 결정이 잘 이뤄진 논의였어요. 다만 팀 초대 플로우의 장기 방향성에 대한 정렬이 아직 부족해 보여, 다음 리뷰에서 별도로 다룰 가치가 있습니다.',
  key_quotes: [],
};

function Section({ icon: Icon, title, color, children, count, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="!p-0 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-border-divider hover:bg-bg-tertiary/30 transition-colors"
      >
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${color}`}>
          <Icon size={14} strokeWidth={2.4} />
        </div>
        <h3 className="text-[13px] font-semibold text-txt-primary">{title}</h3>
        {typeof count === 'number' && (
          <span className="ml-1 text-xs text-txt-muted">{count}</span>
        )}
        <span className="ml-auto text-txt-muted">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && <div className="px-5 py-4">{children}</div>}
    </Card>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-brand-purple' }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-bg-tertiary/50">
      <Icon size={16} className={color} />
      <div>
        <p className="text-lg font-bold text-txt-primary leading-none">{value}</p>
        <p className="text-[10px] text-txt-muted mt-0.5">{label}{sub ? ` · ${sub}` : ''}</p>
      </div>
    </div>
  );
}

export default function MeetingSummary() {
  const { id } = useParams();
  const { getById } = useMeeting();
  const meeting = getById(id);
  const { messages } = useRealtimeMessages(id);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadSummary() {
      setLoading(true);
      if (SUPABASE_ENABLED) {
        try {
          const { data } = await supabase
            .from('meeting_summaries')
            .select('*')
            .eq('meeting_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data) { setSummary(data); setLoading(false); return; }
        } catch {}
      }
      try {
        const stored = JSON.parse(localStorage.getItem('meetflow-summaries') || '{}');
        if (stored[id]) { setSummary(stored[id]); setLoading(false); return; }
      } catch {}
      setSummary(DEMO_SUMMARY);
      setLoading(false);
    }
    if (id) loadSummary();
  }, [id]);

  // 회의 통계 계산
  const stats = (() => {
    if (!messages?.length) return null;
    const humanMsgs = messages.filter((m) => !m.is_ai);
    const aiMsgs = messages.filter((m) => m.is_ai);
    const participants = [...new Set(humanMsgs.map((m) => m.user?.name).filter(Boolean))];
    const aiEmployees = [...new Set(aiMsgs.map((m) => m.ai_employee).filter(Boolean))];
    const startTime = messages[0]?.created_at;
    const endTime = messages[messages.length - 1]?.created_at;
    const durationMin = startTime && endTime
      ? Math.round((new Date(endTime) - new Date(startTime)) / 60000) : 0;
    return { humanMsgs: humanMsgs.length, aiMsgs: aiMsgs.length, participants, aiEmployees, durationMin, total: messages.length };
  })();

  // 마크다운 내보내기
  const exportMarkdown = () => {
    if (!summary || !meeting) return;
    let md = `# ${meeting.title}\n`;
    md += `**일시**: ${formatDate(meeting.started_at || meeting.created_at, 'yyyy.MM.dd HH:mm')}\n`;
    if (stats) md += `**소요시간**: ${stats.durationMin}분 | **참가자**: ${stats.participants.join(', ')} | **메시지**: ${stats.total}건\n`;
    md += `\n---\n\n`;
    if (summary.milo_insights) md += `## Milo 인사이트\n${summary.milo_insights}\n\n`;
    if (summary.decisions?.length) {
      md += `## 결정 사항 (${summary.decisions.length}건)\n`;
      summary.decisions.forEach((d, i) => { md += `${i + 1}. **${d.title}** — ${d.detail}${d.owner ? ` (담당: ${d.owner})` : ''}\n`; });
      md += '\n';
    }
    if (summary.discussions?.length) {
      md += `## 논의 중 (${summary.discussions.length}건)\n`;
      summary.discussions.forEach((d, i) => { md += `${i + 1}. **${d.title}** — ${d.detail}\n`; });
      md += '\n';
    }
    if (summary.deferred?.length) {
      md += `## 보류 (${summary.deferred.length}건)\n`;
      summary.deferred.forEach((d, i) => { md += `${i + 1}. **${d.title}** — ${d.reason}\n`; });
      md += '\n';
    }
    if (summary.action_items?.length) {
      md += `## 후속 태스크 (${summary.action_items.length}건)\n`;
      summary.action_items.forEach((a, i) => { md += `- [ ] **${a.title}** — ${a.assignee_hint} · ${a.due_hint} · ${a.priority}\n`; });
    }
    navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (!meeting) {
    return <div className="p-6 text-center text-txt-secondary">회의를 찾을 수 없습니다.</div>;
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-txt-muted">
          <Loader size={20} className="animate-spin" />
          <span className="text-sm">AI 요약을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (!summary) {
    return <div className="p-6 text-center text-txt-secondary">요약 데이터가 없습니다.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* 상단 네비 */}
      <Link
        to="/summaries"
        className="inline-flex items-center gap-1.5 text-xs text-txt-secondary hover:text-txt-primary mb-4 transition-colors"
      >
        <ArrowLeft size={14} />
        회의록 목록으로
      </Link>

      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-txt-primary">{meeting.title}</h1>
          <Badge variant={meeting.status === 'completed' ? 'success' : 'outline'}>
            {meeting.status === 'completed' ? '완료' : meeting.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-txt-secondary flex-wrap">
          <span>{formatDate(meeting.started_at || meeting.created_at, 'yyyy.MM.dd HH:mm')}</span>
          <span className="text-border-default">|</span>
          <span>{meeting.agendas?.length || 0}개 어젠다</span>
          <span className="text-border-default">|</span>
          <span>{stats?.participants.length || meeting.participants?.length || 0}명 참여</span>
          {stats?.durationMin > 0 && (
            <>
              <span className="text-border-default">|</span>
              <span>{stats.durationMin}분 소요</span>
            </>
          )}
        </div>
      </div>

      {/* 회의 통계 바 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <StatCard icon={Clock} label="소요시간" value={`${stats.durationMin}분`} color="text-brand-orange" />
          <StatCard icon={MessageSquare} label="총 메시지" value={stats.total} sub={`사람 ${stats.humanMsgs} · AI ${stats.aiMsgs}`} />
          <StatCard icon={Users} label="참가자" value={stats.participants.length} sub={stats.participants.slice(0, 3).join(', ')} />
          <StatCard icon={Sparkles} label="AI 전문가" value={stats.aiEmployees.length} sub={stats.aiEmployees.map((id) => AI_EMPLOYEES.find((e) => e.id === id)?.nameKo || id).join(', ')} color="text-brand-purple" />
        </div>
      )}

      {/* Milo 인사이트 */}
      {summary.milo_insights && (
        <Card className="mb-5 border-brand-purple/30 bg-brand-purple/[0.04]">
          <div className="flex items-start gap-3">
            <MiloAvatar employeeId="milo" size="md" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-txt-primary">Milo 인사이트</span>
                <Badge variant="purple" className="!text-[10px]">
                  <Sparkles size={10} strokeWidth={2.4} /> AI
                </Badge>
              </div>
              <p className="text-sm text-txt-secondary leading-relaxed">{summary.milo_insights}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 참여 AI 전문가 요약 */}
      {stats?.aiEmployees.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[10px] text-txt-muted uppercase tracking-wider font-medium">참여 전문가</span>
          {stats.aiEmployees.map((id) => {
            const emp = AI_EMPLOYEES.find((e) => e.id === id);
            if (!emp) return null;
            const count = messages.filter((m) => m.ai_employee === id).length;
            return (
              <div key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-tertiary border border-border-subtle">
                <MiloAvatar employeeId={id} size="sm" />
                <span className="text-[11px] font-medium text-txt-primary">{emp.nameKo}</span>
                <span className="text-[10px] text-txt-muted">{count}건</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 4섹션 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        {/* 결정 사항 */}
        <Section icon={CheckCircle2} title="결정 사항" color="bg-status-success/15 text-status-success" count={summary.decisions?.length}>
          <ul className="space-y-3">
            {(summary.decisions || []).map((d, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 size={14} className="text-status-success mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-txt-primary">{d.title}</p>
                  <p className="text-xs text-txt-secondary mt-0.5">{d.detail}</p>
                  {d.owner && <span className="text-[10px] text-brand-purple mt-0.5 inline-block">담당: {d.owner}</span>}
                </div>
              </li>
            ))}
            {!summary.decisions?.length && <p className="text-xs text-txt-muted">결정 사항 없음</p>}
          </ul>
        </Section>

        {/* 논의 중 */}
        <Section icon={MessageCircle} title="논의 중" color="bg-brand-yellow/15 text-brand-yellow" count={summary.discussions?.length}>
          <ul className="space-y-3">
            {(summary.discussions || []).map((d, i) => (
              <li key={i} className="flex gap-2">
                <MessageCircle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-txt-primary">{d.title}</p>
                  <p className="text-xs text-txt-secondary mt-0.5">{d.detail}</p>
                </div>
              </li>
            ))}
            {!summary.discussions?.length && <p className="text-xs text-txt-muted">논의 중인 항목 없음</p>}
          </ul>
        </Section>

        {/* 보류 */}
        <Section icon={PauseCircle} title="보류" color="bg-txt-secondary/15 text-txt-secondary" count={summary.deferred?.length} defaultOpen={false}>
          <ul className="space-y-3">
            {(summary.deferred || []).map((d, i) => (
              <li key={i} className="flex gap-2">
                <PauseCircle size={14} className="text-txt-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-txt-primary">{d.title}</p>
                  <p className="text-xs text-txt-muted mt-0.5">{d.reason}</p>
                </div>
              </li>
            ))}
            {!summary.deferred?.length && <p className="text-xs text-txt-muted">보류 항목 없음</p>}
          </ul>
        </Section>

        {/* 후속 태스크 */}
        <Section icon={ListTodo} title="후속 태스크" color="bg-brand-purple/15 text-brand-purple" count={summary.action_items?.length}>
          <ul className="space-y-2.5">
            {(summary.action_items || []).map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-bg-tertiary/40 border border-border-subtle">
                <div className="w-4 h-4 rounded border-2 border-border-default mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-txt-primary">{a.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px] text-txt-secondary">{a.assignee_hint}</span>
                    <span className="text-[10px] text-txt-muted">{a.due_hint}</span>
                    <Badge
                      variant={a.priority === 'urgent' || a.priority === 'high' ? 'danger' : a.priority === 'medium' ? 'purple' : 'outline'}
                      className="!text-[9px] !px-1.5 !py-0"
                    >
                      {a.priority}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
            {!summary.action_items?.length && <p className="text-xs text-txt-muted">후속 태스크 없음</p>}
          </ul>
        </Section>
      </div>

      {/* 하단 액션 */}
      <div className="flex items-center gap-3 pt-3 border-t border-border-divider">
        <button
          onClick={exportMarkdown}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary hover:text-txt-primary hover:border-border-hover transition-colors"
        >
          {copied ? <Check size={14} className="text-status-success" /> : <Copy size={14} />}
          {copied ? '복사됨' : '마크다운 복사'}
        </button>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary hover:text-txt-primary hover:border-border-hover transition-colors"
          onClick={() => window.print()}
        >
          <FileText size={14} />
          인쇄 / PDF
        </button>
      </div>
    </div>
  );
}
