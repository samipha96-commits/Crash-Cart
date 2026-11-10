import type { Backend } from "./backend/types";
import { DRAWER_NAMES, STARTER_CARTS, STARTER_ITEMS } from "./catalog";
import { addDays, expiryState, hoursSince, todayISO, type ExpiryState } from "./dates";
import type {
  Cart,
  CartItem,
  Check,
  CheckLine,
  CheckType,
  Drawer,
  Hospital,
  Invite,
  Item,
  ItemKind,
  LineStatus,
  Membership,
  Role,
  User,
} from "./types";

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ------------------------------------------------------------------ reading

export interface Workspace {
  user: User;
  memberships: Membership[];
  hospitals: Hospital[];
}

export async function loadWorkspace(b: Backend): Promise<Workspace | null> {
  const user = await b.currentUser();
  if (!user) return null;
  await b.acceptInvites();
  const memberships = await b.select("memberships", { user_id: user.id });
  const ids = memberships.map((m) => m.hospital_id);
  const hospitals = ids.length ? await b.select("hospitals", { id: ids }, { order: { column: "name" } }) : [];
  return { user, memberships, hospitals };
}

export interface HospitalData {
  hospital: Hospital;
  role: Role;
  members: Membership[];
  invites: Invite[];
  items: Item[];
  carts: Cart[];
  drawers: Drawer[];
  cartItems: CartItem[];
  checks: Check[];
  /** Lines of checks that are not closed yet (for open-issue counts). */
  openLines: CheckLine[];
}

export async function loadHospital(b: Backend, hospital: Hospital, role: Role): Promise<HospitalData> {
  const hid = hospital.id;
  const [members, invites, items, carts, drawers, cartItems, checks] = await Promise.all([
    b.select("memberships", { hospital_id: hid }, { order: { column: "email" } }),
    role === "hospital_admin" ? b.select("invites", { hospital_id: hid }) : Promise.resolve([] as Invite[]),
    b.select("items", { hospital_id: hid }, { order: { column: "name" } }),
    b.select("carts", { hospital_id: hid }, { order: { column: "name" } }),
    b.select("drawers", { hospital_id: hid }, { order: { column: "sort_order" } }),
    b.select("cart_items", { hospital_id: hid }),
    b.select("checks", { hospital_id: hid }, { order: { column: "created_at", ascending: false }, limit: 300 }),
  ]);
  const openIds = checks.filter((c) => c.status !== "closed").map((c) => c.id);
  const openLines = openIds.length ? await b.select("check_lines", { check_id: openIds }) : [];
  return { hospital, role, members, invites, items, carts, drawers, cartItems, checks, openLines };
}

export async function loadCheck(b: Backend, checkId: string) {
  const [check] = await b.select("checks", { id: checkId });
  if (!check) throw new Error("Check not found.");
  const lines = await b.select("check_lines", { check_id: checkId });
  lines.sort((x, y) => x.drawer_order - y.drawer_order || x.item_name.localeCompare(y.item_name));
  return { check, lines };
}

// ------------------------------------------------------------------ derived views

export interface StockRow {
  cartItem: CartItem;
  item: Item;
  cart: Cart;
  drawer: Drawer;
  state: ExpiryState;
}

export function stockRows(d: HospitalData, today = todayISO()): StockRow[] {
  const items = new Map(d.items.map((x) => [x.id, x]));
  const carts = new Map(d.carts.map((x) => [x.id, x]));
  const drawers = new Map(d.drawers.map((x) => [x.id, x]));
  const rows: StockRow[] = [];
  for (const ci of d.cartItems) {
    const item = items.get(ci.item_id);
    const cart = carts.get(ci.cart_id);
    const drawer = drawers.get(ci.drawer_id);
    if (!item || !cart || !drawer) continue;
    rows.push({ cartItem: ci, item, cart, drawer, state: expiryState(ci.expiry_date, d.hospital.near_expiry_days, today) });
  }
  const rank: Record<ExpiryState, number> = { expired: 0, soon: 1, ok: 2, none: 3 };
  rows.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.cartItem.expiry_date ?? "9999").localeCompare(b.cartItem.expiry_date ?? "9999") ||
      a.item.name.localeCompare(b.item.name),
  );
  return rows;
}

export interface CartSummary {
  cart: Cart;
  lines: number;
  expired: number;
  soon: number;
  missingExpiry: number;
  lastCheck: Check | null;
  openCheck: Check | null;
  openIssues: number;
  /** No completed check in the last 24 hours. */
  dailyDue: boolean;
}

