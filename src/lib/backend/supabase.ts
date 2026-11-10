import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TableName, Tables, User } from "../types";
import type { Backend, Filter, SelectOptions } from "./types";

function applyFilter<Q extends { eq: Function; in: Function; is: Function }>(q: Q, filter: Filter = {}): Q {
  let out = q;
  for (const [col, val] of Object.entries(filter)) {
    if (Array.isArray(val)) out = out.in(col, val);
    else if (val === null) out = out.is(col, null);
    else out = out.eq(col, val);
  }
  return out;
}

function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  return {
    mode: "cloud",

    async currentUser(): Promise<User | null> {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      return { id: u.id, email: (u.email ?? "").toLowerCase(), name: String(u.user_metadata?.name ?? "") };
    },

    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email: email.trim(), password }));
    },

    async signUp(email, password, name) {
      const res = check(
        await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin + window.location.pathname },
        }),
      );
      return { needsConfirmation: !res.data.session };
    },

    async signOut() {
      await sb.auth.signOut();
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },

    async select<T extends TableName>(table: T, filter?: Filter, opts?: SelectOptions) {
      let q = applyFilter(sb.from(table).select("*"), filter);
      if (opts?.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
      if (opts?.limit) q = q.limit(opts.limit);
      const res = check(await q);
      return (res.data ?? []) as Tables[T][];
    },

    async insert(table, rows) {
      if (rows.length === 0) return;
      // Large starter carts go in chunks to stay well under request limits.
      for (let i = 0; i < rows.length; i += 500) {
        check(await sb.from(table).insert(rows.slice(i, i + 500) as never));
      }
    },

    async update(table, filter, patch) {
      check(await applyFilter(sb.from(table).update(patch as never), filter));
    },

    async remove(table, filter) {
      check(await applyFilter(sb.from(table).delete(), filter));
    },

    async createHospital(id, name, code) {
      check(await sb.rpc("create_hospital", { p_id: id, p_name: name, p_code: code }));
    },

    async acceptInvites() {
      const res = check(await sb.rpc("accept_invites"));
      return Number(res.data ?? 0);
    },
  };
}
