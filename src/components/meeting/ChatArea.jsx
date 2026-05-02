import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AtSign, X, Plus, Paperclip, Mic, MicOff, Keyboard, ZapOff, Zap, AlertTriangle, LogOut, UserPlus, Link2, Loader2, ClipboardPaste } from 'lucide-react';
import ChatBubble from './ChatBubble';
import MiloAvatar from '@/components/milo/MiloAvatar';
import { useAuthStore } from '@/stores/authStore';
import { AI_EMPLOYEES } from '@/stores/aiTeamStore';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { parseGoogleDocsUrl } from '@/lib/googleDocsUrl';

export default function ChatArea({
  messages, onSend, disabled, aiThinking, onFileUpload, onImportUrl, autoIntervene = true, aiError = null,
  // LiveKit 음성 회의 통합 — voiceConnected=true 면 큰 마이크 버튼이 LiveKit mute 토글로 동작.
  //   기본값(false): 기존 STT 시작/중지 동작 유지 — 회의 외부에서도 사용 가능.
  voiceConnected = false,
  voiceMuted = false,
  onVoiceToggleMute,
  // LiveKit MediaStream — 주입되면 STT 가 자체 getUserMedia 안 하고 이 스트림 그대로 분기 사용
  voiceLocalStream = null,
}) {
  const [input, setInput] = useState('');
  const [quotedMessage, setQuotedMessage] = useState(null);
  const [reactions, setReactions] = useState({});
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  // 음성 모드 전용 대기 컨텍스트 — 드로잉 마커/아바타 클릭 시 다음 STT 발언에 첨부될 태그
  //   { tag: string, label: string, color?: string, refs?: array | null }
  const [pendingVoiceCtx, setPendingVoiceCtx] = useState(null);
  const pendingVoiceCtxRef = useRef(null);
  useEffect(() => { pendingVoiceCtxRef.current = pendingVoiceCtx; }, [pendingVoiceCtx]);
  // URL 자료 추가 폼 상태
  const [urlFormOpen, setUrlFormOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlError, setUrlError] = useState(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const urlInputRef = useRef(null);

  // 자동개입 상태 배너: 초기 OFF 상태면 10초, 토글 변경 시 5초 표시 후 자동 숨김
  const [banner, setBanner] = useState(null); // { kind: 'off' | 'on', visible: bool }
  const bannerTimerRef = useRef(null);
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    const firstMount = isFirstMountRef.current;
    isFirstMountRef.current = false;

    // 첫 마운트 & ON 상태 → 배너 표시 안 함
    if (firstMount && autoIntervene) return;

    const kind = autoIntervene ? 'on' : 'off';
    const duration = firstMount ? 10000 : 5000;
    setBanner({ kind, visible: true });
    clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setBanner((b) => (b ? { ...b, visible: false } : b));
    }, duration);
    return () => clearTimeout(bannerTimerRef.current);
  }, [autoIntervene]);

  // 음성 모드 진입 시 Space 단축키 힌트 강조 (2초간 보라 아웃라인) — 사용자에게 PTT 가능성 환기
  const [spaceHintGlow, setSpaceHintGlow] = useState(false);
  useEffect(() => {
    if (!voiceConnected) {
      setSpaceHintGlow(false);
      return;
    }
    setSpaceHintGlow(true);
    const t = setTimeout(() => setSpaceHintGlow(false), 2000);
    return () => clearTimeout(t);
  }, [voiceConnected]);

  // 드로잉 태그 이벤트 리스너 — DrawingOverlay 아바타 클릭 시 input에 태그 주입 +
  //   구조화 참조(drawing_annotations metadata)를 송신 시 포함할 수 있도록 누적.
  const [pendingDrawingRefs, setPendingDrawingRefs] = useState([]);
  const pendingDrawingRefsRef = useRef([]);
  useEffect(() => { pendingDrawingRefsRef.current = pendingDrawingRefs; }, [pendingDrawingRefs]);
  useEffect(() => {
    const handler = (e) => {
      const tag = e?.detail?.tag;
      if (!tag) return;
      const ref = {
        target_key: e.detail.targetKey || null,
        file_name: e.detail.fileName || null,
        user_name: e.detail.userName || null,
        seq: e.detail.seq || null,
        stroke_id: e.detail.strokeId || null,
      };
      // 음성 모드일 때: 텍스트 모드로 전환하지 않고 대기 컨텍스트로 stage.
      //   다음 STT 발언이 도착하면 태그 + drawing_annotations 메타데이터 자동 첨부.
      if (voiceMode) {
        setPendingVoiceCtx({
          tag: tag.trim(),
          label: e.detail.userName && typeof e.detail.seq === 'number'
            ? `${e.detail.userName} #${e.detail.seq}`
            : tag.trim(),
          refs: [ref],
        });
        return;
      }
      // 텍스트 모드: 기존 동작 — 입력창에 태그 삽입
      setInput((prev) => {
        if (prev.includes(tag.trim())) return prev;
        const sep = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + sep + tag;
      });
      setPendingDrawingRefs((prev) => {
        const key = `${ref.user_name}-${ref.seq}-${ref.stroke_id}`;
        if (prev.some((r) => `${r.user_name}-${r.seq}-${r.stroke_id}` === key)) return prev;
        return [...prev, ref];
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener('meetflow:drawing-tag', handler);
    return () => window.removeEventListener('meetflow:drawing-tag', handler);
  }, [voiceMode]);

  // STT 설정 읽기 (state로 관리 + storage / custom event 리슨하여 설정 변경 즉시 반영)
  const [sttProvider, setSttProvider] = useState(() => {
    try { return JSON.parse(localStorage.getItem('meetflow_integrations') || '{}').sttProvider || 'web-speech'; } catch { return 'web-speech'; }
  });
  useEffect(() => {
    const reread = () => {
      try {
        const v = JSON.parse(localStorage.getItem('meetflow_integrations') || '{}').sttProvider || 'web-speech';
        setSttProvider(v);
      } catch {}
    };
    const onCustom = (e) => {
      if (e?.detail?.provider) setSttProvider(e.detail.provider);
      else reread();
    };
    window.addEventListener('meetflow:stt-provider-change', onCustom);
    window.addEventListener('storage', reread); // 다른 탭에서 변경된 경우
    return () => {
      window.removeEventListener('meetflow:stt-provider-change', onCustom);
      window.removeEventListener('storage', reread);
    };
  }, []);

  // STT provider 는 사용자 설정 그대로 유지 — LiveKit 활성이어도 강제 변환 X.
  //   web-speech: Chrome 무료 STT, 자체 마이크 사용 (LiveKit publish 와 동시 캡처 OK)
  //   google: Cloud Speech-to-Text Edge Function — GCP 프로젝트에 API enable 필요
  // LiveKit 활성 + google 모드일 때만 LiveKit MediaStream 분기 사용해 마이크 1회 절약
  const { isListening, start: startSTT, stop: stopSTT, interim, error: sttError, supported: sttSupported } = useVoiceInput({
    provider: sttProvider,
    language: 'ko-KR',
    onTranscript: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // 음성 모드 대기 컨텍스트 — 드로잉 마커/멘션 클릭으로 stage 된 태그 + 메타데이터 자동 첨부
      const ctx = pendingVoiceCtxRef.current;
      if (ctx) {
        const composed = `${ctx.tag} ${trimmed}`;
        const metadata = ctx.refs?.length > 0 ? { drawing_annotations: ctx.refs } : null;
        onSend?.(composed, metadata ? { metadata } : undefined);
        setPendingVoiceCtx(null);
      } else {
        onSend?.(trimmed);
      }
    },
    onInterim: () => {},
    externalStream: (voiceConnected && sttProvider === 'google') ? voiceLocalStream : null,
  });

  // LiveKit 활성 시 muted 상태 변화에 따라 STT 자동 시작/중지 (자막 효과)
  //   - Space 키 (PTT 또는 toggle 모드) 로 mute 변경 → 즉시 STT 따라가기
  //   - 큰 마이크 버튼 클릭으로 mute 변경 → 동일하게 동기화
  // 단일 source of truth = voiceMuted state. 클릭/Space 어느 쪽으로 변해도 STT 일관 동작.
  // STT 자동 시작/중지 — isListening 도 deps 에 포함해야 함
  // (Web Speech API 가 onend 로 자체 종료 시 isListening false 로 변하면
  //  effect 가 재실행되어 다시 startSTT 호출 — 자막 영구 끊김 방지)
  // startSTT/stopSTT 도 deps 에 포함하지만 useCallback 으로 안정화되어 있음.
  useEffect(() => {
    if (!voiceConnected) return;
    if (!sttSupported) return;
    if (!voiceMuted && !isListening) {
      startSTT();
    } else if (voiceMuted && isListening) {
      stopSTT();
    }
  }, [voiceMuted, voiceConnected, sttSupported, isListening, startSTT, stopSTT]);

  // LiveKit 룸 종료 시 입력 모드 정리
  //   - voiceConnected: true → false 전환 시 voiceMode = false (음성 의미 없음)
  //
  // ※ false → true (룸 입장) 시 voiceMode 자동 ON 은 의도적으로 제거함:
  //    화면 공유 합류 모달 등 "보기만 하려고 입장" 케이스에서 텍스트 입력창이 사라져
  //    혼란을 주는 문제. voiceMode 는 사용자가 + 메뉴에서 명시적으로 켜는 것으로 통일.
  //    Space 키 PTT / 마이크 토글은 텍스트 모드에서도 동작하므로 음성 통화 자체엔 영향 X.
  const prevVoiceConnectedRef = useRef(voiceConnected);
  const isListeningRef = useRef(isListening);
  const stopSTTRef = useRef(stopSTT);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { stopSTTRef.current = stopSTT; }, [stopSTT]);
  useEffect(() => {
    const prev = prevVoiceConnectedRef.current;
    prevVoiceConnectedRef.current = voiceConnected;
    if (prev && !voiceConnected) {
      setVoiceMode(false);
      if (isListeningRef.current) stopSTTRef.current?.();
    }
  }, [voiceConnected]);
  const { user } = useAuthStore();

  const handleReact = (messageId, key) => {
    const userName = user?.name || '나';
    setReactions((prev) => {
      const msg = { ...(prev[messageId] || {}) };
      const existing = msg[key] || { count: 0, users: [] };
      // 이미 반응한 경우 토글 (제거)
      if (existing.users.includes(userName)) {
        msg[key] = { count: existing.count - 1, users: existing.users.filter((u) => u !== userName) };
        if (msg[key].count <= 0) delete msg[key];
      } else {
        msg[key] = { count: existing.count + 1, users: [...existing.users, userName] };
      }
      return { ...prev, [messageId]: msg };
    });
  };

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, aiThinking]);

  const handleSend = async () => {
    if (!input.trim() || disabled) return;
    const text = quotedMessage
      ? `[quote:${quotedMessage.senderName}]${quotedMessage.content}[/quote]\n${input}`
      : input;
    // 현재 input 에 남아 있는 `@name-seq` 태그에 대응하는 refs만 첨부
    const refsToAttach = pendingDrawingRefsRef.current.filter((r) =>
      r.user_name && typeof r.seq === 'number' && text.includes(`@${r.user_name}-${r.seq}`)
    );
    const metadata = refsToAttach.length > 0 ? { drawing_annotations: refsToAttach } : null;
    setInput('');
    setQuotedMessage(null);
    setPendingDrawingRefs([]);
    await onSend?.(text, { metadata });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuote = (quote) => {
    setQuotedMessage(quote);
    textareaRef.current?.focus();
  };

  // 채팅 버블 아바타 클릭 → 멘션 (음성 모드면 대기 컨텍스트 stage, 아니면 입력창에 삽입)
  const handleMention = (name) => {
    if (!name) return;
    if (voiceMode) {
      // 음성 모드: 텍스트 전환 없이 대기 컨텍스트만 추가 → 다음 STT 발언에 자동 첨부
      setPendingVoiceCtx({
        tag: `@${name}`,
        label: name,
        refs: null, // 채팅 멘션은 drawing_annotations 메타데이터 없음
      });
      return;
    }
    const tag = `@${name} `;
    setInput((prev) => {
      if (prev.includes(tag.trim())) return prev;
      const sep = prev && !prev.endsWith(' ') ? ' ' : '';
      return prev + sep + tag;
    });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // 키보드 위치 보정은 main.jsx 의 --app-h (visualViewport.height) 로 이미 처리됨.
  //   visualViewport 가 줄어들면 Layout 루트 높이(var(--app-h)) 도 줄어들어
  //   내부 flex-col 레이아웃이 자동으로 입력창을 키보드 바로 위에 위치시킴.
  //
  // 추가로 textarea 포커스 시 iOS 가 input 을 viewport 상단으로 스크롤하려는 동작을
  // 차단 — 메시지 리스트가 항상 하단(최신 메시지) 에 머물도록 보정.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const restoreView = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    // 활성 timer 트래킹 — blur/unmount 시 모두 cleanup 하여 의도치 않은 호출 방지
    let rafId = null;
    const timeoutIds = [];
    const onFocus = () => {
      restoreView();
      rafId = requestAnimationFrame(() => {
        rafId = null;
        restoreView();
      });
      [50, 150, 300, 500].forEach((t) => {
        timeoutIds.push(setTimeout(restoreView, t));
      });
    };
    const onBlur = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      timeoutIds.forEach(clearTimeout);
      timeoutIds.length = 0;
    };
    ta.addEventListener('focus', onFocus);
    ta.addEventListener('blur', onBlur);
    return () => {
      ta.removeEventListener('focus', onFocus);
      ta.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden">
      {/* 메시지 리스트 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-5 space-y-5 [overscroll-behavior:contain] [-webkit-overflow-scrolling:touch]"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-txt-muted text-sm">
            첫 메시지를 보내 회의를 시작하세요
          </div>
        ) : (
          messages.map((m) => (
            // 시스템 공지(입장/퇴장 등) — 중앙 정렬 배너 + 문맥 아이콘
            m.ai_type === 'system' ? (() => {
              const raw = m.content || '';
              // 과거 이모지(🚪 ↩️) 제거하여 아이콘으로 일원화
              const text = raw.replace(/^[🚪↩️]\s*/u, '').trim();
              const isRejoin = /다시\s*입장/.test(text);
              // 아이콘과 색상 모두 대비 — 나가기(빨강 LogOut) vs 재입장(초록 UserPlus)
              const Icon = isRejoin ? UserPlus : LogOut;
              const iconColor = isRejoin ? 'text-status-success' : 'text-status-error';
              return (
                <div key={m.id} className="flex justify-center fade-in">
                  <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm text-txt-secondary bg-bg-tertiary/70 border border-border-subtle">
                    <Icon size={14} className={`${iconColor} shrink-0 opacity-80`} />
                    {text}
                  </span>
                </div>
              );
            })() : (
              <ChatBubble key={m.id} message={m} currentUserId={user?.id} onQuote={handleQuote} onReact={handleReact} onActionClick={onSend} onMention={handleMention} reactions={reactions} />
            )
          ))
        )}

        {/* AI 생각 중 표시 */}
        {aiThinking?.active && (
          <div className="flex gap-3 fade-in">
            <MiloAvatar employeeId={aiThinking.employeeId} size="md" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium text-brand-purple mb-1">
                {AI_EMPLOYEES.find((e) => e.id === aiThinking.employeeId)?.nameKo || 'Milo'}
              </span>
              <div className="px-4 py-3 bg-brand-purple/10 border border-brand-purple/20 rounded-xl rounded-tl-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-purple/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-brand-purple/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-brand-purple/60 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 입력창 — 섹션은 솔리드 bg로 고정, 위쪽에 별도 페이드 레이어를 올려 메시지 페이드 효과 */}
      <div className="relative px-3 md:px-6 pb-3 md:pb-5 pt-2" style={{ background: 'var(--bg-primary)' }}>
        {/* 메시지창 위로 올라가는 페이드 레이어 (더 높이 올림) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-16"
          style={{ background: 'linear-gradient(to top, var(--bg-primary) 0%, transparent 100%)' }}
        />
        {/* 자동개입 상태 배너 — 토글 변경/초기 OFF 시 일정 시간 표시 후 자동 사라짐 */}
        {banner && (
          <div
            className={`inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-all duration-300 ${
              banner.visible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-1 pointer-events-none'
            } ${
              banner.kind === 'off'
                ? 'bg-status-error text-white border border-status-error'
                : 'bg-status-success text-white border border-status-success'
            }`}
          >
            {banner.kind === 'off' ? (
              <>
                <ZapOff size={15} strokeWidth={2.4} />
                <span>AI 자동 개입 OFF — <span className="font-bold">@밀로</span>/<span className="font-bold">@전문가</span>로 호출하세요</span>
              </>
            ) : (
              <>
                <Zap size={15} strokeWidth={2.4} />
                <span>AI 자동 개입 ON — 필요한 순간 AI가 자동 응답합니다</span>
              </>
            )}
          </div>
        )}
        {/* AI 에러 토스트 — API 실패/서킷 오픈 시 표시 */}
        {aiError && (
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm bg-status-error text-white border border-status-error animate-pulse">
            <AlertTriangle size={15} strokeWidth={2.4} />
            <span>AI 응답 실패 — 자동 재시도 중...</span>
          </div>
        )}
        {/* 인용 프리뷰 */}
        {quotedMessage && (
          <div className="flex items-start gap-2 mb-2 px-4 py-2 bg-bg-tertiary border border-border-subtle rounded-lg text-xs">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-brand-purple">{quotedMessage.senderName}</span>
              <p className="text-txt-secondary mt-0.5 line-clamp-2">{quotedMessage.content}</p>
            </div>
            <button onClick={() => setQuotedMessage(null)} className="p-0.5 text-txt-muted hover:text-txt-primary shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv"
          onChange={(e) => {
            Array.from(e.target.files || []).forEach((f) => onFileUpload?.(f));
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* URL 자료 추가 인라인 폼 — Google Docs/Sheets/Slides 자동 PDF 변환 */}
        {urlFormOpen && (() => {
          const detected = parseGoogleDocsUrl(urlInput);
          const submit = async () => {
            const trimmed = urlInput.trim();
            if (!trimmed) { setUrlError('URL을 입력해주세요'); return; }
            if (!detected) { setUrlError('Google Docs/Sheets/Slides URL만 지원합니다'); return; }
            setUrlImporting(true);
            setUrlError(null);
            try {
              await onImportUrl?.(trimmed);
              setUrlFormOpen(false);
              setUrlInput('');
            } catch (err) {
              setUrlError(err?.message || 'PDF 변환 중 오류가 발생했습니다');
            } finally {
              setUrlImporting(false);
            }
          };
          return (
            <div className="mb-2 px-3 py-3 bg-bg-secondary border border-border-subtle rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Link2 size={15} className="text-brand-purple" />
                <span className="text-xs font-semibold text-txt-primary">URL로 자료 추가</span>
                <button
                  onClick={() => { setUrlFormOpen(false); setUrlError(null); setUrlInput(''); }}
                  className="ml-auto p-0.5 text-txt-muted hover:text-txt-primary"
                  disabled={urlImporting}
                  title="닫기"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  ref={urlInputRef}
                  type="url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !urlImporting) submit();
                  }}
                  // 우클릭/단축키 컨텍스트 메뉴가 부모 핸들러에 의해 막히지 않도록 명시.
                  onContextMenu={(e) => e.stopPropagation()}
                  // 부모의 onPaste 핸들러 격리 + native paste의 결과를 onChange 가 받도록.
                  onPaste={(e) => { e.stopPropagation(); }}
                  placeholder="https://docs.google.com/document/d/..."
                  disabled={urlImporting}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-bg-tertiary border border-border-subtle rounded-md pl-3 pr-9 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-brand-purple/50 focus:ring-[3px] focus:ring-brand-purple/15 disabled:opacity-50"
                />
                <button
                  type="button"
                  // 버튼 클릭으로 input의 focus가 빠지지 않게 mousedown 단계에서 prevent.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    setUrlError(null);
                    // 1) 항상 먼저 input 으로 포커스 — 실패 시 사용자가 곧바로 ⌘V 가능.
                    const inp = urlInputRef.current;
                    inp?.focus();
                    inp?.select?.();
                    // 2) Clipboard API readText 시도.
                    //    일부 브라우저(권한 차단/포커스 문제/비-시큐어 컨텍스트)에서는 실패할 수 있음.
                    try {
                      if (navigator.clipboard?.readText) {
                        const txt = await navigator.clipboard.readText();
                        if (txt && txt.trim()) {
                          setUrlInput(txt.trim());
                          return;
                        }
                      }
                      throw new Error('empty-or-unsupported');
                    } catch {
                      // 3) 폴백 안내 — input 은 이미 focus + select 상태이므로 ⌘V 한 번이면 됨
                      setUrlError('붙여넣기 권한이 차단되어 있어요. 입력칸이 활성된 상태에서 ⌘V (Mac) 또는 Ctrl+V 를 눌러주세요.');
                    }
                  }}
                  disabled={urlImporting}
                  title="클립보드에서 붙여넣기"
                  aria-label="클립보드에서 붙여넣기"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded text-txt-muted hover:text-brand-purple hover:bg-brand-purple/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ClipboardPaste size={15} />
                </button>
              </div>
              {detected && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: detected.color }}
                  />
                  <span className="text-txt-secondary">{detected.label} 감지됨</span>
                </div>
              )}
              {urlError && (
                <p className="mt-2 text-[11px] text-status-error flex items-center gap-1">
                  <AlertTriangle size={12} /> {urlError}
                </p>
              )}
              <p className="mt-2 text-[11px] text-txt-muted leading-relaxed">
                ⓘ "링크가 있는 모든 사용자에게 보기 권한"이 부여된 문서만 가져올 수 있어요.
                첨부 시점의 내용이 PDF로 고정됩니다.
              </p>
              <div className="mt-2.5 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => { setUrlFormOpen(false); setUrlError(null); setUrlInput(''); }}
                  disabled={urlImporting}
                  className="px-3 py-1.5 text-xs font-medium text-txt-secondary hover:text-txt-primary disabled:opacity-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={submit}
                  disabled={urlImporting || !urlInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-purple hover:bg-brand-purple/90 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {urlImporting ? (
                    <><Loader2 size={13} className="animate-spin" /> 가져오는 중...</>
                  ) : (
                    'PDF로 가져오기'
                  )}
                </button>
              </div>
            </div>
          );
        })()}

        {/* 입력 영역: 텍스트 ↔ 음성 트랜지션 */}
        <div className="flex flex-col items-center gap-0">
          {!voiceMode ? ( <>
            {/* ── 텍스트 모드 (필 형태) ── */}
            <div className="w-full relative flex items-end gap-2 bg-bg-tertiary border border-border-subtle rounded-full pl-2 pr-2 py-2 focus-within:border-brand-purple/50 focus-within:ring-[3px] focus-within:ring-brand-purple/15 transition-all duration-500 ease-out">
              {/* + 메뉴 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                  className={`p-2 rounded-full transition-colors ${plusMenuOpen ? 'text-brand-purple bg-brand-purple/10' : 'text-txt-muted hover:text-brand-purple'}`}
                >
                  <Plus size={18} strokeWidth={2.4} />
                </button>
                {plusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPlusMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-44 bg-bg-secondary border border-border-subtle rounded-lg shadow-lg z-20 py-1">
                      <button
                        onClick={() => { setPlusMenuOpen(false); fileInputRef.current?.click(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors"
                      >
                        <Paperclip size={17} className="text-txt-muted" />
                        자료 업로드
                      </button>
                      <button
                        onClick={() => {
                          setPlusMenuOpen(false);
                          setUrlFormOpen(true);
                          setUrlError(null);
                          setUrlInput('');
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors"
                      >
                        <Link2 size={17} className="text-txt-muted" />
                        URL로 자료 추가
                      </button>
                      <button
                        onClick={() => { setPlusMenuOpen(false); setVoiceMode(true); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-txt-primary hover:bg-bg-tertiary transition-colors"
                      >
                        <Mic size={17} className="text-txt-muted" />
                        음성 모드
                      </button>
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const paste = e.clipboardData?.getData('text');
                  if (paste) {
                    e.preventDefault();
                    const ta = e.target;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    const newVal = input.slice(0, start) + paste + input.slice(end);
                    setInput(newVal);
                    requestAnimationFrame(() => {
                      ta.selectionStart = ta.selectionEnd = start + paste.length;
                    });
                  }
                }}
                placeholder="의견을 입력하세요..."
                rows={1}
                disabled={disabled}
                className="flex-1 min-w-0 bg-transparent text-sm text-txt-primary placeholder:text-txt-muted resize-none focus:outline-none py-2 max-h-32"
                onContextMenu={(e) => e.stopPropagation()}
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              />
              <button
                type="button"
                className="p-2 text-txt-muted hover:text-brand-purple transition-colors"
                onClick={() => { setInput((v) => (v ? v + ' @Milo ' : '@Milo ')); textareaRef.current?.focus(); }}
                title="Milo 호출"
              >
                <AtSign size={18} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || disabled}
                className="w-9 h-9 rounded-full bg-brand-purple text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            </div>
            <p className="text-[11px] text-txt-muted mt-2 text-center w-full">
              Enter로 전송 · Shift + Enter로 줄바꿈
            </p>
            </> ) : (
            /* ── 음성 모드 ── */
            <div className="flex flex-col items-center gap-3 transition-all duration-500 ease-out">
              {/* 음성 모드 대기 컨텍스트 — 드로잉 마커/멘션 클릭 시 표시
                  말풍선 안에 태그 + 라벨, 다음 발언이 자동으로 이 태그와 함께 전송됨 */}
              {pendingVoiceCtx && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-purple/10 border border-brand-purple/30 text-[11px] text-txt-primary shadow-sm">
                  <span className="font-semibold text-brand-purple-deep">{pendingVoiceCtx.label}</span>
                  <span className="text-txt-muted">에 답하기</span>
                  <button
                    onClick={() => setPendingVoiceCtx(null)}
                    className="-mr-0.5 ml-1 w-4 h-4 rounded-full flex items-center justify-center text-txt-muted hover:text-status-error hover:bg-status-error/10"
                    aria-label="태그 취소"
                    title="태그 취소"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}

              {/* 인식 텍스트 */}
              {(interim || isListening) && (
                <div className="px-5 py-2 rounded-full bg-bg-tertiary/80 border border-border-subtle text-sm text-txt-primary text-center max-w-[80%]">
                  {interim || <span className="text-txt-muted animate-pulse">듣고 있습니다...</span>}
                </div>
              )}

              {/* 상단: [@] 멘션 버튼 (마이크 위) */}
              <div className="flex items-center justify-center">
                <button
                  onClick={() => { setVoiceMode(false); setInput((v) => (v ? v + ' @Milo ' : '@Milo ')); textareaRef.current?.focus(); }}
                  className="w-7 h-7 rounded-full bg-bg-tertiary border border-border-subtle text-txt-muted hover:text-brand-purple hover:border-brand-purple/30 hover:scale-125 hover:shadow-md flex items-center justify-center transition-all duration-200"
                  title="Milo 호출"
                >
                  <AtSign size={15} />
                </button>
              </div>

              {/* 하단: [+] [마이크] [T] 가로 */}
              <div className="flex items-center gap-3">
                {/* + 자료 업로드 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 rounded-full bg-bg-tertiary border border-border-subtle text-txt-muted hover:text-brand-purple hover:border-brand-purple/30 hover:scale-125 hover:shadow-md flex items-center justify-center transition-all duration-200"
                  title="자료 업로드"
                >
                  <Plus size={15} />
                </button>

                {/* 마이크 — LiveKit 음성 회의 참여 중이면 mute 토글, 아니면 STT 시작/중지 */}
                <button
                  onClick={() => {
                    if (voiceConnected) {
                      // LiveKit mute 토글만 호출 — STT 는 voiceMuted 변화에 따라 useEffect 가 자동 동기화
                      onVoiceToggleMute?.();
                    } else {
                      // 기존 STT-only 동작
                      if (isListening) stopSTT();
                      else startSTT();
                    }
                  }}
                  disabled={disabled || (!voiceConnected && !sttSupported)}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-110 ${
                    voiceConnected
                      ? voiceMuted
                        ? 'bg-bg-tertiary text-txt-muted shadow-md'
                        : 'bg-status-error text-white shadow-status-error/40'
                      : isListening
                        ? 'bg-status-error text-white shadow-status-error/40'
                        : 'bg-brand-purple text-white hover:shadow-brand-purple/40'
                  } disabled:opacity-40`}
                  title={
                    voiceConnected
                      ? (voiceMuted ? '음소거 해제 (말하기 + 자막)' : '음소거')
                      : (isListening ? '발언 종료' : '발언 시작')
                  }
                >
                  {/* 활성 발언 펄스 — STT-only 또는 LiveKit unmute 시 */}
                  {((!voiceConnected && isListening) || (voiceConnected && !voiceMuted)) && (
                    <span className="absolute inset-0 rounded-full bg-status-error/30 animate-ping" />
                  )}
                  {/* 아이콘: 발언 중(활성) → Mic, 음소거(비활성) → MicOff(대각선)
                      LiveKit 모드: voiceMuted 가 진실, STT-only 모드: isListening 이 진실 */}
                  {(voiceConnected ? !voiceMuted : isListening)
                    ? <Mic size={26} />
                    : <MicOff size={26} />}
                </button>

                {/* 텍스트 모드 */}
                <button
                  onClick={() => { setVoiceMode(false); if (isListening) stopSTT(); }}
                  className="w-7 h-7 rounded-full bg-bg-tertiary border border-border-subtle text-txt-muted hover:text-txt-primary hover:border-border-hover hover:scale-125 hover:shadow-md flex items-center justify-center transition-all duration-200"
                  title="텍스트 모드"
                >
                  <Keyboard size={15} />
                </button>
              </div>

              <p className="text-[10px] text-txt-muted inline-flex items-center gap-1 flex-wrap justify-center">
                {voiceConnected ? (
                  <>
                    {voiceMuted ? '음소거 중 · 클릭 또는' : '발언 중 · 클릭 또는'}
                    <kbd
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-txt-primary border transition-all duration-300 ${
                        spaceHintGlow
                          ? 'border-border-default bg-bg-tertiary shadow-sm'
                          : 'border-transparent bg-transparent shadow-none'
                      }`}
                    >
                      Space
                    </kbd>
                    {voiceMuted ? '로 발언' : '로 음소거'}
                  </>
                ) : (
                  isListening ? '발언 중 · 클릭하여 종료' : '클릭하여 발언'
                )}
              </p>
              {sttError && <p className="text-xs text-status-error">{sttError}</p>}
              {!voiceConnected && !sttSupported && (
                <p className="text-xs text-status-error">이 브라우저에서 음성 인식이 지원되지 않습니다</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
