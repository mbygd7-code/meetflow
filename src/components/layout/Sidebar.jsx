import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  FileText,
  Settings,
  Shield,
  BarChart3,
  LogOut,
  X,
  Sparkles,
} from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

function getNavItems(isAdmin) {
  const items = [
    { to: '/', label: '대시보드', icon: LayoutDashboard, end: true },
    ...(isAdmin ? [
      { to: '/admin', label: '관리자', icon: Shield },
      { to: '/analytics', label: '팀 분석', icon: BarChart3 },
    ] : []),
    { to: '/meetings', label: '회의', icon: MessageSquare },
    { to: '/tasks', label: '태스크', icon: CheckSquare },
    { to: '/summaries', label: '회의록', icon: FileText },
    { to: '/settings', label: '설정', icon: Settings },
  ];
  return items;
}

export default function Sidebar({ mobile = false, onClose }) {
  const { user, signOut, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const navItems = getNavItems(isAdmin());

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (mobile && onClose) onClose();
  };

  // ── 모바일 드로어 (기존 넓은 사이드바) ──
  if (mobile) {
    return (
      <aside className="w-64 h-full flex flex-col p-3 shrink-0" style={{ background: 'var(--sidebar-bg)' }}>
        <div className="flex items-center justify-between px-2 pb-3 mb-2" style={{ borderBottom: '1px solid var(--sidebar-divider)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center">
              <Sparkles size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-bold" style={{ color: 'var(--sidebar-text)' }}>MeetFlow</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--sidebar-text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1 mt-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} onClick={handleNavClick}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-all duration-200 ${isActive ? 'font-medium' : ''}`}
              style={({ isActive }) => ({ color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-text-muted)', background: isActive ? 'var(--sidebar-active-bg)' : undefined })}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--sidebar-divider)' }}>
          <div className="flex items-center gap-3 px-2 py-2 rounded-md">
            <Avatar name={user?.name || 'U'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--sidebar-text)' }}>{user?.name || '사용자'}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--sidebar-text-dim)' }}>{user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded transition-colors" style={{ color: 'var(--sidebar-text-dim)' }} title="로그아웃">
              <LogOut size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // ── 데스크톱: lg+ 넓은 / md~lg(태블릿) 아이콘 전용, 호버 시 펼쳐짐 ──
  return (
    <aside
      className="group/sidebar h-full flex flex-col p-2 lg:p-3 shrink-0 w-[56px] hover:w-48 lg:w-48 transition-all duration-200 z-30 relative border-r border-border-subtle"
      style={{ background: 'var(--sidebar-bg)' }}
    >
      {/* 서비스 심볼 — 태블릿에서만 표시, 높이를 오른쪽 헤더(py-4)와 일치 */}
      <div className="flex items-center gap-2 px-2 py-4 lg:hidden" style={{ borderBottom: '1px solid var(--sidebar-divider)' }}>
        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 sidebar-symbol">
          <Sparkles size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="hidden group-hover/sidebar:inline lg:hidden text-sm font-bold whitespace-nowrap" style={{ color: 'var(--sidebar-text)' }}>MeetFlow</span>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 mt-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
            <span className="hidden group-hover/sidebar:inline lg:inline whitespace-nowrap">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 하단 유저 */}
      <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--sidebar-divider)' }}>
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar name={user?.name || 'U'} size="sm" />
          <div className="flex-1 min-w-0 hidden group-hover/sidebar:block lg:block">
            <p className="text-sm font-medium truncate whitespace-nowrap" style={{ color: 'var(--sidebar-text)' }}>{user?.name || '사용자'}</p>
            <p className="text-[11px] truncate whitespace-nowrap" style={{ color: 'var(--sidebar-text-dim)' }}>{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded transition-colors hidden group-hover/sidebar:block lg:block"
            style={{ color: 'var(--sidebar-text-dim)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--sidebar-text)'; e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--sidebar-text-dim)'; e.currentTarget.style.background = ''; }}
            title="로그아웃"
          >
            <LogOut size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </aside>
  );
}
