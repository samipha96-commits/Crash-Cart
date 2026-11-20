import { useEffect, useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { ROLE_LABEL, can } from "../lib/catalog";
import { demoBackend } from "../lib/backend";
import { Icon } from "../components/icons";
import { Field, Sheet } from "../components/ui";
import { THEME_PRESETS, isHexColor, logoDataUrl } from "../lib/theme";
import type { HospitalTheme, ThemePreset } from "../lib/types";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export function MorePage() {
  const { data, ws, backend, run, switchHospital, toast } = useApp();
  const [settings, setSettings] = useState({ name: data.hospital.name, code: data.hospital.code, days: data.hospital.near_expiry_days });
  const [creating, setCreating] = useState(false);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const admin = can.manageHospital(data.perm);
  const roleLabel = ws.isSuper ? "Super admin" : data.perm.role ? ROLE_LABEL[data.perm.role] : "";

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
            Signed in as {ws.user.name || ws.user.email} · {roleLabel}
          </p>
        </div>
      </div>

      <div className="card list hide-desktop" style={{ marginBottom: 18 }}>
        {can.reports(data.perm) && (
          <a href="#/reports" className="list-item">
            <Icon.chart />
            <div className="list-main">
              <div className="t">Reports</div>
              <div className="s">Monthly crash cart audit reports and comparison</div>
            </div>
            <Icon.chevron />
          </a>
        )}
        <a href="#/expiry" className="list-item">
          <Icon.clock />
          <div className="list-main">
            <div className="t">Expiry</div>
            <div className="s">Every item, soonest expiry first</div>
          </div>
          <Icon.chevron />
        </a>
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
            <div className="s">{can.manageStaff(data.perm) ? "Create IDs and set their wards" : "People and roles"}</div>
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
            <h2>Hospital portal</h2>
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
          <PortalLook />
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
  const [preset, setPreset] = useState<ThemePreset>("teal");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const id = await api.createHospital(backend, { name, code, starterCarts: starter, theme: { preset } });
          await refreshWorkspace();
          onDone(id);
        } catch (err) {
          toast((err as Error).message, "error");
          setBusy(false);
        }
      }}
    >
      <p className="muted small" style={{ marginTop: -6 }}>
        Its wards, checks and staff are kept separate from other hospitals. Afterwards, set its logo below and create its Hospital admin IDs
        from Staff &amp; rights.
      </p>
      <Field label="Hospital name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Short code">
        <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} required />
      </Field>
      <Field label="Theme">
        <Swatches value={preset} onChange={setPreset} />
      </Field>
      <label className="row small" style={{ margin: "4px 0 14px" }}>
        <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} /> Add 3 starter wards (ICU, Emergency, General
        ward) with standard crash cart contents
      </label>
      <button className="btn primary block" disabled={busy}>
        {busy ? "Creating…" : "Create hospital"}
      </button>
    </form>
  );
}

function Swatches({ value, onChange }: { value: ThemePreset; onChange: (p: ThemePreset) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Theme">
      {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((k) => (
        <button type="button" key={k} role="radio" aria-checked={value === k} className={`swatch ${value === k ? "on" : ""}`} onClick={() => onChange(k)}>
          <i style={{ background: THEME_PRESETS[k].primary }} /> {THEME_PRESETS[k].label}
        </button>
      ))}
    </div>
  );
}

/** Super admin: each hospital portal's own theme, look and logo. */
function PortalLook() {
  const { data, backend, run, toast, refreshWorkspace } = useApp();
  const [theme, setTheme] = useState<HospitalTheme>({ preset: "teal", corners: "rounded", density: "comfortable", headings: "serif", ...data.hospital.theme });
  const [logo, setLogo] = useState(data.hospital.logo_url);
  const preset = theme.preset ?? "teal";
  const set = (patch: Partial<HospitalTheme>) => setTheme((t) => ({ ...t, ...patch }));

  return (
    <form
      className="card card-pad"
      style={{ marginTop: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const clean: HospitalTheme = { ...theme, primary: isHexColor(theme.primary) ? theme.primary : undefined };
        if (await run(() => api.updateHospital(backend, data.hospital.id, { theme: clean, logo_url: logo }), "Portal look saved")) await refreshWorkspace();
      }}
    >
      <h3 style={{ marginBottom: 12 }}>Look and logo</h3>
      <div className="row" style={{ gap: 14, marginBottom: 14, alignItems: "center" }}>
        {logo ? <img className="logo-preview" src={logo} alt={`${data.hospital.name} logo`} /> : <div className="logo-preview" />}
        <div className="row wrap">
          <label className="btn small">
            Upload logo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  setLogo(await logoDataUrl(f));
                } catch (err) {
                  toast((err as Error).message, "error");
                }
              }}
            />
          </label>
          {logo && (
            <button type="button" className="btn ghost small" onClick={() => setLogo("")}>
              Remove
            </button>
          )}
        </div>
      </div>
      <Field label="Theme">
        <Swatches value={preset} onChange={(p) => set({ preset: p, primary: undefined })} />
      </Field>
      <Field label="Brand colour" hint="Optional: your hospital's own colour instead of the theme's.">
        <div className="row">
          <input
            type="color"
            aria-label="Brand colour"
            value={isHexColor(theme.primary) ? theme.primary : THEME_PRESETS[preset].primary}
            onChange={(e) => set({ primary: e.target.value })}
          />
          {theme.primary && (
            <button type="button" className="btn ghost small" onClick={() => set({ primary: undefined })}>
              Use theme colour
            </button>
          )}
        </div>
      </Field>
      <div className="grid cols-2">
        <Field label="Corners">
          <select className="input" value={theme.corners} onChange={(e) => set({ corners: e.target.value as HospitalTheme["corners"] })}>
            <option value="rounded">Rounded</option>
            <option value="soft">Soft</option>
            <option value="square">Square</option>
          </select>
        </Field>
        <Field label="Spacing">
          <select className="input" value={theme.density} onChange={(e) => set({ density: e.target.value as HospitalTheme["density"] })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </Field>
      </div>
      <Field label="Headings">
        <select className="input" value={theme.headings} onChange={(e) => set({ headings: e.target.value as HospitalTheme["headings"] })}>
          <option value="serif">Classic (serif)</option>
          <option value="sans">Modern (sans-serif)</option>
        </select>
      </Field>
      <button className="btn primary">Save look</button>
    </form>
  );
}
