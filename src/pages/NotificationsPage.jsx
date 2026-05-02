// 알림 페이지 — Bell 아이콘 클릭 진입지
// 좌측 카테고리 필터 + 메인 시간순 그룹 리스트 + 빈 상태
import { useEffect, useMemo } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotificationStore } from '@/stores/notificationStore';
import {
  filterByCategory,
  groupByTime,
  GROUP_LABELS,
} from '@/lib/notificationConstants';
import NotificationFilters from '@/components/notifications/NotificationFilters';
import NotificationItem from '@/components/notifications/NotificationItem';
import EmptyState from '@/components/ui/EmptyState';

export default function NotificationsPage() {
  const { notifications, filter, init, markAllRead, getUnreadCount } = useNotificationStore();

  useEffect(() => {
    init();
  }, [init]);

  const filtered = useMemo(
    () => filterByCategory(notifications, filter),
    [notifications, filter]
  );
  const groups = useMemo(() => groupByTime(filtered), [filtered]);
  const unread = getUnreadCount();
  const isEmpty = filtered.length === 0;

  return (
    <div className="px-4 md:px-6 lg:px-8 pt-4 pb-12 max-w-[1200px] mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-txt-primary flex items-center gap-2">
            <Bell size={20} className="text-brand-purple" />
            알림
            {unread > 0 && (
              <span className="text-xs font-semibold text-brand-purple bg-brand-purple/10 px-2 py-0.5 rounded-full">
                {unread > 99 ? '99+' : unread}건
              </span>
            )}
          </h1>
          <p className="text-xs text-txt-secondary mt-0.5">
            회의·태스크·AI 인사이트 등 행동이 필요한 알림이 모입니다
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
          >
            <CheckCheck size={14} />
            모두 읽음
          </button>
        )}
      </div>

      {/* 본문 — 좌측 필터 + 메인 리스트 */}
      <div className="flex flex-col lg:flex-row gap-6">
        <NotificationFilters />

        <main className="flex-1 min-w-0">
          {isEmpty ? (
            <EmptyState
              icon={Bell}
              title="알림이 없어요"
              description={
                filter === 'all'
                  ? '진행 중인 회의·태스크는 마이보드에서 확인할 수 있어요.'
                  : '이 카테고리에는 아직 알림이 없습니다.'
              }
              actions={filter === 'all' ? [{ label: '마이보드로', to: '/', variant: 'primary' }] : []}
            />
          ) : (
            <div className="space-y-6">
              {Object.entries(groups).map(([key, items]) => {
                if (items.length === 0) return null;
                return (
                  <section key={key}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted mb-2 px-1">
                      {GROUP_LABELS[key]} · {items.length}
                    </p>
                    <div className="space-y-2">
                      {items.map((n) => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
