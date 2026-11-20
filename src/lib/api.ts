import type { Backend } from "./backend/types";
import { ALL_WARDS, DRAWER_NAMES, SINGLE_WARD, STARTER_CARTS, STARTER_ITEMS, audienceOf, can, type Perm } from "./catalog";
import { addDays, expiryState, todayISO, type ExpiryState } from "./dates";
import type {
  Cart,
  CartItem,
  Check,
  CheckLine,
  CheckType,
  Drawer,
  Hospital,
  HospitalTheme,
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
  /** Platform owner: creates hospitals and gives staff their rights. */
  isSuper: boolean;
  memberships: Membership[];
  hospitals: Hospital[];
}

export async function loadWorkspace(b: Backend): Promise<Workspace | null> {
  const user = await b.currentUser();
  if (!user) return null;
  await b.acceptInvites();
  const isSuper = await b.isSuperAdmin();
  const memberships = await b.select("memberships", { user_id: user.id });
  const ids = memberships.map((m) => m.hospital_id);
  const hospitals = isSuper
    ? await b.select("hospitals", {}, { order: { column: "name" } })
    : ids.length
      ? await b.select("hospitals", { id: ids }, { order: { column: "name" } })
      : [];
  return { user, isSuper, memberships, hospitals };
}

/** The caller's rights in a hospital. The Super admin has no role but full access. */
export function permFor(ws: Workspace, hospitalId: string): Perm | null {
  if (ws.isSuper) return { role: null, isSuper: true, wardIds: [] };
  const m = ws.memberships.find((x) => x.hospital_id === hospitalId);
  return m ? { role: m.role, isSuper: false, wardIds: m.ward_ids ?? [] } : null;
}

