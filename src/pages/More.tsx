import { useEffect, useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { ROLE_LABEL, can } from "../lib/catalog";
import { demoBackend } from "../lib/backend";
import { Icon } from "../components/icons";
import { Field, Sheet } from "../components/ui";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export function MorePage() {
  const { data, ws, backend, run, switchHospital, toast } = useApp();
  const [settings, setSettings] = useState({ name: data.hospital.name, code: data.hospital.code, days: data.hospital.near_expiry_days });
  const [creating, setCreating] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const admin = can.manageHospital(data.role);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>More</h1>
          <p>
            Signed in as {ws.user.name || ws.user.email} · {ws.isSuper ? "Super admin" : ROLE_LABEL[data.role]}
          </p>
        </div>
      </div>

      <div className="card list hide-desktop" style={{ marginBottom: 18 }}>
        <a href="#/items" className="list-item">
          <Icon.pill />
          <div className="list-main">
            <div className="t">Item list</div>
            <div className="s">Medicines and supplies used in carts</div>
          </div>
          <Icon.chevron />
        </a>
        <a href="#/team" className="list-item">
          <Icon.users />
          <div className="list-main">
            <div className="t">Staff</div>
            <div className="s">{ws.isSuper ? "Give people access and set their roles" : "People and roles"}</div>
          </div>
          <Icon.chevron />
        </a>
      </div>

      <div className="section-title">
        <h2>Hospitals</h2>
        {ws.isSuper && (
          <button className="btn small" onClick={() => setCreating(true)}>
            <Icon.plus /> New hospital
          </button>
        )}
      </div>
      <div className="card list">
        {ws.hospitals.map((h) => {
          const m = ws.memberships.find((x) => x.hospital_id === h.id);
          return (
            <button key={h.id} className="list-item" onClick={() => switchHospital(h.id)}>
              <div className="list-main">
                <div className="t">{h.name}</div>
                <div className="s">
                  {h.code} · {ws.isSuper ? "Super admin" : m ? ROLE_LABEL[m.role] : ""}
                </div>
              </div>
              {h.id === data.hospital.id ? <span className="badge primary">Current</span> : <Icon.chevron />}
            </button>
          );
        })}
      </div>

      {admin && (
        <div className="section">
          <div className="section-title">
            <h2>Hospital settings</h2>
          </div>
          <form
            className="card card-pad"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => api.updateHospital(backend, data.hospital.id, { name: settings.name.trim(), code: settings.code.trim().toUpperCase(), near_expiry_days: Math.min(365, Math.max(1, settings.days)) }),
                "Settings saved",
              );
            }}
          >
            <div className="grid cols-2">
              <Field label="Hospital name">
                <input className="input" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
              </Field>
              <Field label="Short code">
                <input className="input" value={settings.code} onChange={(e) => setSettings({ ...settings, code: e.target.value })} />
              </Field>
            </div>
            <Field label="Warn about expiry this many days ahead" hint="Items inside this window show as “expiring” and are flagged during checks.">
              <input className="input" type="number" min={1} max={365} value={settings.days} onChange={(e) => setSettings({ ...settings, days: Number(e.target.value) })} />
            </Field>
            <button className="btn primary">Save settings</button>
          </form>
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <h2>App</h2>
        </div>
        <div className="card card-pad small">
          {standalone ? (
            <p style={{ marginTop: 0 }}>Crash Cart is installed on this device.</p>
          ) : install ? (
            <button className="btn primary" onClick={() => void install.prompt().then(() => setInstall(null))}>
              Install Crash Cart on this device
            </button>
          ) : (
            <p style={{ marginTop: 0 }}>
              <strong>Install on your phone:</strong> on iPhone, tap Share then “Add to Home Screen”. On Android, open the browser menu
              and tap “Install app”.
            </p>
          )}
          <p className="muted">
            {backend.mode === "demo"
              ? "Demo mode: data is stored in this browser only. Connect a Supabase project to share data across devices (see README)."
              : "Connected: data is shared securely with your hospital's staff."}
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => void backend.signOut()}>
              <Icon.logout /> Sign out
            </button>
            {demoBackend && (
              <button
                className="btn danger"
                onClick={() => {
                  if (!confirm("Reset the demo? All demo data on this device will be replaced with fresh sample data.")) return;
                  demoBackend!.reset();
                  toast("Demo reset");
                  window.location.hash = "/";
                  window.location.reload();
                }}
              >
                Reset demo data
              </button>
            )}
          </div>
        </div>
      </div>

      {creating && (
        <Sheet title="New hospital" onClose={() => setCreating(false)}>
          <EmbeddedOnboarding
            onDone={(id) => {
              setCreating(false);
              switchHospital(id);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function EmbeddedOnboarding({ onDone }: { onDone: (id: string) => void }) {
  const { backend, toast, refreshWorkspace } = useApp();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [starter, setStarter] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const id = await api.createHospital(backend, { name, code, starterCarts: starter });
          await refreshWorkspace();
          onDone(id);
        } catch (err) {
          toast((err as Error).message, "error");
          setBusy(false);
        }
      }}
    >
      <p className="muted small" style={{ marginTop: -6 }}>
        Its carts, checks and staff are kept separate from other hospitals. Afterwards, add its hospital admin from Staff &amp; rights.
      </p>
      <Field label="Hospital name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Short code">
        <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} required />
      </Field>
      <label className="row small" style={{ margin: "4px 0 14px" }}>
        <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} /> Add 3 starter carts with standard contents
      </label>
      <button className="btn primary block" disabled={busy}>
        {busy ? "Creating…" : "Create hospital"}
      </button>
    </form>
  );
}
