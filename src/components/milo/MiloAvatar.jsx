import { Avatar } from '@/components/ui';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';

/**
 * MiloAvatar — AI 직원 아바타
 * Milo(드러커)는 그라디언트, 전문가는 고유 색상+이니셜 또는 사진
 *
 * @param {string} employeeId - AI 직원 ID (drucker, kotler, froebel, etc.)
 * @param {'sm'|'md'|'lg'} size - 아바타 크기
 */
export default function MiloAvatar({ employeeId = 'drucker', size = 'md' }) {
  const emp = AI_EMPLOYEES.find((e) => e.id === employeeId);
  const isMilo = !employeeId || employeeId === 'drucker';

  if (isMilo) {
    return <Avatar variant="ai" size={size} label="Mi" />;
  }

  if (emp?.avatar) {
    return (
      <Avatar
        name={emp.nameKo}
        src={emp.avatar}
        color={emp.color}
        size={size}
      />
    );
  }

  const sizeClasses = { sm: 'w-8 h-8 text-[11px]', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' };

  return (
    <div
      className={`${sizeClasses[size] || sizeClasses.md} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: emp?.color || '#723CEB' }}
    >
      {emp?.initials || 'AI'}
    </div>
  );
}
