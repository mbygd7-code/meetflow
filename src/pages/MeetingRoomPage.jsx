import { useParams, useNavigate } from 'react-router-dom';
import MeetingRoom from '@/components/meeting/MeetingRoom';
import CompletedMeetingView from '@/components/meeting/CompletedMeetingView';
import { useMeeting } from '@/hooks/useMeeting';

export default function MeetingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getById } = useMeeting();
  const meeting = getById(id);

  // 회의를 찾을 수 없는 경우 — MeetingRoom의 기존 fallback을 활용하기 위해 active 경로로 위임
  if (!meeting) return <MeetingRoom />;

  // 완료된 회의: 읽기 전용 뷰 (입력창/종료버튼/AI자동개입 없음)
  if (meeting.status === 'completed') {
    return <CompletedMeetingView meeting={meeting} />;
  }

  // 진행 중/예정 회의: 기존 회의실
  return <MeetingRoom />;
}
