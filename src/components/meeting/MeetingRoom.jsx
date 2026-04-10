import { useParams, useNavigate } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import { X, Square } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useMeeting } from '@/hooks/useMeeting';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useMilo } from '@/hooks/useMilo';
import ParticipantList from './ParticipantList';
import ChatArea from './ChatArea';
import AISummaryPanel from './AISummaryPanel';
import AgendaBar from './AgendaBar';

export default function MeetingRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getById, endMeeting } = useMeeting();
  const meeting = getById(id);
  const [activeAgendaId, setActiveAgendaId] = useState(null);
  const { messages, sendMessage } = useRealtimeMessages(id);

  const currentAgenda = useMemo(() => {
    const targetId = activeAgendaId
      ? activeAgendaId
      : meeting?.agendas?.find((a) => a.status === 'active')?.id ||
        meeting?.agendas?.[0]?.id;
    return meeting?.agendas?.find((a) => a.id === targetId);
  }, [activeAgendaId, meeting]);

  // Milo AI hook — 새 메시지가 들어올 때마다 개입 판단
  const handleMiloRespond = useCallback(
    async (result) => {
      await sendMessage(result.response_text, {
        agendaId: currentAgenda?.id,
        isAi: true,
        aiType: result.ai_type,
      });
    },
    [sendMessage, currentAgenda]
  );

  useMilo({
    messages,
    agenda: currentAgenda,
    preset: 'default',
    onRespond: handleMiloRespond,
  });

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center text-txt-secondary">
        <div className="text-center">
          <p className="text-sm mb-3">회의를 찾을 수 없습니다.</p>
          <button
            onClick={() => navigate('/meetings')}
            className="text-brand-purple hover:text-txt-primary text-xs"
          >
            회의 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const handleEnd = async () => {
    if (!confirm('회의를 종료하시겠습니까? 자동 요약이 생성됩니다.')) return;
    await endMeeting(id);
    navigate(`/summaries/${id}`);
  };

  const handleSend = async (content) => {
    await sendMessage(content, { agendaId: currentAgenda?.id });
  };

  // AI 요약 패널용 섹션 생성 (데모)
  const summarySections = useMemo(() => {
    const aiMessages = messages.filter((m) => m.is_ai);
    return [
      {
        key: 'decisions',
        title: '결정 사항',
        border: 'border-status-success',
        items: aiMessages
          .filter((m) => m.ai_type === 'summary')
          .map((m) => m.content.slice(0, 60) + (m.content.length > 60 ? '…' : '')),
      },
      {
        key: 'discussions',
        title: '논의 중',
        border: 'border-brand-yellow',
        items: aiMessages
          .filter((m) => m.ai_type === 'insight' || m.ai_type === 'data')
          .map((m) => m.content.slice(0, 60) + (m.content.length > 60 ? '…' : '')),
      },
      {
        key: 'deferred',
        title: '보류',
        border: 'border-txt-secondary',
        items: [],
      },
    ];
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* 회의 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-divider">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/meetings')}
            className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary rounded-md transition-colors"
          >
            <X size={16} />
          </button>
          <h1 className="text-[22px] font-medium text-txt-primary tracking-tight">
            {meeting.title}
          </h1>
          {meeting.status === 'active' && (
            <Badge variant="success">
              <span className="w-1.5 h-1.5 rounded-full bg-status-success pulse-dot mr-1" />
              진행 중
            </Badge>
          )}
        </div>

        <button
          onClick={handleEnd}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-status-error/10 border border-status-error/30 text-status-error text-sm font-medium hover:bg-status-error/20 transition-colors"
        >
          <Square size={14} strokeWidth={2.4} />
          회의 종료
        </button>
      </div>

      {/* 어젠다 바 */}
      <AgendaBar
        agendas={meeting.agendas || []}
        activeId={currentAgenda?.id}
        onSelect={setActiveAgendaId}
      />

      {/* 3컬럼 */}
      <div className="flex flex-1 overflow-hidden">
        <ParticipantList participants={meeting.participants || []} />
        <ChatArea
          messages={messages}
          onSend={handleSend}
          disabled={meeting.status === 'completed'}
        />
        <AISummaryPanel meetingId={id} sections={summarySections} />
      </div>
    </div>
  );
}
