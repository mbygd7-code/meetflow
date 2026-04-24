// 관리자용 직원 평가 + 기여도 랭킹 통합 테이블
// 하나의 테이블에 순위/이름/팀/회의/태스크/완수율/기여도 스택바/상태를 모두 표시
// (이전에 "직원 평가"와 "종합 기여도 랭킹" 두 섹션이 중복되던 것을 단일 UX로 통합)
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Trophy, Award, Medal } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';

function getStatusBadge(rate) {
  if (rate >= 80) return <Badge variant="success">우수</Badge>;
  if (rate >= 50) return <Badge variant="warning">보통</Badge>;
  return <Badge variant="danger">관심 필요</Badge>;
}

function RankCell({ index }) {
  // 상위 3명 Trophy/Medal/Award, 나머지는 숫자
  if (index === 0) {
    return (
      <span className="w-6 h-6 rounded-full flex items-center justify-center bg-brand-orange text-white shrink-0">
        <Trophy size={14} />
      </span>
    );
  }
  if (index === 1) {
    return (
      <span className="w-6 h-6 rounded-full flex items-center justify-center bg-brand-purple text-white shrink-0">
        <Medal size={14} />
      </span>
    );
  }
  if (index === 2) {
    return (
      <span className="w-6 h-6 rounded-full flex items-center justify-center bg-brand-yellow text-txt-primary shrink-0">
        <Award size={14} />
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold bg-bg-tertiary text-txt-muted shrink-0">
      {index + 1}
    </span>
  );
}

function CompletionBar({ rate }) {
  const color =
    rate >= 80 ? 'bg-status-success' :
    rate >= 50 ? 'bg-brand-orange' :
    'bg-status-error';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold shrink-0 ${
        rate >= 80 ? 'text-status-success' : rate >= 50 ? 'text-brand-orange' : 'text-status-error'
      }`}>
        {rate}%
      </span>
    </div>
  );
}

function ContributionBar({ completion, execution, responsibility, score }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden flex min-w-[60px]"
        title={`완수율 ${completion}% · 완수량 ${execution}% · 담당량 ${responsibility}%`}
      >
        <div className="h-full bg-status-success transition-all" style={{ width: `${completion * 0.5}%` }} />
        <div className="h-full bg-brand-purple transition-all" style={{ width: `${execution * 0.3}%` }} />
        <div className="h-full bg-brand-orange transition-all" style={{ width: `${responsibility * 0.2}%` }} />
      </div>
      <span
        className={`text-xs font-bold shrink-0 min-w-[24px] text-right ${
          score >= 70 ? 'text-status-success' : score >= 40 ? 'text-brand-orange' : 'text-status-error'
        }`}
      >
        {score}
      </span>
    </div>
  );
}

/**
 * 직원 배열에 기여도 계산 필드를 붙여 정렬해서 반환
 * _score, _completion, _execution, _responsibility 주입
 */
function withContributionScores(employees) {
  if (!employees.length) return [];
  const maxDone = Math.max(...employees.map((e) => e.done_tasks || 0), 1);
  const maxTotal = Math.max(...employees.map((e) => e.total_tasks || 0), 1);

  return [...employees]
    .map((e) => {
      const completion = e.completion_rate || 0;
      const execution = Math.round(((e.done_tasks || 0) / maxDone) * 100);
      const responsibility = Math.round(((e.total_tasks || 0) / maxTotal) * 100);
      const score = Math.round(completion * 0.5 + execution * 0.3 + responsibility * 0.2);
      return {
        ...e,
        _score: score,
        _completion: completion,
        _execution: execution,
        _responsibility: responsibility,
      };
    })
    .sort((a, b) => b._score - a._score);
}

export default function EmployeeTable({ employees = [] }) {
  const navigate = useNavigate();
  const ranked = withContributionScores(employees);

  if (ranked.length === 0) {
    return <p className="py-8 text-center text-txt-muted text-sm">직원 데이터가 없습니다</p>;
  }

  return (
    <div className="space-y-3">
      {/* 가중치 범례 */}
      <div className="flex items-center gap-3 px-1 text-[10px] text-txt-muted flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-status-success" />
          완수율 50% (품질)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-brand-purple" />
          완수량 30% (실행력)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-brand-orange" />
          담당량 20% (책임)
        </span>
      </div>

      {/* ═══ 데스크톱 테이블 ═══ */}
      <div className="hidden md:block space-y-1">
        {/* 헤더 */}
        <div className="grid grid-cols-[32px_1fr_80px_64px_80px_100px_72px_28px] gap-3 px-3 pb-2 text-[10px] text-txt-muted uppercase tracking-wider border-b border-border-divider">
          <span>#</span>
          <span>직원</span>
          <span className="text-center">회의</span>
          <span className="text-center">완료/배정</span>
          <span>완수율</span>
          <span>기여도</span>
          <span className="text-center">상태</span>
          <span />
        </div>

        {/* 행 */}
        {ranked.map((emp, i) => (
          <div
            key={emp.user_id}
            className="grid grid-cols-[32px_1fr_80px_64px_80px_100px_72px_28px] gap-3 items-center px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer hover:bg-bg-tertiary"
            onClick={() => navigate(`/admin/employee/${emp.user_id}`)}
          >
            <RankCell index={i} />

            {/* 직원 이름 + 팀 */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={emp.user_name || 'U'} color={emp.avatar_color} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-txt-primary truncate">{emp.user_name}</p>
                {emp.team && (
                  <p className="text-[10px] text-txt-muted truncate">{emp.team}</p>
                )}
              </div>
            </div>

            <p className="text-center text-sm text-txt-secondary">{emp.meeting_count || 0}</p>
            <p className="text-center text-sm text-txt-secondary">
              <span className="text-status-success font-semibold">{emp.done_tasks || 0}</span>
              <span className="text-txt-muted">/{emp.total_tasks || 0}</span>
            </p>

            <CompletionBar rate={emp.completion_rate || 0} />

            <ContributionBar
              completion={emp._completion}
              execution={emp._execution}
              responsibility={emp._responsibility}
              score={emp._score}
            />

            <div className="text-center">{getStatusBadge(emp.completion_rate || 0)}</div>

            <ChevronRight size={16} className="text-txt-muted justify-self-end" />
          </div>
        ))}
      </div>

      {/* ═══ 모바일 카드 ═══ */}
      <div className="md:hidden space-y-2.5">
        {ranked.map((emp, i) => (
          <div
            key={emp.user_id}
            className="bg-bg-secondary border border-border-subtle rounded-xl p-4 cursor-pointer active:scale-[0.98] transition-all"
            onClick={() => navigate(`/admin/employee/${emp.user_id}`)}
          >
            {/* 상단: 순위 + 아바타 + 이름 + 상태 */}
            <div className="flex items-center gap-3 mb-3">
              <RankCell index={i} />
              <Avatar name={emp.user_name || 'U'} color={emp.avatar_color} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-txt-primary truncate">{emp.user_name}</p>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  {emp.team || '미지정'} · 회의 {emp.meeting_count || 0}회
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {getStatusBadge(emp.completion_rate || 0)}
                <ChevronRight size={16} className="text-txt-muted" />
              </div>
            </div>

            {/* 완수율 바 */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[11px] text-txt-muted shrink-0 w-14">완수율</span>
              <CompletionBar rate={emp.completion_rate || 0} />
            </div>

            {/* 기여도 바 */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-txt-muted shrink-0 w-14">기여도</span>
              <ContributionBar
                completion={emp._completion}
                execution={emp._execution}
                responsibility={emp._responsibility}
                score={emp._score}
              />
            </div>

            {/* 상세 수치 */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-divider-faint">
              <div className="text-center">
                <p className="text-[11px] text-txt-muted">배정</p>
                <p className="text-sm font-semibold text-txt-primary">{emp.total_tasks || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-txt-muted">완료</p>
                <p className="text-sm font-semibold text-status-success">{emp.done_tasks || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-txt-muted">회의</p>
                <p className="text-sm font-semibold text-txt-primary">{emp.meeting_count || 0}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
