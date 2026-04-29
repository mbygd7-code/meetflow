import { useState, createContext, useContext, useEffect } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, CheckSquare, FileText, Settings, Shield, Loader2, Users } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Toast from '@/components/ui/Toast';
import CommandPalette from '@/components/search/CommandPalette';
import MeetingCancelDialog from '@/components/meeting/MeetingCancelDialog';

const PAGE_TITLES = {
  '/': '마이보드',
  '/meetings': '회의',
  // /tasks 는 /members 로 redirect (App.jsx) — 매핑 제거
  '/members': '멤버·태스크',
  '/summaries': '회의록',
  '/settings': '설정',
  '/admin': '관리자 대시보드',
};

// 모바일 사이드바 토글 컨텍스트
export const SidebarContext = createContext();
export const useSidebar = () => useContext(SidebarContext);

// 명령 팔레트 (Cmd+K) 컨텍스트 — 어디서든 열 수 있게
export const CommandPaletteContext = createContext();
export const useCommandPalette = () => useContext(CommandPaletteContext);

// 회의록은 회의 페이지 상단 버튼으로 진입 — 모바일 탭바에서도 제거
// /tasks → /members 통합
const BASE_MOBILE_TABS = [
  { to: '/', label: '마이보드', icon: LayoutDashboard, end: true },
  { to: '/members', label: '멤버·태스크', icon: Users },
  { to: '/meetings', label: '회의', icon: MessageSquare },
];

function MobileTabBar() {
  const { isAdmin } = useAuthStore();
  const summaryGeneratingId = useMeetingStore((s) => s.summaryGeneratingId);
  const tabs = isAdmin()
    ? [...BASE_MOBILE_TABS, { to: '/admin', label: '관리자', icon: Shield }]
    : BASE_MOBILE_TABS;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-content)] border-t border-border-divider backdrop-blur-md flex items-center justify-around px-2 pt-2 touch-none"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
    >
      {tabs.map(({ to, label, icon: Icon, end }) => {
        const isSummaryGenerating = to === '/meetings' && !!summaryGeneratingId;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold transition-colors min-w-[60px] ${
                isActive
                  ? 'text-brand-purple'
                  : isSummaryGenerating
                    ? 'text-brand-purple'
                    : 'text-txt-muted'
              } ${isSummaryGenerating ? 'summary-generating rounded-lg' : ''}`
            }
          >
            {isSummaryGenerating ? (
              <Loader2 size={22} strokeWidth={1.8} className="animate-spin" />
            ) : (
              <Icon size={22} strokeWidth={1.8} />
            )}
            <span>{isSummaryGenerating ? '회의록 작성중...' : label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 자료 풀사이즈 뷰어 활성 시 LNB 최소화 신호 — 회의방 등에서 set
  const [sidebarForceMinimized, setSidebarForceMinimized] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // 글로벌 단축키 — Cmd/Ctrl+K 로 팔레트 토글, "/" 로도 열기 (input/textarea 외 영역에서만)
  useEffect(() => {
    const onKey = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      // "/" — 입력 필드 밖에서만
      if (e.key === '/' && !paletteOpen) {
        const t = e.target;
        const isEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!isEditable) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen]);

  const hideTopBar = /^\/meetings\/[^/]+$/.test(pathname);

  const pageTitle =
    PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path) && path !== '/')?.[1] ||
    '';

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen, sidebarForceMinimized, setSidebarForceMinimized }}>
      <CommandPaletteContext.Provider value={{ paletteOpen, setPaletteOpen, openPalette: () => setPaletteOpen(true) }}>
      <div
        className="flex flex-col bg-bg-primary text-txt-primary"
        style={{ height: 'var(--app-h, 100dvh)' }}
      >
        {!hideTopBar && <TopBar />}
        <div className="flex flex-1 overflow-hidden">
          {/* 데스크톱 사이드바 */}
          <div className="hidden md:block">
            <Sidebar forceMinimized={sidebarForceMinimized} />
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
            <div className={`flex-1 overflow-y-auto content-gradient-bg scrollbar-hide md:pb-0 ${hideTopBar ? '' : 'pb-[72px]'}`}>
              <Outlet context={{ pageTitle }} />
            </div>
          </main>
        </div>

        {/* 모바일 하단 탭 바 */}
        {!hideTopBar && <MobileTabBar />}
        <Toast />
        <MeetingCancelDialog />
      </div>

      {/* 명령 팔레트 — 어디서든 Cmd+K 또는 "/" 로 열림 */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </CommandPaletteContext.Provider>
    </SidebarContext.Provider>
  );
}
