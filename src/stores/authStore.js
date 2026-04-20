import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { clearOnLogout, handleUserChange } from '@/lib/sessionCleanup';

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
  isDemo: () => get().user?.id?.startsWith('mock-'),

  init: async () => {
    set({ loading: true });
    try {
      // ★ 콜백은 반드시 동기 — async/await 사용 시 Supabase 내부 auth lock과
      // 데이터 쿼리의 token 획득이 충돌하여 deadlock 발생
      supabase.auth.onAuthStateChange((_event, newSession) => {
        if (_event === 'PASSWORD_RECOVERY') {
          set({ isPasswordRecovery: true, session: newSession });
          return;
        }
        if (_event === 'INITIAL_SESSION') return;

        // ★ 사용자 변경 감지: 이전 사용자와 다르면 localStorage 정리
        const newUserId = newSession?.user?.id || null;
        handleUserChange(newUserId);

        // 동기적으로 user 세팅 (role 없이 먼저)
        set({
          session: newSession,
          isPasswordRecovery: false,
          user: buildUser(newSession?.user),
        });

        // role은 lock 해제 후 비동기로 후속 업데이트
        if (newSession?.user) {
          fetchUserRole(newSession.user.id).then((role) => {
            set((s) => ({ user: s.user ? { ...s.user, role } : null }));
          });
        }
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      // ★ 앱 초기 로드 시에도 사용자 변경 감지 (브라우저 재시작 후 다른 계정으로 로그인한 경우)
      handleUserChange(session?.user?.id || null);

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
    // ★ 로그인 성공 시 사용자 변경 감지 & 이전 데이터 정리
    const cleared = handleUserChange(data.user?.id || null);
    const role = await fetchUserRole(data.user?.id);
    set({
      session: data.session,
      user: buildUser(data.user, role),
      loading: false,
    });
    // ★ 다른 사용자로 전환된 경우: 페이지 리로드로 Zustand 메모리 상태까지 초기화
    if (cleared && typeof window !== 'undefined') {
      setTimeout(() => {
        window.location.href = '/';
      }, 200);
    }
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
    // ★ 로그아웃 시 모든 meetflow localStorage/sessionStorage 정리
    clearOnLogout();
    set({ session: null, user: null });
    // 페이지 새로고침으로 Zustand 스토어 상태까지 완전 초기화 (잔재 상태 방지)
    // → 다른 계정 로그인 시 이전 메모리 상태가 일시적으로 보이는 것 방지
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
    }
  },

  mockSignIn: (email, role = 'member') => {
    // localStorage 관리자 목록에서 role 자동 감지
    let finalRole = role;
    if (finalRole === 'member') {
      try {
        const admins = JSON.parse(localStorage.getItem('meetflow-admin-users') || '[]');
        if (admins.some((a) => a.email === email)) finalRole = 'admin';
      } catch {}
    }
    const mockUser = {
      id: 'mock-' + Date.now(),
      email,
      name: email?.split('@')[0] || 'Demo User',
      role: finalRole,
    };
    // ★ 데모 로그인도 사용자 변경 감지
    handleUserChange(mockUser.id);
    set({ user: mockUser, session: { user: mockUser }, loading: false });
  },
}));
