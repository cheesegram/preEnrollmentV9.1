function ScheduleSummaryCard({ icon, label, value, caption, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
          <i className={icon} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {caption && <p className="mt-1 text-sm text-slate-500">{caption}</p>}
        </div>
      </div>
    </div>
  );
}

export default ScheduleSummaryCard;