import { useEffect, useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { ROLE_LABEL, can } from "../lib/catalog";
import { demoBackend } from "../lib/backend";
import { Icon } from "../components/icons";
import { Field, Sheet } from "../components/ui";
import { DESIGNS, THEME_PRESETS, isHexColor, logoDataUrl, resolveTheme } from "../lib/theme";
import type { DesignStyle, HospitalTheme, ThemePreset } from "../lib/types";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

export function MorePage() {
  const { data, ws, backend, run, switchHospital, toast } = useApp();
  const [settings, setSettings] = useState({
    name: data.hospital.name,
    code: data.hospital.code,
    days: data.hospital.near_expiry_days,
    address: data.hospital.address ?? "",
    phone: data.hospital.phone ?? "",
    email: data.hospital.email ?? "",
  });
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
        {can.manageStaff(data.perm) && (
        <a href="#/team" className="list-item">
          <Icon.users />
          <div className="list-main">
            <div className="t">Staff</div>
            <div className="s">{can.manageStaff(data.perm) ? "Create IDs and set their wards" : "People and roles"}</div>
          </div>
          <Icon.chevron />
        </a>
        )}
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
                () =>
                  api.updateHospital(backend, data.hospital.id, {
                    name: settings.name.trim(),
                    code: settings.code.trim().toUpperCase(),
                    near_expiry_days: Math.min(365, Math.max(1, settings.days)),
                    ...api.cleanDetails(settings),
                  }),
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
            <Field label="Address" hint="Shown with the logo at the top of every report.">
              <input className="input" value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} placeholder="Street, city" />
            </Field>
            <div className="grid cols-2">
              <Field label="Phone">
                <input className="input" type="tel" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} placeholder="pharmacy@hospital.org" />
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
  const [design, setDesign] = useState<DesignStyle>("classic");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const id = await api.createHospital(backend, { name, code, starterCarts: starter, theme: { design, preset } });
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
      <Field label="Design">
        <select className="input" value={design} onChange={(e) => setDesign(e.target.value as DesignStyle)}>
          {(Object.keys(DESIGNS) as DesignStyle[]).map((k) => (
            <option key={k} value={k}>
              {DESIGNS[k].label}: {DESIGNS[k].about}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Colours">
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

/** A small picture of a design: where the menu sits, its colour, card style and corners. */
function MiniPreview({ design, color }: { design: DesignStyle; color: string }) {
  const d = DESIGNS[design];
  const navBg = d.nav === "brand" ? color : d.nav === "dark" ? "#1f2933" : "#ecebe7";
  const radius = { round: 10, rounded: 6, soft: 4, square: 0 }[d.corners];
  const tile = {
    borderRadius: radius,
    boxShadow: d.cards === "elevated" ? "0 2px 5px rgba(0,0,0,.14)" : "none",
    border: d.cards === "outlined" ? "1.5px solid #c9c7c2" : "0",
    background: d.cards === "flat" ? "#eef3ef" : "#fff",
  };
  return (
    <div className={`mini ${d.layout === "topnav" ? "top" : ""}`} aria-hidden="true">
      <div className="nav" style={{ background: navBg }} />
      <div className="body">
        <div className="tile" style={{ ...tile, gridColumn: "1 / 3", height: 12, background: color, opacity: 0.85 }} />
        <div className="tile" style={tile} />
        <div className="tile" style={tile} />
      </div>
    </div>
  );
}

/** Super admin: each hospital portal's own UI design, colours and logo. */
function PortalLook() {
  const { data, backend, run, toast, refreshWorkspace } = useApp();
  const [theme, setTheme] = useState<HospitalTheme>({ ...data.hospital.theme });
  const [logo, setLogo] = useState(data.hospital.logo_url);
  const r = resolveTheme(theme);
  const color = isHexColor(theme.primary) ? theme.primary : THEME_PRESETS[r.preset].primary;
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
      <h3 style={{ marginBottom: 4 }}>Portal design</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Each hospital gets its own design: menu position and colour, card style, typeface, shapes and spacing, plus its colours and
        logo. Everyone signed in to {data.hospital.name} sees it.
      </p>
      <div className="designs" role="radiogroup" aria-label="Design" style={{ marginBottom: 16 }}>
        {(Object.keys(DESIGNS) as DesignStyle[]).map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={r.design === k}
            className={`design-card ${r.design === k ? "on" : ""}`}
            // Picking a design resets the single overrides so the whole design applies.
            onClick={() => setTheme((t) => ({ design: k, preset: t.preset ?? DESIGNS[k].preset, primary: t.primary }))}
          >
            <MiniPreview design={k} color={color} />
            <div className="t">{DESIGNS[k].label}</div>
            <div className="s">{DESIGNS[k].about}</div>
          </button>
        ))}
      </div>

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
      <Field label="Colours">
        <Swatches value={r.preset} onChange={(p) => set({ preset: p, primary: undefined })} />
      </Field>
      <Field label="Brand colour" hint="Optional: your hospital's own colour instead of the palette's.">
        <div className="row">
          <input type="color" aria-label="Brand colour" value={color} onChange={(e) => set({ primary: e.target.value })} />
          {theme.primary && (
            <button type="button" className="btn ghost small" onClick={() => set({ primary: undefined })}>
              Use palette colour
            </button>
          )}
        </div>
      </Field>

      <details style={{ margin: "4px 0 14px" }}>
        <summary className="strong" style={{ cursor: "pointer" }}>
          Fine-tune the design
        </summary>
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          <Field label="Menu position">
            <select className="input" value={r.layout} onChange={(e) => set({ layout: e.target.value as HospitalTheme["layout"] })}>
              <option value="sidebar">Side menu</option>
              <option value="topnav">Across the top</option>
            </select>
          </Field>
          <Field label="Menu colour">
            <select className="input" value={r.nav} onChange={(e) => set({ nav: e.target.value as HospitalTheme["nav"] })}>
              <option value="light">Light</option>
              <option value="brand">Brand colour</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Cards">
            <select className="input" value={r.cards} onChange={(e) => set({ cards: e.target.value as HospitalTheme["cards"] })}>
              <option value="elevated">Raised (shadow)</option>
              <option value="outlined">Outlined</option>
              <option value="flat">Flat tiles</option>
            </select>
          </Field>
          <Field label="Typeface">
            <select className="input" value={r.font} onChange={(e) => set({ font: e.target.value as HospitalTheme["font"] })}>
              <option value="outfit">Outfit</option>
              <option value="inter">Inter</option>
              <option value="plex">IBM Plex Sans</option>
              <option value="nunito">Nunito</option>
            </select>
          </Field>
          <Field label="Headings">
            <select className="input" value={r.headings} onChange={(e) => set({ headings: e.target.value as HospitalTheme["headings"] })}>
              <option value="serif">Classic (serif)</option>
              <option value="sans">Same as typeface</option>
            </select>
          </Field>
          <Field label="Corners">
            <select className="input" value={r.corners} onChange={(e) => set({ corners: e.target.value as HospitalTheme["corners"] })}>
              <option value="round">Round, pill buttons</option>
              <option value="rounded">Rounded</option>
              <option value="soft">Soft</option>
              <option value="square">Square</option>
            </select>
          </Field>
          <Field label="Spacing">
            <select className="input" value={r.density} onChange={(e) => set({ density: e.target.value as HospitalTheme["density"] })}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </Field>
        </div>
      </details>
      <button className="btn primary">Save design</button>
    </form>
  );
}
