// useLiveKitVoice — 회의방 실시간 음성 통화
//
// 책임:
//   1) Edge Function `livekit-token` 으로 토큰 발급
//   2) Room 객체 생성·연결·이벤트 구독
//   3) 마이크 publish + 음소거 토글 + 본인 MediaStream 노출 (STT 와 공유)
//   4) 활성 화자 / 참가자 목록 / 본인 마이크 상태를 React state 로 노출
//   5) 모바일(iOS Safari) startAudio() 자동 호출 — 사용자 제스처(join 클릭)와 연동
//
// 사용:
//   const {
//     connected, connecting, error,
//     participants, activeSpeakers, muted,
//     localStream, // STT 와 공유할 MediaStream — useVoiceInput 에 전달
//     join, leave, toggleMute,
//   } = useLiveKitVoice(meetingId);
//
// 설계 원칙:
//   - meetingId 가 바뀌어도 자동 재연결 X — 사용자가 명시적으로 join 해야 룸 진입
//     (의도하지 않게 모든 회의방에서 음성이 켜지는 사고 방지)
//   - 회의방 언마운트 시 자동 leave (cleanup)

import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, ConnectionState } from 'livekit-client';
import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

// ParticipantConnected/Disconnected 시 setParticipants 호출에 쓰는 기본 형태
function describeParticipant(p) {
  let metadata = {};
  try { metadata = p.metadata ? JSON.parse(p.metadata) : {}; } catch {}
  return {
    identity: p.identity,
    name: p.name || metadata?.name || '참가자',
    isLocal: !!p.isLocal,
    avatar_color: metadata?.avatar_color || null,
    isMuted: isMicrophoneMuted(p),
  };
}

function isMicrophoneMuted(p) {
  // Track.Source.Microphone publication 의 isMuted 또는 publication 자체 부재
  try {
    const pub = p.getTrackPublication?.(Track.Source.Microphone);
    if (!pub) return true; // publish 안 됨 = 음소거 상태로 간주
    return !!pub.isMuted;
  } catch {
    return true;
  }
}

