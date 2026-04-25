import { useMemo, useState, useEffect, useRef } from 'react';
import { Users, AlertCircle, CheckCircle2, Plus, ArrowLeft } from 'lucide-react';
import MemberTaskCard from '@/components/task/MemberTaskCard';

// 필터 cascade 우선순위 — 진행중 > 대기 > 지연 > 완료 > 전체
// 첫 진입/멤버 전환 시 비어있지 않은 첫 탭으로 자동 활성화
const FILTER_CASCADE = ['in_progress', 'todo', 'overdue', 'done', 'all'];

/**
 * 우측: 선택된 멤버 요약 + 태스크 리스트
 */
export default function MemberTaskList({
  tasks = [], members = [], selectedMember, selectedId,
  commentCounts = {}, onSelectTask, onCreateTask, onBack,
  mobileShowTasks = false,
  onQuickStatus, onQuickUpdate, // 인라인 편집용 (선택)
}) {
  const [filter, setFilter] = useState('in_progress'); // 진행중 기본 (cascade로 빈 탭 자동 회피)
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

  // ── Cascade 자동 선택 (멤버 전환 시 1회만) ──
  // 진행중 → 대기 → 지연 → 완료 → 전체 순서로 첫 비어있지 않은 탭 활성화.
  // 사용자가 직접 클릭한 탭은 동일 멤버 동안 보존.
  const cascadeRef = useRef({ memberId: undefined, done: false });
  useEffect(() => {
    // 멤버(또는 "전체") 전환 시 cascade 재실행 표시
    if (cascadeRef.current.memberId !== selectedId) {
      cascadeRef.current = { memberId: selectedId, done: false };
    }
    if (cascadeRef.current.done) return;
    // 태스크 미로드 상태면 대기
    if (tasks.length === 0) {
      cascadeRef.current.done = true;
      setFilter('all');
      return;
    }
    cascadeRef.current.done = true;
    const counts = {
      in_progress: stats.inProgress,
      todo: stats.todo,
      overdue: stats.overdue,
      done: stats.done,
      all: stats.total,
    };
    for (const key of FILTER_CASCADE) {
      if ((counts[key] || 0) > 0) {
        setFilter(key);
        return;
      }
    }
    setFilter('all');
  }, [selectedId, tasks.length, stats]);

  // 모바일: mobileShowTasks가 true일 때만 표시
  return (
    <div className={`flex-1 flex-col overflow-hidden ${mobileShowTasks ? 'flex' : 'hidden md:flex'}`}>
      {/* 요약 헤더 — 모바일: 2행 스택 (정체성 + 통계), 데스크톱: 1행 */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border-divider bg-bg-primary/30 shrink-0">
        {selectedMember ? (
          <div className="space-y-2.5 md:space-y-0 md:flex md:items-start md:gap-4">
            {/* 정체성 행: 뒤로가기 + 아바타 + 이름/이메일 + (모바일) "+" 버튼 */}
            <div className="flex items-start gap-2.5 md:gap-4 md:flex-1 md:min-w-0">
              {onBack && (
                <button
                  onClick={onBack}
                  className="md:hidden w-9 h-9 rounded-md flex items-center justify-center hover:bg-bg-tertiary text-txt-secondary shrink-0 -ml-1.5"
                  aria-label="목록으로"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-sm md:text-base font-bold text-white shrink-0"
                style={{ backgroundColor: selectedMember.avatar_color || '#723CEB' }}
              >
                {selectedMember.name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base md:text-lg font-bold text-txt-primary truncate">{selectedMember.name}</h2>
                  {selectedMember.role === 'admin' && (
                    <span className="text-[10px] bg-bg-tertiary text-txt-primary border border-border-default px-2 py-0.5 rounded font-semibold uppercase shrink-0">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-[11px] md:text-xs text-txt-muted truncate">{selectedMember.email}</p>
              </div>
              {/* 모바일 전용 "+" 버튼 — 정체성 행 우측 끝 */}
              {onCreateTask && (
                <div className="md:hidden">
                  <NewTaskButton onClick={() => onCreateTask(selectedMember)} />
                </div>
              )}
            </div>
            {/* 통계 행: 모바일은 별도 행 / 데스크톱은 동일 행 우측 */}
            <div className="flex items-center justify-between gap-3 md:justify-start md:shrink-0">
              <StatsBlock stats={stats} rate={rate} />
              {/* 데스크톱 전용 "+" 버튼 */}
              {onCreateTask && (
                <div className="hidden md:block">
                  <NewTaskButton onClick={() => onCreateTask(selectedMember)} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 md:space-y-0 md:flex md:items-start md:gap-4">
            <div className="flex items-start gap-2.5 md:gap-4 md:flex-1 md:min-w-0">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-brand-orange/20 to-brand-purple/20 flex items-center justify-center shrink-0">
                <Users size={18} className="text-brand-purple" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base md:text-lg font-bold text-txt-primary">전체 팀원 태스크</h2>
                <p className="text-[11px] md:text-xs text-txt-muted">모든 팀원의 태스크를 한눈에 확인하고 협업하세요</p>
              </div>
              {onCreateTask && (
                <div className="md:hidden">
                  <NewTaskButton onClick={() => onCreateTask(null)} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 md:justify-start md:shrink-0">
              <StatsBlock stats={stats} rate={rate} />
              {onCreateTask && (
                <div className="hidden md:block">
                  <NewTaskButton onClick={() => onCreateTask(null)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 필터 + 정렬 바 — 모바일: 탭 가로 스크롤, 정렬은 우측 고정 */}
      <div className="px-4 md:px-6 py-2.5 border-b border-border-divider flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
          {[
            { key: 'in_progress', label: '진행 중', count: stats.inProgress },
            { key: 'todo', label: '대기', count: stats.todo },
            { key: 'overdue', label: '지연', count: stats.overdue, warn: true },
            { key: 'done', label: '완료', count: stats.done },
            { key: 'all', label: '전체', count: stats.total },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                filter === tab.key
                  ? 'bg-bg-tertiary text-txt-primary border border-border-default'
                  : 'text-txt-secondary hover:bg-bg-tertiary border border-transparent'
              } ${tab.warn && tab.count > 0 ? 'text-status-error' : ''}`}
            >
              {tab.label}
              <span className={`text-[13px] font-bold tabular-nums ${tab.warn && tab.count > 0 ? 'text-status-error' : ''}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="hidden md:block shrink-0 bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50 cursor-pointer"
        >
          <option value="due_date">마감일 순</option>
          <option value="priority">우선순위 순</option>
          <option value="recent">최근 생성 순</option>
        </select>
      </div>

      {/* 태스크 리스트 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-1.5">
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
            <MemberTaskCard
              key={task.id}
              task={task}
              assignee={members.find((m) => m.id === task.assignee_id)}
              creator={members.find((m) => m.id === task.created_by)}
              commentCount={commentCounts[task.id] || 0}
              members={members}
              onClick={() => onSelectTask(task)}
              onQuickStatus={onQuickStatus}
              onQuickUpdate={onQuickUpdate}
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
      <Plus size={16} />
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
      <div className="flex items-center gap-2.5 text-xs">
        <span className="text-txt-secondary font-medium">
          진행 <span className="text-txt-primary font-bold tabular-nums text-sm ml-0.5">{stats.inProgress}</span>
        </span>
        <span className="text-txt-secondary font-medium">
          완료 <span className="text-txt-primary font-bold tabular-nums text-sm ml-0.5">{stats.done}</span>
        </span>
        {stats.overdue > 0 && (
          <span className="text-txt-secondary font-medium">
            지연 <span className="text-status-error font-bold tabular-nums text-sm ml-0.5">{stats.overdue}</span>
          </span>
        )}
      </div>
    </div>
  );
}

