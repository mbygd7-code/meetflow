/**
 * SectionPanel — 다중 레이어 컨테이너
 *
 * 기본: 깔끔한 화이트 패널 (뉴트럴)
 * tint="accent": 은은한 올리브 틴트 (강조 시에만)
 */
export default function SectionPanel({
  children,
  className = '',
  accent = false,
  flush = false,
  tint = 'none',
  title,
  subtitle,
  action,
}) {
  return (
    <section
      className={`
        bg-bg-secondary rounded-[20px] shadow-md
        border border-border-subtle
        ${flush ? '' : 'p-6 lg:p-8'}
        ${className}
      `}
    >
      {accent && (
        <div className="h-1 bg-gradient-brand rounded-full mb-6 -mt-1" />
      )}

      {(title || action) && (
        <div className="flex items-center justify-between mb-5">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-txt-primary">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-txt-secondary mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}

      {children}
    </section>
  );
}
