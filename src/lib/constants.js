// MeetFlow 공용 상수

export const MEETING_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
};

export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
};

export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

export const MILO_PRESETS = {
  default: { label: '조용한 비서', maxInterventionsPerAgenda: 2, minTurnsBefore: 3, cooldownMinutes: 2 },
  coach: { label: '퍼실리테이터', maxInterventionsPerAgenda: 4, minTurnsBefore: 2, cooldownMinutes: 1 },
  analyst: { label: '데이터 분석가', maxInterventionsPerAgenda: 3, minTurnsBefore: 3, cooldownMinutes: 2 },
  recorder: { label: '기록자', maxInterventionsPerAgenda: 0, minTurnsBefore: 999, cooldownMinutes: 999 },
};

export const MESSAGE_SOURCE = {
  WEB: 'web',
  SLACK: 'slack',
  NOTION: 'notion',
};

export const AVATAR_COLORS = [
  '#723CEB',
  '#FF902F',
  '#FFEF63',
  '#34D399',
  '#EF4444',
  '#4C11CE',
  '#F472B6',
  '#38BDF8',
];
