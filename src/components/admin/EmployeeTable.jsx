import { useNavigate } from 'react-router-dom';
import { Avatar, Badge } from '@/components/ui';

function getStatusBadge(rate) {
  if (rate >= 80) return <Badge variant="success">우수</Badge>;
  if (rate >= 50) return <Badge variant="warning">보통</Badge>;
  return <Badge variant="danger">관심 필요</Badge>;
}

export default function EmployeeTable({ employees = [] }) {
  const navigate = useNavigate();

  if (employees.length === 0) {
    return <p className="py-8 text-center text-txt-muted text-sm">직원 데이터가 없습니다</p>;
  }

  return (
    <div className="space-y-1.5">
      {/* 헤더 */}
      <div className="grid grid-cols-[1fr_72px_72px_48px_56px_72px] gap-2 px-3 pb-1 text-[11px] text-txt-muted uppercase tracking-wider">
        <span>직원</span>
        <span className="text-center">참여 회의</span>
        <span className="text-center">배정 태스크</span>
        <span className="text-center">완료</span>
        <span className="text-center">완수율</span>
        <span className="text-center">상태</span>
      </div>

      {/* 직원 행 */}
      {employees.map((emp) => (
        <div
          key={emp.user_id}
          className="grid grid-cols-[1fr_72px_72px_48px_56px_72px] gap-2 items-center px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer"
          title="직원 상세 보기"
          onClick={() => navigate(`/admin/employee/${emp.user_id}`)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--sidebar-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '';
          }}
        >
          <div className="flex items-center gap-2.5">
            <Avatar
              name={emp.user_name || 'U'}
              color={emp.avatar_color}
              size="sm"
            />
            <p className="text-sm font-medium text-txt-primary">{emp.user_name}</p>
          </div>
          <p className="text-center text-sm text-txt-secondary">{emp.meeting_count}</p>
          <p className="text-center text-sm text-txt-secondary">{emp.total_tasks}</p>
          <p className="text-center text-sm text-txt-secondary">{emp.done_tasks}</p>
          <p className="text-center">
            <span className={`text-sm font-semibold ${
              emp.completion_rate >= 80 ? 'text-status-success' :
              emp.completion_rate >= 50 ? 'text-status-warning' :
              'text-status-error'
            }`}>
              {emp.completion_rate}%
            </span>
          </p>
          <div className="text-center">{getStatusBadge(emp.completion_rate)}</div>
        </div>
      ))}
    </div>
  );
}
