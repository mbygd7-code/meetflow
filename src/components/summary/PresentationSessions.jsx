// PresentationSessions — 화면 공유 발표 세션 그룹핑 카드
//
// 설계 원칙 (다른 기능에 영향 없는 안전 컴포넌트):
//   - 메시지 metadata.during_screen_share 가 없으면 sessions=[] → null 반환 (시각적 변화 0)
//   - 모든 필드 optional chaining + 기본값 (?. ?? || )
//   - 시간 계산 24h cap (timestamp 이상치 가드)
//   - 기본 접힘 — 헤더만 보이고 한 세션 클릭 시 펼침 (정보 밀도 ↓)
//
// 데이터 출처: useRealtimeMessages 의 messages 배열.
//   각 메시지에 metadata.during_screen_share = { presenter, presenter_name, ts } 가 있을 수 있음.
//   MeetingRoom 의 handleSend 가 lk.screenShares 활성 시 자동 첨부.

import { useState, useMemo } from 'react';
import { MonitorPlay, ChevronDown, ChevronUp, MessageSquare, Clock } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { safeFormatDate } from '@/utils/formatters';
import { groupPresentations, presentationDurationMinutes } from '@/utils/presentations';

export default function PresentationSessions({ messages = [] }) {
  const [openIdx, setOpenIdx] = useState(null); // 펼친 세션 인덱스 (한 번에 하나만)
  const sessions = useMemo(() => groupPresentations(messages), [messages]);

  // 발표 메타가 전혀 없으면 컴포넌트 자체를 그리지 않음 → 기존 회의록 영향 0
  if (sessions.length === 0) return null;

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-[10px] mb-5 overflow-hidden">
      {/* 헤더 — 단순 제목 (전체 토글이 아니라 정보 표시만) */}
      <div className="px-4 py-3 border-b border-border-divider flex items-center gap-2">
        <MonitorPlay size={15} className="text-brand-purple shrink-0" strokeWidth={2.4} />
        <h3 className="text-sm font-semibold text-txt-primary">화면 공유 발표</h3>
        <span className="text-xs text-txt-muted">{sessions.length}건</span>
      </div>

      {/* 세션 리스트 — 각 세션 클릭 시 메시지 펼침 */}
      <ul className="divide-y divide-border-divider">
        {sessions.map((s, i) => {
          const open = openIdx === i;
          const durMin = presentationDurationMinutes(s.start_at, s.end_at);
          return (
            <li key={`${s.presenter}-${i}`}>
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : i)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-bg-tertiary/30 transition-colors text-left"
              >
                <Avatar
                  name={s.presenter_name}
                  size="sm"
                  className="!w-7 !h-7 !text-[10px] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-txt-primary truncate">
                    {s.presenter_name}
                    <span className="text-txt-muted font-normal">님의 발표</span>
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-txt-muted mt-0.5">
                    <span>
                      {safeFormatDate(s.start_at, 'HH:mm', '-')}
                      {' ~ '}
                      {safeFormatDate(s.end_at, 'HH:mm', '-')}
                    </span>
                    {durMin > 0 && (
                      <>
                        <span className="text-border-default">·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Clock size={10} strokeWidth={2.2} />
                          {durMin}분
                        </span>
                      </>
                    )}
                    <span className="text-border-default">·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <MessageSquare size={10} strokeWidth={2.2} />
                      {s.messages.length}건
                    </span>
                  </div>
                </div>
                <span className="text-txt-muted shrink-0">
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {/* 펼침 영역 — 발표 중 오간 대화 (간략 표시) */}
              {open && (
                <div className="px-4 pb-3 bg-bg-primary/40">
                  <ul className="space-y-1.5 text-[11px] leading-relaxed">
                    {s.messages.map((m, j) => {
                      const speaker =
                        m?.user?.name ||
                        (m?.is_ai ? (m?.ai_employee || 'Milo') : '참가자');
                      const content = (m?.content || '').slice(0, 200);
                      const truncated = (m?.content || '').length > 200;
                      return (
                        <li key={m?.id || `msg-${j}`} className="flex gap-2">
                          <span className="text-txt-muted shrink-0 tabular-nums">
                            {safeFormatDate(m?.created_at, 'HH:mm', '')}
                          </span>
                          <span className="text-txt-secondary min-w-0">
                            <span className="text-txt-primary font-medium">
                              {speaker}
                            </span>
                            <span className="text-txt-muted">: </span>
                            <span className="break-words">
                              {content || '(내용 없음)'}
                              {truncated && <span className="text-txt-muted">…</span>}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
