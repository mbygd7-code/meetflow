import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  Settings,
  Shield,
  LogOut,
  X,
  Sparkles,
  Users,
} from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { Loader2 } from 'lucide-react';

// 상단 작업 메뉴 — 주 업무 흐름 (마이보드 / 회의 / 멤버·태스크)
// /tasks 는 /members로 통합됨 (멤버 페이지에서 태스크 관리 가능)
function getPrimaryNavItems() {
  return [
    { to: '/', label: '마이보드', icon: LayoutDashboard, end: true },
    { to: '/meetings', label: '회의', icon: MessageSquare },
    { to: '/members', label: '멤버·태스크', icon: Users },
  ];
}

// 하단 시스템 메뉴 — 관리자 · 설정 (낮은 빈도, 유틸리티성)
function getSecondaryNavItems(isAdmin) {
  const items = [];
  if (isAdmin) items.push({ to: '/admin', label: '관리자', icon: Shield });
  items.push({ to: '/settings', label: '설정', icon: Settings });
  return items;
}

export default function Sidebar({ mobile = false, onClose, forceMinimized = false }) {
  const { user, signOut, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const primaryNavItems = getPrimaryNavItems();
  const secondaryNavItems = getSecondaryNavItems(isAdmin());
  const activeMeetingId = useMeetingStore((s) => s.activeMeetingId);
  const summaryGeneratingId = useMeetingStore((s) => s.summaryGeneratingId);
  const isMeetingPage = pathname.startsWith('/meetings/');

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (mobile && onClose) onClose();
  };

  // forceMinimized 시 텍스트 영역 강제 숨김 (호버 확장도 비활성)
  const textVisCls = forceMinimized
    ? 'hidden'
    : 'hidden group-hover/sidebar:inline lg:inline';
  const blockVisCls = forceMinimized
    ? 'hidden'
    : 'hidden group-hover/sidebar:block lg:block';

  // ── 모바일 드로어 (기존 넓은 사이드바) ──
  if (mobile) {
    return (
      <aside className="w-64 h-full flex flex-col p-3 shrink-0" style={{ background: 'var(--sidebar-bg)' }}>
        <div className="flex items-center justify-between px-2 pb-3 mb-2" style={{ borderBottom: '1px solid var(--sidebar-divider)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center">
              <Sparkles size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold" style={{ color: 'var(--sidebar-text)' }}>MeetFlow</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--sidebar-text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1 mt-2">
          {/* 상단 주 메뉴 */}
          {primaryNavItems.map(({ to, label, icon: Icon, end }) => {
            const isMeetingNav = to === '/meetings';
            const isSummaryGenerating = isMeetingNav && !!summaryGeneratingId;
            return (
              <NavLink
                key={to} to={to} end={end} onClick={handleNavClick}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-all duration-200 ${isActive ? 'font-medium' : ''}`}
                style={({ isActive }) => ({ color: isActive ? 'var(--sidebar-text)' : isSummaryGenerating ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)', background: isActive ? 'var(--sidebar-active-bg)' : undefined })}
              >
                {isSummaryGenerating ? (
                  <Loader2 size={18} strokeWidth={2} className="animate-spin text-brand-purple" />
                ) : (
                  <Icon size={18} strokeWidth={2} />
                )}
                <span>{isSummaryGenerating ? '회의록 작성중...' : label}</span>
              </NavLink>
            );
          })}

          {/* 하단 시스템 메뉴 (관리자 · 설정) — flex-1 spacer로 밀어냄 */}
          <div className="flex-1" />
          <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--sidebar-divider)' }}>
            {secondaryNavItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end} onClick={handleNavClick}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-all duration-200 ${isActive ? 'font-medium' : ''}`}
                style={({ isActive }) => ({ color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)', background: isActive ? 'var(--sidebar-active-bg)' : undefined })}
              >
                <Icon size={18} strokeWidth={2} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--sidebar-divider)' }}>
          <div className="flex items-center gap-3 px-2 py-2 rounded-md">
            <Avatar name={user?.name || 'U'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--sidebar-text)' }}>{user?.name || '사용자'}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--sidebar-text-dim)' }}>{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded transition-colors" style={{ color: 'var(--sidebar-text-dim)' }} title="로그아웃">
              <LogOut size={17} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // ── 데스크톱: lg+ 넓은 / md~lg(태블릿) 아이콘 전용, 호버 시 펼쳐짐 ──
  return (
    <aside
      className={`group/sidebar h-full flex flex-col shrink-0 w-[56px] transition-all duration-200 z-30 relative border-r border-border-subtle ${isMeetingPage ? 'pt-0' : 'pt-2'} pb-2 px-2 ${
        forceMinimized
          ? 'hover:w-[56px] lg:w-[56px]'
          : 'hover:w-48 lg:w-48 lg:p-3'
      }`}
      style={{ background: 'var(--sidebar-bg)' }}
    >
      {/* 회의 페이지: TopBar가 숨겨지므로 사이드바 상단에 로고 표시 (모든 데스크톱 너비) */}
      {isMeetingPage && (
        <div
          className="hidden md:flex items-center gap-3 px-1 h-14 shrink-0 border-b border-border-subtle"
          style={{ borderColor: 'var(--sidebar-divider)' }}
        >
          <div className="w-10 h-10 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <span
            className={`text-lg font-bold tracking-tight whitespace-nowrap ${textVisCls}`}
            style={{ color: 'var(--sidebar-text)' }}
          >
            MeetFlow
          </span>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 flex-1 mt-2">
        {/* 상단: 주 메뉴 (마이보드 / 회의 / 태스크) */}
        {primaryNavItems.map(({ to, label, icon: Icon, end }) => {
          const isMeetingNav = to === '/meetings';
          // 회의록 작성중일 때는 /meetings 네비가 "회의록 작성중" 상태를 보여줌.
          // 생성 중에는 활성 회의로 리다이렉트하지 않고 회의 로비로 보냄 (사용자가 로비에서 재입장 결정).
          const isSummaryGenerating = isMeetingNav && !!summaryGeneratingId;
          const hasActiveMeeting = isMeetingNav && activeMeetingId && !isSummaryGenerating;
          const targetTo = hasActiveMeeting ? `/meetings/${activeMeetingId}` : to;

          return (
            <NavLink
              key={to}
              to={targetTo}
              end={end && !hasActiveMeeting}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 lg:px-4 py-2.5 rounded-md text-sm transition-all duration-200 ${
                  isActive ? 'font-medium' : ''
                } ${isSummaryGenerating ? 'summary-generating' : ''}`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--sidebar-text)' : hasActiveMeeting ? 'var(--sidebar-text)' : isSummaryGenerating ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                background: isActive && !isSummaryGenerating ? 'var(--sidebar-active-bg)' : undefined,
              })}
              onMouseEnter={(e) => {
                if (isSummaryGenerating) return;
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!active) {
                  e.currentTarget.style.background = 'var(--sidebar-hover)';
                  e.currentTarget.style.color = 'var(--sidebar-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (isSummaryGenerating) return;
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!active) {
                  e.currentTarget.style.background = '';
                  e.currentTarget.style.color = hasActiveMeeting ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)';
                }
              }}
            >
              <span className={`relative shrink-0 ${hasActiveMeeting ? 'text-status-error' : isSummaryGenerating ? 'text-brand-purple' : ''}`}>
                {isSummaryGenerating ? (
                  <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Icon size={18} strokeWidth={2} />
                )}
                {hasActiveMeeting && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-status-error pulse-dot" />
                )}
              </span>
              <span className={`whitespace-nowrap ${textVisCls}`}>
                {isSummaryGenerating ? '회의록 작성중...' : label}
              </span>
            </NavLink>
          );
        })}

        {/* 중간 spacer — 하단 시스템 메뉴를 밀어냄 */}
        <div className="flex-1" />

        {/* 하단: 시스템 메뉴 (관리자 · 설정) */}
        <div
          className="pt-2 mt-2 flex flex-col gap-0.5"
          style={{ borderTop: '1px solid var(--sidebar-divider)' }}
        >
          {secondaryNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 lg:px-4 py-2.5 rounded-md text-sm transition-all duration-200 ${
                  isActive ? 'font-medium' : ''
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)',
                background: isActive ? 'var(--sidebar-active-bg)' : undefined,
              })}
              onMouseEnter={(e) => {
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!active) {
                  e.currentTarget.style.background = 'var(--sidebar-hover)';
                  e.currentTarget.style.color = 'var(--sidebar-text)';
                }
              }}
              onMouseLeave={(e) => {
                const active = e.currentTarget.getAttribute('aria-current') === 'page';
                if (!active) {
                  e.currentTarget.style.background = '';
                  e.currentTarget.style.color = 'var(--sidebar-text-muted)';
                }
              }}
            >
              <Icon size={18} strokeWidth={2} className="shrink-0" />
              <span className={`whitespace-nowrap ${textVisCls}`}>
                {label}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* 하단 유저 */}
      <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--sidebar-divider)' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar name={user?.name || 'U'} size="sm" />
          <div className={`flex-1 min-w-0 ${blockVisCls}`}>
            <p className="text-sm font-medium truncate whitespace-nowrap" style={{ color: 'var(--sidebar-text)' }}>{user?.name || '사용자'}</p>
            <p className="text-[11px] truncate whitespace-nowrap" style={{ color: 'var(--sidebar-text-dim)' }}>{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className={`p-1.5 rounded transition-colors ${blockVisCls}`}
            style={{ color: 'var(--sidebar-text-dim)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sidebar-text)'; e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sidebar-text-dim)'; e.currentTarget.style.background = ''; }}
            title="로그아웃"
          >
            <LogOut size={17} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </aside>
  );
}
