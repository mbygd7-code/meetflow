import { useMemo } from 'react';
import { Search, Bell, Sun, Moon, Hand, Calendar, ClipboardList, Sparkles, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { useSidebar } from './Layout';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

function MarqueeTicker({ segments }) {
  const content = segments.map((seg, i) => (
    <span key={i} className="inline-flex items-center leading-none">
      {i > 0 && <span className="inline-block w-px mx-8 h-4 bg-border-subtle" />}
      <span className="text-txt-muted mr-1.5 flex items-center">{seg.icon}</span>
      <span>{seg.text}</span>
    </span>
  ));

  return (
    <div className="relative w-full overflow-hidden rounded-[6px] bg-[var(--ticker-bg)] border border-border-subtle h-10 flex items-center">
      <div className="absolute left-0 top-0 bottom-0 w-12 md:w-20 z-10 pointer-events-none rounded-l-[6px]" style={{ background: `linear-gradient(to right, var(--ticker-fade), transparent)` }} />
      <div className="absolute right-0 top-0 bottom-0 w-12 md:w-20 z-10 pointer-events-none rounded-r-[6px]" style={{ background: `linear-gradient(to left, var(--ticker-fade), transparent)` }} />

      <div className="marquee-scroll whitespace-nowrap text-sm md:text-base font-medium text-txt-primary px-4 flex items-center h-full">
        <span className="inline-flex items-center pr-[120px]">{content}</span>
        <span className="inline-flex items-center pr-[120px]">{content}</span>
      </div>

      <style>{`
        .marquee-scroll {
          display: inline-flex;
          align-items: center;
          animation: marquee 40s linear infinite;
        }
        .marquee-scroll:hover {
          animation-play-state: paused;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

export default function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();
  const { setSidebarOpen } = useSidebar();

  const tickerSegments = useMemo(() => {
    const name = user?.name || '사용자';
    const today = format(new Date(), 'M월 d일 EEEE', { locale: ko });

    const scheduledMeetings = meetings.filter(
      (m) => m.status === 'scheduled' || m.status === 'active'
    );
    const meetingNames = scheduledMeetings.slice(0, 3).map((m) => m.title);
    const meetingPart =
      meetingNames.length > 0
        ? `오늘은 "${meetingNames.join('", "')}" 회의가 예정되어 있습니다.`
        : '오늘 예정된 회의는 없습니다.';

    const pendingTasks = tasks.filter((t) => t.status !== 'done');
    const urgentTasks = pendingTasks.filter((t) => t.priority === 'urgent');
    const taskPart =
      urgentTasks.length > 0
        ? `긴급 태스크 ${urgentTasks.length}건을 포함해 총 ${pendingTasks.length}건의 태스크가 진행 중입니다. 확인 부탁드립니다!`
        : pendingTasks.length > 0
          ? `현재 ${pendingTasks.length}건의 태스크가 진행 중입니다.`
          : '모든 태스크가 완료되었습니다!';

    return [
      { icon: <Hand size={15} />, text: `안녕하세요, ${name}님! ${today}, 오늘도 화이팅입니다` },
      { icon: <Calendar size={15} />, text: meetingPart },
      { icon: <ClipboardList size={15} />, text: taskPart },
    ];
  }, [user, meetings, tasks]);

  return (
    <header className="h-14 md:h-16 shrink-0 flex items-center bg-transparent pt-2 px-2 md:px-0 gap-2 md:gap-0">
      {/* 모바일 햄버거 */}
      <button
        className="md:hidden p-2 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors shrink-0"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu size={22} />
      </button>

      {/* 로고 — 데스크톱만 (사이드바 w-48과 동일) */}
      <div className="hidden md:flex items-center gap-3 shrink-0 w-48 px-3">
        <div className="w-10 h-10 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center">
          <Sparkles size={20} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight text-txt-primary">
          MeetFlow
        </span>
      </div>

      {/* 모바일 로고 */}
      <div className="flex md:hidden items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center">
          <Sparkles size={16} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="text-base font-bold tracking-tight text-txt-primary">MeetFlow</span>
      </div>

      {/* 티커 + 액션 — 대시보드 레이아웃과 너비 동기화 */}
      <div className="flex items-center gap-2 md:gap-3 p-1 md:p-2 lg:p-4 mr-1 md:mr-2 lg:mr-3 flex-1 min-w-0">
        {/* 티커 — 모바일에서 숨김, flex-1은 대시보드 메인 콘텐츠와 동일 */}
        <div className="hidden md:block flex-1 min-w-0 overflow-hidden">
          <MarqueeTicker segments={tickerSegments} />
        </div>

        {/* 모바일: 빈 공간 채우기 */}
        <div className="flex-1 md:hidden" />

        {/* 우측 액션 — lg에서 My Tasks(300px)와 동일 너비 */}
        <div className="flex items-center gap-1 md:gap-1.5 shrink-0 lg:w-[300px] lg:justify-end">
          <button className="hidden md:block p-2 rounded-full text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors">
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
          <div className="hidden md:block ml-1.5 pl-1.5 border-l border-border-divider">
            <Avatar name={user?.name || 'U'} size="sm" />
          </div>
        </div>
      </div>
    </header>
  );
}
