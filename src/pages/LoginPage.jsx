import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input } from '@/components/ui';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // ★ 첫 렌더링 시 URL을 동기적으로 확인 — 비동기 이벤트보다 앞서 복구 폼 결정
  const [urlRecovery] = useState(detectRecoveryFromUrl);

  const {
    signIn, signUp, resetPassword, updatePassword, mockSignIn,
    isPasswordRecovery, user, loading,
  } = useAuthStore();
  const navigate = useNavigate();

  // URL 감지 OR 스토어 이벤트 감지 중 하나라도 true면 복구 모드
  const isRecovery = urlRecovery || isPasswordRecovery;

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
      const { error } = await updatePassword(newPassword);
      if (error) {
        setLocalError(error.message);
        return;
      }
      setSuccessMsg('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);
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
        navigate('/');
      } else {
        const { error } = await signUp(email, password, name);
        if (error) {
          if (!import.meta.env.VITE_SUPABASE_URL) {
            mockSignIn(email || 'demo@meetflow.ai');
            navigate('/');
            return;
          }
          setLocalError(error.message);
          return;
        }
        setSuccessMsg('가입 완료! 이메일을 확인한 뒤 로그인해주세요.');
        setMode('signin');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDemo = () => {
    mockSignIn('demo@meetflow.ai');
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
                <h3 className="text-base font-semibold text-txt-primary mb-1">새 비밀번호 설정</h3>
                <p className="text-xs text-txt-secondary">사용할 새 비밀번호를 입력해주세요.</p>
              </div>
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
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                )}
                <Input
                  label="이메일"
                  icon={Mail}
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                {mode !== 'reset' && (
                  <Input
                    label="패스워드"
                    icon={Lock}
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
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
                <Button
                  type="submit"
                  variant="gradient"
                  size="lg"
                  loading={busy}
                  className="w-full"
                >
                  {mode === 'signin' ? '로그인' : mode === 'signup' ? '회원가입' : '재설정 링크 보내기'}
                </Button>
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

              <div className="relative my-5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-subtle" />
                </div>
                <span className="relative inline-block px-3 bg-bg-secondary text-xs text-txt-muted">
                  또는
                </span>
              </div>

              <Button
                variant="secondary"
                size="lg"
                onClick={handleDemo}
                className="w-full"
              >
                데모 계정으로 바로 시작
              </Button>

              <p className="mt-6 text-center text-xs text-txt-muted">
                계속 진행 시 MeetFlow의 이용약관에 동의합니다.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
