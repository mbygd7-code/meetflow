import { useParams, Link, useOutletContext } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Card, Badge, SectionPanel } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { formatDate } from '@/utils/formatters';
import MeetingSummary from '@/components/summary/MeetingSummary';

function SummaryList() {
  const { meetings } = useMeeting();
  const { pageTitle } = useOutletContext() || {};
  const completed = meetings.filter((m) => m.status === 'completed');

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

      <SectionPanel>
        {completed.length === 0 ? (
          <div className="text-center py-16">
            <FileText size={28} className="mx-auto text-txt-muted mb-3" />
            <p className="text-sm text-txt-secondary">아직 완료된 회의가 없습니다.</p>
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
