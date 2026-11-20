import type { Backend } from "./backend/types";
import { LINE_STATUS_LABEL } from "./catalog";
import type { Cart, Check, CheckLine } from "./types";

/**
 * Monthly crash cart audit reports, in the hospital pharmacy's format
 * ("CRASH AUDIT <MONTH>"): a percentage summary per ward plus each ward's
 * item list. Built from the pharmacists' audits (pharmacy checks).
 */

/** YYYY-MM */
export type Month = string;

export interface Metrics {
  /** Items the ward's crash cart should hold. */
  approved: number;
  /** Items found in the cart (anything not marked missing). */
  available: number;
  availabilityPct: number;
  nearExpiry: number;
  expired: number;
  /** Fewer than the approved quantity (short or missing). */
  below: number;
  /** More than the approved quantity. */
  above: number;
  damaged: number;
}

export interface WardMonth {
  cart: Cart;
  month: Month;
  /** The audit used for this ward and month (the latest one), or null if none was done. */
  check: Check | null;
  lines: CheckLine[];
  metrics: Metrics | null;
}

export interface Report {
  months: Month[];
  wards: Cart[];
  /** cells[wardIndex][monthIndex] */
  cells: WardMonth[][];
  /** The month before the first selected month, for comparison. */
  previous: WardMonth[];
}

export function monthOf(c: Check): Month {
  return (c.submitted_at ?? c.created_at).slice(0, 7);
}

export function currentMonth(now = new Date()): Month {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(m: Month, by: number): Month {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** The last `n` months up to and including `last`, oldest first. */
export function recentMonths(last: Month, n: number): Month[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(last, i - n + 1));
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "NOV 2026" */
export function monthTitle(m: Month): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}

/** "November 2026" */
export function monthLong(m: Month): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS_LONG[mo - 1]} ${y}`;
}

/** "Nov-26" */
export function monthShort(m: Month): string {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS[mo - 1][0]}${MONTHS[mo - 1].slice(1).toLowerCase()}-${String(y).slice(2)}`;
}

