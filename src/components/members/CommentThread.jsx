import { useState, useMemo, useEffect, useRef } from 'react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MoreHorizontal, Edit2, Trash2, Smile, CornerDownRight, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import CommentInput from './CommentInput';
import AttachmentList from './AttachmentList';

// 간단 이모지 리액션 목록
const REACTIONS = ['👍', '❤️', '🎉', '🤔', '👀'];

export default function CommentThread({ comments, members, highlightCommentId = null, onUpdate, onDelete, onReact, onReply, onAcknowledge }) {
  // 상위 댓글만 필터 (parent_id === null)
  const topLevel = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);
  // 답글 그룹핑 (parent_id로)
  const repliesByParent = useMemo(() => {
    const map = new Map();
    comments.forEach((c) => {
      if (c.parent_id) {
        if (!map.has(c.parent_id)) map.set(c.parent_id, []);
        map.get(c.parent_id).push(c);
      }
    });
    return map;
  }, [comments]);

  if (comments.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-xs text-txt-muted">아직 댓글이 없습니다.</p>
        <p className="text-[10px] text-txt-muted mt-1">아래에서 첫 댓글을 남겨보세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topLevel.map((c) => (
        <CommentItem
          key={c.id}
          comment={c}
          replies={repliesByParent.get(c.id) || []}
          members={members}
          highlightCommentId={highlightCommentId}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onReact={onReact}
          onReply={onReply}
          onAcknowledge={onAcknowledge}
        />
      ))}
    </div>
  );
}

