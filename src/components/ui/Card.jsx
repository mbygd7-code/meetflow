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
    default: `bg-bg-secondary border border-border-subtle ${
      hoverable ? 'hover:border-border-hover' : ''
    }`,
    gradient: 'bg-gradient-card text-white border-none shadow-md',
    subtle: `bg-bg-tertiary border border-border-divider ${
      hoverable ? 'hover:border-border-hover' : ''
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
