// useViewerSync — 회의 자료 뷰어 실시간 동기화
//
// 채널: mvw:<meetingId> (meeting-viewer)
// 이벤트:
//   viewer:open         — { fileId, fileName }            : 누군가 자료 열었음
//   viewer:close        — { fileId }                       : 자료 닫음
//   viewer:page         — { fileId, page }                 : PDF 페이지 변경
//   viewer:cursor       — { fileId, page, x, y }           : 마우스 좌표 (0~1, 콘텐츠 박스 기준)
//   viewer:request-sync — { }                              : "현재 라이브 상태 알려줘" 요청
//                                                            (라이브 OFF→ON 전환 시 자동 broadcast)
//   viewer:state        — { fileId, fileName, page }       : "내 현재 상태" 응답
//                                                            (request-sync 받은 라이브 사용자가 broadcast)
//
// 페이로드에 자동 첨부: _user = { id, name, color }
//
// 라이브(following) = 양방향 공유 스위치:
//   ON  → 송신/수신 모두 활성. OFF→ON 전환 시 다른 라이브 사용자에게 현재 상태 받아옴
//   OFF → 송신/수신 모두 차단 (완전 로컬)
//
// 사용:
//   const { broadcast, setHandler, following, setFollowing, setMyViewerState } = useViewerSync(meetingId);
//   useEffect(() => setHandler('onOpen', (p) => { ... }), []);
//   useEffect(() => setHandler('onState', (p) => { ... }), []);  // 동기화 응답 처리
//   broadcast('viewer:open', { fileId, fileName });
//   setMyViewerState({ fileId, fileName, page });  // 내 상태를 hook 에 알림 → request-sync 응답에 사용

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
  // user 는 채널 effect 의 deps 로 두면 user 객체 아이덴티티 변경 시 채널이 재구독되어
  // 이벤트 누락 가능. ref 로 최신 값을 유지하여 채널은 meetingId 만으로 1회 구독.
  const userRef = useRef(user);
  userRef.current = user;
  // 내 현재 뷰어 상태 — request-sync 응답에 사용
  //   { fileId, fileName, page } | null
  const myStateRef = useRef(null);
  const setMyViewerState = useCallback((state) => {
    myStateRef.current = state || null;
  }, []);

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
      // 라이브 OFF 면 수신 차단 — 라이브 = 양방향 공유 스위치 정책 (페이지/오픈/드로잉/커서 동일)
      if (!followingRef.current) return;
      handlersRef.current.onCursor?.(payload);
    });
    // 누군가가 "현재 상태 알려줘" 요청 → 내가 라이브 ON 이고 자료 보고 있으면 응답
    ch.on('broadcast', { event: 'viewer:request-sync' }, () => {
      if (!followingRef.current) return;
      const s = myStateRef.current;
      if (!s?.fileId) return;
      const u = userRef.current;
      // 응답 — broadcast() 가 따로 following 게이트 체크하지만 이미 위에서 통과했으니 OK
      try {
        ch.send({
          type: 'broadcast',
          event: 'viewer:state',
          payload: {
            fileId: s.fileId,
            fileName: s.fileName,
            page: s.page,
            _user: {
              id: u?.id,
              name: u?.name || '참가자',
              color: u?.avatar_color || '#723CEB',
            },
          },
        });
      } catch {}
    });
    // 동기화 응답 수신 — 라이브 ON 일 때만 적용
    ch.on('broadcast', { event: 'viewer:state' }, ({ payload }) => {
      if (!followingRef.current) return;
      handlersRef.current.onState?.(payload);
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
    // 라이브 = 양방향 공유 스위치. OFF면 일체 송신 차단 (open/close/page/cursor 모두)
    //   → 라이브 끄고 혼자 자료 검토할 때 다른 참가자에게 의도치 않은 영향 X
    if (!followingRef.current) return;
    const u = userRef.current;
    try {
      ch.send({
        type: 'broadcast',
        event,
        payload: {
          ...payload,
          _user: {
            id: u?.id,
            name: u?.name || '참가자',
            color: u?.avatar_color || '#723CEB',
          },
        },
      });
    } catch {}
  }, []);

  // 라이브 OFF → ON 전환 시: "현재 라이브 상태 알려줘" 요청
  //   다른 라이브 사용자가 viewer:state 로 응답 → onState 핸들러가 자료 자동 오픈 + 페이지 점프
  const prevFollowingRef = useRef(following);
  useEffect(() => {
    const wasFollowing = prevFollowingRef.current;
    prevFollowingRef.current = following;
    if (!wasFollowing && following) {
      // followingRef.current 는 위에서 동기 갱신되어 이 시점에 true 임 → broadcast 통과
      broadcast('viewer:request-sync', {});
    }
  }, [following, broadcast]);

  const setHandler = useCallback((name, fn) => {
    handlersRef.current[name] = fn;
  }, []);

  return { broadcast, setHandler, following, setFollowing, setMyViewerState };
}
