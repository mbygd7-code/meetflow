import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const STYLES = {
  success: 'bg-status-success/15 border-status-success/30 text-status-success',
  error: 'bg-status-error/15 border-status-error/30 text-status-error',
  info: 'bg-brand-purple/15 border-brand-purple/30 text-brand-purple',
};

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-[12px] border backdrop-blur-md shadow-lg animate-slide-in ${STYLES[toast.type] || STYLES.info}`}
          >
            <Icon size={18} className="shrink-0" />
            <p className="text-sm font-medium text-white flex-1">{toast.message}</p>
          </div>
        );
      })}
    </div>
  );
}
