import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Sparkles, HelpCircle, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input } from '@/components/ui';
import SlackIdHelpModal from '@/components/common/SlackIdHelpModal';
import { supabase } from '@/lib/supabase';

// URL 해시/쿼리에서 type=recovery 여부를 동기적으로 감지
// — onAuthStateChange 이벤트보다 먼저 실행되므로 첫 렌더링부터 복구 폼을 표시할 수 있음
function detectRecoveryFromUrl() {
  try {
    // 해시 방식: /login#access_token=...&type=recovery
    const hash = window.location.hash.slice(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      if (hashParams.get('type') === 'recovery') return true;
    }
    // 쿼리 방식: /login?type=recovery
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('type') === 'recovery') return true;
  } catch {
    // SSR 등 예외 상황 무시
  }
  return false;
}

export default function LoginPage() {
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  // 최근 사용 이메일 목록 — localStorage 에 최대 5개 보관
  const [recentEmails, setRecentEmails] = useState(() => {
    try {
      const raw = localStorage.getItem('meetflow_recent_emails');
      if (raw) return JSON.parse(raw);
      // 호환 — 옛 단일 이메일 키
      const single = localStorage.getItem('meetflow_last_email');
      return single ? [single] : [];
    } catch { return []; }
  });
  const [email, setEmail] = useState(() => recentEmails[0] || '');
  const [emailDropdownOpen, setEmailDropdownOpen] = useState(false);

  // 이메일 추가/dedup/저장 — 최대 5개, 가장 최근이 맨 앞
  const saveEmailToHistory = (val) => {
    const v = (val || '').trim().toLowerCase();
    if (!v) return;
    setRecentEmails((prev) => {
      const list = [v, ...prev.filter((e) => e !== v)].slice(0, 5);
      try {
        localStorage.setItem('meetflow_recent_emails', JSON.stringify(list));
        localStorage.setItem('meetflow_last_email', v); // 호환 유지
      } catch {}
      return list;
    });
  };
  const removeEmailFromHistory = (val) => {
    setRecentEmails((prev) => {
      const list = prev.filter((e) => e !== val);
      try { localStorage.setItem('meetflow_recent_emails', JSON.stringify(list)); } catch {}
      return list;
    });
  };
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [slackId, setSlackId] = useState('');
  const [slackHelpOpen, setSlackHelpOpen] = useState(false);
  const [showPasswordGuide, setShowPasswordGuide] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const passwordIdleTimerRef = useRef(null);
  // 빈 필드 하이라이트 — 사용자가 빈 칸으로 회원가입 누르면 해당 칸 빨간 테두리 + 흔들림
  const [missingFields, setMissingFields] = useState(new Set());

  // 언마운트 시 idle 타이머 정리
  useEffect(() => {
    return () => {
      if (passwordIdleTimerRef.current) clearTimeout(passwordIdleTimerRef.current);
    };
  }, []);

  // 패스워드 유효성 검사 — 부족한 항목을 구체적으로 안내
  const validatePassword = (pw) => {
    if (!pw) return null;
    const missing = [];
    if (pw.length < 6) missing.push(`6자 이상 필요 (현재 ${pw.length}자)`);
    if (!/[A-Z]/.test(pw)) missing.push('영문 대문자 (A-Z)');
    if (!/[a-z]/.test(pw)) missing.push('영문 소문자 (a-z)');
    if (!/[0-9]/.test(pw)) missing.push('숫자 (0-9)');
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) missing.push('특수문자 (! @ # $ %)');
    return missing.length > 0 ? missing : null;
  };
  const [localError, setLocalError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [recoveryCompleted, setRecoveryCompleted] = useState(false);

  // ★ 첫 렌더링 시 URL을 동기적으로 확인 — 비동기 이벤트보다 앞서 복구 폼 결정
  const [urlRecovery] = useState(detectRecoveryFromUrl);

  const {
    signIn, signUp, resetPassword, updatePassword, mockSignIn,
    isPasswordRecovery, user, loading,
  } = useAuthStore();
  const navigate = useNavigate();

  // URL 감지 OR 스토어 이벤트 감지 중 하나라도 true면 복구 모드
  // (비밀번호 변경 완료 후 "다시 로그인" 클릭 시 recoveryCompleted로 해제)
  const isRecovery = !recoveryCompleted && (urlRecovery || isPasswordRecovery);

  // 이미 로그인된 사용자가 /login 접근 시 대시보드로 이동
  // (단, 비밀번호 복구 흐름 중이면 유지)
  useEffect(() => {
    if (!loading && user && !isRecovery) {
      navigate('/', { replace: true });
    }
  }, [user, loading, isRecovery, navigate]);

  // ── 새 비밀번호 설정 (PASSWORD_RECOVERY 흐름) ──────────────────────
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);
    if (newPassword.length < 6) {
      setLocalError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setLocalError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    try {
      // 비밀번호 변경 전에 이메일 캡처 (updatePassword → signOut 후 user가 null)
      const currentEmail = user?.email || '';
      const { error } = await updatePassword(newPassword);
      if (error) {
        setLocalError(error.message);
        return;
      }
      setSuccessMsg('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
      setPasswordChanged(true);
      setEmail(currentEmail);
    } finally {
      setBusy(false);
    }
  };

  // 비밀번호 변경 완료 후 → 로그인 폼으로 전환 (이메일 유지)
  const handleGoToLogin = () => {
    setRecoveryCompleted(true);
    setMode('signin');
    setPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setLocalError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);

    // 빈 필드 검사 — signup / signin / reset 별로 다름
    const missing = new Set();
    if (mode === 'signup') {
      if (!name.trim()) missing.add('name');
      if (!email.trim()) missing.add('email');
      if (!password) missing.add('password');
      if (!slackId.trim()) missing.add('slackId');
    } else if (mode === 'signin') {
      if (!email.trim()) missing.add('email');
      if (!password) missing.add('password');
    } else if (mode === 'reset') {
      if (!email.trim()) missing.add('email');
    }
    if (missing.size > 0) {
      setMissingFields(missing);
      // 첫 번째 빈 필드로 포커스 이동
      const order = ['name', 'email', 'password', 'slackId'];
      const first = order.find((f) => missing.has(f));
      if (first) {
        const el = document.querySelector(`[data-field="${first}"]`);
        if (el) el.focus();
      }
      // 2초 후 자동으로 하이라이트 사라짐 — 사용자 입력으로도 즉시 사라짐
      setTimeout(() => setMissingFields(new Set()), 2000);
      return; // 제출 중단
    }
    setMissingFields(new Set());

    setBusy(true);
    try {
      if (mode === 'reset') {
        if (!email.trim()) {
          setLocalError('이메일을 입력해주세요.');
          return;
        }
        const { error } = await resetPassword(email);
        if (error) {
          setLocalError(error.message);
          return;
        }
        setSuccessMsg('비밀번호 재설정 링크가 이메일로 전송되었습니다. 메일함을 확인해주세요.');
        return;
      }
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          if (!import.meta.env.VITE_SUPABASE_URL) {
            mockSignIn(email || 'demo@meetflow.ai');
            navigate('/');
            return;
          }
          setLocalError(error.message);
          return;
        }
        saveEmailToHistory(email);
        navigate('/');
      } else {
        const { data: signUpData, error } = await signUp(email, password, name);
        if (error) {
          if (!import.meta.env.VITE_SUPABASE_URL) {
            mockSignIn(email || 'demo@meetflow.ai');
            navigate('/');
            return;
          }
          setLocalError(error.message);
          return;
        }
        // Slack ID 입력했으면 users 테이블에 저장 (signUp 직후 user 가 만들어졌을 때)
        if (slackId.trim()) {
          const userId = signUpData?.user?.id;
          if (userId) {
            try {
              await supabase.from('users').update({ slack_user_id: slackId.trim() }).eq('id', userId);
            } catch (e) {
              console.warn('[signUp] Slack ID 저장 실패:', e);
            }
          }
        }
        saveEmailToHistory(email);
        setSuccessMsg('가입 완료! 이메일을 확인한 뒤 로그인해주세요.');
        setMode('signin');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = () => {
    mockSignIn('demo@meetflow.ai', 'admin');
    navigate('/');
  };

  return (
    <div className="relative min-h-screen w-full bg-bg-primary text-white overflow-hidden flex items-center justify-center p-6">
      {/* 배경 블롭 */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-brand-purple/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-[520px] h-[520px] rounded-full bg-brand-orange/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-brand-purple-deep/15 blur-[140px]" />

      {/* 로그인 카드 */}
      <div className="relative w-full max-w-md">
        {/* 로고 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-brand shadow-glow flex items-center justify-center mb-4">
            <Sparkles size={24} className="text-white" strokeWidth={2.4} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">MeetFlow</h1>
          <p className="text-sm text-txt-secondary mt-2">
            AI 팀원 Milo와 함께하는 스마트 회의
          </p>
        </div>

        <div className="bg-bg-secondary border border-border-subtle rounded-[8px] p-8 shadow-lg">

          {/* ── 비밀번호 재설정 완료 화면 (이메일 링크 클릭 후) ── */}
          {isRecovery ? (
            <>
              <div className="mb-6">
                <h3 className="text-base font-semibold text-txt-primary mb-1">
                  {passwordChanged ? '비밀번호 변경 완료' : '새 비밀번호 설정'}
                </h3>
                <p className="text-xs text-txt-secondary">
                  {passwordChanged
                    ? '새 비밀번호로 다시 로그인해주세요.'
                    : '사용할 새 비밀번호를 입력해주세요.'}
                </p>
              </div>

              {!passwordChanged ? (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <Input
                    label="새 비밀번호"
                    icon={Lock}
                    type="password"
                    placeholder="6자 이상"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <Input
                    label="새 비밀번호 확인"
                    icon={Lock}
                    type="password"
                    placeholder="동일하게 입력"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    required
                  />
                  {localError && (
                    <p className="text-xs text-status-error bg-status-error/10 border border-status-error/20 rounded-md px-3 py-2">
                      {localError}
                    </p>
                  )}
                  {successMsg && (
                    <p className="text-xs text-status-success bg-status-success/10 border border-status-success/20 rounded-md px-3 py-2">
                      {successMsg}
                    </p>
                  )}
                  <Button
                    type="submit"
                    variant="gradient"
                    size="lg"
                    loading={busy}
                    className="w-full"
                  >
                    비밀번호 변경
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-status-success bg-status-success/10 border border-status-success/20 rounded-md px-3 py-2">
                    비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.
                  </p>
                  <Button
                    variant="gradient"
                    size="lg"
                    onClick={handleGoToLogin}
                    className="w-full"
                  >
                    다시 로그인
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* 탭 */}
              {mode !== 'reset' && (
                <div className="flex gap-1 mb-6 p-1 bg-bg-tertiary rounded-md">
                  {['signin', 'signup'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setLocalError(null);
                        setSuccessMsg(null);
                      }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
                        mode === m
                          ? 'bg-bg-secondary text-txt-primary shadow-sm'
                          : 'text-txt-secondary hover:text-txt-primary'
                      }`}
                    >
                      {m === 'signin' ? '로그인' : '회원가입'}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'reset' && (
                <div className="mb-6">
                  <h3 className="text-base font-semibold text-txt-primary mb-1">비밀번호 찾기</h3>
                  <p className="text-xs text-txt-secondary">가입한 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <Input
                    label="이름"
                    icon={User}
                    placeholder="홍길동"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (missingFields.has('name')) {
                        const next = new Set(missingFields); next.delete('name'); setMissingFields(next);
                      }
                    }}
                    error={missingFields.has('name') ? '이름을 입력해주세요' : null}
                    data-field="name"
                  />
                )}
                <div className="relative">
                  <Input
                    label="이메일"
                    icon={Mail}
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (missingFields.has('email')) {
                        const next = new Set(missingFields); next.delete('email'); setMissingFields(next);
                      }
                    }}
                    onFocus={() => {
                      if (recentEmails.length > 0) setEmailDropdownOpen(true);
                    }}
                    onBlur={() => {
                      // 드롭다운 클릭 처리를 위해 약간 지연
                      setTimeout(() => setEmailDropdownOpen(false), 150);
                    }}
                    error={missingFields.has('email') ? '이메일을 입력해주세요' : null}
                    data-field="email"
                    autoComplete="off"
                    readOnly={mode === 'signin' && recoveryCompleted && !!email}
                    className={`${mode === 'signin' && recoveryCompleted && email ? 'opacity-70' : ''} ${missingFields.has('email') ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}
                  />
                  {/* 최근 이메일 드롭다운 */}
                  {emailDropdownOpen && recentEmails.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-bg-secondary border border-border-default rounded-md shadow-lg overflow-hidden">
                      <div className="px-3 py-1.5 text-[10px] text-txt-muted bg-bg-primary/40 border-b border-border-subtle">
                        최근 사용 이메일
                      </div>
                      {recentEmails
                        .filter((e) => !email || e.toLowerCase().includes(email.toLowerCase()))
                        .map((e) => (
                          <div
                            key={e}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-bg-tertiary cursor-pointer group/item"
                            onMouseDown={(ev) => {
                              ev.preventDefault();
                              setEmail(e);
                              setEmailDropdownOpen(false);
                              // 패스워드 입력으로 자동 포커스
                              setTimeout(() => {
                                const pw = document.querySelector('[data-field="password"]');
                                if (pw) pw.focus();
                              }, 0);
                            }}
                          >
                            <Mail size={13} className="text-txt-muted shrink-0" />
                            <span className="flex-1 text-sm text-txt-primary truncate">{e}</span>
                            <button
                              type="button"
                              onMouseDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); removeEmailFromHistory(e); }}
                              className="opacity-0 group-hover/item:opacity-100 text-txt-muted hover:text-status-error transition-opacity"
                              title="목록에서 제거"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                {mode !== 'reset' && (
                  <div
                    className="relative"
                    onMouseEnter={() => {
                      // 회원가입 모드 + 에러 없음 + (패스워드 비어있거나 유효하지 않은 경우에만) 가이드 표시
                      if (mode !== 'signup' || passwordError) return;
                      const isValid = password && !validatePassword(password);
                      if (!isValid) setShowPasswordGuide(true);
                    }}
                    onMouseLeave={() => setShowPasswordGuide(false)}
                  >
                    <Input
                      label="패스워드"
                      icon={Lock}
                      type="password"
                      placeholder={mode === 'signup' ? 'Meetflow1!' : '••••••••'}
                      value={password}
                      data-field="password"
                      error={missingFields.has('password') ? '패스워드를 입력해주세요' : null}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError(null);
                        setShowPasswordGuide(false);
                        if (missingFields.has('password')) {
                          const next = new Set(missingFields); next.delete('password'); setMissingFields(next);
                        }
                        if (mode === 'signup') {
                          if (passwordIdleTimerRef.current) clearTimeout(passwordIdleTimerRef.current);
                          passwordIdleTimerRef.current = setTimeout(() => {
                            const err = validatePassword(e.target.value);
                            if (err) setPasswordError(err);
                          }, 3000);
                        }
                      }}
                      onFocus={() => {
                        setShowPasswordGuide(false);
                        setPasswordError(null);
                      }}
                      onBlur={() => {
                        if (mode === 'signup') {
                          if (passwordIdleTimerRef.current) clearTimeout(passwordIdleTimerRef.current);
                          const err = validatePassword(password);
                          if (err) setPasswordError(err);
                        }
                      }}
                    />
                    {/* 패스워드 가이드 — hover 시 노출, 클릭(focus)/leave/에러발생 시 숨김 */}
                    {mode === 'signup' && showPasswordGuide && !passwordError && (
                      <div className="absolute z-20 left-0 right-0 mt-1 px-3 py-2 rounded-md bg-bg-secondary border border-border-default shadow-lg pointer-events-none">
                        <p className="text-[11px] text-txt-secondary">
                          🔒 영문 대·소문자 + 숫자 + 특수문자 조합 6자 이상
                        </p>
                      </div>
                    )}
                    {/* 패스워드 에러 — 빨간색 경고 (idle 3초 또는 blur 시) */}
                    {mode === 'signup' && passwordError && (
                      <div className="absolute z-20 left-0 right-0 mt-1 px-3 py-2.5 rounded-md bg-bg-secondary border border-status-error shadow-lg">
                        <ul className="text-[11px] text-status-error space-y-1">
                          {(Array.isArray(passwordError) ? passwordError : [passwordError]).map((item, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="shrink-0">⚠️</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {mode === 'signup' && (
                  <div className="pt-4 border-t border-border-subtle">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wider">
                        Slack ID <span className="text-[9px] text-txt-muted/70 font-normal normal-case tracking-normal">(DM 알림 받기)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setSlackHelpOpen(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-txt-muted hover:text-brand-purple transition-colors"
                      >
                        <HelpCircle size={12} />
                        ID 찾는 방법
                      </button>
                    </div>
                    <input
                      type="text"
                      value={slackId}
                      data-field="slackId"
                      onChange={(e) => {
                        setSlackId(e.target.value);
                        if (missingFields.has('slackId')) {
                          const next = new Set(missingFields); next.delete('slackId'); setMissingFields(next);
                        }
                      }}
                      placeholder="U09XXXXXXX"
                      className={`w-full bg-bg-tertiary border rounded-md px-3 py-2.5 text-sm text-txt-primary placeholder-txt-muted focus:outline-none focus:ring-[3px] transition-colors font-mono ${
                        missingFields.has('slackId')
                          ? 'border-status-error focus:border-status-error focus:ring-status-error/15 animate-[shake_0.3s_ease-in-out]'
                          : 'border-border-subtle focus:border-brand-purple/50 focus:ring-brand-purple/15'
                      }`}
                    />
                    {missingFields.has('slackId') && (
                      <p className="mt-1.5 text-xs text-status-error">Slack ID를 입력해주세요</p>
                    )}
                  </div>
                )}
                {mode === 'signin' && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => { setMode('reset'); setLocalError(null); setSuccessMsg(null); }}
                      className="text-xs text-txt-muted hover:text-brand-purple transition-colors"
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                  </div>
                )}
                {localError && (
                  <p className="text-xs text-status-error bg-status-error/10 border border-status-error/20 rounded-md px-3 py-2">
                    {localError}
                  </p>
                )}
                {successMsg && (
                  <p className="text-xs text-status-success bg-status-success/10 border border-status-success/20 rounded-md px-3 py-2">
                    {successMsg}
                  </p>
                )}
                <div className={mode === 'signup' ? 'pt-8' : ''}>
                  <Button
                    type="submit"
                    variant="gradient"
                    size="lg"
                    loading={busy}
                    className="w-full"
                  >
                    {mode === 'signin' ? '로그인' : mode === 'signup' ? '회원가입' : '재설정 링크 보내기'}
                  </Button>
                </div>
                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setLocalError(null); setSuccessMsg(null); }}
                    className="w-full text-center text-xs text-txt-muted hover:text-txt-primary transition-colors py-1"
                  >
                    ← 로그인으로 돌아가기
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>

      {/* Slack ID 도움말 모달 */}
      <SlackIdHelpModal open={slackHelpOpen} onClose={() => setSlackHelpOpen(false)} />
    </div>
  );
}
