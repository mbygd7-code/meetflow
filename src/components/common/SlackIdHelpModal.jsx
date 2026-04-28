// Slack ID 찾는 방법 안내 모달 — 재사용 컴포넌트
//   사용처: TeamManagementModal (직원 초대), LoginPage (회원가입)
//   친절한 4단계 안내 + 모바일 사용자 안내

import { createPortal } from 'react-dom';
import {
  HelpCircle, X, MousePointerClick, MoreVertical, ClipboardCopy, ClipboardPaste,
} from 'lucide-react';

export default function SlackIdHelpModal({ open, onClose }) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-bg-secondary border border-border-default rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-purple/15 flex items-center justify-center">
              <HelpCircle size={18} className="text-brand-purple" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-txt-primary">Slack 사용자 ID 찾는 방법</h3>
              <p className="text-[11px] text-txt-muted">3단계로 간단하게</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle">
            <div className="w-8 h-8 rounded-full bg-brand-purple text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
            <div className="flex-1 flex items-start gap-2">
              <MousePointerClick size={18} className="text-brand-purple shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">Slack 앱에서 본인 프로필 클릭</p>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  좌측 사이드바 상단의 본인 프로필 사진 → 또는 검색에서 본인 이름 검색 후 프로필 클릭
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle">
            <div className="w-8 h-8 rounded-full bg-brand-purple text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
            <div className="flex-1 flex items-start gap-2">
              <MoreVertical size={18} className="text-brand-purple shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">프로필 페이지의 ⋮ 옵션 메뉴 클릭</p>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  프로필 페이지 우측 상단의 점 3개 (More) 버튼 → 펼쳐지는 메뉴 확인
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary/50 border border-border-subtle">
            <div className="w-8 h-8 rounded-full bg-brand-purple text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
            <div className="flex-1 flex items-start gap-2">
              <ClipboardCopy size={18} className="text-brand-purple shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">"멤버 ID 복사" 클릭</p>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  메뉴에서 <span className="font-mono px-1 py-0.5 rounded bg-bg-tertiary text-brand-purple">멤버 ID 복사</span> 항목 → 자동으로 복사됨 (<span className="font-mono">U</span>로 시작하는 11자리)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-status-success/10 border border-status-success/30">
            <div className="w-8 h-8 rounded-full bg-status-success text-white flex items-center justify-center text-xs font-bold shrink-0">4</div>
            <div className="flex-1 flex items-start gap-2">
              <ClipboardPaste size={18} className="text-status-success shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-txt-primary">위 입력란에 붙여넣기</p>
                <p className="text-[11px] text-txt-muted mt-0.5">
                  복사한 ID 를 Slack ID 입력란에 <span className="font-mono">Ctrl+V</span> 로 붙여넣기 → 완료!
                </p>
              </div>
            </div>
          </div>

          <div className="px-3 py-2 rounded-md bg-status-info/10 border border-status-info/30 text-[11px] text-txt-secondary">
            💡 <span className="font-semibold text-txt-primary">모바일 Slack</span> 에서는 본인 프로필 → 우상단 메뉴 (⋮) → "멤버 ID 복사" 동일 위치
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-border-subtle bg-bg-primary/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-brand-purple text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            알겠어요
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