/** "10-NOV-2026" */
export function dayTitle(iso: string | null): string {
  if (!iso) return "";
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}-${MONTHS[mo - 1]}-${y}`;
}

export function computeMetrics(lines: CheckLine[]): Metrics {
  const approved = lines.length;
  const missing = lines.filter((l) => l.line_status === "absent" || l.found_qty === 0).length;
  const available = approved - missing;
  const below = lines.filter(
    (l) => l.line_status === "short" || l.line_status === "absent" || (l.found_qty !== null && l.found_qty < l.par_qty),
  ).length;
  const above = lines.filter((l) => l.found_qty !== null && l.found_qty > l.par_qty).length;
  return {
    approved,
    available,
    availabilityPct: approved ? round1((available / approved) * 100) : 0,
    nearExpiry: lines.filter((l) => l.line_status === "near_expiry").length,
    expired: lines.filter((l) => l.line_status === "expired").length,
    below,
    above,
    damaged: lines.filter((l) => l.line_status === "damaged").length,
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Share of approved items, as a percentage. */
export function pctOf(n: number, m: Metrics): number {
  return m.approved ? round1((n / m.approved) * 100) : 0;
}

/**
 * Performance score (0-100) used for the gauge and month-to-month comparison:
 * availability, less half a point for each % of items expiring, expired, damaged
 * or off the approved quantity.
 */
export function performanceScore(m: Metrics): number {
  if (!m.approved) return 0;
  const penalty = (m.expired * 2 + m.nearExpiry * 0.5 + m.damaged + (m.below - (m.approved - m.available)) * 0.5 + m.above * 0.25) / m.approved;
  return Math.max(0, Math.min(100, round1(m.availabilityPct - penalty * 100)));
}

export type Rating = "Excellent" | "Good" | "Fair" | "Needs improvement";

export function rating(score: number): Rating {
  return score >= 95 ? "Excellent" : score >= 90 ? "Good" : score >= 80 ? "Fair" : "Needs improvement";
}

export function sumMetrics(list: (Metrics | null)[]): Metrics | null {
  const ms = list.filter((m): m is Metrics => !!m);
  if (!ms.length) return null;
  const t = ms.reduce(
    (a, m) => ({
      approved: a.approved + m.approved,
      available: a.available + m.available,
      availabilityPct: 0,
      nearExpiry: a.nearExpiry + m.nearExpiry,
      expired: a.expired + m.expired,
      below: a.below + m.below,
      above: a.above + m.above,
      damaged: a.damaged + m.damaged,
    }),
    { approved: 0, available: 0, availabilityPct: 0, nearExpiry: 0, expired: 0, below: 0, above: 0, damaged: 0 },
  );
  t.availabilityPct = t.approved ? round1((t.available / t.approved) * 100) : 0;
  return t;
}

export type Trend = "Improved" | "Declined" | "No change" | "No earlier audit" | "No audit";

export function trend(prev: number | null, cur: number | null): Trend {
  if (cur === null) return "No audit";
  if (prev === null) return "No earlier audit";
  const d = round1(cur - prev);
  return d > 0 ? "Improved" : d < 0 ? "Declined" : "No change";
}

/** Latest submitted pharmacy audit of each ward in each month. */
export function pickAudits(checks: Check[]): Map<string, Check> {
  const out = new Map<string, Check>();
  for (const c of checks) {
    if (c.audience !== "pharmacy" || c.status === "draft") continue;
    const key = `${c.cart_id}|${monthOf(c)}`;
    const cur = out.get(key);
    if (!cur || (c.submitted_at ?? c.created_at) > (cur.submitted_at ?? cur.created_at)) out.set(key, c);
  }
  return out;
}

/** Assembles a report from already-loaded audits and their lines. */
export function buildReport(wards: Cart[], months: Month[], checks: Check[], lines: CheckLine[]): Report {
  const sorted = [...months].sort();
  const audits = pickAudits(checks);
  const byCheck = new Map<string, CheckLine[]>();
  for (const l of lines) byCheck.set(l.check_id, [...(byCheck.get(l.check_id) ?? []), l]);
  const cell = (cart: Cart, month: Month): WardMonth => {
    const check = audits.get(`${cart.id}|${month}`) ?? null;
    const ls = check ? sortLines(byCheck.get(check.id) ?? []) : [];
    return { cart, month, check, lines: ls, metrics: check ? computeMetrics(ls) : null };
  };
  const prevMonth = shiftMonth(sorted[0], -1);
  return {
    months: sorted,
    wards,
    cells: wards.map((w) => sorted.map((m) => cell(w, m))),
    previous: wards.map((w) => cell(w, prevMonth)),
  };
}

export function sortLines(lines: CheckLine[]): CheckLine[] {
  return [...lines].sort((x, y) => x.drawer_order - y.drawer_order || x.item_name.localeCompare(y.item_name));
}

/** Loads the audits needed for these wards and months (plus the month before, for comparison). */
export async function loadReport(b: Backend, hospitalId: string, wards: Cart[], months: Month[]): Promise<Report> {
  const sorted = [...months].sort();
  if (!sorted.length || !wards.length) return { months: sorted, wards, cells: wards.map(() => []), previous: [] };
  const from = shiftMonth(sorted[0], -1);
  const all = await b.select(
    "checks",
    { hospital_id: hospitalId, audience: "pharmacy", cart_id: wards.map((w) => w.id) },
    { order: { column: "created_at", ascending: false }, limit: 2000 },
  );
  const wanted = new Set([from, ...sorted]);
  const checks = all.filter((c) => c.status !== "draft" && wanted.has(monthOf(c)));
  const picked = [...pickAudits(checks).values()];
  const lines = picked.length ? await b.select("check_lines", { check_id: picked.map((c) => c.id) }) : [];
  return buildReport(wards, sorted, picked, lines);
}

// ------------------------------------------------------------------ item rows

/** Matches the same item across months. */
export function itemKey(l: CheckLine): string {
  return l.cart_item_id ?? `${l.drawer_name}|${l.item_name}|${l.strength}`;
}

export function itemLabel(l: CheckLine): string {
  return l.strength ? `${l.item_name} (${l.strength})` : l.item_name;
}

/** The "QTY PRESENT" column: OK, NA (not available), the count found, or the problem. */
export function qtyPresent(l: CheckLine): string {
  if (l.line_status === "absent" || l.found_qty === 0) return "NA";
  if (l.found_qty !== null && l.found_qty !== l.par_qty) return String(l.found_qty);
  if (l.line_status === "present" || l.line_status === "near_expiry" || l.line_status === "short") return "OK";
  return LINE_STATUS_LABEL[l.line_status].toUpperCase();
}

/** Expiry shown for items that are expiring or expired (as in the audit sheets). */
export function expiryNote(l: CheckLine): string {
  return (l.line_status === "near_expiry" || l.line_status === "expired") && l.expiry_date ? l.expiry_date : "";
}

/** One month's remark for an item: problem, expiry, notes and the follow-up. */
export function monthRemark(l: CheckLine | undefined): string {
  if (!l) return "";
  const parts: string[] = [];
  if (l.line_status !== "present") parts.push(LINE_STATUS_LABEL[l.line_status]);
  if (l.found_qty !== null && l.found_qty !== l.par_qty) parts.push(`${l.found_qty}/${l.par_qty}`);
  if (expiryNote(l)) parts.push(`Exp ${expiryNote(l)}`);
  if (l.remarks) parts.push(l.remarks);
  if (l.obs_closed && l.obs_action) parts.push(`Closed: ${l.obs_action}`);
  return parts.join(" · ");
}

export interface ItemRow {
  key: string;
  drawer: string;
  drawerOrder: number;
  label: string;
  qty: number;
  /** One per selected month, oldest first. */
  byMonth: (CheckLine | undefined)[];
}

/** A ward's item list across the selected months, grouped by drawer. */
export function wardItemRows(cells: WardMonth[]): ItemRow[] {
  const rows = new Map<string, ItemRow>();
  cells.forEach((c, mi) => {
    for (const l of c.lines) {
      const k = itemKey(l);
      let r = rows.get(k);
      if (!r) {
        r = { key: k, drawer: l.drawer_name, drawerOrder: l.drawer_order, label: itemLabel(l), qty: l.par_qty, byMonth: cells.map(() => undefined) };
        rows.set(k, r);
      }
      r.byMonth[mi] = l;
      // The latest month decides where the item sits and its approved quantity.
      r.drawer = l.drawer_name;
      r.drawerOrder = l.drawer_order;
      r.qty = l.par_qty;
    }
  });
  return [...rows.values()].sort((a, b) => a.drawerOrder - b.drawerOrder || a.label.localeCompare(b.label));
}

/** Short ward name for sheet tabs and headings, e.g. "ICU". */
export function wardName(c: Cart): string {
  return c.location || c.name;
}
