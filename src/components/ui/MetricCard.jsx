import { TrendingUp, TrendingDown } from 'lucide-react';

export default function MetricCard({
  label,
  value,
  change,
  changeType,
  variant = 'default',
  icon: Icon,
  className = '',
}) {
  const isGradient = variant === 'gradient';
  const up = changeType === 'up' || (typeof change === 'number' && change > 0);
  const down = changeType === 'down' || (typeof change === 'number' && change < 0);

  return (
    <div
      className={`
        rounded-[12px] p-5 transition-all duration-200
        ${
          isGradient
            ? 'bg-gradient-card border-none shadow-md'
            : 'bg-bg-secondary border border-border-subtle hover:border-border-hover'
        }
        ${className}
      `}
    >
      <div className="flex items-start justify-between">
        <p
          className={`text-xs uppercase tracking-wider mb-3 ${
            isGradient ? 'text-white/70' : 'text-txt-muted'
          }`}
        >
          {label}
        </p>
        {Icon && (
          <Icon
            size={16}
            className={isGradient ? 'text-white/70' : 'text-txt-muted'}
          />
        )}
      </div>
      <p
        className={`text-[32px] font-bold leading-none ${
          isGradient ? 'text-white' : 'text-txt-primary'
        }`}
      >
        {value}
      </p>
      {change !== undefined && change !== null && (
        <div
          className={`mt-3 flex items-center gap-1 text-xs font-medium ${
            up
              ? 'text-status-success'
              : down
                ? 'text-status-error'
                : isGradient
                  ? 'text-white/70'
                  : 'text-txt-secondary'
          }`}
        >
          {up && <TrendingUp size={12} strokeWidth={2.5} />}
          {down && <TrendingDown size={12} strokeWidth={2.5} />}
          <span>{typeof change === 'number' ? `${up ? '+' : ''}${change}%` : change}</span>
        </div>
      )}
    </div>
  );
}
