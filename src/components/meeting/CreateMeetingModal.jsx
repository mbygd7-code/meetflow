import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Clock } from 'lucide-react';
import { Modal, Input, Button } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';

export default function CreateMeetingModal({ open, onClose }) {
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState('team-1');
  const [agendas, setAgendas] = useState([
    { title: '', duration_minutes: 10 },
  ]);
  const [busy, setBusy] = useState(false);
  const { createMeeting, startMeeting } = useMeeting();
  const navigate = useNavigate();

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
    setBusy(true);
    try {
      const cleaned = agendas.filter((a) => a.title.trim());
      const meeting = await createMeeting({
        title: title.trim(),
        team_id: teamId,
        agendas: cleaned,
      });
      if (startNow) {
        await startMeeting(meeting.id);
        navigate(`/meetings/${meeting.id}`);
      }
      onClose();
      // reset
      setTitle('');
      setAgendas([{ title: '', duration_minutes: 10 }]);
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
            disabled={!title.trim()}
          >
            회의 시작
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          label="회의 제목"
          placeholder="예: 주간 스탠드업"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
            팀
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-4 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand-purple/50 focus:ring-[3px] focus:ring-brand-purple/15 transition-colors"
          >
            <option value="team-1">프로덕트 팀</option>
            <option value="team-2">디자인 팀</option>
            <option value="team-3">엔지니어링 팀</option>
          </select>
        </div>

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
      </div>
    </Modal>
  );
}
