export const IMPORT_NOTIFICATION_STORAGE_KEY = "importNotificationsLog";
export const IMPORT_NOTIFICATION_UNREAD_KEY = "importNotificationsUnreadCount";

export function pushImportNotification(message, type = "info") {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message: String(message ?? ""),
    type,
    createdAt: new Date().toISOString(),
  };

  try {
    const rawLog = window.localStorage.getItem(IMPORT_NOTIFICATION_STORAGE_KEY);
    const prevLog = JSON.parse(rawLog ?? "[]");
    const nextLog = [entry, ...(Array.isArray(prevLog) ? prevLog : [])].slice(0, 200);
    window.localStorage.setItem(IMPORT_NOTIFICATION_STORAGE_KEY, JSON.stringify(nextLog));

    const rawUnread = window.localStorage.getItem(IMPORT_NOTIFICATION_UNREAD_KEY);
    const prevUnread = Number(rawUnread ?? 0);
    const nextUnread = (Number.isFinite(prevUnread) && prevUnread >= 0 ? prevUnread : 0) + 1;
    window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, String(nextUnread));

    window.dispatchEvent(new Event("notification-updated"));
  } catch (err) {
    console.error("Failed to push notification", err);
  }
}
