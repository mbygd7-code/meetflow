import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Plus, X, Trash2, UserPlus, UserMinus, Check, Search, Edit2,
  Mail, UserCog, Loader2, AlertCircle, ChevronRight, KeyRound, Copy, ArrowLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * 팀 & 직원 관리 모달
 *
 * 구조:
 * - 탭 1: 팀 관리 (좌: 팀 목록 | 우: 선택 팀의 멤버 관리)
 * - 탭 2: 직원 관리 (초대 + 전체 직원 리스트 + 삭제)
 *
 * UX 원칙:
 * - 옵티미스틱 업데이트 (DB 응답 대기 없이 UI 반영, 실패 시 롤백)
 * - 액션별 로딩 상태 (전체 블로킹 X)
 * - 다중 선택 + 일괄 추가
 * - 커스텀 삭제 다이얼로그 (브라우저 confirm X)
 * - 키보드 단축키 (Esc 닫기, Enter 빠른 생성)
 * - 자동 포커스 흐름
 */
export default function TeamManagementModal({ open, onClose, initialTab = 'teams' }) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  // ── 탭 & 데이터 ──
  const [tab, setTab] = useState(initialTab);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── 팀 생성/수정/삭제 ──
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [deletingTeamId, setDeletingTeamId] = useState(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(null);

  // ── 멤버 추가/제거 ──
  const [pendingMemberIds, setPendingMemberIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [multiSelectIds, setMultiSelectIds] = useState(new Set());

  // ── 직원 초대/삭제 ──
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [inviteSlackId, setInviteSlackId] = useState('');
  // ── 비밀번호 재설정 링크 ──
  const [resetLinkLoadingId, setResetLinkLoadingId] = useState(null);
  const [resetLinkModal, setResetLinkModal] = useState(null); // { email, link }
  const [linkCopied, setLinkCopied] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');

  // refs
  const teamNameInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const inviteEmailRef = useRef(null);

  // ═══════ 데이터 로드 ═══════
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsRes, usersRes, tmRes] = await Promise.all([
        supabase.from('teams').select('id, name').order('name'),
        supabase.from('users').select('id, name, email, avatar_color, role, slack_user_id').order('name'),
        supabase.from('team_members').select('user_id, team_id'),
      ]);
      setTeams(teamsRes.data || []);
      setMembers(usersRes.data || []);
      setAssignments(tmRes.data || []);
    } catch (err) {
      console.error('[TeamManagement] load failed:', err);
      addToast('데이터 로드 실패', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (open) {
      loadAll();
      setTab(initialTab);
      setSearchQuery('');
      setMemberSearch('');
      setMultiSelectIds(new Set());
      setNewTeamName('');
      setEditingTeamId(null);
      setConfirmDeleteTeam(null);
      setConfirmDeleteUser(null);
      // 첫 입력 자동 포커스
      setTimeout(() => {
        if (initialTab === 'teams') teamNameInputRef.current?.focus();
        else inviteEmailRef.current?.focus();
      }, 100);
    }
  }, [open, initialTab, loadAll]);

  // Esc 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !confirmDeleteTeam && !confirmDeleteUser && !editingTeamId && !editingMember) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, confirmDeleteTeam, confirmDeleteUser, editingTeamId, editingMember]);

  // ═══════ 파생 상태 ═══════
  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId),
    [teams, selectedTeamId]
  );

  const teamMembers = useMemo(() => {
    if (!selectedTeamId) return [];
    const ids = assignments.filter((a) => a.team_id === selectedTeamId).map((a) => a.user_id);
    return members.filter((m) => ids.includes(m.id));
  }, [selectedTeamId, assignments, members]);

  const availableMembers = useMemo(() => {
    if (!selectedTeamId) return [];
    const existing = new Set(teamMembers.map((m) => m.id));
    let filtered = members.filter((m) => !existing.has(m.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [members, teamMembers, searchQuery, selectedTeamId]);

  const teamMemberCounts = useMemo(() => {
    const counts = {};
    assignments.forEach((a) => {
      counts[a.team_id] = (counts[a.team_id] || 0) + 1;
    });
    return counts;
  }, [assignments]);

  const filteredAllMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const userTeamsMap = useMemo(() => {
    const map = {};
    assignments.forEach((a) => {
      if (!map[a.user_id]) map[a.user_id] = [];
      const team = teams.find((t) => t.id === a.team_id);
      if (team) map[a.user_id].push(team.name);
    });
    return map;
  }, [assignments, teams]);

  // ═══════ 액션: 팀 생성 (옵티미스틱) ═══════
  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name || creating) return;
    if (teams.some((t) => t.name === name)) {
      addToast('같은 이름의 팀이 이미 있습니다', 'warning');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('teams')
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      setTeams((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTeamName('');
      setSelectedTeamId(data.id);
      addToast(`"${name}" 팀 생성됨`, 'success');
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } catch (err) {
      console.error('[createTeam]', err);
      addToast('팀 생성 실패: ' + err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  // ═══════ 팀 삭제 (커스텀 다이얼로그) ═══════
  const handleDeleteTeam = async () => {
    if (!confirmDeleteTeam) return;
    const teamId = confirmDeleteTeam.id;
    const teamName = confirmDeleteTeam.name;
    setDeletingTeamId(teamId);
    setConfirmDeleteTeam(null);
    try {
      await supabase.from('team_members').delete().eq('team_id', teamId);
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      setAssignments((prev) => prev.filter((a) => a.team_id !== teamId));
      if (selectedTeamId === teamId) setSelectedTeamId(null);
      addToast(`"${teamName}" 팀 삭제됨`, 'success');
    } catch (err) {
      console.error('[deleteTeam]', err);
      addToast('팀 삭제 실패: ' + err.message, 'error');
      await loadAll();
    } finally {
      setDeletingTeamId(null);
    }
  };

  // ═══════ 팀 이름 변경 (옵티미스틱) ═══════
  const handleRenameTeam = async (teamId) => {
    const name = editingName.trim();
    const original = teams.find((t) => t.id === teamId);
    if (!name || !original || name === original.name) {
      setEditingTeamId(null);
      setEditingName('');
      return;
    }
    if (teams.some((t) => t.id !== teamId && t.name === name)) {
      addToast('같은 이름의 팀이 이미 있습니다', 'warning');
      return;
    }
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, name } : t)));
    setEditingTeamId(null);
    setEditingName('');
    try {
      const { error } = await supabase.from('teams').update({ name }).eq('id', teamId);
      if (error) throw error;
      addToast('팀 이름 변경 완료', 'success');
    } catch (err) {
      console.error('[renameTeam]', err);
      addToast('이름 변경 실패: ' + err.message, 'error');
      setTeams((prev) => prev.map((t) => (t.id === teamId ? original : t)));
    }
  };

  // ═══════ 멤버 추가 (옵티미스틱) ═══════
  const handleAddMember = async (userId) => {
    if (!selectedTeamId || pendingMemberIds.has(userId)) return;
    setPendingMemberIds((prev) => new Set([...prev, userId]));
    const optimistic = { user_id: userId, team_id: selectedTeamId };
    setAssignments((prev) => [...prev, optimistic]);
    try {
      const { error } = await supabase
        .from('team_members')
        .insert({ user_id: userId, team_id: selectedTeamId });
      if (error) throw error;
    } catch (err) {
      console.error('[addMember]', err);
      addToast('멤버 추가 실패: ' + err.message, 'error');
      setAssignments((prev) =>
        prev.filter((a) => !(a.user_id === userId && a.team_id === selectedTeamId))
      );
    } finally {
      setPendingMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  // ═══════ 멤버 일괄 추가 ═══════
  const handleAddMultiple = async () => {
    if (!selectedTeamId || multiSelectIds.size === 0) return;
    const userIds = [...multiSelectIds];
    const rows = userIds.map((user_id) => ({ user_id, team_id: selectedTeamId }));
    setAssignments((prev) => [...prev, ...rows]);
    setMultiSelectIds(new Set());
    try {
      const { error } = await supabase.from('team_members').insert(rows);
      if (error) throw error;
      addToast(`${userIds.length}명 일괄 추가됨`, 'success');
    } catch (err) {
      console.error('[addMultiple]', err);
      addToast('일괄 추가 실패', 'error');
      await loadAll();
    }
  };

  // ═══════ 멤버 제거 (옵티미스틱) ═══════
  const handleRemoveMember = async (userId) => {
    if (!selectedTeamId || pendingMemberIds.has(userId)) return;
    setPendingMemberIds((prev) => new Set([...prev, userId]));
    const backup = assignments.filter(
      (a) => a.user_id === userId && a.team_id === selectedTeamId
    );
    setAssignments((prev) =>
      prev.filter((a) => !(a.user_id === userId && a.team_id === selectedTeamId))
    );
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('user_id', userId)
        .eq('team_id', selectedTeamId);
      if (error) throw error;
    } catch (err) {
      console.error('[removeMember]', err);
      addToast('멤버 제거 실패', 'error');
      setAssignments((prev) => [...prev, ...backup]);
    } finally {
      setPendingMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  // ═══════ 직원 초대 (Edge Function) ═══════
  const handleInviteUser = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addToast('올바른 이메일을 입력하세요', 'warning');
      return;
    }
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('로그인 세션이 없습니다. 다시 로그인해주세요.');
      }
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email,
          name: inviteName.trim() || null,
          teamId: inviteTeamId || null,
          slackUserId: inviteSlackId.trim() || null,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      addToast(`${email} 에게 초대 메일을 발송했습니다`, 'success');
      setInviteEmail('');
      setInviteName('');
      setInviteTeamId('');
      setInviteSlackId('');
      await loadAll();
    } catch (err) {
      console.error('[inviteUser]', err);
      addToast('초대 실패: ' + (err.message || err), 'error');
    } finally {
      setInviting(false);
    }
  };

  // ═══════ 비밀번호 재설정 링크 생성 (Edge Function) ═══════
  // 초대 이메일이 도착하지 않았거나 링크 만료된 사용자를 관리자가 즉시 복구.
  // 응답의 recoveryLink 를 Slack/카톡 등으로 직접 전달 → 사용자가 클릭 → 비밀번호 설정.
  const handleGenerateResetLink = async (member) => {
    setResetLinkLoadingId(member.id);
    try {
      // 세션 최신화 — 만료된 토큰이면 refresh
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // 한 번 리프레시 시도
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed?.session;
      }
      if (!session?.access_token) {
        throw new Error('로그인 세션이 없습니다. 로그아웃 후 다시 로그인해주세요.');
      }

      // supabase.functions.invoke 가 자동으로 Authorization/apikey 헤더 세팅 — 커스텀 헤더 X
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { userId: member.id, email: member.email },
      });

      // 에러 발생 시 서버의 실제 메시지를 response.text()로 추출
      if (error) {
        let serverMsg = error.message || '서버 에러';
        try {
          if (error.context?.text) {
            const body = await error.context.text();
            const parsed = JSON.parse(body);
            serverMsg = parsed?.error || body || serverMsg;
          }
        } catch {}
        throw new Error(serverMsg);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.recoveryLink) throw new Error('링크를 받지 못했습니다');

      setResetLinkModal({ email: member.email, name: member.name, link: data.recoveryLink });
      setLinkCopied(false);
    } catch (err) {
      console.error('[generateResetLink]', err);
      addToast('링크 생성 실패: ' + (err.message || err), 'error');
    } finally {
      setResetLinkLoadingId(null);
    }
  };

  const copyResetLink = async () => {
    if (!resetLinkModal?.link) return;
    try {
      await navigator.clipboard.writeText(resetLinkModal.link);
      setLinkCopied(true);
      addToast('링크를 복사했습니다', 'success');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      addToast('복사 실패 — 링크를 직접 선택해서 복사하세요', 'warning');
    }
  };

  // ═══════ 직원 삭제 (커스텀 다이얼로그) ═══════
  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return;
    const userId = confirmDeleteUser.id;
    const userName = confirmDeleteUser.name || confirmDeleteUser.email;
    setDeletingUserId(userId);
    setConfirmDeleteUser(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('로그인 세션이 없습니다.');
      }
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      addToast(`"${userName}" 직원 삭제됨`, 'success');
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      setAssignments((prev) => prev.filter((a) => a.user_id !== userId));
    } catch (err) {
      console.error('[deleteUser]', err);
      addToast('삭제 실패: ' + (err.message || err), 'error');
      await loadAll();
    } finally {
      setDeletingUserId(null);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-150"
      onClick={() => !confirmDeleteTeam && !confirmDeleteUser && !editingTeamId && !editingMember && onClose?.()}
    >
      <div
        className="bg-bg-secondary border border-border-default md:rounded-xl shadow-2xl w-full max-w-5xl h-full md:h-[min(720px,90vh)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══ 헤더 ═══ */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border-divider bg-bg-primary/30">
          <div className="flex items-center gap-2.5 md:gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-brand-purple/20 to-brand-orange/15 flex items-center justify-center shrink-0">
              <Users size={18} className="text-brand-purple" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base md:text-lg font-semibold text-txt-primary truncate">팀 & 직원 관리</h2>
              <p className="hidden sm:block text-xs text-txt-secondary truncate">
                팀을 만들고 직원을 배정·초대하세요. 회의 만들기에 자동 반영됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-md text-txt-muted hover:bg-bg-tertiary hover:text-txt-primary transition-colors"
            title="닫기 (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* ═══ 탭 ═══ */}
        <div className="px-4 md:px-6 pt-2 md:pt-3 border-b border-border-divider flex gap-1 shrink-0">
          {[
            { id: 'teams', label: '팀 관리', icon: Users },
            { id: 'members', label: '직원 관리', icon: UserCog },
          ].map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-2.5 text-sm font-medium transition-colors ${
                  active ? 'text-txt-primary' : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                <Icon size={16} />
                {t.label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-purple rounded-full" />}
              </button>
            );
          })}
        </div>

        {/* ═══ 본문 ═══ */}
        {tab === 'members' ? (
          // ──────── 직원 관리 탭 ────────
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* 초대 섹션 */}
            <div className="p-4 md:p-5 border-b border-border-divider bg-bg-tertiary/30 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Mail size={16} className="text-brand-purple" />
                <h3 className="text-sm font-semibold text-txt-primary">새 직원 초대</h3>
                <span className="text-[10px] text-txt-muted">이메일로 초대 링크가 발송됩니다</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <input
                  ref={inviteEmailRef}
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
                  placeholder="employee@company.com"
                  disabled={inviting}
                  className="md:col-span-5 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/15 transition-all disabled:opacity-50"
                />
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
                  placeholder="이름 (선택)"
                  disabled={inviting}
                  className="md:col-span-3 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 disabled:opacity-50"
                />
                <select
                  value={inviteTeamId}
                  onChange={(e) => setInviteTeamId(e.target.value)}
                  disabled={inviting}
                  className="md:col-span-2 bg-bg-tertiary border border-border-subtle rounded-md px-2 py-2 text-sm text-txt-primary focus:outline-none focus:border-brand-purple/50 disabled:opacity-50"
                >
                  <option value="">팀 없음</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleInviteUser}
                  disabled={inviting || !inviteEmail.trim()}
                  className="md:col-span-2 px-3 py-2 bg-brand-purple text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-1"
                >
                  {inviting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  {inviting ? '발송 중' : '초대'}
                </button>

                {/* ── 2행: Slack DM ID (선택) ── */}
                <div className="md:col-span-12 flex items-center gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-txt-muted shrink-0 min-w-[90px]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-purple">
                      <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>
                    </svg>
                    <span>Slack ID</span>
                  </div>
                  <input
                    type="text"
                    value={inviteSlackId}
                    onChange={(e) => setInviteSlackId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInviteUser()}
                    placeholder="U09XXXXXXX (사용자 ID) 또는 C09XXXXXXX (채널 ID) — 선택"
                    disabled={inviting}
                    className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-1.5 text-xs text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 disabled:opacity-50 font-mono"
                  />
                  <span className="hidden md:inline text-[10px] text-txt-muted shrink-0">
                    DM/채널 알림용
                  </span>
                </div>
              </div>
            </div>

            {/* 전체 직원 리스트 */}
            <div className="p-4 md:p-5 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="text-sm font-semibold text-txt-primary">
                  전체 직원 <span className="text-txt-muted">({members.length})</span>
                </h3>
                <div className="relative">
                  <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="이름 또는 이메일 검색"
                    className="bg-bg-tertiary border border-border-subtle rounded-md pl-8 pr-3 py-1.5 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 w-64"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {loading ? (
                  <p className="text-center text-xs text-txt-muted py-8">로딩 중...</p>
                ) : filteredAllMembers.length === 0 ? (
                  <p className="text-center text-xs text-txt-muted py-8">
                    {memberSearch ? '검색 결과 없음' : '등록된 직원이 없습니다'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredAllMembers.map((m) => {
                      const isSelf = m.id === user?.id;
                      const deleting = deletingUserId === m.id;
                      const userTeams = userTeamsMap[m.id] || [];
                      return (
                        <div
                          key={m.id}
                          className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors border ${
                            deleting ? 'opacity-40' : 'hover:bg-bg-tertiary hover:border-border-subtle border-transparent'
                          }`}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: m.avatar_color || '#723CEB' }}
                          >
                            {m.name?.[0] || m.email?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-txt-primary truncate">
                                {m.name || m.email.split('@')[0]}
                              </p>
                              {m.role === 'admin' && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-brand-purple/20 text-brand-purple rounded font-semibold uppercase tracking-wider">
                                  Admin
                                </span>
                              )}
                              {isSelf && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-brand-orange/15 text-brand-orange rounded font-medium">본인</span>
                              )}
                            </div>
                            <p className="text-[11px] text-txt-muted truncate">
                              {m.email}
                              {userTeams.length > 0 && (
                                <span className="ml-2 text-txt-secondary">· {userTeams.join(', ')}</span>
                              )}
                            </p>
                          </div>

                          {/* Slack ID — 데스크톱만 (모바일은 편집 모달에서 변경) */}
                          <div className="hidden md:block">
                            <SlackIdInlineEdit
                              member={m}
                              onSaved={(newId) => {
                                setMembers((prev) =>
                                  prev.map((x) => (x.id === m.id ? { ...x, slack_user_id: newId } : x))
                                );
                              }}
                            />
                          </div>

                          <button
                            onClick={() => setEditingMember(m)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 md:p-2 text-txt-muted hover:text-brand-purple hover:bg-brand-purple/10 rounded transition-all shrink-0"
                            title="직원 정보 편집"
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* 비밀번호 재설정 — 데스크톱만 (모바일은 편집 모달에서) */}
                          <button
                            onClick={() => resetLinkLoadingId !== m.id && handleGenerateResetLink(m)}
                            disabled={resetLinkLoadingId === m.id}
                            className="hidden md:inline-flex opacity-0 group-hover:opacity-100 p-2 text-txt-muted hover:text-brand-orange hover:bg-brand-orange/10 rounded transition-all disabled:opacity-40"
                            title="비밀번호 재설정 링크 생성 (초대 메일이 안 닿은 경우)"
                          >
                            {resetLinkLoadingId === m.id
                              ? <Loader2 size={16} className="animate-spin" />
                              : <KeyRound size={16} />}
                          </button>

                          <button
                            onClick={() => !isSelf && !deleting && setConfirmDeleteUser(m)}
                            disabled={isSelf || deleting}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 md:p-2 text-txt-muted hover:text-status-error hover:bg-status-error/10 rounded transition-all disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
                            title={isSelf ? '자기 자신은 삭제할 수 없음' : '직원 삭제'}
                          >
                            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // ──────── 팀 관리 탭 ────────
          <div className="flex-1 flex overflow-hidden">
            {/* 좌측: 팀 목록 — 모바일: 팀 미선택 시 전체, 선택 시 숨김 / 데스크톱: 항상 좌측 340px */}
            <div className={`w-full md:w-[340px] md:border-r border-border-divider flex-col ${selectedTeamId ? 'hidden md:flex' : 'flex'}`}>
              {/* 새 팀 생성 */}
              <div className="p-4 border-b border-border-divider">
                <label className="block text-[11px] text-txt-muted font-medium mb-2 uppercase tracking-wider">
                  새 팀 만들기
                </label>
                <div className="flex gap-2">
                  <input
                    ref={teamNameInputRef}
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                    placeholder="예: 마케팅팀"
                    disabled={creating}
                    className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/15 transition-all disabled:opacity-50"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={!newTeamName.trim() || creating}
                    className="px-3.5 py-2 bg-brand-purple text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
                  >
                    {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {creating ? '생성 중' : '추가'}
                  </button>
                </div>
                <p className="text-[10px] text-txt-muted mt-1.5">💡 Enter 키로 빠르게 생성</p>
              </div>

              {/* 팀 목록 */}
              <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-txt-muted">
                    <Loader2 size={18} className="animate-spin mr-2" />
                    <span className="text-xs">로딩 중...</span>
                  </div>
                ) : teams.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <Users size={32} className="text-txt-muted/40 mx-auto mb-2" />
                    <p className="text-xs text-txt-muted leading-relaxed">
                      아직 팀이 없습니다.<br />위에서 첫 팀을 만들어보세요.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-txt-muted font-medium uppercase tracking-wider px-3 py-1.5">
                      팀 {teams.length}개
                    </p>
                    {teams.map((team) => {
                      const memberCount = teamMemberCounts[team.id] || 0;
                      const isSelected = selectedTeamId === team.id;
                      const isDeleting = deletingTeamId === team.id;
                      const isEditing = editingTeamId === team.id;
                      return (
                        <div
                          key={team.id}
                          className={`group flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-all border mb-0.5 ${
                            isSelected
                              ? 'bg-brand-purple/10 border-brand-purple/30 shadow-sm'
                              : 'hover:bg-bg-tertiary border-transparent'
                          } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                          onClick={() => !isEditing && !isDeleting && setSelectedTeamId(team.id)}
                        >
                          <Users size={16} className={`shrink-0 ${isSelected ? 'text-brand-purple' : 'text-txt-muted'}`} />
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameTeam(team.id);
                                if (e.key === 'Escape') {
                                  setEditingTeamId(null);
                                  setEditingName('');
                                }
                              }}
                              onBlur={() => handleRenameTeam(team.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 bg-bg-primary border border-brand-purple/50 rounded px-2 py-0.5 text-sm focus:outline-none"
                            />
                          ) : (
                            <>
                              <p className={`text-sm font-medium flex-1 truncate ${isSelected ? 'text-txt-primary' : 'text-txt-primary/90'}`}>
                                {team.name}
                              </p>
                              <span className={`text-[10px] tabular-nums ${isSelected ? 'text-brand-purple' : 'text-txt-muted'}`}>
                                {memberCount}명
                              </span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTeamId(team.id);
                                    setEditingName(team.name);
                                  }}
                                  className="p-1 text-txt-muted hover:text-brand-purple hover:bg-brand-purple/10 rounded transition-all"
                                  title="이름 변경"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteTeam(team);
                                  }}
                                  className="p-1 text-txt-muted hover:text-status-error hover:bg-status-error/10 rounded transition-all"
                                  title="팀 삭제"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              {isSelected && !isDeleting && (
                                <ChevronRight size={14} className="text-brand-purple shrink-0" />
                              )}
                              {isDeleting && (
                                <Loader2 size={14} className="text-txt-muted animate-spin shrink-0" />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 우측: 선택된 팀 상세 — 모바일: 선택 시만, 데스크톱: 항상 */}
            <div className={`flex-1 flex-col overflow-hidden bg-bg-primary/30 ${selectedTeamId ? 'flex' : 'hidden md:flex'}`}>
              {!selectedTeamId ? (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div>
                    <div className="w-16 h-16 rounded-full bg-brand-purple/10 flex items-center justify-center mx-auto mb-4">
                      <Users size={28} className="text-brand-purple/70" />
                    </div>
                    <h3 className="text-base font-semibold text-txt-primary mb-1.5">
                      {teams.length > 0 ? '팀을 선택하세요' : '첫 팀을 만들어보세요'}
                    </h3>
                    <p className="text-xs text-txt-secondary leading-relaxed max-w-xs">
                      {teams.length > 0
                        ? '좌측에서 팀을 클릭하면 멤버를 추가하거나 관리할 수 있습니다.'
                        : '팀을 만들고 직원을 배정하면 회의 만들기에서 바로 선택할 수 있습니다.'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border-divider bg-bg-secondary/50 shrink-0">
                    <div className="flex items-center gap-2.5 md:gap-3">
                      {/* 모바일 전용 뒤로가기 — 팀 목록으로 복귀 */}
                      <button
                        onClick={() => setSelectedTeamId(null)}
                        className="md:hidden shrink-0 -ml-1 w-9 h-9 rounded-md flex items-center justify-center hover:bg-bg-tertiary text-txt-secondary"
                        aria-label="팀 목록으로"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-brand-purple" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-txt-primary">{selectedTeam?.name}</h3>
                        <p className="text-[11px] text-txt-muted">
                          멤버 {teamMembers.length}명 · 추가 가능 {availableMembers.length}명
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5 md:space-y-6 scrollbar-hide">
                    {/* 현재 멤버 */}
                    <section>
                      <h4 className="text-xs text-txt-primary font-semibold uppercase tracking-wider mb-2.5">
                        현재 멤버 <span className="text-txt-muted">({teamMembers.length})</span>
                      </h4>
                      {teamMembers.length === 0 ? (
                        <div className="text-center py-6 bg-bg-secondary border border-dashed border-border-subtle rounded-md">
                          <UserPlus size={24} className="text-txt-muted/40 mx-auto mb-2" />
                          <p className="text-xs text-txt-muted">아직 멤버가 없습니다.<br />아래에서 직원을 추가하세요.</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {teamMembers.map((m) => (
                            <MemberRow
                              key={m.id}
                              member={m}
                              isPending={pendingMemberIds.has(m.id)}
                              action="remove"
                              onAction={() => handleRemoveMember(m.id)}
                            />
                          ))}
                        </div>
                      )}
                    </section>

                    {/* 멤버 추가 */}
                    <section>
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs text-txt-primary font-semibold uppercase tracking-wider">
                          팀에 추가 <span className="text-txt-muted">({availableMembers.length})</span>
                        </h4>
                        {multiSelectIds.size > 0 && (
                          <button
                            onClick={handleAddMultiple}
                            className="px-3 py-1 bg-brand-purple text-white rounded-md text-[11px] font-semibold hover:opacity-90 transition-opacity flex items-center gap-1"
                          >
                            <UserPlus size={13} />
                            {multiSelectIds.size}명 일괄 추가
                          </button>
                        )}
                      </div>
                      <div className="relative mb-2">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="이름 또는 이메일 검색"
                          className="w-full bg-bg-secondary border border-border-subtle rounded-md pl-9 pr-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 focus:ring-2 focus:ring-brand-purple/15 transition-all"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      {availableMembers.length === 0 ? (
                        <div className="text-center py-6 bg-bg-secondary border border-dashed border-border-subtle rounded-md">
                          <p className="text-xs text-txt-muted">
                            {searchQuery ? `"${searchQuery}" 결과 없음` : '추가할 직원이 없습니다'}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-80 overflow-y-auto scrollbar-hide">
                          {availableMembers.map((m) => (
                            <MemberRow
                              key={m.id}
                              member={m}
                              isPending={pendingMemberIds.has(m.id)}
                              action="add"
                              isSelected={multiSelectIds.has(m.id)}
                              onToggleSelect={() => {
                                setMultiSelectIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(m.id)) next.delete(m.id);
                                  else next.add(m.id);
                                  return next;
                                });
                              }}
                              onAction={() => handleAddMember(m.id)}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ 푸터 ═══ */}
        <div className="px-4 md:px-6 py-2.5 md:py-3 border-t border-border-divider bg-bg-primary/30 flex items-center justify-between gap-3 shrink-0">
          <p className="text-[11px] text-txt-muted truncate">
            {teams.length}개 팀 · {members.length}명 직원 · 배정 {assignments.length}건
          </p>
          <button
            onClick={onClose}
            className="shrink-0 px-5 py-1.5 bg-brand-purple text-white rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            완료
          </button>
        </div>
      </div>

      {/* 커스텀 삭제 확인 다이얼로그 — 팀 */}
      {confirmDeleteTeam && (
        <ConfirmDialog
          title="팀 삭제"
          description={
            <>
              <strong className="text-txt-primary">"{confirmDeleteTeam.name}"</strong> 팀을 정말 삭제하시겠습니까?
              <br />
              <span className="text-xs text-txt-muted">
                팀에 속한 {teamMemberCounts[confirmDeleteTeam.id] || 0}명의 멤버 연결도 함께 제거됩니다. (직원 계정은 유지)
              </span>
            </>
          }
          confirmLabel="삭제"
          onConfirm={handleDeleteTeam}
          onCancel={() => setConfirmDeleteTeam(null)}
        />
      )}

      {/* 직원 정보 편집 다이얼로그 */}
      {editingMember && (
        <EditMemberDialog
          member={editingMember}
          allTeams={teams}
          memberTeamIds={(assignments.filter((a) => a.user_id === editingMember.id).map((a) => a.team_id))}
          onClose={() => setEditingMember(null)}
          onSaved={async () => {
            await loadAll();
            setEditingMember(null);
          }}
        />
      )}

      {/* 커스텀 삭제 확인 다이얼로그 — 직원 */}
      {confirmDeleteUser && (
        <ConfirmDialog
          title="직원 삭제"
          description={
            <>
              <strong className="text-txt-primary">
                "{confirmDeleteUser.name || confirmDeleteUser.email}"
              </strong>{' '}
              직원 계정을 삭제하시겠습니까?
              <br />
              <span className="text-xs text-txt-muted">
                로그인 계정과 모든 팀 연결이 제거됩니다. <strong className="text-status-error">되돌릴 수 없습니다.</strong>
              </span>
            </>
          }
          confirmLabel="영구 삭제"
          onConfirm={handleDeleteUser}
          onCancel={() => setConfirmDeleteUser(null)}
        />
      )}

      {/* ═══ 비밀번호 재설정 링크 모달 ═══ */}
      {resetLinkModal && (
        <div
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setResetLinkModal(null)}
        >
          <div
            className="bg-bg-secondary border border-border-default rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-divider">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-orange/20 to-brand-purple/15 flex items-center justify-center">
                  <KeyRound size={18} className="text-brand-orange" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-txt-primary">비밀번호 재설정 링크</h3>
                  <p className="text-xs text-txt-secondary">
                    {resetLinkModal.name || resetLinkModal.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setResetLinkModal(null)}
                className="p-2 rounded-md text-txt-muted hover:bg-bg-tertiary hover:text-txt-primary"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-brand-orange/10 border border-brand-orange/20 rounded-lg p-3 text-xs text-txt-secondary">
                <strong className="text-brand-orange">⚠ 보안 주의:</strong> 이 링크를 클릭하면 누구나 비밀번호를 재설정할 수 있습니다.
                반드시 **본인에게 직접**(Slack DM, 카카오톡 등) 전달하세요. 유효기간 약 1시간.
              </div>

              <div>
                <label className="block text-xs text-txt-secondary mb-2">링크 (클릭해서 전체 선택)</label>
                <textarea
                  readOnly
                  value={resetLinkModal.link}
                  onFocus={(e) => e.target.select()}
                  className="w-full h-24 px-3 py-2 text-xs font-mono bg-bg-primary border border-border-default rounded-md text-txt-primary resize-none break-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyResetLink}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium text-sm transition-colors ${
                    linkCopied
                      ? 'bg-status-success/20 text-status-success border border-status-success/30'
                      : 'bg-brand-purple text-white hover:bg-brand-purple/90'
                  }`}
                >
                  {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                  {linkCopied ? '복사됨' : '링크 복사'}
                </button>
                <button
                  onClick={() => setResetLinkModal(null)}
                  className="px-4 py-2.5 rounded-md text-sm text-txt-secondary border border-border-default hover:bg-bg-tertiary transition-colors"
                >
                  닫기
                </button>
              </div>

              <p className="text-[11px] text-txt-muted pt-2 border-t border-border-divider">
                💡 사용자가 링크 클릭 → 새 비밀번호 입력 → 자동 로그인 → 로그인 페이지로 이동합니다.
                초대 이메일이 오지 않았거나 만료된 경우에도 이 방법으로 복구할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// ═══════ 서브 컴포넌트 ═══════

function MemberRow({ member, isPending, action, isSelected, onToggleSelect, onAction }) {
  const m = member;
  const isAddAction = action === 'add';

  const handleRowClick = () => {
    if (isPending) return;
    onAction?.();
  };

  return (
    <div
      onClick={handleRowClick}
      className={`group flex items-center gap-3 px-3 py-2 rounded-md transition-all border cursor-pointer ${
        isSelected
          ? 'bg-brand-purple/10 border-brand-purple/30'
          : isAddAction
            ? 'border-transparent hover:bg-brand-purple/5 hover:border-brand-purple/20'
            : 'border-transparent hover:bg-status-error/5 hover:border-status-error/20'
      } ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {isAddAction && onToggleSelect && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
            isSelected
              ? 'bg-brand-purple border-brand-purple'
              : 'border-border-default hover:border-brand-purple/50 bg-bg-primary'
          }`}
          title="일괄 추가용 선택"
        >
          {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
        </button>
      )}

      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ backgroundColor: m.avatar_color || '#723CEB' }}
      >
        {m.name?.[0] || '?'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-txt-primary font-medium truncate">{m.name}</p>
          {m.role === 'admin' && (
            <span className="text-[9px] bg-brand-purple/20 text-brand-purple px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
              Admin
            </span>
          )}
        </div>
        <p className="text-[10px] text-txt-muted truncate">{m.email}</p>
      </div>

      {isPending ? (
        <Loader2 size={16} className="text-txt-muted animate-spin shrink-0" />
      ) : isAddAction ? (
        <button
          onClick={(e) => { e.stopPropagation(); onAction?.(); }}
          className="px-2.5 py-1 rounded-md bg-brand-purple/10 text-brand-purple text-[11px] font-semibold hover:bg-brand-purple hover:text-white transition-all flex items-center gap-1 shrink-0"
          title="팀에 추가"
        >
          <UserPlus size={13} />
          추가
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onAction?.(); }}
          className="px-2.5 py-1 rounded-md bg-status-error/10 text-status-error text-[11px] font-semibold hover:bg-status-error hover:text-white transition-all flex items-center gap-1 shrink-0"
          title="팀에서 제거"
        >
          <UserMinus size={13} />
          제거
        </button>
      )}
    </div>
  );
}

function ConfirmDialog({ title, description, confirmLabel = '확인', onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-bg-secondary border border-border-default rounded-lg shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-status-error/15 flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-status-error" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-txt-primary mb-1">{title}</h3>
            <div className="text-sm text-txt-secondary leading-relaxed">{description}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 border border-border-subtle text-txt-primary rounded-md text-sm font-medium hover:bg-bg-tertiary transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 bg-status-error text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────── Slack ID 인라인 편집 ───────
function SlackIdInlineEdit({ member, onSaved }) {
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.slack_user_id || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const inputRef = useRef(null);

  const handleTest = async () => {
    if (!member.slack_user_id) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-notify', {
        body: {
          event: 'slack_test',
          payload: { slack_id: member.slack_user_id, name: member.name },
        },
      });
      if (error) throw error;

      // 진단 정보 콘솔 출력 (워크스페이스/실제 수신자 확인용)
      console.log('════════════════════════════════════════════');
      console.log('[Slack 연동 진단] 대상:', member.name, member.slack_user_id);
      console.log('  ✓ 발송 결과:', data?.ok ? '성공' : `실패 — ${data?.error}`);
      if (data?.channel) console.log('  ✓ 배달된 채널 ID:', data.channel);
      if (data?.diagnostics?.bot_workspace) {
        const ws = data.diagnostics.bot_workspace;
        console.log('  ✓ 봇 설치 워크스페이스:', ws.team, `(${ws.url || ws.team_id})`);
        console.log('  ✓ 봇 이름/ID:', ws.bot_name, ws.bot_user_id);
      }
      if (data?.diagnostics?.resolved_user) {
        const u = data.diagnostics.resolved_user;
        if (u.ok === false) {
          console.error('  ✗ 사용자 조회 실패:', u.error, '→ 이 워크스페이스에 해당 ID가 없습니다');
        } else {
          console.log('  ✓ 이 ID의 실제 주인:', u.real_name, `(${u.display_name})`, u.email || '');
          console.log('  ✓ 사용자의 워크스페이스 ID:', u.team_id);
        }
      }
      console.log('════════════════════════════════════════════');

      if (data?.ok) {
        const ws = data?.diagnostics?.bot_workspace;
        const u = data?.diagnostics?.resolved_user;
        const wsName = ws?.team ? `(${ws.team})` : '';
        const userName = u?.real_name ? ` → ${u.real_name}` : '';
        addToast(
          `✅ 발송 성공${userName} ${wsName} — 콘솔 확인`,
          'success'
        );
      } else {
        addToast(`Slack DM 실패: ${data?.error || '알 수 없음'}`, 'error');
      }
    } catch (err) {
      console.error('[slack_test]', err);
      addToast('테스트 실패: ' + (err.message || err), 'error');
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    setValue(member.slack_user_id || '');
  }, [member.slack_user_id]);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  const save = async () => {
    const v = value.trim() || null;
    if ((v || null) === (member.slack_user_id || null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ slack_user_id: v })
        .eq('id', member.id);
      if (error) throw error;
      onSaved?.(v);
      addToast(v ? 'Slack ID 저장됨' : 'Slack ID 제거됨', 'success');
      setEditing(false);
    } catch (err) {
      console.error('[SlackIdInlineEdit]', err);
      addToast('Slack ID 저장 실패: ' + (err.message || err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              setValue(member.slack_user_id || '');
              setEditing(false);
            }
          }}
          placeholder="U09XXXXXXX"
          disabled={saving}
          className="bg-bg-primary border border-brand-purple/40 rounded px-2 py-1 text-[11px] text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple w-44 font-mono"
        />
        <button
          onClick={save}
          disabled={saving}
          className="p-1 rounded bg-brand-purple text-white hover:opacity-90 disabled:opacity-40"
          title="저장 (Enter)"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button
          onClick={() => {
            setValue(member.slack_user_id || '');
            setEditing(false);
          }}
          disabled={saving}
          className="p-1 rounded text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary"
          title="취소 (Esc)"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  const hasId = !!member.slack_user_id;
  return (
    <div className="inline-flex items-center gap-0.5 opacity-60 group-hover:opacity-100">
      <button
        onClick={() => setEditing(true)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono border transition-colors ${
          hasId
            ? 'bg-brand-purple/10 border-brand-purple/25 text-brand-purple hover:bg-brand-purple/15'
            : 'border-dashed border-border-subtle text-txt-muted hover:border-brand-purple/40 hover:text-brand-purple'
        }`}
        title={hasId ? `Slack ID 수정 (${member.slack_user_id})` : 'Slack ID 추가'}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>
        </svg>
        {hasId ? member.slack_user_id : '+ Slack ID'}
      </button>
      {hasId && (
        <button
          onClick={handleTest}
          disabled={testing}
          className="p-1 rounded text-txt-muted hover:text-status-success hover:bg-status-success/10 transition-colors disabled:opacity-50"
          title="테스트 DM 발송"
        >
          {testing
            ? <Loader2 size={12} className="animate-spin" />
            : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          }
        </button>
      )}
    </div>
  );
}

// ─────── 직원 정보 편집 다이얼로그 ───────
function EditMemberDialog({ member, allTeams, memberTeamIds, onClose, onSaved }) {
  const addToast = useToastStore((s) => s.addToast);
  const { user: currentUser } = useAuthStore();
  const [name, setName] = useState(member.name || '');
  const [role, setRole] = useState(member.role || 'user');
  const [slackId, setSlackId] = useState(member.slack_user_id || '');
  const [avatarColor, setAvatarColor] = useState(member.avatar_color || '#723CEB');
  const [teamIds, setTeamIds] = useState(new Set(memberTeamIds || []));
  const [saving, setSaving] = useState(false);
  const isSelf = member.id === currentUser?.id;

  const toggleTeam = (id) => {
    setTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1) users 테이블 업데이트
      const { error: userErr } = await supabase
        .from('users')
        .update({
          name: name.trim() || null,
          role,
          slack_user_id: slackId.trim() || null,
          avatar_color: avatarColor,
        })
        .eq('id', member.id);
      if (userErr) throw userErr;

      // 2) 팀 배정 변경 (diff)
      const prevSet = new Set(memberTeamIds || []);
      const nextSet = teamIds;
      const toAdd = [...nextSet].filter((t) => !prevSet.has(t));
      const toRemove = [...prevSet].filter((t) => !nextSet.has(t));

      if (toAdd.length > 0) {
        const rows = toAdd.map((team_id) => ({ user_id: member.id, team_id }));
        const { error } = await supabase
          .from('team_members')
          .upsert(rows, { onConflict: 'user_id,team_id' });
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('team_members')
          .delete()
          .eq('user_id', member.id)
          .in('team_id', toRemove);
        if (error) throw error;
      }

      addToast('직원 정보가 저장되었습니다', 'success');
      onSaved?.();
    } catch (err) {
      console.error('[EditMemberDialog]', err);
      addToast('저장 실패: ' + (err.message || err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 프리셋 색상
  const colors = [
    '#723CEB', '#4C11CE', '#FF902F', '#FFEF63',
    '#34D399', '#EF4444', '#EC4899', '#06B6D4',
    '#8B5CF6', '#F59E0B', '#10B981', '#6366F1',
  ];

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border-default rounded-lg shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-divider shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: avatarColor }}
            >
              {(name || member.email)?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-txt-primary">직원 정보 편집</h3>
              <p className="text-[11px] text-txt-muted">{member.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-txt-muted hover:bg-bg-tertiary hover:text-txt-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-hide">
          {/* 이름 */}
          <div>
            <label className="block text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={member.email.split('@')[0]}
              className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50"
            />
          </div>

          {/* 역할 */}
          <div>
            <label className="block text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">
              역할
            </label>
            <div className="flex gap-2">
              {[
                { value: 'user', label: '일반 직원', color: 'text-txt-secondary' },
                { value: 'admin', label: '관리자', color: 'text-brand-purple' },
              ].map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => !isSelf && setRole(r.value)}
                  disabled={isSelf && role === 'admin' && r.value === 'user'}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-all ${
                    role === r.value
                      ? 'bg-brand-purple/15 border-brand-purple/40 text-brand-purple'
                      : 'bg-bg-tertiary border-border-subtle text-txt-secondary hover:border-brand-purple/30'
                  } ${isSelf && role === 'admin' && r.value === 'user' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {isSelf && (
              <p className="text-[10px] text-txt-muted mt-1">
                ⚠ 본인 관리자 권한은 해제할 수 없습니다
              </p>
            )}
          </div>

          {/* Slack ID */}
          <div>
            <label className="block text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">
              Slack ID <span className="text-txt-muted font-normal normal-case tracking-normal">(DM/채널 알림용)</span>
            </label>
            <input
              type="text"
              value={slackId}
              onChange={(e) => setSlackId(e.target.value)}
              placeholder="U09XXXXXXX (사용자 ID) 또는 C09XXXXXXX (채널 ID)"
              className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50 font-mono"
            />
            <p className="text-[10px] text-txt-muted mt-1">
              Slack → 프로필 → "member ID 복사" 로 가져오세요
            </p>
          </div>

          {/* 아바타 색상 */}
          <div>
            <label className="block text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">
              프로필 색상
            </label>
            <div className="flex flex-wrap gap-1.5">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    avatarColor === c ? 'ring-2 ring-brand-purple ring-offset-2 ring-offset-bg-secondary scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* 팀 소속 */}
          <div>
            <label className="block text-[11px] text-txt-muted font-semibold uppercase tracking-wider mb-1.5">
              팀 소속 ({teamIds.size}개)
            </label>
            {allTeams.length === 0 ? (
              <p className="text-xs text-txt-muted italic py-2">등록된 팀이 없습니다</p>
            ) : (
              <div className="space-y-1">
                {allTeams.map((t) => {
                  const checked = teamIds.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-brand-purple/10 border-brand-purple/30'
                          : 'bg-bg-tertiary border-border-subtle hover:border-brand-purple/20'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTeam(t.id)}
                        className="accent-brand-purple"
                      />
                      <span className={`text-sm ${checked ? 'text-txt-primary font-medium' : 'text-txt-secondary'}`}>
                        {t.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-divider bg-bg-tertiary/30 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-1.5 text-sm text-txt-secondary hover:text-txt-primary rounded-md hover:bg-bg-tertiary transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-brand-purple text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {saving ? '저장 중' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
