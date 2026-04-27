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

  // 드로잉 태그 이벤트 리스너 — DrawingOverlay 아바타 클릭 시 input에 태그 주입 +
  //   구조화 참조(drawing_annotations metadata)를 송신 시 포함할 수 있도록 누적.
  const [pendingDrawingRefs, setPendingDrawingRefs] = useState([]);
  const pendingDrawingRefsRef = useRef([]);
  useEffect(() => { pendingDrawingRefsRef.current = pendingDrawingRefs; }, [pendingDrawingRefs]);
  useEffect(() => {
    const handler = (e) => {
      const tag = e?.detail?.tag;
      if (!tag) return;
      setInput((prev) => {
        if (prev.includes(tag.trim())) return prev;
        const sep = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + sep + tag;
      });
      // 구조화 참조 누적 (중복 제거)
      const ref = {
        target_key: e.detail.targetKey || null,
        file_name: e.detail.fileName || null,
        user_name: e.detail.userName || null,
        seq: e.detail.seq || null,
        stroke_id: e.detail.strokeId || null,
      };
      setPendingDrawingRefs((prev) => {
        const key = `${ref.user_name}-${ref.seq}-${ref.stroke_id}`;
        if (prev.some((r) => `${r.user_name}-${r.seq}-${r.stroke_id}` === key)) return prev;
        return [...prev, ref];
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener('meetflow:drawing-tag', handler);
    return () => window.removeEventListener('meetflow:drawing-tag', handler);
  }, []);

  // STT 설정 읽기 (state로 관리하여 설정 변경 즉시 반영)
  const [sttProvider] = useState(() => {
    try { return JSON.parse(localStorage.getItem('meetflow_integrations') || '{}').sttProvider || 'web-speech'; } catch { return 'web-speech'; }
  });

  // LiveKit 음성 회의 참여 중일 때는 Google STT 경로로 강제 (LiveKit 의 MediaStream 을 분기 사용 가능).
  // 외부 회의 미참여 시엔 기존 사용자 설정(web-speech 기본) 유지.
  const effectiveSttProvider = voiceConnected ? 'google' : sttProvider;
  const { isListening, start: startSTT, stop: stopSTT, interim, error: sttError, supported: sttSupported } = useVoiceInput({
    provider: effectiveSttProvider,
    language: 'ko-KR',
    onTranscript: (text) => {
      if (text.trim()) onSend?.(text.trim());
    },
    onInterim: () => {},
    // LiveKit 활성 + Google STT 경로일 때만 외부 스트림 주입 (web-speech 는 자체 마이크 사용)
    externalStream: (voiceConnected && effectiveSttProvider === 'google') ? voiceLocalStream : null,
  });
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 메시지 리스트 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
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
              <ChatBubble key={m.id} message={m} currentUserId={user?.id} onQuote={handleQuote} onReact={handleReact} onActionClick={onSend} reactions={reactions} />
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
      <div className="relative px-6 pb-5 pt-2" style={{ background: 'var(--bg-primary)' }}>
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
                className="flex-1 bg-transparent text-sm text-txt-primary placeholder:text-txt-muted resize-none focus:outline-none py-2 max-h-32"
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
                      // LiveKit mute 토글 — STT 도 함께 토글 (unmute 시 시작, mute 시 중지)
                      const willUnmute = voiceMuted;
                      onVoiceToggleMute?.();
                      if (willUnmute) {
                        // 음소거 해제 → STT 시작 (자막)
                        if (!isListening && sttSupported) startSTT();
                      } else {
                        // 음소거 → STT 중지
                        if (isListening) stopSTT();
                      }
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
                  {(voiceConnected ? voiceMuted : !isListening) ? <Mic size={26} /> : <MicOff size={26} />}
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

              <p className="text-[10px] text-txt-muted">
                {voiceConnected
                  ? (voiceMuted ? '음소거 중 · 클릭하면 발언 + 자막' : '발언 중 · 클릭하여 음소거')
                  : (isListening ? '발언 중 · 클릭하여 종료' : '클릭하여 발언')}
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
