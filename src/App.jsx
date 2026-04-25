import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useMeetingStore } from '@/stores/meetingStore';
import { useTaskStore } from '@/stores/taskStore';
import { useAiTeamStore } from '@/stores/aiTeamStore';

import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import MeetingsPage from '@/pages/MeetingsPage';
import MeetingRoomPage from '@/pages/MeetingRoomPage';
// /tasks 페이지는 멤버·태스크 페이지(/members)로 통합됨 — 라우트는 redirect로 보존
import SummariesPage from '@/pages/SummariesPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import EmployeeDetailPage from '@/pages/EmployeeDetailPage';
import TokenUsagePage from '@/pages/TokenUsagePage';
import MembersPage from '@/pages/MembersPage';

function RouteGuard({ children, requireAdmin = false }) {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="loader-symbol w-12 h-12 rounded-xl bg-gradient-brand shadow-glow flex items-center justify-center">
          <Sparkles size={22} className="text-white" strokeWidth={2.5} />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);
  const initMeetings = useMeetingStore((s) => s.init);
  const initTasks = useTaskStore((s) => s.init);
  const loadKnowledgeFiles = useAiTeamStore((s) => s.loadKnowledgeFiles);
  const loadAiOverridesFromDB = useAiTeamStore((s) => s.loadFromDB);
  const cleanupMeetings = useMeetingStore((s) => s.cleanup);
  const cleanupTasks = useTaskStore((s) => s.cleanup);

  useEffect(() => {
    init();
    initTheme();
  }, [init, initTheme]);

  // auth 로딩 완료 후에 meetings/tasks 초기화 (user 상태를 반영)
  const loading = useAuthStore((s) => s.loading);
  useEffect(() => {
    if (!loading) {
      initMeetings();
      initTasks();
      loadKnowledgeFiles();
      loadAiOverridesFromDB();
    }
    return () => {
      cleanupMeetings();
      cleanupTasks();
    };
  }, [loading, initMeetings, initTasks, loadKnowledgeFiles, cleanupMeetings, cleanupTasks]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RouteGuard>
            <Layout />
          </RouteGuard>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:id" element={<MeetingRoomPage />} />
        {/* /tasks 는 /members 로 통합 — 기존 북마크 보존을 위해 redirect 유지 */}
        <Route path="/tasks" element={<Navigate to="/members" replace />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/summaries" element={<SummariesPage />} />
        <Route path="/summaries/:id" element={<SummariesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<RouteGuard requireAdmin><AdminDashboardPage /></RouteGuard>} />
        <Route path="/admin/employee/:id" element={<RouteGuard requireAdmin><EmployeeDetailPage /></RouteGuard>} />
        <Route path="/admin/tokens" element={<RouteGuard requireAdmin><TokenUsagePage /></RouteGuard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
