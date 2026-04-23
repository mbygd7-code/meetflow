import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import MeetingRoom from '@/components/meeting/MeetingRoom';
import CompletedMeetingView from '@/components/meeting/CompletedMeetingView';
import { useMeeting } from '@/hooks/useMeeting';

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getById } = useMeeting();
  const meeting = getById(id);
  // 태스크 컨텍스트에서 "히스토리" 링크로 진입 시 강제로 읽기전용 뷰
  const forceHistory = searchParams.get('history') === '1';

  // 회의를 찾을 수 없는 경우 — MeetingRoom의 기존 fallback을 활용하기 위해 active 경로로 위임
  if (!meeting) return <MeetingRoom />;

  // 완료된 회의 OR 강제 히스토리 뷰 요청 → 읽기 전용 뷰
  if (meeting.status === 'completed' || forceHistory) {
    return <CompletedMeetingView meeting={meeting} />;
  }

  // 진행 중/예정 회의: 기존 회의실
  return <MeetingRoom />;
}
