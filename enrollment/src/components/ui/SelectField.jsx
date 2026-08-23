function SelectField({ label, value, onChange, options = [], className = "" }) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-semibold text-slate-700 ${className}`}>
      <span>{label}</span>
      <select
        value={value}
        onChange={onChange}
        className={`h-11 rounded-xl border border-slate-200 bg-white bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%236B7280' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")] bg-[length:1rem_1rem] bg-[position:calc(100%-0.9rem)_50%] bg-no-repeat bg-white px-4 pr-11 text-sm font-medium text-slate-800 shadow-sm outline-none transition [appearance:none] focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default SelectField;