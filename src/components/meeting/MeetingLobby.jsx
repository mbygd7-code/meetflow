import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import MeetingCard from './MeetingCard';
import CreateMeetingModal from './CreateMeetingModal';

const TABS = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '진행 중' },
  { id: 'scheduled', label: '예정' },
  { id: 'completed', label: '완료' },
];

export default function MeetingLobby() {
  const [tab, setTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const { meetings } = useMeeting();

  const filtered = meetings.filter((m) => tab === 'all' || m.status === tab);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-medium text-white">회의</h1>
          <p className="text-sm text-txt-secondary mt-0.5">
            팀과 함께 회의를 진행하거나 새 회의를 만드세요
          </p>
        </div>
        <Button
          variant="gradient"
          icon={Plus}
          size="md"
          onClick={() => setModalOpen(true)}
        >
          새 회의
        </Button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.06]">
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
                ${active ? 'text-white' : 'text-txt-secondary hover:text-white'}
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
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-txt-muted">
          <p className="text-sm">해당하는 회의가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}

      <CreateMeetingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
