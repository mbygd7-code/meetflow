import { useState } from 'react';
import { Slack, FileText, Bell, Check } from 'lucide-react';
import { Card, Input, Button, Badge } from '@/components/ui';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between py-2.5 cursor-pointer">
      <span className="text-sm text-white">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-brand-purple' : 'bg-bg-tertiary border border-white/[0.12]'
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-[22px] font-medium text-white mb-1">설정</h1>
      <p className="text-sm text-txt-secondary mb-6">
        외부 서비스 연동 및 알림 설정
      </p>

      {/* Slack 연동 */}
      <Card className="mb-5">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-bg-tertiary border border-white/[0.08] flex items-center justify-center">
              <Slack size={18} className="text-brand-purple" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Slack 연동</h3>
              <p className="text-xs text-txt-secondary">
                팀 Slack 채널과 MeetFlow를 양방향 동기화하세요
              </p>
            </div>
          </div>
          <Badge variant="outline">미연결</Badge>
        </div>

        <Input
          label="Slack 채널 ID"
          placeholder="C0123456789"
          helperText="채널 우클릭 → 채널 세부정보에서 확인할 수 있습니다"
          value={slackChannel}
          onChange={(e) => setSlackChannel(e.target.value)}
        />

        <div className="mt-5 pt-5 border-t border-white/[0.06]">
          <p className="text-xs font-medium text-txt-secondary uppercase tracking-wider mb-3">
            알림 설정
          </p>
          <div className="space-y-0.5 divide-y divide-white/[0.04]">
            <Toggle
              label="회의 시작 알림"
              checked={notif.meetingStart}
              onChange={(v) => setNotif({ ...notif, meetingStart: v })}
            />
            <Toggle
              label="회의 종료 + 요약"
              checked={notif.meetingEnd}
              onChange={(v) => setNotif({ ...notif, meetingEnd: v })}
            />
            <Toggle
              label="태스크 배정 DM"
              checked={notif.taskAssigned}
              onChange={(v) => setNotif({ ...notif, taskAssigned: v })}
            />
            <Toggle
              label="Milo 실시간 요약"
              checked={notif.miloSummary}
              onChange={(v) => setNotif({ ...notif, miloSummary: v })}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" icon={Check}>
            저장
          </Button>
        </div>
      </Card>

      {/* Notion 연동 */}
      <Card className="mb-5">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-bg-tertiary border border-white/[0.08] flex items-center justify-center">
              <FileText size={18} className="text-brand-orange" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Notion 연동</h3>
              <p className="text-xs text-txt-secondary">
                회의록과 태스크를 Notion에 자동 아카이브하세요
              </p>
            </div>
          </div>
          <Badge variant="outline">미연결</Badge>
        </div>

        <div className="space-y-4">
          <Input
            label="Notion API Key"
            type="password"
            placeholder="secret_..."
            value={notionApiKey}
            onChange={(e) => setNotionApiKey(e.target.value)}
          />
          <Input
            label="회의록 Database ID"
            placeholder="abc123..."
            value={notionDbId}
            onChange={(e) => setNotionDbId(e.target.value)}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary">연결 테스트</Button>
          <Button variant="primary" icon={Check}>
            저장
          </Button>
        </div>
      </Card>

      {/* Milo 프리셋 */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-md bg-gradient-brand shadow-glow flex items-center justify-center">
            <Bell size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Milo 프리셋</h3>
            <p className="text-xs text-txt-secondary">
              팀 성향에 맞게 Milo의 개입 스타일을 선택하세요
            </p>
          </div>
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
              className={`p-4 rounded-md border text-left transition-all ${
                i === 0
                  ? 'border-brand-purple bg-brand-purple/[0.08]'
                  : 'border-white/[0.08] hover:border-white/[0.16]'
              }`}
            >
              <p className="text-sm font-medium text-white mb-1">{p.label}</p>
              <p className="text-xs text-txt-secondary">{p.desc}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
