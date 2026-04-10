import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-brand-purple text-white hover:opacity-90 disabled:opacity-50',
  gradient:
    'bg-gradient-brand text-white font-semibold hover:opacity-95 disabled:opacity-50 shadow-md',
  secondary:
    'bg-transparent text-white border border-white/[0.12] hover:border-white/[0.24] disabled:opacity-50',
  ghost:
    'bg-transparent text-txt-secondary hover:text-white hover:bg-bg-tertiary disabled:opacity-50',
  danger:
    'bg-status-error text-white hover:opacity-90 disabled:opacity-50',
};

const SIZES = {
  sm: 'px-4 py-1.5 text-xs rounded-md',
  md: 'px-6 py-2.5 text-sm rounded-md',
  lg: 'px-7 py-3 text-sm rounded-md',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2 font-semibold
        transition-all duration-200 select-none
        ${VARIANTS[variant]} ${SIZES[size]}
        ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        Icon && <Icon size={16} strokeWidth={2.2} />
      )}
      {children}
    </button>
  );
}
