import { useState } from 'react';
import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles, Copy, Check, Reply, SmilePlus, ThumbsUp, ThumbsDown, Heart, HelpCircle, ExternalLink } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import RichText from './RichText';
import FeedbackButtons from './FeedbackButtons';

const NAME_TO_ID = {};
AI_EMPLOYEES.forEach((e) => {
  NAME_TO_ID[e.nameKo] = e.id;
  NAME_TO_ID[e.name.toLowerCase()] = e.id;
});

function detectAiEmployee(message) {
  if (message.ai_employee) return message.ai_employee;
  const match = message.content?.match(/^\[([\u3131-\uD79D\w]+)\]/);
  if (match) {
    const id = NAME_TO_ID[match[1]] || NAME_TO_ID[match[1].toLowerCase()];
    if (id) return id;
  }
  return 'milo';
}

const REACTIONS = [
  { key: 'like', icon: ThumbsUp, label: '좋아요' },
  { key: 'dislike', icon: ThumbsDown, label: '별로예요' },
  { key: 'heart', icon: Heart, label: '하트' },
];

// AI 메시지에서 선택 가능한 액션 항목 추출
// 다양한 형태의 번호/리스트를 모두 감지
function extractActionItems(content) {
  if (!content) return [];

  // 질문/선택 요청이 있는지 먼저 확인
  const hasQuestion = /할까요|하시겠|선택해|골라|확인해|진행할|어느|어떤.*할|중\s.*선택|명시되면|알려주|우선순위/i.test(content);
  if (!hasQuestion) return [];

  const items = [];
  let match;

  // 순서대로 시도 — 첫 번째 매칭되는 패턴 사용
  const patterns = [
    // "N단계: 제목"
    { re: /(\d+단계)\s*[:：]\s*(.+?)(?=\n|$)/g, fmt: (m) => ({ label: m[1], title: m[2] }) },
    // "① 제목" "② 제목" (원형 번호)
    { re: /([①②③④⑤⑥⑦⑧⑨⑩])\s*(.+?)(?=\n|$)/g, fmt: (m) => ({ label: m[1], title: m[2] }) },
    // "N) 제목" or "(N) 제목"
    { re: /\(?(\d+)\)\s*(.+?)(?=\n|$)/g, fmt: (m) => ({ label: `${m[1]}`, title: m[2] }) },
    // "N. **제목**: 설명" or "N. 제목: 설명"
    { re: /^\s*(\d+)\.\s+\**([^*:\n]+?)\**\s*[:：]/gm, fmt: (m) => ({ label: `${m[1]}`, title: m[2] }) },
    // "N. 제목" (줄 시작, 콜론 없이)
    { re: /^\s*(\d+)\.\s+\**(.+?)\**\s*(?=\n|$)/gm, fmt: (m) => ({ label: `${m[1]}`, title: m[2] }) },
    // "- 제목" 불릿 리스트 (최소 2개)
    { re: /^\s*[-•]\s+(.+?)(?=\n|$)/gm, fmt: (m, i) => ({ label: `${i + 1}`, title: m[1] }) },
  ];

  for (const { re, fmt } of patterns) {
    re.lastIndex = 0;
    const found = [];
    let idx = 0;
    while ((match = re.exec(content)) !== null) {
      const item = fmt(match, idx);
      const title = item.title.trim().replace(/\*\*/g, '').replace(/^\s*[-•]\s*/, '');
      // 너무 긴 설명이나 빈 항목 제외
      if (title && title.length > 1 && title.length < 60) {
        found.push({ ...item, title });
      }
      idx++;
    }
    if (found.length >= 2) {
      items.push(...found.slice(0, 6)); // 최대 6개
      break;
    }
  }

  return items;
}

