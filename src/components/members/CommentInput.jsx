import { useState, useRef, useEffect } from 'react';
import { Send, AtSign, X, Loader2, Check } from 'lucide-react';
import { parseMentions } from '@/hooks/useTaskComments';
import { useFileAttach } from '@/hooks/useFileAttach';
import AttachButton from './AttachButton';
import AttachmentList from './AttachmentList';

/**
 * 댓글 입력 컴포넌트
 * - @멘션 자동완성
 * - Enter = 전송 / Shift+Enter = 줄바꿈
 * - 답글/수정 모드 지원
 */
export default function CommentInput({ members = [], onSubmit, onCancel, placeholder, autoFocus, taskId }) {
  const [content, setContent] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);

  // 첨부파일
  const { attachments, uploading, upload, remove, reset } = useFileAttach();

  // 전송 상태
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // 멘션 필터링
  const filteredMembers = members
    .filter((m) =>
      !mentionQuery || m.name?.toLowerCase().includes(mentionQuery.toLowerCase())
    )
    .slice(0, 5);

  const handleChange = (e) => {
    const value = e.target.value;
    setContent(value);

    // 마지막 @가 시작점, 그 뒤 현재 텍스트 파싱
    const caret = e.target.selectionStart;
    const before = value.slice(0, caret);
    const match = before.match(/@([가-힣a-zA-Z0-9_.-]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setShowMention(true);
      setMentionIndex(0);
    } else {
      setShowMention(false);
    }
  };

  const insertMention = (member) => {
    if (!textareaRef.current) return;
    const value = content;
    const caret = textareaRef.current.selectionStart;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const beforeAt = before.replace(/@[가-힣a-zA-Z0-9_.-]*$/, '');
    const newValue = `${beforeAt}@${member.name} ${after}`;
    setContent(newValue);
    setShowMention(false);
    // 커서 위치 조정
    setTimeout(() => {
      const newCaret = beforeAt.length + member.name.length + 2;
      textareaRef.current.setSelectionRange(newCaret, newCaret);
      textareaRef.current.focus();
    }, 0);
  };

  const handleKeyDown = (e) => {
    // 멘션 드롭다운 활성 상태의 키 이벤트
    if (showMention && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMention(false);
        return;
      }
    }

    // 일반 입력
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    // 본문이 없어도 첨부가 있으면 전송 허용
    if (!trimmed && attachments.length === 0) return;
    if (sending) return;  // 중복 전송 방지

    const mentions = parseMentions(trimmed, members);
    setSending(true);
    try {
      const result = await onSubmit?.(trimmed, mentions, attachments);
      // onSubmit이 falsy/null을 반환하면 실패로 간주 (addComment는 실패 시 null 반환)
      if (result === null) {
        // 실패: 내용 유지 → 사용자가 재시도 가능
        return;
      }
      // 성공
      setContent('');
      setShowMention(false);
      reset();
      // 1.8초 성공 표시
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1800);
    } finally {
      setSending(false);
    }
  };

  const handlePickFiles = async (files) => {
    await upload(files, { prefix: `comments/${taskId || 'misc'}` });
  };

  const canSend = (content.trim() || attachments.length > 0) && !sending;

  return (
    <div className="relative">
      <div
        className={`bg-bg-tertiary border rounded-md p-2 focus-within:ring-2 transition-all ${
          sending
            ? 'border-brand-purple/50 ring-2 ring-brand-purple/15 opacity-80'
            : justSent
              ? 'border-status-success/50 ring-2 ring-status-success/15'
              : 'border-border-subtle focus-within:border-brand-purple/50 focus-within:ring-brand-purple/15'
        }`}
      >
        {/* 첨부 미리보기 */}
        {attachments.length > 0 && (
          <div className="mb-2">
            <AttachmentList attachments={attachments} onRemove={remove} compact />
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              sending
                ? '전송 중...'
                : justSent
                  ? '✓ 전송됨!'
                  : placeholder || '댓글 입력... (@ 입력으로 멘션, Enter 전송, 📎 파일 첨부)'
            }
            rows={1}
            disabled={sending}
            className="flex-1 bg-transparent text-sm text-txt-primary placeholder-txt-muted resize-none focus:outline-none min-h-[24px] max-h-32 disabled:opacity-60"
            style={{ height: 'auto' }}
          />
          <div className="flex items-center gap-1 shrink-0">
            <AttachButton onPick={handlePickFiles} uploading={uploading || sending} title="파일 첨부" />
            {onCancel && (
              <button
                onClick={onCancel}
                disabled={sending}
                className="p-1.5 rounded text-txt-muted hover:bg-bg-secondary hover:text-txt-primary disabled:opacity-40"
                title="취소 (Esc)"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSend || uploading || sending}
              className={`p-1.5 rounded text-white disabled:opacity-40 hover:opacity-90 transition-all ${
                justSent ? 'bg-status-success' : 'bg-brand-purple'
              }`}
              title={sending ? '전송 중...' : justSent ? '전송 완료' : '전송 (Enter)'}
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : justSent ? (
                <Check size={14} />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
        </div>

        {/* 전송 상태 표시 바 (상세 안내) */}
        {(sending || justSent) && (
          <div className="mt-1.5 text-[10px] flex items-center gap-1.5">
            {sending ? (
              <>
                <Loader2 size={10} className="animate-spin text-brand-purple" />
                <span className="text-brand-purple">댓글 전송 중...</span>
              </>
            ) : (
              <>
                <Check size={10} className="text-status-success" />
                <span className="text-status-success">댓글이 등록되었어요</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* @멘션 드롭다운 */}
      {showMention && filteredMembers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-bg-secondary border border-border-subtle rounded-md shadow-lg py-1 z-20 min-w-[220px] max-w-xs">
          <div className="flex items-center gap-1 px-3 py-1 text-[10px] text-txt-muted font-medium uppercase tracking-wider border-b border-border-divider">
            <AtSign size={10} /> 멘션할 멤버
          </div>
          {filteredMembers.map((m, i) => (
            <button
              key={m.id}
              onMouseEnter={() => setMentionIndex(i)}
              onClick={() => insertMention(m)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                i === mentionIndex ? 'bg-brand-purple/10' : 'hover:bg-bg-tertiary'
              }`}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: m.avatar_color || '#723CEB' }}
              >
                {m.name?.[0] || '?'}
              </div>
              <span className="text-xs text-txt-primary font-medium truncate">{m.name}</span>
              <span className="text-[10px] text-txt-muted truncate">{m.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
