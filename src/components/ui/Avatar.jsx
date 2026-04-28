import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
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
  acknowledged = false,
  declined = false,
  declineReason = '',
  className = '',
  label,
  src,
}) {
  const [imgError, setImgError] = useState(false);
  const [tipPos, setTipPos] = useState(null); // { top, left } 또는 null
  const wrapRef = useRef(null);
  const initials = label || getInitials(name);
  const bg = color || pickColor(name);
  const sz = SIZES[size];

  const baseClasses = `${sz.box} ${sz.text} rounded-full flex items-center justify-center font-semibold text-white relative shrink-0`;

  const onlineDot = online && (
    <span
      className={`absolute ${sz.dot} rounded-full bg-status-success border-2 border-bg-primary`}
    />
  );

  // 슬랙에서 "참석" 클릭한 참석자 표시 — 상단 오렌지 점
  const ackDotSize = size === 'sm' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const ackDot = acknowledged && !declined && (
    <span
      className={`absolute -top-1 left-1/2 -translate-x-1/2 ${ackDotSize} rounded-full bg-brand-orange border-2 border-bg-secondary shadow-sm pointer-events-none`}
      title="슬랙에서 참석 응답"
    />
  );

  // 불참석 X 배지 + Portal로 렌더되는 사유 툴팁 (오버플로우 클리핑 회피)
  const showTooltip = useCallback(() => {
    if (!declined || !declineReason || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setTipPos({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
    });
  }, [declined, declineReason]);
  const hideTooltip = useCallback(() => setTipPos(null), []);

  // X 배지 — 가독성 높이기: 사이즈 ↑, lucide X 아이콘 + 흰 X 위에 빨간 배경
  const declineBadgeSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5';
  const declineIconSize = size === 'sm' ? 9 : size === 'md' ? 11 : 13;
  const declineBadge = declined && (
    <span
      className={`absolute -top-1.5 left-1/2 -translate-x-1/2 ${declineBadgeSize} rounded-full bg-status-error ring-2 ring-bg-secondary shadow-md flex items-center justify-center text-white pointer-events-none`}
      title={declineReason ? `불참 사유: ${declineReason}` : '불참석'}
    >
      <X size={declineIconSize} strokeWidth={3.5} className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
    </span>
  );

  const tooltipPortal = declined && declineReason && tipPos && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed z-[9999] -translate-x-1/2 whitespace-pre-line break-words max-w-[240px] min-w-[140px] px-3 py-2 rounded-md text-[11px] font-normal text-txt-primary bg-bg-secondary border border-border-default shadow-lg pointer-events-none text-left normal-case"
          style={{ top: tipPos.top, left: tipPos.left }}
        >
          <div className="text-status-error font-semibold mb-1">불참 사유</div>
          {declineReason}
        </div>,
        document.body,
      )
    : null;

  const hoverHandlers = declined && declineReason
    ? { onMouseEnter: showTooltip, onMouseLeave: hideTooltip, onFocus: showTooltip, onBlur: hideTooltip }
    : {};

  // AI variant (Milo gradient)
  if (variant === 'ai') {
    return (
      <div ref={wrapRef} className={`${baseClasses} bg-gradient-brand shadow-glow ${className}`} {...hoverHandlers}>
        {initials || 'M'}
        {onlineDot}
        {ackDot}
        {declineBadge}
        {tooltipPortal}
      </div>
    );
  }

  // Photo avatar
  if (src && !imgError) {
    return (
      <div ref={wrapRef} className={`${baseClasses} ${className}`} style={{ backgroundColor: bg }} {...hoverHandlers}>
        <img
          src={src}
          alt={name || initials}
          onError={() => setImgError(true)}
          className="w-full h-full rounded-full object-cover"
        />
        {onlineDot}
        {ackDot}
        {declineBadge}
        {tooltipPortal}
      </div>
    );
  }

  // Default initials avatar
  return (
    <div
      ref={wrapRef}
      className={`${baseClasses} ${className}`}
      style={{ backgroundColor: bg }}
      {...hoverHandlers}
    >
      {initials}
      {onlineDot}
      {ackDot}
      {declineBadge}
      {tooltipPortal}
    </div>
  );
}
