import { useState, useMemo } from 'react';
import { Search, Users, ChevronRight, X } from 'lucide-react';

/**
 * 좌측 멤버 리스트 (평탄 리스트)
 * - "전체" 선택 버튼
 * - 검색
 * - 각 멤버: 아바타, 이름, 역할, 태스크 통계, 완수율 바
 */
export default function MemberList({ members = [], tasks = [], selectedId, onSelect }) {
  const [query, setQuery] = useState('');

  // 멤버별 태스크 통계
  const statsByMember = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      if (!t.assignee_id) return;
      if (!map.has(t.assignee_id)) {
        map.set(t.assignee_id, { total: 0, done: 0, inProgress: 0, overdue: 0 });
      }
      const s = map.get(t.assignee_id);
      s.total++;
      if (t.status === 'done') s.done++;
      if (t.status === 'in_progress' || t.status === 'review') s.inProgress++;
      const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
      if (overdue) s.overdue++;
    });
    return map;
  }, [tasks]);

  // 전체 통계
  const totalStats = useMemo(() => {
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length,
      overdue: tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
    };
  }, [tasks]);

  // 검색 필터
  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.toLowerCase();
    return members.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [members, query]);

  return (
    <div className="w-full lg:w-[300px] shrink-0 border-r border-border-subtle bg-[var(--panel-bg)] flex flex-col overflow-hidden">
      {/* 검색 */}
      <div className="p-3 border-b border-border-divider">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="팀원 검색"
            className="w-full bg-bg-tertiary border border-border-subtle rounded-md pl-9 pr-8 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/15 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide p-2">
        {/* "전체" 버튼 */}
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md mb-1.5 transition-all border ${
            selectedId === null
              ? 'bg-brand-purple/10 border-brand-purple/30 shadow-sm'
              : 'hover:bg-bg-tertiary border-transparent'
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-orange/20 to-brand-purple/20 flex items-center justify-center shrink-0">
            <Users size={14} className="text-brand-purple" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className={`text-sm font-semibold ${selectedId === null ? 'text-txt-primary' : 'text-txt-primary/90'}`}>
              전체 ({totalStats.total})
            </p>
            <p className="text-[10px] text-txt-muted">
              진행 {totalStats.inProgress} · 완료 {totalStats.done}
              {totalStats.overdue > 0 && <span className="text-status-error"> · 지연 {totalStats.overdue}</span>}
            </p>
          </div>
          {selectedId === null && <ChevronRight size={12} className="text-brand-purple" />}
        </button>

        {/* 구분선 */}
        <div className="h-px bg-border-divider my-2" />
        <p className="text-[10px] text-txt-muted font-medium uppercase tracking-wider px-3 py-1">
          팀원 ({members.length})
        </p>

        {/* 멤버 목록 */}
        {filtered.length === 0 ? (
          <p className="text-xs text-txt-muted text-center py-8">
            {query ? `"${query}" 검색 결과 없음` : '등록된 팀원이 없습니다'}
          </p>
        ) : (
          filtered.map((m) => {
            const stats = statsByMember.get(m.id) || { total: 0, done: 0, inProgress: 0, overdue: 0 };
            const rate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
            const isSelected = selectedId === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-md mb-0.5 transition-all border text-left group ${
                  isSelected
                    ? 'bg-brand-purple/10 border-brand-purple/30 shadow-sm'
                    : 'hover:bg-bg-tertiary border-transparent'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                  style={{ backgroundColor: m.avatar_color || '#723CEB' }}
                >
                  {m.name?.[0] || '?'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-txt-primary' : 'text-txt-primary/90'}`}>
                      {m.name}
                    </p>
                    {m.role === 'admin' && (
                      <span className="text-[8px] bg-brand-purple/20 text-brand-purple px-1 py-0.5 rounded font-bold uppercase shrink-0">
                        Admin
                      </span>
                    )}
                  </div>

                  {/* 통계 */}
                  <div className="flex items-center gap-2 text-[10px] text-txt-muted mb-1">
                    <span>
                      <span className="text-txt-primary font-semibold tabular-nums">{stats.done}</span>/
                      <span className="tabular-nums">{stats.total}</span>
                    </span>
                    {stats.inProgress > 0 && (
                      <span className="text-brand-purple">
                        진행 {stats.inProgress}
                      </span>
                    )}
                    {stats.overdue > 0 && (
                      <span className="text-status-error font-semibold">
                        ⚠ {stats.overdue}
                      </span>
                    )}
                  </div>

                  {/* 프로그레스 바 */}
                  <div className="h-1 bg-bg-primary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        rate >= 70 ? 'bg-status-success' : rate >= 40 ? 'bg-brand-orange' : 'bg-status-error'
                      }`}
                      style={{ width: `${Math.max(rate, 2)}%` }}
                    />
                  </div>
                </div>

                {isSelected && <ChevronRight size={12} className="text-brand-purple shrink-0 mt-1" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
