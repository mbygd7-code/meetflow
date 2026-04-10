import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout() {
  const { pathname } = useLocation();
  // 회의 진행 화면은 전용 헤더를 쓰므로 TopBar 숨김
  const hideTopBar = /^\/meetings\/[^/]+$/.test(pathname);

  return (
    <div className="flex h-screen bg-bg-primary text-txt-primary">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {!hideTopBar && <TopBar />}
        <div className="flex-1 overflow-y-auto content-gradient-bg">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
