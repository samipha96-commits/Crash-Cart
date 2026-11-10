import { useState } from "react";
import { useApp } from "../lib/app-context";
import { cartSummaries, createCart } from "../lib/api";
import { CART_TYPES, can } from "../lib/catalog";
import { formatDateTime } from "../lib/dates";
import { navigate } from "../lib/router";
import { Icon } from "../components/icons";
import { Empty, Field, Sheet } from "../components/ui";

export function CartsPage() {
  const { data } = useApp();
  const [adding, setAdding] = useState(false);
  const summaries = cartSummaries(data);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Crash carts</h1>
          <p>Every cart in {data.hospital.name}, with its last check and expiry status.</p>
        </div>
        {can.manageCarts(data.role) && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon.plus /> Add cart
          </button>
        )}
      </div>

      {summaries.length === 0 && (
        <div className="card">
          <Empty>No carts yet.{can.manageCarts(data.role) ? " Add your first cart." : " Ask your hospital admin to add carts."}</Empty>
        </div>
      )}

      <div className="grid cols-2">
        {summaries.map((s) => (
          <a key={s.cart.id} href={`#/carts/${s.cart.id}`} className="card card-pad" style={{ color: "inherit", textDecoration: "none" }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div className="list-main">
                <h3>{s.cart.name}</h3>
                <div className="muted small">
                  {s.cart.location} · {s.cart.cart_type} · {s.lines} items
                </div>
              </div>
              {s.dailyDue ? <span className="badge warn">Check due</span> : <span className="badge ok">Checked</span>}
            </div>
            <div className="row wrap small" style={{ gap: 6, marginTop: 12 }}>
              {s.expired > 0 && <span className="badge danger">{s.expired} expired</span>}
              {s.soon > 0 && <span className="badge warn">{s.soon} expiring soon</span>}
              {s.missingExpiry > 0 && <span className="badge">{s.missingExpiry} medicines without expiry</span>}
              {s.openIssues > 0 && <span className="badge danger">{s.openIssues} open issues</span>}
              {s.openCheck && <span className="badge info">Check in progress</span>}
            </div>
            <div className="muted small" style={{ marginTop: 10 }}>
              Last check: {s.lastCheck ? `${formatDateTime(s.lastCheck.submitted_at ?? s.lastCheck.created_at)} by ${s.lastCheck.performed_by_name}` : "never"}
            </div>
          </a>
        ))}
      </div>
      {adding && <CartFormSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

export function CartFormSheet({
  onClose,
  initial,
  onSave,
}: {
  onClose: () => void;
  initial?: { name: string; location: string; cart_type: string; seal_number: string };
  onSave?: (v: { name: string; location: string; cart_type: string; seal_number: string }) => Promise<boolean>;
}) {
  const { backend, data, run } = useApp();
  const [v, setV] = useState(initial ?? { name: "", location: "", cart_type: "Ward", seal_number: "" });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let newId = "";
    const ok = onSave
      ? await onSave(v)
      : await run(async () => {
          newId = (await createCart(backend, data.hospital.id, v)).cartId;
        }, "Cart added with 4 empty floors");
    setBusy(false);
    if (ok) {
      onClose();
      if (newId) navigate(`/carts/${newId}`);
    }
  }

  return (
    <Sheet title={initial ? "Edit cart" : "Add a crash cart"} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Cart name">
          <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. ICU Crash Cart 2" required />
        </Field>
        <Field label="Location">
          <input className="input" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="e.g. ICU, bed 12" required />
        </Field>
        <Field label="Type">
          <select className="input" value={v.cart_type} onChange={(e) => setV({ ...v, cart_type: e.target.value })}>
            {CART_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Current seal / lock number" hint="Optional. Pre-filled on each check.">
          <input className="input" value={v.seal_number} onChange={(e) => setV({ ...v, seal_number: e.target.value })} />
        </Field>
        <button className="btn primary block" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save" : "Add cart"}
        </button>
      </form>
    </Sheet>
  );
}
