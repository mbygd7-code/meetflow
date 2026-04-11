import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = '',
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-surface-overlay backdrop-blur-sm z-[100] flex items-start justify-center p-4 pt-[5vh] overflow-y-auto fade-in"
      onClick={onClose}
    >
      <div
        className={`
          bg-bg-secondary border border-border-subtle rounded-[8px]
          shadow-lg w-full ${sizes[size]} shrink-0 mb-[5vh] ${className}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-border-divider">
            {title && (
              <h3 className="text-lg font-semibold text-txt-primary">{title}</h3>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="text-txt-secondary hover:text-txt-primary transition-colors p-1 rounded-md hover:bg-bg-tertiary"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )}
        <div className="px-7 py-5">{children}</div>
        {footer && (
          <div className="px-7 pb-6 pt-2 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
