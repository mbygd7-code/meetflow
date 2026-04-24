import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon: Icon,
    iconRight: IconRight,
    className = '',
    containerClassName = '',
    type = 'text',
    ...props
  },
  ref
) {
  return (
    <div className={`w-full ${containerClassName}`}>
      {label && (
        <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-muted">
            <Icon size={18} strokeWidth={2} />
          </span>
        )}
        <input
          ref={ref}
          type={type}
          className={`
            w-full bg-bg-tertiary border rounded-md text-sm text-txt-primary
            placeholder:text-txt-muted
            px-4 py-2.5 transition-colors duration-200
            focus:outline-none focus:ring-[3px]
            ${Icon ? 'pl-10' : ''}
            ${IconRight ? 'pr-10' : ''}
            ${
              error
                ? 'border-status-error/60 focus:border-status-error focus:ring-status-error/15'
                : 'border-border-subtle focus:border-brand-purple/50 focus:ring-brand-purple/15'
            }
            ${className}
          `}
          {...props}
        />
        {IconRight && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-txt-muted">
            <IconRight size={18} strokeWidth={2} />
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-status-error">{error}</p>
      )}
      {!error && helperText && (
        <p className="mt-1.5 text-xs text-txt-muted">{helperText}</p>
      )}
    </div>
  );
});

export default Input;
