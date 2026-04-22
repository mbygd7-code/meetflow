import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

/**
 * 태스크 댓글 관리 훅
 * - 댓글 목록 로드 + Realtime 구독
 * - 작성/수정/삭제
 * - @멘션 파싱 (본문에서 user_id 추출)
 * - 리액션 토글
 */
export function useTaskComments(taskId) {
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef(null);

  // 댓글 로드 (작성자 정보 포함)
  const loadComments = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*, user:users(id, name, avatar_color, email, role)')
        .eq('task_id', taskId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setComments(data || []);
    } catch (err) {
      console.error('[useTaskComments] load failed:', err);
      addToast('댓글 로드 실패', 'error');
    } finally {
      setLoading(false);
    }
  }, [taskId, addToast]);

  // 실시간 구독
  useEffect(() => {
    if (!taskId) return;
    loadComments();

    // 기존 채널 제거
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // 새 채널 구독
    const channel = supabase
      .channel(`task_comments:${taskId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${taskId}`,
        },
        async () => {
          // 변경 감지 시 재로드 (간단하게)
          await loadComments();
        }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [taskId, loadComments]);

  // 댓글 작성
  const addComment = useCallback(
    async (content, { parentId = null, mentions = [], attachments = [] } = {}) => {
      const hasAttach = Array.isArray(attachments) && attachments.length > 0;
      if (!content?.trim() && !hasAttach) {
        addToast('댓글 내용이나 첨부파일을 추가해주세요', 'error');
        return null;
      }
      if (!user?.id) {
        addToast('로그인이 필요합니다', 'error');
        return null;
      }
      if (!taskId) {
        addToast('태스크 정보가 없습니다', 'error');
        return null;
      }
      try {
        const { data, error } = await supabase
          .from('task_comments')
          .insert({
            task_id: taskId,
            user_id: user.id,
            parent_id: parentId,
            content: (content || '').trim(),
            mentions,
            attachments,
          })
          .select('*, user:users(id, name, avatar_color, email, role)')
          .single();
        if (error) throw error;
        // 옵티미스틱 (Realtime이 지연될 수 있음)
        setComments((prev) => {
          if (prev.some((c) => c.id === data.id)) return prev;
          return [...prev, data];
        });

        // Slack 알림 (담당자 + 작성자 본인 모두 DM) — fire-and-forget
        // 팀·직원 관리 모달에서 등록된 users.slack_user_id 를 사용
        // 같은 사람(담당자==작성자)이면 DM 1개만 발송 (중복 제거)
        try {
          const { data: task } = await supabase
            .from('tasks')
            .select('id, title, assignee_id, created_by')
            .eq('id', taskId)
            .maybeSingle();

          // 수신 대상: 담당자 + 작성자 본인
          const recipientIds = new Set();
          if (task?.assignee_id) recipientIds.add(task.assignee_id);
          if (user?.id) recipientIds.add(user.id);

          if (recipientIds.size > 0) {
            const { data: recipients } = await supabase
              .from('users')
              .select('id, name, slack_user_id')
              .in('id', [...recipientIds]);

            // slack_user_id 기준으로 중복 제거
            const slackIdMap = new Map();
            (recipients || []).forEach((r) => {
              if (r.slack_user_id) slackIdMap.set(r.slack_user_id, r);
            });

            // 담당자 정보 (팀 채널 broadcast용)
            const assigneeInfo = (recipients || []).find((r) => r.id === task?.assignee_id);

            if (slackIdMap.size === 0) {
              console.log('[slack-notify] task_comment 스킵 — 모든 수신자가 Slack ID 미등록');
            } else {
              for (const [slackId, recipient] of slackIdMap) {
                const isSelf = recipient.id === user.id;
                const isAssignee = recipient.id === task?.assignee_id;
                const role = isSelf && isAssignee ? '담당자(본인)'
                  : isSelf ? '작성자(본인)'
                  : '담당자';
                console.log(`[slack-notify] task_comment → ${role} DM:`, recipient.name, slackId);

                supabase.functions.invoke('slack-notify', {
                  body: {
                    event: 'task_comment',
                    payload: {
                      assignee_slack_id: slackId,
                      task_title: task.title,
                      task_id: task.id,
                      comment_id: data.id,  // 확인 버튼용
                      commenter_name: user.name || user.email || '누군가',
                      content: (content || '').trim() || (hasAttach ? `📎 첨부파일 ${attachments.length}개` : ''),
                      attachment_count: attachments.length,
                      recipient_role: role,
                    },
                  },
                })
                  .then(({ data, error }) => {
                    if (error) {
                      console.warn(`[slack-notify] ${role} Edge 에러:`, error);
                    } else if (data && !data.ok) {
                      console.warn(`[slack-notify] ${role} Slack API 에러:`, data.error);
                    } else if (data && data.ok) {
                      console.log(`[slack-notify] ${role} 발송 성공:`, slackId);
                    }
                  })
                  .catch((e) => console.warn(`[slack-notify] ${role} 예외:`, e));
              }
            }

            // 팀 채널 broadcast (개인 DM과 별개로 1회)
            console.log('[slack-notify] task_comment_broadcast → 팀 채널');
            supabase.functions.invoke('slack-notify', {
              body: {
                event: 'task_comment_broadcast',
                payload: {
                  task_id: task?.id,
                  task_title: task?.title,
                  comment_id: data.id,
                  assignee_slack_id: assigneeInfo?.slack_user_id || null,
                  assignee_name: assigneeInfo?.name || null,
                  commenter_name: user.name || user.email || '누군가',
                  content: (content || '').trim() || (hasAttach ? `📎 첨부파일 ${attachments.length}개` : ''),
                  attachment_count: attachments.length,
                },
              },
            }).catch((e) => console.warn('[slack-notify] task_comment_broadcast 예외:', e));
          }
        } catch (slackErr) {
          console.warn('[addComment] Slack 알림 실패:', slackErr);
        }

        return data;
      } catch (err) {
        console.error('[addComment] 실패:', err);
        const msg = err.message || err.hint || String(err);
        if (msg.includes('task_comments') && msg.includes('does not exist')) {
          addToast('댓글 테이블이 없습니다. 017 마이그레이션을 실행해주세요', 'error');
        } else if (err.code === '42501' || msg.includes('row-level security')) {
          addToast('권한이 없습니다 (RLS)', 'error');
        } else {
          addToast('댓글 작성 실패: ' + msg, 'error');
        }
        return null;
      }
    },
    [taskId, user, addToast]
  );

  // 댓글 수정
  const updateComment = useCallback(
    async (commentId, content) => {
      if (!content?.trim()) return;
      try {
        const { error } = await supabase
          .from('task_comments')
          .update({ content: content.trim(), updated_at: new Date().toISOString() })
          .eq('id', commentId);
        if (error) throw error;
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, content: content.trim(), updated_at: new Date().toISOString() } : c
          )
        );
      } catch (err) {
        console.error('[updateComment]', err);
        addToast('수정 실패: ' + err.message, 'error');
      }
    },
    [addToast]
  );

  // 댓글 삭제 (soft delete)
  const deleteComment = useCallback(
    async (commentId) => {
      try {
        const { error } = await supabase
          .from('task_comments')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', commentId);
        if (error) throw error;
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        console.error('[deleteComment]', err);
        addToast('삭제 실패: ' + err.message, 'error');
      }
    },
    [addToast]
  );

  // 리액션 토글
  const toggleReaction = useCallback(
    async (commentId, emoji) => {
      if (!user?.id) return;
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;
      const current = comment.reactions || {};
      const users = current[emoji] || [];
      const hasReacted = users.includes(user.id);
      const newUsers = hasReacted ? users.filter((u) => u !== user.id) : [...users, user.id];
      const newReactions = { ...current };
      if (newUsers.length === 0) delete newReactions[emoji];
      else newReactions[emoji] = newUsers;
      // 옵티미스틱
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, reactions: newReactions } : c))
      );
      try {
        const { error } = await supabase
          .from('task_comments')
          .update({ reactions: newReactions })
          .eq('id', commentId);
        if (error) throw error;
      } catch (err) {
        console.error('[toggleReaction]', err);
        // 롤백
        setComments((prev) => prev.map((c) => (c.id === commentId ? comment : c)));
      }
    },
    [comments, user]
  );

  // 댓글 확인(ack) — 웹에서 직접 표시
  const acknowledgeComment = useCallback(
    async (commentId) => {
      if (!user?.id) return;
      const target = comments.find((c) => c.id === commentId);
      if (!target) return;
      const existing = Array.isArray(target.acknowledged_by) ? target.acknowledged_by : [];
      if (existing.some((a) => a.user_id === user.id)) return; // 이미 확인함
      const newEntry = {
        user_id: user.id,
        user_name: user.name || user.email,
        acknowledged_at: new Date().toISOString(),
        source: 'web',
      };
      const updated = [...existing, newEntry];
      // 옵티미스틱
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, acknowledged_by: updated } : c)));
      try {
        const { error } = await supabase
          .from('task_comments')
          .update({ acknowledged_by: updated })
          .eq('id', commentId);
        if (error) throw error;
      } catch (err) {
        console.error('[acknowledgeComment]', err);
        // 롤백
        setComments((prev) => prev.map((c) => (c.id === commentId ? target : c)));
        addToast('확인 처리 실패: ' + err.message, 'error');
      }
    },
    [comments, user, addToast]
  );

  return { comments, loading, addComment, updateComment, deleteComment, toggleReaction, acknowledgeComment, reload: loadComments };
}

// @멘션 파싱: "@이름 내용" → mentions 배열 추출
// 간단 구현: @이름 형태를 users 목록에서 매칭
export function parseMentions(content, users) {
  if (!content || !users?.length) return [];
  const mentionPattern = /@([가-힣a-zA-Z0-9_.-]+)/g;
  const matches = [...content.matchAll(mentionPattern)];
  const mentionedIds = new Set();
  for (const m of matches) {
    const name = m[1];
    const user = users.find((u) => u.name === name || u.email?.split('@')[0] === name);
    if (user) mentionedIds.add(user.id);
  }
  return [...mentionedIds];
}
