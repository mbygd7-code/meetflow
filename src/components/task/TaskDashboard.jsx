import { useState, useMemo } from 'react';
import { List, LayoutGrid, Clock, CheckCircle2, Loader, AlarmClock } from 'lucide-react';
import { MetricCard, SectionPanel } from '@/components/ui';
import { useTaskStore } from '@/stores/taskStore';
import { differenceInDays, parseISO } from 'date-fns';
import TaskCard from './TaskCard';
import TaskBoard from './TaskBoard';
import TaskDetailModal from './TaskDetailModal';

const VIEWS = [
  { id: 'list', label: '리스트', icon: List },
  { id: 'board', label: '칸반', icon: LayoutGrid },
];

export default function TaskDashboard() {
  const { tasks, updateTask, updateTaskStatus } = useTaskStore();
  const [view, setView] = useState('list');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);

  const stats = useMemo(() => {
    const total = tasks.length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const urgent = tasks.filter((t) => {
      if (t.status === 'done' || !t.due_date) return false;
      return differenceInDays(parseISO(t.due_date), new Date()) <= 3;
    }).length;
    return { total, inProgress, done, urgent };
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority]);

  const handleToggle = (task) => {
    updateTaskStatus(task.id, task.status === 'done' ? 'todo' : 'done');
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 bg-[var(--bg-content)] rounded-[24px] m-4 lg:m-6">
      {/* 헤더 */}
      <div>
        <p className="text-sm text-txt-secondary">
          회의에서 자동 생성된 태스크와 수동 태스크를 한 곳에서 관리하세요
        </p>
      </div>

      {/* ═══ 패널 1: 메트릭 ═══ */}
      <SectionPanel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* ═══ 패널 2: 필터 + 태스크 리스트/보드 ═══ */}
      <SectionPanel flush>
        {/* 툴바 — 패널 상단에 내장 */}
        <div className="flex items-center justify-between px-6 lg:px-8 pt-5 pb-4 border-b border-border-divider flex-wrap gap-3">
          <div className="flex gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50"
            >
              <option value="all">모든 상태</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50"
            >
              <option value="all">모든 우선순위</option>
              <option value="urgent">긴급</option>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
          </div>

          <div className="flex gap-1 p-1 bg-bg-tertiary rounded-md">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                  view === v.id
                    ? 'bg-bg-secondary text-txt-primary shadow-sm'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <v.icon size={13} strokeWidth={2.2} />
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="p-6 lg:p-8">
          {view === 'list' ? (
            filtered.length === 0 ? (
              <div className="text-center py-16 text-txt-muted text-sm">
                해당하는 태스크가 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((t) => (
                  <TaskCard key={t.id} task={t} onToggle={handleToggle} onClick={setSelectedTask} />
                ))}
              </div>
            )
          ) : (
            <TaskBoard tasks={filtered} onToggle={handleToggle} onCardClick={setSelectedTask} />
          )}
        </div>
      </SectionPanel>

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={updateTask}
      />
    </div>
  );
}
