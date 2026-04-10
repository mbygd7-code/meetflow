import { useState } from 'react';
import { Slack, FileText, Bell, Check, Sun, Moon, Monitor } from 'lucide-react';
import { Card, Input, Button, Badge, SectionPanel } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between py-2.5 cursor-pointer">
      <span className="text-sm text-txt-primary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
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

export default function SettingsPage() {
  const [slackChannel, setSlackChannel] = useState('');
  const [notionApiKey, setNotionApiKey] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [notif, setNotif] = useState({
    meetingStart: true,
    meetingEnd: true,
    taskAssigned: true,
    miloSummary: false,
  });

  const { theme, setTheme } = useThemeStore();

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6 bg-[var(--bg-content)] rounded-[24px] m-4 lg:m-6">
      {/* 헤더 */}
      <div>
        <p className="text-sm text-txt-secondary">외부 서비스 연동 및 알림 설정</p>
      </div>

      {/* ═══ 패널 1: 테마 + Milo 프리셋 ═══ */}
      <SectionPanel title="모양 및 AI 설정">
        {/* 테마 선택 */}
        <div className="bg-bg-tertiary rounded-[14px] p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <Monitor size={16} className="text-brand-purple" />
            <h3 className="text-sm font-semibold text-txt-primary">테마</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-md border text-left transition-all flex items-center gap-3 ${
                theme === 'dark'
                  ? 'border-brand-purple bg-brand-purple/[0.08]'
                  : 'border-border-subtle hover:border-border-hover-strong'
              }`}
            >
              <div className="w-10 h-10 rounded-md bg-[#131313] border border-border-subtle flex items-center justify-center shrink-0">
                <Moon size={16} className="text-brand-purple" />
              </div>
              <div>
                <p className="text-sm font-medium text-txt-primary">다크 모드</p>
                <p className="text-xs text-txt-secondary">어두운 배경</p>
              </div>
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`p-4 rounded-md border text-left transition-all flex items-center gap-3 ${
                theme === 'light'
                  ? 'border-brand-purple bg-brand-purple/[0.08]'
                  : 'border-border-subtle hover:border-border-hover-strong'
              }`}
            >
              <div className="w-10 h-10 rounded-md bg-[#EDE8E0] border border-border-subtle flex items-center justify-center shrink-0">
                <Sun size={16} className="text-brand-orange" />
              </div>
              <div>
                <p className="text-sm font-medium text-txt-primary">라이트 모드</p>
                <p className="text-xs text-txt-secondary">밝은 배경</p>
              </div>
            </button>
          </div>
        </div>

        {/* Milo 프리셋 */}
        <div className="bg-bg-tertiary rounded-[14px] p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-7 h-7 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center">
              <Bell size={12} className="text-white" />
            </div>
            <h3 className="text-sm font-semibold text-txt-primary">Milo 프리셋</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'default', label: '조용한 비서', desc: '필요할 때만 한마디' },
              { id: 'coach', label: '퍼실리테이터', desc: '적극적으로 논의 주도' },
              { id: 'analyst', label: '데이터 분석가', desc: '수치와 근거 중심' },
              { id: 'recorder', label: '기록자', desc: '발언 없이 요약만' },
            ].map((p, i) => (
              <button
                key={p.id}
                className={`p-3 rounded-md border text-left transition-all ${
                  i === 0
                    ? 'border-brand-purple bg-brand-purple/[0.08]'
                    : 'border-border-subtle hover:border-border-hover-strong'
                }`}
              >
                <p className="text-sm font-medium text-txt-primary mb-0.5">{p.label}</p>
                <p className="text-xs text-txt-secondary">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </SectionPanel>

      {/* ═══ 패널 2: 연동 (Slack + Notion) ═══ */}
      <SectionPanel title="외부 서비스 연동">
        {/* Slack */}
        <div className="bg-bg-tertiary rounded-[14px] p-5 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Slack size={16} className="text-brand-purple" />
              <div>
                <h3 className="text-sm font-semibold text-txt-primary">Slack</h3>
                <p className="text-[11px] text-txt-secondary">양방향 동기화</p>
              </div>
            </div>
            <Badge variant="outline">미연결</Badge>
          </div>

          <Input
            label="Slack 채널 ID"
            placeholder="C0123456789"
            helperText="채널 우클릭 → 채널 세부정보에서 확인"
            value={slackChannel}
            onChange={(e) => setSlackChannel(e.target.value)}
          />

          <div className="mt-4 pt-4 border-t border-border-divider">
            <p className="text-[11px] font-medium text-txt-muted uppercase tracking-wider mb-2">알림</p>
            <div className="space-y-0.5 divide-y divide-border-divider-faint">
              <Toggle label="회의 시작 알림" checked={notif.meetingStart} onChange={(v) => setNotif({ ...notif, meetingStart: v })} />
              <Toggle label="회의 종료 + 요약" checked={notif.meetingEnd} onChange={(v) => setNotif({ ...notif, meetingEnd: v })} />
              <Toggle label="태스크 배정 DM" checked={notif.taskAssigned} onChange={(v) => setNotif({ ...notif, taskAssigned: v })} />
              <Toggle label="Milo 실시간 요약" checked={notif.miloSummary} onChange={(v) => setNotif({ ...notif, miloSummary: v })} />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="primary" size="sm" icon={Check}>저장</Button>
          </div>
        </div>

        {/* Notion */}
        <div className="bg-bg-tertiary rounded-[14px] p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-brand-orange" />
              <div>
                <h3 className="text-sm font-semibold text-txt-primary">Notion</h3>
                <p className="text-[11px] text-txt-secondary">회의록 자동 아카이브</p>
              </div>
            </div>
            <Badge variant="outline">미연결</Badge>
          </div>

          <div className="space-y-3">
            <Input label="Notion API Key" type="password" placeholder="secret_..." value={notionApiKey} onChange={(e) => setNotionApiKey(e.target.value)} />
            <Input label="Database ID" placeholder="abc123..." value={notionDbId} onChange={(e) => setNotionDbId(e.target.value)} />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm">테스트</Button>
            <Button variant="primary" size="sm" icon={Check}>저장</Button>
          </div>
        </div>
      </SectionPanel>
    </div>
  );
}
