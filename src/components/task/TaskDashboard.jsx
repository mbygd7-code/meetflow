import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  List, LayoutGrid, CheckCircle2, Loader, AlarmClock,
  Users, User as UserIcon, Plus, Search, X,
} from 'lucide-react';
import { MetricCard, SectionPanel, Button, EmptyState } from '@/components/ui';
import { useTaskStore } from '@/stores/taskStore';
import { useAuthStore } from '@/stores/authStore';
import { differenceInDays, parseISO } from 'date-fns';
import TaskCard from './TaskCard';
import TaskBoard from './TaskBoard';
import TaskSlidePanel from './TaskSlidePanel';
import CreateTaskModal from './CreateTaskModal';
import { URGENT_DUE_DAYS } from '@/lib/taskConstants';

const VIEWS = [
  { id: 'list', label: '리스트', icon: List },
  { id: 'board', label: '칸반', icon: LayoutGrid },
];

const SCOPES = [
  { id: 'mine', label: '내 태스크', icon: UserIcon },
  { id: 'all', label: '전체', icon: Users },
];

export default function TaskDashboard({ pageTitle }) {
  const { tasks, updateTask, updateTaskStatus } = useTaskStore();
  const { user } = useAuthStore();
  const [view, setView] = useState('list');
  const [scope, setScope] = useState('mine');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] = useState('todo');

  // ─── 검색어 디바운스 (200ms) ───
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ─── 본인 태스크 필터 + 전체 스코프 ───
  const scopedTasks = useMemo(() => {
    if (scope === 'all') return tasks;
    const userId = user?.id;
    const userName = user?.name;
    return tasks.filter((t) => {
      if (userId && t.assignee_id === userId) return true;
      if (userName && (t.assignee?.name === userName || t.assignee_name === userName)) return true;
      return false;
    });
  }, [tasks, user, scope]);

  // ─── 프로젝트(서비스) 옵션 리스트 ───
  const projectOptions = useMemo(() => {
    const set = new Set();
    for (const t of scopedTasks) {
      if (t.service_name) set.add(t.service_name);
    }
    return [...set].sort();
  }, [scopedTasks]);

  // ─── 메트릭 계산 ───
  const stats = useMemo(() => {
    let total = 0;
    let inProgress = 0;
    let done = 0;
    let urgent = 0;
    const now = new Date();
    for (const t of scopedTasks) {
      total++;
      if (t.status === 'in_progress') inProgress++;
      else if (t.status === 'done') done++;
      if (t.status !== 'done' && t.due_date) {
        const d = differenceInDays(parseISO(t.due_date), now);
        if (d <= URGENT_DUE_DAYS) urgent++;
      }
    }
    return { total, inProgress, done, urgent };
  }, [scopedTasks]);

  // ─── 필터 적용 ───
  const filtered = useMemo(() => {
    return scopedTasks.filter((t) => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterProject !== 'all' && t.service_name !== filterProject) return false;
      if (search) {
        const title = (t.title || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const tags = (t.tags || []).join(' ').toLowerCase();
        const meeting = (t.meeting_title || '').toLowerCase();
        if (!title.includes(search) && !desc.includes(search) && !tags.includes(search) && !meeting.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [scopedTasks, filterStatus, filterPriority, filterProject, search]);

  const hasActiveFilter =
    filterStatus !== 'all' || filterPriority !== 'all' || filterProject !== 'all' || !!search;

  const resetFilters = () => {
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterProject('all');
    setSearchRaw('');
  };

  // ─── 선택 상태 (id 기반) ───
  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) || null : null),
    [selectedTaskId, tasks]
  );

  const handleSelectTask = useCallback((task) => {
    setSelectedTaskId((cur) => (cur === task.id ? null : task.id));
  }, []);

  const handleCloseTask = useCallback(() => setSelectedTaskId(null), []);

  const handleToggle = useCallback((task) => {
    updateTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done');
  }, [updateTaskStatus]);

  const handleOpenCreate = (defaultStatus = 'todo') => {
    setCreateDefaultStatus(defaultStatus);
    setCreateOpen(true);
  };

  return (
    <div className="flex gap-3 p-2 md:p-3 lg:p-4 mx-auto mr-1 mb-1 md:mr-2 md:mb-2 lg:mr-3 lg:mb-3 min-h-full lg:h-full">
      <div className="flex-1 min-w-0 bg-[var(--bg-content)] rounded-[12px] p-2 md:p-3 lg:p-4 lg:overflow-y-auto scrollbar-hide space-y-4">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            {pageTitle && (
              <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
            )}
            <p className="text-sm text-txt-secondary">
              회의에서 자동 생성된 태스크와 수동 태스크를 한 곳에서 관리하세요
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 범위 토글 */}
            <div className="flex gap-1 p-1 bg-bg-tertiary rounded-md">
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    scope === s.id
                      ? 'bg-bg-secondary text-txt-primary shadow-sm'
                      : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  <s.icon size={15} strokeWidth={2.2} />
                  {s.label}
                </button>
              ))}
            </div>
            {/* 새 태스크 */}
            <Button variant="gradient" size="sm" icon={Plus} onClick={() => handleOpenCreate()}>
              새 태스크
            </Button>
          </div>
        </div>

        {/* ═══ 메트릭 ═══ */}
        <SectionPanel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
            <MetricCard label="전체 태스크" value={stats.total} icon={List} />
            <MetricCard label="진행 중" value={stats.inProgress} icon={Loader} />
            <MetricCard
              label="완료"
              value={stats.done}
              change={stats.total > 0 ? Math.round((stats.done / stats.total) * 100) + '%' : '0%'}
              icon={CheckCircle2}
            />
            <MetricCard label="마감 임박" value={stats.urgent} variant="gradient" icon={AlarmClock} />
          </div>
        </SectionPanel>

        {/* ═══ 필터 + 검색 + 리스트/보드 ═══ */}
        <SectionPanel flush>
          {/* 툴바 */}
          <div className="flex items-center gap-2 px-3 md:px-4 pt-4 pb-3 border-b border-border-divider flex-wrap">
            {/* 검색 */}
            <div className="flex-1 min-w-[180px] max-w-sm flex items-center gap-1.5 bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 focus-within:border-brand-purple/50">
              <Search size={14} strokeWidth={2} className="text-txt-muted shrink-0" />
              <input
                type="text"
                placeholder="제목·설명·태그·회의 검색"
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                className="flex-1 bg-transparent text-xs text-txt-primary placeholder:text-txt-muted outline-none"
              />
              {searchRaw && (
                <button
                  onClick={() => setSearchRaw('')}
                  className="text-txt-muted hover:text-txt-primary shrink-0"
                  aria-label="검색어 지우기"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* 필터 */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50"
            >
              <option value="all">모든 상태</option>
              <option value="todo">대기</option>
              <option value="in_progress">진행 중</option>
              <option value="done">완료</option>
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50"
            >
              <option value="all">모든 우선순위</option>
              <option value="urgent">긴급</option>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
            {projectOptions.length > 0 && (
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50"
              >
                <option value="all">모든 프로젝트</option>
                {projectOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="text-[11px] text-txt-muted hover:text-txt-primary ml-1"
              >
                초기화
              </button>
            )}

            {/* 리스트/칸반 토글 */}
            <div className="flex gap-1 p-1 bg-bg-tertiary rounded-md ml-auto">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-all ${
                    view === v.id
                      ? 'bg-bg-secondary text-txt-primary shadow-sm'
                      : 'text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  <v.icon size={15} strokeWidth={2.2} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* 결과 카운트 */}
          {hasActiveFilter && (
            <div className="px-3 md:px-4 pt-2 text-[11px] text-txt-muted">
              전체 {scopedTasks.length}건 중 <span className="text-txt-secondary font-medium">{filtered.length}건</span> 표시
            </div>
          )}

          {/* 콘텐츠 */}
          <div className="p-3 md:p-4">
            {filtered.length === 0 ? (
              <EmptyState
                icon={List}
                title={hasActiveFilter ? '조건에 맞는 태스크가 없어요' : '태스크가 없어요'}
                description={
                  hasActiveFilter
                    ? '필터를 초기화하거나 다른 조건으로 다시 검색해보세요.'
                    : scope === 'mine'
                      ? '회의에서 AI가 자동으로 추출하거나, 직접 만들어 추가할 수 있어요.'
                      : '회의에서 추출된 태스크가 이곳에 모입니다.'
                }
                actions={
                  hasActiveFilter
                    ? [{ label: '필터 초기화', onClick: resetFilters, variant: 'secondary' }]
                    : [{ label: '새 태스크', onClick: () => handleOpenCreate(), icon: Plus, variant: 'gradient' }]
                }
              />
            ) : view === 'list' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onToggle={handleToggle}
                    onClick={handleSelectTask}
                    selected={selectedTaskId === t.id}
                  />
                ))}
              </div>
            ) : (
              <TaskBoard
                tasks={filtered}
                onToggle={handleToggle}
                onCardClick={handleSelectTask}
                selectedId={selectedTaskId}
                onAddClick={handleOpenCreate}
              />
            )}
          </div>
        </SectionPanel>
      </div>

      {/* 상세 패널 */}
      <TaskSlidePanel task={selectedTask} onClose={handleCloseTask} />

      {/* 생성 모달 */}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultStatus={createDefaultStatus}
      />
    </div>
  );
}