export function useLiveKitVoice(meetingId) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [participants, setParticipants] = useState([]); // local + remote 모두 포함
  const [activeSpeakers, setActiveSpeakers] = useState(new Set()); // identity 집합
  const [muted, setMuted] = useState(true); // 초기는 mute (안전 — join 즉시 들리지 않게)
  const [localStream, setLocalStream] = useState(null);
  // Push-to-Talk 모드 — true 면 평상시 mute, 스페이스바 누르고 있을 때만 unmute
  //   같은 방에서 2명 이상 참여 시 하울링 방지에 유용
  const [pttMode, setPttMode] = useState(false);
  const [pttPressed, setPttPressed] = useState(false); // PTT 키 누르고 있는 중

  const roomRef = useRef(null);
  // 원격 오디오 트랙별 <audio> 엘리먼트 — Map<`${identity}:${trackSid}`, HTMLAudioElement>
  //   leave/언마운트 시 일괄 정리
  const audioContainersRef = useRef(new Map());

  // 참가자 목록을 Room 으로부터 새로 빌드
  const rebuildParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setParticipants([]);
      return;
    }
    const list = [];
    if (room.localParticipant) list.push(describeParticipant(room.localParticipant));
    // remoteParticipants 는 v2 SDK 에서 Map
    room.remoteParticipants?.forEach?.((rp) => list.push(describeParticipant(rp)));
    setParticipants(list);
  }, []);

  // === LiveKit 토큰 발급 ===
  // 인증된 세션 JWT 를 명시적으로 Authorization 헤더에 첨부 — supabase-js 의 자동 첨부가
  //   --no-verify-jwt 로 배포된 함수에선 누락되는 케이스가 있어 발생하는 401 회피.
  const fetchToken = useCallback(async () => {
    if (!SUPABASE_ENABLED) throw new Error('SUPABASE_DISABLED');
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error('not_signed_in');
    }
    const { data, error: fnError } = await supabase.functions.invoke('livekit-token', {
      body: { meetingId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (fnError) throw new Error(fnError.message || 'token_failed');
    if (!data?.token || !data?.url) throw new Error('invalid_token_response');
    return data; // { token, url, identity, name, ttl }
  }, [meetingId]);

  // === 룸 입장 ===
  const join = useCallback(async () => {
    if (roomRef.current) {
      console.warn('[useLiveKitVoice] already connected');
      return;
    }
    if (!meetingId) throw new Error('meetingId_required');
    setConnecting(true);
    setError(null);
    try {
      const { token, url } = await fetchToken();

      const room = new Room({
        adaptiveStream: true,        // 네트워크 따라 비트레이트 자동 조정
        dynacast: true,              // 보고있는 사람만 publish (대규모 효율)
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 이벤트 구독 — 한 번만, 이후 disconnect 시 removeAllListeners 로 정리
      room.on(RoomEvent.ParticipantConnected, () => rebuildParticipants());
      room.on(RoomEvent.ParticipantDisconnected, () => rebuildParticipants());
      room.on(RoomEvent.TrackPublished, () => rebuildParticipants());
      room.on(RoomEvent.TrackUnpublished, () => rebuildParticipants());
      room.on(RoomEvent.TrackMuted, () => rebuildParticipants());
      room.on(RoomEvent.TrackUnmuted, () => rebuildParticipants());
      room.on(RoomEvent.LocalTrackPublished, () => {
        rebuildParticipants();
        // local 마이크 published → muted 상태 동기화
        const pub = room.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
        setMuted(!!pub?.isMuted);
        // STT 공유용 MediaStream 추출
        const track = pub?.track;
        if (track?.mediaStreamTrack) {
          setLocalStream(new MediaStream([track.mediaStreamTrack]));
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, () => {
        rebuildParticipants();
        setLocalStream(null);
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const set = new Set(speakers.map((s) => s.identity));
        setActiveSpeakers(set);
      });

      // ★ 원격 오디오 트랙 자동 재생 — LiveKit SDK 는 자동 attach 하지 않음
      //   TrackSubscribed 시 audio 엘리먼트 만들어 DOM 에 부착해야 들림
      const audioElsRef = audioContainersRef.current;
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        try {
          const el = track.attach();
          el.setAttribute('data-livekit-audio', participant.identity);
          el.style.display = 'none';
          document.body.appendChild(el);
          audioElsRef.set(`${participant.identity}:${track.sid}`, el);
        } catch (e) {
          console.warn('[useLiveKitVoice] track.attach failed:', e?.message);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const key = `${participant.identity}:${track.sid}`;
        const el = audioElsRef.get(key);
        if (el) {
          try { track.detach(el); } catch {}
          el.remove();
          audioElsRef.delete(key);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setActiveSpeakers(new Set());
        setParticipants([]);
        setLocalStream(null);
      });
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Connected) setConnected(true);
        if (state === ConnectionState.Disconnected) setConnected(false);
      });

      // 연결
      await room.connect(url, token, { autoSubscribe: true });
      roomRef.current = room;
      setConnected(true);

      // iOS Safari autoplay: room.startAudio() 사용자 제스처 컨텍스트에서 호출
      try { await room.startAudio(); } catch { /* 일부 브라우저에서 throw 가능 — 무시 */ }

      // 마이크 publish — 초기는 mute 상태로
      //   (사용자가 큰 마이크 버튼으로 unmute 하기 전엔 들리지 않음 → 안전)
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        // 즉시 음소거
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (pub) {
          await pub.mute();
          setMuted(true);
        }
      } catch (micErr) {
        console.warn('[useLiveKitVoice] mic publish failed:', micErr?.message);
        // 권한 거부 등 → 룸은 연결돼 있고 듣기만 가능 (다른 사람 음성 듣기)
      }

      rebuildParticipants();
    } catch (e) {
      console.error('[useLiveKitVoice] join failed:', e);
      setError(e?.message || String(e));
      try { await roomRef.current?.disconnect(); } catch {}
      roomRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, [meetingId, fetchToken, rebuildParticipants]);

  // 원격 오디오 엘리먼트 일괄 정리
  const cleanupAudioElements = useCallback(() => {
    audioContainersRef.current.forEach((el) => {
      try { el.pause(); } catch {}
      try { el.remove(); } catch {}
    });
    audioContainersRef.current.clear();
  }, []);

  // === 룸 퇴장 ===
  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try { await room.disconnect(); } catch {}
    try { room.removeAllListeners(); } catch {}
    roomRef.current = null;
    cleanupAudioElements();
    setConnected(false);
    setActiveSpeakers(new Set());
    setParticipants([]);
    setLocalStream(null);
  }, [cleanupAudioElements]);

  // === 음소거 토글 ===
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (!pub) {
        // publication 없으면 publish 부터
        await room.localParticipant.setMicrophoneEnabled(true);
        setMuted(false);
        return;
      }
      if (pub.isMuted) {
        await pub.unmute();
        setMuted(false);
      } else {
        await pub.mute();
        setMuted(true);
      }
    } catch (e) {
      console.error('[useLiveKitVoice] toggleMute failed:', e);
    }
  }, []);

  // === Push-to-Talk: 키보드 이벤트 처리 ===
  // - Space 누르면 unmute, 떼면 mute
  // - input/textarea/contentEditable 포커스 시엔 무시 (텍스트 입력 방해 X)
  // - PTT mode ON 일 때만 활성
  useEffect(() => {
    if (!pttMode || !connected) return;

    // PTT mode 진입 시 즉시 mute
    const room = roomRef.current;
    const initialMute = async () => {
      try {
        const pub = room?.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
        if (pub && !pub.isMuted) await pub.mute();
        setMuted(true);
      } catch {}
    };
    initialMute();

    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = async (e) => {
      if (e.code !== 'Space') return;
      if (e.repeat) return; // 길게 누름 — 첫 이벤트만 사용
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      const r = roomRef.current;
      if (!r) return;
      const pub = r.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
      if (!pub) return;
      try {
        if (pub.isMuted) await pub.unmute();
        setMuted(false);
        setPttPressed(true);
      } catch {}
    };

    const onKeyUp = async (e) => {
      if (e.code !== 'Space') return;
      if (isTypingTarget(e.target)) return;
      const r = roomRef.current;
      if (!r) return;
      const pub = r.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
      if (!pub) return;
      try {
        if (!pub.isMuted) await pub.mute();
        setMuted(true);
        setPttPressed(false);
      } catch {}
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      setPttPressed(false);
    };
  }, [pttMode, connected]);

  // === 회의방 언마운트 시 자동 leave ===
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        try { room.disconnect(); } catch {}
        try { room.removeAllListeners(); } catch {}
        roomRef.current = null;
      }
      // 원격 오디오 엘리먼트 정리 (페이지 이탈 후 음성 잔류 방지)
      audioContainersRef.current.forEach((el) => {
        try { el.pause(); el.remove(); } catch {}
      });
      audioContainersRef.current.clear();
    };
  }, []);

  return {
    connected,
    connecting,
    error,
    participants,
    activeSpeakers,
    muted,
    localStream,
    join,
    leave,
    toggleMute,
    // Push-to-Talk
    pttMode,
    setPttMode,
    pttPressed,
  };
}