export interface HospitalData {
  hospital: Hospital;
  perm: Perm;
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

export async function loadHospital(b: Backend, hospital: Hospital, perm: Perm): Promise<HospitalData> {
  const hid = hospital.id;
  const [members, invites, items, carts, drawers, cartItems, checks] = await Promise.all([
    b.select("memberships", { hospital_id: hid }, { order: { column: "email" } }),
    can.manageStaff(perm) ? b.select("invites", { hospital_id: hid }) : Promise.resolve([] as Invite[]),
    b.select("items", { hospital_id: hid }, { order: { column: "name" } }),
    b.select("carts", { hospital_id: hid }, { order: { column: "name" } }),
    b.select("drawers", { hospital_id: hid }, { order: { column: "sort_order" } }),
    b.select("cart_items", { hospital_id: hid }),
    b.select("checks", { hospital_id: hid }, { order: { column: "created_at", ascending: false }, limit: 300 }),
  ]);
  const openIds = checks.filter((c) => c.status !== "closed").map((c) => c.id);
  const openLines = openIds.length ? await b.select("check_lines", { check_id: openIds }) : [];
  return { hospital, perm, members, invites, items, carts, drawers, cartItems, checks, openLines };
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
  /** No pharmacy check of this ward this month. */
  dailyDue: boolean;
}

export function cartSummaries(d: HospitalData, today = todayISO(), nowMs = Date.now()): CartSummary[] {
  const rows = stockRows(d, today);
  return d.carts.map((cart) => {
    const mine = rows.filter((r) => r.cart.id === cart.id);
    const checks = d.checks.filter((c) => c.cart_id === cart.id);
    // The pharmacy's monthly check is what counts now; nurses no longer check in the app.
    const done = checks.find((c) => c.status !== "draft" && c.audience === "pharmacy") ?? null;
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
      // Pharmacists check each ward once a month.
      dailyDue: !done || (done.submitted_at ?? done.created_at).slice(0, 7) !== new Date(nowMs).toISOString().slice(0, 7),
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
  const obsOpen = issues.filter((l) => !l.obs_closed).length;
  return { total: lines.length, ok: lines.length - issues.length, issues: issues.length, obsOpen };
}

// ------------------------------------------------------------------ hospitals

export async function createHospital(
  b: Backend,
  input: { name: string; code: string; starterCarts: boolean; theme?: HospitalTheme; logo_url?: string; details?: HospitalDetails },
  expiryFor?: (index: number) => string | null,
): Promise<string> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (name.length < 2 || code.length < 2) throw new Error("Enter the hospital name and a short code.");
  const hid = uuid();
  await b.createHospital(hid, name, code);
  if (input.theme || input.logo_url) await b.update("hospitals", { id: hid }, { theme: input.theme ?? {}, logo_url: input.logo_url ?? "" });
  if (input.details) await b.update("hospitals", { id: hid }, cleanDetails(input.details));

  const items: Item[] = STARTER_ITEMS.map((s) => ({
    id: uuid(),
    hospital_id: hid,
    code: s.code ?? "",
    name: s.name,
    generic: s.generic ?? "",
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

export async function updateHospital(
  b: Backend,
  hid: string,
  patch: { name?: string; code?: string; near_expiry_days?: number; theme?: HospitalTheme; logo_url?: string } & Partial<HospitalDetails>,
) {
  await b.update("hospitals", { id: hid }, patch);
}

/** Address and contacts shown in report headers. */
export interface HospitalDetails {
  address: string;
  phone: string;
  email: string;
}

export function cleanDetails(d: HospitalDetails): HospitalDetails {
  return { address: d.address.trim().slice(0, 300), phone: d.phone.trim().slice(0, 60), email: d.email.trim().toLowerCase().slice(0, 120) };
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
    newItem?: ItemInput;
    parQty: number;
    lot: string;
    expiry: string | null;
  },
) {
  let itemId = input.itemId;
  if (!itemId) {
    if (!input.newItem?.name.trim()) throw new Error("Pick an item or type a new one.");
    itemId = await addItem(b, hid, input.newItem!);
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

export interface ItemInput {
  code: string;
  name: string;
  strength: string;
  generic: string;
  category: string;
  kind: ItemKind;
}

function cleanItem(input: ItemInput) {
  if (!input.name.trim()) throw new Error("Enter the item description.");
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    strength: input.strength.trim(),
    generic: input.generic.trim(),
    category: input.category.trim() || "Other",
    kind: input.kind,
  };
}

export async function addItem(b: Backend, hid: string, input: ItemInput, existing: Item[] = []): Promise<string> {
  const v = cleanItem(input);
  if (v.code && existing.some((i) => i.code.toUpperCase() === v.code)) throw new Error(`Item code ${v.code} is already used.`);
  const id = uuid();
  await b.insert("items", [{ id, hospital_id: hid, ...v }]);
  return id;
}

export async function updateItem(b: Backend, id: string, input: ItemInput, existing: Item[] = []) {
  const v = cleanItem(input);
  if (v.code && existing.some((i) => i.id !== id && i.code.toUpperCase() === v.code)) throw new Error(`Item code ${v.code} is already used.`);
  await b.update("items", { id }, v);
}

/** The ward's crash cart list as CSV, for nurses to check the cart against. */
export function wardItemsCsv(d: HospitalData, cartId: string): string {
  const rows = stockRows(d)
    .filter((r) => r.cart.id === cartId)
    .sort((a, b) => a.drawer.sort_order - b.drawer.sort_order || a.item.code.localeCompare(b.item.code) || a.item.name.localeCompare(b.item.name));
  return toCsv(
    ["Drawer", "Code", "Description", "Strength", "Generic", "Category", "Approved qty", "Lot", "Expiry", "Qty present", "Remarks"],
    rows.map((r) => [r.drawer.name, r.item.code, r.item.name, r.item.strength, r.item.generic, r.item.category, r.cartItem.par_qty, r.cartItem.lot_number, r.cartItem.expiry_date ?? "", "", ""]),
  );
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
  if (!can.runChecks(d.perm, cartId)) throw new Error("Only a nurse or pharmacist of this ward can check its cart.");
  const checkId = uuid();
  await b.insert("checks", [
    {
      id: checkId,
      hospital_id: d.hospital.id,
      cart_id: cartId,
      check_type: type,
      audience: audienceOf(d.perm.role),
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
    item_code: r.item.code,
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

export async function submitCheck(b: Backend, check: Check, input: { seal_number: string; remarks: string }, at = now()) {
  const lines = await b.select("check_lines", { check_id: check.id });
  await b.update("checks", { id: check.id }, {
    status: "submitted",
    issue_count: lines.filter((l) => l.line_status !== "present").length,
    seal_number: input.seal_number.trim(),
    remarks: input.remarks.trim(),
    submitted_at: at,
  });
}

/** Pharmacist records what was done about an observation and closes it (audit submitted). */
export async function closeObservation(b: Backend, lineId: string, action: string) {
  if (!action.trim()) throw new Error("Write what was done before closing the observation.");
  await b.update("check_lines", { id: lineId }, { obs_action: action.trim(), obs_closed: true });
}

export async function reopenObservation(b: Backend, lineId: string) {
  await b.update("check_lines", { id: lineId }, { obs_closed: false });
}

/** Pharmacist: all observations closed, hand the audit to the Pharmacy manager. */
export async function sendForReview(b: Backend, check: Check) {
  await b.update("checks", { id: check.id }, { status: "in_review" });
}

/** Manager closes the check (nursing: from submitted; pharmacy: from in review). */
export async function closeCheck(b: Backend, check: Check, reviewer: User, notes: string, at = now()) {
  await b.update("checks", { id: check.id }, {
    status: "closed",
    review_notes: notes.trim(),
    reviewed_by_name: reviewer.name || reviewer.email,
    closed_at: at,
  });
}

/** Manager sends a check back: audits go back to the pharmacist, nurses' checks back to the nurse. */
export async function sendBack(b: Backend, check: Check, notes = "") {
  const status = check.audience === "pharmacy" && check.status !== "submitted" ? "submitted" : "draft";
  await b.update("checks", { id: check.id }, { status, closed_at: null, review_notes: notes.trim() });
}

export async function deleteCheck(b: Backend, check: Check) {
  await b.remove("checks", { id: check.id });
}

// ------------------------------------------------------------------ team

/** Normalises the wards that go with a role: one for nurses, all for managers. */
export function wardsForRole(role: Role, wardIds: string[]): string[] {
  if (ALL_WARDS.includes(role)) return [];
  const unique = [...new Set(wardIds)];
  if (SINGLE_WARD.includes(role) && unique.length !== 1) throw new Error("Choose the one ward this nurse works on.");
  return unique;
}

/** Creates an ID: the person joins with this role and these wards when they sign in with the email. */
export async function inviteMember(b: Backend, d: HospitalData, email: string, role: Role, wardIds: string[] = []) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address.");
  if (!can.grantableRoles(d.perm).includes(role)) throw new Error("You can't give that role.");
  const ward_ids = wardsForRole(role, wardIds);
  const existing = d.members.find((m) => m.email === clean);
  if (existing) {
    await b.update("memberships", { id: existing.id }, { role, ward_ids });
    return { joined: true };
  }
  await b.remove("invites", { hospital_id: d.hospital.id, email: clean });
  await b.insert("invites", [{ id: uuid(), hospital_id: d.hospital.id, email: clean, role, ward_ids }]);
  return { joined: false };
}

export async function cancelInvite(b: Backend, id: string) {
  await b.remove("invites", { id });
}

export async function changeAccess(b: Backend, membershipId: string, role: Role, wardIds: string[]) {
  await b.update("memberships", { id: membershipId }, { role, ward_ids: wardsForRole(role, wardIds) });
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
export const DEMO_SUPER = { email: "superadmin@demo.hospital", name: "Super Admin" };

/** Wards are matched by cart type in the demo: "all" means every ward. */
export const DEMO_USERS: { email: string; name: string; role: Role; wards: "all" | string[] }[] = [
  { email: "admin@demo.hospital", name: "Aisha Rahman", role: "hospital_admin", wards: "all" },
  { email: "admin.icu@demo.hospital", name: "Bilal Saeed", role: "hospital_admin", wards: ["ICU", "Emergency"] },
  { email: "nurse@demo.hospital", name: "Omar Khalid", role: "nurse", wards: ["ICU"] },
  { email: "nurse.er@demo.hospital", name: "Sara Javed", role: "nurse", wards: ["Emergency"] },
  { email: "nurse.ward@demo.hospital", name: "Hina Tariq", role: "nurse", wards: ["Ward"] },
  { email: "nursing.manager@demo.hospital", name: "Mariam Saleh", role: "nursing_manager", wards: "all" },
  { email: "pharmacist@demo.hospital", name: "Lina Haddad", role: "pharmacy", wards: "all" },
  { email: "pharmacist.er@demo.hospital", name: "Hamza Noor", role: "pharmacy", wards: ["Emergency", "Ward"] },
  { email: "pharmacy.manager@demo.hospital", name: "Yusuf Ali", role: "pharmacy_manager", wards: "all" },
];

/** A simple emblem (cross and hospital code) used as the demo hospitals' logo. */
export function demoLogo(color: string, code: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect width="256" height="256" rx="56" fill="${color}"/>` +
    `<path d="M106 40h44v50h50v44h-50v50h-44v-50H56V90h50z" fill="#fff"/>` +
    `<text x="128" y="234" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" fill="#fff" text-anchor="middle">${code}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** First day of the month `offset` months from `today`'s month, as YYYY-MM-DD. */
function monthStart(today: string, offset: number): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}

/** Builds two demo hospitals with wards, staff, nurse checks and four months of pharmacy audits. */
export async function seedDemo(b: Backend & { addSuperAdmin(email: string): void }, today = todayISO()) {
  for (const u of DEMO_USERS) await b.signUp(u.email, DEMO_PASSWORD, u.name);
  b.addSuperAdmin(DEMO_SUPER.email);
  await b.signUp(DEMO_SUPER.email, DEMO_PASSWORD, DEMO_SUPER.name);

  // The Super admin builds each hospital's portal with its own look.
  const offsets = [-12, 9, 21, 45, 160, 300, 420, 610];
  const expiryFor = (i: number) => (i % 7 === 3 ? null : addDays(today, offsets[(i * 5) % offsets.length]));
  const general = await createHospital(
    b,
    {
      name: "City General Hospital",
      code: "CGH",
      starterCarts: true,
      theme: { design: "classic", preset: "teal" },
      logo_url: demoLogo("#0f766e", "CGH"),
      details: { address: "12 Hospital Road, City Centre", phone: "+1 555 0100", email: "pharmacy@citygeneral.example" },
    },
    expiryFor,
  );
  const riverside = await createHospital(
    b,
    {
      name: "Riverside Children's Hospital",
      code: "RCH",
      starterCarts: true,
      theme: { design: "friendly", preset: "plum" },
      logo_url: demoLogo("#7e22ce", "RCH"),
      details: { address: "4 Riverside Avenue", phone: "+1 555 0200", email: "pharmacy@riverside.example" },
    },
    (i) => addDays(today, 30 + ((i * 37) % 500)),
  );

  const ws = await loadWorkspace(b);
  const superPerm: Perm = { role: null, isSuper: true, wardIds: [] };
  const h = ws!.hospitals.find((x) => x.id === general)!;
  let d = await loadHospital(b, h, superPerm);
  const wardsOf = (w: "all" | string[]) => (w === "all" ? [] : d.carts.filter((c) => w.includes(c.cart_type)).map((c) => c.id));

  // Super admin: hospital admins (some or all wards) and the two managers.
  for (const u of DEMO_USERS.filter((x) => x.role === "hospital_admin" || x.role.endsWith("_manager")))
    await inviteMember(b, d, u.email, u.role, wardsOf(u.wards));
  const r = await loadHospital(b, ws!.hospitals.find((x) => x.id === riverside)!, superPerm);
  await inviteMember(b, r, DEMO_USERS[0].email, "hospital_admin", []);

  // The hospital admin creates the nurse and pharmacist IDs.
  await b.signIn(DEMO_USERS[0].email, DEMO_PASSWORD);
  await b.acceptInvites();
  let aws = (await loadWorkspace(b))!;
  d = await loadHospital(b, h, permFor(aws, h.id)!);
  for (const u of DEMO_USERS.filter((x) => x.role === "nurse" || x.role === "pharmacy"))
    await inviteMember(b, d, u.email, u.role, wardsOf(u.wards));
  for (const u of DEMO_USERS) {
    await b.signIn(u.email, DEMO_PASSWORD);
    await b.acceptInvites();
  }

  // Four months of pharmacist audits so the Reports tab has history to compare.
  const pharmacist = DEMO_USERS.find((u) => u.role === "pharmacy" && u.wards === "all")!;
  const manager = DEMO_USERS.find((u) => u.role === "pharmacy_manager")!;
  const pattern: LineStatus[] = ["short", "absent", "near_expiry", "short", "near_expiry", "absent", "damaged"];
  const toClose: string[] = [];
  for (let m = -3; m <= 0; m++) {
    const start = monthStart(today, m);
    const day = m === 0 ? (today < addDays(start, 7) ? today : addDays(start, 7)) : addDays(start, 7 + ((m + 3) % 3));
    const at = `${day}T09:30:00.000Z`;
    await b.signIn(pharmacist.email, DEMO_PASSWORD);
    const pws = (await loadWorkspace(b))!;
    d = await loadHospital(b, h, permFor(pws, h.id)!);
    for (const [ci, cart] of d.carts.entries()) {
      const id = await startCheck(b, d, pws.user, cart.id, "monthly", day);
      const audit = await loadCheck(b, id);
      // Fewer gaps month by month, except the ward cart which slips in the last month.
      const gaps = Math.max(1, 6 - (m + 3) * 1 - ci) + (cart.cart_type === "Ward" && m === 0 ? 3 : 0);
      for (let k = 0; k < gaps && k < audit.lines.length; k++) {
        const line = audit.lines[(k * 7 + ci * 3 + (m + 3) * 5) % audit.lines.length];
        const st = pattern[(k + ci + m + 3) % pattern.length];
        const found = st === "short" ? Math.max(0, line.par_qty - 1) : st === "absent" ? 0 : null;
        const note =
          st === "absent"
            ? "Not available in pharmacy"
            : st === "short"
              ? "Below standard quantity"
              : st === "near_expiry"
                ? "Short expiry communicated to team lead"
                : st === "damaged"
                  ? "Packaging damaged"
                  : "";
        await saveLine(b, line.id, { line_status: st, found_qty: found, remarks: note });
      }
      if (ci === 0) {
        // One item kept above the approved quantity.
        const extra = audit.lines.find((l) => l.line_status === "present");
        if (extra) await saveLine(b, extra.id, { found_qty: extra.par_qty + 1, remarks: "Excess stock" });
      }
      await b.update("checks", { id }, { created_at: at });
      await submitCheck(
        b,
        audit.check,
        { seal_number: `SEAL-${5000 + (m + 3) * 10 + ci}`, remarks: gaps > 3 ? "Unavailable items are due to non-availability in the pharmacy." : "Short-expiry items have been communicated to the team lead." },
        at,
      );
      if (m < 0) {
        const after = await loadCheck(b, id);
        for (const l of after.lines.filter((x) => x.line_status !== "present"))
          await closeObservation(b, l.id, l.line_status === "near_expiry" ? "Replaced with longer-dated stock" : "Restocked from pharmacy");
        await sendForReview(b, after.check);
        toClose.push(id);
      }
    }
  }
  await b.signIn(manager.email, DEMO_PASSWORD);
  const mws = (await loadWorkspace(b))!;
  for (const id of toClose) {
    const { check: c } = await loadCheck(b, id);
    await closeCheck(b, c, mws.user, "Observations verified.", c.submitted_at ?? undefined);
  }

  await b.signIn(DEMO_USERS[0].email, DEMO_PASSWORD);
}
