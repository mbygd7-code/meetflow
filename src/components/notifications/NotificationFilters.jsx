// 좌측 필터 사이드 — 카테고리 + 카운트
import { NOTIFICATION_CATEGORIES, NOTIFICATION_TYPES } from '@/lib/notificationConstants';
import { useNotificationStore } from '@/stores/notificationStore';

function categoryCount(notifications, id) {
  if (id === 'all') return notifications.filter((n) => !n.read_at).length;
  if (id === 'urgent') return notifications.filter((n) => !n.read_at && n.priority === 'urgent').length;
  return notifications.filter((n) => {
    if (n.read_at) return false;
    const meta = NOTIFICATION_TYPES[n.type];
    return meta?.category === id;
  }).length;
}

export default function NotificationFilters() {
  const filter = useNotificationStore((s) => s.filter);
  const setFilter = useNotificationStore((s) => s.setFilter);
  const notifications = useNotificationStore((s) => s.notifications);

  return (
    <aside className="w-full lg:w-56 shrink-0 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-txt-muted px-3 mb-2">
        카테고리
      </p>
      {NOTIFICATION_CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const count = categoryCount(notifications, cat.id);
        const active = filter === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => setFilter(cat.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              active
                ? 'bg-brand-purple/10 text-txt-primary'
                : 'text-txt-secondary hover:bg-bg-tertiary hover:text-txt-primary'
            }`}
          >
            <Icon size={15} strokeWidth={2} className={active ? 'text-brand-purple' : ''} />
            <span className="flex-1 text-left font-medium">{cat.label}</span>
            {count > 0 && (
              <span className={`text-[11px] font-semibold rounded-full px-1.5 min-w-[20px] text-center ${
                cat.id === 'urgent'
                  ? 'bg-status-error/15 text-status-error'
                  : active
                    ? 'bg-brand-purple/20 text-brand-purple'
                    : 'bg-bg-tertiary text-txt-secondary'
              }`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
}
