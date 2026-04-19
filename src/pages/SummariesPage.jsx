import { useParams, Link, useOutletContext } from 'react-router-dom';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { Card, Badge, SectionPanel } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useMeetingStore } from '@/stores/meetingStore';
import { formatDate } from '@/utils/formatters';
import MeetingSummary from '@/components/summary/MeetingSummary';

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
  const generatingMeeting = summaryGeneratingId
    ? meetings.find((m) => m.id === summaryGeneratingId)
    : null;
  // 생성 중인 회의는 completed로 이미 전환되었을 수 있으므로 중복 방지
  const completed = meetings
    .filter((m) => m.status === 'completed')
    .filter((m) => m.id !== summaryGeneratingId);

  return (
    <div className="p-3 md:p-4 lg:p-4 max-w-5xl space-y-4 md:space-y-6 bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3">
      <div>
        {pageTitle && (
          <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
        )}
        <p className="text-sm text-txt-secondary">
          종료된 회의의 AI 요약을 확인하세요
        </p>
      </div>

      {/* 작성 중 카드 — 최상단 고정 */}
      {summaryGeneratingId && (
        <GeneratingSummaryCard meeting={generatingMeeting} />
      )}

      <SectionPanel>
        {completed.length === 0 && !summaryGeneratingId ? (
          <div className="text-center py-16">
            <FileText size={28} className="mx-auto text-txt-muted mb-3" />
            <p className="text-sm text-txt-secondary">아직 완료된 회의가 없습니다.</p>
          </div>
        ) : completed.length === 0 ? (
          <div className="text-center py-10 text-xs text-txt-muted">
            이전에 완료된 회의록이 여기에 표시됩니다.
          </div>
        ) : (
          <div className="space-y-3">
            {completed.map((m) => (
              <Link key={m.id} to={`/summaries/${m.id}`}>
                <Card className="hover:border-border-hover-strong !bg-bg-tertiary">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-txt-primary mb-1 truncate">
                        {m.title}
                      </h3>
                      <p className="text-xs text-txt-secondary">
                        {formatDate(m.ended_at || m.started_at, 'yyyy.MM.dd HH:mm')} ·
                        어젠다 {m.agendas?.length || 0}개 · 참여 {m.participants?.length || 0}명
                      </p>
                    </div>
                    <Badge variant="outline">완료</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

export default function SummariesPage() {
  const { id } = useParams();
  return id ? <MeetingSummary /> : <SummaryList />;
}
