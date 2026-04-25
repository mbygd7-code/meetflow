// 빠른 이동 팔레트 (Cmd+K) — 데이터 회의/태스크/멤버 + 즉시 실행 액션
// 외부 의존성 없이 클라이언트 측 fuzzy match로 동작.
// 진짜 검색 페이지는 Phase 2에서 구축 — 일단 가장 자주 쓰는 "어디로 갈까"를 빠르게 해결.
import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, FileText, ListChecks, Users, MessageSquare,
  Plus, ArrowRight, Calendar, Settings, X, Sparkles, ChevronRight,
} from 'lucide-react';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { supabase } from '@/lib/supabase';
import { getPriorityInfo, getStatusInfo } from '@/lib/taskConstants';
import { format, parseISO } from 'date-fns';

// ── 경량 fuzzy match ──
// 쿼리의 모든 문자가 순서대로 텍스트에 등장하면 매치.
// 점수: 연속 일치 길수록 / 시작 위치 빠를수록 가산점.
function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase().replace(/\s+/g, '');
  const t = (text || '').toLowerCase();
  if (!q || !t) return -1;
  // 정확 일치 우선
  if (t.includes(q)) {
    const pos = t.indexOf(q);
    return 1000 - pos;
  }
  // 한 글자씩 순서 매칭
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      streak++;
      score += 10 + streak * 2;
    } else {
      streak = 0;
    }
  }
  if (qi !== q.length) return -1;
  return score - t.length * 0.1; // 짧은 텍스트 우선
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { meetings } = useMeetingStore();
  const { tasks } = useTaskStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [members, setMembers] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // 멤버 목록 — 팔레트 열릴 때 1회 로드 (캐시)
  useEffect(() => {
    if (!open || members.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, name, email, avatar_color, role')
          .order('name');
        if (!cancelled && data) setMembers(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [open, members.length]);

  // 열릴 때 초기화 + 입력 포커스
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // 다음 frame에 포커스 (모달 트랜지션 후)
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 빠른 액션 (항상 노출, 쿼리 매칭에도 포함)
  const quickActions = useMemo(() => [
    { id: 'new-meeting', label: '새 회의 시작', icon: Plus, hint: '회의 만들기', action: () => navigate('/meetings?new=1') },
    { id: 'new-task', label: '새 태스크 만들기', icon: Plus, hint: '태스크 페이지로', action: () => navigate('/members') },
    { id: 'go-dashboard', label: '마이보드로 이동', icon: ArrowRight, hint: '대시보드', action: () => navigate('/') },
    { id: 'go-meetings', label: '회의 목록', icon: MessageSquare, hint: '회의 페이지', action: () => navigate('/meetings') },
    { id: 'go-members', label: '멤버 · 태스크', icon: Users, hint: '멤버 페이지', action: () => navigate('/members') },
    { id: 'go-summaries', label: '회의록 보기', icon: FileText, hint: '요약/회의록', action: () => navigate('/summaries') },
    { id: 'go-settings', label: '설정', icon: Settings, hint: '계정·테마', action: () => navigate('/settings') },
  ], [navigate]);

  // 결과 계산 — 쿼리에 따라 필터+정렬
  const results = useMemo(() => {
    const q = query.trim();

    // 빈 쿼리: 빠른 액션 + 최근 회의 5개 + 진행중 태스크 5개
    if (!q) {
      const recentMeetings = [...meetings]
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 5)
        .map((m) => ({ type: 'meeting', id: m.id, item: m, score: 0 }));
      const activeTasks = tasks
        .filter((t) => t.status !== 'done' && t.status !== 'cancelled')
        .slice(0, 5)
        .map((t) => ({ type: 'task', id: t.id, item: t, score: 0 }));
      const actionItems = quickActions.slice(0, 5).map((a) => ({ type: 'action', id: a.id, item: a, score: 0 }));
      return [
        ...(actionItems.length ? [{ group: '빠른 작업', items: actionItems }] : []),
        ...(recentMeetings.length ? [{ group: '최근 회의', items: recentMeetings }] : []),
        ...(activeTasks.length ? [{ group: '진행 중 태스크', items: activeTasks }] : []),
      ];
    }

    // 쿼리 있음: 모든 데이터 fuzzy match
    const matched = [];

    quickActions.forEach((a) => {
      const score = Math.max(fuzzyScore(q, a.label), fuzzyScore(q, a.hint));
      if (score > 0) matched.push({ type: 'action', id: a.id, item: a, score: score + 50 }); // 액션은 가중치 ↑
    });

    meetings.forEach((m) => {
      const score = fuzzyScore(q, m.title);
      if (score > 0) matched.push({ type: 'meeting', id: m.id, item: m, score });
    });

    tasks.forEach((t) => {
      const score = Math.max(
        fuzzyScore(q, t.title),
        fuzzyScore(q, t.description) - 100, // description 매칭은 우선순위 ↓
      );
      if (score > 0) matched.push({ type: 'task', id: t.id, item: t, score });
    });

    members.forEach((u) => {
      const score = Math.max(
        fuzzyScore(q, u.name) + 30, // 사람 이름 가중치 ↑
        fuzzyScore(q, u.email) - 50,
      );
      if (score > 0) matched.push({ type: 'member', id: u.id, item: u, score });
    });

    matched.sort((a, b) => b.score - a.score);
    const topResults = matched.slice(0, 30);

    // 그룹핑
    const groups = {
      action: { group: '빠른 작업', items: [] },
      meeting: { group: '회의', items: [] },
      task: { group: '태스크', items: [] },
      member: { group: '멤버', items: [] },
    };
    topResults.forEach((r) => groups[r.type]?.items.push(r));
    return Object.values(groups).filter((g) => g.items.length > 0);
  }, [query, meetings, tasks, members, quickActions]);

  // flat 리스트 — ↑↓ 키 네비용
  const flatItems = useMemo(() => results.flatMap((g) => g.items), [results]);

  // selected가 범위 벗어나지 않게
  useEffect(() => {
    if (selected >= flatItems.length) setSelected(0);
  }, [flatItems.length, selected]);

  // 선택된 아이템 자동 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selected}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // 실행
  const executeItem = (item) => {
    if (!item) return;
    const { type, item: data } = item;
    if (type === 'action') {
      data.action?.();
    } else if (type === 'meeting') {
      // 완료된 회의는 회의록으로, 그 외는 회의방으로
      navigate(data.status === 'completed' ? `/summaries/${data.id}` : `/meetings/${data.id}`);
    } else if (type === 'task') {
      // 태스크는 멤버 페이지에서 해당 task 슬라이드 열기
      navigate(`/members?task=${data.id}`);
    } else if (type === 'member') {
      navigate(`/members?member=${data.id}`);
    }
    onClose?.();
  };

  // 키보드 핸들러
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeItem(flatItems[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  };

  if (!open) return null;

  let runningIdx = -1; // flat 인덱스 추적

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 pt-[8vh] md:pt-[15vh] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-bg-secondary border border-border-default rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 입력창 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-divider">
          <Search size={18} className="text-txt-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={handleKeyDown}
            placeholder="회의·태스크·멤버 검색 또는 명령 입력..."
            className="flex-1 bg-transparent text-sm md:text-base text-txt-primary placeholder-txt-muted focus:outline-none"
          />
          <kbd className="hidden md:inline text-[10px] text-txt-muted bg-bg-tertiary border border-border-subtle rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-1 rounded text-txt-muted hover:text-txt-primary"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 결과 리스트 */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2 scrollbar-hide">
          {flatItems.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Sparkles size={28} className="text-txt-muted/40 mx-auto mb-2" />
              <p className="text-sm text-txt-secondary">'{query}'와 일치하는 결과가 없어요</p>
              <p className="text-[11px] text-txt-muted mt-1">다른 키워드를 시도해보세요</p>
            </div>
          ) : (
            results.map((group) => (
              <div key={group.group} className="mb-2 last:mb-0">
                <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-txt-muted">
                  {group.group}
                </p>
                {group.items.map((it) => {
                  runningIdx++;
                  const idx = runningIdx;
                  return (
                    <ResultRow
                      key={`${it.type}-${it.id}`}
                      item={it}
                      isSelected={idx === selected}
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => executeItem(it)}
                      dataIdx={idx}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 푸터 — 단축키 힌트 */}
        <div className="hidden md:flex items-center justify-between px-4 py-2 border-t border-border-divider text-[10px] text-txt-muted bg-bg-primary/30">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-bg-tertiary border border-border-subtle rounded px-1.5 py-0.5 font-mono">↑↓</kbd>
              탐색
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-bg-tertiary border border-border-subtle rounded px-1.5 py-0.5 font-mono">↵</kbd>
              선택
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-bg-tertiary border border-border-subtle rounded px-1.5 py-0.5 font-mono">esc</kbd>
              닫기
            </span>
          </div>
          <span className="text-txt-muted">{flatItems.length}개 결과</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── 결과 행 ──
function ResultRow({ item, isSelected, onClick, onMouseEnter, dataIdx }) {
  const { type, item: data } = item;

  let icon, primary, secondary;

  if (type === 'action') {
    const Icon = data.icon;
    icon = <div className="w-7 h-7 rounded-md bg-brand-purple/10 flex items-center justify-center"><Icon size={15} className="text-brand-purple" /></div>;
    primary = data.label;
    secondary = data.hint;
  } else if (type === 'meeting') {
    const isCompleted = data.status === 'completed';
    icon = (
      <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
        isCompleted ? 'bg-status-success/15' : 'bg-bg-tertiary'
      }`}>
        <FileText size={15} className={isCompleted ? 'text-status-success' : 'text-txt-secondary'} />
      </div>
    );
    primary = data.title || '제목 없음';
    secondary = [
      isCompleted ? '회의록' : data.status === 'active' ? '진행 중' : '예정',
      data.created_at ? format(parseISO(data.created_at), 'M/d') : null,
    ].filter(Boolean).join(' · ');
  } else if (type === 'task') {
    const pri = getPriorityInfo(data.priority);
    const st = getStatusInfo(data.status);
    icon = (
      <div className="w-7 h-7 rounded-md bg-bg-tertiary flex items-center justify-center relative">
        <ListChecks size={15} className="text-txt-secondary" />
        <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${pri.dot} ring-1 ring-bg-secondary`} />
      </div>
    );
    primary = data.title;
    secondary = `${st.label}${data.due_date ? ` · 마감 ${format(parseISO(data.due_date), 'M/d')}` : ''}${data.assignee_name ? ` · ${data.assignee_name}` : ''}`;
  } else if (type === 'member') {
    icon = (
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
        style={{ backgroundColor: data.avatar_color || '#723CEB' }}
      >
        {data.name?.[0] || '?'}
      </div>
    );
    primary = data.name;
    secondary = data.email + (data.role === 'admin' ? ' · Admin' : '');
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      data-idx={dataIdx}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
        isSelected ? 'bg-bg-tertiary' : 'hover:bg-bg-tertiary/60'
      }`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-txt-primary font-medium truncate">{primary}</p>
        {secondary && <p className="text-[11px] text-txt-muted truncate">{secondary}</p>}
      </div>
      {isSelected && <ChevronRight size={14} className="text-txt-muted shrink-0" />}
    </button>
  );
}
