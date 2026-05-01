// ScreenShareInviteModal — 다른 참가자가 화면 공유 시작 시 합류 여부를 묻는 모달.
//
// 사용 흐름:
//   1) 발표자가 공유 시작 → MeetingRoom 이 lk-signal 채널로 'screen-share:start' broadcast
//   2) 미연결 수신자: setShareInvite({ presenterName }) 로 모달 노출
//   3) 사용자가 "참여하고 보기" 클릭 → onAccept → lk.join() (mute) → ScreenShareView 자동 표시
//      "지금은 안 함" 클릭 → onDecline → 모달만 닫힘 (나중에 음성 참여 버튼으로 합류 가능)
//
// UX 특징:
//   - 발표자 이름 명시 → 누구의 공유를 보는지 알 수 있음
//   - "마이크는 자동 음소거" 안내 → 의도치 않은 음성 송출 우려 해소
//   - 배경 클릭으로 dismiss X (실수 방지) — 명시적 버튼 클릭만

import { Monitor, MonitorPlay } from 'lucide-react';

export default function ScreenShareInviteModal({
  presenterName = '참가자',
  onAccept,
  onDecline,
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-bg-secondary border border-border-default rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* 상단 강조 영역 — 그라디언트 배경 + 발표자 표시 */}
        <div className="px-6 py-5 bg-gradient-to-br from-brand-purple/15 via-bg-secondary to-bg-secondary border-b border-border-divider">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-brand-purple/20 flex items-center justify-center shrink-0 ring-2 ring-brand-purple/30">
              <MonitorPlay size={22} className="text-brand-purple" strokeWidth={2.2} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-txt-primary mb-1">
                화면 공유가 시작되었습니다
              </h3>
              <p className="text-sm text-txt-secondary leading-relaxed">
                <span className="font-semibold text-txt-primary">{presenterName}</span>
                님이 화면을 공유 중입니다. 합류하시면 공유 화면을 실시간으로 볼 수 있어요.
              </p>
            </div>
          </div>
        </div>

        {/* 안내 영역 */}
        <div className="px-6 py-4 text-[12px] text-txt-secondary leading-relaxed space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="inline-block w-1 h-1 rounded-full bg-status-success mt-1.5 shrink-0" />
            <span>마이크는 <span className="font-medium text-txt-primary">자동으로 음소거</span>됩니다 — 원하시면 직접 켜고 말씀하실 수 있어요.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="inline-block w-1 h-1 rounded-full bg-status-success mt-1.5 shrink-0" />
            <span>나중에라도 상단 <span className="font-medium text-txt-primary">"음성 참여"</span> 버튼으로 합류할 수 있습니다.</span>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="px-6 py-4 bg-bg-tertiary/40 border-t border-border-divider flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-2 rounded-md text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
          >
            지금은 안 함
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-brand-purple hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 shadow-sm"
          >
            <Monitor size={14} strokeWidth={2.4} />
            참여하고 보기
          </button>
        </div>
      </div>
    </div>
  );
}
