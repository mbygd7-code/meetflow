import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Clock, Users, Check, Paperclip, FileText, Image, File, Sparkles, Zap, Link2, Globe, CalendarClock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Modal, Input, Button } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useToastStore } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

const MOCK_TEAMS = [
  { id: 'c3a83ad9-10b3-4850-bbd1-abbcbc9dacd7', name: '프로덕트 팀' },
  { id: 'd9dcfd11-3779-4fe4-bd8d-263db7ce661b', name: '디자인 팀' },
  { id: 'e7a1b2c3-0000-4000-a000-000000000003', name: '엔지니어링 팀' },
];

const MOCK_MEMBERS = [
  { id: 'u1', name: '김지우', color: '#FF902F', team: 'c3a83ad9-10b3-4850-bbd1-abbcbc9dacd7' },
  { id: 'u2', name: '박서연', color: '#34D399', team: 'c3a83ad9-10b3-4850-bbd1-abbcbc9dacd7' },
  { id: 'u3', name: '이도윤', color: '#38BDF8', team: 'c3a83ad9-10b3-4850-bbd1-abbcbc9dacd7' },
  { id: 'u4', name: '최하린', color: '#F472B6', team: 'd9dcfd11-3779-4fe4-bd8d-263db7ce661b' },
  { id: 'u5', name: '정민수', color: '#A78BFA', team: 'd9dcfd11-3779-4fe4-bd8d-263db7ce661b' },
  { id: 'u6', name: '한소율', color: '#FBBF24', team: 'e7a1b2c3-0000-4000-a000-000000000003' },
  { id: 'u7', name: '오재현', color: '#F87171', team: 'e7a1b2c3-0000-4000-a000-000000000003' },
  { id: 'u8', name: '윤서아', color: '#2DD4BF', team: 'e7a1b2c3-0000-4000-a000-000000000003' },
];

const SUGGESTED_TITLES = [
  '주간 프로덕트 스탠드업',
  '디자인 시스템 리뷰',
  '스프린트 회고',
  '마케팅 전략 회의',
  '신기능 기획 브레인스토밍',
  'QA 이슈 트리아지',
  '월간 운영 리뷰',
  '온보딩 플로우 개선',
  '데이터 분석 공유',
  '팀 빌딩 회의',
];

