import { useState } from 'react';
import { getInitials, pickColor } from '@/utils/formatters';

const SIZES = {
  sm: { box: 'w-8 h-8', text: 'text-[11px]', dot: 'w-2 h-2 -right-0 -bottom-0' },
  md: { box: 'w-10 h-10', text: 'text-sm', dot: 'w-2.5 h-2.5 -right-0 -bottom-0' },
  lg: { box: 'w-12 h-12', text: 'text-base', dot: 'w-3 h-3 -right-0.5 -bottom-0.5' },
  xl: { box: 'w-16 h-16', text: 'text-lg', dot: 'w-3.5 h-3.5 -right-0.5 -bottom-0.5' },
};

export default function Avatar({
  name = '',
  color,
  size = 'md',
  variant = 'default',
  online = false,
  className = '',
  label,
  src,
}) {
  const [imgError, setImgError] = useState(false);
  const initials = label || getInitials(name);
  const bg = color || pickColor(name);
  const sz = SIZES[size];

  const baseClasses = `${sz.box} ${sz.text} rounded-full flex items-center justify-center font-semibold text-white relative shrink-0`;

  const onlineDot = online && (
    <span
      className={`absolute ${sz.dot} rounded-full bg-status-success border-2 border-bg-primary`}
    />
  );

  // AI variant (Milo gradient)
  if (variant === 'ai') {
    return (
      <div className={`${baseClasses} bg-gradient-brand shadow-glow ${className}`}>
        {initials || 'M'}
        {onlineDot}
      </div>
    );
  }

  // Photo avatar
  if (src && !imgError) {
    return (
      <div className={`${baseClasses} ${className}`} style={{ backgroundColor: bg }}>
        <img
          src={src}
          alt={name || initials}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover"
        />
        {onlineDot}
      </div>
    );
  }

  // Default initials avatar
  return (
    <div
      className={`${baseClasses} ${className}`}
      style={{ backgroundColor: bg }}
    >
      {initials}
      {onlineDot}
    </div>
  );
}
