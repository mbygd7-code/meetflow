// 음성 회의 첫 참여 시 안내 모달
// - 같은 공간에서 다중 참여 시 하울링/echo 발생 방지 가이드
// - "다시 안 보기" 체크 시 localStorage 저장 → 이후 자동 스킵
// - "참여" 버튼 클릭 시 onConfirm 호출 → 실제 LiveKit join 트리거

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Headphones, Users, MessageSquare, X, Mic } from 'lucide-react';

const STORAGE_KEY = 'meetflow_voice_intro_seen';

export function shouldShowVoiceIntro() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function VoiceJoinIntroModal({ onConfirm, onCancel }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = () => {
    if (dontShowAgain) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    }
    onConfirm?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="bg-bg-content rounded-2xl shadow-2xl border border-border-default max-w-md w-full overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 pt-6 pb-4 border-b border-border-subtle">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-brand-purple/15 flex items-center justify-center">
              <Mic size={18} className="text-brand-purple" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-txt-primary">음성 회의 참여</h2>
              <p className="text-xs text-txt-secondary mt-0.5">
                자연스러운 대화를 위해 잠깐 안내드릴게요
              </p>
            </div>
            <button
              onClick={onCancel}
              className="shrink-0 p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5 space-y-4">
          {/* 권장 1 */}
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-md bg-status-success/10 flex items-center justify-center">
              <Headphones size={15} className="text-status-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-txt-primary mb-0.5">헤드폰 또는 이어폰 사용 권장</p>
              <p className="text-xs text-txt-secondary leading-relaxed">
                스피커로 들으면 본인 마이크가 다시 잡아 에코·하울링이 생길 수 있어요.
              </p>
            </div>
          </div>

          {/* 권장 2 */}
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-md bg-status-warning/15 flex items-center justify-center">
              <Users size={15} className="text-status-warning" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-txt-primary mb-0.5">같은 공간에서 2명 이상이면</p>
              <p className="text-xs text-txt-secondary leading-relaxed">
                옆 사람의 마이크가 본인 음성을 다시 잡아 <b className="text-txt-primary">하울링</b>이 발생합니다.
                <br />
                <b className="text-status-warning">한 분만 음성 참여 + 나머지는 채팅</b> 또는
                <br />
                회의실 스피커폰(에코캔슬링 내장)으로 1대 사용 권장.
              </p>
            </div>
          </div>

          {/* 팁 */}
          <div className="flex gap-3 p-3 rounded-md bg-brand-purple/5 border border-brand-purple/15">
            <div className="shrink-0 w-8 h-8 rounded-md bg-brand-purple/15 flex items-center justify-center">
              <MessageSquare size={15} className="text-brand-purple" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-purple-deep mb-0.5">발언이 자동 자막으로 채팅에 기록됩니다</p>
              <p className="text-xs text-txt-secondary leading-relaxed">
                음성 + STT 동시 작동 — 회의 끝나면 자동 회의록까지 생성.
              </p>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-border-subtle bg-bg-secondary/40 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-txt-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-brand-purple cursor-pointer"
            />
            다시 보지 않기
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-3.5 py-2 rounded-md text-xs font-semibold text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 rounded-md text-xs font-semibold text-white bg-brand-purple hover:opacity-90 transition-opacity"
            >
              음성 참여
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
