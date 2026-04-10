import { Search, Bell, Sun, Moon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

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
  const { theme, toggleTheme } = useThemeStore();

  const title =
    PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path) && path !== '/')?.[1] ||
    '대시보드';

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-8 bg-transparent">
      <h2 className="text-xl font-semibold text-txt-primary tracking-tight">
        {title}
      </h2>

      <div className="flex items-center gap-1.5">
        <button className="p-2 rounded-full text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors">
          <Search size={17} strokeWidth={2} />
        </button>
        <button className="relative p-2 rounded-full text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors">
          <Bell size={17} strokeWidth={2} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-orange" />
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
          title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {theme === 'dark' ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        </button>
        <div className="ml-1.5 pl-1.5 border-l border-border-divider">
          <Avatar name={user?.name || 'U'} size="sm" />
        </div>
      </div>
    </header>
  );
}
