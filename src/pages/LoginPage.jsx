import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button, Input } from '@/components/ui';

export default function LoginPage() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState(null);
  const [busy, setBusy] = useState(false);
  const { signIn, signUp, mockSignIn } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          // Supabase 미설정 시 데모 모드로 우회
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
        setLocalError('가입 완료! 이메일을 확인한 뒤 로그인해주세요.');
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
          {/* 탭 */}
          <div className="flex gap-1 mb-6 p-1 bg-bg-tertiary rounded-md">
            {['signin', 'signup'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setLocalError(null);
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
            <Input
              label="패스워드"
              icon={Lock}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {localError && (
              <p className="text-xs text-status-error bg-status-error/10 border border-status-error/20 rounded-md px-3 py-2">
                {localError}
              </p>
            )}
            <Button
              type="submit"
              variant="gradient"
              size="lg"
              loading={busy}
              className="w-full"
            >
              {mode === 'signin' ? '로그인' : '회원가입'}
            </Button>
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
        </div>
      </div>
    </div>
  );
}
