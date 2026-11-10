import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./lib/api";
import { backend, demoBackend } from "./lib/backend";
import { AppContext, type AppCtx } from "./lib/app-context";
import { match, navigate, usePath } from "./lib/router";
import { Shell } from "./components/Shell";
import { AuthScreen } from "./pages/Auth";
import { Onboarding } from "./pages/Onboarding";
import { HomePage } from "./pages/Home";
import { CartsPage } from "./pages/Carts";
import { CartPage } from "./pages/Cart";
import { ChecksPage } from "./pages/Checks";
import { CheckPage } from "./pages/Check";
import { ExpiryPage } from "./pages/Expiry";
import { ItemsPage } from "./pages/Items";
import { TeamPage } from "./pages/Team";
import { MorePage } from "./pages/More";

const HOSPITAL_KEY = "crash-cart-hospital";

let seeding: Promise<void> | null = null;
/** First visit in Demo mode: build the sample hospitals, then show the sign-in screen. */
function ensureDemoSeeded(): Promise<void> {
  if (!demoBackend || !demoBackend.isEmpty()) return seeding ?? Promise.resolve();
  seeding ??= (async () => {
    await api.seedDemo(demoBackend);
    await demoBackend.signOut();
  })();
  return seeding;
}

function readHospitalPref(): string | null {
  try {
    return localStorage.getItem(HOSPITAL_KEY);
  } catch {
    return null;
  }
}

function writeHospitalPref(id: string) {
  try {
    localStorage.setItem(HOSPITAL_KEY, id);
  } catch {
    /* private mode: fine */
  }
}

type Phase = { kind: "loading" } | { kind: "signed-out" } | { kind: "error"; message: string } | { kind: "ready"; ws: api.Workspace };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [hospitalId, setHospitalId] = useState<string | null>(readHospitalPref());
  const [data, setData] = useState<api.HospitalData | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), kind === "error" ? 5000 : 2600);
  }, []);

  const loadWs = useCallback(async () => {
    try {
      await ensureDemoSeeded();
      const ws = await api.loadWorkspace(backend);
      setPhase(ws ? { kind: "ready", ws } : { kind: "signed-out" });
      if (!ws) {
        setData(null);
        // Next sign-in starts on the home screen, not wherever the last person left off.
        if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void loadWs();
    return backend.onAuthChange(() => void loadWs());
  }, [loadWs]);

  const ws = phase.kind === "ready" ? phase.ws : null;
  const hospital = ws ? (ws.hospitals.find((h) => h.id === hospitalId) ?? ws.hospitals[0] ?? null) : null;
  const role = ws && hospital ? api.roleFor(ws, hospital.id) : null;

  const currentHospital = useRef<string | null>(null);
  currentHospital.current = hospital?.id ?? null;

  const reload = useCallback(async () => {
    if (!hospital || !role) return;
    try {
      const next = await api.loadHospital(backend, hospital, role);
      // Ignore a slow load for a hospital the user has already switched away from.
      if (currentHospital.current === next.hospital.id) setData(next);
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }, [hospital, role, showToast]);

  useEffect(() => {
    setData((d) => (d && hospital && d.hospital.id === hospital.id ? d : null));
    void reload();
  }, [reload, hospital]);

  const switchHospital = useCallback((id: string) => {
    writeHospitalPref(id);
    setHospitalId(id);
    navigate("/");
  }, []);

  const ctx: AppCtx | null = useMemo(() => {
    if (!ws || !data) return null;
    return {
      backend,
      ws,
      data,
      reload,
      switchHospital,
      refreshWorkspace: loadWs,
      toast: showToast,
      run: async (fn, success) => {
        try {
          await fn();
          if (success) showToast(success);
          await reload();
          return true;
        } catch (e) {
          showToast((e as Error).message || "Something went wrong.", "error");
          return false;
        }
      },
    };
  }, [ws, data, reload, switchHospital, showToast, loadWs]);

  const toastEl = toast && (
    <div className={`toast ${toast.kind === "error" ? "error" : ""}`} role="status">
      {toast.msg}
    </div>
  );

  if (phase.kind === "loading") return <Splash />;
  if (phase.kind === "error")
    return (
      <div className="auth-wrap">
        <div className="card card-pad auth-card">
          <h2>Can't reach the server</h2>
          <p className="muted">{phase.message}</p>
          <button className="btn primary" onClick={() => void loadWs()}>
            Try again
          </button>
        </div>
      </div>
    );
  if (phase.kind === "signed-out") return <AuthScreen />;
  if (!ws!.hospitals.length)
    return (
      <>
        <Onboarding
          user={ws!.user}
          isSuper={ws!.isSuper}
          onCreated={async (id) => {
            writeHospitalPref(id);
            setHospitalId(id);
            await loadWs();
          }}
          onError={(m) => showToast(m, "error")}
        />
        {toastEl}
      </>
    );
  if (!ctx) return <Splash />;

  return (
    <AppContext.Provider value={ctx}>
      <Shell>
        <Routes />
      </Shell>
      {toastEl}
    </AppContext.Provider>
  );
}

function Routes() {
  const path = usePath();
  let m: Record<string, string> | null;
  if ((m = match("/carts/:id", path))) return <CartPage id={m.id} />;
  if ((m = match("/checks/:id", path))) return <CheckPage key={m.id} id={m.id} />;
  if (match("/carts", path)) return <CartsPage />;
  if (match("/checks", path)) return <ChecksPage />;
  if (match("/expiry", path)) return <ExpiryPage />;
  if (match("/items", path)) return <ItemsPage />;
  if (match("/team", path)) return <TeamPage />;
  if (match("/more", path)) return <MorePage />;
  return <HomePage />;
}

function Splash() {
  return (
    <div className="auth-wrap">
      <div className="muted">Loading…</div>
    </div>
  );
}
