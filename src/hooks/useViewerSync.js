// useViewerSync — 회의 자료 뷰어 실시간 동기화
//
// 채널: mvw:<meetingId> (meeting-viewer)
// 이벤트:
//   viewer:open   — { fileId, fileName }            : 누군가 자료 열었음
//   viewer:close  — { fileId }                       : 자료 닫음
//   viewer:page   — { fileId, page }                 : PDF 페이지 변경
//   viewer:cursor — { fileId, page, x, y }           : 마우스 좌표 (0~1 정규화)
//
// 페이로드에 자동 첨부: _user = { id, name, color }
//
// 사용:
//   const { broadcast, setHandler, following, setFollowing } = useViewerSync(meetingId);
//   useEffect(() => setHandler('onOpen', (p) => { ... }), []);
//   broadcast('viewer:open', { fileId, fileName });

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

export function useViewerSync(meetingId) {
  const { user } = useAuthStore();
  const channelRef = useRef(null);
  const handlersRef = useRef({});
  // 따라가기 모드 — 다른 사람의 viewer:open / page 변경에 따라 내 화면도 동기화
  //   기본 OFF. 사용자가 명시적으로 켜야 동기화됨 (의도하지 않은 화면 변경 방지)
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(false);
  followingRef.current = following;

  useEffect(() => {
    if (!SUPABASE_ENABLED || !meetingId) return;
    const ch = supabase.channel(`mvw:${meetingId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on('broadcast', { event: 'viewer:open' }, ({ payload }) => {
      handlersRef.current.onOpen?.(payload, followingRef.current);
    });
    ch.on('broadcast', { event: 'viewer:close' }, ({ payload }) => {
      handlersRef.current.onClose?.(payload, followingRef.current);
    });
    ch.on('broadcast', { event: 'viewer:page' }, ({ payload }) => {
      handlersRef.current.onPage?.(payload, followingRef.current);
    });
    ch.on('broadcast', { event: 'viewer:cursor' }, ({ payload }) => {
      // 커서는 follow 여부와 무관하게 항상 수신 (다른 사용자 위치 표시는 항상 유용)
      handlersRef.current.onCursor?.(payload);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      try { supabase.removeChannel(ch); } catch {}
      channelRef.current = null;
    };
  }, [meetingId]);

  const broadcast = useCallback((event, payload) => {
    const ch = channelRef.current;
    if (!ch) return;
    try {
      ch.send({
        type: 'broadcast',
        event,
        payload: {
          ...payload,
          _user: {
            id: user?.id,
            name: user?.name || '참가자',
            color: user?.avatar_color || '#723CEB',
          },
        },
      });
    } catch {}
  }, [user]);

  const setHandler = useCallback((name, fn) => {
    handlersRef.current[name] = fn;
  }, []);

  return { broadcast, setHandler, following, setFollowing };
}
