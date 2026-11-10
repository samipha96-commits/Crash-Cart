import type { TableName, Tables, User } from "../types";

/** Equality filter; an array value means "column is one of". */
export type Filter = Record<string, string | number | boolean | null | string[]>;

export interface SelectOptions {
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

/**
 * The storage the app talks to. Two implementations:
 *  - `cloud` (Supabase): shared Postgres with row-level security, used when
 *    VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set.
 *  - `demo` (this device): the same tables kept in the browser's storage, so
 *    the app works with zero setup for trying it out.
 */
export interface Backend {
  mode: "demo" | "cloud";
  currentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;

  select<T extends TableName>(table: T, filter?: Filter, opts?: SelectOptions): Promise<Tables[T][]>;
  insert<T extends TableName>(table: T, rows: Partial<Tables[T]>[]): Promise<void>;
  update<T extends TableName>(table: T, filter: Filter, patch: Partial<Tables[T]>): Promise<void>;
  remove<T extends TableName>(table: T, filter: Filter): Promise<void>;

  /** True when the signed-in user is the platform Super admin. */
  isSuperAdmin(): Promise<boolean>;
  /** Creates a hospital. Super admin only. */
  createHospital(id: string, name: string, code: string): Promise<void>;
  /** Turns invites for the caller's email into memberships. */
  acceptInvites(): Promise<number>;
}

export class PermissionError extends Error {}
