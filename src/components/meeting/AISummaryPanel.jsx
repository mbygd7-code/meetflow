import { Avatar, Badge } from '@/components/ui';
import { Sparkles, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import PollPanel from './PollPanel';

// 기본 플레이스홀더 — PROMPT 6에서 실제 AI 요약으로 교체됩니다.
const PLACEHOLDER_SECTIONS = [
  {
    key: 'decisions',
    title: '결정 사항',
    border: 'border-status-success',
    items: [],
  },
  {
    key: 'discussions',
    title: '논의 중',
    border: 'border-brand-yellow',
    items: [],
  },
  {
    key: 'deferred',
    title: '보류',
    border: 'border-txt-secondary',
    items: [],
  },
];

export default function AISummaryPanel({ meetingId, sections = PLACEHOLDER_SECTIONS, polls, onCreatePoll, onVote }) {
  const hasContent = sections.some((s) => s.items.length > 0);

  return (
    <aside className="w-80 shrink-0 border-l border-border-subtle bg-bg-primary flex flex-col min-h-0 h-full overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-border-divider flex items-center gap-3">
        <Avatar variant="ai" size="sm" label="M" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-txt-primary">Milo 실시간 요약</p>
          <p className="text-[10px] text-txt-muted">매 턴마다 자동 업데이트</p>
        </div>
        <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
          <Sparkles size={10} strokeWidth={2.4} /> AI
        </Badge>
      </div>

      {/* 섹션 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 scrollbar-hide">
        {!hasContent && (
          <div className="text-center py-10 text-txt-muted">
            <Sparkles size={20} className="mx-auto mb-2 opacity-40" />
            <p className="text-xs leading-relaxed">
              회의가 진행되면 Milo가 실시간으로<br />
              결정 사항과 논의 내용을 정리합니다
            </p>
          </div>
        )}

        {sections.map((s) => (
          <div key={s.key} className={`border-l-2 ${s.border} pl-3`}>
            <h4 className="text-[11px] font-semibold text-txt-primary uppercase tracking-wider mb-2">
              {s.title}
              {s.items.length > 0 && (
                <span className="ml-1.5 text-txt-muted">{s.items.length}</span>
              )}
            </h4>
            <ul className="space-y-1.5">
              {s.items.map((item, i) => (
                <li key={i} className="text-xs text-txt-secondary leading-relaxed">
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 투표 섹션 */}
      {(polls || onCreatePoll) && (
        <div className="px-5 py-4 border-t border-border-divider">
          <PollPanel polls={polls} onCreatePoll={onCreatePoll} onVote={onVote} />
        </div>
      )}

      {/* 하단 링크 */}
      <div className="px-5 py-4 border-t border-border-divider">
        <Link
          to={`/summaries/${meetingId || ''}`}
          className="flex items-center justify-center gap-2 text-xs text-brand-purple hover:text-txt-primary transition-colors"
        >
          <FileText size={12} />
          전체 회의록 보기
        </Link>
      </div>
    </aside>
  );
}
