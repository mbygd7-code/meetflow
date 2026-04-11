import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  isPasswordRecovery: false, // 비밀번호 재설정 링크 클릭 후 복구 모드

  init: async () => {
    set({ loading: true });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      set({
        session,
        user: session?.user
          ? {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.name || session.user.email?.split('@')[0],
            }
          : null,
        loading: false,
      });

      supabase.auth.onAuthStateChange((_event, newSession) => {
        if (_event === 'PASSWORD_RECOVERY') {
          // 비밀번호 재설정 링크 클릭 — 새 비밀번호 입력 화면으로 전환
          set({ isPasswordRecovery: true, session: newSession });
          return;
        }
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

  // 새 비밀번호로 업데이트 (PASSWORD_RECOVERY 세션에서 호출)
  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      // 업데이트 완료 후 세션 초기화 → 재로그인 유도
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

  // 데모 목적: Supabase 없이 로컬 세션으로 로그인 (개발 편의)
  mockSignIn: (email) => {
    const mockUser = {
      id: 'mock-' + Date.now(),
      email,
      name: email?.split('@')[0] || 'Demo User',
    };
    set({ user: mockUser, session: { user: mockUser }, loading: false });
  },
}));
