import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Slack, FileText, Bell, Check, Sun, Moon, Monitor,
  Bot, Shield, Upload, X, Plus, Sparkles,
  BarChart3, Zap, RotateCcw, ChevronDown, ChevronUp,
  Users, Settings, CalendarDays, ExternalLink, RefreshCw,
  Loader2,
} from 'lucide-react';
import { Card, Input, Button, Badge, SectionPanel } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { supabase } from '@/lib/supabase';
import AdminUserManagement from '@/components/admin/AdminUserManagement';
import { useAiTeamStore, AI_EMPLOYEES, MEETING_PRESETS, LLM_MODELS } from '@/stores/aiTeamStore';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// ── Toggle 컴포넌트 ──
function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-center justify-between py-2.5 cursor-pointer group">
      <div className="flex-1 mr-4">
        <span className="text-sm text-txt-primary">{label}</span>
        {description && <p className="text-[11px] text-txt-muted mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-brand-purple' : 'bg-bg-tertiary border border-border-default'
        }`}
      >
        <span
          className={`absolute top-0.5 ${
            checked ? 'left-5' : 'left-0.5'
          } w-4 h-4 rounded-full bg-white transition-all`}
        />
      </button>
    </label>
  );
}

// ── AI 직원 아바타 ──
function AiAvatar({ employee, size = 'md' }) {
  const [imgErr, setImgErr] = useState(false);
  const sizeClasses = {
    sm: 'w-8 h-8 text-[11px]',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  if (employee.avatar && !imgErr) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden shrink-0 ring-2 ring-white/10`}
        style={{ backgroundColor: employee.color }}
      >
        <img
          src={employee.avatar}
          alt={employee.nameKo}
          onError={() => setImgErr(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: employee.color }}
    >
      {employee.initials}
    </div>
  );
}

