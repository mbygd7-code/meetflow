/**
 * SectionPanel — Dynamic 365 CRM 스타일 다중 레이어 컨테이너
 *
 * 라이트 모드: 형광 파스텔 그라디언트 배경 + 글래스 효과
 * 다크 모드: 기존 bg-secondary 솔리드
 *
 * tint 옵션으로 패널마다 다른 그라디언트를 줄 수 있다:
 *   "olive"   — 올리브/라임 그린 (기본)
 *   "gold"    — 웜 골드/옐로우
 *   "teal"    — 틸/민트
 *   "peach"   — 피치/살몬
 *   "none"    — 그라디언트 없음
 */

const TINTS = {
  olive: 'from-[#D4E157]/25 via-[#B5CC18]/15 to-[#E8D44D]/10',
  gold: 'from-[#E8D44D]/25 via-[#FFD54F]/15 to-[#B5CC18]/10',
  teal: 'from-[#4DB6AC]/20 via-[#80CBC4]/12 to-[#B5CC18]/8',
  peach: 'from-[#FFAB91]/20 via-[#FFD54F]/12 to-[#E8D44D]/10',
  none: '',
};

export default function SectionPanel({
  children,
  className = '',
  accent = false,
  flush = false,
  tint = 'olive',
  title,
  subtitle,
  action,
}) {
  const tintGradient = TINTS[tint] || TINTS.olive;
  const hasTint = tint !== 'none' && tintGradient;

  return (
    <section
      className={`
        relative rounded-[20px] shadow-md overflow-hidden
        border border-border-subtle
        ${flush ? '' : 'p-6 lg:p-8'}
        ${className}
      `}
    >
      {/* 라이트 모드 전용 형광 그라디언트 배경 */}
      {hasTint && (
        <div
          className={`
            absolute inset-0 bg-gradient-to-br ${tintGradient}
            pointer-events-none
            hidden [html[data-theme=light]_&]:block
          `}
        />
      )}
      {/* 기본 배경 (그라디언트 위에 반투명 오버레이) */}
      <div
        className={`
          absolute inset-0 pointer-events-none
          bg-bg-secondary
          ${hasTint ? '[html[data-theme=light]_&]:bg-white/60 [html[data-theme=light]_&]:backdrop-blur-sm' : ''}
        `}
      />

      {/* 콘텐츠 (z-index로 배경 위에) */}
      <div className="relative z-10">
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
      </div>
    </section>
  );
}
