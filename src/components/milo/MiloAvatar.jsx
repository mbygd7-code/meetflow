import { useState, useRef } from 'react';
import { Avatar } from '@/components/ui';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

/**
 * MiloAvatar — AI 직원 아바타
 * Milo는 그라디언트, 전문가는 고유 색상+이니셜 또는 사진
 *
 * @param {string} employeeId - AI 직원 ID (milo, kotler, froebel, etc.)
 * @param {'sm'|'md'|'lg'} size - 아바타 크기
 */
export default function MiloAvatar({ employeeId = 'milo', size = 'md', showTooltip = false }) {
  // 하위 호환: 'drucker'를 'milo'로 정규화
  const normalizedId = employeeId === 'drucker' ? 'milo' : employeeId;
  const emp = AI_EMPLOYEES.find((e) => e.id === normalizedId);
  const isMilo = !normalizedId || normalizedId === 'milo';

  let avatarEl;

  if (isMilo) {
    avatarEl = <Avatar variant="ai" size={size} label="Mi" />;
  } else if (emp?.avatar) {
    avatarEl = (
      <Avatar
        name={emp.nameKo}
        src={emp.avatar}
        color={emp.color}
        size={size}
      />
    );
  } else {
    const sizeClasses = { sm: 'w-8 h-8 text-[11px]', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' };
    avatarEl = (
      <div
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
        style={{ backgroundColor: emp?.color || '#723CEB' }}
      >
        {emp?.initials || 'AI'}
      </div>
    );
  }

  if (!showTooltip) return avatarEl;

  const displayEmp = isMilo
    ? { nameKo: '밀로', role: '회의 진행 · AI 오케스트라', color: '#723CEB' }
    : emp;

  return <AvatarWithTooltip avatarEl={avatarEl} emp={displayEmp} />;
}

function AvatarWithTooltip({ avatarEl, emp }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const handleEnter = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const tooltipWidth = 220;
      const sidebarWidth = 192; // LNB w-48
      // 좌측 경계: LNB 너비 + 여유(12px) 이상 유지
      const minLeft = sidebarWidth + 12;
      // 우측 경계: 화면 넘지 않게
      const maxLeft = window.innerWidth - tooltipWidth - 12;
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      if (left < minLeft) left = minLeft;
      if (left > maxLeft) left = maxLeft;
      setPos({ top: rect.top - 8, left });
    }
    setShow(true);
  };

  if (!emp) return avatarEl;

  return (
    <>
      <span
        ref={btnRef}
        className="w-10 h-10 inline-flex shrink-0 cursor-pointer rounded-full overflow-hidden self-start"
        onMouseEnter={handleEnter}
        onMouseLeave={() => setShow(false)}
      >
        {avatarEl}
      </span>
      {show && (
        <div
          className="fixed w-[220px] rounded-lg overflow-hidden bg-[#DDD7CE] border border-[#c5bfb5] shadow-lg pointer-events-none z-[9999]"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          {emp.avatar && (
            <div className="w-full h-[140px] overflow-hidden" style={{ backgroundColor: emp.color }}>
              <img src={emp.avatar} alt={emp.nameKo} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-2.5">
            <p className="text-sm font-extrabold text-[#222] mb-0.5">{emp.nameKo}</p>
            <p className="text-xs text-[#333] leading-snug">{emp.role}</p>
            {emp.description && (
              <p className="text-[11px] text-[#555] leading-snug mt-1 break-keep">{emp.description}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
