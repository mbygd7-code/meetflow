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

export const AI_EMPLOYEE_MAP = {
  drucker: { id: 'milo', name: 'Milo', color: '#723CEB' },
  kotler: { id: 'kotler', name: 'Kotler', color: '#FF902F' },
  froebel: { id: 'froebel', name: 'Froebel', color: '#34D399' },
  gantt: { id: 'gantt', name: 'Gantt', color: '#3B82F6' },
  norman: { id: 'norman', name: 'Norman', color: '#EC4899' },
  korff: { id: 'korff', name: 'Korff', color: '#F59E0B' },
  deming: { id: 'deming', name: 'Deming', color: '#8B5CF6' },
};

export const EMPLOYEE_NAME_MAP = {
  '노먼': 'norman', norman: 'norman',
  '코틀러': 'kotler', kotler: 'kotler',
  '프뢰벨': 'froebel', froebel: 'froebel',
  '간트': 'gantt', gantt: 'gantt',
  '코르프': 'korff', korff: 'korff',
  '데밍': 'deming', deming: 'deming',
};
