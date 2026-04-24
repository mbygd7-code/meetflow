import { useMemo, useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  X, FileText, Check, Clock, Users, MessageSquare, Sparkles,
  Search, ChevronDown, ChevronUp, Circle, CircleDot, BarChart3,
  Quote, Download, Keyboard, Filter, ListTodo, Plus, Loader2,
  Pencil, CirclePlay, Trash2, CalendarDays, UserPlus, CornerUpLeft,
  ListChecks, AlignLeft, Send, Share2, ExternalLink,
} from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import { useTaskStore } from '@/stores/taskStore';
import { getPriorityInfo } from '@/lib/taskConstants';
import { Badge, Avatar } from '@/components/ui';
import ChatBubble from './ChatBubble';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useAuthStore } from '@/stores/authStore';
import { safeFormatDate } from '@/utils/formatters';
import { supabase } from '@/lib/supabase';
import CompletedMeetingFiles from './CompletedMeetingFiles';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// 데모 ID 판별 (uuid 아님 = 데모) — P1 버그 수정
// Supabase uuid: 8-4-4-4-12 hex 형식
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDemoMeeting = (id) => !id || !UUID_RE.test(id);
const isDemoTask = (id) => !id || !UUID_RE.test(id);

// 지속 시간 계산
function formatDuration(started, ended) {
  if (!started || !ended) return '—';
  const ms = new Date(ended) - new Date(started);
  if (isNaN(ms) || ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}분`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const UNASSIGNED_KEY = '__unassigned__';

// 메시지 content에서 인용 래퍼/AI 접두어 제거
function cleanText(content) {
  if (!content) return '';
  let t = content;
  // [quote:이름]내용[/quote]\n본문 → 본문
  const qm = t.match(/^\[quote:.+?\][\s\S]*?\[\/quote\]\n?([\s\S]*)$/);
  if (qm) t = qm[1];
  // [이름] 접두어 제거 (AI 메시지)
  t = t.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '');
  return t.trim();
}

// 요약 인용 여부 판정: 메시지 일부 문장(≥15자)이 summary JSON 문자열에 포함되면 true
function makeCitationChecker(summaryData) {
  if (!summaryData) return () => false;
  let haystack = '';
  try {
    haystack = JSON.stringify(summaryData).toLowerCase();
  } catch { return () => false; }
  if (!haystack) return () => false;

  return (content) => {
    const t = cleanText(content).toLowerCase();
    if (!t || t.length < 15) return false;
    // 문장 단위로 쪼개 substring 매칭
    const sentences = t.split(/[.!?。\n]+/).map((s) => s.trim()).filter((s) => s.length >= 15);
    for (const s of sentences) {
      // 너무 긴 문장은 앞 40자 비교
      const probe = s.length > 40 ? s.slice(0, 40) : s;
      if (haystack.includes(probe)) return true;
    }
    // 짧은 메시지 전체가 긴 경우에도 체크
    if (t.length >= 15 && t.length <= 40 && haystack.includes(t)) return true;
    return false;
  };
}

export default function CompletedMeetingView({ meeting }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { messages } = useRealtimeMessages(meeting.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [mergeUnassigned, setMergeUnassigned] = useState(true); // V2: 기본 ON
  const [onlyCited, setOnlyCited] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  // V3: 딥링크용 메시지 ref + 하이라이트 상태
  const messageRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);
  // V4: 어젠다 드릴다운 선택 상태
  const [selectedAgendaKey, setSelectedAgendaKey] = useState(null);
  // V4: 단축키 힌트 표시
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchInputRef = useRef(null);
  const addToast = useToastStore((s) => s.addToast);
  // V5: 태스크 패널 상태
  const allTasks = useTaskStore((s) => s.tasks);
  const addTaskToStore = useTaskStore((s) => s.addTask);
  const updateTaskInStore = useTaskStore((s) => s.updateTask);
  const removeTaskFromStore = useTaskStore((s) => s.removeTask);
  // 기본은 접힘 — 태스크가 많을 때 채팅/사이드바 시야 확보.
  // 아이템이 3개 이하일 때만 자동으로 펼치기 (소량은 접을 필요 X)
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState(new Set()); // 토글 중인 태스크 id
  // V6: 인라인 제목 편집
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  // V6: 메시지 → 태스크 즉석 생성
  const [quickCreateSource, setQuickCreateSource] = useState(null); // { messageId, title, priority }
  const [creatingFromMsg, setCreatingFromMsg] = useState(false);
  // V7: 담당자/기한 드롭다운
  const [assigneeOpenId, setAssigneeOpenId] = useState(null);
  const [dueOpenId, setDueOpenId] = useState(null);
  // V7: 삭제 확인
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  // V8: 태스크 펼침(서브태스크/설명), 필터, 편집
  const [expandedTaskIds, setExpandedTaskIds] = useState(new Set());
  const [taskFilter, setTaskFilter] = useState('all'); // all | todo | in_progress | done | ai
  const [newSubtaskInputs, setNewSubtaskInputs] = useState({}); // taskId → draft
  const [editingDescId, setEditingDescId] = useState(null);
  const [editingDesc, setEditingDesc] = useState('');
  // V9: 외부 푸시 상태
  const [pushingTaskIds, setPushingTaskIds] = useState(new Set()); // { taskId__target }
  const [pushMenuOpenId, setPushMenuOpenId] = useState(null);
  const [bulkPushing, setBulkPushing] = useState(false);
  // V9: 팀 통합 설정
  const [teamIntegrations, setTeamIntegrations] = useState({
    slack_channel_id: null,
    notion_database_id: null,
    loaded: false,
  });
  // V10: Slack ID 매핑 모달 { task, assigneeId, assigneeName, slackId }
  const [slackMapModal, setSlackMapModal] = useState(null);
  const [savingSlackMap, setSavingSlackMap] = useState(false);

  // 회의 요약 로드 (인용 하이라이트용)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!SUPABASE_ENABLED || isDemoMeeting(meeting.id)) return;
      // meeting_summaries 컬럼은 평탄화됨 (decisions/discussions/deferred/action_items)
      const { data } = await supabase
        .from('meeting_summaries')
        .select('decisions, discussions, deferred, action_items, milo_insights')
        .eq('meeting_id', meeting.id)
        .maybeSingle();
      if (!cancelled && data) setSummaryData(data);
    })();
    return () => { cancelled = true; };
  }, [meeting.id]);

  // V9: 팀 통합 설정 로드 (Slack 채널 / Notion DB)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) localStorage (데모/기본)
      let local = {};
      try { local = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}'); } catch {}
      // 2) Supabase 팀 설정 (우선순위 높음)
      let teamCfg = null;
      if (SUPABASE_ENABLED && !isDemoMeeting(meeting.id) && meeting.team_id) {
        try {
          const { data } = await supabase
            .from('teams')
            .select('slack_channel_id, notion_database_id')
            .eq('id', meeting.team_id)
            .maybeSingle();
          teamCfg = data;
        } catch {}
      }
      if (cancelled) return;
      setTeamIntegrations({
        slack_channel_id: teamCfg?.slack_channel_id || local.slackChannel || null,
        notion_database_id: teamCfg?.notion_database_id || local.notionDbId || null,
        loaded: true,
      });
    })();
    return () => { cancelled = true; };
  }, [meeting.id, meeting.team_id]);

  const isCitedFn = useMemo(() => makeCitationChecker(summaryData), [summaryData]);

  // 어젠다 정렬
  const agendas = useMemo(
    () => [...(meeting.agendas || [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    ),
    [meeting.agendas]
  );

  // V2: 메시지 재분류 (시간순 walk로 앞 어젠다 상속)
  const normalizedMessages = useMemo(() => {
    const sorted = [...messages].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return ta - tb;
    });
    if (!mergeUnassigned) return sorted;
    let lastAgendaId = null;
    return sorted.map((m) => {
      if (m.agenda_id) {
        lastAgendaId = m.agenda_id;
        return m;
      }
      if (lastAgendaId) return { ...m, agenda_id: lastAgendaId, _inherited: true };
      return m;
    });
  }, [messages, mergeUnassigned]);

  // 어젠다 ID → 유효한 키인지 확인 (sort 후)
  const agendaKeySet = useMemo(() => new Set(agendas.map((a) => a.id)), [agendas]);

  // 그룹핑 + 필터
  const grouped = useMemo(() => {
    const map = new Map();
    for (const a of agendas) map.set(a.id, []);
    map.set(UNASSIGNED_KEY, []);

    const q = searchQuery.trim().toLowerCase();
    for (const m of normalizedMessages) {
      const content = (m.content || '').toLowerCase();
      if (q && !content.includes(q)) continue;
      if (onlyCited && !isCitedFn(m.content)) continue;
      const key = m.agenda_id && agendaKeySet.has(m.agenda_id) ? m.agenda_id : UNASSIGNED_KEY;
      map.get(key).push(m);
    }
    return map;
  }, [normalizedMessages, agendas, agendaKeySet, searchQuery, onlyCited, isCitedFn]);

  // 전체 통계
  const stats = useMemo(() => {
    const total = messages.length;
    const aiCount = messages.filter((m) => m.is_ai).length;
    const humanMsgs = messages.filter((m) => !m.is_ai);
    const humanIds = new Set(humanMsgs.map((m) => m.user_id).filter(Boolean));
    return { total, ai: aiCount, human: humanMsgs.length, participants: humanIds.size };
  }, [messages]);

  // V4: 어젠다별 필터 — 선택된 어젠다가 있으면 그 어젠다 메시지만으로 비중 계산
  const contributionSource = useMemo(() => {
    if (!selectedAgendaKey) return messages;
    if (selectedAgendaKey === UNASSIGNED_KEY) {
      return normalizedMessages.filter(
        (m) => !m.agenda_id || !agendaKeySet.has(m.agenda_id)
      );
    }
    return normalizedMessages.filter((m) => m.agenda_id === selectedAgendaKey);
  }, [messages, normalizedMessages, agendaKeySet, selectedAgendaKey]);

  // V2: 참여자 발언 비중
  const contributions = useMemo(() => {
    const humanMap = new Map(); // user_id → { name, color, count }
    const aiMap = new Map(); // employeeId → count
    for (const m of contributionSource) {
      if (m.is_ai) {
        const emp = m.ai_employee || 'milo';
        aiMap.set(emp, (aiMap.get(emp) || 0) + 1);
      } else if (m.user_id) {
        const prev = humanMap.get(m.user_id) || {
          id: m.user_id,
          name: m.user?.name || '알 수 없음',
          color: m.user?.color || m.user?.avatar_color || '#723CEB',
          count: 0,
        };
        prev.count += 1;
        humanMap.set(m.user_id, prev);
      }
    }
    const humans = [...humanMap.values()].sort((a, b) => b.count - a.count);
    const ais = [...aiMap.entries()]
      .map(([id, count]) => {
        const emp = AI_EMPLOYEES.find((e) => e.id === id);
        return { id, name: emp?.nameKo || emp?.name || 'Milo', count };
      })
      .sort((a, b) => b.count - a.count);
    const maxCount = Math.max(...humans.map((h) => h.count), ...ais.map((a) => a.count), 1);
    return { humans, ais, maxCount };
  }, [contributionSource]);

  // 검색 매칭 개수
  const searchMatchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => (m.content || '').toLowerCase().includes(q)).length;
  }, [messages, searchQuery]);

  // 인용 메시지 개수
  const citedCount = useMemo(() => {
    if (!summaryData) return 0;
    return messages.filter((m) => isCitedFn(m.content)).length;
  }, [messages, summaryData, isCitedFn]);

  const toggleSection = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 스크롤
  const sectionRefs = useRef({});
  const scrollToAgenda = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: false }));
    requestAnimationFrame(() => {
      sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // V3+수정: URL hash (#msg-<id>) 딥링크 — 접힌 섹션 자동 펼침
  useEffect(() => {
    if (messages.length === 0) return;
    const m = location.hash.match(/^#msg-(.+)$/);
    if (!m) return;
    const msgId = decodeURIComponent(m[1]);

    // 1) 메시지의 agenda_id 찾아서 해당 섹션을 먼저 펼침
    const targetMsg = messages.find((mm) => mm.id === msgId);
    if (targetMsg) {
      // agenda_id가 있으면 그 섹션, 없으면 UNASSIGNED 섹션
      const sectionKey = targetMsg.agenda_id || UNASSIGNED_KEY;
      setCollapsedSections((prev) => ({ ...prev, [sectionKey]: false }));
    }

    // 2) 다음 frame(렌더링 완료)에 스크롤 + 하이라이트
    const timer = setTimeout(() => {
      const el = messageRefs.current[msgId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedMsgId(msgId);
        setTimeout(() => setHighlightedMsgId(null), 2400);
      }
    }, 180); // 섹션 펼침 + 재렌더 여유 시간
    return () => clearTimeout(timer);
  }, [location.hash, messages.length]);

  // V4: 키보드 단축키
  // /  → 검색 포커스
  // Esc → 검색 닫기 or 어젠다 필터 해제
  // ↑/↓ → 어젠다 섹션 네비게이션
  // ?  → 단축키 힌트 토글
  useEffect(() => {
    const handler = (e) => {
      // 입력 필드에 포커스된 상태에서 동작 제한
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;

      if (e.key === 'Escape') {
        // 모달들은 자체 Esc 처리 — 단축키 핸들러에서 추가로 처리하면 중복 작동
        if (slackMapModal) { if (!savingSlackMap) setSlackMapModal(null); return; }
        if (quickCreateSource) { if (!creatingFromMsg) setQuickCreateSource(null); return; }
        if (searchOpen) { setSearchOpen(false); setSearchQuery(''); return; }
        if (selectedAgendaKey) { setSelectedAgendaKey(null); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
      }

      if (isTyping) return;
      // 모달/오버레이가 열려 있으면 페이지 단축키 비활성화 (포커스가 모달 내 버튼일 때 ArrowUp/Down 등 오작동 방지)
      if (slackMapModal || quickCreateSource || showShortcuts) return;

      if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const container = scrollContainerRef.current;
        if (!container) return;
        // 렌더링된 섹션 ref만 사용 (stale 방지)
        const anchors = Object.entries(sectionRefs.current)
          .filter(([, el]) => el)
          .map(([key, el]) => ({ key, el, top: el.getBoundingClientRect().top }))
          .sort((a, b) => a.top - b.top);
        if (anchors.length === 0) return;
        const containerTop = container.getBoundingClientRect().top;
        let currentIdx = 0;
        for (let i = 0; i < anchors.length; i++) {
          if (anchors[i].top - containerTop <= 40) currentIdx = i;
        }
        const nextIdx = e.key === 'ArrowDown'
          ? Math.min(anchors.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx - 1);
        const target = anchors[nextIdx];
        if (target) {
          setCollapsedSections((prev) => ({ ...prev, [target.key]: false }));
          requestAnimationFrame(() => target.el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, selectedAgendaKey, showShortcuts, slackMapModal, quickCreateSource, savingSlackMap, creatingFromMsg]);

  // V4: 마크다운 익스포트
  const buildMarkdown = () => {
    const lines = [];
    lines.push(`# ${meeting.title || '회의'}`);
    lines.push('');
    lines.push(`- 일시: ${safeFormatDate(meeting.ended_at || meeting.started_at, 'yyyy-MM-dd HH:mm', '—')}`);
    lines.push(`- 소요: ${formatDuration(meeting.started_at, meeting.ended_at)}`);
    lines.push(`- 참여: ${stats.participants}명 · 메시지 ${stats.total}건 (AI ${stats.ai})`);
    lines.push('');

    for (let i = 0; i < agendaList.length; i++) {
      const a = agendaList[i];
      const sectionMsgs = grouped.get(a.key) || [];
      if (sectionMsgs.length === 0) continue;
      const statusTag = a.status === 'completed' ? ' ✓' : '';
      const title = a.key === UNASSIGNED_KEY ? '어젠다 외 대화' : `${i + 1}. ${a.title || '제목 없음'}${statusTag}`;
      lines.push(`## ${title}`);
      if (a.duration != null) lines.push(`_예정 ${a.duration}분 · 메시지 ${sectionMsgs.length}건_`);
      lines.push('');
      for (const m of sectionMsgs) {
        const who = m.is_ai
          ? (AI_EMPLOYEES.find((e) => e.id === m.ai_employee)?.nameKo || 'Milo') + ' (AI)'
          : (m.user?.name || '알 수 없음');
        const time = safeFormatDate(m.created_at, 'HH:mm', '');
        const text = cleanText(m.content).replace(/\n/g, '\n  ');
        lines.push(`- **${who}** ${time ? `\`${time}\`` : ''}`);
        lines.push(`  ${text}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  };

  const handleExportMarkdown = () => {
    try {
      if (messages.length === 0) {
        addToast?.('메시지가 없어 내보낼 내용이 없습니다', 'info', 3000);
        return;
      }
      const md = buildMarkdown();
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const fname = `${(meeting.title || 'meeting').replace(/[\\/:*?"<>|]/g, '_')}_${safeFormatDate(meeting.ended_at || meeting.started_at, 'yyyyMMdd_HHmm', 'export')}.md`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // 클립보드에도 복사 (실패해도 무시)
      navigator.clipboard?.writeText?.(md).catch(() => {});
      addToast?.('마크다운으로 내보냈습니다 (파일 저장 + 클립보드)', 'success', 3000);
    } catch (err) {
      console.error('[export]', err);
      addToast?.('내보내기 실패', 'error', 3000);
    }
  };

  // V5: 이 회의에 연결된 태스크 필터링
  const meetingTasks = useMemo(
    () => allTasks.filter((t) => t.meeting_id === meeting.id),
    [allTasks, meeting.id]
  );

  // 초기 로드 시 태스크 수가 적으면 자동 펼침 (첫 1회만)
  const didAutoExpandRef = useRef(false);
  useEffect(() => {
    if (didAutoExpandRef.current) return;
    const total = (allTasks.filter((t) => t.meeting_id === meeting.id)).length;
    if (total > 0 && total <= 3) {
      setTasksExpanded(true);
      didAutoExpandRef.current = true;
    } else if (total > 3) {
      didAutoExpandRef.current = true;  // 접힘 상태 유지
    }
    // total === 0 이면 태스크 없어 표시 안 되므로 체크 skip
  }, [allTasks, meeting.id]);

  // V7: 배정 가능한 사용자 (회의 참여자 + 현재 사용자)
  const assignableUsers = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      if (m.is_ai) continue;
      if (!m.user_id || !m.user) continue;
      if (!map.has(m.user_id)) {
        map.set(m.user_id, {
          id: m.user_id,
          name: m.user.name || '알 수 없음',
          color: m.user.color || m.user.avatar_color || '#723CEB',
        });
      }
    }
    if (user && !map.has(user.id)) {
      map.set(user.id, {
        id: user.id,
        name: user.name || '나',
        color: user.avatar_color || '#723CEB',
      });
    }
    return [...map.values()];
  }, [messages, user]);

  // V5: AI 제안 태스크 중 아직 등록되지 않은 것만 후보로 표시
  const pendingSuggestions = useMemo(() => {
    const items = summaryData?.action_items || [];
    if (items.length === 0) return [];
    const registeredTitles = new Set(
      meetingTasks.map((t) => (t.title || '').trim().toLowerCase())
    );
    return items.filter(
      (a) => !registeredTitles.has((a.title || '').trim().toLowerCase())
    );
  }, [summaryData, meetingTasks]);

  // V5: 태스크 통계
  const taskStats = useMemo(() => {
    const total = meetingTasks.length;
    const done = meetingTasks.filter((t) => t.status === 'done').length;
    return { total, done };
  }, [meetingTasks]);

  // V8: 필터 카운트
  const taskFilterCounts = useMemo(() => ({
    all: meetingTasks.length,
    todo: meetingTasks.filter((t) => t.status === 'todo').length,
    in_progress: meetingTasks.filter((t) => t.status === 'in_progress').length,
    done: meetingTasks.filter((t) => t.status === 'done').length,
    ai: meetingTasks.filter((t) => t.ai_suggested).length,
  }), [meetingTasks]);

  // V8: 필터 적용된 태스크
  const filteredTasks = useMemo(() => {
    if (taskFilter === 'all') return meetingTasks;
    if (taskFilter === 'ai') return meetingTasks.filter((t) => t.ai_suggested);
    return meetingTasks.filter((t) => t.status === taskFilter);
  }, [meetingTasks, taskFilter]);

  // V6: 3단계 상태 사이클 (todo → in_progress → done → todo)
  const cycleStatus = (current) => {
    if (current === 'todo') return 'in_progress';
    if (current === 'in_progress') return 'done';
    return 'todo';
  };

  const handleToggleTask = async (task) => {
    const newStatus = cycleStatus(task.status);
    setPendingTaskIds((prev) => { const s = new Set(prev); s.add(task.id); return s; });
    // 낙관적 업데이트
    updateTaskInStore(task.id, { status: newStatus });
    try {
      if (SUPABASE_ENABLED && !isDemoTask(task.id) && !isDemoMeeting(meeting.id)) {
        const { error } = await supabase
          .from('tasks')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', task.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error('[toggleTask]', err);
      // 롤백
      updateTaskInStore(task.id, { status: task.status });
      addToast?.('태스크 상태 변경 실패', 'error', 3000);
    } finally {
      setPendingTaskIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  };

  // V9: 외부 푸시 공통 유틸
  const markPushing = (taskId, target, on) => {
    setPushingTaskIds((prev) => {
      const s = new Set(prev);
      const key = `${taskId}__${target}`;
      if (on) s.add(key); else s.delete(key);
      return s;
    });
  };
  const isPushingTo = (taskId, target) => pushingTaskIds.has(`${taskId}__${target}`);

  const formatTaskSlackText = (task) => {
    const pri = getPriorityInfo(task.priority);
    const lines = [`📌 *${task.title}*`];
    const meta = [];
    if (pri) meta.push(`${pri.label}`);
    if (task.assignee?.name || task.assignee_name) meta.push(`담당: ${task.assignee?.name || task.assignee_name}`);
    if (task.due_date) meta.push(`마감: ${task.due_date}`);
    if (meta.length > 0) lines.push(`_${meta.join(' · ')}_`);
    if (task.description) lines.push(task.description);
    if (meeting.title) lines.push(`\n회의: _${meeting.title}_`);
    return lines.join('\n');
  };

  // V10: 실제 Slack 전송 수행 (destination = slack user id 또는 channel id)
  const sendSlackTo = async (task, destination, mode) => {
    if (!SUPABASE_ENABLED || isDemoMeeting(meeting.id)) {
      await new Promise((r) => setTimeout(r, 500));
      addToast?.(`(데모) Slack ${mode === 'dm' ? 'DM' : '채널'}로 푸시 처리`, 'info', 2500);
      return true;
    }
    const { error } = await supabase.functions.invoke('slack-notify', {
      body: {
        event: 'task_assigned',
        payload: {
          assignee_slack_id: destination,
          title: task.title,
          due_date: task.due_date,
          priority: task.priority,
          text: formatTaskSlackText(task),
        },
      },
    });
    if (error) throw error;
    return true;
  };

  // V9+V10: Slack 푸시 (담당자 DM 우선, 없으면 매핑 모달 또는 채널 폴백)
  const handlePushSlack = async (task, { forceChannel = false } = {}) => {
    setPushMenuOpenId(null);

    const assigneeSlackId = task.assignee?.slack_user_id;
    const hasAssignee = !!task.assignee_id;
    const channelId = teamIntegrations.slack_channel_id;

    // 담당자 있고 매핑 없음 → 매핑 모달
    if (hasAssignee && !assigneeSlackId && !forceChannel) {
      setSlackMapModal({
        task,
        assigneeId: task.assignee_id,
        assigneeName: task.assignee?.name || task.assignee_name || '담당자',
        slackId: '',
      });
      return;
    }

    // 담당자 DM
    if (assigneeSlackId && !forceChannel) {
      markPushing(task.id, 'slack', true);
      try {
        await sendSlackTo(task, assigneeSlackId, 'dm');
        addToast?.(`${task.assignee?.name || task.assignee_name}님에게 Slack DM을 보냈습니다`, 'success', 2500);
      } catch (err) {
        console.error('[pushSlack dm]', err);
        addToast?.('Slack DM 전송 실패', 'error', 3000);
      } finally {
        markPushing(task.id, 'slack', false);
      }
      return;
    }

    // 채널 폴백
    if (!channelId) {
      addToast?.('Slack 채널이 설정되지 않았습니다 (설정 → 통합)', 'info', 3500);
      return;
    }
    markPushing(task.id, 'slack', true);
    try {
      await sendSlackTo(task, channelId, 'channel');
      addToast?.('Slack 채널로 전송했습니다', 'success', 2500);
    } catch (err) {
      console.error('[pushSlack channel]', err);
      addToast?.('Slack 전송 실패', 'error', 3000);
    } finally {
      markPushing(task.id, 'slack', false);
    }
  };

  // V10: Slack ID 매핑 저장 + DM 전송
  const handleSaveSlackMapping = async () => {
    if (!slackMapModal) return;
    const slackId = slackMapModal.slackId.trim();
    if (!slackId) return;
    setSavingSlackMap(true);
    try {
      // users 테이블 업데이트 — RLS 정책 실패 감지를 위해 select()로 반환 행 수 검증
      if (SUPABASE_ENABLED && !isDemoMeeting(meeting.id)) {
        const { data, error } = await supabase
          .from('users')
          .update({ slack_user_id: slackId })
          .eq('id', slackMapModal.assigneeId)
          .select('id, slack_user_id')
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          throw new Error(
            '권한 부족 — 같은 팀이 아니거나 RLS 정책이 적용되지 않았습니다. ' +
            '관리자에게 migration 016 적용 여부를 확인하세요.'
          );
        }
      }
      // 로컬 태스크 객체에도 반영 (모든 관련 태스크)
      const affected = allTasks.filter((t) => t.assignee_id === slackMapModal.assigneeId);
      affected.forEach((t) => {
        updateTaskInStore(t.id, {
          assignee: t.assignee ? { ...t.assignee, slack_user_id: slackId } : null,
        });
      });
      // DM 전송
      markPushing(slackMapModal.task.id, 'slack', true);
      try {
        await sendSlackTo(slackMapModal.task, slackId, 'dm');
        addToast?.(`${slackMapModal.assigneeName}님에게 DM 전송 + ID 저장 완료`, 'success', 3000);
      } catch (err) {
        console.error('[pushSlack mapped]', err);
        addToast?.('ID는 저장했으나 DM 전송에 실패했습니다', 'error', 3000);
      } finally {
        markPushing(slackMapModal.task.id, 'slack', false);
      }
      setSlackMapModal(null);
    } catch (err) {
      console.error('[saveSlackMapping]', err);
      addToast?.(err?.message || 'Slack ID 저장 실패', 'error', 4000);
    } finally {
      setSavingSlackMap(false);
    }
  };

  // V9+수정: Notion 푸시 (create 또는 update)
  // opts.silent=true: 개별 토스트 숨김 (bulk 호출 시)
  // 에러 발생 시 throw — 호출자가 처리
  const handlePushNotion = async (task, { silent = false } = {}) => {
    if (!silent) setPushMenuOpenId(null);
    if (!teamIntegrations.notion_database_id) {
      if (!silent) addToast?.('Notion DB가 설정되지 않았습니다 (설정 → 통합)', 'info', 3500);
      throw new Error('Notion DB not configured');
    }
    markPushing(task.id, 'notion', true);
    try {
      if (!SUPABASE_ENABLED || isDemoMeeting(meeting.id) || isDemoTask(task.id)) {
        await new Promise((r) => setTimeout(r, 500));
        updateTaskInStore(task.id, { notion_block_id: `mock-notion-${task.id}` });
        if (!silent) addToast?.('(데모) Notion에 등록한 것으로 처리했습니다', 'info', 2500);
        return;
      }
      if (task.notion_block_id) {
        // 업데이트
        const { error } = await supabase.functions.invoke('notion-sync', {
          body: {
            action: 'update_task',
            payload: {
              notion_block_id: task.notion_block_id,
              status: task.status,
            },
          },
        });
        if (error) throw error;
        if (!silent) addToast?.('Notion 태스크를 업데이트했습니다', 'success', 2500);
      } else {
        const { error } = await supabase.functions.invoke('notion-sync', {
          body: { action: 'create_task', payload: { task_id: task.id } },
        });
        if (error) throw error;
        // Edge function이 DB에 notion_block_id를 저장하므로 realtime으로 반영됨.
        // 즉각 피드백을 위해 한번 refetch
        const { data: fresh } = await supabase
          .from('tasks')
          .select('notion_block_id')
          .eq('id', task.id)
          .maybeSingle();
        if (fresh?.notion_block_id) updateTaskInStore(task.id, { notion_block_id: fresh.notion_block_id });
        if (!silent) addToast?.('Notion에 등록했습니다', 'success', 2500);
      }
    } catch (err) {
      console.error('[pushNotion]', err);
      if (!silent) addToast?.('Notion 연동 실패', 'error', 3000);
      throw err;
    } finally {
      markPushing(task.id, 'notion', false);
    }
  };

  // V9: 모든 등록되지 않은 태스크를 Notion에 일괄 등록
  const handleBulkPushNotion = async () => {
    if (bulkPushing) return;
    if (!teamIntegrations.notion_database_id) {
      addToast?.('Notion DB가 설정되지 않았습니다', 'info', 3500);
      return;
    }
    const pending = meetingTasks.filter((t) => !t.notion_block_id);
    if (pending.length === 0) {
      addToast?.('모든 태스크가 이미 Notion에 등록되어 있습니다', 'info', 2500);
      return;
    }
    setBulkPushing(true);
    // 병렬 처리 — 과도한 동시성 방지 위해 concurrency 3으로 제한
    const CONCURRENCY = 3;
    let ok = 0, fail = 0;
    const queue = [...pending];
    const worker = async () => {
      while (queue.length > 0) {
        const t = queue.shift();
        if (!t) break;
        try {
          await handlePushNotion(t, { silent: true });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    setBulkPushing(false);
    addToast?.(
      `Notion 등록 완료 — 성공 ${ok}${fail ? ` · 실패 ${fail}` : ''}`,
      fail > 0 ? 'error' : 'success',
      3500
    );
  };

  // V7: 태스크 필드 공통 업데이트 헬퍼
  const updateTaskField = async (task, patch, rollbackPatch) => {
    setPendingTaskIds((prev) => { const s = new Set(prev); s.add(task.id); return s; });
    updateTaskInStore(task.id, patch);
    try {
      if (SUPABASE_ENABLED && !isDemoTask(task.id) && !isDemoMeeting(meeting.id)) {
        // Supabase에 저장되지 않는 파생 필드(assignee 객체)는 제외
        const { assignee, ...dbPatch } = patch;
        const { error } = await supabase
          .from('tasks')
          .update({ ...dbPatch, updated_at: new Date().toISOString() })
          .eq('id', task.id);
        if (error) throw error;
      }
      return true;
    } catch (err) {
      console.error('[updateTaskField]', err);
      updateTaskInStore(task.id, rollbackPatch);
      addToast?.('태스크 업데이트 실패', 'error', 3000);
      return false;
    } finally {
      setPendingTaskIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  };

  // V7: 담당자 변경
  const handleAssigneeChange = async (task, assigneeUser) => {
    setAssigneeOpenId(null);
    const patch = assigneeUser
      ? {
          assignee_id: assigneeUser.id,
          assignee_name: assigneeUser.name,
          assignee: assigneeUser,
        }
      : { assignee_id: null, assignee_name: null, assignee: null };
    const rollback = {
      assignee_id: task.assignee_id || null,
      assignee_name: task.assignee_name || null,
      assignee: task.assignee || null,
    };
    await updateTaskField(task, patch, rollback);
  };

  // V7: 기한 변경
  const handleDueDateChange = async (task, newDate) => {
    setDueOpenId(null);
    const patch = { due_date: newDate || null };
    const rollback = { due_date: task.due_date || null };
    await updateTaskField(task, patch, rollback);
  };

  // V7: 태스크 삭제
  const handleDeleteTask = async (task) => {
    setDeletingTaskId(null);
    setPendingTaskIds((prev) => { const s = new Set(prev); s.add(task.id); return s; });
    // 낙관적 제거
    removeTaskFromStore(task.id);
    try {
      if (SUPABASE_ENABLED && !isDemoTask(task.id) && !isDemoMeeting(meeting.id)) {
        const { error } = await supabase.from('tasks').delete().eq('id', task.id);
        if (error) throw error;
      }
      // 성공 → 관련 UI state 모두 정리 (메모리 누수 방지)
      setNewSubtaskInputs((prev) => { const c = { ...prev }; delete c[task.id]; return c; });
      setExpandedTaskIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
      setAssigneeOpenId((prev) => (prev === task.id ? null : prev));
      setDueOpenId((prev) => (prev === task.id ? null : prev));
      setPushMenuOpenId((prev) => (prev === task.id ? null : prev));
      setEditingTaskId((prev) => (prev === task.id ? null : prev));
      setEditingDescId((prev) => (prev === task.id ? null : prev));
      addToast?.('태스크를 삭제했습니다', 'success', 2500);
    } catch (err) {
      console.error('[deleteTask]', err);
      addTaskToStore(task); // 롤백
      addToast?.('태스크 삭제 실패', 'error', 3000);
    } finally {
      setPendingTaskIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  };

  // V7: 태스크 description에서 원본 메시지 찾기 (V6에서 저장한 패턴)
  // 단일 태스크 계산 함수 — findSourceMessageMap 빌드용
  const findSourceMessageForTask = (task) => {
    const desc = task.description || '';
    const m = desc.match(/^원본 메시지:\n([\s\S]+)$/);
    if (!m) return null;
    const needle = m[1].trim().slice(0, 60).toLowerCase();
    if (needle.length < 10) return null;
    return messages.find((msg) => cleanText(msg.content).toLowerCase().includes(needle)) || null;
  };

  // V7+성능 수정: 태스크 id → 원본 메시지 id 맵 사전 계산
  // (렌더링 시 매 태스크마다 O(messages) find() 호출하던 것 제거)
  const sourceMessageIdMap = useMemo(() => {
    const map = {};
    for (const t of meetingTasks) {
      const src = findSourceMessageForTask(t);
      if (src) map[t.id] = src.id;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingTasks, messages]);

  // V7: 원본 메시지로 스크롤
  const handleJumpToSource = (task) => {
    const msg = findSourceMessageForTask(task);
    if (!msg) {
      addToast?.('원본 메시지를 찾을 수 없습니다', 'info', 2500);
      return;
    }
    const el = messageRefs.current[msg.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msg.id);
      setTimeout(() => setHighlightedMsgId(null), 2400);
    }
  };

  // V8: 태스크 펼침 토글
  const toggleTaskExpand = (taskId) => {
    setExpandedTaskIds((prev) => {
      const s = new Set(prev);
      if (s.has(taskId)) s.delete(taskId); else s.add(taskId);
      return s;
    });
  };

  // V8: 서브태스크 CRUD
  const writeSubtasks = async (task, nextSubtasks) => {
    await updateTaskField(
      task,
      { subtasks: nextSubtasks },
      { subtasks: task.subtasks || [] }
    );
  };

  const handleAddSubtask = async (task) => {
    const draft = (newSubtaskInputs[task.id] || '').trim();
    if (!draft) return;
    const next = [...(task.subtasks || []), { title: draft, done: false }];
    setNewSubtaskInputs((prev) => ({ ...prev, [task.id]: '' }));
    await writeSubtasks(task, next);
  };

  const handleToggleSubtask = async (task, idx) => {
    const next = (task.subtasks || []).map((s, i) =>
      i === idx ? { ...s, done: !s.done } : s
    );
    await writeSubtasks(task, next);
  };

  const handleDeleteSubtask = async (task, idx) => {
    const next = (task.subtasks || []).filter((_, i) => i !== idx);
    await writeSubtasks(task, next);
  };

  const handleEditSubtaskTitle = async (task, idx, newTitle) => {
    const trimmed = (newTitle || '').trim();
    if (!trimmed) { await handleDeleteSubtask(task, idx); return; }
    const next = (task.subtasks || []).map((s, i) =>
      i === idx ? { ...s, title: trimmed } : s
    );
    await writeSubtasks(task, next);
  };

  // V8: description 인라인 편집 저장
  const handleSaveDescription = async (task) => {
    const trimmed = editingDesc.trim();
    if (trimmed === (task.description || '').trim()) {
      setEditingDescId(null);
      setEditingDesc('');
      return;
    }
    await updateTaskField(
      task,
      { description: trimmed || null },
      { description: task.description || null }
    );
    setEditingDescId(null);
    setEditingDesc('');
  };

  // V6: 제목 인라인 편집 저장
  const handleSaveTitle = async (task) => {
    const trimmed = editingTitle.trim();
    if (!trimmed || trimmed === task.title) {
      setEditingTaskId(null);
      setEditingTitle('');
      return;
    }
    setPendingTaskIds((prev) => { const s = new Set(prev); s.add(task.id); return s; });
    updateTaskInStore(task.id, { title: trimmed });
    try {
      if (SUPABASE_ENABLED && !isDemoTask(task.id) && !isDemoMeeting(meeting.id)) {
        const { error } = await supabase
          .from('tasks')
          .update({ title: trimmed, updated_at: new Date().toISOString() })
          .eq('id', task.id);
        if (error) throw error;
      }
      addToast?.('제목을 변경했습니다', 'success', 2000);
    } catch (err) {
      console.error('[saveTitle]', err);
      updateTaskInStore(task.id, { title: task.title });
      addToast?.('제목 변경 실패', 'error', 3000);
    } finally {
      setPendingTaskIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
      setEditingTaskId(null);
      setEditingTitle('');
    }
  };

  // V6: 메시지에서 태스크 즉석 생성
  const handleQuickCreateFromMessage = (msg) => {
    const cleaned = cleanText(msg.content);
    // 긴 메시지는 앞 60자만 제목으로
    const title = cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned;
    setQuickCreateSource({
      messageId: msg.id,
      title,
      originalContent: cleaned,
      priority: 'medium',
    });
  };

  const handleConfirmQuickCreate = async () => {
    if (!quickCreateSource || !quickCreateSource.title.trim() || creatingFromMsg) return;
    setCreatingFromMsg(true);
    try {
      const row = {
        title: quickCreateSource.title.trim(),
        description: quickCreateSource.originalContent !== quickCreateSource.title
          ? `원본 메시지:\n${quickCreateSource.originalContent}`
          : null,
        status: 'todo',
        priority: quickCreateSource.priority,
        meeting_id: meeting.id,
        meeting_title: meeting.title || null,
        ai_suggested: false,
      };
      if (SUPABASE_ENABLED && !isDemoMeeting(meeting.id)) {
        const { data, error } = await supabase
          .from('tasks')
          .insert([row])
          .select()
          .single();
        if (error) throw error;
        addTaskToStore(data);
      } else {
        addTaskToStore({
          ...row,
          id: `t-local-${Date.now()}`,
          created_at: new Date().toISOString(),
        });
      }
      addToast?.('태스크를 생성했습니다', 'success', 2500);
      setQuickCreateSource(null);
      setTasksExpanded(true);
    } catch (err) {
      console.error('[quickCreate]', err);
      addToast?.('태스크 생성 실패', 'error', 3000);
    } finally {
      setCreatingFromMsg(false);
    }
  };

  // V5: AI 제안을 실제 태스크로 등록
  const handleRegisterSuggestions = async () => {
    if (pendingSuggestions.length === 0 || registering) return;
    setRegistering(true);
    try {
      if (SUPABASE_ENABLED && !isDemoMeeting(meeting.id)) {
        const rows = pendingSuggestions.map((a) => ({
          title: a.title || '제목 없음',
          description: a.assignee_hint || a.due_hint
            ? [a.assignee_hint && `담당 힌트: ${a.assignee_hint}`, a.due_hint && `기한 힌트: ${a.due_hint}`].filter(Boolean).join('\n')
            : null,
          status: 'todo',
          priority: ['urgent', 'high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
          meeting_id: meeting.id,
          meeting_title: meeting.title || null,
          ai_suggested: true,
        }));
        const { data, error } = await supabase
          .from('tasks')
          .insert(rows)
          .select();
        if (error) throw error;
        (data || []).forEach((t) => addTaskToStore(t));
        addToast?.(`${data?.length ?? 0}개 태스크를 등록했습니다`, 'success', 3000);
      } else {
        // 데모 모드: 로컬 추가
        const now = new Date().toISOString();
        pendingSuggestions.forEach((a, i) => {
          addTaskToStore({
            id: `t-local-${Date.now()}-${i}`,
            title: a.title || '제목 없음',
            description: null,
            status: 'todo',
            priority: a.priority || 'medium',
            meeting_id: meeting.id,
            meeting_title: meeting.title,
            ai_suggested: true,
            assignee_name: a.assignee_hint || null,
            created_at: now,
          });
        });
        addToast?.(`${pendingSuggestions.length}개 태스크를 등록했습니다`, 'success', 3000);
      }
    } catch (err) {
      console.error('[registerSuggestions]', err);
      addToast?.('태스크 등록 실패', 'error', 3000);
    } finally {
      setRegistering(false);
    }
  };



  // 사이드바 어젠다 리스트
  const agendaList = useMemo(() => {
    const list = agendas.map((a) => ({
      key: a.id,
      title: a.title,
      status: a.status,
      duration: a.duration_minutes,
      count: grouped.get(a.id)?.length ?? 0,
    }));
    const unassignedCount = grouped.get(UNASSIGNED_KEY)?.length ?? 0;
    if (unassignedCount > 0) {
      list.push({
        key: UNASSIGNED_KEY,
        title: '어젠다 외 대화',
        status: null,
        duration: null,
        count: unassignedCount,
      });
    }
    return list;
  }, [agendas, grouped]);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* V10: Slack ID 매핑 모달 */}
      {slackMapModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={() => !savingSlackMap && setSlackMapModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-secondary border border-border-subtle rounded-xl p-5 max-w-md w-full mx-4 shadow-lg"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-md bg-brand-purple/15 flex items-center justify-center">
                <Send size={16} className="text-brand-purple" strokeWidth={2.4} />
              </div>
              <h3 className="text-sm font-semibold text-txt-primary">
                {slackMapModal.assigneeName}님의 Slack ID
              </h3>
              <button
                onClick={() => setSlackMapModal(null)}
                disabled={savingSlackMap}
                className="ml-auto p-1 text-txt-muted hover:text-txt-primary rounded disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-txt-secondary mb-3 leading-relaxed">
              Slack에서 해당 사용자의 <strong className="text-txt-primary">Member ID</strong>를 입력하세요.
              한번 저장하면 이후 이 사용자에게 자동으로 DM이 전송됩니다.
            </p>

            {/* 도움말 */}
            <div className="mb-3 p-2.5 rounded-md bg-bg-tertiary/50 border-l-2 border-brand-purple/50">
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1">
                Member ID 찾는 법
              </p>
              <p className="text-[11px] text-txt-secondary leading-relaxed">
                Slack에서 프로필 클릭 → 더보기(⋯) → <strong>"멤버 ID 복사"</strong><br />
                형식 예시: <code className="text-brand-purple">U01ABC23DEF</code>
              </p>
            </div>

            <label className="block mb-4">
              <span className="text-[11px] text-txt-muted font-medium mb-1 block">Slack Member ID</span>
              <input
                autoFocus
                value={slackMapModal.slackId}
                onChange={(e) => setSlackMapModal((s) => ({ ...s, slackId: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveSlackMapping();
                }}
                placeholder="U01ABC23DEF"
                className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-mono text-txt-primary outline-none focus:border-brand-purple/60"
              />
            </label>

            <div className="flex gap-2">
              {teamIntegrations.slack_channel_id && (
                <button
                  onClick={() => {
                    const task = slackMapModal.task;
                    setSlackMapModal(null);
                    handlePushSlack(task, { forceChannel: true });
                  }}
                  disabled={savingSlackMap}
                  className="px-4 py-2 rounded-lg border border-border-default text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
                >
                  건너뛰고 채널로
                </button>
              )}
              <button
                onClick={() => setSlackMapModal(null)}
                disabled={savingSlackMap}
                className="flex-1 px-4 py-2 rounded-lg border border-border-default text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSaveSlackMapping}
                disabled={savingSlackMap || !slackMapModal.slackId.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingSlackMap ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Send size={16} strokeWidth={2.6} />
                    저장 + DM 전송
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V6: 메시지 → 태스크 즉석 생성 모달 */}
      {quickCreateSource && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={() => !creatingFromMsg && setQuickCreateSource(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-secondary border border-border-subtle rounded-xl p-5 max-w-md w-full mx-4 shadow-lg"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-md bg-brand-purple/15 flex items-center justify-center">
                <ListTodo size={16} className="text-brand-purple" strokeWidth={2.4} />
              </div>
              <h3 className="text-sm font-semibold text-txt-primary">태스크로 만들기</h3>
              <button
                onClick={() => setQuickCreateSource(null)}
                disabled={creatingFromMsg}
                className="ml-auto p-1 text-txt-muted hover:text-txt-primary rounded disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            {/* 원본 메시지 미리보기 */}
            <div className="mb-3 p-2.5 rounded-md bg-bg-tertiary/50 border-l-2 border-brand-purple/50">
              <p className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider mb-1">
                원본 메시지
              </p>
              <p className="text-xs text-txt-secondary line-clamp-3 leading-relaxed">
                {quickCreateSource.originalContent}
              </p>
            </div>

            {/* 제목 */}
            <label className="block mb-3">
              <span className="text-[11px] text-txt-muted font-medium mb-1 block">제목</span>
              <input
                autoFocus
                value={quickCreateSource.title}
                onChange={(e) => setQuickCreateSource((s) => ({ ...s, title: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleConfirmQuickCreate();
                }}
                className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-txt-primary outline-none focus:border-brand-purple/60"
                placeholder="태스크 제목"
              />
            </label>

            {/* 우선순위 */}
            <div className="mb-4">
              <span className="text-[11px] text-txt-muted font-medium mb-1.5 block">우선순위</span>
              <div className="flex gap-1.5 flex-wrap">
                {['urgent', 'high', 'medium', 'low'].map((p) => {
                  const info = getPriorityInfo(p);
                  const active = quickCreateSource.priority === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setQuickCreateSource((s) => ({ ...s, priority: p }))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        active
                          ? `${info.bg} ${info.tone} ${info.border}`
                          : 'bg-bg-tertiary text-txt-secondary border-border-subtle hover:border-border-default'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={() => setQuickCreateSource(null)}
                disabled={creatingFromMsg}
                className="flex-1 px-4 py-2 rounded-lg border border-border-default text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleConfirmQuickCreate}
                disabled={creatingFromMsg || !quickCreateSource.title.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {creatingFromMsg ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    생성 중...
                  </>
                ) : (
                  <>
                    <Plus size={16} strokeWidth={2.6} />
                    태스크 생성
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V4: 단축키 힌트 오버레이 */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-secondary border border-border-subtle rounded-xl p-6 max-w-sm w-full mx-4 shadow-lg"
          >
            <div className="flex items-center gap-2 mb-4">
              <Keyboard size={18} className="text-brand-purple" />
              <h3 className="text-sm font-semibold text-txt-primary">키보드 단축키</h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="ml-auto p-1 text-txt-muted hover:text-txt-primary rounded"
              >
                <X size={16} />
              </button>
            </div>
            <dl className="space-y-2.5 text-xs">
              {[
                ['/', '대화 검색 열기'],
                ['↑ / ↓', '이전 · 다음 어젠다로 이동'],
                ['Esc', '검색 닫기 · 필터 해제 · 힌트 닫기'],
                ['?', '이 단축키 힌트 열기/닫기'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="shrink-0 min-w-[56px] text-center px-2 py-1 bg-bg-tertiary border border-border-subtle rounded text-[11px] font-mono font-semibold text-txt-primary">
                    {key}
                  </kbd>
                  <span className="text-txt-secondary">{desc}</span>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* ═══ 헤더 ═══ */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-border-divider">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button
            onClick={() => navigate('/meetings')}
            className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors shrink-0"
            title="회의 목록으로"
          >
            <X size={18} />
          </button>
          <h1 className="text-base md:text-[22px] font-medium text-txt-primary tracking-tight truncate">
            {meeting.title}
          </h1>
          <Badge variant="outline">
            <Check size={13} strokeWidth={2.6} className="mr-1" />
            완료
          </Badge>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {/* 검색 */}
          {searchOpen ? (
            <div className="flex items-center gap-1 bg-bg-tertiary rounded-md px-3 py-1.5 border border-border-subtle focus-within:border-brand-purple/50">
              <Search size={16} className="text-txt-muted shrink-0" />
              <input
                ref={searchInputRef}
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="대화 검색..."
                className="bg-transparent text-sm text-txt-primary placeholder:text-txt-muted outline-none w-32 lg:w-48"
              />
              {searchQuery && (
                <span className="text-[10px] text-txt-muted shrink-0">{searchMatchCount}</span>
              )}
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                className="text-txt-muted hover:text-txt-primary"
                title="검색 닫기"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
              title="검색 ( / )"
            >
              <Search size={18} />
            </button>
          )}

          {/* V4: 마크다운 내보내기 */}
          <button
            onClick={handleExportMarkdown}
            className="p-2 text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
            title="마크다운으로 내보내기"
          >
            <Download size={18} />
          </button>

          {/* V4: 단축키 도움말 */}
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className={`p-2 rounded-md transition-colors ${showShortcuts ? 'text-brand-purple bg-brand-purple/10' : 'text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary'}`}
            title="단축키 (?)"
          >
            <Keyboard size={18} />
          </button>

          {/* 회의록 보기 — 주요 CTA */}
          <Link
            to={`/summaries/${meeting.id}`}
            className="inline-flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-md text-xs md:text-sm font-semibold text-white bg-brand-purple hover:opacity-90 shadow-sm hover:shadow-glow transition-all"
            title="AI 회의록 요약 보기"
          >
            <Sparkles size={16} strokeWidth={2.4} />
            <span>회의록 보기</span>
          </Link>
        </div>
      </div>

      {/* ═══ 메타 바 ═══ */}
      <div className="flex items-center gap-4 px-3 md:px-6 py-2.5 border-b border-border-divider bg-bg-secondary/40 text-[11px] text-txt-secondary overflow-x-auto">
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Clock size={14} className="text-txt-muted" />
          {safeFormatDate(meeting.ended_at || meeting.started_at, 'yyyy.MM.dd HH:mm', '—')}
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="text-txt-muted">소요</span>
          <span className="text-txt-primary font-medium">
            {formatDuration(meeting.started_at, meeting.ended_at)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <Users size={14} className="text-txt-muted" />
          <span className="text-txt-primary font-medium">{stats.participants}</span>명 참여
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <MessageSquare size={14} className="text-txt-muted" />
          <span className="text-txt-primary font-medium">{stats.total}</span>건
          <span className="text-txt-muted">(AI {stats.ai})</span>
        </span>

        <span className="flex-1" />

        {/* V2: 옵션 토글 */}
        <label className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer select-none" title="agenda_id가 없는 메시지를 바로 앞 어젠다로 병합">
          <input
            type="checkbox"
            checked={mergeUnassigned}
            onChange={(e) => setMergeUnassigned(e.target.checked)}
            className="w-3 h-3 accent-brand-purple"
          />
          <span className="text-txt-muted">어젠다 병합</span>
        </label>
        {summaryData && citedCount > 0 && (
          <label className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer select-none" title="회의록에 인용된 메시지만 표시">
            <input
              type="checkbox"
              checked={onlyCited}
              onChange={(e) => setOnlyCited(e.target.checked)}
              className="w-3 h-3 accent-brand-purple"
            />
            <Quote size={13} className="text-txt-muted" />
            <span className="text-txt-muted">인용만 ({citedCount})</span>
          </label>
        )}
      </div>

      {/* ═══ V5: 태스크 패널 — 항상 표시 (태스크 0건이어도 섹션 노출) ═══ */}
      <div className="border-b border-border-divider bg-bg-secondary/30">
          <button
            onClick={() => setTasksExpanded((v) => !v)}
            className="w-full flex items-center gap-2.5 px-3 md:px-6 py-2.5 hover:bg-bg-tertiary/40 transition-colors"
          >
            <div className="w-7 h-7 rounded-md bg-brand-purple/15 flex items-center justify-center shrink-0">
              <ListTodo size={16} className="text-brand-purple" strokeWidth={2.4} />
            </div>
            <div className="flex items-center gap-2.5 flex-1 text-left">
              <span className="text-sm font-semibold text-txt-primary">후속 태스크</span>
              {/* 총 개수 — 0 포함 항상 크게 표시 */}
              <span className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md border ${
                meetingTasks.length > 0
                  ? 'bg-brand-purple/10 border-brand-purple/20'
                  : 'bg-bg-tertiary border-border-subtle'
              }`}>
                <span className={`text-xl md:text-2xl font-bold leading-none ${
                  meetingTasks.length > 0 ? 'text-brand-purple' : 'text-txt-muted'
                }`}>
                  {taskStats.total}
                </span>
                <span className={`text-[10px] font-medium ${
                  meetingTasks.length > 0 ? 'text-brand-purple/80' : 'text-txt-muted'
                }`}>개</span>
              </span>
              {meetingTasks.length > 0 ? (
                <>
                  {/* 완료 진행 */}
                  <span className="text-xs text-txt-muted hidden sm:inline-flex items-baseline gap-0.5">
                    <span className="text-status-success font-semibold text-sm">{taskStats.done}</span>
                    <span>/ {taskStats.total} 완료</span>
                  </span>
                  {/* 진행률 바 */}
                  <div className="hidden md:flex flex-1 max-w-[180px] h-1.5 rounded-full bg-bg-tertiary overflow-hidden mx-1">
                    <div
                      className="h-full bg-status-success transition-all"
                      style={{ width: `${taskStats.total > 0 ? (taskStats.done / taskStats.total) * 100 : 0}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className="text-xs text-txt-muted hidden sm:inline">
                  {pendingSuggestions.length > 0 ? 'AI 제안 대기' : '등록된 태스크 없음'}
                </span>
              )}
              {pendingSuggestions.length > 0 && (
                <Badge variant="purple" className="!text-[10px]">
                  AI 제안 {pendingSuggestions.length}건
                </Badge>
              )}
            </div>
            <span className="text-txt-muted shrink-0">
              {tasksExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>

          {tasksExpanded && (
            // max-height 제한 + 내부 스크롤 → 태스크가 많아도 채팅/사이드바 시야 보장
            // 모바일: 40vh, 데스크톱: 45vh
            <div className="px-3 md:px-6 pb-4 space-y-2 max-h-[40vh] md:max-h-[45vh] overflow-y-auto overscroll-contain scrollbar-hide">
              {/* V8: 태스크 필터 탭 + V9: 일괄 푸시 */}
              {meetingTasks.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap pb-1">
                  {[
                    { id: 'all', label: '전체' },
                    { id: 'todo', label: '할 일' },
                    { id: 'in_progress', label: '진행 중' },
                    { id: 'done', label: '완료' },
                    { id: 'ai', label: 'AI 제안' },
                  ].map((f) => {
                    const count = taskFilterCounts[f.id] || 0;
                    const active = taskFilter === f.id;
                    if (f.id !== 'all' && count === 0) return null;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setTaskFilter(f.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          active
                            ? 'bg-brand-purple/15 text-brand-purple border border-brand-purple/30'
                            : 'text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary border border-transparent'
                        }`}
                      >
                        {f.id === 'ai' && <Sparkles size={12} />}
                        {f.label}
                        <span className={active ? 'text-brand-purple' : 'text-txt-muted'}>{count}</span>
                      </button>
                    );
                  })}

                  {/* V9: 일괄 푸시 */}
                  {teamIntegrations.notion_database_id && (
                    <button
                      onClick={handleBulkPushNotion}
                      disabled={bulkPushing}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-txt-secondary hover:text-brand-purple hover:bg-brand-purple/10 border border-border-subtle hover:border-brand-purple/30 transition-colors disabled:opacity-50"
                      title="등록되지 않은 모든 태스크를 Notion에 전송"
                    >
                      {bulkPushing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ExternalLink size={12} />
                      )}
                      Notion 일괄 등록
                    </button>
                  )}
                </div>
              )}

              {/* 등록된 태스크 */}
              {filteredTasks.length === 0 && meetingTasks.length > 0 ? (
                <div className="text-center py-6 text-xs text-txt-muted">
                  이 필터에 해당하는 태스크가 없습니다.
                </div>
              ) : null}
              {filteredTasks.length > 0 && (
                <ul className="space-y-1.5">
                  {filteredTasks.map((t) => {
                    const pri = getPriorityInfo(t.priority);
                    const isDone = t.status === 'done';
                    const isInProgress = t.status === 'in_progress';
                    const isPending = pendingTaskIds.has(t.id);
                    const isEditing = editingTaskId === t.id;
                    return (
                      <li
                        key={t.id}
                        className={`group/task p-2.5 rounded-md bg-bg-tertiary/40 border border-border-subtle hover:border-border-default transition-colors ${
                          isDone ? 'opacity-60' : ''
                        }`}
                      >
                       <div className="flex items-start gap-2.5">
                        {/* V6: 3-state 체크박스 */}
                        <button
                          onClick={() => handleToggleTask(t)}
                          disabled={isPending}
                          className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            isDone
                              ? 'bg-status-success border-status-success'
                              : isInProgress
                                ? 'bg-brand-purple/20 border-brand-purple'
                                : 'border-border-default hover:border-brand-purple'
                          } disabled:opacity-50`}
                          title={
                            isDone ? '완료됨 — 클릭하여 초기화'
                            : isInProgress ? '진행 중 — 클릭하여 완료'
                            : '할 일 — 클릭하여 진행 중으로'
                          }
                        >
                          {isPending ? (
                            <Loader2 size={14} className="text-white animate-spin" />
                          ) : isDone ? (
                            <Check size={14} className="text-white" strokeWidth={3} />
                          ) : isInProgress ? (
                            <CirclePlay size={12} className="text-brand-purple" strokeWidth={2.6} />
                          ) : null}
                        </button>

                        <div className="flex-1 min-w-0">
                          {/* V6: 제목 인라인 편집 */}
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={() => handleSaveTitle(t)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleSaveTitle(t); }
                                else if (e.key === 'Escape') { setEditingTaskId(null); setEditingTitle(''); }
                              }}
                              className="w-full bg-bg-tertiary border border-brand-purple/50 rounded px-2 py-1 text-sm text-txt-primary outline-none focus:border-brand-purple"
                            />
                          ) : (
                            <div className="flex items-start gap-1.5">
                              <p
                                onDoubleClick={() => {
                                  setEditingTaskId(t.id);
                                  setEditingTitle(t.title);
                                }}
                                className={`text-sm font-medium leading-snug flex-1 ${
                                  isDone ? 'text-txt-muted line-through' : 'text-txt-primary'
                                }`}
                                title="더블클릭으로 편집"
                              >
                                {t.title}
                              </p>
                              <button
                                onClick={() => {
                                  setEditingTaskId(t.id);
                                  setEditingTitle(t.title);
                                }}
                                className="opacity-0 group-hover/task:opacity-100 p-0.5 text-txt-muted hover:text-brand-purple transition-opacity shrink-0"
                                title="제목 편집"
                              >
                                <Pencil size={13} />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {/* V6: 상태 뱃지 */}
                            {isInProgress && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-purple/15 text-brand-purple border border-brand-purple/25">
                                <CirclePlay size={11} strokeWidth={2.6} />
                                진행 중
                              </span>
                            )}
                            {isDone && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-status-success/15 text-status-success border border-status-success/25">
                                <Check size={11} strokeWidth={3} />
                                완료
                              </span>
                            )}
                            {pri && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${pri.bg} ${pri.tone} ${pri.border} border`}>
                                <span className={`w-1 h-1 rounded-full ${pri.dot}`} />
                                {pri.label}
                              </span>
                            )}
                            {/* V7: 담당자 (클릭으로 변경) */}
                            <div className="relative">
                              <button
                                onClick={() => setAssigneeOpenId(assigneeOpenId === t.id ? null : t.id)}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                  (t.assignee?.name || t.assignee_name)
                                    ? 'text-txt-secondary hover:bg-bg-tertiary'
                                    : 'text-txt-muted hover:bg-bg-tertiary border border-dashed border-border-default'
                                }`}
                                title="담당자 변경"
                              >
                                {(t.assignee?.name || t.assignee_name) ? (
                                  <>
                                    <Users size={11} />
                                    {t.assignee?.name || t.assignee_name}
                                    {t.assignee?.slack_user_id && (
                                      <Send
                                        size={8}
                                        className="text-brand-purple ml-0.5"
                                        strokeWidth={2.6}
                                      />
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <UserPlus size={11} />
                                    담당자 지정
                                  </>
                                )}
                              </button>
                              {assigneeOpenId === t.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setAssigneeOpenId(null)} />
                                  <div className="absolute left-0 top-full mt-1 w-48 max-h-60 overflow-y-auto bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-30 py-1">
                                    {assignableUsers.length === 0 ? (
                                      <p className="px-3 py-2 text-[11px] text-txt-muted">참여자 정보 없음</p>
                                    ) : (
                                      <>
                                        {assignableUsers.map((u) => {
                                          const active = t.assignee_id === u.id;
                                          return (
                                            <button
                                              key={u.id}
                                              onClick={() => handleAssigneeChange(t, u)}
                                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
                                                active ? 'bg-brand-purple/10 text-brand-purple' : 'text-txt-primary hover:bg-bg-tertiary'
                                              }`}
                                            >
                                              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: u.color }} />
                                              <span className="flex-1 text-left truncate">{u.name}</span>
                                              {active && <Check size={12} />}
                                            </button>
                                          );
                                        })}
                                      </>
                                    )}
                                    {(t.assignee_id || t.assignee_name) && (
                                      <>
                                        <div className="border-t border-border-divider my-1" />
                                        <button
                                          onClick={() => handleAssigneeChange(t, null)}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-status-error hover:bg-bg-tertiary"
                                        >
                                          <X size={12} />
                                          담당 해제
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            {/* V7: 기한 (클릭으로 편집) */}
                            <div className="relative">
                              {dueOpenId === t.id ? (
                                <input
                                  autoFocus
                                  type="date"
                                  defaultValue={t.due_date || ''}
                                  onBlur={(e) => handleDueDateChange(t, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDueDateChange(t, e.target.value);
                                    else if (e.key === 'Escape') setDueOpenId(null);
                                  }}
                                  className="bg-bg-tertiary border border-brand-purple/50 rounded px-1.5 py-0.5 text-[10px] text-txt-primary outline-none focus:border-brand-purple"
                                />
                              ) : (
                                <button
                                  onClick={() => setDueOpenId(t.id)}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                    t.due_date
                                      ? 'text-txt-muted hover:bg-bg-tertiary'
                                      : 'text-txt-muted hover:bg-bg-tertiary border border-dashed border-border-default'
                                  }`}
                                  title="기한 설정"
                                >
                                  <CalendarDays size={11} />
                                  {t.due_date || '기한 없음'}
                                </button>
                              )}
                            </div>

                            {t.ai_suggested && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-purple">
                                <Sparkles size={11} />
                                AI 제안
                              </span>
                            )}

                            {/* V9: Notion 등록 뱃지 */}
                            {t.notion_block_id && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-txt-secondary bg-bg-tertiary border border-border-subtle rounded px-1.5 py-0.5">
                                <ExternalLink size={11} />
                                Notion
                              </span>
                            )}

                            {/* V7: 원본 메시지 역링크 (description에 패턴 있을 때만) */}
                            {sourceMessageIdMap[t.id] && (
                              <button
                                onClick={() => handleJumpToSource(t)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-brand-purple hover:bg-brand-purple/10 transition-colors"
                                title="이 태스크의 원본 메시지로 이동"
                              >
                                <CornerUpLeft size={11} />
                                원본 메시지
                              </button>
                            )}
                          </div>
                        </div>

                        {/* V7/V8: 액션 (호버 시 노출) */}
                        <div className="shrink-0 flex items-center gap-0.5">
                          {/* V8: 펼침 토글 */}
                          <button
                            onClick={() => toggleTaskExpand(t.id)}
                            className={`p-1 text-txt-muted hover:text-brand-purple transition-all ${
                              (t.subtasks?.length > 0 || t.description) ? 'opacity-100' : 'opacity-0 group-hover/task:opacity-100'
                            }`}
                            title={expandedTaskIds.has(t.id) ? '세부정보 접기' : '세부정보 펼치기'}
                          >
                            {expandedTaskIds.has(t.id) ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            {t.subtasks?.length > 0 && !expandedTaskIds.has(t.id) && (
                              <span className="ml-0.5 text-[9px] text-txt-muted">
                                {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
                              </span>
                            )}
                          </button>
                          {/* V9: 외부 푸시 */}
                          {(teamIntegrations.slack_channel_id || teamIntegrations.notion_database_id) && (
                            <div className="relative">
                              <button
                                onClick={() => setPushMenuOpenId(pushMenuOpenId === t.id ? null : t.id)}
                                className={`opacity-0 group-hover/task:opacity-100 p-1 transition-all ${
                                  t.notion_block_id
                                    ? 'text-brand-purple opacity-100'
                                    : 'text-txt-muted hover:text-brand-purple'
                                }`}
                                title={t.notion_block_id ? 'Notion 등록됨 — 추가 옵션' : 'Slack/Notion으로 푸시'}
                              >
                                {isPushingTo(t.id, 'slack') || isPushingTo(t.id, 'notion') ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <Share2 size={15} />
                                )}
                              </button>
                              {pushMenuOpenId === t.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setPushMenuOpenId(null)} />
                                  <div className="absolute right-0 top-full mt-1 w-48 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-30 py-1">
                                    {/* V10: 담당자 DM 우선, 없으면 채널 */}
                                    {(() => {
                                      const assigneeSlackId = t.assignee?.slack_user_id;
                                      const hasAssignee = !!t.assignee_id;
                                      if (assigneeSlackId) {
                                        return (
                                          <>
                                            <button
                                              onClick={() => handlePushSlack(t)}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-txt-primary hover:bg-bg-tertiary"
                                            >
                                              <Send size={14} className="text-brand-purple" />
                                              <span className="flex-1 text-left">{t.assignee?.name || t.assignee_name}님 DM</span>
                                            </button>
                                            {teamIntegrations.slack_channel_id && (
                                              <button
                                                onClick={() => handlePushSlack(t, { forceChannel: true })}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-txt-secondary hover:bg-bg-tertiary"
                                              >
                                                <Send size={14} className="text-txt-muted" />
                                                팀 채널로 전송
                                              </button>
                                            )}
                                          </>
                                        );
                                      }
                                      if (hasAssignee) {
                                        return (
                                          <>
                                            <button
                                              onClick={() => handlePushSlack(t)}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-txt-primary hover:bg-bg-tertiary"
                                            >
                                              <Send size={14} className="text-brand-purple" />
                                              <span className="flex-1 text-left">
                                                {t.assignee?.name || t.assignee_name}님에게 DM
                                                <span className="block text-[9px] text-txt-muted">Slack ID 매핑 필요</span>
                                              </span>
                                            </button>
                                            {teamIntegrations.slack_channel_id && (
                                              <button
                                                onClick={() => handlePushSlack(t, { forceChannel: true })}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-txt-secondary hover:bg-bg-tertiary"
                                              >
                                                <Send size={14} className="text-txt-muted" />
                                                팀 채널로 전송
                                              </button>
                                            )}
                                          </>
                                        );
                                      }
                                      // 담당자 없음 → 채널만
                                      if (teamIntegrations.slack_channel_id) {
                                        return (
                                          <button
                                            onClick={() => handlePushSlack(t, { forceChannel: true })}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-txt-primary hover:bg-bg-tertiary"
                                          >
                                            <Send size={14} className="text-txt-muted" />
                                            Slack 채널로 전송
                                          </button>
                                        );
                                      }
                                      return null;
                                    })()}
                                    {teamIntegrations.notion_database_id && (
                                      <button
                                        onClick={() => handlePushNotion(t)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-txt-primary hover:bg-bg-tertiary"
                                      >
                                        <ExternalLink size={14} className="text-txt-muted" />
                                        {t.notion_block_id ? 'Notion 업데이트' : 'Notion에 등록'}
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {deletingTaskId === t.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDeleteTask(t)}
                                className="px-2 py-1 rounded text-[10px] font-semibold text-white bg-status-error hover:opacity-90"
                              >
                                삭제
                              </button>
                              <button
                                onClick={() => setDeletingTaskId(null)}
                                className="p-1 text-txt-muted hover:text-txt-primary"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingTaskId(t.id)}
                              className="opacity-0 group-hover/task:opacity-100 p-1 text-txt-muted hover:text-status-error transition-all"
                              title="태스크 삭제"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                       </div>

                       {/* V8: 확장 영역 — description + subtasks */}
                       {expandedTaskIds.has(t.id) && (
                         <div className="mt-3 ml-7 pl-2 border-l-2 border-border-subtle space-y-3">
                           {/* 설명 */}
                           <div>
                             <div className="flex items-center gap-1.5 mb-1">
                               <AlignLeft size={12} className="text-txt-muted" />
                               <span className="text-[10px] font-semibold uppercase tracking-wider text-txt-muted">설명</span>
                             </div>
                             {editingDescId === t.id ? (
                               <textarea
                                 autoFocus
                                 value={editingDesc}
                                 onChange={(e) => setEditingDesc(e.target.value)}
                                 onBlur={() => handleSaveDescription(t)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Escape') { setEditingDescId(null); setEditingDesc(''); }
                                   else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveDescription(t);
                                 }}
                                 className="w-full min-h-[60px] bg-bg-tertiary border border-brand-purple/50 rounded px-2 py-1.5 text-xs text-txt-primary outline-none focus:border-brand-purple resize-y"
                                 placeholder="설명 추가... (Cmd/Ctrl+Enter 저장, Esc 취소)"
                               />
                             ) : (
                               <div
                                 onClick={() => {
                                   setEditingDescId(t.id);
                                   setEditingDesc(t.description || '');
                                 }}
                                 className="group/desc text-xs text-txt-secondary whitespace-pre-wrap leading-relaxed cursor-text hover:bg-bg-tertiary/40 px-2 py-1 -mx-2 rounded transition-colors"
                                 title="클릭하여 편집"
                               >
                                 {t.description ? (
                                   t.description
                                 ) : (
                                   <span className="text-txt-muted italic">설명 추가...</span>
                                 )}
                               </div>
                             )}
                           </div>

                           {/* 서브태스크 */}
                           <div>
                             <div className="flex items-center gap-1.5 mb-1.5">
                               <ListChecks size={12} className="text-txt-muted" />
                               <span className="text-[10px] font-semibold uppercase tracking-wider text-txt-muted">
                                 체크리스트
                               </span>
                               {t.subtasks?.length > 0 && (
                                 <span className="text-[10px] text-txt-muted">
                                   {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}
                                 </span>
                               )}
                             </div>
                             <ul className="space-y-1">
                               {(t.subtasks || []).map((st, i) => (
                                 <li key={i} className="group/st flex items-center gap-2 text-xs">
                                   <button
                                     onClick={() => handleToggleSubtask(t, i)}
                                     className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                                       st.done
                                         ? 'bg-status-success border-status-success'
                                         : 'border-border-default hover:border-brand-purple'
                                     }`}
                                   >
                                     {st.done && <Check size={8} className="text-white" strokeWidth={3} />}
                                   </button>
                                   <input
                                     type="text"
                                     defaultValue={st.title}
                                     onBlur={(e) => {
                                       if (e.target.value !== st.title) handleEditSubtaskTitle(t, i, e.target.value);
                                     }}
                                     onKeyDown={(e) => {
                                       if (e.key === 'Enter') e.target.blur();
                                       else if (e.key === 'Escape') { e.target.value = st.title; e.target.blur(); }
                                     }}
                                     className={`flex-1 bg-transparent outline-none px-1 py-0.5 rounded hover:bg-bg-tertiary/50 focus:bg-bg-tertiary ${
                                       st.done ? 'text-txt-muted line-through' : 'text-txt-primary'
                                     }`}
                                   />
                                   <button
                                     onClick={() => handleDeleteSubtask(t, i)}
                                     className="opacity-0 group-hover/st:opacity-100 p-0.5 text-txt-muted hover:text-status-error transition-opacity shrink-0"
                                     title="서브태스크 삭제"
                                   >
                                     <X size={13} />
                                   </button>
                                 </li>
                               ))}
                               {/* 새 서브태스크 추가 */}
                               <li className="flex items-center gap-2 text-xs">
                                 <Plus size={13} className="text-txt-muted shrink-0" />
                                 <input
                                   type="text"
                                   value={newSubtaskInputs[t.id] || ''}
                                   onChange={(e) => setNewSubtaskInputs((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                   onKeyDown={(e) => {
                                     if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                       e.preventDefault();
                                       handleAddSubtask(t);
                                     }
                                   }}
                                   placeholder="서브태스크 추가..."
                                   className="flex-1 bg-transparent outline-none px-1 py-0.5 text-txt-secondary placeholder:text-txt-muted focus:bg-bg-tertiary rounded"
                                 />
                                 {(newSubtaskInputs[t.id] || '').trim() && (
                                   <button
                                     onClick={() => handleAddSubtask(t)}
                                     className="p-0.5 text-brand-purple hover:text-brand-purple-deep shrink-0"
                                     title="추가"
                                   >
                                     <Check size={14} strokeWidth={2.6} />
                                   </button>
                                 )}
                               </li>
                             </ul>
                           </div>
                         </div>
                       )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* AI 제안 (미등록) */}
              {pendingSuggestions.length > 0 && (
                <div className={`rounded-md border border-dashed border-brand-purple/30 bg-brand-purple/[0.04] p-3 ${meetingTasks.length > 0 ? 'mt-3' : ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-brand-purple" />
                    <span className="text-[11px] font-semibold text-brand-purple uppercase tracking-wider">
                      AI가 제안한 후속 태스크
                    </span>
                    <button
                      onClick={handleRegisterSuggestions}
                      disabled={registering}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-brand-purple hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {registering ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          등록 중...
                        </>
                      ) : (
                        <>
                          <Plus size={13} strokeWidth={2.6} />
                          모두 등록 ({pendingSuggestions.length})
                        </>
                      )}
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {pendingSuggestions.map((a, i) => {
                      const pri = getPriorityInfo(a.priority);
                      return (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className="w-4 h-4 rounded border border-dashed border-brand-purple/50 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-txt-primary leading-snug">{a.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-txt-muted flex-wrap">
                              {pri && <span className={pri.tone}>● {pri.label}</span>}
                              {a.assignee_hint && <span>· {a.assignee_hint}</span>}
                              {a.due_hint && <span>· {a.due_hint}</span>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* 빈 상태 안내 */}
              {meetingTasks.length === 0 && pendingSuggestions.length === 0 && (
                <div className="text-center py-8 md:py-10 border border-dashed border-border-subtle rounded-lg">
                  <ListTodo size={22} className="text-txt-muted mx-auto mb-2 opacity-40" strokeWidth={1.6} />
                  <p className="text-sm text-txt-secondary mb-1">등록된 후속 태스크가 없어요</p>
                  <p className="text-[11px] text-txt-muted">
                    이 회의에서 도출된 실행 항목이 없거나, AI가 자동 추출하지 못한 상태입니다.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

      {/* ═══ 자료 · 드로잉 히스토리 패널 (완료 회의 전용) ═══ */}
      <CompletedMeetingFiles meetingId={meeting.id} />

      {/* ═══ 메인 ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        <aside className="hidden md:flex flex-col w-[280px] shrink-0 border-r border-border-subtle bg-bg-primary overflow-hidden">
          {/* 어젠다 타임라인 */}
          <div className="px-4 py-3 border-b border-border-divider">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
              어젠다 타임라인
            </h3>
          </div>
          <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: '55%' }}>
            {agendaList.length === 0 ? (
              <p className="text-xs text-txt-muted px-2 py-3">어젠다가 없습니다</p>
            ) : (
              agendaList.map((a, i) => (
                <button
                  key={a.key}
                  onClick={() => {
                    scrollToAgenda(a.key);
                    setSelectedAgendaKey(a.key);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors group/agenda ${
                    selectedAgendaKey === a.key
                      ? 'bg-brand-purple/10 ring-1 ring-brand-purple/30'
                      : 'hover:bg-bg-tertiary'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">
                      {a.status === 'completed' ? (
                        <span className="w-5 h-5 rounded-full bg-status-success/20 flex items-center justify-center">
                          <Check size={13} className="text-status-success" strokeWidth={3} />
                        </span>
                      ) : a.key === UNASSIGNED_KEY ? (
                        <Circle size={16} className="text-txt-muted" />
                      ) : (
                        <span className="w-5 h-5 rounded-full border border-border-default text-[9px] font-semibold text-txt-muted flex items-center justify-center">
                          {i + 1}
                        </span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-txt-primary line-clamp-2 leading-snug group-hover/agenda:text-brand-purple transition-colors">
                        {a.title || '제목 없음'}
                      </p>
                      <p className="text-[10px] text-txt-muted mt-0.5">
                        메시지 {a.count}건
                        {a.duration != null && ` · ${a.duration}분 예정`}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* V2: 참여자 발언 비중 */}
          <div className="flex-1 overflow-y-auto border-t border-border-divider">
            <div className="px-4 py-3 flex items-center gap-1.5">
              <BarChart3 size={14} className="text-txt-muted" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
                발언 비중
              </h3>
              {selectedAgendaKey && (
                <>
                  <Filter size={12} className="text-brand-purple ml-1" />
                  <button
                    onClick={() => setSelectedAgendaKey(null)}
                    className="ml-auto text-[10px] text-brand-purple hover:text-brand-purple-deep font-medium"
                    title="어젠다 필터 해제 (Esc)"
                  >
                    전체 보기
                  </button>
                </>
              )}
            </div>
            <div className="px-3 pb-4 space-y-2">
              {contributions.humans.length === 0 && contributions.ais.length === 0 ? (
                <p className="text-[11px] text-txt-muted px-2">기록된 발언 없음</p>
              ) : (
                <>
                  {contributions.humans.map((h) => {
                    const pct = Math.round((h.count / contributions.maxCount) * 100);
                    return (
                      <div key={h.id} className="px-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar name={h.name} color={h.color} size="sm" />
                          <span className="text-[11px] font-medium text-txt-primary truncate flex-1">
                            {h.name}
                          </span>
                          <span className="text-[10px] text-txt-muted shrink-0">{h.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: h.color,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {contributions.ais.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border-divider">
                      {contributions.ais.map((a) => {
                        const pct = Math.round((a.count / contributions.maxCount) * 100);
                        return (
                          <div key={a.id} className="px-2 mb-2">
                            <div className="flex items-center gap-2 mb-1">
                              <MiloAvatar employeeId={a.id} size="sm" />
                              <span className="text-[11px] font-medium text-txt-primary truncate flex-1">
                                {a.name}
                              </span>
                              <span className="text-[10px] text-txt-muted shrink-0">{a.count}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-brand-orange via-brand-purple to-brand-purple-deep"
                                style={{ width: `${pct}%`, opacity: 0.8 }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>

        {/* 메시지 타임라인 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-txt-muted py-20">
              <MessageSquare size={28} className="mb-3 opacity-50" />
              <p className="text-sm">이 회의에는 대화 기록이 없습니다</p>
            </div>
          ) : (
            agendaList.map((a, i) => {
              const sectionMsgs = grouped.get(a.key) || [];
              if (sectionMsgs.length === 0) return null;
              const collapsed = collapsedSections[a.key];
              return (
                <section
                  key={a.key}
                  ref={(el) => { sectionRefs.current[a.key] = el; }}
                  className="mb-8 last:mb-0 scroll-mt-4"
                >
                  {/* 섹션 헤더 */}
                  <button
                    onClick={() => toggleSection(a.key)}
                    className="w-full flex items-center gap-3 mb-4 pb-2 border-b border-border-divider group/sh"
                  >
                    <span className="shrink-0">
                      {a.status === 'completed' ? (
                        <span className="w-6 h-6 rounded-full bg-status-success/20 flex items-center justify-center">
                          <Check size={14} className="text-status-success" strokeWidth={3} />
                        </span>
                      ) : a.key === UNASSIGNED_KEY ? (
                        <CircleDot size={18} className="text-txt-muted" />
                      ) : (
                        <span className="w-6 h-6 rounded-full border border-border-default text-[10px] font-semibold text-txt-muted flex items-center justify-center">
                          {i + 1}
                        </span>
                      )}
                    </span>
                    <div className="flex-1 text-left min-w-0">
                      <h2 className="text-sm font-semibold text-txt-primary truncate group-hover/sh:text-brand-purple transition-colors">
                        {a.title || '제목 없음'}
                      </h2>
                      <p className="text-[11px] text-txt-muted">
                        메시지 {sectionMsgs.length}건
                        {a.duration != null && ` · ${a.duration}분 예정`}
                      </p>
                    </div>
                    <span className="shrink-0 text-txt-muted">
                      {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </span>
                  </button>

                  {/* 메시지 리스트 */}
                  {!collapsed && (
                    <div className="space-y-5 pl-1">
                      {sectionMsgs.map((m) => {
                        const cited = isCitedFn(m.content);
                        const isHighlighted = highlightedMsgId === m.id;
                        return (
                          <div
                            key={m.id}
                            id={`msg-${m.id}`}
                            ref={(el) => { messageRefs.current[m.id] = el; }}
                            className={`group/msg relative scroll-mt-24 transition-colors duration-500 ${
                              isHighlighted ? 'bg-brand-purple/10 -mx-3 px-3 py-2 rounded-lg ring-2 ring-brand-purple/60' : ''
                            }`}
                          >
                            {cited && (
                              <div className="flex items-center gap-1 mb-1 ml-13 pl-13 text-[10px] text-brand-purple font-semibold">
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-purple/10 border border-brand-purple/25"
                                  title="이 메시지는 회의록 요약에 반영되었습니다"
                                >
                                  <Quote size={11} strokeWidth={2.6} />
                                  요약에 반영됨
                                </span>
                                {m._inherited && (
                                  <span className="text-[9px] text-txt-muted font-normal">· 앞 어젠다에서 상속</span>
                                )}
                              </div>
                            )}
                            {!cited && m._inherited && (
                              <div className="mb-1 text-[9px] text-txt-muted">
                                · 앞 어젠다에서 상속
                              </div>
                            )}
                            <div className={cited ? 'rounded-xl ring-1 ring-brand-purple/25 p-0.5 -m-0.5' : ''}>
                              <ChatBubble
                                message={m}
                                currentUserId={user?.id}
                                readonly
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}

          {/* 검색/필터 결과 없음 */}
          {messages.length > 0 && ((searchQuery.trim() && searchMatchCount === 0) ||
            (onlyCited && citedCount === 0)) && (
            <div className="text-center py-10 text-xs text-txt-muted">
              {searchQuery.trim()
                ? `"${searchQuery}" 에 해당하는 대화가 없습니다.`
                : '요약에 반영된 메시지가 없습니다.'}
            </div>
          )}

          {/* 하단 CTA */}
          {messages.length > 0 && (
            <div className="mt-10 pt-6 border-t border-border-divider flex justify-center">
              <Link
                to={`/summaries/${meeting.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-purple text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <FileText size={17} />
                AI 회의록 요약 보기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
