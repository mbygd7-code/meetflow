import { useOutletContext } from 'react-router-dom';
import TaskDashboard from '@/components/task/TaskDashboard';

export default function TasksPage() {
  const { pageTitle } = useOutletContext() || {};
  return <TaskDashboard pageTitle={pageTitle} />;
}
