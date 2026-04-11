import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

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
        set({
          session: newSession,
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