const DRAFT_KEY = 'meetflow-meeting-draft';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(data) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export default function CreateMeetingModal({ open, onClose }) {
  const draft = useRef(loadDraft());
  const { user } = useAuthStore();
  const isDemo = !user || user.id?.startsWith('mock-');

  // 데모 사용자: 목 데이터 / 실제 사용자: Supabase에서 로드
  const [TEAMS, setTeams] = useState(isDemo ? MOCK_TEAMS : []);
  const [ALL_MEMBERS, setAllMembers] = useState(isDemo ? MOCK_MEMBERS : []);

  useEffect(() => {
    if (!open || isDemo || !SUPABASE_ENABLED) return;
    async function loadTeamsAndMembers() {
      try {
        // 3개 쿼리를 병렬로: 팀, 유저, 팀 멤버십 (JOIN 대신 별도 쿼리로 RLS 영향 최소화)
        const [teamsRes, usersRes, tmRes] = await Promise.all([
          supabase.from('teams').select('id, name').order('name'),
          supabase.from('users').select('id, name, avatar_color, email'),
          supabase.from('team_members').select('user_id, team_id'),
        ]);

        console.log('[CreateMeetingModal] 로드 결과:', {
          teams: teamsRes.data?.length || 0,
          teamsError: teamsRes.error,
          users: usersRes.data?.length || 0,
          usersError: usersRes.error,
          teamMembers: tmRes.data?.length || 0,
          tmError: tmRes.error,
        });

        // 팀 세팅 (중복 제거)
        if (teamsRes.data) {
          const seen = new Set();
          const uniqueTeams = teamsRes.data.filter((t) => {
            const key = `${t.name}:${t.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setTeams(uniqueTeams);
        }

        // 유저 + 팀 멤버십 병합
        if (usersRes.data) {
          const tmByUser = new Map();
          (tmRes.data || []).forEach((tm) => {
            if (!tmByUser.has(tm.user_id)) tmByUser.set(tm.user_id, []);
            tmByUser.get(tm.user_id).push(tm.team_id);
          });

          const normalized = usersRes.data.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            color: u.avatar_color || '#723CEB',
            team: tmByUser.get(u.id)?.[0] || null,  // 대표 팀
            teamIds: tmByUser.get(u.id) || [],       // 전체 팀
          }));
          setAllMembers(normalized);
          console.log('[CreateMeetingModal] 정규화된 멤버:', normalized.length, normalized.map((m) => m.name));
        } else if (usersRes.error) {
          console.error('[CreateMeetingModal] users 쿼리 실패:', usersRes.error);
        }
      } catch (err) {
        console.warn('[CreateMeetingModal] 팀/멤버 로드 실패:', err);
      }
    }
    loadTeamsAndMembers();
  }, [open, isDemo]);

  const [title, setTitle] = useState(draft.current?.title || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const [modalReady, setModalReady] = useState(false);

  // 모달이 열리면 짧은 딜레이 후 드롭다운 허용
  useEffect(() => {
    if (open) {
      // 모달 열릴 때 임시저장 데이터 복원 — 저장된 draft 있으면 복원, 없으면 깨끗이 초기화
      const saved = loadDraft();
      if (saved) {
        setTitle(saved.title || '');
        setSelectedTeams(saved.selectedTeams || []);
        setSelectedMembers(saved.selectedMembers || []);
        setAgendas(saved.agendas?.length ? saved.agendas : [{ title: '', duration_minutes: 10 }]);
        setScheduledDate(saved.scheduledDate || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
        setScheduledTime(saved.scheduledTime || '');
        setDuration(saved.duration || 20);
      } else {
        // 임시저장 안 하고 닫았다 다시 열면 — 깨끗한 상태로 시작
        setTitle('');
        setSelectedTeams([]);
        setSelectedMembers([]);
        setAgendas([{ title: '', duration_minutes: 10 }]);
        const d = new Date();
        setScheduledDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        setScheduledTime('');
        setDuration(20);
        setFiles([]);
        setUrls([]);
        setUrlInput('');
        setUrlOpen(false);
      }
      setModalReady(false);
      setSuggestionsReady(false);
      const t = setTimeout(() => setModalReady(true), 300);
      return () => clearTimeout(t);
    } else {
      setModalReady(false);
      setSuggestionsReady(false);
    }
  }, [open]);

  // modalReady 후 드롭다운 펼치기 애니메이션 트리거
  useEffect(() => {
    if (modalReady && showSuggestions) {
      requestAnimationFrame(() => setSuggestionsReady(true));
    } else if (!showSuggestions) {
      setSuggestionsReady(false);
    }
  }, [modalReady, showSuggestions]);
  const [selectedTeams, setSelectedTeams] = useState(draft.current?.selectedTeams || []);
  const [selectedMembers, setSelectedMembers] = useState(draft.current?.selectedMembers || []);
  const [selectedAiEmployees, setSelectedAiEmployees] = useState(['milo']); // Milo는 기본 선택
  const [agendas, setAgendas] = useState(
    draft.current?.agendas?.length ? draft.current.agendas : [{ title: '', duration_minutes: 10 }]
  );
  const [scheduledDate, setScheduledDate] = useState(draft.current?.scheduledDate || (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }));
  const [scheduledTime, setScheduledTime] = useState(draft.current?.scheduledTime || '');
  const [showTimeSuggestions, setShowTimeSuggestions] = useState(false);
  const [endTimeDraft, setEndTimeDraft] = useState('');
  const [duration, setDuration] = useState(draft.current?.duration || 20);
  const [files, setFiles] = useState([]);
  const [urls, setUrls] = useState([]); // [{ id, url, label }] — URL 자료 목록
  const [urlInput, setUrlInput] = useState('');
  const [urlOpen, setUrlOpen] = useState(false); // URL 입력창 토글
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  // 종료 시간 입력 동기화 — 시작시간/길이 변경 시 자동 갱신
  useEffect(() => {
    if (!/^\d{2}:\d{2}$/.test(scheduledTime || '')) {
      setEndTimeDraft('');
      return;
    }
    const [sh, sm] = scheduledTime.split(':').map(Number);
    const total = sh * 60 + sm + (duration || 20);
    const eh = Math.floor((total / 60) % 24);
    const em = total % 60;
    setEndTimeDraft(`${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`);
  }, [scheduledTime, duration]);

  // 인접 회의 — 선택된 날짜 ±1일에 잡힌 회의 (충돌·참고용)
  const [nearbyMeetings, setNearbyMeetings] = useState([]);
  const [nearbyOpen, setNearbyOpen] = useState(false);

  useEffect(() => {
    if (!open || !SUPABASE_ENABLED || isDemo) { setNearbyMeetings([]); return; }
    if (!scheduledDate) return;
    let cancelled = false;
    (async () => {
      try {
        const base = new Date(`${scheduledDate}T00:00:00`);
        if (isNaN(base)) return;
        const startBound = new Date(base); startBound.setDate(startBound.getDate() - 1);
        const endBound = new Date(base); endBound.setDate(endBound.getDate() + 2);
        const { data, error } = await supabase
          .from('meetings')
          .select('id, title, scheduled_at, status, created_by, creator:users!meetings_created_by_fkey (id, name), agendas (duration_minutes)')
          .in('status', ['scheduled', 'active'])
          .not('scheduled_at', 'is', null)
          .gte('scheduled_at', startBound.toISOString())
          .lt('scheduled_at', endBound.toISOString())
          .order('scheduled_at', { ascending: true });
        if (cancelled) return;
        if (error) { console.warn('[CreateMeetingModal] 인접 회의 조회 실패:', error); return; }
        const enriched = (data || []).map((m) => {
          const total = (m.agendas || []).reduce((s, a) => s + (a?.duration_minutes || 0), 0) || 30;
          const startAt = new Date(m.scheduled_at);
          const endAt = new Date(startAt.getTime() + total * 60000);
          return {
            id: m.id, title: m.title, status: m.status,
            creatorName: m.creator?.name || null,
            startAt, endAt, total,
          };
        });
        setNearbyMeetings(enriched);
      } catch (e) {
        if (!cancelled) console.warn('[CreateMeetingModal] 인접 회의 예외:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isDemo, scheduledDate]);

  // 입력한 시각/길이 기반 시간 창
  const proposedWindow = useMemo(() => {
    if (!scheduledDate || !/^\d{2}:\d{2}$/.test(scheduledTime || '')) return null;
    const start = new Date(`${scheduledDate}T${scheduledTime}:00`);
    if (isNaN(start)) return null;
    const end = new Date(start.getTime() + (duration || 30) * 60000);
    return { start, end };
  }, [scheduledDate, scheduledTime, duration]);

  // 충돌(overlap) 및 인접(15분 이내) 분류
  const ADJACENT_BUFFER_MS = 15 * 60000;
  const { overlapping, adjacent } = useMemo(() => {
    if (!proposedWindow) return { overlapping: [], adjacent: [] };
    const overlap = [];
    const near = [];
    for (const m of nearbyMeetings) {
      const isOverlap = m.startAt < proposedWindow.end && m.endAt > proposedWindow.start;
      if (isOverlap) { overlap.push(m); continue; }
      const gapBefore = proposedWindow.start - m.endAt;   // m이 먼저 끝남
      const gapAfter = m.startAt - proposedWindow.end;    // m이 나중에 시작
      if ((gapBefore >= 0 && gapBefore <= ADJACENT_BUFFER_MS) ||
          (gapAfter >= 0 && gapAfter <= ADJACENT_BUFFER_MS)) {
        near.push(m);
      }
    }
    return { overlapping: overlap, adjacent: near };
  }, [nearbyMeetings, proposedWindow]);

  // 같은 날짜에 잡힌 회의만 추출 (시간 미입력 시에도 가이드용으로 보여줌)
  const meetingsOnDate = useMemo(() => {
    if (!scheduledDate) return [];
    return nearbyMeetings.filter((m) => {
      const y = m.startAt.getFullYear();
      const mo = String(m.startAt.getMonth() + 1).padStart(2, '0');
      const d = String(m.startAt.getDate()).padStart(2, '0');
      return `${y}-${mo}-${d}` === scheduledDate;
    });
  }, [nearbyMeetings, scheduledDate]);

  const fmtHM = (d) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const fmtMin = (mins) => mins < 60 ? `${mins}분` : `${Math.floor(mins / 60)}시간${mins % 60 ? ` ${mins % 60}분` : ''}`;
  const fmtGap = (ms) => {
    const mins = Math.round(ms / 60000);
    return mins <= 0 ? '바로' : `${mins}분`;
  };

  // 최근 사용한 시간 (localStorage)
  const RECENT_TIMES_KEY = 'meetflow-recent-times';
  const getRecentTimes = () => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_TIMES_KEY) || '[]').slice(0, 5);
    } catch { return []; }
  };
  const saveRecentTime = (time) => {
    if (!time) return;
    const recent = getRecentTimes().filter((t) => t !== time);
    recent.unshift(time);
    localStorage.setItem(RECENT_TIMES_KEY, JSON.stringify(recent.slice(0, 5)));
  };
  const recentTimes = getRecentTimes();
  const defaultTimes = ['09:00', '10:00', '14:00', '15:00', '16:00'];
  const timeSuggestions = recentTimes.length > 0 ? recentTimes : defaultTimes;
  const { requestMeeting, createMeeting, startMeeting } = useMeeting();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();

  const toggleTeam = (teamId) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const toggleMember = (memberId) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  // 선택된 팀에 속한 멤버 ID들 (여러 팀 소속이어도 감지, teamIds 사용)
  const teamMemberIds = useMemo(() => {
    if (!selectedTeams.length) return [];
    return ALL_MEMBERS
      .filter((m) => (m.teamIds || []).some((tid) => selectedTeams.includes(tid)))
      .map((m) => m.id);
  }, [selectedTeams, ALL_MEMBERS]);

  // 항상 모든 멤버 표시 — 팀에 포함된 멤버는 시각적으로 '팀에 포함됨' 표시
  // (숨기는 대신 표시하여 UX 혼란 제거 — 선택된 팀원을 명확히 인지 가능)
  const visibleMembers = ALL_MEMBERS;

  // 최종 참석자
  const allParticipants = useMemo(() => {
    const ids = new Set([...teamMemberIds, ...selectedMembers]);
    return ALL_MEMBERS.filter((m) => ids.has(m.id));
  }, [teamMemberIds, selectedMembers]);

  // 파일 가드: 한 번에 최대 10개, 각 파일 50MB 이하 (Supabase Storage 기본 한도)
  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const handleFileAdd = (e) => {
    const picked = Array.from(e.target.files);
    e.target.value = '';
    const accepted = [];
    const rejected = [];
    for (const f of picked) {
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(`${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        accepted.push(f);
      }
    }
    if (rejected.length > 0) {
      addToast(`50MB 초과 파일 ${rejected.length}개 제외: ${rejected.slice(0, 2).join(', ')}${rejected.length > 2 ? ' 외' : ''}`, 'error');
    }
    if (accepted.length === 0) return;

    setFiles((prev) => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) {
        addToast(`회의당 최대 ${MAX_FILES}개 파일까지 첨부 가능`, 'error');
        return prev;
      }
      const truncated = accepted.slice(0, remaining);
      if (accepted.length > remaining) {
        addToast(`${MAX_FILES}개 한도 초과 — ${accepted.length - remaining}개 제외됨`, 'warn');
      }
      const newFiles = truncated.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      return [...prev, ...newFiles];
    });
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // URL 자료 추가/제거 — Google Docs/Sheets/Slides 등 외부 URL
  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
    try {
      const u = new URL(normalized);
      // 라벨 — 도메인 + 경로 끝부분
      const label = `${u.hostname}${u.pathname.length > 1 ? u.pathname.slice(0, 30) : ''}`;
      setUrls((prev) => [...prev, { id: crypto.randomUUID(), url: normalized, label }]);
      setUrlInput('');
    } catch {
      // 유효하지 않은 URL — 사용자에게 비주얼 피드백 (input 흔들기 등은 생략)
    }
  };
  const removeUrl = (id) => setUrls((prev) => prev.filter((u) => u.id !== id));

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return Image;
    if (type.includes('pdf') || type.includes('document') || type.includes('text')) return FileText;
    return File;
  };

  const addAgenda = () =>
    setAgendas([...agendas, { title: '', duration_minutes: 10 }]);

  const removeAgenda = (i) =>
    setAgendas(agendas.filter((_, idx) => idx !== i));

  const updateAgenda = (i, field, value) =>
    setAgendas(
      agendas.map((a, idx) => (idx === i ? { ...a, [field]: value } : a))
    );

  const resetForm = () => {
    setTitle('');
    setSelectedTeams([]);
    setSelectedMembers([]);
    setAgendas([{ title: '', duration_minutes: 10 }]);
    setScheduledDate((() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })());
    setScheduledTime('');
    setDuration(20);
    setFiles([]);
    setUrls([]);
    setUrlInput('');
    setUrlOpen(false);
  };

  // 임시저장
  const handleSaveDraft = () => {
    saveDraft({
      title, selectedTeams, selectedMembers, agendas,
      scheduledDate, scheduledTime, duration,
    });
    onClose();
  };

  // 회의 요청 — Slack + Calendar 연동
  const handleRequest = async () => {
    if (!title.trim()) return;
    if ((allParticipants.length === 0 && selectedAiEmployees.length <= 1)) return;
    setBusy(true);
    try {
      const cleaned = agendas.filter((a) => a.title.trim());
      // 첨부 파일을 base64로 변환
      const filePayloads = await Promise.all(
        files.map(async (f) => {
          const buf = await f.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), '')
          );
          return { name: f.name, type: f.type, size: f.size, base64 };
        })
      );

      await requestMeeting({
        title: title.trim(),
        team_id: selectedTeams[0] || null,
        agendas: cleaned,
        participants: allParticipants.map(({ id, name, color }) => ({ id, name, color })),
        files: filePayloads,
        urls: urls.map(({ url, label }) => ({ url, label })),
        scheduledDate,
        scheduledTime,
        duration,
      });
      saveRecentTime(scheduledTime);
      clearDraft();
      resetForm();
      onClose();
      addToast('Slack과 Google Calendar에 회의 요청이 완료되었습니다.', 'success');
    } catch (err) {
      console.error('[handleRequest] 회의 요청 실패:', err);
      addToast(`회의 요청 실패: ${err.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // 즉시 시작 — 회의 생성 + 시작 + 회의방 이동
  const handleStartNow = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const cleaned = agendas.filter((a) => a.title.trim());

      // 첨부 파일을 base64 로 변환 (createMeeting 이 Storage 업로드 + meeting_files INSERT)
      const filePayloads = await Promise.all(
        files.map(async (f) => {
          const buf = await f.file.arrayBuffer();
          const base64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
          return { name: f.name, type: f.type, size: f.size, base64 };
        })
      );

      const meeting = await createMeeting({
        title: title.trim(),
        team_id: selectedTeams[0] || null,
        agendas: cleaned,
        participants: allParticipants.map(({ id, name, color }) => ({ id, name, color })),
        files: filePayloads, // ← 누락 수정: 즉시 시작 시에도 파일 업로드
      });

      // 일부 파일 업로드 실패 → toast 로 알림
      if (meeting?._uploadFailures?.length) {
        const names = meeting._uploadFailures.map((f) => f.name).slice(0, 3).join(', ');
        const more = meeting._uploadFailures.length > 3 ? ` 외 ${meeting._uploadFailures.length - 3}개` : '';
        addToast(`${meeting._uploadFailures.length}개 파일 업로드 실패: ${names}${more}`, 'error');
      }

      await startMeeting(meeting.id);

      // URL 자료 — 비차단 import
      if (urls.length > 0) {
        urls.forEach((u) => {
          supabase.functions.invoke('import-google-doc', {
            body: { meetingId: meeting.id, url: u.url, label: u.label },
          }).catch((e) => console.warn('[handleStartNow] URL 가져오기 실패:', u.url, e));
        });
      }

      clearDraft();
      onClose();
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      console.error('[handleStartNow]', err);
      addToast(`회의 시작 실패: ${err.message || '알 수 없는 오류'}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="새 회의 만들기"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
            임시저장
          </Button>
          <button
            type="button"
            onClick={handleStartNow}
            disabled={!title.trim() || busy}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-brand-orange to-brand-purple rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <Zap size={16} /> 즉시 시작
          </button>
          <Button
            variant="gradient"
            onClick={handleRequest}
            loading={busy}
            disabled={!title.trim() || (allParticipants.length === 0 && selectedAiEmployees.length <= 1)}
          >
            회의 요청
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 회의 제목 — 추천 드롭다운 */}
        <div className="relative">
          <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
            회의 제목
          </label>
          <input
            type="text"
            placeholder="예: 주간 스탠드업"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setShowSuggestions(false); }}
            onFocus={() => { if (!title.trim()) setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoFocus
            className="w-full bg-bg-tertiary border border-border-subtle rounded-md text-sm text-txt-primary placeholder:text-txt-muted px-4 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:border-brand-purple/50 focus:ring-brand-purple/15"
          />
          {showSuggestions && modalReady && (
            <div
              className="absolute z-20 left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-border-default rounded-lg shadow-lg overflow-hidden origin-top transition-all duration-200 ease-out"
              style={{
                maxHeight: suggestionsReady ? '360px' : '0px',
                opacity: suggestionsReady ? 1 : 0,
                transform: suggestionsReady ? 'scaleY(1)' : 'scaleY(0.6)',
              }}
            >
              <div className="overflow-y-auto max-h-[360px] scrollbar-hide">
                <p className="px-3 pt-2 pb-1 text-[10px] text-txt-muted font-medium uppercase tracking-wider">추천 제목</p>
                {SUGGESTED_TITLES
                  .filter((s) => !title || s.toLowerCase().includes(title.toLowerCase()))
                  .map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setTitle(suggestion); setShowSuggestions(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* 어젠다 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-txt-secondary uppercase tracking-wider">
              어젠다
            </label>
            <button
              type="button"
              onClick={addAgenda}
              className="text-xs text-brand-purple hover:text-txt-primary flex items-center gap-1 transition-colors"
            >
              <Plus size={16} strokeWidth={2.4} />
              추가
            </button>
          </div>

          <div className="space-y-2">
            {agendas.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-bg-tertiary border border-border-subtle flex items-center justify-center text-[11px] text-txt-secondary shrink-0">
                  {i + 1}
                </div>
                <input
                  placeholder="어젠다 제목"
                  value={a.title}
                  onChange={(e) => updateAgenda(i, 'title', e.target.value)}
                  className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50"
                />
                <div className="flex items-center gap-1 bg-bg-tertiary border border-border-subtle rounded-md px-2 py-2 w-24">
                  <Clock size={15} className="text-txt-muted" />
                  <input
                    type="number"
                    min={1}
                    value={a.duration_minutes}
                    onChange={(e) =>
                      updateAgenda(i, 'duration_minutes', parseInt(e.target.value) || 0)
                    }
                    className="w-full bg-transparent text-sm text-txt-primary text-center focus:outline-none"
                  />
                  <span className="text-[11px] text-txt-muted">분</span>
                </div>
                {agendas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAgenda(i)}
                    className="text-txt-muted hover:text-status-error p-1.5 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 참석자 */}
        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-2 uppercase tracking-wider">
            참석자
          </label>

          <div className="bg-bg-tertiary border border-border-subtle rounded-md p-1.5 max-h-56 overflow-y-auto">
            {/* AI Crew — 전체 AI 팀 토글 */}
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all border bg-brand-purple/10 border-brand-purple/20"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-orange via-brand-purple to-brand-purple flex items-center justify-center shrink-0">
                <Sparkles size={13} className="text-white" />
              </div>
              <p className="text-sm font-medium text-txt-primary flex-1">AI Crew</p>
              <span className="text-[11px] text-txt-muted">7명의 AI 전문가</span>
              <Check size={15} className="text-brand-purple shrink-0 ml-1" />
              <span className="text-[9px] text-brand-purple font-semibold">기본</span>
            </button>

            <div className="border-t border-border-divider my-1" />

            {/* 팀 목록 */}
            {TEAMS.map((team) => {
              const selected = selectedTeams.includes(team.id);
              // 여러 팀 소속도 정확히 카운트 (teamIds 배열 전체 검사)
              const memberCount = ALL_MEMBERS.filter((m) =>
                (m.teamIds || []).includes(team.id)
              ).length;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => toggleTeam(team.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all border ${
                    selected
                      ? 'bg-brand-purple/10 border-brand-purple/20'
                      : 'hover:bg-bg-secondary border-transparent'
                  }`}
                >
                  <div className="w-6 h-6 rounded-md bg-brand-purple/15 flex items-center justify-center shrink-0">
                    <Users size={14} className="text-brand-purple" />
                  </div>
                  <p className="text-sm font-medium text-txt-primary flex-1">{team.name}</p>
                  <span className="text-[11px] text-txt-muted">{memberCount}명</span>
                  {selected && <Check size={15} className="text-brand-purple shrink-0 ml-1" />}
                </button>
              );
            })}

            {visibleMembers.length > 0 && (
              <div className="border-t border-border-divider my-1" />
            )}

            {visibleMembers.map((m) => {
              const manuallySelected = selectedMembers.includes(m.id);
              const inSelectedTeam = (m.teamIds || []).some((tid) => selectedTeams.includes(tid));
              const selected = manuallySelected || inSelectedTeam;
              // 멤버의 모든 팀 이름 표시 (첫 팀 + 추가 개수)
              const memberTeamNames = (m.teamIds || [])
                .map((tid) => TEAMS.find((t) => t.id === tid)?.name)
                .filter(Boolean);
              const teamDisplay = memberTeamNames[0];

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => !inSelectedTeam && toggleMember(m.id)}
                  disabled={inSelectedTeam}
                  title={inSelectedTeam ? `${teamDisplay}에 포함되어 자동 선택됨` : undefined}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all border ${
                    inSelectedTeam
                      ? 'bg-brand-purple/5 border-brand-purple/15 cursor-not-allowed opacity-80'
                      : manuallySelected
                        ? 'bg-brand-purple/10 border-brand-purple/20'
                        : 'hover:bg-bg-secondary border-transparent'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <p className="text-sm font-medium text-txt-primary flex-1 truncate">{m.name}</p>
                  {inSelectedTeam && (
                    <span className="text-[10px] bg-brand-purple/20 text-brand-purple-deep dark:text-brand-purple px-2 py-0.5 rounded-full font-semibold shrink-0 border border-brand-purple/30">
                      팀 포함
                    </span>
                  )}
                  {teamDisplay && !inSelectedTeam && (
                    <span className="text-[11px] text-txt-muted shrink-0">
                      {teamDisplay}
                      {memberTeamNames.length > 1 && ` +${memberTeamNames.length - 1}`}
                    </span>
                  )}
                  {selected && <Check size={15} className="text-brand-purple shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>

          {(allParticipants.length > 0 || true) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {/* AI Crew 뱃지 */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gradient-to-r from-brand-orange/20 to-brand-purple/20 text-brand-purple">
                <Sparkles size={12} />
                AI Crew
              </span>
              {selectedTeams.map((tid) => {
                const t = TEAMS.find((team) => team.id === tid);
                return (
                  <span
                    key={tid}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple/15 text-brand-purple"
                  >
                    <Users size={12} />
                    {t.name}
                    <button type="button" onClick={() => toggleTeam(tid)} className="hover:text-status-error ml-0.5">
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {selectedMembers
                .filter((id) => !teamMemberIds.includes(id))
                .map((id) => {
                  const m = ALL_MEMBERS.find((mb) => mb.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple/10 text-brand-purple"
                    >
                      {m.name}
                      <button type="button" onClick={() => toggleMember(id)} className="hover:text-status-error ml-0.5">
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              <span className="text-[11px] text-txt-muted ml-1">
                AI 7명 외 {allParticipants.length}명
              </span>
            </div>
          )}
        </div>

        {/* 회의 시간 — Apple-style */}
        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-2 uppercase tracking-wider">
            회의 시간
          </label>
          <div className="flex gap-2.5">
            <div className="flex-1 relative">
              <label className="block text-[11px] text-txt-muted mb-1">날짜</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="apple-input w-full bg-bg-tertiary border border-border-subtle rounded-[10px] px-4 py-3 text-sm font-medium text-txt-primary focus:outline-none focus:border-brand-purple/40 focus:ring-[4px] focus:ring-brand-purple/10 transition-all"
              />
            </div>
            <div className="w-52 relative">
              <label className="block text-[11px] text-txt-muted mb-1">시간</label>
              <div className="flex items-center justify-center gap-2 bg-bg-tertiary border border-border-subtle rounded-[10px] px-4 py-3 transition-all focus-within:border-brand-purple/40 focus-within:ring-[4px] focus-within:ring-brand-purple/10">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  value={scheduledTime}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9:]/g, '');
                    if (v.length === 2 && !v.includes(':') && scheduledTime.length < 3) v += ':';
                    if (v.length > 5) v = v.slice(0, 5);
                    setScheduledTime(v);
                  }}
                  onFocus={() => setShowTimeSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTimeSuggestions(false), 150)}
                  className="w-[52px] bg-transparent text-sm font-medium text-txt-primary placeholder:text-txt-muted focus:outline-none tabular-nums text-center"
                />
                <span className="text-sm text-txt-muted select-none">~</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  value={endTimeDraft}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9:]/g, '');
                    if (v.length === 2 && !v.includes(':') && endTimeDraft.length < 3) v += ':';
                    if (v.length > 5) v = v.slice(0, 5);
                    setEndTimeDraft(v);
                    if (/^\d{2}:\d{2}$/.test(v) && /^\d{2}:\d{2}$/.test(scheduledTime || '')) {
                      const [sh, sm] = scheduledTime.split(':').map(Number);
                      const [eh, em] = v.split(':').map(Number);
                      let mins = (eh * 60 + em) - (sh * 60 + sm);
                      if (mins <= 0) mins += 24 * 60;
                      if (mins > 0 && mins <= 12 * 60) setDuration(mins);
                    }
                  }}
                  className="w-[52px] bg-transparent text-sm font-medium text-txt-primary placeholder:text-txt-muted focus:outline-none tabular-nums text-center"
                />
              </div>
              {showTimeSuggestions && timeSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-border-default rounded-lg shadow-lg overflow-hidden">
                  <p className="px-3 pt-2 pb-1 text-[10px] text-txt-muted font-medium uppercase tracking-wider">
                    {recentTimes.length > 0 ? '최근 시간' : '추천 시간'}
                  </p>
                  {timeSuggestions.map((time) => (
                    <button
                      key={time}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setScheduledTime(time); setShowTimeSuggestions(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors flex items-center gap-2"
                    >
                      <Clock size={14} className="text-txt-muted" />
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 mt-3">
            {[20, 30, 45, 60, 90].map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setDuration(min)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                  duration === min
                    ? 'border-brand-purple bg-brand-purple/10 text-brand-purple shadow-sm'
                    : 'border-border-subtle text-txt-secondary hover:border-border-hover-strong hover:bg-bg-tertiary'
                }`}
              >
                {min < 60 ? `${min}분` : `${min / 60}시간${min % 60 ? ` ${min % 60}분` : ''}`}
              </button>
            ))}
          </div>

          {/* 같은 날 잡힌 회의 — 충돌·인접 인라인 표시 */}
          {meetingsOnDate.length > 0 && (
            <div className={`mt-3 rounded-md border ${
              overlapping.length > 0
                ? 'border-status-error/40 bg-status-error/[0.06]'
                : adjacent.length > 0
                  ? 'border-brand-orange/40 bg-brand-orange/[0.06]'
                  : 'border-border-subtle bg-bg-tertiary/40'
            }`}>
              <button
                type="button"
                onClick={() => setNearbyOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-tertiary/40 transition-colors rounded-md"
              >
                {overlapping.length > 0 ? (
                  <AlertTriangle size={14} className="text-status-error" />
                ) : adjacent.length > 0 ? (
                  <AlertTriangle size={14} className="text-brand-orange" />
                ) : (
                  <CalendarClock size={14} className="text-brand-purple" />
                )}
                <span className="text-[12px] font-semibold text-txt-primary">
                  이날 잡힌 회의 {meetingsOnDate.length}개
                </span>
                {proposedWindow && overlapping.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-status-error/20 text-status-error font-semibold">
                    겹침 {overlapping.length}
                  </span>
                )}
                {proposedWindow && adjacent.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-orange/20 text-brand-orange font-semibold">
                    인접 {adjacent.length}
                  </span>
                )}
                {!proposedWindow && (
                  <span className="text-[10px] text-txt-muted ml-1">일정을 잡을 때 참고하세요</span>
                )}
                {proposedWindow && (
                  <span className="ml-auto mr-1 text-[10px] text-txt-muted font-normal">
                    {fmtHM(proposedWindow.start)}–{fmtHM(proposedWindow.end)} · {fmtMin(duration)}
                  </span>
                )}
                <span className={proposedWindow ? 'text-txt-muted' : 'ml-auto text-txt-muted'}>
                  {nearbyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>
              {nearbyOpen && (
                <div className="px-3 pb-2.5 pt-0.5 space-y-1">
                  {meetingsOnDate.map((m) => {
                    const isOverlap = overlapping.some((o) => o.id === m.id);
                    const isAdjacent = adjacent.some((a) => a.id === m.id);
                    let adjacentLabel = null;
                    if (isAdjacent && proposedWindow) {
                      const before = m.endAt <= proposedWindow.start;
                      const gap = before ? proposedWindow.start - m.endAt : m.startAt - proposedWindow.end;
                      adjacentLabel = before ? `${fmtGap(gap)} 전 종료` : `${fmtGap(gap)} 후 시작`;
                    }
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-2 text-[11px] px-2 py-1.5 rounded ${
                          isOverlap
                            ? 'bg-status-error/10 border border-status-error/30'
                            : isAdjacent
                              ? 'bg-brand-orange/10 border border-brand-orange/30'
                              : 'bg-bg-secondary/50 border border-transparent'
                        }`}
                      >
                        {isOverlap && (
                          <span className="px-1.5 py-0.5 rounded bg-status-error/20 text-status-error font-semibold shrink-0">겹침</span>
                        )}
                        {isAdjacent && (
                          <span className="px-1.5 py-0.5 rounded bg-brand-orange/20 text-brand-orange font-semibold shrink-0">
                            {adjacentLabel}
                          </span>
                        )}
                        {!isOverlap && !isAdjacent && (
                          <Clock size={11} className="text-txt-muted shrink-0" />
                        )}
                        <span className="text-txt-secondary font-medium shrink-0">
                          {fmtHM(m.startAt)}–{fmtHM(m.endAt)}
                        </span>
                        <span className="text-[10px] text-txt-muted shrink-0">· {fmtMin(m.total)}</span>
                        <span className="text-txt-primary truncate flex-1">{m.title}</span>
                        {m.creatorName && (
                          <span className="text-[10px] text-txt-muted shrink-0 hidden sm:inline">
                            요청자 <span className="text-txt-secondary">{m.creatorName}</span>
                          </span>
                        )}
                        {m.status === 'active' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-status-success/15 text-status-success font-semibold shrink-0">
                            진행 중
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 참고 문서 — 파일 업로드 + URL 자료 추가 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-txt-secondary uppercase tracking-wider">
              참고 문서
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-brand-purple hover:text-txt-primary flex items-center gap-1 transition-colors"
              >
                <Paperclip size={16} strokeWidth={2.4} />
                파일
              </button>
              <button
                type="button"
                onClick={() => setUrlOpen((v) => !v)}
                className={`text-xs flex items-center gap-1 transition-colors ${
                  urlOpen ? 'text-brand-purple' : 'text-brand-purple hover:text-txt-primary'
                }`}
              >
                <Link2 size={16} strokeWidth={2.4} />
                URL
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.odp,.ods,.rtf,.txt,.md,.csv"
              onChange={handleFileAdd}
              className="hidden"
            />
          </div>

          {/* URL 입력 패널 — 토글 */}
          {urlOpen && (
            <div className="mb-2 p-3 rounded-md bg-bg-tertiary border border-border-subtle">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-brand-purple shrink-0" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl(); } }}
                  placeholder="https://docs.google.com/... 또는 https://..."
                  className="flex-1 bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50"
                />
                <button
                  type="button"
                  onClick={handleAddUrl}
                  disabled={!urlInput.trim()}
                  className="px-3 py-1.5 rounded-md bg-brand-purple text-white text-xs font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  추가
                </button>
              </div>
              <p className="text-[10px] text-txt-muted mt-1.5">
                Google Docs / Sheets / Slides 또는 일반 웹페이지 — 회의 시 참고 자료로 표시
              </p>
            </div>
          )}

          {files.length === 0 && urls.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border-default rounded-md py-6 flex flex-col items-center gap-2 text-txt-muted hover:border-brand-purple/30 hover:text-txt-secondary transition-colors"
            >
              <Paperclip size={20} />
              <p className="text-xs">문서·이미지를 드래그하거나 클릭하여 첨부</p>
              <p className="text-[10px]">PDF, DOC, XLS, PPT, 이미지 — Office 파일은 자동으로 PDF 변환됩니다</p>
            </button>
          ) : (
            <div className="space-y-1.5">
              {/* 파일 목록 */}
              {files.map((f) => {
                const IconComp = getFileIcon(f.type);
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-2.5 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2"
                  >
                    <IconComp size={18} className="text-brand-purple shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-txt-primary truncate">{f.name}</p>
                      <p className="text-[11px] text-txt-muted">{formatFileSize(f.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="text-txt-muted hover:text-status-error p-1 transition-colors shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
              {/* URL 목록 */}
              {urls.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-2.5 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2"
                >
                  <Link2 size={18} className="text-brand-purple shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-txt-primary truncate">{u.label}</p>
                    <p className="text-[11px] text-txt-muted truncate">{u.url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUrl(u.id)}
                    className="text-txt-muted hover:text-status-error p-1 transition-colors shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 border border-dashed border-border-default rounded-md py-2 text-xs text-txt-muted hover:border-brand-purple/30 hover:text-txt-secondary transition-colors flex items-center justify-center gap-1"
                >
                  <Paperclip size={13} />
                  파일 추가
                </button>
                <button
                  type="button"
                  onClick={() => setUrlOpen(true)}
                  className="flex-1 border border-dashed border-border-default rounded-md py-2 text-xs text-txt-muted hover:border-brand-purple/30 hover:text-txt-secondary transition-colors flex items-center justify-center gap-1"
                >
                  <Link2 size={13} />
                  URL 추가
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
