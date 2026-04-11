import { useState, createContext, useContext } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, CheckSquare, FileText, Settings } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Toast from '@/components/ui/Toast';

const PAGE_TITLES = {
  '/': '대시보드',
  '/meetings': '회의',
  '/tasks': '태스크',
  '/summaries': '회의록',
  '/settings': '설정',
};

// 모바일 사이드바 토글 컨텍스트
export const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

const MOBILE_TABS = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/summaries', label: '회의록', icon: FileText },
  { to: '/tasks', label: '태스크', icon: CheckSquare },
  { to: '/meetings', label: '회의', icon: MessageSquare },
];

function MobileTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-content)] border-t border-border-divider backdrop-blur-md flex items-center justify-around h-16 px-2"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {MOBILE_TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold transition-colors min-w-[60px] ${
              isActive
                ? 'text-brand-purple'
                : 'text-txt-muted'
            }`
          }
        >
          <Icon size={24} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const hideTopBar = /^\/meetings\/[^/]+$/.test(pathname);

  const pageTitle =
    PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path) && path !== '/')?.[1] ||
    '';

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      <div className="flex flex-col h-screen bg-bg-primary text-txt-primary">
        {!hideTopBar && <TopBar />}
        <div className="flex flex-1 overflow-hidden">
          {/* 데스크톱 사이드바 */}
          <div className="hidden md:block">
            <Sidebar />
          </div>

          {/* 모바일 사이드바 오버레이 */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="absolute left-0 top-0 bottom-0 w-64 animate-slide-in">
                <Sidebar mobile onClose={() => setSidebarOpen(false)} />
              </div>
            </div>
          )}

          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto content-gradient-bg scrollbar-hide pb-[72px] md:pb-0">
              <Outlet context={{ pageTitle }} />
            </div>
          </main>
        </div>

        {/* 모바일 하단 탭 바 */}
        {!hideTopBar && <MobileTabBar />}
        <Toast />
      </div>
    </SidebarContext.Provider>
  );
}
