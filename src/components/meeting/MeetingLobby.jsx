import { useState, useMemo } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Button, SectionPanel } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useToastStore } from '@/stores/toastStore';
import MeetingCard from './MeetingCard';
import CreateMeetingModal from './CreateMeetingModal';

const TABS = [
  { id: 'active', label: '진행 중' },
  { id: 'scheduled', label: '예정' },
  { id: 'completed', label: '완료' },
];

// 월별 그룹 유틸
function groupByMonth(meetings) {
  const groups = {};
  meetings.forEach((m) => {
    const d = new Date(m.ended_at || m.started_at || m.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { label: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, meetings: [] };
    groups[key].meetings.push(m);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, val]) => ({ key, ...val }));
}

export default function MeetingLobby({ pageTitle }) {
  const [tab, setTab] = useState('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completedMonths, setCompletedMonths] = useState(1);
  const { meetings, deleteMeeting } = useMeeting();
  const addToast = useToastStore((s) => s.addToast);

  const filtered = useMemo(() => {
    let list = meetings.filter((m) => m.status === tab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.title?.toLowerCase().includes(q));
    }
    return list;
  }, [meetings, tab, searchQuery]);

  // 완료 탭: 월별 그룹
  const completedGroups = useMemo(() => {
    if (tab !== 'completed') return [];
    return groupByMonth(filtered);
  }, [filtered, tab]);

  const visibleCompletedGroups = completedGroups.slice(0, completedMonths);
  const hasMoreMonths = completedGroups.length > completedMonths;

  // 예정 회의 취소
  const handleCancel = async (e, meeting) => {
    e.stopPropagation();
    if (!confirm(`"${meeting.title}" 회의를 취소하시겠습니까?`)) return;
    await deleteMeeting(meeting.id);
    addToast(`"${meeting.title}" 회의가 취소되었습니다. Slack · Calendar 취소 알림이 전송되었습니다.`, 'success');
  };

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

      {/* 메인 패널 */}
      <SectionPanel flush>
        {/* 탭 + 검색 */}
        <div className="flex items-center justify-between px-6 lg:px-8 pt-5 border-b border-border-divider">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const count = meetings.filter((m) => m.status === t.id).length;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setCompletedMonths(1); setSearchQuery(''); }}
                  className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                    active ? 'text-txt-primary' : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs text-txt-muted">{count}</span>
                  {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple rounded-full" />}
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
                  placeholder="회의 검색..."
                  className="bg-transparent text-sm text-txt-primary placeholder:text-txt-muted outline-none w-32 lg:w-48"
                />
                <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-txt-muted hover:text-txt-primary">
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

        {/* 카드 그리드 */}
        <div className="p-6 lg:p-8">
          {tab === 'completed' ? (
            visibleCompletedGroups.length === 0 ? (
              <div className="text-center py-16 text-txt-muted">
                <p className="text-sm">완료된 회의가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {visibleCompletedGroups.map((group) => (
                  <div key={group.key}>
                    <h3 className="text-sm font-semibold text-txt-secondary mb-4">{group.label}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.meetings.map((m) => (
                        <MeetingCard key={m.id} meeting={m} />
                      ))}
                    </div>
                  </div>
                ))}
                {hasMoreMonths && (
                  <div className="text-center pt-4">
                    <button
                      onClick={() => setCompletedMonths((prev) => prev + 1)}
                      className="text-sm text-brand-purple hover:text-txt-primary font-medium transition-colors"
                    >
                      이전 달 더보기
                    </button>
                  </div>
                )}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-txt-muted">
              <p className="text-sm">해당하는 회의가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  onCancel={tab === 'scheduled' ? (e) => handleCancel(e, m) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </SectionPanel>

      <CreateMeetingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
