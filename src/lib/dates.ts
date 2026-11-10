const DAY = 86_400_000;

/** Today's date as YYYY-MM-DD in the device's local time zone. */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY);
  return t.toISOString().slice(0, 10);
}

/** Whole days from `today` until `iso` (negative when already past). */
export function daysUntil(iso: string, today = todayISO()): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

export type ExpiryState = "expired" | "soon" | "ok" | "none";

export function expiryState(iso: string | null, windowDays: number, today = todayISO()): ExpiryState {
  if (!iso) return "none";
  const n = daysUntil(iso, today);
  if (n < 0) return "expired";
  if (n <= windowDays) return "soon";
  return "ok";
}

export function expiryText(iso: string | null, today = todayISO()): string {
  if (!iso) return "No expiry";
  const n = daysUntil(iso, today);
  if (n < 0) return `Expired ${-n} day${n === -1 ? "" : "s"} ago`;
  if (n === 0) return "Expires today";
  if (n === 1) return "Expires tomorrow";
  if (n <= 60) return `Expires in ${n} days`;
  return `Expires ${formatDate(iso)}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hoursSince(iso: string, now = Date.now()): number {
  return (now - new Date(iso).getTime()) / 3_600_000;
}
