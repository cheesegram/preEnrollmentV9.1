const TONE_CLASSES = {
  solid: "border-emerald-900 bg-emerald-900 text-white shadow-sm hover:bg-emerald-800",
  soft: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  outline: "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900",
};

function ActionButton({ tone = "outline", className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${TONE_CLASSES[tone] ?? TONE_CLASSES.outline} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default ActionButton;