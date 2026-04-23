import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, MessageCircle, PauseCircle, ListTodo, Sparkles, ArrowLeft,
  Loader, Clock, Users, MessageSquare,
  ChevronDown, ChevronUp, Copy, Check, FileText, RefreshCw, AlertCircle,
  Quote, Trash2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { Card, Badge, EmptyState } from '@/components/ui';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { supabase } from '@/lib/supabase';
import { generateSummary } from '@/lib/claude';
import { safeFormatDate } from '@/utils/formatters';
import { getPriorityInfo } from '@/lib/taskConstants';
import { useToastStore } from '@/stores/toastStore';
import SummaryAgendaList from './SummaryAgendaList';
import MeetingMetaBar from './MeetingMetaBar';
import MeetingParticipants from './MeetingParticipants';
import MeetingFeedback from './MeetingFeedback';
import MeetingScoreBadge from './MeetingScoreBadge';
import { computeMeetingScore } from '@/utils/meetingScoreUtils';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// V3: 결정/논의 항목의 근거 메시지 찾기 (텍스트 겹침 기반)
function findSourceMessage(item, messages) {
  if (!item || !messages?.length) return null;
  const needle = `${item.title || ''} ${item.detail || item.reason || ''}`.toLowerCase().trim();
  if (needle.length < 10) return null;
  // 문장 단위로 쪼개어 앞 30자 프로브 후 각 메시지 content와 비교
  const probes = needle
    .split(/[.!?。,\s]+/)
    .filter((s) => s.length >= 8)
    .slice(0, 6);
  let best = { msg: null, score: 0 };
  for (const m of messages) {
    const content = (m.content || '').toLowerCase();
    if (content.length < 10) continue;
    let score = 0;
    for (const p of probes) {
      if (content.includes(p)) score += p.length;
    }
    // 역방향: 메시지 내용 일부가 needle에 포함
    const short = content.length > 30 ? content.slice(0, 30) : content;
    if (needle.includes(short) && short.length >= 10) score += short.length;
    if (score > best.score) best = { msg: m, score };
  }
  // 최소 점수 기준 (너무 느슨한 매칭 방지)
  return best.score >= 15 ? best.msg : null;
}

function SourceLink({ meetingId, item, messages }) {
  const msg = useMemo(() => findSourceMessage(item, messages), [item, messages]);
  if (!msg) return null;
  return (
    <Link
      to={`/meetings/${meetingId}#msg-${encodeURIComponent(msg.id)}`}
      className="inline-flex items-center gap-1 text-[10px] text-brand-purple hover:text-brand-purple-deep transition-colors mt-1"
      title="원본 대화로 이동"
    >
      <Quote size={10} strokeWidth={2.4} />
      원본 대화 보기
    </Link>
  );
}

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

