import { Check, Clock } from 'lucide-react';

export default function AgendaBar({ agendas = [], activeId, onSelect }) {
  if (!agendas.length) return null;

  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-border-divider bg-bg-primary overflow-x-auto">
      {agendas.map((a, i) => {
        const isActive = a.status === 'active' || a.id === activeId;
        const isDone = a.status === 'completed';
        return (
          <button
            key={a.id}
            onClick={() => onSelect?.(a.id)}
            className={`
              shrink-0 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all
              ${
                isActive
                  ? 'bg-brand-purple/[0.14] text-txt-primary border border-brand-purple/40'
                  : isDone
                    ? 'text-txt-secondary hover:text-txt-primary'
                    : 'text-txt-muted hover:text-txt-secondary'
              }
            `}
          >
            {isDone ? (
              <span className="w-4 h-4 rounded-full bg-status-success/20 flex items-center justify-center">
                <Check size={12} className="text-status-success" strokeWidth={3} />
              </span>
            ) : (
              <span
                className={`w-4 h-4 rounded-full border text-[9px] flex items-center justify-center ${
                  isActive
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-border-default'
                }`}
              >
                {i + 1}
              </span>
            )}
            <span>{a.title}</span>
            <span className="flex items-center gap-0.5 text-txt-muted">
              <Clock size={12} />
              {a.duration_minutes}분
            </span>
          </button>
        );
      })}
    </div>
  );
}
