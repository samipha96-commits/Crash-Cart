import { createLocalBackend } from "./local";
import { createSupabaseBackend } from "./supabase";
import type { Backend } from "./types";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const demoBackend = url && key ? null : createLocalBackend();
export const backend: Backend = url && key ? createSupabaseBackend(url, key) : demoBackend!;
export type { Backend } from "./types";
