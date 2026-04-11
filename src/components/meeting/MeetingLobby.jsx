import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, SectionPanel } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import MeetingCard from './MeetingCard';
import CreateMeetingModal from './CreateMeetingModal';

const TABS = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '진행 중' },
  { id: 'scheduled', label: '예정' },
  { id: 'completed', label: '완료' },
];

export default function MeetingLobby({ pageTitle }) {
  const [tab, setTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const { meetings } = useMeeting();

  const filtered = meetings.filter((m) => tab === 'all' || m.status === tab);

  return (
    <div className="p-3 md:p-4 lg:p-4 max-w-[1400px] space-y-4 md:space-y-6 bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          {pageTitle && (
            <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
          )}
          <p className="text-sm text-txt-secondary">
            팀과 함께 회의를 진행하거나 새 회의를 만드세요
          </p>
        </div>
        <Button variant="gradient" icon={Plus} size="md" onClick={() => setModalOpen(true)}>
          새 회의
        </Button>
      </div>

      {/* 메인 패널: 탭 + 회의 카드 그룹 */}
      <SectionPanel flush>
        {/* 탭 — 패널 상단에 내장 */}
        <div className="flex gap-1 px-6 lg:px-8 pt-5 border-b border-border-divider">
          {TABS.map((t) => {
            const count =
              t.id === 'all'
                ? meetings.length
                : meetings.filter((m) => m.status === t.id).length;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`
                  relative px-4 py-2.5 text-sm font-medium transition-colors
                  ${active ? 'text-txt-primary' : 'text-txt-secondary hover:text-txt-primary'}
                `}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-txt-muted">{count}</span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* 카드 그리드 */}
        <div className="p-6 lg:p-8">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-txt-muted">
              <p className="text-sm">해당하는 회의가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((m) => (
                <MeetingCard key={m.id} meeting={m} />
              ))}
            </div>
          )}
        </div>
      </SectionPanel>

      <CreateMeetingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
