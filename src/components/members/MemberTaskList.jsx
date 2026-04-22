import { useMemo, useState } from 'react';
import { Users, Calendar, AlertCircle, CheckCircle2, FileText, MessageSquare, ChevronRight, Plus } from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

const PRIORITY_MAP = {
  urgent: { label: '긴급', colorClass: 'bg-status-error', textClass: 'text-status-error' },
  high: { label: 'High', colorClass: 'bg-brand-orange', textClass: 'text-brand-orange' },
  medium: { label: 'Medium', colorClass: 'bg-brand-purple', textClass: 'text-brand-purple' },
  low: { label: 'Low', colorClass: 'bg-txt-muted', textClass: 'text-txt-muted' },
};

const STATUS_DOT = {
  todo: 'bg-txt-muted',
  in_progress: 'bg-brand-purple',
  review: 'bg-brand-orange',
  done: 'bg-status-success',
};

const STATUS_LABEL = {
  todo: '할 일',
  in_progress: '진행 중',
  review: '검토',
  done: '완료',
};

/**
 * 우측: 선택된 멤버 요약 + 태스크 리스트
 */
export default function MemberTaskList({ tasks = [], members = [], selectedMember, commentCounts = {}, onSelectTask, onCreateTask }) {
  const [filter, setFilter] = useState('all'); // all / todo / in_progress / done / overdue
  const [sort, setSort] = useState('due_date'); // due_date / priority / recent

  // 필터 + 정렬
  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    const now = new Date();

    if (filter === 'todo' || filter === 'in_progress' || filter === 'done') {
      result = result.filter((t) => t.status === filter);
    } else if (filter === 'overdue') {
      result = result.filter(
        (t) => t.due_date && new Date(t.due_date) < now && t.status !== 'done'
      );
    }

    // 정렬
    result.sort((a, b) => {
      if (sort === 'due_date') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      }
      if (sort === 'priority') {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
      }
      if (sort === 'recent') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      return 0;
    });

    return result;
  }, [tasks, filter, sort]);

  // 통계
  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length,
      done: tasks.filter((t) => t.status === 'done').length,
      overdue: tasks.filter((t) => t.due_date && new Date(t.due_date) < now && t.status !== 'done').length,
    };
  }, [tasks]);

  const rate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 요약 헤더 */}
      <div className="px-6 py-4 border-b border-border-divider bg-bg-primary/30 shrink-0">
        {selectedMember ? (
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
              style={{ backgroundColor: selectedMember.avatar_color || '#723CEB' }}
            >
              {selectedMember.name?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-txt-primary">{selectedMember.name}</h2>
                {selectedMember.role === 'admin' && (
                  <span className="text-[10px] bg-brand-purple/20 text-brand-purple px-2 py-0.5 rounded font-semibold uppercase">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-txt-muted">{selectedMember.email}</p>
            </div>
            <StatsBlock stats={stats} rate={rate} />
            {onCreateTask && (
              <NewTaskButton onClick={() => onCreateTask(selectedMember)} />
            )}
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-orange/20 to-brand-purple/20 flex items-center justify-center shrink-0">
              <Users size={20} className="text-brand-purple" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-txt-primary">전체 팀원 태스크</h2>
              <p className="text-xs text-txt-muted">모든 팀원의 태스크를 한눈에 확인하고 협업하세요</p>
            </div>
            <StatsBlock stats={stats} rate={rate} />
            {onCreateTask && (
              <NewTaskButton onClick={() => onCreateTask(null)} />
            )}
          </div>
        )}
      </div>

      {/* 필터 + 정렬 바 */}
      <div className="px-6 py-2.5 border-b border-border-divider flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { key: 'all', label: '전체', count: stats.total },
            { key: 'todo', label: '할 일', count: stats.todo },
            { key: 'in_progress', label: '진행 중', count: stats.inProgress },
            { key: 'done', label: '완료', count: stats.done },
            { key: 'overdue', label: '지연', count: stats.overdue, warn: true },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                filter === tab.key
                  ? 'bg-brand-purple/15 text-brand-purple border border-brand-purple/30'
                  : 'text-txt-secondary hover:bg-bg-tertiary border border-transparent'
              } ${tab.warn && tab.count > 0 ? 'text-status-error' : ''}`}
            >
              {tab.label}
              <span className={`text-[10px] tabular-nums ${tab.warn && tab.count > 0 ? 'text-status-error' : ''}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50 cursor-pointer"
        >
          <option value="due_date">마감일 순</option>
          <option value="priority">우선순위 순</option>
          <option value="recent">최근 생성 순</option>
        </select>
      </div>

      {/* 태스크 리스트 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
              <CheckCircle2 size={24} className="text-txt-muted" />
            </div>
            <p className="text-sm text-txt-secondary font-medium">
              {filter === 'all' ? '태스크가 없습니다' : '해당 상태의 태스크가 없습니다'}
            </p>
            <p className="text-xs text-txt-muted mt-1">
              {selectedMember ? `${selectedMember.name}님에게 배정된 태스크가 없습니다.` : '새 태스크를 만들어보세요.'}
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assignee={members.find((m) => m.id === task.assignee_id)}
              creator={members.find((m) => m.id === task.created_by)}
              commentCount={commentCounts[task.id] || 0}
              onClick={() => onSelectTask(task)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NewTaskButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-purple text-white rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
      title="새 태스크 생성"
    >
      <Plus size={14} />
      <span className="hidden md:inline">새 태스크</span>
    </button>
  );
}

function StatsBlock({ stats, rate }) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="text-center">
        <p className="text-[10px] text-txt-muted uppercase tracking-wider">완수율</p>
        <p className={`text-xl font-bold tabular-nums ${rate >= 70 ? 'text-status-success' : rate >= 40 ? 'text-brand-orange' : 'text-txt-primary'}`}>
          {rate}%
        </p>
      </div>
      <div className="h-8 w-px bg-border-divider" />
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-txt-muted">
          진행 <span className="text-brand-purple font-semibold tabular-nums">{stats.inProgress}</span>
        </span>
        <span className="text-txt-muted">
          완료 <span className="text-status-success font-semibold tabular-nums">{stats.done}</span>
        </span>
        {stats.overdue > 0 && (
          <span className="text-txt-muted">
            지연 <span className="text-status-error font-semibold tabular-nums">{stats.overdue}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, assignee, creator, commentCount, onClick }) {
  const priority = PRIORITY_MAP[task.priority] || PRIORITY_MAP.medium;

  const dueInfo = useMemo(() => {
    if (!task.due_date) return null;
    const date = parseISO(task.due_date);
    if (!isValid(date)) return null;
    const diff = differenceInDays(date, new Date());
    const overdue = diff < 0 && task.status !== 'done';
    let label = format(date, 'M/d', { locale: ko });
    let colorClass = 'text-txt-secondary';
    if (overdue) {
      label = `${Math.abs(diff)}일 지연`;
      colorClass = 'text-status-error font-semibold';
    } else if (diff === 0) {
      label = '오늘';
      colorClass = 'text-brand-orange font-semibold';
    } else if (diff <= 3 && task.status !== 'done') {
      label = `D-${diff}`;
      colorClass = 'text-brand-orange';
    }
    return { label, colorClass };
  }, [task]);

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      className="w-full bg-bg-secondary border border-border-subtle rounded-lg p-3.5 text-left hover:border-brand-purple/30 hover:bg-bg-tertiary/30 transition-all group cursor-pointer focus:outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/20"
    >
      <div className="flex items-start gap-3">
        {/* 우선순위 인디케이터 */}
        <div className={`w-1 self-stretch rounded-full ${priority.colorClass}`} />

        <div className="flex-1 min-w-0">
          {/* 상단: 배지들 */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${priority.textClass}`}>
              {priority.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-txt-secondary">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[task.status] || STATUS_DOT.todo}`} />
              {STATUS_LABEL[task.status] || '할 일'}
            </span>
            {task.ai_suggested && (
              <span className="text-[9px] bg-brand-purple/10 text-brand-purple px-1.5 py-0.5 rounded-full border border-brand-purple/20">
                AI 추출
              </span>
            )}
          </div>

          {/* 제목 */}
          <h3 className="text-sm font-semibold text-txt-primary leading-snug mb-1.5 group-hover:text-brand-purple transition-colors">
            {task.title}
          </h3>

          {/* 설명 미리보기 */}
          {task.description && (
            <p className="text-[11px] text-txt-muted line-clamp-2 mb-2 leading-relaxed">
              {task.description}
            </p>
          )}

          {/* 메타 정보 */}
          <div className="flex items-center gap-3 text-[11px] text-txt-muted flex-wrap">
            {assignee ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ backgroundColor: assignee.avatar_color || '#723CEB' }}
                >
                  {assignee.name?.[0]}
                </div>
                <span className="text-txt-secondary">{assignee.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full border border-dashed border-txt-muted/50 flex items-center justify-center">
                  <span className="text-[8px] text-txt-muted">?</span>
                </div>
                <span className="text-txt-muted italic">미배정</span>
              </div>
            )}
            {dueInfo && (
              <span className={`inline-flex items-center gap-1 ${dueInfo.colorClass}`}>
                <Calendar size={10} />
                {dueInfo.label}
              </span>
            )}
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-1 text-txt-muted">
                <MessageSquare size={10} />
                {commentCount}
              </span>
            )}
            {task.meeting_id && (
              <span className="inline-flex items-center gap-1 text-brand-purple/80">
                <FileText size={10} />
                회의
              </span>
            )}
          </div>
        </div>

        {/* 상세보기 버튼 — 우측 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="self-center shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-txt-secondary border border-border-subtle hover:border-brand-purple/40 hover:text-brand-purple hover:bg-brand-purple/5 transition-all opacity-60 group-hover:opacity-100"
          title="태스크 상세 보기"
        >
          <span>상세보기</span>
          <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
