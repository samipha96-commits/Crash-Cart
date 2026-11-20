import type { Audience, Membership, Role, TableName, Tables, User } from "../types";
import { PermissionError, type Backend, type Filter, type SelectOptions } from "./types";

/**
 * Demo backend: the same tables as the Supabase schema, kept in the browser's
 * localStorage. It applies the same membership/role rules as the database's
 * row-level security, so the demo behaves like the real thing.
 */

interface DemoUser extends User {
  password: string;
}

interface DemoDb {
  version: 3;
  users: DemoUser[];
  /** Emails of Super admins (the platform owner). */
  superEmails: string[];
  sessionUserId: string | null;
  tables: { [K in TableName]: Tables[K][] };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEMO_KEY = "crash-cart-demo-v4";

const DEFAULTS: { [K in TableName]: () => Partial<Tables[K]> } = {
  hospitals: () => ({ near_expiry_days: 30, theme: {}, logo_url: "", address: "", phone: "", email: "", created_at: new Date().toISOString() }),
  memberships: () => ({ name: "", ward_ids: [], created_at: new Date().toISOString() }),
  invites: () => ({ ward_ids: [], created_at: new Date().toISOString() }),
  items: () => ({ code: "", generic: "", category: "Other", strength: "", is_active: true, created_at: new Date().toISOString() }),
  carts: () => ({ cart_type: "Ward", seal_number: "", created_at: new Date().toISOString() }),
  drawers: () => ({}),
  cart_items: () => ({ par_qty: 1, lot_number: "", expiry_date: null, updated_at: new Date().toISOString() }),
  checks: () => ({
    status: "draft",
    audience: "pharmacy",
    issue_count: 0,
    performed_by_name: "",
    seal_number: "",
    remarks: "",
    review_notes: "",
    reviewed_by_name: "",
    created_at: new Date().toISOString(),
    submitted_at: null,
    closed_at: null,
  }),
  check_lines: () => ({
    item_code: "",
    strength: "",
    drawer_order: 0,
    found_qty: null,
    expiry_date: null,
    line_status: "present",
    remarks: "",
    obs_action: "",
    obs_closed: false,
  }),
};

const ADMIN_GRANTABLE: Role[] = ["nurse", "pharmacy"];
/** Who may read checks of each kind. Nurses see the pharmacy's checks of their ward (read-only). */
const DEPT: Record<Audience, Role[]> = {
  nursing: ["nurse", "nursing_manager"],
  pharmacy: ["pharmacy", "pharmacy_manager", "nurse", "nursing_manager"],
};
const RESTOCK_FIELDS = ["lot_number", "expiry_date", "updated_at"];
const CHECKER: Record<Audience, Role> = { nursing: "nurse", pharmacy: "pharmacy" };
const REVIEWER: Record<Audience, Role> = { nursing: "nursing_manager", pharmacy: "pharmacy_manager" };
const OBS_FIELDS = ["obs_action", "obs_closed"];

function emptyDb(): DemoDb {
  return {
    version: 3,
    users: [],
    superEmails: [],
    sessionUserId: null,
    tables: {
      hospitals: [],
      memberships: [],
      invites: [],
      items: [],
      carts: [],
      drawers: [],
      cart_items: [],
      checks: [],
      check_lines: [],
    },
  };
}

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function matches(row: Record<string, unknown>, filter: Filter = {}): boolean {
  return Object.entries(filter).every(([col, val]) =>
    Array.isArray(val) ? val.includes(row[col] as string) : row[col] === val,
  );
}

export function createLocalBackend(store?: KeyValueStore): Backend & { reset(): void; isEmpty(): boolean; addSuperAdmin(email: string): void } {
  const kv: KeyValueStore =
    store ?? (typeof localStorage !== "undefined" ? localStorage : memoryStore());
  const listeners = new Set<() => void>();

  function load(): DemoDb {
    try {
      const raw = kv.getItem(DEMO_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDb;
        if (parsed.version === 3 && Array.isArray(parsed.superEmails)) return parsed;
      }
    } catch {
      /* corrupted or blocked storage: start fresh */
    }
    return emptyDb();
  }

  let db = load();
  const save = () => {
    try {
      kv.setItem(DEMO_KEY, JSON.stringify(db));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  };
  const notify = () => listeners.forEach((cb) => cb());

  function me(): DemoUser {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    if (!u) throw new PermissionError("Sign in first.");
    return u;
  }

  function isSuper(): boolean {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    return !!u && db.superEmails.includes(u.email);
  }

  function mem(hospitalId: string | undefined): Membership | null {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    if (!u || !hospitalId) return null;
    return db.tables.memberships.find((m) => m.hospital_id === hospitalId && m.user_id === u.id) ?? null;
  }

  function hospitalExists(id: string | undefined) {
    return !!id && db.tables.hospitals.some((h) => h.id === id);
  }

  /** Mirrors ward_ok() in SQL: the caller covers this cart (empty ward list = all). */
  function wardOk(hid: string, cartId: string, roles?: Role[]): boolean {
    if (isSuper()) return hospitalExists(hid);
    const m = mem(hid);
    if (!m || (roles && !roles.includes(m.role))) return false;
    return m.ward_ids.length === 0 || m.ward_ids.includes(cartId);
  }

  function checkOf(id: unknown) {
    return db.tables.checks.find((x) => x.id === id);
  }

  /** Mirrors can_see_check(): nursing checks stay in nursing, audits in pharmacy. */
  function seesCheck(c: Tables["checks"] | undefined): boolean {
    if (!c) return false;
    return wardOk(c.hospital_id, c.cart_id, DEPT[c.audience]);
  }

  function canRead(table: TableName, r: Record<string, unknown>): boolean {
    const hid = (table === "hospitals" ? r.id : r.hospital_id) as string;
    if (isSuper()) return hospitalExists(hid);
    const m = mem(hid);
    if (!m) return false;
    switch (table) {
      case "invites":
        return m.role === "hospital_admin";
      case "carts":
        return wardOk(hid, r.id as string);
      case "drawers":
      case "cart_items":
        return wardOk(hid, r.cart_id as string);
      case "checks":
        return seesCheck(r as unknown as Tables["checks"]);
      case "check_lines":
        return seesCheck(checkOf(r.check_id));
      default:
        return true;
    }
  }

  /** A Hospital admin may give nurse / pharmacist rights inside their own wards. */
  function adminCanGrant(hid: string, role: Role, wardIds: string[]): boolean {
    const m = mem(hid);
    if (!m || m.role !== "hospital_admin" || !ADMIN_GRANTABLE.includes(role)) return false;
    if (m.ward_ids.length === 0) return true;
    return wardIds.length > 0 && wardIds.every((w) => m.ward_ids.includes(w));
  }

  function assertGrant(hid: string, role: Role, wardIds: string[]) {
    if (role === "nurse" && wardIds.length !== 1) throw new Error("A nurse is given exactly one ward.");
    if (isSuper()) return;
    if (!adminCanGrant(hid, role, wardIds))
      throw new PermissionError("Only the Super admin can give this role, or a Hospital admin for nurses and pharmacists of their own wards.");
  }

  function assertWrite(table: TableName, r: Record<string, unknown>, before?: Record<string, unknown>) {
    const hid = (table === "hospitals" ? r.id : r.hospital_id) as string;
    const deny = (msg = "Your role cannot do that.") => {
      throw new PermissionError(msg);
    };
    switch (table) {
      case "hospitals":
        if (!isSuper()) deny("Only the Super admin can change the hospital portal.");
        return;
      case "memberships":
      case "invites":
        if (before) assertGrant(hid, before.role as Role, before.ward_ids as string[]);
        assertGrant(hid, r.role as Role, r.ward_ids as string[]);
        return;
      case "items":
        if (!(isSuper() || mem(hid)?.role === "hospital_admin")) deny("Only the Hospital admin keeps the item list.");
        return;
      case "carts":
        // Wards are created and removed by the Super admin; admins of the ward may rename / reseal.
        if (!isSuper() && !(before && wardOk(hid, r.id as string, ["hospital_admin"]))) deny("Only the Super admin can add or remove wards.");
        return;
      case "drawers":
        if (!wardOk(hid, r.cart_id as string, ["hospital_admin"])) deny("Only the Hospital admin of this ward can set its crash cart.");
        return;
      case "cart_items": {
        // The ward's admin sets items; pharmacists and nurses only update lot and expiry.
        if (wardOk(hid, r.cart_id as string, ["hospital_admin"])) return;
        const restocker = wardOk(hid, r.cart_id as string, ["pharmacy", "nurse", "nursing_manager"]);
        const onlyRestock = before && Object.keys(r).every((k) => RESTOCK_FIELDS.includes(k) || r[k] === before[k]) && before !== r;
        if (!restocker || !onlyRestock) deny("Only the Hospital admin of this ward can change its items; others update expiry and lot.");
        return;
      }
      case "checks": {
        const c = r as unknown as Tables["checks"];
        if (!before) {
          if (isSuper() || c.audience !== "pharmacy" || !wardOk(hid, c.cart_id, ["pharmacy"]))
            deny("Only a pharmacist of this ward can check its cart.");
        } else if (!seesCheck(before as unknown as Tables["checks"])) deny();
        return;
      }
      case "check_lines": {
        const c = checkOf(r.check_id);
        if (!c || !seesCheck(c)) deny();
        return;
      }
    }
  }

  function guardCheckChange(before: Tables["checks"], after: Tables["checks"]) {
    const role = isSuper() ? null : mem(before.hospital_id)?.role ?? null;
    const reviewer = isSuper() || role === REVIEWER[before.audience];
    const checker = role === CHECKER[before.audience];
    if (after.audience !== before.audience || after.cart_id !== before.cart_id) throw new PermissionError("A check cannot be moved.");
    if (before.status === after.status) {
      if (before.status === "draft" && !checker) throw new PermissionError("Only the checker can change a check in progress.");
      if (before.status !== "draft" && !reviewer && !checker) throw new PermissionError("Your role cannot do that.");
      return;
    }
    const step = `${before.status}>${after.status}`;
    if (step === "draft>submitted") {
      if (!checker) throw new PermissionError("Only the checker can submit.");
    } else if (step === "submitted>in_review") {
      if (before.audience !== "pharmacy" || role !== "pharmacy") throw new PermissionError("Only a pharmacist can send an audit for review.");
      const open = db.tables.check_lines.filter((l) => l.check_id === before.id && l.line_status !== "present" && !l.obs_closed);
      if (open.length) throw new PermissionError(`Close all observations first (${open.length} still open).`);
    } else if (step === "in_review>closed" || (step === "submitted>closed" && before.audience === "nursing")) {
      if (!reviewer)
        throw new PermissionError(before.audience === "nursing" ? "Only the nursing manager can close a nurse's check." : "Only the pharmacy manager can close an audit.");
    } else if (step === "submitted>closed") {
      throw new PermissionError("The pharmacist closes the observations and sends the audit for review first.");
    } else if (after.status === "draft" || step === "in_review>submitted" || step === "closed>submitted") {
      if (!reviewer) throw new PermissionError("Only the manager can send a check back.");
    } else {
      throw new PermissionError("That status change isn't allowed.");
    }
  }

  function guardLine(line: Tables["check_lines"], patch?: Record<string, unknown>) {
    const c = checkOf(line.check_id);
    if (!c) throw new PermissionError("Check not found.");
    const role = isSuper() ? null : mem(c.hospital_id)?.role ?? null;
    if (c.status === "draft") {
      if (role !== CHECKER[c.audience]) throw new PermissionError("Only the checker can fill in a check.");
      return;
    }
    const obsOnly = patch && Object.keys(patch).every((k) => OBS_FIELDS.includes(k));
    if (obsOnly && c.status === "submitted" && c.audience === "pharmacy" && role === "pharmacy") return;
    throw new PermissionError("This check is already submitted.");
  }

  function cascade(table: TableName, ids: string[]) {
    const children: Partial<Record<TableName, [TableName, string][]>> = {
      hospitals: [
        ["memberships", "hospital_id"],
        ["invites", "hospital_id"],
        ["items", "hospital_id"],
        ["carts", "hospital_id"],
      ],
      carts: [
        ["drawers", "cart_id"],
        ["cart_items", "cart_id"],
        ["checks", "cart_id"],
      ],
      drawers: [["cart_items", "drawer_id"]],
      items: [["cart_items", "item_id"]],
      checks: [["check_lines", "check_id"]],
    };
    for (const [child, col] of children[table] ?? []) {
      const rows = db.tables[child] as unknown as Record<string, unknown>[];
      const doomed = rows.filter((r) => ids.includes(r[col] as string)).map((r) => r.id as string);
      if (doomed.length === 0) continue;
      (db.tables[child] as unknown) = rows.filter((r) => !doomed.includes(r.id as string));
      cascade(child, doomed);
    }
  }

  return {
    mode: "demo",

    /** Demo only: mark an email as Super admin (the real app uses the super_admins table). */
    addSuperAdmin(email: string) {
      db.superEmails.push(email.trim().toLowerCase());
      save();
    },

    reset() {
      db = emptyDb();
      save();
      notify();
    },

    isEmpty() {
      return db.users.length === 0;
    },

    async currentUser() {
      const u = db.users.find((x) => x.id === db.sessionUserId);
      return u ? { id: u.id, email: u.email, name: u.name } : null;
    },

    async signIn(email, password) {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase());
      if (!u || u.password !== password) throw new Error("Wrong email or password.");
      db.sessionUserId = u.id;
      save();
      notify();
    },

    async signUp(email, password, name) {
      const clean = email.trim().toLowerCase();
      if (!clean.includes("@")) throw new Error("Enter a valid email.");
      if (password.length < 6) throw new Error("Use at least 6 characters for the password.");
      if (db.users.some((x) => x.email === clean)) throw new Error("That email already has an account.");
      const user: DemoUser = { id: crypto.randomUUID(), email: clean, name: name.trim(), password };
      db.users.push(user);
      db.sessionUserId = user.id;
      save();
      notify();
      return { needsConfirmation: false };
    },

    async signOut() {
      db.sessionUserId = null;
      save();
      notify();
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async select<T extends TableName>(table: T, filter?: Filter, opts?: SelectOptions) {
      me();
      let rows = (db.tables[table] as unknown as Record<string, unknown>[]).filter((r) => canRead(table, r));
      rows = rows.filter((r) => matches(r, filter));
      if (opts?.order) {
        const { column, ascending = true } = opts.order;
        rows = [...rows].sort((a, b) => {
          const x = a[column] as string | number;
          const y = b[column] as string | number;
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (opts?.limit) rows = rows.slice(0, opts.limit);
      return structuredClone(rows) as unknown as Tables[T][];
    },

    async insert(table, rows) {
      const user = me();
      const full = rows.map((r) => ({ id: crypto.randomUUID(), ...DEFAULTS[table](), ...r })) as Record<
        string,
        unknown
      >[];
      for (const r of full) {
        if (table === "check_lines") {
          const c = checkOf(r.check_id);
          if (!c || c.status !== "draft" || isSuper() || mem(c.hospital_id)?.role !== CHECKER[c.audience])
            throw new PermissionError("Only the checker can fill in a check.");
        }
        assertWrite(table, r);
        if (table === "checks" && r.performed_by !== user.id)
          throw new PermissionError("A check must be started by the signed-in user.");
      }
      (db.tables[table] as unknown as Record<string, unknown>[]).push(...full);
      save();
    },

    async update(table, filter, patch) {
      me();
      const rows = db.tables[table] as unknown as Record<string, unknown>[];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!matches(r, filter) || !canRead(table, r)) continue;
        const next = { ...r, ...patch };
        assertWrite(table, next, r);
        if (table === "checks") guardCheckChange(r as never, next as never);
        if (table === "check_lines") guardLine(r as never, patch as Record<string, unknown>);
        rows[i] = next;
      }
      save();
    },

    async remove(table, filter) {
      const user = me();
      const rows = db.tables[table] as unknown as Record<string, unknown>[];
      const doomed: string[] = [];
      for (const r of rows) {
        if (!matches(r, filter) || !canRead(table, r)) continue;
        if (table === "checks") {
          const own = r.status === "draft" && r.performed_by === user.id;
          if (!own && !isSuper()) throw new PermissionError("Only the person who started a check can delete it, while it is in progress.");
        } else if (table === "carts") {
          if (!isSuper()) throw new PermissionError("Only the Super admin can remove wards.");
        } else {
          assertWrite(table, r, r);
          if (table === "check_lines") guardLine(r as never);
        }
        doomed.push(r.id as string);
      }
      (db.tables[table] as unknown) = rows.filter((r) => !doomed.includes(r.id as string));
      cascade(table, doomed);
      save();
    },

    async isSuperAdmin() {
      return isSuper();
    },

    async createHospital(id, name, code) {
      const user = me();
      if (!isSuper()) throw new PermissionError("Only the Super admin can create hospitals.");
      if (name.trim().length < 2 || code.trim().length < 2) throw new Error("Name and short code are required.");
      db.tables.hospitals.push({
        id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        near_expiry_days: 30,
        theme: {},
        logo_url: "",
        address: "",
        phone: "",
        email: "",
        created_by: user.id,
        created_at: new Date().toISOString(),
      });
      save();
    },

    async acceptInvites() {
      const user = me();
      const mine = db.tables.invites.filter((i) => i.email === user.email);
      for (const inv of mine) {
        const existing = db.tables.memberships.find((m) => m.hospital_id === inv.hospital_id && m.user_id === user.id);
        if (existing) {
          existing.role = inv.role;
          existing.ward_ids = inv.ward_ids;
        } else
          db.tables.memberships.push({
            id: crypto.randomUUID(),
            hospital_id: inv.hospital_id,
            user_id: user.id,
            email: user.email,
            name: user.name,
            role: inv.role,
            ward_ids: inv.ward_ids,
            created_at: new Date().toISOString(),
          });
      }
      db.tables.invites = db.tables.invites.filter((i) => i.email !== user.email);
      save();
      return mine.length;
    },
  };
}
