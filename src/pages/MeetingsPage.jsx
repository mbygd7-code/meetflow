import { useOutletContext } from 'react-router-dom';
import MeetingLobby from '@/components/meeting/MeetingLobby';

export default function MeetingsPage() {
  const { pageTitle } = useOutletContext() || {};
  return <MeetingLobby pageTitle={pageTitle} />;
}
