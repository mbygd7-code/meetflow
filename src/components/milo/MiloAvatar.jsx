import { useState, useRef } from 'react';
import { Avatar } from '@/components/ui';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

/**
 * MiloAvatar — AI 직원 아바타
 * Milo(드러커)는 그라디언트, 전문가는 고유 색상+이니셜 또는 사진
 *
 * @param {string} employeeId - AI 직원 ID (drucker, kotler, froebel, etc.)
 * @param {'sm'|'md'|'lg'} size - 아바타 크기
 */
export default function MiloAvatar({ employeeId = 'drucker', size = 'md', showTooltip = false }) {
  const emp = AI_EMPLOYEES.find((e) => e.id === employeeId);
  const isMilo = !employeeId || employeeId === 'drucker';

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
      setPos({
        top: rect.top - 8,
        left: Math.max(8, rect.left + rect.width / 2 - 90),
      });
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
          className="fixed w-[180px] p-2.5 rounded-lg
            bg-[#DDD7CE] border border-[#c5bfb5] shadow-lg pointer-events-none z-[9999]"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          <p className="text-sm font-extrabold text-[#222] mb-0.5">
            {emp.nameKo}
          </p>
          <p className="text-xs text-[#333] leading-snug">{emp.role}</p>
          {emp.description && (
            <p className="text-[11px] text-[#555] leading-snug mt-1 line-clamp-2">{emp.description}</p>
          )}
        </div>
      )}
    </>
  );
}
