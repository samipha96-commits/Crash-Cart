import { createContext, useContext } from "react";
import type { HospitalData, Workspace } from "./api";
import type { Backend } from "./backend/types";

export interface AppCtx {
  backend: Backend;
  ws: Workspace;
  data: HospitalData;
  reload: () => Promise<void>;
  switchHospital: (id: string) => void;
  /** Re-reads the user's hospitals and roles (after creating a hospital). */
  refreshWorkspace: () => Promise<void>;
  toast: (msg: string, kind?: "ok" | "error") => void;
  /** Runs an action, shows its error as a toast, and reloads data on success. */
  run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}
