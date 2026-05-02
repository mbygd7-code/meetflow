// 알림 1개 카드 — 좌측 priority 점 + 아이콘, 본문, AI 직원 dot, 시간, 액션 버튼
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, Bell } from 'lucide-react';
import { NOTIFICATION_TYPES, PRIORITY_STYLE, relativeTime } from '@/lib/notificationConstants';
import { AI_EMPLOYEE_MAP } from '@/lib/constants';
import { useNotificationStore } from '@/stores/notificationStore';

export default function NotificationItem({ notification }) {
  const navigate = useNavigate();
  const { markRead, remove } = useNotificationStore();
  const meta = NOTIFICATION_TYPES[notification.type] || { label: '알림', icon: Bell, category: 'system' };
  const Icon = meta.icon;
  const priorityStyle = PRIORITY_STYLE[notification.priority] || PRIORITY_STYLE.normal;
  const isUnread = !notification.read_at;
  const aiSpec = notification.ai_specialist ? AI_EMPLOYEE_MAP[notification.ai_specialist] : null;

  const handleClick = () => {
    if (isUnread) markRead(notification.id);
    if (notification.action_url) navigate(notification.action_url);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    remove(notification.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-[10px] border transition-colors group
        ${isUnread
          ? 'bg-bg-tertiary border-border-default hover:border-brand-purple/40'
          : 'bg-bg-secondary border-border-subtle hover:border-border-default opacity-80 hover:opacity-100'
        }`}
    >
      {/* 좌측: priority dot + 아이콘 */}
      <div className="relative shrink-0 pt-0.5">
        <div className={`w-9 h-9 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center ${priorityStyle.text}`}>
          <Icon size={16} strokeWidth={2.2} />
        </div>
        {isUnread && (
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${priorityStyle.dot} ring-2 ring-bg-primary`} />
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${priorityStyle.text}`}>
            {meta.label}
          </span>
          {aiSpec && (
            <span className="inline-flex items-center gap-1 text-[10px] text-txt-secondary">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: aiSpec.color }} />
              {aiSpec.name}
            </span>
          )}
          <span className="text-[10px] text-txt-muted ml-auto shrink-0">
            {relativeTime(notification.created_at)}
          </span>
        </div>
        <p className={`text-sm font-medium truncate ${isUnread ? 'text-txt-primary' : 'text-txt-secondary'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-txt-secondary truncate mt-0.5">
            {notification.body}
          </p>
        )}
      </div>

      {/* 우측: 액션 버튼 */}
      <div className="flex items-center gap-1 shrink-0 self-center">
        {notification.action_url && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-txt-secondary group-hover:text-brand-purple group-hover:bg-brand-purple/10 transition-colors">
            이동
            <ChevronRight size={12} />
          </span>
        )}
        <span
          role="button"
          tabIndex={-1}
          onClick={handleRemove}
          className="p-1.5 rounded-md text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-colors opacity-0 group-hover:opacity-100"
          title="삭제"
        >
          <X size={14} />
        </span>
      </div>
    </button>
  );
}