export default function ChatBubble({ message, currentUserId, onQuote, onReact, onActionClick, onMention, reactions = {}, readonly = false }) {
  const [copied, setCopied] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const isAi = message.is_ai;
  const isMine = !isAi && message.user_id === currentUserId;

  const employeeId = isAi ? detectAiEmployee(message) : null;
  const emp = employeeId ? AI_EMPLOYEES.find((e) => e.id === employeeId) : null;

  let senderName;
  if (isAi) {
    senderName = emp?.nameKo || emp?.name || message.user?.name || 'Milo';
  } else {
    // user JOIN이 실패한 경우(삭제된 사용자 / public.users 동기화 누락):
    // 우선순위: user.name > email 앞부분 > user_id 앞 4자리 > '알수없음'
    // "손님"은 혼동을 주므로 사용하지 않음 (실제 이름과 겹칠 수 있음)
    const emailPrefix = message.user?.email?.split('@')[0];
    const idSuffix = message.user_id ? message.user_id.slice(0, 4) : null;
    senderName =
      message.user?.name ||
      emailPrefix ||
      (idSuffix ? `사용자 ${idSuffix}` : '알수없음');
  }

  const senderColor = message.user?.color || message.user?.avatar_color || '#723CEB';
  const time = formatTime(message.created_at);
  const isQuestion = isAi && message.ai_type === 'question';

  const rawContent = isAi
    ? message.content?.replace(/^\[[\u3131-\uD79D\w]+\]\s*/, '')
    : message.content;

  // 인용문 파싱: [quote:이름]내용[/quote]\n본문
  const quoteMatch = rawContent?.match(/^\[quote:(.+?)\]([\s\S]*?)\[\/quote\]\n?([\s\S]*)$/);
  // 레거시 호환: > 이름: 내용\n\n본문
  const legacyMatch = !quoteMatch && rawContent?.match(/^>\s*(.+?):\s*(.+?)(?:\n\n)([\s\S]*)$/);
  const match = quoteMatch || legacyMatch;
  const quotedSender = match?.[1];
  const quotedText = match?.[2]?.trim();
  const displayContent = match ? match[3] : rawContent;

  const handleCopy = (e) => {
    e.stopPropagation();
    const textToCopy = displayContent || rawContent || message.content || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {
        // fallback: textarea 방식
        const ta = document.createElement('textarea');
        ta.value = textToCopy;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  const handleQuote = () => {
    onQuote?.({ senderName, content: displayContent, messageId: message.id });
  };

  const handleReact = (key) => {
    onReact?.(message.id, key);
    setReactOpen(false);
  };

  // 이 메시지의 리액션 집계
  const msgReactions = reactions[message.id] || {};
  const hasReactions = Object.values(msgReactions).some((v) => v?.count > 0);

  // 아바타 엘리먼트 (헤더 인라인용) — AI 는 MiloAvatar, 사람은 클릭 가능한 Avatar
  const avatarEl = isAi ? (
    <MiloAvatar employeeId={employeeId} size="sm" showTooltip />
  ) : (
    <button
      type="button"
      onClick={() => {
        if (isMine || readonly) return;
        onMention?.(senderName);
      }}
      disabled={isMine || readonly}
      className={`shrink-0 rounded-full transition-transform ${
        isMine || readonly
          ? 'cursor-default'
          : 'hover:scale-110 cursor-pointer'
      }`}
      title={isMine ? '나' : `@${senderName} 멘션하기`}
      aria-label={isMine ? '내 아바타' : `${senderName}님 멘션`}
    >
      <Avatar name={senderName} color={senderColor} size="sm" />
    </button>
  );

  return (
    <div
      className={`group/bubble flex flex-col fade-in ${isMine ? 'items-end' : 'items-start'}`}
      onMouseLeave={() => setReactOpen(false)}
    >
      {/* 메시지 컨테이너 — 아바타가 이름 옆 인라인으로 배치됨 */}
      <div className={`flex flex-col max-w-[85%] ${isMine ? 'items-end' : 'items-start'}`}>
        {/* 헤더: [아바타] [이름] [AI 배지] [시간] — 사람 리액션 있으면 리액션 행에 통합되므로 숨김 */}
        <div className={`flex items-center gap-2 mb-1 text-xs ${isMine ? 'flex-row-reverse' : 'flex-row'} ${(hasReactions && !isAi) ? 'hidden' : ''}`}>
          {avatarEl}
          <span className={`font-semibold text-[13px] ${isAi ? 'text-brand-purple-deep' : 'text-txt-secondary'}`}>
            {senderName}
          </span>
          {isAi && (
            <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
              <Sparkles size={12} strokeWidth={2.4} /> AI
            </Badge>
          )}
          {message.source === 'slack' && (
            <Badge variant="outline" className="!px-2 !py-0.5 !text-[10px]">via Slack</Badge>
          )}
          <span className="text-txt-muted">{time}</span>
        </div>

        {/* 말풍선 */}
        <div className="relative">
          {/* 리액션 표시 — 아바타+이름+시간 + 리액션 한 줄 (AI 메시지는 리액션 비활성) */}
          {hasReactions && !isAi && (
            <div className={`flex items-center gap-2 mb-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
              {avatarEl}
              <span className={`font-semibold text-[13px] ${isAi ? 'text-brand-purple-deep' : 'text-txt-secondary'}`}>
                {senderName}
              </span>
              {isAi && (
                <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
                  <Sparkles size={12} strokeWidth={2.4} /> AI
                </Badge>
              )}
              <span className="text-txt-muted text-xs">{time}</span>
              <div className={`flex gap-1.5 ${isMine ? 'mr-auto' : 'ml-auto'}`}>
                {REACTIONS.map(({ key, icon: Icon }) => {
                  const data = msgReactions[key];
                  if (!data?.count) return null;
                  return (
                    <span
                      key={key}
                      className="group/react relative inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-bg-tertiary border border-border-subtle text-txt-secondary cursor-default"
                    >
                      <Icon size={16} />
                      {data.count}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md text-[10px] whitespace-nowrap bg-bg-primary border border-border-subtle shadow-md opacity-0 pointer-events-none group-hover/react:opacity-100 transition-opacity z-10">
                        {data.users.join(', ')}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div
            onClick={readonly ? undefined : handleQuote}
            className={`relative px-4 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere] ${readonly ? '' : 'cursor-pointer'} ${
              isQuestion
                ? 'text-txt-primary bg-brand-orange/10 border border-brand-orange/25 rounded-xl rounded-tl-sm hover:border-brand-orange/40'
                : isAi
                  ? 'text-txt-primary bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm hover:border-brand-purple/40'
                  : isMine
                    ? 'bg-brand-purple text-white rounded-xl rounded-tr-sm hover:opacity-90 whitespace-pre-wrap'
                    : 'text-txt-primary bg-bg-tertiary border border-border-subtle rounded-xl rounded-tl-sm hover:border-border-default whitespace-pre-wrap'
            } transition-all`}
          >
            {/* AI 피드백 버튼 — 말풍선 위에 떠있는 floating pill (말풍선과 겹치지 않음) */}
            {isAi && !readonly && message.id && !String(message.id).startsWith('m-local-') && !String(message.id).startsWith('stream-') && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-full right-2 mb-2 z-10 flex items-center"
                title="이 답변에 대한 피드백"
              >
                <FeedbackButtons messageId={message.id} />
              </div>
            )}
            {/* 질문 표시 */}
            {isQuestion && (
              <div className="flex items-center gap-1.5 mb-2 text-brand-orange">
                <HelpCircle size={16} strokeWidth={2.5} />
                <span className="text-[11px] font-semibold uppercase tracking-wider">질문</span>
              </div>
            )}
            {/* 인용 블록 — 클릭 시 전체 펼침/접힘 */}
            {quotedSender && (
              <div
                onClick={(e) => { e.stopPropagation(); setQuoteExpanded((v) => !v); }}
                className={`mb-2 pl-3 py-1.5 text-xs leading-relaxed rounded-md border-l-2 border-brand-purple/40 cursor-pointer hover:border-brand-purple/60 transition-colors ${
                  isMine ? 'text-txt-primary' : ''
                }`}
                style={{
                  background:
                    'linear-gradient(rgb(var(--brand-purple-rgb) / 0.1), rgb(var(--brand-purple-rgb) / 0.1)), color-mix(in srgb, var(--bg-content), transparent 20%)',
                }}
                title={quoteExpanded ? '접기' : '전체 보기'}
              >
                <span className="font-semibold">{quotedSender}</span>
                <p className={`mt-0.5 opacity-80 whitespace-pre-wrap ${quoteExpanded ? '' : 'line-clamp-2'}`}>
                  {quotedText}
                </p>
              </div>
            )}
            {isAi ? (
              <>
                <RichText content={displayContent} />
                {message.is_streaming && (
                  <span
                    className="inline-block align-baseline w-[2px] h-[1em] ml-0.5 bg-brand-purple animate-pulse"
                    aria-hidden
                  />
                )}
              </>
            ) : displayContent}
            {/* 검색 출처 카드 — 이미지 검색이면 갤러리 모드, 아니면 웹 카드 모드 */}
            {isAi && message.search_sources?.length > 0 && (() => {
              // 이미지 검색 모드 감지:
              //   - message.search_mode === 'image' (Edge Function에서 전달)
              //   - 또는 모든 src.url이 이미지 확장자 (.jpg/.png/.gif/.webp/.jpeg)
              //   - 또는 과반이 썸네일 + 이미지 URL
              const imageUrlPattern = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i;
              const imageUrlCount = message.search_sources.filter(
                (s) => imageUrlPattern.test(s.url || '')
              ).length;
              const isImageMode =
                message.search_mode === 'image' ||
                imageUrlCount >= Math.ceil(message.search_sources.length / 2);

              if (isImageMode) {
                // ── 이미지 갤러리 모드 ──
                return (
                  <div className="mt-3 pt-3 border-t border-brand-purple/10">
                    <p className="text-[10px] text-txt-muted font-medium uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <ExternalLink size={12} /> 이미지 결과 ({message.search_sources.length})
                    </p>
                    <div
                      className="grid gap-2"
                      style={{
                        gridTemplateColumns:
                          message.search_sources.length === 1
                            ? '1fr'
                            : message.search_sources.length === 2
                              ? 'repeat(2, 1fr)'
                              : 'repeat(auto-fill, minmax(140px, 1fr))',
                      }}
                    >
                      {message.search_sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/img relative block rounded-lg overflow-hidden bg-bg-tertiary border border-border-subtle hover:border-brand-purple/40 hover:shadow-lg transition-all"
                          onClick={(e) => e.stopPropagation()}
                          title={src.title || '이미지 원본 보기'}
                        >
                          <img
                            src={src.thumbnail || src.url}
                            alt={src.title || ''}
                            loading="lazy"
                            className="w-full h-32 object-cover group-hover/img:scale-[1.03] transition-transform duration-300"
                            onError={(e) => {
                              // 썸네일 실패 시 원본 이미지로 재시도
                              if (src.thumbnail && e.target.src === src.thumbnail) {
                                e.target.src = src.url;
                              } else {
                                e.target.style.display = 'none';
                                e.target.parentElement.classList.add('bg-bg-tertiary');
                              }
                            }}
                          />
                          {src.title && (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 py-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                              <p className="text-[10px] text-white line-clamp-2 leading-snug">
                                {src.title}
                              </p>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              }

              // ── 기존 웹 카드 모드 ──
              return (
                <div className="mt-3 pt-3 border-t border-brand-purple/10">
                  <p className="text-[10px] text-txt-muted font-medium uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <ExternalLink size={12} /> 참고 자료
                  </p>
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns:
                        message.search_sources.length === 1
                          ? '1fr'
                          : 'repeat(auto-fill, minmax(180px, 1fr))',
                    }}
                  >
                    {message.search_sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg overflow-hidden bg-bg-tertiary/60 border border-border-subtle hover:border-brand-purple/30 hover:shadow-md transition-all group/src"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {src.thumbnail && (
                          <div className="w-full h-24 overflow-hidden bg-bg-tertiary">
                            <img
                              src={src.thumbnail}
                              alt=""
                              className="w-full h-full object-cover group-hover/src:scale-105 transition-transform duration-300"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                        )}
                        <div className="px-2.5 py-2">
                          <p className="text-[11px] font-medium text-txt-primary line-clamp-2 leading-snug group-hover/src:text-brand-purple transition-colors">
                            {src.title}
                          </p>
                          <div className="flex items-center gap-1 mt-1.5">
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${src.url?.replace(/^https?:\/\//, '').split('/')[0]}&sz=16`}
                              alt=""
                              className="w-3 h-3 rounded-sm"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <p className="text-[9px] text-txt-muted truncate">
                              {src.url?.replace(/^https?:\/\//, '').split('/')[0]}
                            </p>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
          {/* AI 액션 버튼 (단계 선택) */}
          {isAi && !readonly && (() => {
            const actions = extractActionItems(displayContent);
            if (actions.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      onActionClick?.(`${action.title} 선택합니다. 바로 진행해주세요`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-brand-purple/30 bg-white/50 text-txt-primary hover:bg-white/70 hover:border-brand-purple/50 transition-all shadow-sm backdrop-blur-sm"
                  >
                    <span className="w-5 h-5 rounded-full bg-brand-purple text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                    {action.title.length > 20 ? action.title.slice(0, 20) + '…' : action.title}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* 호버 액션 */}
          <div className="flex items-center gap-2 mt-1.5 justify-end opacity-0 group-hover/bubble:opacity-100 transition-opacity">
            <div className="flex gap-1.5">
            <button onClick={handleCopy} className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors" title="복사">
              {copied ? <Check size={18} className="text-status-success" /> : <Copy size={18} />}
            </button>
            {!readonly && (<>
            <button onClick={(e) => { e.stopPropagation(); handleQuote(); }} className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors" title="인용 답글">
              <Reply size={18} />
            </button>
            {/* 리액션 토글 — AI 메시지에는 노출하지 않음 (피드백 버튼으로 대체) */}
            {!isAi && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setReactOpen(!reactOpen); }}
                className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors"
                title="반응"
              >
                <SmilePlus size={18} />
              </button>
              {reactOpen && (
                <div className="absolute bottom-full right-0 mb-1 flex gap-1 px-2 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle shadow-md z-10">
                  {REACTIONS.map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={(e) => { e.stopPropagation(); handleReact(key); }}
                      className="p-1.5 rounded-md hover:bg-bg-tertiary text-txt-muted hover:text-txt-primary transition-colors"
                      title={label}
                    >
                      <Icon size={18} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
            </>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
