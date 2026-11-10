import type { Role, TableName, Tables, User } from "../types";
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
  version: 1;
  users: DemoUser[];
  sessionUserId: string | null;
  tables: { [K in TableName]: Tables[K][] };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEMO_KEY = "crash-cart-demo-v1";

const ALL: Role[] = ["hospital_admin", "pharmacy", "nurse", "quality", "manager"];
const WRITE_RULES: Record<TableName, Role[] | null> = {
  hospitals: ["hospital_admin"],
  memberships: ["hospital_admin"],
  invites: ["hospital_admin"],
  items: ["hospital_admin", "pharmacy"],
  carts: ["hospital_admin"],
  drawers: ["hospital_admin"],
  cart_items: ["hospital_admin", "pharmacy"],
  checks: ["hospital_admin", "pharmacy", "nurse", "quality", "manager"],
  check_lines: ["hospital_admin", "pharmacy", "nurse", "quality"],
};

const DEFAULTS: { [K in TableName]: () => Partial<Tables[K]> } = {
  hospitals: () => ({ near_expiry_days: 30, created_at: new Date().toISOString() }),
  memberships: () => ({ name: "", created_at: new Date().toISOString() }),
  invites: () => ({ created_at: new Date().toISOString() }),
  items: () => ({ category: "General", strength: "", is_active: true, created_at: new Date().toISOString() }),
  carts: () => ({ cart_type: "Ward", seal_number: "", created_at: new Date().toISOString() }),
  drawers: () => ({}),
  cart_items: () => ({ par_qty: 1, lot_number: "", expiry_date: null, updated_at: new Date().toISOString() }),
  checks: () => ({
    status: "draft",
    performed_by_name: "",
    seal_number: "",
    remarks: "",
    review_notes: "",
    reviewed_by_name: "",
    created_at: new Date().toISOString(),
    submitted_at: null,
    closed_at: null,
  }),
  check_lines: () => ({ strength: "", drawer_order: 0, found_qty: null, expiry_date: null, line_status: "present", remarks: "" }),
};

function emptyDb(): DemoDb {
  return {
    version: 1,
    users: [],
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

export function createLocalBackend(store?: KeyValueStore): Backend & { reset(): void; isEmpty(): boolean } {
  const kv: KeyValueStore =
    store ?? (typeof localStorage !== "undefined" ? localStorage : memoryStore());
  const listeners = new Set<() => void>();

  function load(): DemoDb {
    try {
      const raw = kv.getItem(DEMO_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDb;
        if (parsed.version === 1) return parsed;
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

  function roleIn(hospitalId: string | undefined): Role | null {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    if (!u || !hospitalId) return null;
    return db.tables.memberships.find((m) => m.hospital_id === hospitalId && m.user_id === u.id)?.role ?? null;
  }

  function hospitalOf(table: TableName, row: Record<string, unknown>): string | undefined {
    return (table === "hospitals" ? row.id : row.hospital_id) as string | undefined;
  }

  function assertWrite(table: TableName, row: Record<string, unknown>) {
    const role = roleIn(hospitalOf(table, row));
    const allowed = WRITE_RULES[table] ?? ALL;
    if (!role || !allowed.includes(role)) throw new PermissionError("Your role cannot do that.");
  }

  function guardCheckChange(before: Tables["checks"], after: Tables["checks"]) {
    const role = roleIn(before.hospital_id);
    const reviewer = role === "hospital_admin" || role === "quality" || role === "manager";
    if (after.status === "closed" && before.status !== "closed" && !reviewer)
      throw new PermissionError("Only an admin, quality or manager can close a check.");
    if (after.status === "draft" && before.status !== "draft" && !reviewer)
      throw new PermissionError("Only an admin, quality or manager can reopen a check.");
  }

  function guardLine(line: Tables["check_lines"]) {
    const c = db.tables.checks.find((x) => x.id === line.check_id);
    if (c && c.status !== "draft") throw new PermissionError("This check is already submitted.");
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
      let rows = (db.tables[table] as unknown as Record<string, unknown>[]).filter(
        (r) => roleIn(hospitalOf(table, r)) !== null,
      );
      rows = rows.filter((r) => matches(r, filter));
      if (table === "invites") rows = rows.filter((r) => roleIn(r.hospital_id as string) === "hospital_admin");
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
        if (!matches(r, filter) || roleIn(hospitalOf(table, r)) === null) continue;
        assertWrite(table, r);
        const next = { ...r, ...patch };
        if (table === "checks") guardCheckChange(r as never, next as never);
        if (table === "check_lines") guardLine(r as never);
        rows[i] = next;
      }
      save();
    },

    async remove(table, filter) {
      const user = me();
      const rows = db.tables[table] as unknown as Record<string, unknown>[];
      const doomed: string[] = [];
      for (const r of rows) {
        if (!matches(r, filter) || roleIn(hospitalOf(table, r)) === null) continue;
        if (table === "checks") {
          const own = r.status === "draft" && r.performed_by === user.id;
          if (!own && roleIn(r.hospital_id as string) !== "hospital_admin")
            throw new PermissionError("Only an admin can delete a submitted check.");
        } else {
          assertWrite(table, r);
          if (table === "check_lines") guardLine(r as never);
          if (table === "memberships" && r.user_id === user.id)
            throw new PermissionError("You cannot remove yourself.");
        }
        doomed.push(r.id as string);
      }
      (db.tables[table] as unknown) = rows.filter((r) => !doomed.includes(r.id as string));
      cascade(table, doomed);
      save();
    },

    async createHospital(id, name, code) {
      const user = me();
      if (name.trim().length < 2 || code.trim().length < 2) throw new Error("Name and short code are required.");
      db.tables.hospitals.push({
        id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        near_expiry_days: 30,
        created_by: user.id,
        created_at: new Date().toISOString(),
      });
      db.tables.memberships.push({
        id: crypto.randomUUID(),
        hospital_id: id,
        user_id: user.id,
        email: user.email,
        name: user.name,
        role: "hospital_admin",
        created_at: new Date().toISOString(),
      });
      save();
    },

    async acceptInvites() {
      const user = me();
      const mine = db.tables.invites.filter((i) => i.email === user.email);
      for (const inv of mine) {
        const existing = db.tables.memberships.find((m) => m.hospital_id === inv.hospital_id && m.user_id === user.id);
        if (existing) existing.role = inv.role;
        else
          db.tables.memberships.push({
            id: crypto.randomUUID(),
            hospital_id: inv.hospital_id,
            user_id: user.id,
            email: user.email,
            name: user.name,
            role: inv.role,
            created_at: new Date().toISOString(),
          });
      }
      db.tables.invites = db.tables.invites.filter((i) => i.email !== user.email);
      save();
      return mine.length;
    },
  };
}
