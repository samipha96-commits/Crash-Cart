import { useState } from "react";
import { backend } from "../lib/backend";
import { DEMO_PASSWORD, DEMO_SUPER, DEMO_USERS } from "../lib/api";
import { ROLE_HELP, ROLE_LABEL } from "../lib/catalog";
import { BrandMark } from "../components/icons";
import { Field } from "../components/ui";

export function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") await backend.signIn(email, password);
      else {
        if (!name.trim()) throw new Error("Enter your name.");
        const res = await backend.signUp(email, password, name);
        if (res.needsConfirmation)
          setMsg({ text: "Check your email to confirm your account, then sign in.", error: false });
      }
    } catch (err) {
      setMsg({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  async function demo(emailAddr: string) {
    setBusy(true);
    try {
      await backend.signIn(emailAddr, DEMO_PASSWORD);
    } catch (err) {
      setMsg({ text: (err as Error).message, error: true });
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 6, fontSize: "1.5rem" }}>
          <BrandMark /> Crash Cart
        </div>
        <p className="muted" style={{ textAlign: "center", marginTop: 0 }}>
          Crash cart checks, stock and expiry dates for every hospital you work with.
        </p>

        {backend.mode === "demo" && (
          <div className="card card-pad" style={{ marginBottom: 14 }}>
            <h3>Try the demo</h3>
            <p className="small muted" style={{ margin: "4px 0 10px" }}>
              Sign in as one of the sample staff to see what each role can do. Data stays on this device.
            </p>
            <div className="list">
              <button className="list-item" disabled={busy} onClick={() => void demo(DEMO_SUPER.email)}>
                <div className="list-main">
                  <div className="t">{DEMO_SUPER.name}</div>
                  <div className="s">Creates hospitals and gives every person their rights</div>
                </div>
              </button>
              {DEMO_USERS.map((u) => (
                <button key={u.email} className="list-item" disabled={busy} onClick={() => void demo(u.email)}>
                  <div className="list-main">
                    <div className="t">
                      {u.name} · {ROLE_LABEL[u.role]}
                    </div>
                    <div className="s">{ROLE_HELP[u.role]}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <form className="card card-pad" onSubmit={submit}>
          <h3 style={{ marginBottom: 12 }}>{mode === "in" ? "Sign in" : "Create your account"}</h3>
          {mode === "up" && (
            <Field label="Your name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </Field>
          {msg && (
            <p className="small" style={{ color: msg.error ? "var(--danger)" : "var(--ok)" }}>
              {msg.text}
            </p>
          )}
          <button className="btn primary block" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
          <p className="small muted" style={{ textAlign: "center", marginBottom: 0 }}>
            {mode === "in" ? "New here? " : "Already have an account? "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setMode(mode === "in" ? "up" : "in");
                setMsg(null);
              }}
            >
              {mode === "in" ? "Create an account" : "Sign in"}
            </a>
          </p>
          {mode === "up" && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              If the Super admin added your email to a hospital, you will get access automatically.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