export function cartSummaries(d: HospitalData, today = todayISO(), nowMs = Date.now()): CartSummary[] {
  const rows = stockRows(d, today);
  return d.carts.map((cart) => {
    const mine = rows.filter((r) => r.cart.id === cart.id);
    const checks = d.checks.filter((c) => c.cart_id === cart.id);
    const done = checks.find((c) => c.status !== "draft") ?? null;
    const openCheck = checks.find((c) => c.status === "draft") ?? null;
    const openCheckIds = new Set(checks.filter((c) => c.status !== "closed").map((c) => c.id));
    return {
      cart,
      lines: mine.length,
      expired: mine.filter((r) => r.state === "expired").length,
      soon: mine.filter((r) => r.state === "soon").length,
      missingExpiry: mine.filter((r) => r.state === "none" && r.item.kind === "medicine").length,
      lastCheck: done,
      openCheck,
      openIssues: d.openLines.filter((l) => openCheckIds.has(l.check_id) && l.line_status !== "present").length,
      dailyDue: !done || hoursSince(done.submitted_at ?? done.created_at, nowMs) >= 24,
    };
  });
}

/** Sensible starting status for a line from its recorded expiry date. */
export function defaultLineStatus(expiry: string | null, windowDays: number, today = todayISO()): LineStatus {
  const s = expiryState(expiry, windowDays, today);
  return s === "expired" ? "expired" : s === "soon" ? "near_expiry" : "present";
}

export function checkStats(lines: CheckLine[]) {
  const issues = lines.filter((l) => l.line_status !== "present");
  return { total: lines.length, ok: lines.length - issues.length, issues: issues.length };
}

// ------------------------------------------------------------------ hospitals

export async function createHospital(
  b: Backend,
  input: { name: string; code: string; starterCarts: boolean },
  expiryFor?: (index: number) => string | null,
): Promise<string> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (name.length < 2 || code.length < 2) throw new Error("Enter the hospital name and a short code.");
  const hid = uuid();
  await b.createHospital(hid, name, code);

  const items: Item[] = STARTER_ITEMS.map((s) => ({
    id: uuid(),
    hospital_id: hid,
    name: s.name,
    kind: s.kind,
    category: s.category,
    strength: s.strength,
    is_active: true,
    created_at: now(),
  }));
  await b.insert("items", items);

  if (input.starterCarts) {
    let n = 0;
    for (const c of STARTER_CARTS) {
      const { cartId, drawers } = await createCart(b, hid, c);
      const rows: Partial<CartItem>[] = STARTER_ITEMS.map((s, i) => ({
        id: uuid(),
        hospital_id: hid,
        cart_id: cartId,
        drawer_id: drawers[s.floor].id,
        item_id: items[i].id,
        par_qty: s.qty,
        lot_number: "",
        expiry_date: expiryFor ? expiryFor(n++) : null,
      }));
      await b.insert("cart_items", rows);
    }
  }
  return hid;
}

export async function updateHospital(b: Backend, hid: string, patch: { name?: string; code?: string; near_expiry_days?: number }) {
  await b.update("hospitals", { id: hid }, patch);
}

// ------------------------------------------------------------------ carts

export async function createCart(
  b: Backend,
  hid: string,
  input: { name: string; location: string; cart_type: string; seal_number?: string },
) {
  if (!input.name.trim() || !input.location.trim()) throw new Error("Enter a cart name and its location.");
  const cartId = uuid();
  await b.insert("carts", [
    {
      id: cartId,
      hospital_id: hid,
      name: input.name.trim(),
      location: input.location.trim(),
      cart_type: input.cart_type || "Ward",
      seal_number: input.seal_number?.trim() ?? "",
    },
  ]);
  const drawers: Drawer[] = DRAWER_NAMES.map((name, i) => ({ id: uuid(), hospital_id: hid, cart_id: cartId, sort_order: i, name }));
  await b.insert("drawers", drawers);
  return { cartId, drawers };
}

export async function updateCart(b: Backend, cartId: string, patch: Partial<Pick<Cart, "name" | "location" | "cart_type" | "seal_number">>) {
  await b.update("carts", { id: cartId }, patch);
}

export async function deleteCart(b: Backend, cartId: string) {
  await b.remove("carts", { id: cartId });
}

export async function renameDrawer(b: Backend, drawerId: string, name: string) {
  if (!name.trim()) throw new Error("Enter a name.");
  await b.update("drawers", { id: drawerId }, { name: name.trim() });
}

