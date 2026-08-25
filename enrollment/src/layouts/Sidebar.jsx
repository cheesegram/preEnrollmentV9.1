import { useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import logo from "../assets/iitilogo.png";
import { navigationItems } from "../config/navigation";

function Sidebar({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  const navigate = useNavigate();

  const handleLogout = () => {
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("adminUser");
    navigate("/login", { replace: true });
  };

  const handleClose = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    onClose();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation overlay"
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          }`}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[18rem] max-w-[86vw] flex-col overflow-hidden border-r border-emerald-950/20 bg-[#173c2c] text-white shadow-2xl transition-transform duration-300 md:max-w-none md:translate-x-0 md:shadow-none ${open ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="relative overflow-hidden border-b border-white/10 px-6 pb-6 pt-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-300/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-white/5" aria-hidden="true" />

          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 z-30 grid h-10 w-10 touch-manipulation place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95 md:hidden"
            aria-label="Close navigation"
          >
            <i className="fa-solid fa-xmark pointer-events-none" aria-hidden="true" />
          </button>

          <div className="relative z-10 flex items-center gap-3.5 pr-6">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white p-1 shadow-md shadow-black/20">
              <img src={logo} alt="IITI logo" className="h-full w-full object-contain rounded-full" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold tracking-tight text-white leading-none">IITI</p>
              <p className="mt-1 whitespace-nowrap text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-100/80">
                Enrollment System
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-emerald-100/45">
            Main menu
          </p>
          <nav className="mt-3" aria-label="Main navigation">
            <ul className="space-y-1">
              {navigationItems.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-all ${isActive
                        ? "bg-white text-[#173c2c] font-bold shadow-md shadow-black/10"
                        : "text-emerald-50/80 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${isActive ? "bg-emerald-100 text-[#173c2c]" : "bg-white/10 text-emerald-100 group-hover:bg-white/20"
                            }`}
                        >
                          <i className={`${item.icon} text-sm`} />
                        </span>
                        <span className="truncate text-sm font-semibold">{item.shortLabel}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl bg-white/8 p-3.5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-[#173c2c]">
                AD
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Administrator</p>
                <p className="truncate text-xs text-emerald-100/50">Enrollment Office</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="grid h-10 w-10 place-items-center rounded-xl text-emerald-100 transition hover:bg-white/10 hover:text-white"
                aria-label="Log out"
                title="Log out"
              >
                <i className="fa-solid fa-arrow-right-from-bracket" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