function CommentItem({ comment, replies = [], members, highlightCommentId = null, onUpdate, onDelete, onReact, onReply, onAcknowledge, isReply = false }) {
  const { user } = useAuthStore();
  const isMine = user?.id === comment.user_id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const itemRef = useRef(null);
  const [flashing, setFlashing] = useState(false);

  // 하이라이트 대상이면 스크롤 + 플래시
  const isHighlightTarget = highlightCommentId && comment.id === highlightCommentId;
  useEffect(() => {
    if (!isHighlightTarget || !itemRef.current) return;
    // DOM 배치 완료 후 스크롤 (layout shift 대비 약간 지연)
    const t = setTimeout(() => {
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashing(true);
      // 2.5초 후 플래시 종료
      setTimeout(() => setFlashing(false), 2500);
    }, 150);
    return () => clearTimeout(t);
  }, [isHighlightTarget]);

  const timeAgo = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(comment.created_at), { locale: ko, addSuffix: true });
    } catch { return ''; }
  }, [comment.created_at]);

  const author = comment.user || { name: '탈퇴 회원', avatar_color: '#6B6B6B' };

  // 리액션 집계
  const reactions = comment.reactions || {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users?.length > 0);

  // @멘션 하이라이트 (본문에서 @이름 찾아 색상 강조)
  const renderedContent = useMemo(() => {
    if (!comment.content) return null;
    const parts = comment.content.split(/(@[가-힣a-zA-Z0-9_.-]+)/g);
    return parts.map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="text-brand-purple font-semibold">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }, [comment.content]);

  return (
    <div
      ref={itemRef}
      className={`${isReply ? 'pl-6 border-l-2 border-brand-purple/15' : ''} ${
        flashing ? 'comment-highlight-flash rounded-lg' : ''
      }`}
    >
      <div className="flex gap-2.5 group">
        {/* 아바타 */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ backgroundColor: author.avatar_color || '#723CEB' }}
        >
          {author.name?.[0] || '?'}
        </div>

        <div className="flex-1 min-w-0">
          {/* 헤더: 이름 · 시간 · 관리자 배지 */}
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className="text-[13px] font-semibold text-txt-primary">{author.name}</span>
            {author.role === 'admin' && (
              <span className="text-[9px] bg-brand-purple/20 text-brand-purple px-1 py-0.5 rounded font-semibold uppercase tracking-wider">
                Admin
              </span>
            )}
            <span className="text-[10px] text-txt-muted">· {timeAgo}</span>
            {comment.updated_at && (
              <span className="text-[10px] text-txt-muted italic">(수정됨)</span>
            )}
          </div>

          {/* 내용 or 편집 */}
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="w-full bg-bg-tertiary border border-border-subtle rounded-md px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-brand-purple/50 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onUpdate(comment.id, editContent);
                    setEditing(false);
                  }}
                  className="px-3 py-1 bg-brand-purple text-white rounded-md text-[11px] font-semibold hover:opacity-90"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditContent(comment.content);
                  }}
                  className="px-3 py-1 text-txt-muted text-[11px] hover:text-txt-primary"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {comment.content && (
                <div className="text-sm text-txt-primary leading-relaxed whitespace-pre-wrap break-words">
                  {renderedContent}
                </div>
              )}
              {Array.isArray(comment.attachments) && comment.attachments.length > 0 && (
                <AttachmentList attachments={comment.attachments} compact />
              )}
              {/* 확인(ack) 배지 — Slack 버튼 클릭 시 기록 */}
              {Array.isArray(comment.acknowledged_by) && comment.acknowledged_by.length > 0 && (
                <AcknowledgeBadges acks={comment.acknowledged_by} />
              )}
            </div>
          )}

          {/* 리액션 + 액션 버튼 */}
          {!editing && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* 기존 리액션 표시 */}
              {reactionEntries.map(([emoji, users]) => {
                const myReact = users.includes(user?.id);
                return (
                  <button
                    key={emoji}
                    onClick={() => onReact(comment.id, emoji)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                      myReact
                        ? 'bg-brand-purple/15 border-brand-purple/30 text-brand-purple'
                        : 'bg-bg-tertiary border-border-subtle text-txt-secondary hover:border-brand-purple/30'
                    }`}
                  >
                    {emoji} <span className="tabular-nums">{users.length}</span>
                  </button>
                );
              })}

              {/* 리액션 추가 버튼 */}
              <div className="relative">
                <button
                  onClick={() => setReactionOpen((v) => !v)}
                  className="p-1 rounded text-txt-muted hover:bg-bg-tertiary hover:text-txt-primary opacity-0 group-hover:opacity-100 transition-opacity"
                  title="리액션"
                >
                  <Smile size={12} />
                </button>
                {reactionOpen && (
                  <div className="absolute bottom-full left-0 mb-1 bg-bg-secondary border border-border-subtle rounded-md shadow-lg p-1 flex gap-0.5 z-10">
                    {REACTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          onReact(comment.id, e);
                          setReactionOpen(false);
                        }}
                        className="w-7 h-7 hover:bg-bg-tertiary rounded text-sm"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 답글 버튼 (최상위에서만) */}
              {!isReply && (
                <button
                  onClick={() => setReplyOpen((v) => !v)}
                  className="text-[11px] text-txt-muted hover:text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                >
                  <CornerDownRight size={10} />
                  답글
                </button>
              )}

              {/* 확인 버튼 — 본인이 아직 확인 안 했고 본인 댓글이 아닐 때만 */}
              {!isMine && onAcknowledge && !(comment.acknowledged_by || []).some((a) => a.user_id === user?.id) && (
                <button
                  onClick={() => onAcknowledge(comment.id)}
                  className="text-[11px] text-txt-muted hover:text-status-success opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                  title="이 댓글을 확인했다고 표시"
                >
                  <CheckCircle2 size={10} />
                  확인
                </button>
              )}

              {/* 본인 댓글만 수정/삭제 */}
              {isMine && (
                <div className="relative ml-auto">
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    className="p-1 rounded text-txt-muted hover:bg-bg-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                  {menuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 bg-bg-secondary border border-border-subtle rounded-md shadow-lg py-1 z-10 min-w-[100px]"
                      onMouseLeave={() => setMenuOpen(false)}
                    >
                      <button
                        onClick={() => {
                          setEditing(true);
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-txt-primary hover:bg-bg-tertiary"
                      >
                        <Edit2 size={11} /> 수정
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('이 댓글을 삭제하시겠습니까?')) {
                            onDelete(comment.id);
                          }
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 size={11} /> 삭제
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 답글 입력 */}
          {replyOpen && (
            <div className="mt-2">
              <CommentInput
                members={members}
                taskId={comment.task_id}
                placeholder={`@${author.name}에게 답글...`}
                autoFocus
                onSubmit={(content, mentions, attachments) => {
                  onReply?.(comment.id, content, mentions, attachments);
                  setReplyOpen(false);
                }}
                onCancel={() => setReplyOpen(false)}
              />
            </div>
          )}

          {/* 답글 렌더링 */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-3">
              {replies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  members={members}
                  highlightCommentId={highlightCommentId}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onReact={onReact}
                  onAcknowledge={onAcknowledge}
                  isReply
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 댓글 확인 배지 ──
// Slack DM의 "확인했어요" 버튼 클릭 시 기록된 사용자 표시
function AcknowledgeBadges({ acks = [] }) {
  if (!acks || acks.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap pt-1">
      {acks.map((a, i) => {
        let timeLabel = '';
        try {
          if (a.acknowledged_at) {
            timeLabel = format(parseISO(a.acknowledged_at), 'M/d HH:mm', { locale: ko });
          }
        } catch {}
        const title = `${a.user_name || '담당자'}님이 ${timeLabel || ''} 확인함${a.source === 'slack' ? ' (Slack)' : ''}`;
        return (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-status-success/10 text-status-success border border-status-success/25"
            title={title}
          >
            <CheckCircle2 size={10} />
            <span>{a.user_name || '담당자'} 확인</span>
            {timeLabel && <span className="text-status-success/70 text-[9px]">· {timeLabel}</span>}
            {a.source === 'slack' && (
              <span className="text-[9px] text-status-success/70">(Slack)</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
