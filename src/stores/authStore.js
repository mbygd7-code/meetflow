import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// JWT 페이로드에서 AMR(Authentication Methods Reference) 확인
function isRecoveryFromJwt(accessToken) {
  if (!accessToken) return false;
  try {
    const base64 = accessToken.split('.')[1];
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

// DB에서 유저 role 조회
async function fetchUserRole(userId) {
  if (!userId || !import.meta.env.VITE_SUPABASE_URL) return 'member';
  try {
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) return 'member';
    return data?.role || 'member';
  } catch {
    return 'member';
  }
}

// 유저 객체 생성 헬퍼
function buildUser(authUser, role = 'member') {
  if (!authUser) return null;
  return {
    id: authUser.id,
    email: authUser.email,
    name: authUser.user_metadata?.name || authUser.email?.split('@')[0],
    role,
  };
}

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,
  isPasswordRecovery: false,

  // computed
  isAdmin: () => get().user?.role === 'admin',

  init: async () => {
    set({ loading: true });
    try {
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (_event === 'PASSWORD_RECOVERY') {
          set({ isPasswordRecovery: true, session: newSession });
          return;
        }
        if (_event === 'INITIAL_SESSION') return;

        // role 비동기 페칭
        const role = newSession?.user
          ? await fetchUserRole(newSession.user.id)
          : 'member';

        set({
          session: newSession,
          isPasswordRecovery: false,
          user: buildUser(newSession?.user, role),
        });
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const recoveryDetected = isRecoveryFromJwt(session?.access_token);
      const role = session?.user
        ? await fetchUserRole(session.user.id)
        : 'member';

      set({
        session,
        isPasswordRecovery: recoveryDetected,
        user: buildUser(session?.user, role),
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
    const role = await fetchUserRole(data.user?.id);
    set({
      session: data.session,
      user: buildUser(data.user, role),
      loading: false,
    });
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

  mockSignIn: (email, role = 'member') => {
    const mockUser = {
      id: 'mock-' + Date.now(),
      email,
      name: email?.split('@')[0] || 'Demo User',
      role,
    };
    set({ user: mockUser, session: { user: mockUser }, loading: false });
  },
}));
