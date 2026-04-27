import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;

/**
 * 음성 입력 훅 — Google Cloud STT 또는 Web Speech API
 *
 * @param {object} options
 * @param {'google'|'web-speech'} options.provider - STT 서비스 (기본: 'google')
 * @param {string} options.language - 인식 언어 (기본: 'ko-KR')
 * @param {function} options.onTranscript - 최종 텍스트 콜백
 * @param {function} options.onInterim - 중간 결과 콜백 (실시간 표시용)
 * @param {MediaStream|null} options.externalStream - LiveKit 등에서 이미 잡은 마이크 스트림
 *   주입 시 자체 getUserMedia 호출 스킵 → 마이크 권한 모달 1회만, 자원도 절약 (Google STT 경로에서만 의미)
 * @returns {{ isListening, start, stop, interim, error, supported }}
 */
export function useVoiceInput({ provider = 'google', language = 'ko-KR', onTranscript, onInterim, externalStream = null } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);

  // Web Speech API
  const recognitionRef = useRef(null);
  // Google Cloud STT
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // Web Speech API 지원 여부
  const webSpeechSupported = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const supported = provider === 'web-speech' ? !!webSpeechSupported : SUPABASE_ENABLED;

  // ── Web Speech API ──
  const startWebSpeech = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Web Speech API를 지원하지 않는 브라우저입니다'); return; }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { setIsListening(true); setError(null); };
    recognition.onend = () => { setIsListening(false); setInterim(''); };
    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('마이크 권한이 필요합니다. 주소창 왼쪽 자물쇠 → 마이크 → 허용 후 새로고침하세요.');
      } else if (e.error === 'network') {
        setError('네트워크 연결을 확인하세요. Web Speech API는 온라인 상태가 필요합니다.');
      } else {
        setError(`음성 인식 에러: ${e.error}`);
      }
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let interimText = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      if (interimText) {
        setInterim(interimText);
        onInterim?.(interimText);
      }
      if (finalText) {
        setInterim('');
        onTranscript?.(finalText);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('[useVoiceInput] start failed:', e);
      setError(`음성 인식 시작 실패: ${e.message}`);
      setIsListening(false);
    }
  }, [language, onTranscript, onInterim]);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  // ── Google Cloud STT (Edge Function 경유) ──
  // externalStream 주입 시 (LiveKit 사용 중) → 자체 getUserMedia 안 하고 그 스트림 그대로 사용.
  //   즉 마이크는 LiveKit 이 관리, MediaRecorder 만 거기서 분기하여 STT 텍스트화.
  //   onstop 시 외부 스트림은 정리하지 않음 (LiveKit 이 소유).
  const startGoogleSTT = useCallback(async () => {
    try {
      const useExternal = !!externalStream;
      const stream = useExternal
        ? externalStream
        : await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // 스트림 정리 — 외부 주입이면 소유권이 외부에 있으니 우리는 stop 안 함
        if (!useExternal) {
          stream.getTracks().forEach((t) => t.stop());
        }
        streamRef.current = null;

        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        // base64 변환
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
        );

        setInterim('인식 중...');

        // Edge Function 호출 (JWT 포함)
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers = session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {};
          const { data, error: fnError } = await supabase.functions.invoke('stt-recognize', {
            body: { audio: base64, language },
            headers,
          });
          setInterim('');
          if (fnError) {
            setError('STT 처리 실패 — Edge Function 설정을 확인하세요');
            return;
          }
          if (data?.transcript) {
            onTranscript?.(data.transcript);
          }
        } catch (e) {
          setError('STT 서버 연결 실패');
          setInterim('');
        }
      };

      // 5초마다 중간 결과 전송 (연속 인식 시뮬레이션)
      mediaRecorder.start(5000);
      setIsListening(true);
      setError(null);
    } catch (e) {
      setError('마이크 접근이 거부되었습니다');
    }
  }, [language, onTranscript, externalStream]);

  const stopGoogleSTT = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    // 외부 주입 스트림은 우리가 stop 하지 않음 — 소유권은 외부에
    if (!externalStream) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setIsListening(false);
  }, [externalStream]);

  // ── 통합 start/stop ──
  const start = useCallback(() => {
    if (isListening) return;
    if (provider === 'web-speech') startWebSpeech();
    else startGoogleSTT();
  }, [provider, isListening, startWebSpeech, startGoogleSTT]);

  const stop = useCallback(() => {
    if (provider === 'web-speech') stopWebSpeech();
    else stopGoogleSTT();
  }, [provider, stopWebSpeech, stopGoogleSTT]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      try { mediaRecorderRef.current?.stop(); } catch {}
      // 외부 주입 스트림은 정리 X — 소유권은 외부에
      if (!externalStream) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, [externalStream]);

  return { isListening, start, stop, interim, error, supported };
}
