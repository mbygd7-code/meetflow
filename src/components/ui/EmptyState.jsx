// 공통 빈 상태 카드 — 아이콘 + 제목 + 설명 + 액션 버튼
// 마이보드의 "오늘의 초점", "오늘의 일정", "내 태스크" 빈 상태에서 재사용
import { Link } from 'react-router-dom';
import Button from './Button';

/**
 * @param {{
 *   icon?: any,                                          Lucide 아이콘 컴포넌트
 *   title: string,
 *   description?: string,
 *   actions?: Array<{
 *     label: string,
 *     to?: string,                                       내부 라우팅 (Link)
 *     onClick?: () => void,                              외부 핸들러
 *     icon?: any,
 *     variant?: 'primary' | 'gradient' | 'secondary' | 'ghost',
 *   }>,
 *   variant?: 'dashed' | 'solid',                         테두리 스타일 (기본: dashed)
 *   compact?: boolean,                                   사이드바용 컴팩트 버전
 *   className?: string,
 * }} props
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  variant = 'dashed',
  compact = false,
  className = '',
}) {
  const container = compact
    ? 'p-5 space-y-2'
    : 'p-6 space-y-3';
  const border = variant === 'dashed'
    ? 'border border-dashed border-border-default'
    : 'border border-border-subtle';
  const iconSize = compact ? 20 : 28;
  const iconWrapSize = compact ? 'w-10 h-10' : 'w-12 h-12';

  return (
    <div
      className={`
        bg-bg-tertiary rounded-[8px] text-center ${border} ${container} ${className}
      `}
    >
      {Icon && (
        <div className={`${iconWrapSize} mx-auto rounded-full bg-brand-purple/10 flex items-center justify-center`}>
          <Icon size={iconSize} className="text-brand-purple" strokeWidth={2} />
        </div>
      )}
      <div>
        <p className={`font-medium text-txt-primary ${compact ? 'text-sm' : 'text-sm'}`}>
          {title}
        </p>
        {description && (
          <p className={`text-txt-secondary leading-relaxed mt-1 whitespace-pre-line ${compact ? 'text-[11px]' : 'text-xs'}`}>
            {description}
          </p>
        )}
      </div>
      {actions.length > 0 && (
        <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
          {actions.map((action, i) => {
            const btn = (
              <Button
                variant={action.variant || 'secondary'}
                size="sm"
                icon={action.icon}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            );
            return action.to ? (
              <Link key={i} to={action.to}>{btn}</Link>
            ) : (
              <span key={i}>{btn}</span>
            );
          })}
        </div>
      )}
    </div>
  );
}
