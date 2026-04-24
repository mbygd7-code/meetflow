const VARIANTS = {
  purple: 'bg-brand-purple/20 text-brand-purple',
  yellow: 'bg-brand-yellow text-bg-primary',
  success: 'bg-status-success/15 text-status-success',
  warning: 'bg-brand-yellow/20 text-brand-yellow',
  danger: 'bg-status-error/15 text-status-error',
  outline: 'bg-transparent border border-border-default text-txt-secondary',
  info: 'bg-brand-purple/20 text-brand-purple',
};

export default function Badge({
  children,
  variant = 'purple',
  className = '',
  icon: Icon,
  ...props
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full
        text-xs font-semibold whitespace-nowrap
        ${VARIANTS[variant]} ${className}
      `}
      {...props}
    >
      {Icon && <Icon size={14} strokeWidth={2.4} />}
      {children}
    </span>
  );
}