// ── AI 직원 카드 ──
function AiEmployeeCard({ employee, isActive, onToggle, onExpand, isExpanded }) {
  const store = useAiTeamStore();
  const overrides = store.employeeOverrides[employee.id] || {};
  const fileCount = overrides.knowledgeFiles?.length || 0;

  return (
    <div
      className={`rounded-lg border transition-all ${
        isActive
          ? 'border-border-default bg-[var(--card-bg)]'
          : 'border-border-subtle bg-bg-tertiary opacity-60'
      }`}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-bg-tertiary/30 transition-colors"
        onClick={() => onExpand(isExpanded ? null : employee.id)}
      >
        <AiAvatar employee={employee} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-txt-primary">{employee.name}</p>
            <span className="text-[11px] text-txt-muted">({employee.nameKo})</span>
            {employee.isDefault && (
              <Badge variant="purple" className="text-[9px]">기본</Badge>
            )}
          </div>
          <p className="text-xs text-txt-secondary mt-0.5 truncate">{employee.role}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* LLM 모델 선택 */}
          <select
            value={overrides.model || 'claude-sonnet-4-6'}
            onChange={(e) => store.setEmployeeModel(employee.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-tertiary border border-border-subtle rounded-md px-2 py-1 text-[10px] text-txt-secondary focus:outline-none focus:border-brand-purple/50 cursor-pointer appearance-none pr-5 max-w-[120px]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B6B6B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center' }}
          >
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          {fileCount > 0 && (
            <span className="text-[10px] text-txt-muted flex items-center gap-0.5">
              <FileText size={10} /> {fileCount}
            </span>
          )}
          <span className="p-1.5 text-txt-muted">
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
          {!employee.isDefault && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(employee.id); }}
              className={`relative w-9 h-[18px] rounded-full transition-colors ${
                isActive ? 'bg-brand-purple' : 'bg-bg-primary border border-border-default'
              }`}
            >
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
                isActive ? 'left-[18px]' : 'left-[2px]'
              }`} />
            </button>
          )}
        </div>
      </div>

      {/* 확장 패널 */}
      {isExpanded && (
        <ExpandedEmployeePanel employee={employee} />
      )}
    </div>
  );
}

// ── 확장된 AI 직원 상세 패널 ──
function ExpandedEmployeePanel({ employee }) {
  const store = useAiTeamStore();
  const overrides = store.employeeOverrides[employee.id] || {};
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 500 * 1024) {
        alert(`${file.name}: 파일 크기가 500KB를 초과합니다.`);
        continue;
      }
      const content = await file.text();
      store.addKnowledgeFile(employee.id, {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        content,
        addedAt: new Date().toISOString(),
      });
    }
    e.target.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + 'B';
    return (bytes / 1024).toFixed(1) + 'KB';
  };

  return (
    <div className="px-4 pb-4 space-y-3 border-t border-border-divider pt-3">
      {/* 영감 & 설명 */}
      <div>
        <p className="text-xs text-txt-muted mb-1">{employee.inspiration}</p>
        <p className="text-xs text-txt-secondary leading-relaxed">{employee.description}</p>
      </div>

      {/* 트리거 키워드 */}
      <div>
        <p className="text-[11px] text-txt-muted mb-1.5 font-medium">호출 트리거 키워드</p>
        <div className="flex flex-wrap gap-1">
          {employee.triggerKeywords.map((kw) => (
            <span key={kw} className="px-2 py-0.5 rounded-full bg-bg-primary border border-border-subtle text-[10px] text-txt-secondary">
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* 기본 MD 파일 목록 */}
      <div>
        <p className="text-[11px] text-txt-muted mb-1.5 font-medium">기본 참조 문서</p>
        <div className="flex flex-wrap gap-1">
          {employee.defaultMdFiles.map((f) => (
            <span key={f} className="px-2 py-0.5 rounded bg-bg-primary border border-border-subtle text-[10px] text-txt-muted flex items-center gap-1">
              <FileText size={9} /> {f}
            </span>
          ))}
        </div>
      </div>

      {/* 업로드된 커스텀 지식 파일 */}
      <div>
        <p className="text-[11px] text-txt-muted mb-1.5 font-medium">업로드된 지식 문서</p>
        {(overrides.knowledgeFiles || []).length > 0 && (
          <div className="space-y-1.5 mb-2">
            {overrides.knowledgeFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-2 p-2 bg-bg-primary rounded-md border border-border-subtle">
                <FileText size={13} className="text-brand-purple shrink-0" />
                <span className="text-xs text-txt-primary flex-1 truncate">{f.name}</span>
                <span className="text-[10px] text-txt-muted">{formatFileSize(f.size)}</span>
                <button onClick={() => store.removeKnowledgeFile(employee.id, f.id)} className="p-0.5 text-txt-muted hover:text-status-error">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-border-subtle rounded-md p-3 text-center hover:border-brand-purple/40 hover:bg-brand-purple/[0.03] transition-all"
        >
          <Upload size={14} className="mx-auto mb-1 text-txt-muted" />
          <p className="text-[11px] text-txt-secondary">MD/TXT 파일 업로드 (최대 500KB)</p>
        </button>
        <input ref={fileInputRef} type="file" accept=".md,.txt,.markdown" multiple className="hidden" onChange={handleFileUpload} />
      </div>

      {/* 커스텀 지시사항 */}
      <div>
        <p className="text-[11px] text-txt-muted mb-1.5 font-medium">추가 지시사항</p>
        <textarea
          value={overrides.customInstructions || ''}
          onChange={(e) => store.setCustomInstructions(employee.id, e.target.value)}
          placeholder={`${employee.nameKo}에게 추가로 전달할 지시사항...`}
          rows={2}
          className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-2 text-xs text-txt-primary placeholder-txt-muted focus:border-brand-purple/50 focus:outline-none transition-colors resize-none"
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { isAdmin, user } = useAuthStore();

  // ── 팀 & 연동 상태 ──
  const [teamId, setTeamId] = useState(null);
  const [slackChannel, setSlackChannel] = useState('');
  const [notionApiKey, setNotionApiKey] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalSync, setGcalSync] = useState({
    autoCreate: true,
    autoUpdate: true,
    reminderBefore: true,
    syncAttendees: true,
  });
  const [notif, setNotif] = useState({
    meetingStart: true,
    meetingEnd: true,
    taskAssigned: true,
    miloSummary: false,
  });

  // ── 연결 상태 ──
  const [slackStatus, setSlackStatus] = useState('loading'); // loading | connected | disconnected
  const [notionStatus, setNotionStatus] = useState('loading');
  const [gcalStatus, setGcalStatus] = useState('loading');
  const [saving, setSaving] = useState({ slack: false, notion: false, gcal: false });
  const [saveResult, setSaveResult] = useState({ slack: null, notion: null, gcal: null });

  const [expandedEmployee, setExpandedEmployee] = useState(null);

  const { theme, setTheme } = useThemeStore();
  const { pageTitle } = useOutletContext() || {};

  // AI Team Store
  const aiTeam = useAiTeamStore();

  // ── 팀 데이터 로드 ──
  useEffect(() => {
    async function loadTeamSettings() {
      if (!SUPABASE_ENABLED || !user?.id) {
        // 데모 모드: localStorage 에서 복원
        const saved = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}');
        setSlackChannel(saved.slackChannel || '');
        setNotionApiKey(saved.notionApiKey || '');
        setNotionDbId(saved.notionDbId || '');
        setGcalConnected(saved.gcalConnected || false);
        if (saved.gcalSync) setGcalSync(saved.gcalSync);
        if (saved.notif) setNotif(saved.notif);
        setSlackStatus(saved.slackChannel ? 'connected' : 'disconnected');
        setNotionStatus(saved.notionDbId ? 'connected' : 'disconnected');
        setGcalStatus(saved.gcalConnected ? 'connected' : 'disconnected');
        return;
      }

      try {
        // 유저가 속한 팀 찾기
        const { data: membership } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .limit(1)
          .single();

        if (!membership) {
          setSlackStatus('disconnected');
          setNotionStatus('disconnected');
          setGcalStatus('disconnected');
          return;
        }

        setTeamId(membership.team_id);

        // 팀 정보 조회
        const { data: team } = await supabase
          .from('teams')
          .select('slack_channel_id, notion_database_id')
          .eq('id', membership.team_id)
          .single();

        if (team) {
          setSlackChannel(team.slack_channel_id || '');
          setNotionDbId(team.notion_database_id || '');
          setSlackStatus(team.slack_channel_id ? 'connected' : 'disconnected');
          setNotionStatus(team.notion_database_id ? 'connected' : 'disconnected');
        } else {
          setSlackStatus('disconnected');
          setNotionStatus('disconnected');
        }
      } catch (err) {
        console.error('[SettingsPage] 팀 설정 로드 실패:', err);
        setSlackStatus('disconnected');
        setNotionStatus('disconnected');
      }
      setGcalStatus('disconnected'); // Google Calendar은 별도 OAuth 필요
    }

    loadTeamSettings();
  }, [user?.id]);

  // ── Slack 저장 핸들러 ──
  const handleSlackSave = useCallback(async () => {
    setSaving((s) => ({ ...s, slack: true }));
    setSaveResult((s) => ({ ...s, slack: null }));
    try {
      if (SUPABASE_ENABLED && teamId) {
        const { error } = await supabase
          .from('teams')
          .update({ slack_channel_id: slackChannel || null })
          .eq('id', teamId);
        if (error) throw error;
      }
      // localStorage 백업
      const saved = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}');
      localStorage.setItem('meetflow_integrations', JSON.stringify({ ...saved, slackChannel, notif }));

      setSlackStatus(slackChannel ? 'connected' : 'disconnected');
      setSaveResult((s) => ({ ...s, slack: 'success' }));
    } catch (err) {
      console.error('[Slack 저장]', err);
      setSaveResult((s) => ({ ...s, slack: 'error' }));
    } finally {
      setSaving((s) => ({ ...s, slack: false }));
      setTimeout(() => setSaveResult((s) => ({ ...s, slack: null })), 2500);
    }
  }, [slackChannel, notif, teamId]);

  // ── Notion 저장 핸들러 ──
  const handleNotionSave = useCallback(async () => {
    setSaving((s) => ({ ...s, notion: true }));
    setSaveResult((s) => ({ ...s, notion: null }));
    try {
      if (SUPABASE_ENABLED && teamId) {
        const { error } = await supabase
          .from('teams')
          .update({ notion_database_id: notionDbId || null })
          .eq('id', teamId);
        if (error) throw error;
      }
      const saved = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}');
      localStorage.setItem('meetflow_integrations', JSON.stringify({ ...saved, notionApiKey, notionDbId }));

      setNotionStatus(notionDbId ? 'connected' : 'disconnected');
      setSaveResult((s) => ({ ...s, notion: 'success' }));
    } catch (err) {
      console.error('[Notion 저장]', err);
      setSaveResult((s) => ({ ...s, notion: 'error' }));
    } finally {
      setSaving((s) => ({ ...s, notion: false }));
      setTimeout(() => setSaveResult((s) => ({ ...s, notion: null })), 2500);
    }
  }, [notionApiKey, notionDbId, teamId]);

  // ── Google Calendar 저장 핸들러 ──
  const handleGcalSave = useCallback(async () => {
    setSaving((s) => ({ ...s, gcal: true }));
    setSaveResult((s) => ({ ...s, gcal: null }));
    try {
      const saved = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}');
      localStorage.setItem('meetflow_integrations', JSON.stringify({ ...saved, gcalConnected, gcalSync }));
      setSaveResult((s) => ({ ...s, gcal: 'success' }));
    } catch (err) {
      console.error('[GCal 저장]', err);
      setSaveResult((s) => ({ ...s, gcal: 'error' }));
    } finally {
      setSaving((s) => ({ ...s, gcal: false }));
      setTimeout(() => setSaveResult((s) => ({ ...s, gcal: null })), 2500);
    }
  }, [gcalConnected, gcalSync]);

  // ── 연결 상태 Badge 렌더 헬퍼 ──
  const renderStatusBadge = (status) => {
    if (status === 'loading') return <Badge variant="outline"><Loader2 size={10} className="animate-spin mr-1" />확인 중</Badge>;
    if (status === 'connected') return <Badge variant="success">연결됨</Badge>;
    return <Badge variant="outline">미연결</Badge>;
  };

  // ── 저장 버튼 렌더 헬퍼 ──
  const renderSaveButton = (key, onClick) => {
    const isSaving = saving[key];
    const result = saveResult[key];
    if (result === 'success') {
      return <Button variant="primary" size="sm" icon={Check} disabled>저장됨</Button>;
    }
    if (result === 'error') {
      return <Button variant="danger" size="sm" disabled>실패</Button>;
    }
    return (
      <Button variant="primary" size="sm" icon={isSaving ? Loader2 : Check} onClick={onClick} disabled={isSaving}>
        {isSaving ? '저장 중...' : '저장'}
      </Button>
    );
  };

  return (
    <div className="p-3 md:p-4 lg:p-4 max-w-[1400px] bg-[var(--bg-content)] rounded-[12px] m-2 md:m-3 lg:m-4 lg:mr-3 lg:mb-0 flex flex-col lg:h-[calc(100%-32px)] lg:overflow-hidden">
      {/* 헤더 */}
      <div className="mb-4 md:mb-6 shrink-0">
        {pageTitle && (
          <h2 className="text-2xl font-semibold text-txt-muted uppercase tracking-wider mb-1">{pageTitle}</h2>
        )}
        <p className="text-sm text-txt-secondary">AI 팀원 설정, 테마, 외부 서비스 연동을 관리합니다</p>
      </div>

      {/* 3컬럼 그리드 — 모바일은 1컬럼, 데스크톱은 내부 스크롤 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_280px] gap-4 items-start flex-1 min-h-0 lg:overflow-hidden">

      {/* ═══ 컬럼 1: AI 팀원 관리 ═══ */}
      <div className="lg:overflow-y-auto lg:max-h-full scrollbar-hide">
      <SectionPanel>
        {/* 패널 헤더 */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-glow bg-gradient-to-br from-[#FF902F] via-[#723CEB] to-[#4C11CE]">
            <Users size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-txt-primary">AI 팀원 관리</h2>
            <p className="text-xs text-txt-secondary">킨더보드 x MeetFlow 전문 AI 직원 7명의 설정을 관리합니다</p>
          </div>
        </div>

        {/* 팀 구성 요약 */}
        <div className="flex items-center gap-1.5 mb-5 px-1">
          {AI_EMPLOYEES.map((emp) => {
            const isActive = aiTeam.activeEmployees.includes(emp.id);
            return (
              <AiAvatar
                key={emp.id}
                employee={emp}
                size="sm"
              />
            );
          })}
          <span className="text-xs text-txt-muted ml-2">
            {aiTeam.activeEmployees.length}명 활성
          </span>
        </div>

        {/* 자동 라우팅 토글 */}
        <div className="bg-bg-tertiary rounded-[7px] p-4 mb-4">
          <Toggle
            label="자동 키워드 라우팅"
            description="대화 내용의 키워드를 분석해 적절한 AI 전문가를 자동으로 호출합니다"
            checked={aiTeam.autoRouting}
            onChange={aiTeam.setAutoRouting}
          />
        </div>

        {/* 기본 회의 프리셋 */}
        <div className="bg-bg-tertiary rounded-[7px] p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings size={14} className="text-brand-purple" />
            <h3 className="text-sm font-semibold text-txt-primary">기본 회의 프리셋</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(MEETING_PRESETS).map(([key, preset]) => {
              const active = aiTeam.defaultPreset === key;
              const specialists = preset.specialists.map(
                (id) => AI_EMPLOYEES.find((e) => e.id === id)
              ).filter(Boolean);
              return (
                <button
                  key={key}
                  onClick={() => aiTeam.setDefaultPreset(key)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    active
                      ? 'border-brand-purple bg-brand-purple/[0.08]'
                      : 'border-border-subtle hover:border-border-hover-strong'
                  }`}
                >
                  <p className="text-xs font-medium text-txt-primary mb-1.5">{preset.label}</p>
                  <div className="flex gap-0.5">
                    {specialists.map((s) => (
                      <div
                        key={s.id}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                        style={{ backgroundColor: s.color }}
                        title={s.nameKo}
                      >
                        {s.initials}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI 직원 리스트 */}
        <div className="space-y-2">
          {AI_EMPLOYEES.map((emp) => (
            <AiEmployeeCard
              key={emp.id}
              employee={emp}
              isActive={aiTeam.activeEmployees.includes(emp.id)}
              onToggle={aiTeam.toggleEmployee}
              onExpand={setExpandedEmployee}
              isExpanded={expandedEmployee === emp.id}
            />
          ))}
        </div>

        {/* 리셋 */}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => {
              if (confirm('모든 AI 팀 설정을 초기값으로 되돌리시겠습니까?')) {
                aiTeam.resetToDefaults();
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-txt-secondary hover:text-status-error transition-colors"
          >
            <RotateCcw size={14} />
            초기값으로 리셋
          </button>
        </div>
      </SectionPanel>

      </div>
      {/* column 1 scroll wrapper end */}

      {/* ═══ 컬럼 2: 외부 서비스 연동 ═══ */}
      <div className="lg:overflow-y-auto lg:max-h-full scrollbar-hide">
      <SectionPanel title="외부 서비스 연동">
        {/* Slack */}
        <div className="bg-bg-tertiary rounded-[7px] p-4 mb-3">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Slack size={14} className="text-brand-purple" />
              <div>
                <h3 className="text-xs font-semibold text-txt-primary">Slack</h3>
                <p className="text-[10px] text-txt-secondary">양방향 동기화</p>
              </div>
            </div>
            {renderStatusBadge(slackStatus)}
          </div>

          {slackStatus === 'connected' && slackChannel && (
            <div className="flex items-center gap-2 bg-status-success/10 text-status-success rounded-md px-3 py-2 mb-3">
              <Check size={12} />
              <span className="text-[11px] font-medium">채널 {slackChannel} 연결됨</span>
            </div>
          )}

          <Input
            label="Slack 채널 ID"
            placeholder="C0123456789"
            helperText="채널 세부정보에서 확인"
            value={slackChannel}
            onChange={(e) => setSlackChannel(e.target.value)}
          />

          <div className="mt-3 pt-3 border-t border-border-divider">
            <p className="text-[10px] font-medium text-txt-muted uppercase tracking-wider mb-1.5">알림</p>
            <div className="space-y-0.5 divide-y divide-border-divider-faint">
              <Toggle label="회의 시작 알림" checked={notif.meetingStart} onChange={(v) => setNotif({ ...notif, meetingStart: v })} />
              <Toggle label="회의 종료 + 요약" checked={notif.meetingEnd} onChange={(v) => setNotif({ ...notif, meetingEnd: v })} />
              <Toggle label="태스크 배정 DM" checked={notif.taskAssigned} onChange={(v) => setNotif({ ...notif, taskAssigned: v })} />
              <Toggle label="AI 실시간 요약" checked={notif.miloSummary} onChange={(v) => setNotif({ ...notif, miloSummary: v })} />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            {renderSaveButton('slack', handleSlackSave)}
          </div>
        </div>

        {/* Notion */}
        <div className="bg-bg-tertiary rounded-[7px] p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-brand-orange" />
              <div>
                <h3 className="text-xs font-semibold text-txt-primary">Notion</h3>
                <p className="text-[10px] text-txt-secondary">회의록 자동 아카이브</p>
              </div>
            </div>
            {renderStatusBadge(notionStatus)}
          </div>

          {notionStatus === 'connected' && notionDbId && (
            <div className="flex items-center gap-2 bg-status-success/10 text-status-success rounded-md px-3 py-2 mb-3">
              <Check size={12} />
              <span className="text-[11px] font-medium">DB {notionDbId.slice(0, 8)}... 연결됨</span>
            </div>
          )}

          <div className="space-y-2">
            <Input label="API Key" type="password" placeholder="secret_..." value={notionApiKey} onChange={(e) => setNotionApiKey(e.target.value)} />
            <Input label="Database ID" placeholder="abc123..." value={notionDbId} onChange={(e) => setNotionDbId(e.target.value)} />
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm">테스트</Button>
            {renderSaveButton('notion', handleNotionSave)}
          </div>
        </div>

        {/* Google Calendar */}
        <div className="bg-bg-tertiary rounded-[7px] p-4 mt-3">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className="text-status-success" />
              <div>
                <h3 className="text-xs font-semibold text-txt-primary">Google Calendar</h3>
                <p className="text-[10px] text-txt-secondary">회의 일정 자동 동기화</p>
              </div>
            </div>
            {renderStatusBadge(gcalStatus)}
          </div>

          {gcalStatus !== 'connected' ? (
            <div className="space-y-3">
              <p className="text-[11px] text-txt-muted leading-relaxed">
                Google 계정을 연결하면 회의 요청 시 캘린더에 자동으로 일정이 생성됩니다.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={ExternalLink}
                className="w-full"
                onClick={() => {
                  setGcalConnected(true);
                  setGcalStatus('connected');
                  const saved = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}');
                  localStorage.setItem('meetflow_integrations', JSON.stringify({ ...saved, gcalConnected: true }));
                }}
              >
                Google 계정 연결
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-status-success/10 text-status-success rounded-md px-3 py-2 mb-3">
                <Check size={12} />
                <span className="text-[11px] font-medium">{user?.email || 'Google 계정'} 연결됨</span>
              </div>

              <div className="pt-2 border-t border-border-divider">
                <p className="text-[10px] font-medium text-txt-muted uppercase tracking-wider mb-1.5">동기화 설정</p>
                <div className="space-y-0.5 divide-y divide-border-divider-faint">
                  <Toggle
                    label="회의 요청 시 자동 생성"
                    description="회의를 요청하면 캘린더에 일정 추가"
                    checked={gcalSync.autoCreate}
                    onChange={(v) => setGcalSync({ ...gcalSync, autoCreate: v })}
                  />
                  <Toggle
                    label="일정 변경 자동 반영"
                    description="시간/참석자 변경 시 캘린더 업데이트"
                    checked={gcalSync.autoUpdate}
                    onChange={(v) => setGcalSync({ ...gcalSync, autoUpdate: v })}
                  />
                  <Toggle
                    label="10분 전 리마인더"
                    description="회의 시작 10분 전 알림"
                    checked={gcalSync.reminderBefore}
                    onChange={(v) => setGcalSync({ ...gcalSync, reminderBefore: v })}
                  />
                  <Toggle
                    label="참석자 자동 초대"
                    description="참석자에게 캘린더 초대 발송"
                    checked={gcalSync.syncAttendees}
                    onChange={(v) => setGcalSync({ ...gcalSync, syncAttendees: v })}
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-between items-center">
                <button
                  onClick={() => {
                    setGcalConnected(false);
                    setGcalStatus('disconnected');
                    const saved = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}');
                    localStorage.setItem('meetflow_integrations', JSON.stringify({ ...saved, gcalConnected: false }));
                  }}
                  className="text-[11px] text-status-error hover:underline"
                >
                  연결 해제
                </button>
                {renderSaveButton('gcal', handleGcalSave)}
              </div>
            </>
          )}
        </div>
      </SectionPanel>

      </div>
      {/* column 2 scroll wrapper end */}

      {/* ═══ 컬럼 3: 모양 ═══ */}
      <div className="lg:overflow-y-auto lg:max-h-full scrollbar-hide">
      <SectionPanel title="모양">
        <div className="bg-bg-tertiary rounded-[7px] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={14} className="text-brand-purple" />
            <h3 className="text-xs font-semibold text-txt-primary">테마</h3>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => setTheme('dark')}
              className={`w-full p-3 rounded-md border text-left transition-all flex items-center gap-3 ${
                theme === 'dark'
                  ? 'border-brand-purple bg-brand-purple/[0.08]'
                  : 'border-border-subtle hover:border-border-hover-strong'
              }`}
            >
              <div className="w-8 h-8 rounded-md bg-[#131313] border border-border-subtle flex items-center justify-center shrink-0">
                <Moon size={14} className="text-brand-purple" />
              </div>
              <div>
                <p className="text-xs font-medium text-txt-primary">다크 모드</p>
                <p className="text-[10px] text-txt-secondary">어두운 배경</p>
              </div>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`w-full p-3 rounded-md border text-left transition-all flex items-center gap-3 ${
                theme === 'light'
                  ? 'border-brand-purple bg-brand-purple/[0.08]'
                  : 'border-border-subtle hover:border-border-hover-strong'
              }`}
            >
              <div className="w-8 h-8 rounded-md bg-[#EDE8E0] border border-border-subtle flex items-center justify-center shrink-0">
                <Sun size={14} className="text-brand-orange" />
              </div>
              <div>
                <p className="text-xs font-medium text-txt-primary">라이트 모드</p>
                <p className="text-[10px] text-txt-secondary">밝은 배경</p>
              </div>
            </button>
          </div>
        </div>
      </SectionPanel>

      {/* ── 관리자 설정 (admin만 표시) ── */}
      {isAdmin() && (
        <SectionPanel title="관리자 설정" icon={Shield}>
          <AdminUserManagement />
        </SectionPanel>
      )}

      </div>
      {/* column 3 scroll wrapper end */}
      </div>
      {/* grid end */}
    </div>
  );
}