export async function addDrawer(b: Backend, hid: string, cartId: string, sortOrder: number, name: string) {
  await b.insert("drawers", [{ id: uuid(), hospital_id: hid, cart_id: cartId, sort_order: sortOrder, name: name.trim() || `Floor ${sortOrder + 1}` }]);
}

export async function addCartItem(
  b: Backend,
  hid: string,
  input: {
    cartId: string;
    drawerId: string;
    itemId?: string;
    newItem?: { name: string; kind: ItemKind; strength: string; category: string };
    parQty: number;
    lot: string;
    expiry: string | null;
  },
) {
  let itemId = input.itemId;
  if (!itemId) {
    if (!input.newItem?.name.trim()) throw new Error("Pick an item or type a new one.");
    itemId = await addItem(b, hid, input.newItem);
  }
  await b.insert("cart_items", [
    {
      id: uuid(),
      hospital_id: hid,
      cart_id: input.cartId,
      drawer_id: input.drawerId,
      item_id: itemId,
      par_qty: Math.max(1, Math.floor(input.parQty) || 1),
      lot_number: input.lot.trim(),
      expiry_date: input.expiry || null,
    },
  ]);
}

export async function updateCartItem(
  b: Backend,
  id: string,
  patch: { par_qty?: number; lot_number?: string; expiry_date?: string | null; drawer_id?: string },
) {
  const clean = { ...patch, updated_at: now() };
  if (clean.par_qty !== undefined) clean.par_qty = Math.max(1, Math.floor(clean.par_qty) || 1);
  if (clean.expiry_date === "") clean.expiry_date = null;
  await b.update("cart_items", { id }, clean);
}

export async function removeCartItem(b: Backend, id: string) {
  await b.remove("cart_items", { id });
}

// ------------------------------------------------------------------ item catalogue

export async function addItem(
  b: Backend,
  hid: string,
  input: { name: string; kind: ItemKind; strength: string; category: string },
): Promise<string> {
  if (!input.name.trim()) throw new Error("Enter the item name.");
  const id = uuid();
  await b.insert("items", [
    {
      id,
      hospital_id: hid,
      name: input.name.trim(),
      kind: input.kind,
      strength: input.strength.trim(),
      category: input.category.trim() || "General",
    },
  ]);
  return id;
}

export async function setItemActive(b: Backend, id: string, active: boolean) {
  await b.update("items", { id }, { is_active: active });
}

// ------------------------------------------------------------------ checks

export async function startCheck(
  b: Backend,
  d: HospitalData,
  user: User,
  cartId: string,
  type: CheckType,
  today = todayISO(),
): Promise<string> {
  const cart = d.carts.find((c) => c.id === cartId);
  if (!cart) throw new Error("Cart not found.");
  const checkId = uuid();
  await b.insert("checks", [
    {
      id: checkId,
      hospital_id: d.hospital.id,
      cart_id: cartId,
      check_type: type,
      status: "draft",
      performed_by: user.id,
      performed_by_name: user.name || user.email,
      seal_number: cart.seal_number,
    },
  ]);
  const rows = stockRows(d, today).filter((r) => r.cart.id === cartId);
  const lines: Partial<CheckLine>[] = rows.map((r) => ({
    id: uuid(),
    hospital_id: d.hospital.id,
    check_id: checkId,
    cart_item_id: r.cartItem.id,
    item_name: r.item.name,
    strength: r.item.strength,
    drawer_name: r.drawer.name,
    drawer_order: r.drawer.sort_order,
    par_qty: r.cartItem.par_qty,
    found_qty: null,
    expiry_date: r.cartItem.expiry_date,
    line_status: defaultLineStatus(r.cartItem.expiry_date, d.hospital.near_expiry_days, today),
  }));
  await b.insert("check_lines", lines);
  return checkId;
}

export async function saveLine(
  b: Backend,
  lineId: string,
  patch: Partial<Pick<CheckLine, "line_status" | "found_qty" | "remarks" | "expiry_date">>,
) {
  await b.update("check_lines", { id: lineId }, patch);
}

export async function markAllPresent(b: Backend, lines: CheckLine[]) {
  const ids = lines.filter((l) => l.line_status !== "present" && l.line_status !== "expired").map((l) => l.id);
  // Expired lines stay flagged: an auditor must look at them.
  if (ids.length) await b.update("check_lines", { id: ids }, { line_status: "present" });
}