function formatDurationLabel(minutes) {
  if (!minutes || minutes <= 0) return '-';
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
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
  const [generating, setGenerating] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin?.() || false);
  const [deleting, setDeleting] = useState(false);

  // 관리자 전용: 회의 완전 삭제
  const handleDeleteMeeting = async () => {
    if (!meeting) return;
    const confirmed = window.confirm(
      `"${meeting.title}" 회의를 완전히 삭제하시겠습니까?\n\n` +
      `- 메시지, 어젠다, 요약, 태스크, 리액션이 모두 제거됩니다.\n` +
      `- 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await supabase.from('meeting_summaries').delete().eq('meeting_id', id);
      await supabase.from('meeting_reactions').delete().eq('meeting_id', id);
      await supabase.from('messages').delete().eq('meeting_id', id);
      await supabase.from('agendas').delete().eq('meeting_id', id);
      const { error } = await supabase.from('meetings').delete().eq('id', id);
      if (error) throw error;
      useMeetingStore.setState((s) => ({
        meetings: s.meetings.filter((m) => m.id !== id),
      }));
      addToast?.('회의를 삭제했습니다', 'success', 2500);
      navigate('/summaries');
    } catch (err) {
      console.error('[deleteMeeting]', err);
      const msg = err?.code === '42501' || /policy/i.test(err?.message || '')
        ? '삭제 권한이 없습니다. (migration 037 적용 필요)'
        : `삭제 실패: ${err?.message || ''}`;
      addToast?.(msg, 'error', 4000);
      setDeleting(false);
    }
  };

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
      // 실제 요약이 없으면 null 유지 — 가짜 데모 데이터로 속이지 않는다
      setSummary(null);
      setLoading(false);
    }
    if (id) loadSummary();
  }, [id]);

  // 요약 (재)생성 — 실제 대화 기록 기반
  const handleGenerateSummary = async () => {
    if (!meeting || generating) return;
    if (!messages || messages.length < 2) {
      addToast('대화 내용이 너무 적어 요약을 생성할 수 없습니다.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateSummary({
        meetingId: id,
        messages,
        agendas: meeting.agendas || [],
      });
      // Edge Function이 DB에 저장하므로 다시 읽기
      if (SUPABASE_ENABLED) {
        const { data } = await supabase
          .from('meeting_summaries')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        setSummary(data || result);
      } else {
        setSummary(result);
      }
      addToast('요약이 생성되었습니다.', 'success');
    } catch (err) {
      console.error('[handleGenerateSummary]', err);
      addToast('요약 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // 회의 통계 계산 — 소요시간은 meeting.ended_at-started_at 우선, fallback으로 메시지 기반
  const stats = useMemo(() => {
    if (!messages?.length) return null;
    const humanMsgs = messages.filter((m) => !m.is_ai);
    const aiMsgs = messages.filter((m) => m.is_ai);

    // 참가자 이름 + 메시지 수
    const humanCounts = {};
    for (const m of humanMsgs) {
      const name = m.user?.name;
      if (name) humanCounts[name] = (humanCounts[name] || 0) + 1;
    }
    const participants = Object.keys(humanCounts);

    // AI 직원 ID + 메시지 수
    const aiCounts = {};
    for (const m of aiMsgs) {
      const id = m.ai_employee;
      if (id) aiCounts[id] = (aiCounts[id] || 0) + 1;
    }
    const aiEmployees = Object.keys(aiCounts);

    // 소요시간: meeting.started_at/ended_at 우선
    let durationMin = 0;
    if (meeting?.started_at && meeting?.ended_at) {
      durationMin = Math.max(
        0,
        Math.round((new Date(meeting.ended_at) - new Date(meeting.started_at)) / 60000)
      );
    } else if (messages.length >= 2) {
      // fallback: 메시지 기반. 단 하루(1440분)를 초과하면 이상치로 보고 0 처리
      const start = new Date(messages[0].created_at);
      const end = new Date(messages[messages.length - 1].created_at);
      const raw = Math.round((end - start) / 60000);
      durationMin = raw > 0 && raw < 1440 ? raw : 0;
    }

    return {
      humanMsgs: humanMsgs.length,
      aiMsgs: aiMsgs.length,
      participants,
      humanCounts,
      aiEmployees,
      aiCounts,
      durationMin,
      total: messages.length,
    };
  }, [messages, meeting?.started_at, meeting?.ended_at]);

  // 회의 품질 점수 (S/A+/A/B+/...) — 6개 축 가중 평균
  const meetingScore = useMemo(() => {
    if (!meeting || !summary) return null;
    try {
      return computeMeetingScore({ meeting, summary, messages: messages || [], stats });
    } catch (err) {
      console.error('[MeetingSummary] score compute failed:', err);
      return null;
    }
  }, [meeting, summary, messages, stats]);

  // 어젠다별 통계 — 메시지의 agenda_id를 기반으로 계산
  //  - messageCount: 해당 어젠다에 속한 메시지 수 (focus %)
  //  - actualDurationMin: 해당 어젠다의 첫/마지막 메시지 간격 (1440분 넘으면 이상치 0)
  //  - completed/active/pending 상태 그대로 전달
  //  - unrelated: 메시지 0건이면 '진행 안됨'으로 표시
  const agendaStats = useMemo(() => {
    const agendas = meeting?.agendas || [];
    if (!agendas.length) return [];
    const totalMsgs = messages?.length || 0;

    return agendas.map((a) => {
      const linked = (messages || []).filter((m) => m.agenda_id === a.id);
      const messageCount = linked.length;
      const focusPct = totalMsgs > 0 ? Math.round((messageCount / totalMsgs) * 100) : 0;

      let actualDurationMin = 0;
      if (linked.length >= 2) {
        const start = new Date(linked[0].created_at);
        const end = new Date(linked[linked.length - 1].created_at);
        const raw = Math.round((end - start) / 60000);
        actualDurationMin = raw > 0 && raw < 1440 ? raw : 0;
      }

      // 진행 판단: status=completed 이거나 메시지가 있으면 '진행됨'
      const wasExecuted = a.status === 'completed' || messageCount > 0;

      return {
        ...a,
        messageCount,
        focusPct,
        actualDurationMin,
        wasExecuted,
      };
    });
  }, [meeting?.agendas, messages]);

  // 마크다운 내보내기
  const exportMarkdown = () => {
    if (!summary || !meeting) return;
    let md = `# ${meeting.title}\n`;
    md += `**일시**: ${safeFormatDate(meeting.started_at || meeting.created_at, 'yyyy.MM.dd HH:mm', '-')}\n`;
    if (meeting.creator?.name) md += `**요청자**: ${meeting.creator.name}\n`;
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
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <Link
          to="/summaries"
          className="inline-flex items-center gap-1.5 text-xs text-txt-secondary hover:text-txt-primary mb-4 transition-colors"
        >
          <ArrowLeft size={14} />
          회의록 목록으로
        </Link>
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-txt-primary">{meeting.title}</h1>
            <Badge variant={meeting.status === 'completed' ? 'success' : 'outline'}>
              {meeting.status === 'completed' ? '완료' : meeting.status}
            </Badge>
          </div>
        </div>
        <EmptyState
          icon={AlertCircle}
          title="아직 생성된 요약이 없어요"
          description={
            messages && messages.length >= 2
              ? '실제 대화 기록을 바탕으로 요약을 생성할 수 있습니다. 가짜/샘플 데이터는 표시하지 않습니다.'
              : '대화 내용이 부족해 요약을 생성할 수 없습니다. 회의 기록이 있는지 확인해주세요.'
          }
          actions={
            messages && messages.length >= 2
              ? [{
                  label: generating ? '생성 중...' : '요약 생성하기',
                  icon: generating ? Loader : Sparkles,
                  onClick: handleGenerateSummary,
                  disabled: generating,
                  variant: 'primary',
                }]
              : []
          }
        />
      </div>
    );
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
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-txt-primary">{meeting.title}</h1>
          <Badge variant={meeting.status === 'completed' ? 'success' : 'outline'}>
            {meeting.status === 'completed' ? '완료' : meeting.status}
          </Badge>

          {/* 우측: 피드백 아이콘 + 회의 점수 — 완료 회의에만 노출 */}
          {meeting.status === 'completed' && (
            <div className="ml-auto flex items-center gap-3">
              <MeetingFeedback meetingId={meeting.id} />
              {meetingScore && (
                <MeetingScoreBadge score={meetingScore} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 메타 바: 요청자 + 시간 타임라인 + 수치 */}
      <div className="mb-5">
        <MeetingMetaBar
          meeting={meeting}
          participantCount={stats?.participants.length || meeting.participants?.length || 0}
          durationMin={stats?.durationMin}
        />
      </div>

      {/* 회의 통계 바 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <StatCard
            icon={Clock}
            label="소요시간"
            value={formatDurationLabel(stats.durationMin)}
            color="text-brand-orange"
          />
          <StatCard
            icon={MessageSquare}
            label="총 메시지"
            value={stats.total}
            sub={`사람 ${stats.humanMsgs} · AI ${stats.aiMsgs}`}
          />
          <StatCard
            icon={Users}
            label="참가자"
            value={stats.participants.length}
          />
          <StatCard
            icon={Sparkles}
            label="AI 전문가"
            value={stats.aiEmployees.length}
            color="text-brand-purple"
          />
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

      {/* 어젠다 리스트 */}
      <SummaryAgendaList agendas={agendaStats} />

      {/* 참여자 (사람 + AI) */}
      {stats && (
        <MeetingParticipants
          humanNames={stats.participants}
          humanCounts={stats.humanCounts}
          aiEmployees={stats.aiEmployees}
          aiCounts={stats.aiCounts}
        />
      )}

      {/* 4섹션 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        {/* 결정 사항 */}
        <Section icon={CheckCircle2} title="결정 사항" color="bg-status-success/15 text-status-success" count={summary.decisions?.length}>
          {summary.decisions?.length ? (
            <ul className="space-y-3">
              {summary.decisions.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <CheckCircle2 size={14} className="text-status-success mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-txt-primary">{d.title}</p>
                    {d.detail && <p className="text-xs text-txt-secondary mt-0.5">{d.detail}</p>}
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {d.owner && <span className="text-[10px] text-brand-purple">담당: {d.owner}</span>}
                      <SourceLink meetingId={id} item={d} messages={messages} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="결정 사항이 없어요"
              description="이번 회의에서 확정된 결정이 없습니다."
              compact
            />
          )}
        </Section>

        {/* 논의 중 */}
        <Section icon={MessageCircle} title="논의 중" color="bg-brand-yellow/15 text-brand-yellow" count={summary.discussions?.length}>
          {summary.discussions?.length ? (
            <ul className="space-y-3">
              {summary.discussions.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <MessageCircle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-txt-primary">{d.title}</p>
                    {d.detail && <p className="text-xs text-txt-secondary mt-0.5">{d.detail}</p>}
                    <SourceLink meetingId={id} item={d} messages={messages} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={MessageCircle}
              title="논의 중인 항목이 없어요"
              description="아직 결론 나지 않은 주제가 없습니다."
              compact
            />
          )}
        </Section>

        {/* 보류 */}
        <Section
          icon={PauseCircle}
          title="보류"
          color="bg-txt-secondary/15 text-txt-secondary"
          count={summary.deferred?.length}
          defaultOpen={!!summary.deferred?.length}
        >
          {summary.deferred?.length ? (
            <ul className="space-y-3">
              {summary.deferred.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <PauseCircle size={14} className="text-txt-muted mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-txt-primary">{d.title}</p>
                    {d.reason && <p className="text-xs text-txt-muted mt-0.5">{d.reason}</p>}
                    <SourceLink meetingId={id} item={d} messages={messages} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={PauseCircle}
              title="보류 항목이 없어요"
              description="다음으로 미룬 주제가 없습니다."
              compact
            />
          )}
        </Section>

        {/* 후속 태스크 */}
        <Section icon={ListTodo} title="후속 태스크" color="bg-brand-purple/15 text-brand-purple" count={summary.action_items?.length}>
          {summary.action_items?.length ? (
            <ul className="space-y-2.5">
              {summary.action_items.map((a, i) => {
                const pri = getPriorityInfo(a.priority);
                return (
                  <li key={i} className="flex items-start gap-2.5 p-2.5 rounded-md bg-bg-tertiary/40 border border-border-subtle">
                    <div className="w-4 h-4 rounded border-2 border-border-default mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-txt-primary">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {a.assignee_hint && (
                          <span className="text-[11px] text-txt-secondary">{a.assignee_hint}</span>
                        )}
                        {a.due_hint && (
                          <span className="text-[10px] text-txt-muted">{a.due_hint}</span>
                        )}
                        <span className={`text-[10px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${pri.bg} ${pri.tone} ${pri.border}`}>
                          {pri.label}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ListTodo}
              title="후속 태스크가 없어요"
              description="이번 회의에서 추출된 할 일이 없습니다."
              compact
            />
          )}
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
        {messages && messages.length >= 2 && (
          <button
            onClick={handleGenerateSummary}
            disabled={generating}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary hover:text-txt-primary hover:border-border-hover transition-colors disabled:opacity-50"
            title="대화 기록을 다시 분석해 요약을 새로 생성합니다"
          >
            {generating ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {generating ? '재생성 중...' : '요약 재생성'}
          </button>
        )}

        {/* 관리자 전용: 회의 삭제 — 재생성 버튼 옆 */}
        {isAdmin && (
          <button
            onClick={handleDeleteMeeting}
            disabled={deleting}
            className={`${messages && messages.length >= 2 ? '' : 'ml-auto'} flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-status-error/10 border border-status-error/25 text-status-error hover:bg-status-error/15 transition-colors disabled:opacity-50`}
            title="회의를 완전히 삭제합니다 (관리자 전용)"
          >
            {deleting ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? '삭제 중...' : '회의 삭제'}
          </button>
        )}
      </div>
    </div>
  );
}
