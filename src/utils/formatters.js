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