export async function submitCheck(b: Backend, check: Check, input: { seal_number: string; remarks: string }) {
  await b.update("checks", { id: check.id }, {
    status: "submitted",
    seal_number: input.seal_number.trim(),
    remarks: input.remarks.trim(),
    submitted_at: now(),
  });
}

export async function closeCheck(b: Backend, check: Check, reviewer: User, notes: string) {
  await b.update("checks", { id: check.id }, {
    status: "closed",
    review_notes: notes.trim(),
    reviewed_by_name: reviewer.name || reviewer.email,
    closed_at: now(),
  });
}

export async function reopenCheck(b: Backend, check: Check) {
  await b.update("checks", { id: check.id }, { status: "draft", closed_at: null });
}

export async function deleteCheck(b: Backend, check: Check) {
  await b.remove("checks", { id: check.id });
}

// ------------------------------------------------------------------ team

export async function inviteMember(b: Backend, d: HospitalData, email: string, role: Role) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address.");
  const existing = d.members.find((m) => m.email === clean);
  if (existing) {
    await b.update("memberships", { id: existing.id }, { role });
    return { joined: true };
  }
  await b.remove("invites", { hospital_id: d.hospital.id, email: clean });
  await b.insert("invites", [{ id: uuid(), hospital_id: d.hospital.id, email: clean, role }]);
  return { joined: false };
}

export async function cancelInvite(b: Backend, id: string) {
  await b.remove("invites", { id });
}

export async function changeRole(b: Backend, membershipId: string, role: Role) {
  await b.update("memberships", { id: membershipId }, { role });
}

export async function removeMember(b: Backend, membershipId: string) {
  await b.remove("memberships", { id: membershipId });
}

// ------------------------------------------------------------------ CSV

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ------------------------------------------------------------------ demo data

export const DEMO_PASSWORD = "demo1234";
export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@demo.hospital", name: "Aisha Rahman", role: "hospital_admin" },
  { email: "nurse@demo.hospital", name: "Omar Khalid", role: "nurse" },
  { email: "pharmacy@demo.hospital", name: "Lina Haddad", role: "pharmacy" },
  { email: "quality@demo.hospital", name: "Yusuf Ali", role: "quality" },
];

/** Builds two demo hospitals with carts, staff and a few checks. */
export async function seedDemo(b: Backend, today = todayISO()) {
  // Staff accounts first, so the admin's invites turn into memberships.
  for (const u of DEMO_USERS) await b.signUp(u.email, DEMO_PASSWORD, u.name);
  await b.signIn(DEMO_USERS[0].email, DEMO_PASSWORD);

  // A spread of expiry dates: a few expired, some due soon, most fine.
  const offsets = [-12, 9, 21, 45, 160, 300, 420, 610];
  const expiryFor = (i: number) => (i % 7 === 3 ? null : addDays(today, offsets[(i * 5) % offsets.length]));
  const general = await createHospital(b, { name: "City General Hospital", code: "CGH", starterCarts: true }, expiryFor);
  await createHospital(b, { name: "Riverside Children's Hospital", code: "RCH", starterCarts: true }, (i) => addDays(today, 30 + ((i * 37) % 500)));

  const ws = await loadWorkspace(b);
  const h = ws!.hospitals.find((x) => x.id === general)!;
  let d = await loadHospital(b, h, "hospital_admin");
  for (const u of DEMO_USERS.slice(1)) await inviteMember(b, d, u.email, u.role);
  for (const u of DEMO_USERS.slice(1)) {
    await b.signIn(u.email, DEMO_PASSWORD);
    await b.acceptInvites();
  }

  // The nurse has done today's check on the ICU cart and found a gap.
  const nurse = DEMO_USERS[1];
  await b.signIn(nurse.email, DEMO_PASSWORD);
  const nurseUser = (await b.currentUser())!;
  d = await loadHospital(b, h, "nurse");
  const icu = d.carts.find((c) => c.cart_type === "ICU")!;
  const checkId = await startCheck(b, d, nurseUser, icu.id, "daily", today);
  const { check, lines } = await loadCheck(b, checkId);
  const atropine = lines.find((l) => l.item_name === "Atropine");
  if (atropine) await saveLine(b, atropine.id, { line_status: "short", found_qty: 1, remarks: "Used in code, pharmacy informed" });
  await submitCheck(b, check, { seal_number: "SEAL-40211", remarks: "Seal intact before check. Atropine short." });

  await b.signIn(DEMO_USERS[0].email, DEMO_PASSWORD);
}
