import { useMemo, useState, useEffect } from 'react';
import { useParams, Link, useOutletContext } from 'react-router-dom';
import { FileText, Loader2, Sparkles, Search, X, AlertCircle, Trash2 } from 'lucide-react';
import { Card, Badge, SectionPanel } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useMeetingStore } from '@/stores/meetingStore';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { formatDate } from '@/utils/formatters';
import { supabase } from '@/lib/supabase';
import MeetingSummary from '@/components/summary/MeetingSummary';
import MeetingFeedback from '@/components/summary/MeetingFeedback';
import MeetingScoreBadge from '@/components/summary/MeetingScoreBadge';
import { computeMeetingScore } from '@/utils/meetingScoreUtils';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 기간 필터 옵션 — 기준 시각 대비 N일 이내
const RANGE_OPTIONS = [
  { id: 'day', label: '오늘', days: 1 },
  { id: 'week', label: '이번 주', days: 7 },
  { id: 'month', label: '이번 달', days: 30 },
  { id: 'all', label: '전체', days: null },
];

function isWithinRange(dateStr, days) {
  if (!dateStr) return false;
  if (days == null) return true;
  const now = Date.now();
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  return now - t <= days * 24 * 60 * 60 * 1000 && t <= now;
}

function GeneratingSummaryCard({ meeting }) {
  return (
    <Card className="border-brand-purple/40 bg-brand-purple/[0.06] relative overflow-hidden">
      {/* 진행 중 글로우 라인 */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-brand-purple to-transparent animate-pulse" />
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-md bg-brand-purple/15 flex items-center justify-center shrink-0">
            <Loader2 size={18} className="text-brand-purple animate-spin" strokeWidth={2.4} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-base font-semibold text-txt-primary truncate">
                {meeting?.title || '회의'}
              </h3>
              <Badge variant="purple" className="!text-[10px] inline-flex items-center gap-1">
                <Sparkles size={10} strokeWidth={2.4} /> AI 작성 중
              </Badge>
            </div>
            <p className="text-xs text-txt-secondary">
              대화 기록을 분석해 요약·결정·후속 태스크를 추출하고 있습니다. 잠시만 기다려주세요.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SummaryList() {
  const { meetings } = useMeeting();
  const { pageTitle } = useOutletContext() || {};
  const summaryGeneratingId = useMeetingStore((s) => s.summaryGeneratingId);
  const [range, setRange] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // 회의 요약 데이터 맵 (meeting_id → summary_data) — 카드 점수 계산용
  const [summariesMap, setSummariesMap] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const isAdmin = useAuthStore((s) => s.isAdmin?.() || false);
  const addToast = useToastStore((s) => s.addToast);

  // 관리자 전용: 회의 삭제
  const handleDeleteMeeting = async (meeting) => {
    const confirmed = window.confirm(
      `"${meeting.title}" 회의를 완전히 삭제하시겠습니까?\n\n` +
      `- 메시지, 어젠다, 요약, 태스크, 리액션이 모두 제거됩니다.\n` +
      `- 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;
    setDeletingId(meeting.id);
    try {
      // FK CASCADE가 걸려있어 meetings만 삭제해도 자식들 정리됨 (migration 001~024 확인)
      // 안전하게 자식 테이블 선 정리 (FK 설정이 누락된 테이블 대비)
      await supabase.from('meeting_summaries').delete().eq('meeting_id', meeting.id);
      await supabase.from('meeting_reactions').delete().eq('meeting_id', meeting.id);
      await supabase.from('messages').delete().eq('meeting_id', meeting.id);
      await supabase.from('agendas').delete().eq('meeting_id', meeting.id);
      const { error } = await supabase.from('meetings').delete().eq('id', meeting.id);
      if (error) throw error;
      // 로컬 store에서도 즉시 제거 (Realtime으로도 반영되지만 즉각성을 위해)
      useMeetingStore.setState((s) => ({
        meetings: s.meetings.filter((m) => m.id !== meeting.id),
      }));
      addToast?.('회의를 삭제했습니다', 'success', 2500);
    } catch (err) {
      console.error('[deleteMeeting]', err);
      const msg = err?.code === '42501' || /policy/i.test(err?.message || '')
        ? '삭제 권한이 없습니다. (migration 037 적용 필요)'
        : `삭제 실패: ${err?.message || ''}`;
      addToast?.(msg, 'error', 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const generatingMeeting = summaryGeneratingId
    ? meetings.find((m) => m.id === summaryGeneratingId)
    : null;

  // 완료된 회의 전체 (필터 적용 전) — 카운트 합산/빈 상태 판단에 사용
  // - 메시지 0건인 빈 회의 숨김 (회의록 오염 방지)
  // - 사용자가 "요약 취소"로 종료한 회의(summary_skipped=true) 숨김
  const allCompleted = useMemo(
    () =>
      meetings.filter(
        (m) =>
          m.status === 'completed' &&
          m.id !== summaryGeneratingId &&
          (m.message_count ?? 0) > 0 &&
          !m.summary_skipped
      ),
    [meetings, summaryGeneratingId]
  );

  // 기간 필터 + 검색 필터 적용
  const filtered = useMemo(() => {
    const rangeCfg = RANGE_OPTIONS.find((r) => r.id === range);
    const days = rangeCfg?.days;
    let list = allCompleted.filter((m) => {
      const key = m.ended_at || m.started_at || m.created_at;
      return isWithinRange(key, days);
    });
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.title?.toLowerCase().includes(q));
    }
    // 최신순 정렬
    return [...list].sort((a, b) => {
      const ta = new Date(a.ended_at || a.started_at || a.created_at).getTime();
      const tb = new Date(b.ended_at || b.started_at || b.created_at).getTime();
      return tb - ta;
    });
  }, [allCompleted, range, searchQuery]);

  // 완료된 회의들의 요약 배치 로드 (점수 계산용)
  // 주의: meeting_summaries는 decisions/discussions/deferred/action_items가 top-level 컬럼
  //       (summary_data 같은 단일 JSONB 컬럼이 아님 — migration 002)
  useEffect(() => {
    if (!SUPABASE_ENABLED || allCompleted.length === 0) return;
    const realIds = allCompleted
      .map((m) => m.id)
      .filter((id) => UUID_RE.test(id));
    if (realIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('meeting_summaries')
          .select('meeting_id, decisions, discussions, deferred, action_items, milo_insights')
          .in('meeting_id', realIds);
        if (error) {
          console.warn('[SummaryList] batch load error:', error);
          return;
        }
        if (cancelled) return;
        const map = {};
        for (const row of data || []) {
          // row 전체를 summary 객체로 저장 → computeMeetingScore가 바로 접근 가능
          map[row.meeting_id] = row;
        }
        setSummariesMap(map);
      } catch (err) {
        console.warn('[SummaryList] summaries batch load failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [allCompleted]);

  // 각 기간별 카운트 (탭에 숫자 표시용)
  const rangeCounts = useMemo(() => {
    const counts = {};
    for (const r of RANGE_OPTIONS) {
      counts[r.id] = allCompleted.filter((m) => {
        const key = m.ended_at || m.started_at || m.created_at;
        return isWithinRange(key, r.days);
      }).length;
    }
    return counts;
  }, [allCompleted]);

  return (
    <div className="p-3 md:p-4 lg:p-4 max-w-5xl space-y-4 md:space-y-6 bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3">
      <div>
        {pageTitle && (
          <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
        )}
        <p className="text-sm text-txt-secondary">
          종료된 회의의 AI 요약을 확인하세요 · 총 <span className="text-txt-primary font-semibold">{allCompleted.length}</span>건
        </p>
      </div>

      {/* 작성 중 카드 — 최상단 고정 */}
      {summaryGeneratingId && (
        <GeneratingSummaryCard meeting={generatingMeeting} />
      )}

      <SectionPanel flush>
        {/* 탭(기간 필터) + 검색 */}
        <div className="flex items-center justify-between px-4 lg:px-6 pt-4 border-b border-border-divider">
          <div className="flex gap-1 flex-wrap">
            {RANGE_OPTIONS.map((r) => {
              const active = range === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'text-txt-primary' : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {r.label}
                  <span className="ml-1.5 text-xs text-txt-muted">{rangeCounts[r.id] || 0}</span>
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 검색 */}
          <div className="flex items-center gap-2 pb-2">
            {searchOpen ? (
              <div className="flex items-center gap-1 bg-bg-tertiary rounded-md px-3 py-1.5 border border-border-subtle focus-within:border-brand-purple/50">
                <Search size={14} className="text-txt-muted shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="회의록 검색..."
                  className="bg-transparent text-sm text-txt-primary placeholder:text-txt-muted outline-none w-32 lg:w-48"
                />
                <button
                  onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                  className="text-txt-muted hover:text-txt-primary"
                  title="검색 닫기"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
                title="검색"
              >
                <Search size={16} />
              </button>
            )}
          </div>
        </div>

        {/* 리스트 */}
        <div className="p-4 lg:p-6">
          {allCompleted.length === 0 && !summaryGeneratingId ? (
            <div className="text-center py-16">
              <FileText size={28} className="mx-auto text-txt-muted mb-3" />
              <p className="text-sm text-txt-secondary">아직 완료된 회의가 없습니다.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-txt-muted">
              {searchQuery
                ? `"${searchQuery}" 에 해당하는 회의록이 없습니다.`
                : '이 기간에 완료된 회의록이 없습니다.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((m) => {
                const summary = summariesMap[m.id];
                const failed = m.summary_failed === true && !summary;
                // 점수 계산 — summary가 로드된 경우에만 (없으면 뱃지 숨김)
                // 리스트 뷰이므로 messages를 비워 전달 (score 유틸이 agenda.status로 대체 판정)
                let scoreData = null;
                if (summary) {
                  try {
                    scoreData = computeMeetingScore({
                      meeting: m,
                      summary,
                      messages: [],
                      stats: {
                        participants: Array.from({ length: m.participant_count ?? m.participants?.length ?? 0 }),
                        total: m.message_count ?? 0,
                        durationMin: (m.started_at && m.ended_at)
                          ? Math.max(0, Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000))
                          : 0,
                      },
                    });
                  } catch {}
                }
                return (
                  <Link key={m.id} to={`/summaries/${m.id}`}>
                    <Card className="hover:border-border-hover-strong !bg-bg-tertiary">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-txt-primary mb-1 truncate">
                            {m.title}
                          </h3>
                          <p className="text-xs text-txt-secondary">
                            {formatDate(m.ended_at || m.started_at, 'yyyy.MM.dd HH:mm')} ·
                            어젠다 {m.agendas?.length || 0}개 ·
                            참여 {m.participant_count ?? m.participants?.length ?? 0}명
                            {typeof m.message_count === 'number' && m.message_count > 0 && (
                              <> · 메시지 {m.message_count}건</>
                            )}
                          </p>
                        </div>
                        {/* 평가 + 피드백 — 클릭 시 카드 네비 방지 */}
                        <div
                          className="flex items-center gap-2 shrink-0"
                          onClick={(e) => {
                            // 내부 인터랙티브(버튼/드롭다운)는 Link 네비 차단
                            if (e.target.closest('button')) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                        >
                          <MeetingFeedback meetingId={m.id} compact />
                          {scoreData && <MeetingScoreBadge score={scoreData} compact />}
                          {failed && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-status-error/10 text-status-error border border-status-error/25"
                              title="AI 요약 생성 실패 — 상세 페이지에서 다시 시도해보세요"
                            >
                              <AlertCircle size={10} strokeWidth={2.6} />
                              요약 실패
                            </span>
                          )}

                          {/* 관리자 전용 삭제 버튼 */}
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteMeeting(m);
                              }}
                              disabled={deletingId === m.id}
                              className="p-1.5 text-txt-muted hover:text-status-error hover:bg-status-error/10 rounded-md transition-colors disabled:opacity-50"
                              title="회의 삭제 (관리자 전용)"
                            >
                              {deletingId === m.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
}

export default function SummariesPage() {
  const { id } = useParams();
  return id ? <MeetingSummary /> : <SummaryList />;
}
