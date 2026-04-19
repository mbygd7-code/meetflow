// 관리자용 — 직원별 현재 업무 현황
// 각 직원이 지금 무엇을 하고 있는지, 지연은 없는지, 최근 어떤 걸 완료했는지 한눈에
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleDot, Circle, CheckCircle2, AlertCircle, Clock, ChevronRight, Search, X,
  TrendingUp, Sparkles,
} from 'lucide-react';
import { getPriorityInfo, URGENT_DUE_DAYS } from '@/lib/taskConstants';
import { getDueDateStatus, getInitials } from '@/utils/formatters';
import { differenceInDays, parseISO } from 'date-fns';

/**
 * @param {{
 *   employees: Array<{user_id, user_name, avatar_color, team?}>,
 *   tasks: Array<any>,
 * }} props
 */
export default function EmployeeTaskOverview({ employees, tasks }) {
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // 팀 옵션
  const teamOptions = useMemo(() => {
    const set = new Set(employees.map((e) => e.team).filter(Boolean));
    return [...set].sort();
  }, [employees]);

  // 직원별 태스크 통계 계산 (한 번의 순회)
  const employeeStats = useMemo(() => {
    if (!employees.length) return [];
    const now = new Date();

    // 매핑: userId → tasks
    const byUser = new Map();
    for (const t of tasks) {
      const uid = t.assignee_id;
      if (!uid) continue;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid).push(t);
    }

    return employees.map((emp) => {
      const userTasks = byUser.get(emp.user_id) || [];
      const inProgress = [];
      const overdue = [];
      const dueSoon = [];
      const doneRecent = [];

      for (const t of userTasks) {
        if (t.status === 'done') {
          // 최근 7일 이내 완료
          if (t.updated_at || t.completed_at) {
            const d = differenceInDays(now, parseISO(t.updated_at || t.completed_at));
            if (d <= 7) doneRecent.push(t);
          }
          continue;
        }
        if (t.status === 'in_progress') inProgress.push(t);

        // 마감 체크
        if (t.due_date && t.status !== 'done') {
          const diff = differenceInDays(parseISO(t.due_date), now);
          if (diff < 0) overdue.push(t);
          else if (diff <= URGENT_DUE_DAYS) dueSoon.push(t);
        }
      }

      // 현재 가장 긴급한 태스크 (지연 > 임박 > 진행중 우선)
      const currentFocus = overdue[0] || dueSoon[0] || inProgress[0] || null;

      // 상태 판단
      let statusLabel;
      let statusTone;
      if (overdue.length > 0) {
        statusLabel = '지연';
        statusTone = 'danger';
      } else if (dueSoon.length > 0) {
        statusLabel = '마감 임박';
        statusTone = 'warning';
      } else if (inProgress.length > 0) {
        statusLabel = '진행 중';
        statusTone = 'purple';
      } else if (doneRecent.length > 0) {
        statusLabel = '여유';
        statusTone = 'success';
      } else {
        statusLabel = '대기';
        statusTone = 'outline';
      }

      return {
        ...emp,
        inProgress,
        overdue,
        dueSoon,
        doneRecent,
        currentFocus,
        statusLabel,
        statusTone,
        activeCount: inProgress.length + userTasks.filter((t) => t.status === 'todo').length,
      };
    });
  }, [employees, tasks]);

  // 필터 + 정렬 (지연 있는 직원 우선)
  const filtered = useMemo(() => {
    let list = employeeStats;
    if (filterTeam !== 'all') list = list.filter((e) => e.team === filterTeam);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.user_name || '').toLowerCase().includes(q) ||
          (e.team || '').toLowerCase().includes(q)
      );
    }
    // 정렬: 지연 많은 순 → 진행중 많은 순 → 이름
    return [...list].sort((a, b) => {
      if (b.overdue.length !== a.overdue.length) return b.overdue.length - a.overdue.length;
      if (b.dueSoon.length !== a.dueSoon.length) return b.dueSoon.length - a.dueSoon.length;
      if (b.inProgress.length !== a.inProgress.length) return b.inProgress.length - a.inProgress.length;
      return (a.user_name || '').localeCompare(b.user_name || '');
    });
  }, [employeeStats, filterTeam, search]);

  if (!employees.length) {
    return (
      <div className="bg-bg-tertiary rounded-[8px] p-8 text-center text-sm text-txt-muted">
        등록된 직원이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px] max-w-sm flex items-center gap-1.5 bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 focus-within:border-brand-purple/50">
          <Search size={12} strokeWidth={2} className="text-txt-muted shrink-0" />
          <input
            type="text"
            placeholder="직원 이름·팀 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-txt-primary placeholder:text-txt-muted outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-txt-muted hover:text-txt-primary shrink-0"
              aria-label="검색어 지우기"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {teamOptions.length > 0 && (
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="bg-bg-tertiary border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-brand-purple/50"
          >
            <option value="all">모든 팀</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <span className="text-[11px] text-txt-muted ml-auto">
          {filtered.length}명 표시
        </span>
      </div>

      {/* 직원 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((emp) => (
          <EmployeeTaskCard
            key={emp.user_id}
            emp={emp}
            expanded={expandedId === emp.user_id}
            onToggle={() =>
              setExpandedId((cur) => (cur === emp.user_id ? null : emp.user_id))
            }
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 개별 직원 카드
// ═══════════════════════════════════════════════════
function EmployeeTaskCard({ emp, expanded, onToggle }) {
  const statusStyles = {
    danger: 'bg-status-error/10 text-status-error border-status-error/25',
    warning: 'bg-brand-orange/10 text-brand-orange border-brand-orange/25',
    purple: 'bg-brand-purple/10 text-brand-purple border-brand-purple/25',
    success: 'bg-status-success/10 text-status-success border-status-success/25',
    outline: 'bg-bg-tertiary text-txt-muted border-border-subtle',
  };

  const cardBorder = emp.overdue.length > 0
    ? 'border-status-error/30'
    : emp.dueSoon.length > 0
      ? 'border-brand-orange/25'
      : 'border-border-subtle';

  return (
    <div className={`bg-bg-secondary rounded-[10px] border ${cardBorder} overflow-hidden`}>
      {/* 헤더 */}
      <div className="p-3 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: emp.avatar_color || '#723CEB' }}
        >
          {getInitials(emp.user_name)[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-txt-primary truncate">{emp.user_name}</p>
            <Link
              to={`/admin/employee/${emp.user_id}`}
              className="text-txt-muted hover:text-txt-primary"
              aria-label="상세 페이지"
            >
              <ChevronRight size={13} />
            </Link>
          </div>
          <p className="text-[10px] text-txt-muted truncate">{emp.team || '미지정'}</p>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyles[emp.statusTone] || statusStyles.outline}`}
        >
          {emp.overdue.length > 0 && <AlertCircle size={9} className="inline mr-0.5 -mt-0.5" />}
          {emp.statusLabel}
        </span>
      </div>

      {/* 수치 */}
      <div className="px-3 pb-2 grid grid-cols-4 gap-1 text-center">
        <StatBox
          icon={CircleDot}
          color="text-brand-purple"
          label="진행"
          value={emp.inProgress.length}
        />
        <StatBox
          icon={AlertCircle}
          color="text-status-error"
          label="지연"
          value={emp.overdue.length}
          highlight={emp.overdue.length > 0}
        />
        <StatBox
          icon={Clock}
          color="text-brand-orange"
          label="임박"
          value={emp.dueSoon.length}
          highlight={emp.dueSoon.length > 0}
        />
        <StatBox
          icon={CheckCircle2}
          color="text-status-success"
          label="7일 완료"
          value={emp.doneRecent.length}
        />
      </div>

      {/* 현재 집중 업무 */}
      {emp.currentFocus && (
        <div className="mx-3 mb-2 p-2.5 rounded-md bg-bg-tertiary/60 border border-border-divider">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={11} strokeWidth={2.4} className="text-brand-purple" />
            <span className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">
              지금 집중 중
            </span>
          </div>
          <TaskLine task={emp.currentFocus} />
        </div>
      )}

      {/* 확장 — 전체 active 태스크 */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 text-[11px] text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary/40 border-t border-border-divider transition-colors flex items-center justify-between"
      >
        <span>
          {expanded ? '접기' : `전체 보기 (${emp.activeCount}건)`}
        </span>
        <ChevronRight
          size={12}
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border-divider pt-2">
          {emp.overdue.length > 0 && (
            <TaskGroup title="지연" tasks={emp.overdue} color="text-status-error" />
          )}
          {emp.dueSoon.length > 0 && (
            <TaskGroup title="마감 임박" tasks={emp.dueSoon} color="text-brand-orange" />
          )}
          {emp.inProgress.length > 0 && (
            <TaskGroup title="진행 중" tasks={emp.inProgress} color="text-brand-purple" />
          )}
          {emp.doneRecent.length > 0 && (
            <TaskGroup
              title="최근 7일 완료"
              tasks={emp.doneRecent}
              color="text-status-success"
              muted
            />
          )}
          {emp.activeCount === 0 && emp.doneRecent.length === 0 && (
            <p className="text-[11px] text-txt-muted text-center py-2">
              할당된 활성 태스크가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// 작은 컴포넌트들
// ═══════════════════════════════════════════════════
function StatBox({ icon: Icon, color, label, value, highlight = false }) {
  return (
    <div
      className={`rounded-md py-1.5 ${
        highlight ? 'bg-bg-tertiary' : ''
      }`}
    >
      <Icon size={11} className={`${color} mx-auto mb-0.5`} strokeWidth={2.4} />
      <div className="text-[13px] font-bold text-txt-primary leading-none">{value}</div>
      <div className="text-[9px] text-txt-muted mt-0.5">{label}</div>
    </div>
  );
}

function TaskLine({ task }) {
  const priority = getPriorityInfo(task.priority);
  const dday = getDueDateStatus(task.due_date);
  const isDone = task.status === 'done';
  return (
    <div className="flex items-start gap-2">
      {isDone ? (
        <CheckCircle2 size={12} className="text-status-success shrink-0 mt-0.5" />
      ) : task.status === 'in_progress' ? (
        <CircleDot size={12} className="text-brand-purple shrink-0 mt-0.5" />
      ) : (
        <Circle size={12} className="text-txt-muted shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${isDone ? 'text-txt-muted line-through' : 'text-txt-primary'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {task.ai_suggested && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-brand-purple font-semibold">
              <Sparkles size={8} strokeWidth={2.6} /> AI
            </span>
          )}
          <span
            className={`text-[9px] font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${priority.bg} ${priority.tone} ${priority.border}`}
          >
            {priority.label}
          </span>
          {dday && (
            <span
              className={`text-[10px] ${
                dday.urgent ? 'text-status-error font-semibold' : 'text-txt-muted'
              }`}
            >
              {dday.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskGroup({ title, tasks, color, muted = false }) {
  return (
    <div>
      <div className={`flex items-center gap-1 mb-1.5 ${color}`}>
        <span className={`w-1 h-1 rounded-full ${color.replace('text-', 'bg-')}`} />
        <span className="text-[9px] font-semibold uppercase tracking-wider">
          {title} · {tasks.length}
        </span>
      </div>
      <div className={`space-y-1.5 ${muted ? 'opacity-75' : ''}`}>
        {tasks.slice(0, 5).map((t) => (
          <TaskLine key={t.id} task={t} />
        ))}
        {tasks.length > 5 && (
          <p className="text-[10px] text-txt-muted pl-4">+{tasks.length - 5}건 더 있음</p>
        )}
      </div>
    </div>
  );
}
