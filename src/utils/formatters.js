import { format, formatDistanceToNowStrict, differenceInDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

export function formatDate(date, pattern = 'yyyy.MM.dd') {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: ko });
}

export function formatTime(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm', { locale: ko });
}

export function formatRelative(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: ko });
}

export function formatElapsed(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNowStrict(d, { locale: ko });
}

export function formatDueDate(dueDate) {
  if (!dueDate) return '';
  const d = typeof dueDate === 'string' ? parseISO(dueDate) : dueDate;
  const diff = differenceInDays(d, new Date());
  if (diff < 0) return `${Math.abs(diff)}일 지남`;
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff <= 7) return `D-${diff}`;
  return format(d, 'MM/dd', { locale: ko });
}

/**
 * D-Day 상태 계산 — 모든 태스크 카드에서 공통 사용.
 * @returns {{ text: string, diff: number | null, overdue: boolean, today: boolean, urgent: boolean } | null}
 */
export function getDueDateStatus(dueDate) {
  if (!dueDate) return null;
  const d = typeof dueDate === 'string' ? parseISO(dueDate) : dueDate;
  if (isNaN(d)) return null;
  const diff = differenceInDays(d, new Date());
  const overdue = diff < 0;
  const today = diff === 0;
  let text;
  if (overdue) text = `${Math.abs(diff)}일 지연`;
  else if (today) text = '오늘 마감';
  else if (diff === 1) text = '내일';
  else if (diff <= 7) text = `D-${diff}`;
  else text = format(d, 'MM/dd', { locale: ko });
  return { text, diff, overdue, today, urgent: overdue || today || diff === 1 };
}

/** 날짜만 간결히 (MM/dd) — 문자열 슬라이스 대신 date-fns 안전 포맷 */
export function formatMonthDay(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isNaN(d)) return '';
  return format(d, 'MM/dd', { locale: ko });
}

/** ISO 문자열이 유효한지 파싱 + 포맷. invalid면 fallback. */
export function safeFormatDate(date, pattern = 'MM/dd HH:mm', fallback = '') {
  if (!date) return fallback;
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isNaN(d)) return fallback;
  return format(d, pattern, { locale: ko });
}

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pickColor(seed) {
  const colors = ['#723CEB', '#FF902F', '#FFEF63', '#34D399', '#38BDF8', '#F472B6'];
  if (!seed) return colors[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % colors.length;
  return colors[hash];
}
