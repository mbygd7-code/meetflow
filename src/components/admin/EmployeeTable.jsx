import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';

function getStatusBadge(rate) {
  if (rate >= 80) return <Badge variant="success">우수</Badge>;
  if (rate >= 50) return <Badge variant="warning">보통</Badge>;
  return <Badge variant="danger">관심 필요</Badge>;
}

function CompletionBar({ rate }) {
  const color =
    rate >= 80 ? 'bg-status-success' :
    rate >= 50 ? 'bg-brand-orange' :
    'bg-status-error';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold min-w-[32px] text-right ${
        rate >= 80 ? 'text-status-success' : rate >= 50 ? 'text-brand-orange' : 'text-status-error'
      }`}>
        {rate}%
      </span>
    </div>
  );
}

export default function EmployeeTable({ employees = [] }) {
  const navigate = useNavigate();

  if (employees.length === 0) {
    return <p className="py-8 text-center text-txt-muted text-sm">직원 데이터가 없습니다</p>;
  }

  return (
    <>
      {/* ═══ 데스크톱: 테이블 레이아웃 ═══ */}
      <div className="hidden md:block space-y-1.5">
        <div className="grid grid-cols-[1fr_72px_72px_48px_56px_72px] gap-2 px-3 pb-1 text-[11px] text-txt-muted uppercase tracking-wider">
          <span>직원</span>
          <span className="text-center">참여 회의</span>
          <span className="text-center">배정 태스크</span>
          <span className="text-center">완료</span>
          <span className="text-center">완수율</span>
          <span className="text-center">상태</span>
        </div>

        {employees.map((emp) => (
          <div
            key={emp.user_id}
            className="grid grid-cols-[1fr_72px_72px_48px_56px_72px] gap-2 items-center px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer hover:bg-bg-tertiary"
            onClick={() => navigate(`/admin/employee/${emp.user_id}`)}
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={emp.user_name || 'U'} color={emp.avatar_color} size="sm" />
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

      {/* ═══ 모바일: 카드형 레이아웃 ═══ */}
      <div className="md:hidden space-y-2.5">
        {employees.map((emp) => (
          <div
            key={emp.user_id}
            className="bg-bg-secondary border border-border-subtle rounded-xl p-4 cursor-pointer active:scale-[0.98] transition-all"
            onClick={() => navigate(`/admin/employee/${emp.user_id}`)}
          >
            {/* 상단: 아바타 + 이름 + 상태 배지 */}
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={emp.user_name || 'U'} color={emp.avatar_color} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-txt-primary truncate">{emp.user_name}</p>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  회의 {emp.meeting_count}회 · 태스크 {emp.total_tasks}건
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {getStatusBadge(emp.completion_rate)}
                <ChevronRight size={14} className="text-txt-muted" />
              </div>
            </div>

            {/* 하단: 완수율 프로그레스 바 */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-txt-muted shrink-0 w-14">완수율</span>
              <CompletionBar rate={emp.completion_rate} />
            </div>

            {/* 상세 수치 */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-divider-faint">
              <div className="text-center">
                <p className="text-[11px] text-txt-muted">배정</p>
                <p className="text-sm font-semibold text-txt-primary">{emp.total_tasks}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-txt-muted">완료</p>
                <p className="text-sm font-semibold text-status-success">{emp.done_tasks}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-txt-muted">회의</p>
                <p className="text-sm font-semibold text-txt-primary">{emp.meeting_count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
