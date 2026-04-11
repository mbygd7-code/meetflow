import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Clock, Users, Check, Paperclip, FileText, Image, File } from 'lucide-react';
import { Modal, Input, Button } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';

const TEAMS = [
  { id: 'team-1', name: '프로덕트 팀' },
  { id: 'team-2', name: '디자인 팀' },
  { id: 'team-3', name: '엔지니어링 팀' },
];

const ALL_MEMBERS = [
  { id: 'u1', name: '김지우', color: '#FF902F', team: 'team-1' },
  { id: 'u2', name: '박서연', color: '#34D399', team: 'team-1' },
  { id: 'u3', name: '이도윤', color: '#38BDF8', team: 'team-1' },
  { id: 'u4', name: '최하린', color: '#F472B6', team: 'team-2' },
  { id: 'u5', name: '정민수', color: '#A78BFA', team: 'team-2' },
  { id: 'u6', name: '한소율', color: '#FBBF24', team: 'team-3' },
  { id: 'u7', name: '오재현', color: '#F87171', team: 'team-3' },
  { id: 'u8', name: '윤서아', color: '#2DD4BF', team: 'team-3' },
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

export default function CreateMeetingModal({ open, onClose }) {
  const [title, setTitle] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [agendas, setAgendas] = useState([
    { title: '', duration_minutes: 10 },
  ]);
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('');
  const [showTimeSuggestions, setShowTimeSuggestions] = useState(false);
  const [duration, setDuration] = useState(30);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

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
  const { createMeeting, startMeeting } = useMeeting();
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

  // 선택된 팀에 속한 멤버 ID들
  const teamMemberIds = useMemo(
    () => ALL_MEMBERS.filter((m) => selectedTeams.includes(m.team)).map((m) => m.id),
    [selectedTeams]
  );

  // 리스트에서 숨길 멤버 (선택된 팀에 속한 멤버)
  const visibleMembers = useMemo(
    () => ALL_MEMBERS.filter((m) => !selectedTeams.includes(m.team)),
    [selectedTeams]
  );

  // 최종 참석자
  const allParticipants = useMemo(() => {
    const ids = new Set([...teamMemberIds, ...selectedMembers]);
    return ALL_MEMBERS.filter((m) => ids.has(m.id));
  }, [teamMemberIds, selectedMembers]);

  const handleFileAdd = (e) => {
    const newFiles = Array.from(e.target.files).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

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

  const handleSubmit = async (startNow) => {
    if (!title.trim()) return;
    if (allParticipants.length === 0) return;
    setBusy(true);
    try {
      const cleaned = agendas.filter((a) => a.title.trim());
      const meeting = await createMeeting({
        title: title.trim(),
        team_id: selectedTeams[0] || null,
        agendas: cleaned,
        participants: allParticipants.map(({ id, name, color }) => ({ id, name, color })),
      });
      if (startNow) {
        await startMeeting(meeting.id);
        navigate(`/meetings/${meeting.id}`);
      }
      onClose();
      saveRecentTime(scheduledTime);
      setTitle('');
      setSelectedTeams([]);
      setSelectedMembers([]);
      setAgendas([{ title: '', duration_minutes: 10 }]);
      setScheduledDate(new Date().toISOString().slice(0, 10));
      setScheduledTime('');
      setDuration(30);
      setFiles([]);
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
          <Button variant="secondary" onClick={() => handleSubmit(false)} disabled={busy}>
            예약만 하기
          </Button>
          <Button
            variant="gradient"
            onClick={() => handleSubmit(true)}
            loading={busy}
            disabled={!title.trim() || allParticipants.length === 0}
          >
            회의 시작
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
            onChange={(e) => { setTitle(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoFocus
            className="w-full bg-bg-tertiary border border-border-subtle rounded-md text-sm text-txt-primary placeholder:text-txt-muted px-4 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-[3px] focus:border-brand-purple/50 focus:ring-brand-purple/15"
          />
          {showSuggestions && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-border-default rounded-lg shadow-lg max-h-[360px] overflow-y-auto scrollbar-hide">
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
              <Plus size={14} strokeWidth={2.4} />
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
                  <Clock size={13} className="text-txt-muted" />
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
                    <X size={14} />
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
            {/* 팀 목록 */}
            {TEAMS.map((team) => {
              const selected = selectedTeams.includes(team.id);
              const memberCount = ALL_MEMBERS.filter((m) => m.team === team.id).length;
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
                    <Users size={12} className="text-brand-purple" />
                  </div>
                  <p className="text-sm font-medium text-txt-primary flex-1">{team.name}</p>
                  <span className="text-[11px] text-txt-muted">{memberCount}명</span>
                  {selected && <Check size={13} className="text-brand-purple shrink-0 ml-1" />}
                </button>
              );
            })}

            {visibleMembers.length > 0 && (
              <div className="border-t border-border-divider my-1" />
            )}

            {visibleMembers.map((m) => {
              const selected = selectedMembers.includes(m.id);
              const teamName = TEAMS.find((t) => t.id === m.team)?.name;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMember(m.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all border ${
                    selected
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
                  <p className="text-sm font-medium text-txt-primary flex-1">{m.name}</p>
                  <span className="text-[11px] text-txt-muted">{teamName}</span>
                  {selected && <Check size={13} className="text-brand-purple shrink-0 ml-1" />}
                </button>
              );
            })}
          </div>

          {(allParticipants.length > 0 || true) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {/* Milo AI — 항상 기본 참여 */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gradient-to-r from-brand-orange/20 to-brand-purple/20 text-brand-purple">
                <span className="w-4 h-4 rounded-full bg-brand-purple flex items-center justify-center text-[7px] font-bold text-white">Mi</span>
                Milo
              </span>
              {selectedTeams.map((tid) => {
                const t = TEAMS.find((team) => team.id === tid);
                return (
                  <span
                    key={tid}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-purple/15 text-brand-purple"
                  >
                    <Users size={10} />
                    {t.name}
                    <button type="button" onClick={() => toggleTeam(tid)} className="hover:text-status-error ml-0.5">
                      <X size={10} />
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
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              <span className="text-[11px] text-txt-muted ml-1">총 {allParticipants.length + 1}명</span>
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
            <div className="w-40 relative">
              <label className="block text-[11px] text-txt-muted mb-1">시간</label>
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
                className="w-full bg-bg-tertiary border border-border-subtle rounded-[10px] px-4 py-3 text-sm font-medium text-txt-primary focus:outline-none focus:border-brand-purple/40 focus:ring-[4px] focus:ring-brand-purple/10 transition-all"
              />
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
                      <Clock size={12} className="text-txt-muted" />
                      {time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 mt-3">
            {[15, 30, 45, 60, 90].map((min) => (
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
        </div>

        {/* 참고 문서 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-txt-secondary uppercase tracking-wider">
              참고 문서
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-brand-purple hover:text-txt-primary flex items-center gap-1 transition-colors"
            >
              <Paperclip size={14} strokeWidth={2.4} />
              첨부
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
              onChange={handleFileAdd}
              className="hidden"
            />
          </div>

          {files.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border-default rounded-md py-6 flex flex-col items-center gap-2 text-txt-muted hover:border-brand-purple/30 hover:text-txt-secondary transition-colors"
            >
              <Paperclip size={20} />
              <p className="text-xs">문서, 이미지 등을 드래그하거나 클릭하여 첨부</p>
              <p className="text-[10px]">PDF, DOC, XLS, PPT, 이미지 등</p>
            </button>
          ) : (
            <div className="space-y-1.5">
              {files.map((f) => {
                const IconComp = getFileIcon(f.type);
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-2.5 bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2"
                  >
                    <IconComp size={16} className="text-brand-purple shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-txt-primary truncate">{f.name}</p>
                      <p className="text-[11px] text-txt-muted">{formatFileSize(f.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="text-txt-muted hover:text-status-error p-1 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-border-default rounded-md py-2 text-xs text-txt-muted hover:border-brand-purple/30 hover:text-txt-secondary transition-colors flex items-center justify-center gap-1"
              >
                <Plus size={12} />
                파일 추가
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
