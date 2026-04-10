/**
 * SectionPanel — Dynamic 365 CRM 스타일 다중 레이어 컨테이너
 *
 * 회색 배경 위에 떠있는 큰 흰색 패널.
 * 내부에 카드/섹션들을 그룹핑하여 "섹션 안의 섹션" 레이어 효과를 만든다.
 *
 * 사용법:
 *   <SectionPanel>          — 기본 흰색 패널
 *   <SectionPanel accent>   — 상단에 그라디언트 액센트 라인
 *   <SectionPanel flush>    — 패딩 없음 (직접 내부 구조 컨트롤)
 */
export default function SectionPanel({
  children,
  className = '',
  accent = false,
  flush = false,
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
      {/* 상단 액센트 라인 */}
      {accent && (
        <div className="h-1 bg-gradient-brand rounded-full mb-6 -mt-1" />
      )}

      {/* 헤더 (선택) */}
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
