// AI 메시지 피드백 버튼 (Phase 3)
// - 👍/👎 토글
// - 👎 클릭 시 이유 드롭다운
// - 집계(선택) 표시
// - 디자인 시스템: text-txt-muted / brand-purple / status-error (미니멀)

import { useState, useRef, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useToastStore } from '@/stores/toastStore';

const REASON_OPTIONS = [
  { key: 'too_long', label: '너무 길다' },
  { key: 'incorrect', label: '틀렸다' },
  { key: 'off_topic', label: '범위 밖' },
  { key: 'repetitive', label: '반복' },
  { key: 'other', label: '기타' },
];

export default function FeedbackButtons({ messageId, compact = false }) {
  const submitFeedback = useFeedbackStore((s) => s.submitFeedback);
  const my = useFeedbackStore((s) => s.myFeedbacks.get(messageId));
  const agg = useFeedbackStore((s) => s.aggregates.get(messageId));
  const addToast = useToastStore((s) => s.addToast);
  const [reasonOpen, setReasonOpen] = useState(false);
  const popoverRef = useRef(null);

  // 바깥 클릭 감지로 드롭다운 닫기
  useEffect(() => {
    if (!reasonOpen) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setReasonOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reasonOpen]);

  const handleUp = async (e) => {
    e.stopPropagation();
    try {
      await submitFeedback(messageId, 1, null);
    } catch {
      addToast('피드백 저장 실패', 'error', 2000);
    }
  };

  const handleDown = async (e) => {
    e.stopPropagation();
    // 이미 👎면 단순 해제, 아니면 이유 드롭다운 열기
    if (my?.rating === -1) {
      try {
        await submitFeedback(messageId, -1, my.reason); // 토글 오프
      } catch {
        addToast('피드백 저장 실패', 'error', 2000);
      }
      return;
    }
    setReasonOpen(true);
  };

  const chooseReason = async (reasonKey) => {
    setReasonOpen(false);
    try {
      await submitFeedback(messageId, -1, reasonKey);
    } catch {
      addToast('피드백 저장 실패', 'error', 2000);
    }
  };

  const isUp = my?.rating === 1;
  const isDown = my?.rating === -1;
  const hasAnyFeedback = !!agg && (agg.up > 0 || agg.down > 0);

  const btnBase = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md transition-colors ${
    compact ? 'text-[10px]' : 'text-[11px]'
  }`;

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        onClick={handleUp}
        className={`${btnBase} ${
          isUp ? 'text-status-success bg-status-success/10' : 'text-txt-muted hover:text-status-success hover:bg-status-success/5'
        } ${my?.pending ? 'opacity-60' : ''}`}
        title={isUp ? '피드백 취소' : '도움됐어요'}
        aria-pressed={isUp}
      >
        <ThumbsUp size={compact ? 11 : 12} />
        {hasAnyFeedback && agg.up > 0 && <span>{agg.up}</span>}
      </button>

      <button
        onClick={handleDown}
        className={`${btnBase} ${
          isDown ? 'text-status-error bg-status-error/10' : 'text-txt-muted hover:text-status-error hover:bg-status-error/5'
        } ${my?.pending ? 'opacity-60' : ''}`}
        title={isDown ? '피드백 취소' : '개선이 필요해요'}
        aria-pressed={isDown}
      >
        <ThumbsDown size={compact ? 11 : 12} />
        {hasAnyFeedback && agg.down > 0 && <span>{agg.down}</span>}
      </button>

      {/* 이유 드롭다운 */}
      {reasonOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-1 z-20 bg-bg-content border border-border-default rounded-lg shadow-lg p-1 min-w-[140px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-2 py-1 border-b border-border-subtle mb-1">
            <span className="text-[10px] text-txt-muted font-semibold uppercase tracking-wider">
              이유 (선택)
            </span>
            <button
              onClick={() => setReasonOpen(false)}
              className="text-txt-muted hover:text-txt-primary"
              aria-label="닫기"
            >
              <X size={13} />
            </button>
          </div>
          {REASON_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => chooseReason(opt.key)}
              className="w-full text-left px-2 py-1.5 text-[11px] rounded text-txt-secondary hover:bg-bg-tertiary hover:text-txt-primary transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
