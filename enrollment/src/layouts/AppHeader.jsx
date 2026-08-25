import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Modal from "../components/Modal";
import { getNavigationItem } from "../config/navigation";
import {
  IMPORT_NOTIFICATION_STORAGE_KEY,
  IMPORT_NOTIFICATION_UNREAD_KEY,
} from "../lib/notificationUtils";

function AppHeader({ onOpenNavigation }) {
  const { pathname } = useLocation();
  const current = getNavigationItem(pathname);
  const [importLogOpen, setImportLogOpen] = useState(false);

  const [importNotifications, setImportNotifications] = useState(() => {
    try {
      const raw = window.localStorage.getItem(IMPORT_NOTIFICATION_STORAGE_KEY);
      const parsed = JSON.parse(raw ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [unreadImportNotifications, setUnreadImportNotifications] = useState(() => {
    try {
      const raw = window.localStorage.getItem(IMPORT_NOTIFICATION_UNREAD_KEY);
      const parsed = Number(raw ?? 0);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  });

  const syncFromStorage = () => {
    try {
      const rawLog = window.localStorage.getItem(IMPORT_NOTIFICATION_STORAGE_KEY);
      const parsedLog = JSON.parse(rawLog ?? "[]");
      setImportNotifications(Array.isArray(parsedLog) ? parsedLog : []);

      const rawUnread = window.localStorage.getItem(IMPORT_NOTIFICATION_UNREAD_KEY);
      const parsedUnread = Number(rawUnread ?? 0);
      setUnreadImportNotifications(Number.isFinite(parsedUnread) && parsedUnread >= 0 ? parsedUnread : 0);
    } catch { }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      syncFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("notification-updated", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("notification-updated", handleStorageChange);
    };
  }, []);

  const openImportLog = () => {
    syncFromStorage();
    setImportLogOpen(true);
    setUnreadImportNotifications(0);
    window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, "0");
  };

  const clearImportNotifications = () => {
    setImportNotifications([]);
    setUnreadImportNotifications(0);
    window.localStorage.removeItem(IMPORT_NOTIFICATION_STORAGE_KEY);
    window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, "0");
  };

  return (
    <>
      <header
        className="relative sticky top-0 z-30 border-b border-emerald-700/20 bg-cover bg-center bg-no-repeat shadow-xs"
        style={{ backgroundImage: "url('/header.jpg')" }}
      >
        <div className="relative flex min-h-[4.75rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onOpenNavigation}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white/90 text-slate-800 shadow-xs transition hover:bg-white md:hidden"
              aria-label="Open navigation"
            >
              <i className="fa-solid fa-bars text-sm" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-xs font-bold uppercase tracking-[0.2em] text-emerald-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                IITI Enrollment System
              </p>
              <h1 className="mt-0.5 truncate text-xl sm:text-2xl font-black tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {current.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={openImportLog}
              className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-md transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              aria-label="System Notifications & Activity Log"
              title="System Notifications & Activity Log"
            >
              <i className="fa-solid fa-bell text-base text-slate-700" />
              {unreadImportNotifications > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[0.65rem] font-extrabold text-white shadow-md animate-pulse">
                  {Math.min(unreadImportNotifications, 99)}
                </span>
              ) : (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-600 ring-2 ring-white" />
              )}
            </button>
          </div>
        </div>
      </header>

      <Modal open={importLogOpen} onClose={() => setImportLogOpen(false)} title="System Notifications & Activity Log" size="md">
        <div className="flex flex-col gap-3 max-h-[70vh] min-h-[18rem]">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Recent system actions, record import results, and notification history.</p>
            <button
              type="button"
              onClick={clearImportNotifications}
              disabled={!importNotifications.length}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear History Log
            </button>
          </div>
          {importNotifications.length ? (
            <div className="overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {importNotifications.map((item) => {
                  const when = new Date(item.createdAt);
                  const timeLabel = Number.isNaN(when.getTime())
                    ? "Unknown time"
                    : when.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    });
                  const toneClass = item.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800";

                  return (
                    <li key={item.id} className="p-3 sm:p-4">
                      <div className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide w-fit ${toneClass}`}>
                        {item.type === "error" ? "Action Needed" : "Success"}
                      </div>
                      <p className="mt-2 text-sm text-slate-800 leading-relaxed">{item.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{timeLabel}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="flex-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-6 text-sm text-slate-500 text-center">
              No notifications or import activity logged yet.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export default AppHeader;
