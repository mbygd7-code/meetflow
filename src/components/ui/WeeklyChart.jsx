export default function WeeklyChart({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end justify-between gap-3 h-28 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-brand-purple-deep via-brand-purple to-brand-orange transition-all hover:opacity-80"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: '4px' }}
          />
          <span className="text-[10px] text-txt-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
