// 알림 타입 메타데이터 — 아이콘/라벨/필터 카테고리 매핑
import {
  Bell,
  ListChecks,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Video,
  FileText,
  AtSign,
  Sparkles,
  Users,
  Coins,
} from 'lucide-react';

// 카테고리 정의 — 좌측 필터 사이드
export const NOTIFICATION_CATEGORIES = [
  { id: 'all',     label: '전체',        icon: Bell },
  { id: 'urgent',  label: '긴급',        icon: AlertTriangle },
  { id: 'meeting', label: '회의',        icon: Video },
  { id: 'task',    label: '태스크',      icon: ListChecks },
  { id: 'ai',      label: 'AI 인사이트', icon: Sparkles },
  { id: 'system',  label: '시스템',      icon: Coins },
];

/**
 * type → { label, icon, category }
 * - label: 카드 우측 작은 chip 라벨
 * - icon : Lucide 아이콘 컴포넌트
 * - category: 필터 카테고리 ('meeting' | 'task' | 'ai' | 'system')
 */
export const NOTIFICATION_TYPES = {
  // ── 회의 ──
  'meeting.starting_soon':     { label: '곧 시작',     icon: Clock,         category: 'meeting' },
  'meeting.live_now':          { label: '진행 중',     icon: Video,         category: 'meeting' },
  'meeting.mention':           { label: '멘션',        icon: AtSign,        category: 'meeting' },
  'meeting.task_assigned_live':{ label: '태스크 배정', icon: ListChecks,    category: 'meeting' },
  'meeting.poll_request':      { label: '투표 요청',   icon: Bell,          category: 'meeting' },
  'meeting.summary_ready':     { label: '회의록 준비', icon: FileText,      category: 'meeting' },
  'meeting.key_attendee_declined': { label: '참석 거절', icon: Users,       category: 'meeting' },
  'meeting.overran':           { label: '시간 초과',   icon: Clock,         category: 'meeting' },

  // ── 태스크 ──
  'task.assigned':                  { label: '신규 배정',  icon: ListChecks,    category: 'task' },
  'task.due_today':                 { label: '오늘 마감',  icon: Clock,         category: 'task' },
  'task.overdue':                   { label: '마감 지남',  icon: AlertTriangle, category: 'task' },
  'task.priority_raised_to_urgent': { label: '긴급 승격',  icon: AlertTriangle, category: 'task' },
  'task.due_soon':                  { label: '마감 임박',  icon: Clock,         category: 'task' },
  'task.dependency_unblocked':      { label: '시작 가능',  icon: CheckCircle2,  category: 'task' },
  'task.completed_by_assignee':     { label: '완료',        icon: CheckCircle2,  category: 'task' },
  'task.assignee_overdue':          { label: '담당자 지연',icon: AlertTriangle, category: 'task' },
  'task.status_changed':            { label: '상태 변경',  icon: ListChecks,    category: 'task' },

  // ── 회의 부재자 (요약 기반) ──
  'summary.you_were_mentioned':         { label: '회의록',  icon: FileText, category: 'meeting' },
  'summary.task_assigned_in_absentia':  { label: '회의록',  icon: FileText, category: 'meeting' },
  'summary.decision_affects_you':       { label: '회의록',  icon: FileText, category: 'meeting' },

  // ── 관리자 ──
  'admin.token_threshold':  { label: '토큰',     icon: Coins,         category: 'system' },
  'admin.task_stalled':     { label: '정체',     icon: AlertTriangle, category: 'system' },
  'admin.weekly_digest':    { label: '주간 요약',icon: Sparkles,      category: 'system' },
  'admin.urgent_pile_up':   { label: '긴급 누적',icon: AlertTriangle, category: 'system' },
  'admin.member_joined':    { label: '신규 멤버',icon: Users,         category: 'system' },
};

/**
 * 알림 카드의 우측 색상 / 좌측 아이콘 컬러 결정
 */
export const PRIORITY_STYLE = {
  urgent: { dot: 'bg-status-error',   text: 'text-status-error',   label: '긴급' },
  normal: { dot: 'bg-brand-purple',   text: 'text-brand-purple',   label: '보통' },
  low:    { dot: 'bg-txt-muted',      text: 'text-txt-muted',      label: '낮음' },
};

/**
 * 알림 시간순 그룹핑 — 오늘 / 어제 / 이번 주 / 이전
 */
export function groupByTime(notifications) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  // 이번 주 시작 (월요일 00:00). getDay(): 일=0, 월=1...
  const day = startOfToday.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const startOfWeek = new Date(startOfToday.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);

  const groups = { today: [], yesterday: [], week: [], earlier: [] };
  for (const n of notifications) {
    const t = new Date(n.created_at);
    if (t >= startOfToday) groups.today.push(n);
    else if (t >= startOfYesterday) groups.yesterday.push(n);
    else if (t >= startOfWeek) groups.week.push(n);
    else groups.earlier.push(n);
  }
  return groups;
}

export const GROUP_LABELS = {
  today:     '오늘',
  yesterday: '어제',
  week:      '이번 주',
  earlier:   '이전',
};

/**
 * 카테고리 필터 → notifications 필터링
 */
export function filterByCategory(notifications, categoryId) {
  if (!categoryId || categoryId === 'all') return notifications;
  if (categoryId === 'urgent') return notifications.filter((n) => n.priority === 'urgent');
  return notifications.filter((n) => {
    const meta = NOTIFICATION_TYPES[n.type];
    return meta?.category === categoryId;
  });
}

/**
 * 상대시간 (간단판) — date-fns 사용 안 하고 자체 구현
 */
export function relativeTime(dateInput) {
  const t = new Date(dateInput).getTime();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(t).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
