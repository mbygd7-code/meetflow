import { Avatar, Badge } from '@/components/ui';

function getStatusBadge(rate) {
  if (rate >= 80) return <Badge variant="success">우수</Badge>;
  if (rate >= 50) return <Badge variant="warning">보통</Badge>;
  return <Badge variant="danger">관심 필요</Badge>;
}

export default function EmployeeTable({ employees = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-txt-muted uppercase tracking-wider">
            <th className="pb-3 pl-2">직원</th>
            <th className="pb-3 text-center">참여 회의</th>
            <th className="pb-3 text-center">배정 태스크</th>
            <th className="pb-3 text-center">완료</th>
            <th className="pb-3 text-center">완수율</th>
            <th className="pb-3 text-center">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {employees.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-txt-muted text-sm">
                직원 데이터가 없습니다
              </td>
            </tr>
          ) : (
            employees.map((emp) => (
              <tr key={emp.user_id} className="hover:bg-bg-tertiary/50 transition-colors">
                <td className="py-3 pl-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={emp.user_name || 'U'}
                      color={emp.avatar_color}
                      size="sm"
                    />
                    <div>
                      <p className="text-sm font-medium text-txt-primary">{emp.user_name}</p>
                      <p className="text-[10px] text-txt-muted">{emp.user_email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-center text-txt-secondary">{emp.meeting_count}</td>
                <td className="py-3 text-center text-txt-secondary">{emp.total_tasks}</td>
                <td className="py-3 text-center text-txt-secondary">{emp.done_tasks}</td>
                <td className="py-3 text-center">
                  <span className={`text-sm font-semibold ${
                    emp.completion_rate >= 80 ? 'text-status-success' :
                    emp.completion_rate >= 50 ? 'text-status-warning' :
                    'text-status-error'
                  }`}>
                    {emp.completion_rate}%
                  </span>
                </td>
                <td className="py-3 text-center">{getStatusBadge(emp.completion_rate)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
