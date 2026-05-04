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
import { Room, RoomEvent, Track, ConnectionState, ScreenSharePresets } from 'livekit-client';

// 화면 공유 화질 프리셋 — UI 에서 사용자가 선택. 정적 자료(슬라이드/문서)에 최적화된 1080p 가 기본.
//   - low    : 720p · 15fps  (네트워크 약함 / 슬라이드만)
//   - medium : 1080p · 15fps (권장 — 글씨 선명도 + 합리적 비트레이트)
//   - high   : 1080p · 30fps (영상/시연 — 30fps 로 더 부드러움)
//   - native : 원본 해상도   (모니터 native, 4K/1440p 등 그대로. 좋은 네트워크 필요)
//
// livekit-client 2.18 의 ScreenSharePresets 사용 가능 키 (참고):
//   h360fps3 / h360fps15 / h720fps5 / h720fps15 / h720fps30
//   h1080fps15 / h1080fps30 / original
// (h1440fps30 같은 키는 신버전 SDK 만 존재 → 사용 불가)
const SCREEN_SHARE_QUALITY = {
  low:    { resolution: ScreenSharePresets.h720fps15.resolution },
  medium: { resolution: ScreenSharePresets.h1080fps15.resolution },
  high:   { resolution: ScreenSharePresets.h1080fps30.resolution },
  native: { resolution: ScreenSharePresets.original.resolution },
};
import { supabase } from '@/lib/supabase';
import { logLiveKitSession } from '@/lib/serviceUsage';

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
  // 음성 입력 모드 — 'toggle' 기본 (Space 한 번 = 음소거 토글, latch O)
  //                  'ptt' (Space hold = 발언, 떼면 음소거. 같은 방 다중 참여 시 하울링 방지)
  const [voiceMode, setVoiceMode] = useState('toggle');
  const [pttPressed, setPttPressed] = useState(false); // PTT 키 누르고 있는 중 (시각 피드백용)
  // 화면 공유 — identity → { videoTrack, audioTrack, name, isLocal }
  // Map은 mutate해도 React가 인지 못하므로 매 갱신 시 새 Map 생성
  const [screenShares, setScreenShares] = useState(() => new Map());
  const [localScreenSharing, setLocalScreenSharing] = useState(false);
  const [screenShareError, setScreenShareError] = useState(null);
  const screenShareSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';

  const roomRef = useRef(null);
  // 원격 오디오 트랙별 <audio> 엘리먼트 — Map<`${identity}:${trackSid}`, HTMLAudioElement>
  //   leave/언마운트 시 일괄 정리
  const audioContainersRef = useRef(new Map());
  // 사용량 계측: connect 시각 기록 → leave 시 (now - joinedAt) 으로 분 계산
  const joinedAtRef = useRef(null);
  // 사용량 중복 기록 방지 — leave() 와 unmount cleanup 가 둘 다 실행되는 race 차단
  const usageLoggedRef = useRef(false);
  // unmount cleanup deps `[]` 에서 meetingId 사용을 위한 stale closure 방지
  const meetingIdRef = useRef(meetingId);
  useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);

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
  // options.enableMic: false → 마이크 publish 스킵 (수동 청취 / 화면 공유 수신용)
  //   기본 true (음성 회의 참여 시) — 마이크 publish 후 즉시 mute. 사용자 권한 다이얼로그 발생.
  //   false 시 마이크 권한 요청 안 함 → 수신 전용 (다른 사람 음성·화면 공유만 듣고 봄).
  const join = useCallback(async ({ enableMic = true } = {}) => {
    if (roomRef.current) {
      // 이미 연결돼 있고 마이크 enable 요청이면 마이크만 추가 publish
      if (enableMic) {
        try {
          const pub = roomRef.current.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
          if (!pub) {
            await roomRef.current.localParticipant.setMicrophoneEnabled(true);
            const newPub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (newPub) { await newPub.mute(); setMuted(true); }
          }
        } catch (e) {
          console.warn('[useLiveKitVoice] late mic enable failed:', e?.message);
        }
      }
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
        // 화면 공유 publish 기본값 — 텍스트/세부 표현 선명도 우선
        //   videoCodec: VP9 — 같은 비트레이트에 더 선명 (Chrome/Edge 지원, 미지원 시 자동 fallback)
        //   screenShareEncoding: 화질별 비트레이트는 startScreenShare 시 동적 설정
        publishDefaults: {
          videoCodec: 'vp9',
        },
      });

      // 이벤트 구독 — 한 번만, 이후 disconnect 시 removeAllListeners 로 정리
      room.on(RoomEvent.ParticipantConnected, () => rebuildParticipants());
      room.on(RoomEvent.ParticipantDisconnected, () => rebuildParticipants());
      room.on(RoomEvent.TrackPublished, () => rebuildParticipants());
      room.on(RoomEvent.TrackUnpublished, () => rebuildParticipants());
      room.on(RoomEvent.TrackMuted, () => rebuildParticipants());
      room.on(RoomEvent.TrackUnmuted, () => rebuildParticipants());
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        rebuildParticipants();
        // local 화면 공유 published → screenShares Map 에 본인 entry 추가 (로컬 미리보기용)
        if (publication?.track?.source === Track.Source.ScreenShare) {
          setLocalScreenSharing(true);
          const lp = room.localParticipant;
          setScreenShares((prev) => {
            const next = new Map(prev);
            const cur = next.get(lp.identity) || {
              identity: lp.identity,
              name: lp.name || '나',
              isLocal: true,
            };
            cur.videoTrack = publication.track;
            cur.isLocal = true;
            next.set(lp.identity, cur);
            return next;
          });
          return;
        }
        if (publication?.track?.source === Track.Source.ScreenShareAudio) {
          const lp = room.localParticipant;
          setScreenShares((prev) => {
            const next = new Map(prev);
            const cur = next.get(lp.identity) || {
              identity: lp.identity,
              name: lp.name || '나',
              isLocal: true,
            };
            cur.audioTrack = publication.track;
            next.set(lp.identity, cur);
            return next;
          });
          return;
        }
        // local 마이크 published → muted 상태 동기화
        const pub = room.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
        setMuted(!!pub?.isMuted);
        // STT 공유용 MediaStream 추출
        const track = pub?.track;
        if (track?.mediaStreamTrack) {
          setLocalStream(new MediaStream([track.mediaStreamTrack]));
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        rebuildParticipants();
        if (publication?.track?.source === Track.Source.ScreenShare) {
          setLocalScreenSharing(false);
          const lp = room.localParticipant;
          setScreenShares((prev) => {
            const next = new Map(prev);
            const cur = next.get(lp.identity);
            if (!cur) return prev;
            cur.videoTrack = undefined;
            if (!cur.videoTrack && !cur.audioTrack) next.delete(lp.identity);
            else next.set(lp.identity, cur);
            return next;
          });
          return;
        }
        if (publication?.track?.source === Track.Source.ScreenShareAudio) {
          const lp = room.localParticipant;
          setScreenShares((prev) => {
            const next = new Map(prev);
            const cur = next.get(lp.identity);
            if (!cur) return prev;
            cur.audioTrack = undefined;
            if (!cur.videoTrack && !cur.audioTrack) next.delete(lp.identity);
            else next.set(lp.identity, cur);
            return next;
          });
          return;
        }
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
        // 화면 공유 비디오/시스템 오디오 트랙 → screenShares state 갱신
        // (실제 video element는 ScreenShareView에서 attach — 여러 viewer 인스턴스 대비)
        // ScreenShare 시스템 오디오는 여기서 자동 재생 (다른 사람의 시스템 사운드 들리도록)
        if (
          track.source === Track.Source.ScreenShare ||
          track.source === Track.Source.ScreenShareAudio
        ) {
          setScreenShares((prev) => {
            const next = new Map(prev);
            const cur = next.get(participant.identity) || {
              identity: participant.identity,
              name: participant.name || participant.identity || '발표자',
              isLocal: false,
            };
            if (track.source === Track.Source.ScreenShare) cur.videoTrack = track;
            else cur.audioTrack = track;
            next.set(participant.identity, cur);
            return next;
          });
          // 시스템 오디오는 자동 재생 (마이크 오디오와 동일 패턴)
          if (track.source === Track.Source.ScreenShareAudio) {
            try {
              const el = track.attach();
              el.setAttribute('data-livekit-screen-audio', participant.identity);
              el.style.display = 'none';
              document.body.appendChild(el);
              audioElsRef.set(`${participant.identity}:${track.sid}`, el);
            } catch (e) {
              console.warn('[useLiveKitVoice] screen audio attach failed:', e?.message);
            }
          }
          return;
        }
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
        // 화면 공유 트랙 정리
        if (
          track.source === Track.Source.ScreenShare ||
          track.source === Track.Source.ScreenShareAudio
        ) {
          setScreenShares((prev) => {
            const next = new Map(prev);
            const cur = next.get(participant.identity);
            if (!cur) return prev;
            if (track.source === Track.Source.ScreenShare) cur.videoTrack = undefined;
            else cur.audioTrack = undefined;
            if (!cur.videoTrack && !cur.audioTrack) next.delete(participant.identity);
            else next.set(participant.identity, cur);
            return next;
          });
          // 시스템 오디오 element 정리
          if (track.source === Track.Source.ScreenShareAudio) {
            const key = `${participant.identity}:${track.sid}`;
            const el = audioElsRef.get(key);
            if (el) {
              try { track.detach(el); } catch {}
              el.remove();
              audioElsRef.delete(key);
            }
          }
          return;
        }
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
        setScreenShares(new Map());
        setLocalScreenSharing(false);
      });
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Connected) setConnected(true);
        if (state === ConnectionState.Disconnected) setConnected(false);
      });

      // 연결
      await room.connect(url, token, { autoSubscribe: true });
      roomRef.current = room;
      joinedAtRef.current = Date.now();
      usageLoggedRef.current = false; // 새 세션 시작 — 사용량 기록 플래그 리셋
      setConnected(true);

      // iOS Safari autoplay: room.startAudio() 사용자 제스처 컨텍스트에서 호출
      try { await room.startAudio(); } catch { /* 일부 브라우저에서 throw 가능 — 무시 */ }

      // 마이크 publish — enableMic=false 면 스킵 (수신 전용 모드)
      //   기본 (음성 참여 클릭 등): publish 후 즉시 mute → 사용자가 mic 버튼으로 unmute 가능
      //   passive 모드 (페이지 진입 자동 join): mic 권한 요청 없이 룸 연결만 → 다른 사람 음성·화면 수신
      if (enableMic) {
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (pub) {
            await pub.mute();
            setMuted(true);
          }
        } catch (micErr) {
          console.warn('[useLiveKitVoice] mic publish failed:', micErr?.message);
          // 권한 거부 등 → 룸은 연결돼 있고 듣기만 가능 (다른 사람 음성 듣기)
        }
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
    // 사용량 계측 — 1회만 (leave 와 unmount cleanup 둘 다 실행되는 race 방지)
    if (joinedAtRef.current && !usageLoggedRef.current) {
      usageLoggedRef.current = true;
      const durationSec = Math.max(0, (Date.now() - joinedAtRef.current) / 1000);
      const participantCount = Math.max(1, room.numParticipants || 1);
      logLiveKitSession({
        meetingId: meetingIdRef.current,
        durationSeconds: durationSec,
        participantCount,
      }).catch(() => {});
      joinedAtRef.current = null;
    }
    try { await room.disconnect(); } catch {}
    try { room.removeAllListeners(); } catch {}
    roomRef.current = null;
    cleanupAudioElements();
    setConnected(false);
    setActiveSpeakers(new Set());
    setParticipants([]);
    setLocalStream(null);
    setScreenShares(new Map());
    setLocalScreenSharing(false);
  }, [cleanupAudioElements]);

  // === 화면 공유 시작/중지 ===
  // 사용자 클릭 핸들러 안에서 호출되어야 함 (getDisplayMedia는 user gesture 필요)
  // 옵션:
  //   - audio: true → 시스템 오디오 함께 캡처 (브라우저별 지원 다름)
  //   - quality: 'low' | 'medium' | 'high' (기본 'medium' = 1080p15)
  //
  // 룸 미연결 상태면 자동으로 join 후 화면 공유 시작 → 사용자 UX 상 음성과 분리.
  // 자동 join은 mute 상태로 진행 (muted 초기값 true).
  const startScreenShare = useCallback(async ({ audio = false, quality = 'medium' } = {}) => {
    if (!screenShareSupported) {
      setScreenShareError('이 브라우저에서는 화면 공유를 지원하지 않습니다');
      return;
    }
    // 룸 미연결 → 자동 join (passive: 마이크 권한 안 묻고 수신만)
    // 화면 공유는 비디오 트랙 publish이므로 마이크는 별도. 사용자가 마이크 켜고 싶으면 음성 참여 버튼 클릭.
    if (!roomRef.current) {
      try {
        await join({ enableMic: false });
      } catch (e) {
        setScreenShareError('회의 룸 자동 입장 실패: ' + (e?.message || String(e)));
        return;
      }
    }
    const room = roomRef.current;
    if (!room) {
      setScreenShareError('LiveKit 룸 연결에 실패했습니다');
      return;
    }
    setScreenShareError(null);
    try {
      const preset = SCREEN_SHARE_QUALITY[quality] || SCREEN_SHARE_QUALITY.medium;
      // captureOptions:
      //   - resolution: 화질 프리셋 (저/중/고)
      //   - contentHint: 'detail' — 텍스트/세부 표현 우선 (글씨 선명도 ↑, 동영상은 떨어질 수 있음)
      //     'motion' (동영상 우선) 으로 바꾸려면 quality='high' 케이스에서 분기 가능
      await room.localParticipant.setScreenShareEnabled(true, {
        audio,
        resolution: preset.resolution,
        contentHint: 'detail',
      });
    } catch (err) {
      // 사용자가 권한 다이얼로그 취소 → NotAllowedError → 무음 처리
      if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
        console.warn('[useLiveKitVoice] screen share failed:', err);
        setScreenShareError(err?.message || String(err));
      }
    }
  }, [screenShareSupported, join]);

  const stopScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(false);
    } catch (err) {
      console.warn('[useLiveKitVoice] stopScreenShare failed:', err);
    }
  }, []);

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

  // === Space 키보드 핸들러 — voiceMode 에 따라 동작 분기 ===
  //   'ptt' : Space 누름 = unmute, 떼면 mute (latch X)
  //   'toggle' : Space 한 번 = mute ↔ unmute 토글 (latch O)
  //   둘 다 input/textarea/contentEditable 포커스 시엔 무시 (텍스트 입력 방해 X)
  //   PTT 모드로 전환 시 즉시 mute (안전)
  useEffect(() => {
    if (!connected) return;

    // PTT 모드로 들어오면 일단 mute (안전)
    if (voiceMode === 'ptt') {
      (async () => {
        try {
          const pub = roomRef.current?.localParticipant?.getTrackPublication?.(Track.Source.Microphone);
          if (pub && !pub.isMuted) await pub.mute();
          setMuted(true);
        } catch {}
      })();
    }

    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const getMicPub = () => {
      const r = roomRef.current;
      return r?.localParticipant?.getTrackPublication?.(Track.Source.Microphone) || null;
    };

    const onKeyDown = async (e) => {
      if (e.code !== 'Space') return;
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      const pub = getMicPub();
      if (!pub) return;
      try {
        if (voiceMode === 'ptt') {
          // PTT: 누름 = unmute (떼면 mute)
          if (pub.isMuted) await pub.unmute();
          setMuted(false);
          setPttPressed(true);
        } else {
          // toggle: Space 한 번 = 상태 반전 (latch)
          if (pub.isMuted) {
            await pub.unmute();
            setMuted(false);
          } else {
            await pub.mute();
            setMuted(true);
          }
        }
      } catch {}
    };

    const onKeyUp = async (e) => {
      if (e.code !== 'Space') return;
      if (voiceMode !== 'ptt') return; // toggle 모드는 keyup 무시
      if (isTypingTarget(e.target)) return;
      const pub = getMicPub();
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
  }, [voiceMode, connected]);

  // === 회의방 언마운트 시 자동 leave ===
  useEffect(() => {
    return () => {
      const room = roomRef.current;
      if (room) {
        // 사용량 계측 — 1회만 (meetingIdRef 로 stale closure 회피)
        if (joinedAtRef.current && !usageLoggedRef.current) {
          usageLoggedRef.current = true;
          const durationSec = Math.max(0, (Date.now() - joinedAtRef.current) / 1000);
          const pcount = Math.max(1, room.numParticipants || 1);
          logLiveKitSession({
            meetingId: meetingIdRef.current,
            durationSeconds: durationSec,
            participantCount: pcount,
          }).catch(() => {});
          joinedAtRef.current = null;
        }
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
    // 음성 입력 모드 — 'toggle' (기본) | 'ptt'
    voiceMode,
    setVoiceMode,
    pttPressed, // PTT 모드에서 Space 누르고 있는 상태 시각 피드백
    // 화면 공유
    screenShares,           // Map<identity, { videoTrack, audioTrack, name, isLocal, identity }>
    localScreenSharing,     // 본인이 현재 공유 중인지
    screenShareError,
    screenShareSupported,
    startScreenShare,
    stopScreenShare,
  };
}
