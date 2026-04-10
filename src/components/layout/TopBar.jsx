import { Search, Bell } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

const PAGE_TITLES = {
  '/': '대시보드',
  '/meetings': '회의',
  '/tasks': '태스크',
  '/summaries': '회의록',
  '/settings': '설정',
};

export default function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuthStore();

  // 경로 접두사 매칭으로 타이틀 결정
  const title =
    PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path) && path !== '/')?.[1] ||
    '대시보드';

  return (
    <header className="h-16 shrink-0 border-b border-white/[0.08] flex items-center justify-between px-6 bg-bg-primary">
      <h2 className="text-[22px] font-medium text-white tracking-tight">
        {title}
      </h2>

      <div className="flex items-center gap-2">
        <button className="p-2 rounded-md text-txt-secondary hover:text-white hover:bg-bg-tertiary transition-colors">
          <Search size={18} strokeWidth={2} />
        </button>
        <button className="relative p-2 rounded-md text-txt-secondary hover:text-white hover:bg-bg-tertiary transition-colors">
          <Bell size={18} strokeWidth={2} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-orange" />
        </button>
        <div className="ml-2">
          <Avatar name={user?.name || 'U'} size="sm" />
        </div>
      </div>
    </header>
  );
}
