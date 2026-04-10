import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  FileText,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

const NAV_ITEMS = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/meetings', label: '회의', icon: MessageSquare },
  { to: '/tasks', label: '태스크', icon: CheckSquare },
  { to: '/summaries', label: '회의록', icon: FileText },
  { to: '/settings', label: '설정', icon: Settings },
];

export default function Sidebar() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="w-60 bg-bg-primary border-r border-white/[0.08] flex flex-col p-3 shrink-0">
      {/* 로고 */}
      <div className="flex items-center gap-2.5 px-3 py-4 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-brand shadow-glow flex items-center justify-center">
          <Sparkles size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="text-base font-bold tracking-tight text-white">
          MeetFlow
        </span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-brand-purple/[0.12] text-white font-medium'
                  : 'text-txt-secondary hover:bg-bg-tertiary hover:text-white'
              }`
            }
          >
            <Icon size={18} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 하단 유저 */}
      <div className="border-t border-white/[0.06] pt-3 mt-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <Avatar name={user?.name || 'U'} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.name || '사용자'}
            </p>
            <p className="text-[11px] text-txt-muted truncate">
              {user?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-txt-muted hover:text-white transition-colors p-1.5 rounded hover:bg-bg-tertiary"
            title="로그아웃"
          >
            <LogOut size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </aside>
  );
}
