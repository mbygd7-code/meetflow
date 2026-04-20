import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Plus, X, Trash2, UserPlus, UserMinus, Check, Search, Edit2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

// 팀/직원 관리 모달 — 관리자 대시보드에서 클릭 시 진입
// 기능: 팀 생성/삭제/이름변경, 팀원 추가/제거
export default function TeamManagementModal({ open, onClose, initialTab = 'teams' }) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  const [tab, setTab] = useState(initialTab);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);      // 전체 회원
  const [assignments, setAssignments] = useState([]); // team_members [{ user_id, team_id }]
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingName, setEditingName] = useState('');

  // 데이터 로드
  async function loadAll() {
    setLoading(true);
    try {
      const [teamsRes, usersRes, tmRes] = await Promise.all([
        supabase.from('teams').select('id, name').order('name'),
        supabase.from('users').select('id, name, email, avatar_color, role').order('name'),
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
  }

  useEffect(() => {
    if (open) {
      loadAll();
      setTab(initialTab);
    }
  }, [open, initialTab]);

  // 선택한 팀의 멤버
  const teamMembers = useMemo(() => {
    if (!selectedTeamId) return [];
    const userIds = assignments
      .filter((a) => a.team_id === selectedTeamId)
      .map((a) => a.user_id);
    return members.filter((m) => userIds.includes(m.id));
  }, [selectedTeamId, assignments, members]);

  // 선택한 팀에 없는 멤버 (추가 후보)
  const availableMembers = useMemo(() => {
    if (!selectedTeamId) return [];
    const existingIds = new Set(teamMembers.map((m) => m.id));
    const filtered = members.filter((m) => !existingIds.has(m.id));
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [members, teamMembers, searchQuery, selectedTeamId]);

  // 각 팀의 멤버 수
  const teamMemberCounts = useMemo(() => {
    const counts = {};
    assignments.forEach((a) => {
      counts[a.team_id] = (counts[a.team_id] || 0) + 1;
    });
    return counts;
  }, [assignments]);

  // === 액션 ===

  async function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    if (teams.some((t) => t.name === name)) {
      addToast('같은 이름의 팀이 이미 있습니다', 'warning');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('teams')
        .insert({ name })
        .select()
        .single();
      if (error) throw error;
      setNewTeamName('');
      await loadAll();
      setSelectedTeamId(data.id);
      addToast(`"${name}" 팀이 생성되었습니다`, 'success');
    } catch (err) {
      console.error('[createTeam]', err);
      addToast('팀 생성 실패: ' + err.message, 'error');
    }
  }

  async function handleDeleteTeam(teamId, teamName) {
    if (!confirm(`"${teamName}" 팀을 삭제하시겠습니까?\n팀 멤버 연결도 함께 제거됩니다.`)) return;
    try {
      // 먼저 team_members 삭제
      await supabase.from('team_members').delete().eq('team_id', teamId);
      // 팀 삭제
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
      if (selectedTeamId === teamId) setSelectedTeamId(null);
      await loadAll();
      addToast(`"${teamName}" 팀이 삭제되었습니다`, 'success');
    } catch (err) {
      console.error('[deleteTeam]', err);
      addToast('팀 삭제 실패: ' + err.message, 'error');
    }
  }

  async function handleRenameTeam(teamId) {
    const name = editingName.trim();
    if (!name) {
      setEditingTeamId(null);
      return;
    }
    try {
      const { error } = await supabase.from('teams').update({ name }).eq('id', teamId);
      if (error) throw error;
      setEditingTeamId(null);
      setEditingName('');
      await loadAll();
      addToast('팀 이름 변경 완료', 'success');
    } catch (err) {
      console.error('[renameTeam]', err);
      addToast('이름 변경 실패: ' + err.message, 'error');
    }
  }

  async function handleAddMember(userId) {
    if (!selectedTeamId) return;
    try {
      const { error } = await supabase
        .from('team_members')
        .insert({ user_id: userId, team_id: selectedTeamId });
      if (error) throw error;
      await loadAll();
    } catch (err) {
      console.error('[addMember]', err);
      addToast('멤버 추가 실패: ' + err.message, 'error');
    }
  }

  async function handleRemoveMember(userId) {
    if (!selectedTeamId) return;
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('user_id', userId)
        .eq('team_id', selectedTeamId);
      if (error) throw error;
      await loadAll();
    } catch (err) {
      console.error('[removeMember]', err);
      addToast('멤버 제거 실패: ' + err.message, 'error');
    }
  }

  if (!open) return null;

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary border border-border-default rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-divider">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-purple/15 flex items-center justify-center">
              <Users size={18} className="text-brand-purple" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-txt-primary">팀 & 직원 관리</h2>
              <p className="text-xs text-txt-secondary">
                팀을 만들고 직원을 배정하세요. 회의 만들기에 자동 반영됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-txt-muted hover:bg-bg-tertiary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 — 2컬럼 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 좌측: 팀 목록 */}
          <div className="w-[340px] border-r border-border-divider flex flex-col">
            {/* 새 팀 생성 */}
            <div className="p-4 border-b border-border-divider">
              <label className="block text-[11px] text-txt-muted font-medium mb-1.5">새 팀 만들기</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
                  placeholder="예: 마케팅팀"
                  className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-1.5 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50"
                />
                <button
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim()}
                  className="px-3 py-1.5 bg-brand-purple text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1"
                >
                  <Plus size={14} />
                  추가
                </button>
              </div>
            </div>

            {/* 팀 목록 */}
            <div className="flex-1 overflow-y-auto p-2">
              {loading && (
                <p className="text-center text-xs text-txt-muted py-4">로딩 중...</p>
              )}
              {!loading && teams.length === 0 && (
                <p className="text-center text-xs text-txt-muted py-8">
                  생성된 팀이 없습니다.<br />위에서 팀을 만들어보세요.
                </p>
              )}
              {teams.map((team) => (
                <div
                  key={team.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-md cursor-pointer transition-colors mb-1 ${
                    selectedTeamId === team.id
                      ? 'bg-brand-purple/10 border border-brand-purple/20'
                      : 'hover:bg-bg-tertiary border border-transparent'
                  }`}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  <Users size={14} className="text-txt-muted shrink-0" />
                  {editingTeamId === team.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameTeam(team.id)}
                      onBlur={() => handleRenameTeam(team.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-bg-primary border border-brand-purple/50 rounded px-2 py-0.5 text-sm focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="text-sm font-medium text-txt-primary flex-1 truncate">{team.name}</p>
                      <span className="text-[10px] text-txt-muted">
                        {teamMemberCounts[team.id] || 0}명
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTeamId(team.id);
                          setEditingName(team.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-txt-muted hover:text-brand-purple transition-all"
                        title="이름 변경"
                      >
                        <Edit2 size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTeam(team.id, team.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-txt-muted hover:text-status-error transition-all"
                        title="팀 삭제"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 우측: 선택된 팀 상세 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedTeamId ? (
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <Users size={40} className="text-txt-muted/50 mx-auto mb-3" />
                  <p className="text-sm text-txt-secondary">
                    좌측에서 팀을 선택하거나<br />새 팀을 만들어보세요
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* 팀 헤더 */}
                <div className="px-6 py-4 border-b border-border-divider">
                  <h3 className="text-base font-semibold text-txt-primary">{selectedTeam?.name}</h3>
                  <p className="text-[11px] text-txt-muted mt-0.5">
                    멤버 {teamMembers.length}명
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* 현재 멤버 */}
                  <div>
                    <h4 className="text-[11px] text-txt-muted font-medium uppercase tracking-wider mb-2">
                      현재 멤버
                    </h4>
                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-txt-muted text-center py-4 bg-bg-tertiary rounded-md">
                        아직 멤버가 없습니다
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {teamMembers.map((m) => (
                          <div
                            key={m.id}
                            className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-tertiary transition-colors"
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                              style={{ backgroundColor: m.avatar_color || '#723CEB' }}
                            >
                              {m.name?.[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-txt-primary truncate">{m.name}</p>
                              <p className="text-[10px] text-txt-muted truncate">{m.email}</p>
                            </div>
                            {m.role === 'admin' && (
                              <span className="text-[9px] text-brand-purple font-semibold">관리자</span>
                            )}
                            <button
                              onClick={() => handleRemoveMember(m.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-txt-muted hover:text-status-error rounded transition-all"
                              title="팀에서 제거"
                            >
                              <UserMinus size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 멤버 추가 */}
                  <div>
                    <h4 className="text-[11px] text-txt-muted font-medium uppercase tracking-wider mb-2">
                      멤버 추가
                    </h4>
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="이름 또는 이메일 검색"
                        className="w-full bg-bg-tertiary border border-border-subtle rounded-md pl-8 pr-3 py-1.5 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:border-brand-purple/50"
                      />
                    </div>
                    {availableMembers.length === 0 ? (
                      <p className="text-xs text-txt-muted text-center py-4 bg-bg-tertiary rounded-md">
                        {searchQuery ? '검색 결과 없음' : '추가할 수 있는 직원이 없습니다'}
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {availableMembers.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-tertiary transition-colors"
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                              style={{ backgroundColor: m.avatar_color || '#723CEB' }}
                            >
                              {m.name?.[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-txt-primary truncate">{m.name}</p>
                              <p className="text-[10px] text-txt-muted truncate">{m.email}</p>
                            </div>
                            <button
                              onClick={() => handleAddMember(m.id)}
                              className="p-1.5 text-brand-purple hover:bg-brand-purple/10 rounded transition-colors"
                              title="팀에 추가"
                            >
                              <UserPlus size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-3 border-t border-border-divider bg-bg-primary/30 flex items-center justify-between">
          <p className="text-[11px] text-txt-muted">
            {teams.length}개 팀 · {members.length}명 직원
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-brand-purple text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            완료
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
