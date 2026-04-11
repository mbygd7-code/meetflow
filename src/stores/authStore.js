import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// JWT 페이로드에서 AMR(Authentication Methods Reference) 확인
// PKCE 플로우에서는 PASSWORD_RECOVERY 이벤트가 setTimeout(0)으로 지연 발생하므로
// getSession() 반환 시점에 JWT를 직접 디코딩하여 recovery 세션을 동기 감지
function isRecoveryFromJwt(accessToken) {
  if (!accessToken) return false;
  try {
    const base64 = accessToken.split('.')[1];
    // base64url → base64 변환
    const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(padded));
    return (
      Array.isArray(payload.amr) &&
      payload.amr.some((entry) => entry.method === 'recovery')
    );
  } catch {
    return false;
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  isPasswordRecovery: false,

  init: async () => {
    set({ loading: true });
    try {
      // ★ 리스너를 getSession() 보다 먼저 등록해야 PASSWORD_RECOVERY 이벤트를 놓치지 않음
      supabase.auth.onAuthStateChange((_event, newSession) => {
        if (_event === 'PASSWORD_RECOVERY') {
          set({ isPasswordRecovery: true, session: newSession });
          return;
        }
        // INITIAL_SESSION은 아래 getSession()에서 직접 처리
        if (_event === 'INITIAL_SESSION') return;

        set({
          session: newSession,
          isPasswordRecovery: false,
          user: newSession?.user
            ? {
                id: newSession.user.id,
                email: newSession.user.email,
                name: newSession.user.user_metadata?.name || newSession.user.email?.split('@')[0],
              }
            : null,
        });
      });

      // 초기 세션 로드
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // ★ PKCE 플로우 대응: JWT AMR에서 recovery 메서드를 동기 확인
      // PASSWORD_RECOVERY 이벤트(setTimeout 0)보다 먼저 감지하여 리다이렉트 방지
      const recoveryDetected = isRecoveryFromJwt(session?.access_token);

      set({
        session,
        isPasswordRecovery: recoveryDetected,
        user: session?.user
          ? {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0],
            }
          : null,
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message, loading: false });
      return { error };
    }
    set({ session: data.session, user: data.user, loading: false });
    return { data };
  },

  signUp: async (email, password, name) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) {
      set({ error: error.message, loading: false });
      return { error };
    }
    set({ loading: false });
    return { data };
  },

  resetPassword: async (email) => {
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/login`,
    });
    return { error };
  },

  // 새 비밀번호 업데이트 (PASSWORD_RECOVERY 세션에서 호출)
  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      set({ isPasswordRecovery: false });
      await supabase.auth.signOut();
      set({ session: null, user: null });
    }
    return { error };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  mockSignIn: (email) => {
    const mockUser = {
      id: 'mock-' + Date.now(),
      email,
      name: email?.split('@')[0] || 'Demo User',
    };
    set({ user: mockUser, session: { user: mockUser }, loading: false });
  },
}));
