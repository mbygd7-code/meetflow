import { useState, useEffect, useRef } from 'react';
import { Hash } from 'lucide-react';

const REFERENCE_DB = {
  'Art. 4': { title: 'GDPR 제4조', desc: '개인정보, 처리, 컨트롤러, 프로세서 등 핵심 용어 정의' },
  'Art. 4(5)': { title: 'GDPR 제4조(5)', desc: '가명화(Pseudonymisation) — 추가 정보 없이 특정 데이터 주체를 식별할 수 없도록 처리하는 것' },
  'Art. 5': { title: 'GDPR 제5조', desc: '개인정보 처리 원칙 — 적법성, 공정성, 투명성, 목적 제한, 데이터 최소화, 정확성, 보관 제한, 무결성·기밀성' },
  'Art. 6': { title: 'GDPR 제6조', desc: '처리의 적법성 — 동의, 계약 이행, 법적 의무, 중대 이익, 공익, 정당한 이익 중 하나 이상 충족 필요' },
  'Art. 7': { title: 'GDPR 제7조', desc: '동의 조건 — 동의는 자유롭게, 구체적으로, 고지에 기반하여 명확하게 표시되어야 함' },
  'Art. 8': { title: 'GDPR 제8조', desc: '아동 개인정보 — 정보사회서비스 제공 시 16세 미만(회원국 별 13세까지 하향 가능) 아동의 경우 부모 동의 필요' },
  'Art. 9': { title: 'GDPR 제9조', desc: '특수 범주 개인정보 — 인종, 정치 성향, 종교, 생체 데이터, 건강 정보 등의 처리 제한 및 예외 규정' },
  'Art. 12': { title: 'GDPR 제12조', desc: '투명한 정보 제공 — 데이터 주체에게 간결하고 이해하기 쉬운 형식으로 정보 제공 의무' },
  'Art. 13': { title: 'GDPR 제13조', desc: '정보 수집 시 고지 의무 — 데이터 주체로부터 직접 수집할 때 제공해야 할 정보 목록' },
  'Art. 15': { title: 'GDPR 제15조', desc: '열람권(Right of Access) — 데이터 주체가 자신의 개인정보 처리 여부 및 내용을 확인할 권리' },
  'Art. 17': { title: 'GDPR 제17조', desc: '삭제권(잊힐 권리) — 특정 조건 하에서 개인정보 삭제를 요청할 수 있는 권리' },
  'Art. 20': { title: 'GDPR 제20조', desc: '데이터 이동권 — 구조화된 형식으로 개인정보를 수령하고 다른 컨트롤러에게 이전할 권리' },
  'Art. 25': { title: 'GDPR 제25조', desc: '개인정보 보호 설계(Privacy by Design) — 처리 수단 결정 시점과 처리 시점에 기술·조직적 조치 구현' },
  'Art. 28': { title: 'GDPR 제28조', desc: '프로세서 — 컨트롤러를 대리하여 처리하는 자의 의무 및 계약 조건' },
  'Art. 30': { title: 'GDPR 제30조', desc: '처리 활동 기록 — 컨트롤러와 프로세서의 처리 활동 기록 유지 의무' },
  'Art. 32': { title: 'GDPR 제32조', desc: '처리의 보안 — 위험 수준에 적합한 보안 조치(암호화, 접근 제어, 정기 평가 등) 구현 의무' },
  'Art. 33': { title: 'GDPR 제33조', desc: '개인정보 침해 통지(감독기관) — 72시간 이내 감독기관에 통지 의무' },
  'Art. 34': { title: 'GDPR 제34조', desc: '개인정보 침해 통지(정보주체) — 고위험 침해 시 데이터 주체에게 지체 없이 통지' },
  'Art. 35': { title: 'GDPR 제35조', desc: '개인정보 영향 평가(DPIA) — 고위험 처리 전 영향 평가 실시 의무' },
  'Art. 37': { title: 'GDPR 제37조', desc: '개인정보 보호 책임자(DPO) 지정 — 공공기관, 대규모 모니터링, 특수 범주 처리 시 필수' },
  'Art. 44': { title: 'GDPR 제44조', desc: '국제 이전 일반 원칙 — 제3국 이전 시 보호 수준 유지 조건' },
  'Art. 45': { title: 'GDPR 제45조', desc: '적정성 결정 — EU 집행위원회가 제3국의 보호 수준이 적절하다고 결정한 경우 자유 이전 허용' },
  'Art. 46': { title: 'GDPR 제46조', desc: '적절한 보호조치 — 적정성 결정 없이 국제 이전 시 SCC, BCR 등 보호조치 적용' },
  'Art. 47': { title: 'GDPR 제47조', desc: 'BCR(구속력 있는 기업 규칙) — 다국적 기업 그룹 내 국제 이전을 위한 내부 규정' },
  'Art. 49': { title: 'GDPR 제49조', desc: '특정 상황 면제 — 명시적 동의, 계약 이행 등 예외적 국제 이전 허용 사유' },
};

function findReference(refText) {
  const normalized = refText.replace(/\s+/g, ' ').trim();
  if (REFERENCE_DB[normalized]) return REFERENCE_DB[normalized];
  const baseMatch = normalized.match(/Art\.\s*(\d+)/);
  if (baseMatch) {
    const baseKey = `Art. ${baseMatch[1]}`;
    if (REFERENCE_DB[baseKey]) return REFERENCE_DB[baseKey];
  }
  return null;
}

export default function ReferenceBadge({ reference }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const btnRef = useRef(null);
  const data = findReference(reference);

  const handleOpen = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span ref={containerRef} className="inline-block align-baseline">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-medium leading-tight
          bg-white/20 text-[#999] border border-white/15
          hover:bg-white/35 hover:text-[#777] transition-colors cursor-pointer align-baseline"
      >
        <Hash size={9} strokeWidth={2} className="shrink-0" />
        {reference}
      </button>

      {open && (
        <div
          className="fixed w-[280px] p-3 rounded-lg z-[9999]
            bg-bg-secondary border border-border-subtle shadow-lg"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {data ? (
            <>
              <p className="text-xs font-semibold text-brand-purple mb-1.5">{data.title}</p>
              <p className="text-xs text-txt-secondary leading-relaxed">{data.desc}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-txt-primary mb-1.5">{reference}</p>
              <p className="text-xs text-txt-muted leading-relaxed">
                해당 조항의 원문을 확인하세요.
              </p>
            </>
          )}
        </div>
      )}
    </span>
  );
}
