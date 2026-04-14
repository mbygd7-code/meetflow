import { useMemo, useState } from 'react';
import { Search, Bell, Sun, Moon, Hand, Calendar, ClipboardList, Sparkles, Menu, Pencil, X, Check, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Avatar } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useNavigate } from 'react-router-dom';
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
      <div className="absolute left-0 top-0 bottom-0 w-16 md:w-28 z-10 pointer-events-none rounded-l-[6px]" style={{ background: `linear-gradient(to right, var(--ticker-fade) 0%, var(--ticker-fade) 20%, transparent 100%)` }} />
      <div className="absolute right-0 top-0 bottom-0 w-16 md:w-28 z-10 pointer-events-none rounded-r-[6px]" style={{ background: `linear-gradient(to left, var(--ticker-fade) 0%, var(--ticker-fade) 20%, transparent 100%)` }} />

      <div className="marquee-scroll whitespace-nowrap text-sm md:text-base font-medium text-txt-primary px-4 flex items-center h-full">
        <span className="inline-flex items-center pr-[120px]">{content}</span>
        <span className="inline-flex items-center pr-[120px]">{content}</span>
      </div>
    </div>
  );
}

const CUSTOM_TICKER_KEY = 'meetflow-custom-ticker';
function loadCustomTicker() {
  try {
    const data = JSON.parse(localStorage.getItem(CUSTOM_TICKER_KEY) || '{}');
    // 하위 호환: 배열이면 새 형식으로 변환
    if (Array.isArray(data)) return { showGreeting: true, messages: data };
    return { showGreeting: data.showGreeting ?? true, messages: data.messages || [] };
  } catch { return { showGreeting: true, messages: [] }; }
}
function saveCustomTicker(data) {
  localStorage.setItem(CUSTOM_TICKER_KEY, JSON.stringify(data));
}

