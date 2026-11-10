import { useState } from "react";
import { backend } from "../lib/backend";
import { createHospital } from "../lib/api";
import type { User } from "../lib/types";
import { BrandMark } from "../components/icons";
import { Field } from "../components/ui";

export function Onboarding({
  user,
  isSuper,
  onCreated,
  onError,
}: {
  user: User;
  isSuper: boolean;
  onCreated: (id: string) => Promise<void>;
  onError: (m: string) => void;
}) {
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
        {isSuper ? (
          <form className="card card-pad" onSubmit={submit}>
            <h2>Add your first hospital</h2>
            <p className="muted small">As Super admin you create hospitals and then give staff their access and roles.</p>
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
        ) : (
          <div className="card card-pad">
            <h2>Waiting for access</h2>
            <p className="muted">
              You're signed in as <strong>{user.email}</strong>, but you haven't been given access to a hospital yet. Ask your
              Super admin to add this email with your role. You'll get in as soon as they do; just sign in again.
            </p>
            <button className="btn primary block" onClick={() => window.location.reload()}>
              Check again
            </button>
            <button type="button" className="btn ghost block" style={{ marginTop: 6 }} onClick={() => void backend.signOut()}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
