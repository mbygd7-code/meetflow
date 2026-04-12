// ── 등급 산출 (8단계: S/A+/A/B+/B/C/D/F) ──
export function getOverallGrade(score) {
  if (score >= 95) return { label: 'S', color: 'text-brand-purple', bg: 'bg-brand-purple/15' };
  if (score >= 88) return { label: 'A+', color: 'text-status-success', bg: 'bg-status-success/15' };
  if (score >= 80) return { label: 'A', color: 'text-status-success', bg: 'bg-status-success/15' };
  if (score >= 70) return { label: 'B+', color: 'text-brand-orange', bg: 'bg-brand-orange/15' };
  if (score >= 60) return { label: 'B', color: 'text-brand-orange', bg: 'bg-brand-orange/15' };
  if (score >= 45) return { label: 'C', color: 'text-status-warning', bg: 'bg-status-warning/15' };
  if (score >= 30) return { label: 'D', color: 'text-status-error', bg: 'bg-status-error/15' };
  return { label: 'F', color: 'text-status-error', bg: 'bg-status-error/15' };
}

// ── 등급 문자열 → 스타일 ──
export function gradeToStyle(gradeLabel) {
  const map = {
    S: { color: 'text-brand-purple', bg: 'bg-brand-purple/15' },
    'A+': { color: 'text-status-success', bg: 'bg-status-success/15' },
    A: { color: 'text-status-success', bg: 'bg-status-success/15' },
    'B+': { color: 'text-brand-orange', bg: 'bg-brand-orange/15' },
    B: { color: 'text-brand-orange', bg: 'bg-brand-orange/15' },
    C: { color: 'text-status-warning', bg: 'bg-status-warning/15' },
    D: { color: 'text-status-error', bg: 'bg-status-error/15' },
    F: { color: 'text-status-error', bg: 'bg-status-error/15' },
  };
  return map[gradeLabel] || map.F;
}
