import { useState } from "react";
import { backend } from "../lib/backend";
import { createHospital } from "../lib/api";
import type { User } from "../lib/types";
import { BrandMark } from "../components/icons";
import { Field } from "../components/ui";

export function Onboarding({ user, onCreated, onError }: { user: User; onCreated: (id: string) => Promise<void>; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [starter, setStarter] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createHospital(backend, { name, code, starterCarts: starter });
      await onCreated(id);
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 14, fontSize: "1.4rem" }}>
          <BrandMark /> Crash Cart
        </div>
        <form className="card card-pad" onSubmit={submit}>
          <h2>Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h2>
          <p className="muted small">
            You're not part of a hospital yet. If your admin invited <strong>{user.email}</strong>, ask them to check the
            invite went to this address. Or set up your hospital now; you'll be its admin.
          </p>
          <Field label="Hospital name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City General Hospital" required />
          </Field>
          <Field label="Short code" hint="Shown on reports, e.g. CGH">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={10} required />
          </Field>
          <label className="row small" style={{ margin: "4px 0 14px" }}>
            <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} />
            Add 3 starter carts (ICU, Emergency, Ward) with standard adult contents
          </label>
          <button className="btn primary block" disabled={busy}>
            {busy ? "Setting up…" : "Create hospital"}
          </button>
          <button type="button" className="btn ghost block" style={{ marginTop: 6 }} onClick={() => void backend.signOut()}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