export default function TopBar() {
  const { pathname } = useLocation();
  const { user, isAdmin } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const { meetings, activeMeetingId } = useMeetingStore();
  const navigate = useNavigate();
  const activeMeeting = activeMeetingId ? meetings.find((m) => m.id === activeMeetingId) : null;
  const showActiveMeetingBar = activeMeeting?.status === 'active' && !pathname.startsWith('/meetings/');
  const { tasks } = useTaskStore();
  const { setSidebarOpen } = useSidebar();
  const [editOpen, setEditOpen] = useState(false);
  const [editMessages, setEditMessages] = useState([]);
  const [editShowGreeting, setEditShowGreeting] = useState(true);

  const customTicker = useMemo(() => loadCustomTicker(), [editOpen]);

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

    // 기본 자동 생성 메시지
    const autoSegments = [
      { icon: <Hand size={15} />, text: `안녕하세요, ${name}님! ${today}, 오늘도 화이팅입니다` },
      { icon: <Calendar size={15} />, text: meetingPart },
      { icon: <ClipboardList size={15} />, text: taskPart },
    ];

    // 커스텀 메시지
    const customSegments = customTicker.messages
      .filter((m) => m.trim())
      .map((msg) => ({ icon: <Sparkles size={15} />, text: msg }));

    if (customSegments.length === 0) return autoSegments;
    if (customTicker.showGreeting) return [...autoSegments, ...customSegments];
    return customSegments;
  }, [user, meetings, tasks, customTicker]);

  const handleOpenEdit = () => {
    setEditMessages(customTicker.messages.length > 0 ? [...customTicker.messages] : ['']);
    setEditShowGreeting(customTicker.showGreeting);
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    const cleaned = editMessages.filter((m) => m.trim());
    saveCustomTicker({ showGreeting: editShowGreeting, messages: cleaned });
    setEditOpen(false);
  };

  const handleResetEdit = () => {
    saveCustomTicker({ showGreeting: true, messages: [] });
    setEditOpen(false);
  };

  return (
    <header className="relative z-30 h-14 md:h-16 shrink-0 flex items-center bg-transparent pt-2 px-2 md:px-0 gap-2 md:gap-0 touch-none">
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
        {/* 티커 또는 활성 회의 바 */}
        <div className="hidden md:flex flex-1 min-w-0 overflow-hidden items-center gap-1.5">
          {showActiveMeetingBar ? (
            <button
              onClick={() => navigate(`/meetings/${activeMeetingId}`)}
              className="flex-1 min-w-0 flex items-center gap-3 rounded-[6px] bg-status-error/10 border border-status-error/30 h-10 px-4 hover:bg-status-error/15 transition-colors cursor-pointer"
            >
              <span className="w-3 h-3 rounded-full bg-status-error pulse-dot shrink-0" />
              <span className="text-sm font-medium text-txt-primary truncate">{activeMeeting.title}</span>
              <span className="text-xs text-status-error font-semibold shrink-0">진행 중</span>
            </button>
          ) : (
            <>
              <div className="flex-1 min-w-0 overflow-hidden">
                <MarqueeTicker segments={tickerSegments} />
              </div>
              {isAdmin() && (
                <button
                  onClick={handleOpenEdit}
                  className="p-1.5 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors shrink-0"
                  title="티커 메시지 편집"
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
        </div>

        {/* 모바일: 활성 회의 바 또는 빈 공간 */}
        {showActiveMeetingBar ? (
          <button
            onClick={() => navigate(`/meetings/${activeMeetingId}`)}
            className="flex-1 md:hidden flex items-center gap-2 rounded-md bg-status-error/10 border border-status-error/30 h-9 px-3"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-status-error pulse-dot shrink-0" />
            <span className="text-xs font-medium text-txt-primary truncate">{activeMeeting.title}</span>
          </button>
        ) : (
          <div className="flex-1 md:hidden" />
        )}

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

      {/* 티커 편집 모달 (관리자 전용) */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-20 z-[60]" onClick={() => setEditOpen(false)}>
          <div className="bg-[var(--bg-secondary)] border border-border-default rounded-[12px] shadow-lg w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-divider">
              <h3 className="text-base font-semibold text-txt-primary">티커 메시지 편집</h3>
              <button onClick={() => setEditOpen(false)} className="p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-txt-muted">상단 티커에 표시될 메시지를 설정하세요. 비워두면 자동 생성 메시지만 사용됩니다.</p>

              {/* 인사말 토글 */}
              <label className="flex items-center justify-between py-2 px-3 bg-bg-tertiary rounded-md cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-txt-primary">자동 인사말 포함</p>
                  <p className="text-[11px] text-txt-muted mt-0.5">인사말, 회의 일정, 태스크 현황 메시지를 함께 표시</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditShowGreeting(!editShowGreeting)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                    editShowGreeting ? 'bg-brand-purple' : 'bg-bg-primary border border-border-default'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                    editShowGreeting ? 'left-5' : 'left-0.5'
                  }`} />
                </button>
              </label>

              {/* 커스텀 메시지 입력 */}
              <div>
                <p className="text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-2">커스텀 메시지</p>
              </div>
              {editMessages.map((msg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={msg}
                    onChange={(e) => {
                      const next = [...editMessages];
                      next[i] = e.target.value;
                      setEditMessages(next);
                    }}
                    placeholder={`메시지 ${i + 1}`}
                    className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50"
                  />
                  {editMessages.length > 1 && (
                    <button
                      onClick={() => setEditMessages(editMessages.filter((_, j) => j !== i))}
                      className="p-1.5 text-txt-muted hover:text-status-error transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {editMessages.length < 5 && (
                <button
                  onClick={() => setEditMessages([...editMessages, ''])}
                  className="flex items-center gap-1 text-xs text-brand-purple hover:text-txt-primary transition-colors"
                >
                  <Plus size={13} /> 메시지 추가
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border-divider">
              <button
                onClick={handleResetEdit}
                className="text-xs text-txt-muted hover:text-status-error transition-colors"
              >
                자동 생성으로 초기화
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditOpen(false)} className="px-4 py-2 text-xs font-medium text-txt-secondary border border-border-subtle rounded-md hover:bg-bg-tertiary transition-colors">
                  취소
                </button>
                <button onClick={handleSaveEdit} className="px-4 py-2 text-xs font-semibold text-white bg-brand-purple rounded-md hover:opacity-90 transition-opacity flex items-center gap-1">
                  <Check size={13} /> 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
