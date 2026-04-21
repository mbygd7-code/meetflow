import { useState } from 'react';
import { Avatar, Badge } from '@/components/ui';
import { formatTime } from '@/utils/formatters';
import { Sparkles, Copy, Check, Reply, SmilePlus, ThumbsUp, ThumbsDown, Heart, HelpCircle, ExternalLink } from 'lucide-react';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import RichText from './RichText';

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

export default function ChatBubble({ message, currentUserId, onQuote, onReact, onActionClick, reactions = {}, readonly = false }) {
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
    senderName = message.user?.name || '알 수 없음';
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

  return (
    <div
      className={`group/bubble flex gap-3 fade-in ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 아바타 */}
      {isAi ? (
        <MiloAvatar employeeId={employeeId} size="md" showTooltip />
      ) : (
        <Avatar name={senderName} color={senderColor} size="md" />
      )}

      {/* 메시지 컨테이너 */}
      <div className={`flex flex-col max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
        {/* 발신자 정보 — 리액션 있으면 리액션 행에 통합되므로 숨김 */}
        <div className={`flex items-center gap-2 mb-1 text-xs ${isMine ? 'flex-row-reverse' : 'flex-row'} ${hasReactions ? 'hidden' : ''}`}>
          <span className={`font-semibold text-[13px] ${isAi ? 'text-brand-purple-deep' : 'text-txt-secondary'}`}>
            {senderName}
          </span>
          {isAi && (
            <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
              <Sparkles size={10} strokeWidth={2.4} /> AI
            </Badge>
          )}
          {message.source === 'slack' && (
            <Badge variant="outline" className="!px-2 !py-0.5 !text-[10px]">via Slack</Badge>
          )}
          <span className="text-txt-muted">{time}</span>
        </div>

        {/* 말풍선 */}
        <div className="relative">
          {/* 리액션 표시 — 이름+AI+시간 + 리액션 한 줄 */}
          {hasReactions && (
            <div className={`flex items-center gap-2 mb-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
              <span className={`font-semibold text-[13px] ${isAi ? 'text-brand-purple-deep' : 'text-txt-secondary'}`}>
                {senderName}
              </span>
              {isAi && (
                <Badge variant="purple" className="!px-2 !py-0.5 !text-[10px]">
                  <Sparkles size={10} strokeWidth={2.4} /> AI
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
                      <Icon size={14} />
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
            className={`px-4 py-3 text-sm leading-relaxed ${readonly ? '' : 'cursor-pointer'} ${
              isQuestion
                ? 'text-txt-primary bg-brand-orange/10 border border-brand-orange/25 rounded-xl rounded-tl-sm hover:border-brand-orange/40'
                : isAi
                  ? 'text-txt-primary bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm hover:border-brand-purple/40'
                  : isMine
                    ? 'bg-brand-purple text-white rounded-xl rounded-tr-sm hover:opacity-90 whitespace-pre-wrap'
                    : 'text-txt-primary bg-bg-tertiary border border-border-subtle rounded-xl rounded-tl-sm hover:border-border-default whitespace-pre-wrap'
            } transition-all`}
          >
            {/* 질문 표시 */}
            {isQuestion && (
              <div className="flex items-center gap-1.5 mb-2 text-brand-orange">
                <HelpCircle size={14} strokeWidth={2.5} />
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
            {isAi ? <RichText content={displayContent} /> : displayContent}
            {/* 검색 출처 카드 */}
            {isAi && message.search_sources?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-brand-purple/10">
                <p className="text-[10px] text-txt-muted font-medium uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <ExternalLink size={10} /> 참고 자료
                </p>
                <div className="grid gap-2" style={{ gridTemplateColumns: message.search_sources.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))' }}>
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
            )}
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
              {copied ? <Check size={16} className="text-status-success" /> : <Copy size={16} />}
            </button>
            {!readonly && (<>
            <button onClick={(e) => { e.stopPropagation(); handleQuote(); }} className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors" title="인용 답글">
              <Reply size={16} />
            </button>
            {/* 리액션 토글 */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setReactOpen(!reactOpen); }}
                className="p-1.5 text-txt-muted hover:text-brand-purple transition-colors"
                title="반응"
              >
                <SmilePlus size={16} />
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
            </>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
