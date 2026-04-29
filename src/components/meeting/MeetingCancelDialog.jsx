import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { useCancelDialogStore } from '@/hooks/useMeetingCancel';

/**
 * 회의 취소/불참 확인 다이얼로그 — App 단위로 한 번만 마운트.
 * Zustand 스토어의 pendingCancel을 구독하고 사용자 응답을 받아 onConfirm 콜백 호출.
 */
export default function MeetingCancelDialog() {
  const { pending, closeDialog } = useCancelDialogStore();
  const [reason, setReason] = useState('');

  // 다이얼로그가 열릴 때마다 reason 초기화
  useEffect(() => {
    if (pending) setReason('');
  }, [pending]);

  if (!pending) return null;

  const { meeting, isCreator, onConfirm } = pending;
  const title = isCreator ? '회의 취소' : '회의 불참';
  const description = isCreator
    ? '참가자 전원에게 Slack 취소 알림이 전송됩니다.'
    : '요청자에게 Slack 알림이 전송됩니다.';
  const reasonLabel = isCreator ? '취소 사유 (선택)' : '불참 사유 (선택)';
  const confirmLabel = isCreator ? '회의 취소' : '불참 표시';

  const handleConfirm = () => {
    const trimmed = (reason || '').trim();
    closeDialog();
    onConfirm?.(trimmed);
  };

  return (
    <Modal
      open={!!pending}
      onClose={closeDialog}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={closeDialog}>닫기</Button>
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-status-error rounded-md hover:opacity-90 transition-opacity"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-md bg-status-error/10 border border-status-error/30">
          <AlertTriangle size={18} className="text-status-error shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-txt-primary mb-0.5">
              "{meeting?.title}"
              {isCreator ? ' 회의를 취소하시겠습니까?' : ' 회의에 불참하시겠습니까?'}
            </p>
            <p className="text-[12px] text-txt-secondary">{description}</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-txt-secondary mb-1.5 uppercase tracking-wider">
            {reasonLabel}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={isCreator ? '예: 일정이 겹쳐 다음 주로 연기합니다' : '예: 다른 회의 참석'}
            autoFocus
            className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50 focus:ring-[3px] focus:ring-brand-purple/15 resize-none"
          />
          <p className="text-[10px] text-txt-muted mt-1">
            비워둬도 됩니다. 입력한 사유는 Slack 알림에 함께 전송됩니다.
          </p>
        </div>
      </div>
    </Modal>
  );
}
