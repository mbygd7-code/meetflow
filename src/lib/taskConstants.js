// 태스크 관련 공통 상수 — priority/status 매핑, 매직 넘버
// 여러 컴포넌트(MemberTaskCard, TaskCard, TaskSlidePanel, DashboardPage 등)에서 재사용

import { Circle, CircleDot, CheckCircle2 } from 'lucide-react';

/** 우선순위 매핑 */
export const PRIORITY_MAP = {
  urgent: {
    label: '긴급',
    tone: 'text-status-error',
    bg: 'bg-status-error/10',
    border: 'border-status-error/30',
    dot: 'bg-status-error',
  },
  high: {
    label: '높음',
    tone: 'text-brand-orange',
    bg: 'bg-brand-orange/10',
    border: 'border-brand-orange/25',
    dot: 'bg-brand-orange',
  },
  medium: {
    label: '보통',
    tone: 'text-brand-purple',
    bg: 'bg-brand-purple/10',
    border: 'border-brand-purple/20',
    dot: 'bg-brand-purple',
  },
  low: {
    label: '낮음',
    tone: 'text-txt-muted',
    bg: 'bg-bg-tertiary',
    border: 'border-border-subtle',
    dot: 'bg-txt-muted',
  },
};

/** 상태 매핑 */
export const STATUS_MAP = {
  done: {
    label: '완료',
    icon: CheckCircle2,
    color: 'text-status-success',
    bg: 'bg-status-success/10',
  },
  in_progress: {
    label: '진행 중',
    icon: CircleDot,
    color: 'text-brand-purple',
    bg: 'bg-brand-purple/10',
  },
  todo: {
    label: '대기',
    icon: Circle,
    color: 'text-txt-muted',
    bg: 'bg-bg-tertiary',
  },
  review: {
    label: '리뷰',
    icon: CircleDot,
    color: 'text-brand-orange',
    bg: 'bg-brand-orange/10',
  },
  cancelled: {
    label: '취소',
    icon: Circle,
    color: 'text-txt-muted',
    bg: 'bg-bg-tertiary',
  },
};

export function getPriorityInfo(priority) {
  return PRIORITY_MAP[priority] || PRIORITY_MAP.medium;
}

export function getStatusInfo(status) {
  return STATUS_MAP[status] || STATUS_MAP.todo;
}

/** 마이보드 매직 넘버 */
export const DASHBOARD_LIMITS = {
  FOCUS_TASKS: 2,       // "오늘의 초점" 표시 최대 건수
  TODAY_MEETINGS: 3,    // "오늘의 일정" 표시 최대 건수
  RECENT_SUMMARIES: 4,  // "최근 회의록" 표시 최대 건수
};

/**
 * "마감 임박" 기준 (일수) — 이 값 이하로 남은 active 태스크를 카운트.
 * 마이보드·태스크 페이지 모두에서 동일 기준 사용.
 */
export const URGENT_DUE_DAYS = 2;
