export default function Card({
  children,
  variant = 'default',
  className = '',
  hoverable = true,
  onClick,
  ...props
}) {
  const base = 'rounded-[12px] p-6 transition-all duration-200';
  const variants = {
    default: `bg-bg-secondary border border-white/[0.08] ${
      hoverable ? 'hover:border-white/[0.12]' : ''
    }`,
    gradient: 'bg-gradient-card text-white border-none shadow-md',
    subtle: `bg-bg-tertiary border border-white/[0.06] ${
      hoverable ? 'hover:border-white/[0.12]' : ''
    }`,
  };

  return (
    <div
      className={`${base} ${variants[variant]} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}
