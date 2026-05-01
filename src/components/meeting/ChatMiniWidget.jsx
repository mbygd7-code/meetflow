// ChatMiniWidget — 풀스크린 화면 공유 시 floating 채팅 미니 위젯
//
// 사용처: ScreenShareView 가 브라우저 풀스크린 모드 (videoWrapRef 가 풀스크린)일 때
//        해당 풀스크린 element 안 우측 하단에 절대 위치로 렌더되어, 일반 DOM 채팅이
//        안 보이는 풀스크린 상태에서도 최근 메시지를 확인할 수 있게 함.
//
// 표시:
//   기본 (collapsed): 작은 알림 카드 — 최근 메시지 1건 미리보기 + 새 메시지 N개 카운터
//   펼침 (expanded): 최근 5건 메시지 목록 (스크롤 없이) + "닫기" 버튼
//
// 의도적으로 입력은 제공하지 않음:
//   - 풀스크린 + 발표 중 텍스트 입력은 흐름 깨짐
//   - 답변하려면 ESC → 일반 모드로 빠져나와 정식 ChatArea 사용 유도
//   - "입력하려면 풀스크린 종료" 안내 텍스트 제공

import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Avatar } from '@/components/ui';

const MAX_PREVIEW = 5;

/**
 * @param {{
 *   messages: Array<{ id, content, user?, is_ai?, ai_employee?, created_at }>,
 *   currentUserId?: string,
 * }} props
 */
export default function ChatMiniWidget({ messages = [], currentUserId = null }) {
  const [expanded, setExpanded] = useState(false);
  // 마지막으로 본 시각 — 새 메시지 카운트 계산 기준
  const [lastSeenAt, setLastSeenAt] = useState(() => Date.now());

  // 펼친 상태가 되면 즉시 lastSeen 갱신 (모두 본 것으로 처리)
  useEffect(() => {
    if (expanded) setLastSeenAt(Date.now());
  }, [expanded]);

  // 최근 메시지 (시스템/공지 제외, 정렬은 messages 배열 순서 신뢰)
  const recent = useMemo(() => {
    const arr = Array.isArray(messages) ? messages : [];
    // 시스템 메시지(ai_type === 'system')는 미니 위젯에서 제외 — 입퇴장 알림 등 노이즈
    const filtered = arr.filter((m) => m && m.ai_type !== 'system');
    return filtered.slice(-MAX_PREVIEW);
  }, [messages]);

  // 마지막 메시지 (collapsed 시 미리보기)
  const latest = recent[recent.length - 1] || null;

  // 새 메시지 카운트 (lastSeenAt 이후 + 본인 메시지 제외)
  const newCount = useMemo(() => {
    if (!Array.isArray(messages)) return 0;
    let n = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m?.created_at) continue;
      if (new Date(m.created_at).getTime() <= lastSeenAt) break;
      if (m.user?.id === currentUserId) continue; // 본인 메시지는 카운트 X
      if (m.ai_type === 'system') continue;
      n += 1;
    }
    return n;
  }, [messages, lastSeenAt, currentUserId]);

  // 새 메시지 도착 시 자동 펼침은 X (사용자가 직접 토글) — 발표 중 방해 X.
  // 단 카운터 강조로 시각적 알림.

  if (recent.length === 0) {
    return null;
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 max-w-[320px] px-3 py-2 rounded-lg bg-black/70 backdrop-blur-md text-white border border-white/15 shadow-lg hover:bg-black/80 transition-colors text-left"
        title="채팅 펼치기"
      >
        <div className="relative shrink-0">
          <MessageSquare size={16} className="text-white" strokeWidth={2.2} />
          {newCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-status-error text-white text-[9px] font-bold flex items-center justify-center">
              {newCount > 99 ? '99+' : newCount}
            </span>
          )}
        </div>
        {latest && (
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-white/70 leading-tight truncate">
              {latest.user?.name || (latest.is_ai ? 'Milo' : '참가자')}
            </p>
            <p className="text-[12px] text-white truncate leading-snug">
              {(latest.content || '').slice(0, 60) || '(내용 없음)'}
            </p>
          </div>
        )}
        <ChevronUp size={14} className="shrink-0 text-white/60" />
      </button>
    );
  }

  return (
    <div className="w-[340px] max-w-[90vw] rounded-lg bg-black/85 backdrop-blur-md border border-white/15 shadow-xl text-white overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <MessageSquare size={14} className="text-white" strokeWidth={2.4} />
        <span className="text-[12px] font-semibold">채팅</span>
        <span className="text-[10px] text-white/50">최근 {recent.length}건</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="ml-auto p-1 rounded hover:bg-white/10 text-white/70"
          aria-label="접기"
          title="접기"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* 메시지 목록 */}
      <ul className="max-h-[260px] overflow-y-auto divide-y divide-white/5">
        {recent.map((m, i) => {
          const isMine = m.user?.id && m.user.id === currentUserId;
          const speaker = m.user?.name || (m.is_ai ? (m.ai_employee || 'Milo') : '참가자');
          return (
            <li key={m.id || `mini-${i}`} className="flex gap-2 px-3 py-2">
              <Avatar
                name={speaker}
                color={m.user?.avatar_color || (m.is_ai ? '#723CEB' : undefined)}
                size="sm"
                className="!w-6 !h-6 !text-[9px] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] leading-tight">
                  <span className={`font-semibold ${isMine ? 'text-brand-orange' : 'text-white'}`}>
                    {speaker}
                  </span>
                </p>
                <p className="text-[12px] text-white/90 leading-snug break-words">
                  {(m.content || '').slice(0, 200) || '(내용 없음)'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 안내 — 입력은 일반 모드에서 */}
      <div className="px-3 py-2 border-t border-white/10 text-[10px] text-white/55 leading-relaxed">
        입력하려면 <kbd className="px-1 py-0.5 rounded bg-white/15 text-white text-[9px] font-mono">ESC</kbd>
        로 풀스크린 종료 후 채팅창 사용
      </div>
    </div>
  );
}
