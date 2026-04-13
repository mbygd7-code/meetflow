import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 태스크
const MOCK_TASKS = [
  {
    id: 't1',
    title: '온보딩 A/B 와이어프레임 작성',
    description: '3단계(팀 초대) 플로우에서 이탈률이 34%로 높은 상황.\n개선안 A: 초대 스킵 허용 → 나중에 팀 초대 유도\n개선안 B: 초대 단계를 2-step으로 분리 → 이메일/링크 선택',
    status: 'in_progress',
    priority: 'high',
    due_date: new Date(Date.now() + 3 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u2',
    assignee: { id: 'u2', name: '박서연', color: '#34D399' },
    assignee_name: '박서연',
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    service_name: '킨더보드',
    page_name: '온보딩 플로우',
    feature_name: '팀 초대 (3단계)',
    tags: ['UX', 'A/B테스트', '이탈률개선'],
    ai_suggested: true,
    created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    subtasks: [
      { title: '현재 이탈 데이터 분석', done: true },
      { title: '와이어프레임 A안 작성', done: false },
      { title: '와이어프레임 B안 작성', done: false },
      { title: '팀 리뷰 미팅', done: false },
    ],
  },
  {
    id: 't2',
    title: '성공 지표 대시보드 구성',
    description: '온보딩 완료율, 7일 리텐션, DAU/MAU 비율을 한눈에 볼 수 있는 대시보드 설계.\nGA4 + Supabase 데이터 연동 필요.',
    status: 'todo',
    priority: 'medium',
    due_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u3',
    assignee: { id: 'u3', name: '이도윤', color: '#38BDF8' },
    assignee_name: '이도윤',
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    service_name: '킨더보드',
    page_name: '관리자 대시보드',
    feature_name: 'KPI 지표 패널',
    tags: ['데이터', 'GA4', 'KPI'],
    ai_suggested: true,
    created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
  {
    id: 't3',
    title: '디자인 시스템 컴포넌트 마이그레이션',
    description: '기존 Button, Card, Input 컴포넌트를 새 디자인 시스템 토큰 기반으로 리팩터링.\n색상 변수, 보더 반경, 그림자 통일.',
    status: 'in_progress',
    priority: 'medium',
    due_date: new Date(Date.now() + 5 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u4',
    assignee: { id: 'u4', name: '최하린', color: '#F472B6' },
    assignee_name: '최하린',
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    service_name: '킨더보드',
    page_name: '공통 컴포넌트',
    feature_name: '디자인 시스템 v2',
    tags: ['디자인시스템', '리팩터링', 'UI'],
    ai_suggested: false,
    created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    subtasks: [
      { title: 'Button 컴포넌트 마이그레이션', done: true },
      { title: 'Card 컴포넌트 마이그레이션', done: true },
      { title: 'Input/Select 마이그레이션', done: false },
      { title: 'Modal/Toast 마이그레이션', done: false },
    ],
  },
  {
    id: 't4',
    title: '실험 결과 발표 자료 준비',
    description: '스테이크홀더 공유용 슬라이드.\n실험 가설, 결과 데이터, 인사이트, 다음 단계를 포함.',
    status: 'todo',
    priority: 'low',
    due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u1',
    assignee: { id: 'u1', name: '김지우', color: '#FF902F' },
    assignee_name: '김지우',
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    service_name: '킨더보드',
    page_name: '-',
    feature_name: '놀이기록 AI 분석',
    tags: ['발표', '실험', '보고'],
    ai_suggested: true,
    created_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
  {
    id: 't5',
    title: 'Supabase 마이그레이션 배포',
    description: '프로덕션 DB 스키마 업데이트.\nemployee_evaluations, employee_details 테이블 추가.',
    status: 'done',
    priority: 'urgent',
    due_date: new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u3',
    assignee: { id: 'u3', name: '이도윤', color: '#38BDF8' },
    assignee_name: '이도윤',
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    service_name: 'MeetFlow',
    page_name: '백엔드',
    feature_name: 'DB 스키마',
    tags: ['배포', 'DB', 'Supabase'],
    ai_suggested: false,
    created_at: new Date(Date.now() - 6 * 86400 * 1000).toISOString(),
  },
  {
    id: 't6',
    title: '내일 마감! 오류 모니터링 대시보드',
    description: 'Sentry 알림 규칙 설정.\n에러 발생 시 Slack #dev-alerts 채널로 자동 알림.',
    status: 'in_progress',
    priority: 'urgent',
    due_date: new Date(Date.now() + 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'u3',
    assignee: { id: 'u3', name: '이도윤', color: '#38BDF8' },
    assignee_name: '이도윤',
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    service_name: 'MeetFlow',
    page_name: '인프라',
    feature_name: 'Sentry 모니터링',
    tags: ['모니터링', 'Sentry', 'DevOps'],
    ai_suggested: false,
    created_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
  },
  // mby 사용자 태스크
  {
    id: 't7',
    title: 'AI 팀원 시스템 프롬프트 최적화',
    description: '7명 AI 직원의 시스템 프롬프트 품질 검토.\n응답 정확도, 라우팅 키워드 적절성, 톤 일관성 점검.',
    status: 'in_progress',
    priority: 'high',
    due_date: new Date(Date.now() + 2 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'mby',
    assignee: { id: 'mby', name: 'mby', color: '#723CEB' },
    assignee_name: 'mby',
    meeting_id: 'mtg-001',
    meeting_title: '주간 프로덕트 스탠드업',
    service_name: 'MeetFlow',
    page_name: '설정',
    feature_name: 'AI 팀원 관리',
    tags: ['AI', '프롬프트', '품질'],
    ai_suggested: false,
    created_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
    subtasks: [
      { title: 'Milo 프롬프트 검토', done: true },
      { title: 'Kotler/Froebel 프롬프트 검토', done: false },
      { title: '라우팅 키워드 테스트', done: false },
    ],
  },
  {
    id: 't8',
    title: '킨더보드 연동 API 설계',
    description: '킨더보드 서비스와 MeetFlow 간 API 연동 스펙 설계.\nWebhook 수신, 놀이기록 데이터 동기화 포함.',
    status: 'todo',
    priority: 'medium',
    due_date: new Date(Date.now() + 10 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'mby',
    assignee: { id: 'mby', name: 'mby', color: '#723CEB' },
    assignee_name: 'mby',
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    service_name: '킨더보드',
    page_name: 'API',
    feature_name: 'Webhook 연동',
    tags: ['API', '연동', 'Webhook'],
    ai_suggested: true,
    created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
  },
  {
    id: 't9',
    title: 'Vercel 배포 파이프라인 점검',
    description: '프로덕션 배포 시 빌드 실패 이슈 조사.\n환경변수 누락, Edge Function 타임아웃 확인.',
    status: 'in_progress',
    priority: 'urgent',
    due_date: new Date(Date.now() + 1 * 86400 * 1000).toISOString().slice(0, 10),
    assignee_id: 'mby',
    assignee: { id: 'mby', name: 'mby', color: '#723CEB' },
    assignee_name: 'mby',
    meeting_id: 'mtg-003',
    meeting_title: 'Q2 로드맵 킥오프',
    service_name: 'MeetFlow',
    page_name: '인프라',
    feature_name: 'CI/CD',
    tags: ['배포', 'Vercel', 'DevOps'],
    ai_suggested: false,
    created_at: new Date(Date.now() - 4 * 86400 * 1000).toISOString(),
  },
];

let realtimeChannel = null;

export const useTaskStore = create((set, get) => ({
  tasks: SUPABASE_ENABLED ? [] : MOCK_TASKS,
  loading: false,

  // ── 초기 로드 + Realtime 구독 ──
  init: async () => {
    if (!SUPABASE_ENABLED) return;

    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ tasks: data || [], loading: false });
    } catch (err) {
      console.error('[taskStore] init error:', err);
      set({ loading: false });
    }

    // Realtime 구독
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
        console.log('[taskStore] INSERT:', payload.new.id);
        get().addTask(payload.new);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload) => {
        console.log('[taskStore] UPDATE:', payload.new.id);
        get().updateTask(payload.new.id, payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        console.log('[taskStore] DELETE:', payload.old.id);
        get().removeTask(payload.old.id);
      })
      .subscribe();
  },

  // ── 구독 해제 ──
  cleanup: () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  },

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => {
      if (state.tasks.some((t) => t.id === task.id)) return state;
      return { tasks: [task, ...state.tasks] };
    }),

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

  getById: (id) => get().tasks.find((t) => t.id === id),
}));
