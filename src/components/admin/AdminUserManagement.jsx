import { useState, useEffect } from 'react';
import { Shield, X, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Avatar, Button, Input } from '@/components/ui';
import { useToastStore } from '@/stores/toastStore';

const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL;
const LOCAL_ADMINS_KEY = 'meetflow-admin-users';

function loadLocalAdmins() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_ADMINS_KEY) || '[]');
  } catch { return []; }
}
function saveLocalAdmins(admins) {
  localStorage.setItem(LOCAL_ADMINS_KEY, JSON.stringify(admins));
}

export default function AdminUserManagement() {
  const [adminUsers, setAdminUsers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const { user } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    if (!SUPABASE_ENABLED) {
      // 데모 모드: localStorage + 현재 사용자
      const locals = loadLocalAdmins();
      const currentAdmin = user ? { id: user.id, email: user.email, name: user.name, avatar_color: '#723CEB' } : null;
      const all = currentAdmin ? [currentAdmin, ...locals.filter(u => u.id !== currentAdmin.id)] : locals;
      setAdminUsers(all);
      return;
    }
    const { data } = await supabase
      .from('users')
      .select('id, email, name, avatar_color')
      .eq('role', 'admin');
    setAdminUsers(data || []);
  }

  const handleAdd = async () => {
    if (!newEmail.trim()) return;
    setBusy(true);
    try {
      if (!SUPABASE_ENABLED) {
        // 데모 모드: 로컬에 추가
        const email = newEmail.trim();
        const locals = loadLocalAdmins();
        if (locals.some(u => u.email === email) || email === user?.email) {
          addToast('이미 관리자로 등록된 이메일입니다.', 'error');
          return;
        }
        const newAdmin = {
          id: 'admin-' + Date.now(),
          email,
          name: email.split('@')[0],
          avatar_color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
        };
        const updated = [...locals, newAdmin];
        saveLocalAdmins(updated);
        addToast(`${newAdmin.name}을(를) 관리자로 추가했습니다.`, 'success');
        setNewEmail('');
        loadAdmins();
        return;
      }

      const { data: targetUser, error: findErr } = await supabase
        .from('users')
        .select('id, email, name')
        .eq('email', newEmail.trim())
        .single();

      if (findErr || !targetUser) {
        addToast('등록되지 않은 이메일입니다. 가입된 사용자만 추가할 수 있습니다.', 'error');
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({ role: 'admin' })
        .eq('id', targetUser.id);

      if (error) {
        addToast(`관리자 추가 실패: ${error.message}`, 'error');
        return;
      }

      addToast(`${targetUser.name || targetUser.email}을(를) 관리자로 추가했습니다.`, 'success');
      setNewEmail('');
      loadAdmins();
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (targetId) => {
    if (targetId === user?.id) {
      addToast('본인은 관리자에서 제거할 수 없습니다.', 'error');
      return;
    }

    if (!SUPABASE_ENABLED) {
      const locals = loadLocalAdmins().filter(u => u.id !== targetId);
      saveLocalAdmins(locals);
      addToast('관리자 권한을 제거했습니다.', 'success');
      loadAdmins();
      return;
    }

    const { error } = await supabase
      .from('users')
      .update({ role: 'member' })
      .eq('id', targetId);

    if (error) {
      addToast(`관리자 제거 실패: ${error.message}`, 'error');
      return;
    }
    addToast('관리자 권한을 제거했습니다.', 'success');
    loadAdmins();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={14} className="text-brand-purple" />
        <h4 className="text-xs font-semibold text-txt-primary">관리자 계정 관리</h4>
      </div>

      {/* 현재 admin 목록 */}
      <div className="space-y-2">
        {adminUsers.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between p-2.5 bg-bg-primary rounded-md border border-border-subtle"
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={u.name || 'U'} color={u.avatar_color} size="sm" />
              <div>
                <p className="text-xs font-medium text-txt-primary">{u.name}</p>
                <p className="text-[10px] text-txt-muted">{u.email}</p>
              </div>
            </div>
            {u.id !== user?.id && (
              <button
                onClick={() => handleRemove(u.id)}
                className="p-1.5 rounded text-txt-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
                title="관리자 제거"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 새 admin 추가 */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            icon={UserPlus}
            placeholder="admin으로 등록할 이메일"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
        </div>
        <Button variant="primary" size="sm" onClick={handleAdd} loading={busy}>
          추가
        </Button>
      </div>
    </div>
  );
}
