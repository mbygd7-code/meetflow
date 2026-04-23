import { useState, useEffect } from 'react';
import { X, Bell, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

// Slack DM 알림 설정 안내 배너
// - 사용자별로 "다시 보지 않기" 상태 저장 (localStorage)
// - Slack 연동된 사용자(slack_user_id 있음)에게만 표시
// - 상단 축소 배너 → 클릭 시 상세 펼침
const DISMISS_KEY_PREFIX = 'meetflow_slack_banner_dismissed_';

export default function SlackNotifyBanner() {
  const { user } = useAuthStore();
  const [dismissed, setDismissed] = useState(true); // 초기 로딩 깜빡임 방지
  const [hasSlack, setHasSlack] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 사용자 Slack 연동 여부 + dismiss 상태 확인
  useEffect(() => {
    if (!user?.id || user.id.startsWith('mock-')) return;

    const key = DISMISS_KEY_PREFIX + user.id;
    if (localStorage.getItem(key) === '1') {
      setDismissed(true);
      return;
    }

    // Slack 연동 사용자만 타겟
    (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('slack_user_id')
          .eq('id', user.id)
          .maybeSingle();
        if (data?.slack_user_id) {
          setHasSlack(true);
          setDismissed(false);
        }
      } catch {
        // 조회 실패 시 배너 숨김 (안전)
      }
    })();
  }, [user?.id]);

  if (dismissed || !hasSlack) return null;

  const handleDismiss = (e) => {
    e?.stopPropagation?.();
    if (!user?.id) return;
    localStorage.setItem(DISMISS_KEY_PREFIX + user.id, '1');
    setDismissed(true);
  };

  return (
    <div className="relative mx-4 md:mx-6 mt-4 rounded-lg border border-brand-purple/30 bg-brand-purple/10 overflow-hidden">
      {/* 상단 요약 — 항상 보임 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-purple/5 transition-colors"
      >
        <div className="shrink-0 w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center">
          <Bell size={16} className="text-brand-purple" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-sm font-semibold text-txt-primary">
            📌 Slack 알림 받으시려면 설정 한 번 해주세요
          </p>
          <p className="text-xs text-txt-secondary mt-0.5 truncate">
            태스크 할당·멘션 시 Slack DM이 오지만 "앱" 섹션에 있어 놓치기 쉬워요
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <span className="hidden sm:inline text-xs text-txt-muted">
            {expanded ? '접기' : '자세히'}
          </span>
          {expanded ? (
            <ChevronUp size={16} className="text-txt-muted" />
          ) : (
            <ChevronDown size={16} className="text-txt-muted" />
          )}
        </div>
      </button>

      {/* X 닫기 버튼 — 오른쪽 상단 고정 */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-md text-txt-muted hover:text-txt-primary hover:bg-bg-tertiary transition-colors"
        title="다시 보지 않기"
        aria-label="닫기"
      >
        <X size={14} />
      </button>

      {/* 상세 — 펼쳤을 때만 */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-brand-purple/20 space-y-3">
          {/* 데스크탑 */}
          <div>
            <p className="text-xs font-semibold text-txt-primary mb-1.5 flex items-center gap-1.5">
              <span>💻</span> 데스크탑 (Mac / Windows)
            </p>
            <ol className="text-xs text-txt-secondary space-y-1 pl-5 list-decimal">
              <li>Slack 사이드바 → <b>앱</b> 섹션에서 <b>Meetflow</b> 우클릭</li>
              <li><b>대화 설정</b> → <b>알림</b> → <b>"모든 새 메시지"</b> 선택</li>
              <li className="flex items-center gap-1.5">
                <Star size={12} className="text-brand-yellow fill-brand-yellow" />
                <span>별 눌러 사이드바 상단 고정 추천</span>
              </li>
            </ol>
          </div>

          {/* 모바일 */}
          <div>
            <p className="text-xs font-semibold text-txt-primary mb-1.5 flex items-center gap-1.5">
              <span>📱</span> 모바일 (iOS / Android)
            </p>
            <ol className="text-xs text-txt-secondary space-y-1 pl-5 list-decimal">
              <li><b>Meetflow</b> 앱 길게 누르기</li>
              <li><b>알림</b> → <b>"모든 메시지"</b></li>
            </ol>
          </div>

          {/* 액션 */}
          <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
            <p className="text-[11px] text-txt-muted italic">
              설정 후 "밋풀로우에서 열기" 버튼이 푸시 알림으로 떠요
            </p>
            <button
              onClick={handleDismiss}
              className="shrink-0 text-xs font-semibold text-brand-purple hover:text-brand-purple-deep transition-colors px-3 py-1.5 rounded-md hover:bg-brand-purple/10"
            >
              설정 완료 · 다시 안 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
