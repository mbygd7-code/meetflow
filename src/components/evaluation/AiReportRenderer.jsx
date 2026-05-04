// AI 평가 리포트 — 마크다운 풍 텍스트를 세련된 페이퍼 스타일로 렌더링
// 입력: AI 가 생성한 ## 헤딩 + 본문 형식의 텍스트
// 출력: 섹션 번호 + 타이틀 + 본문 (인용/숫자/볼드 자동 강조)
import { Quote } from 'lucide-react';

// 본문 inline 강조: "큰따옴표", **볼드**, 숫자+단위, 한국어 핵심어
function renderInline(text, keyPrefix) {
  // 1) **볼드** 토큰화 → split 결과에 마커 유지
  // 2) "..." 인용 토큰화
  // 3) 숫자+한국어단위 (5회, 2건, 8회, 5건, 30%) 토큰화
  const nodes = [];
  // regex: bold | quoted | number+unit
  const pattern = /(\*\*[^*]+\*\*)|("[^"]+")|(\d+(?:\.\d+)?(?:%|회|건|개|점|시간|분|일|명))/g;
  let lastIdx = 0;
  let i = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIdx) {
      nodes.push(text.slice(lastIdx, m.index));
    }
    const token = m[0];
    if (m[1]) {
      // **bold**
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-txt-primary">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (m[2]) {
      // "quoted"
      nodes.push(
        <span
          key={`${keyPrefix}-q-${i}`}
          className="inline-flex items-baseline gap-0.5 italic text-brand-orange font-medium"
        >
          {token}
        </span>
      );
    } else if (m[3]) {
      // 숫자+단위
      nodes.push(
        <strong key={`${keyPrefix}-n-${i}`} className="text-brand-purple font-bold">
          {token}
        </strong>
      );
    }
    lastIdx = pattern.lastIndex;
    i++;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

// ## 으로 시작하는 섹션 단위로 파싱
function parseSections(markdown) {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const headingMatch = line.match(/^##+\s+(.+?)\s*$/);
    if (headingMatch) {
      if (cur) sections.push(cur);
      cur = { title: headingMatch[1].trim(), paragraphs: [] };
    } else if (line.trim() === '') {
      if (cur && cur.paragraphs.length && cur.paragraphs[cur.paragraphs.length - 1] !== '') {
        cur.paragraphs.push('');
      }
    } else {
      if (!cur) {
        // 헤딩 없이 시작된 텍스트는 '개요' 섹션에 모음
        cur = { title: '', paragraphs: [] };
      }
      const last = cur.paragraphs[cur.paragraphs.length - 1];
      if (last == null || last === '') cur.paragraphs.push(line);
      else cur.paragraphs[cur.paragraphs.length - 1] = `${last} ${line}`;
    }
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({
    ...s,
    paragraphs: s.paragraphs.filter((p) => p !== ''),
  }));
}

// 섹션 제목별 전용 스타일 (있으면 우선)
const SECTION_STYLE = {
  '종합 요약':       { accent: 'bg-brand-purple', label: 'OVERVIEW' },
  '강점 분석':       { accent: 'bg-status-success', label: 'STRENGTHS' },
  '강점':            { accent: 'bg-status-success', label: 'STRENGTHS' },
  '발언 태도 분석':   { accent: 'bg-brand-orange', label: 'COMMUNICATION' },
  '발언 태도':        { accent: 'bg-brand-orange', label: 'COMMUNICATION' },
  '성장 영역':        { accent: 'bg-brand-purple-deep', label: 'GROWTH' },
  '성장':             { accent: 'bg-brand-purple-deep', label: 'GROWTH' },
  '종합 의견':        { accent: 'bg-status-info', label: 'CONCLUSION' },
  '의견':             { accent: 'bg-status-info', label: 'CONCLUSION' },
  '개선 영역':        { accent: 'bg-brand-orange', label: 'IMPROVEMENTS' },
};

export default function AiReportRenderer({ text, className = '' }) {
  const sections = parseSections(text || '');
  if (sections.length === 0) {
    return (
      <p className={`text-sm text-txt-secondary leading-relaxed whitespace-pre-wrap ${className}`}>
        {text}
      </p>
    );
  }

  return (
    <article className={`space-y-7 ${className}`}>
      {sections.map((sec, idx) => {
        const style = SECTION_STYLE[sec.title] || { accent: 'bg-txt-muted', label: null };
        return (
          <section key={idx} className="relative pl-5">
            {/* 좌측 컬러 바 */}
            <span
              className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-full ${style.accent}`}
              aria-hidden="true"
            />
            {/* 헤더 */}
            {sec.title && (
              <header className="mb-2.5">
                {style.label && (
                  <p className="text-[10px] font-bold text-txt-muted uppercase tracking-[0.15em] mb-0.5">
                    {String(idx + 1).padStart(2, '0')} · {style.label}
                  </p>
                )}
                <h3 className="text-lg font-extrabold text-txt-primary tracking-tight">
                  {sec.title}
                </h3>
              </header>
            )}
            {/* 본문 단락 */}
            <div className="space-y-2.5">
              {sec.paragraphs.map((p, i) => {
                // 첫 단락은 약간 강조 (lead)
                const isLead = i === 0;
                return (
                  <p
                    key={i}
                    className={`leading-[1.75] ${
                      isLead
                        ? 'text-[15px] text-txt-primary'
                        : 'text-[14px] text-txt-secondary'
                    }`}
                  >
                    {renderInline(p, `${idx}-${i}`)}
                  </p>
                );
              })}
            </div>
          </section>
        );
      })}
    </article>
  );
}

// 안 쓰지만 import 깔끔하게
export { Quote };
