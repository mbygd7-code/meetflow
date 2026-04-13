import { useState } from 'react';
import { BarChart3, Plus, X, Check, Vote } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

/**
 * PollPanel — 회의 중 투표 생성 & 참여
 * props:
 *   polls: [{ id, question, options: string[], votes: { [optionIndex]: count }, myVote: number|null }]
 *   onCreatePoll: ({ question, options }) => void
 *   onVote: (pollId, optionIndex) => void
 */
export default function PollPanel({ polls = [], onCreatePoll, onVote }) {
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const { user } = useAuthStore();

  const handleCreate = () => {
    const cleanOpts = options.filter((o) => o.trim());
    if (!question.trim() || cleanOpts.length < 2) return;
    onCreatePoll?.({ question: question.trim(), options: cleanOpts });
    setQuestion('');
    setOptions(['', '']);
    setCreating(false);
  };

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Vote size={14} className="text-brand-purple" />
          <h3 className="text-sm font-semibold text-txt-primary">투표</h3>
          {polls.length > 0 && (
            <span className="text-[11px] text-txt-muted">{polls.length}개</span>
          )}
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs text-brand-purple hover:text-txt-primary flex items-center gap-1 transition-colors"
          >
            <Plus size={13} /> 새 투표
          </button>
        )}
      </div>

      {/* 투표 생성 폼 */}
      {creating && (
        <div className="bg-bg-tertiary rounded-lg p-3 space-y-2.5 border border-border-subtle">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="투표 질문을 입력하세요"
            className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50"
            autoFocus
          />
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-txt-muted w-4 text-center">{i + 1}</span>
                <input
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.target.value;
                    setOptions(next);
                  }}
                  placeholder={`선택지 ${i + 1}`}
                  className="flex-1 bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-xs text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50"
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="p-1 text-txt-muted hover:text-status-error"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 6 && (
              <button
                onClick={() => setOptions([...options, ''])}
                className="text-[11px] text-brand-purple hover:text-txt-primary flex items-center gap-1 ml-6"
              >
                <Plus size={11} /> 선택지 추가
              </button>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setCreating(false); setQuestion(''); setOptions(['', '']); }}
              className="px-3 py-1.5 text-xs text-txt-secondary hover:text-txt-primary transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleCreate}
              disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-purple rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1"
            >
              <Check size={12} /> 투표 생성
            </button>
          </div>
        </div>
      )}

      {/* 투표 목록 */}
      {polls.length === 0 && !creating && (
        <p className="text-xs text-txt-muted text-center py-4">아직 투표가 없습니다</p>
      )}

      {polls.map((poll) => {
        const totalVotes = Object.values(poll.votes || {}).reduce((a, b) => a + b, 0);
        const hasVoted = poll.myVote !== null && poll.myVote !== undefined;

        return (
          <div key={poll.id} className="bg-bg-tertiary rounded-lg p-3 border border-border-subtle">
            <p className="text-sm font-medium text-txt-primary mb-2.5">{poll.question}</p>
            <div className="space-y-1.5">
              {(poll.options || []).map((opt, i) => {
                const count = poll.votes?.[i] || 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const isMyVote = poll.myVote === i;

                return (
                  <button
                    key={i}
                    onClick={() => !hasVoted && onVote?.(poll.id, i)}
                    disabled={hasVoted}
                    className={`w-full text-left rounded-md px-3 py-2 text-xs transition-all relative overflow-hidden ${
                      isMyVote
                        ? 'border border-brand-purple bg-brand-purple/5'
                        : hasVoted
                          ? 'border border-border-subtle'
                          : 'border border-border-subtle hover:border-brand-purple/40 cursor-pointer'
                    }`}
                  >
                    {/* 결과 바 */}
                    {hasVoted && (
                      <div
                        className="absolute inset-y-0 left-0 bg-brand-purple/10 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isMyVote && <Check size={12} className="text-brand-purple" />}
                        <span className={`font-medium ${isMyVote ? 'text-brand-purple' : 'text-txt-primary'}`}>
                          {opt}
                        </span>
                      </div>
                      {hasVoted && (
                        <span className="text-[11px] text-txt-muted font-medium">{pct}% ({count})</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-txt-muted">
              <span>총 {totalVotes}표</span>
              {hasVoted && <Badge variant="outline" className="!text-[9px]">투표 완료</Badge>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
