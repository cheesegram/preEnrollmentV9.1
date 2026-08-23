function CheckboxField({ label, checked, onChange, className = "" }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm font-medium text-slate-700 ${className}`}>
      <span className="relative flex h-4.5 w-4.5 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer h-4.5 w-4.5 appearance-none rounded border border-slate-300 bg-white outline-none transition checked:border-emerald-800 checked:bg-emerald-800 focus:ring-4 focus:ring-emerald-500/15"
        />
        <i className="fa-solid fa-check pointer-events-none absolute text-[0.55rem] text-white opacity-0 transition peer-checked:opacity-100" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export default CheckboxField;