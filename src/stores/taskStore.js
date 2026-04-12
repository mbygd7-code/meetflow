import { create } from 'zustand';

// 데모 태스크
const MOCK_TASKS = [
  {
    id: 't1',
    title: '온보딩 A/B 와이어프레임 작성',
    description: '3단계(팀 초대) 플로우 개선안 2가지',
    status: 'in_progress',
    priority: 'high',
    due_date: new Date(Date.now() + 3 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u2',
    assignee: { id: 'u2', name: '박서연', color: '#34D399' },
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    ai_suggested: true,
    created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
  },
  {
    id: 't2',
    title: '성공 지표 대시보드 구성',
    description: '7일 이탈률 대시보드',
    status: 'todo',
    priority: 'medium',
    due_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u3',
    assignee: { id: 'u3', name: '이도윤', color: '#38BDF8' },
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    ai_suggested: true,
    created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
  {
    id: 't3',
    title: '디자인 시스템 컴포넌트 마이그레이션',
    description: '기존 버튼/카드 리팩터링',
    status: 'in_progress',
    priority: 'medium',
    due_date: new Date(Date.now() + 5 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u4',
    assignee: { id: 'u4', name: '최하린', color: '#F472B6' },
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    ai_suggested: false,
    created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
  },
  {
    id: 't4',
    title: '실험 결과 발표 자료 준비',
    description: '스테이크홀더 공유용',
    status: 'todo',
    priority: 'low',
    due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u1',
    assignee: { id: 'u1', name: '김지우', color: '#FF902F' },
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    ai_suggested: true,
    created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
  {
    id: 't5',
    title: 'Supabase 마이그레이션 배포',
    description: '프로덕션 DB 스키마 업데이트',
    status: 'done',
    priority: 'urgent',
    due_date: new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u3',
    assignee: { id: 'u3', name: '이도윤', color: '#38BDF8' },
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    ai_suggested: false,
    created_at: new Date(Date.now() - 6 * 86400 * 1000).toISOString(),
  },
  {
    id: 't6',
    title: '내일 마감! 오류 모니터링 대시보드',
    description: 'Sentry 알림 규칙 설정',
    status: 'in_progress',
    priority: 'urgent',
    due_date: new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u3',
    assignee: { id: 'u3', name: '이도윤', color: '#38BDF8' },
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    ai_suggested: false,
    created_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
  },
];

export const useTaskStore = create((set, get) => ({
  tasks: MOCK_TASKS,
  loading: false,

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),

  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t
      ),
    })),

  updateTaskStatus: (id, status) => {
    get().updateTask(id, { status });
  },

  removeTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

  // 필터 / 셀렉터
  getById: (id) => get().tasks.find((t) => t.id === id),
}));
