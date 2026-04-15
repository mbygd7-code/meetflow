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
 * @returns {{ isListening, start, stop, interim, error, supported }}
 */
export function useVoiceInput({ provider = 'google', language = 'ko-KR', onTranscript, onInterim } = {}) {
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
      if (e.error === 'no-speech') return; // 무음은 무시
      setError(`음성 인식 에러: ${e.error}`);
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
    recognition.start();
  }, [language, onTranscript, onInterim]);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  // ── Google Cloud STT (Edge Function 경유) ──
  const startGoogleSTT = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // 스트림 정리
        stream.getTracks().forEach((t) => t.stop());
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

        // Edge Function 호출
        try {
          const { data, error: fnError } = await supabase.functions.invoke('stt-recognize', {
            body: { audio: base64, language },
          });
          setInterim('');
          if (fnError) {
            setError('STT 처리 실패');
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
  }, [language, onTranscript]);

  const stopGoogleSTT = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsListening(false);
  }, []);

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
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { isListening, start, stop, interim, error, supported };
}
