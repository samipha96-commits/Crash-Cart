import { useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { can } from "../lib/catalog";
import { formatDate } from "../lib/dates";
import { downloadText } from "../lib/download";
import type { ExpiryState } from "../lib/dates";
import { Icon } from "../components/icons";
import { Empty, ExpiryBadge, Field, Sheet } from "../components/ui";

type Tab = "attention" | "expired" | "soon" | "none" | "all";

export function ExpiryPage() {
  const { data } = useApp();
  const [tab, setTab] = useState<Tab>("attention");
  const [cartId, setCartId] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<api.StockRow | null>(null);
  const all = api.stockRows(data).filter((r) => !cartId || r.cart.id === cartId);
  const count = (s: ExpiryState) => all.filter((r) => r.state === s).length;
  const filtered = all
    .filter((r) => {
      if (tab === "attention") return r.state === "expired" || r.state === "soon";
      if (tab === "expired") return r.state === "expired";
      if (tab === "soon") return r.state === "soon";
      if (tab === "none") return r.state === "none";
      return true;
    })
    .filter((r) => !q || r.item.name.toLowerCase().includes(q.toLowerCase()) || r.cartItem.lot_number.toLowerCase().includes(q.toLowerCase()));

  const tabs: { key: Tab; label: string }[] = [
    { key: "attention", label: `Needs action (${count("expired") + count("soon")})` },
    { key: "expired", label: `Expired (${count("expired")})` },
    { key: "soon", label: `≤ ${data.hospital.near_expiry_days} days (${count("soon")})` },
    { key: "none", label: `No date (${count("none")})` },
    { key: "all", label: "All" },
  ];

  function exportCsv() {
    const csv = api.toCsv(
      ["Cart", "Location", "Floor", "Item", "Strength", "Par qty", "Lot", "Expiry", "Status"],
      filtered.map((r) => [r.cart.name, r.cart.location, r.drawer.name, r.item.name, r.item.strength, r.cartItem.par_qty, r.cartItem.lot_number, r.cartItem.expiry_date ?? "", r.state]),
    );
    downloadText(`${data.hospital.code}-expiry-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Expiry tracker</h1>
          <p>Every item in every cart, soonest expiry first. Change the warning window in Settings.</p>
        </div>
        <button className="btn small" onClick={exportCsv}>
          <Icon.download /> Export CSV
        </button>
      </div>

      <div className="seg" style={{ marginBottom: 10 }}>
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? "on neutral" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search item or lot" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select-hospital" value={cartId} onChange={(e) => setCartId(e.target.value)} aria-label="Cart">
          <option value="">All carts</option>
          {data.carts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card list">
        {filtered.length === 0 && <Empty>{tab === "attention" ? "Nothing expired or expiring soon." : "No items here."}</Empty>}
        {filtered.map((r) => {
          const body = (
            <>
              <div className="list-main">
                <div className="t">
                  {r.item.name} {r.item.strength && <span className="muted small">{r.item.strength}</span>}
                </div>
                <div className="s">
                  {r.cart.name} · {r.drawer.name}
                  {r.cartItem.lot_number ? ` · Lot ${r.cartItem.lot_number}` : ""}
                  {r.cartItem.expiry_date ? ` · ${formatDate(r.cartItem.expiry_date)}` : ""}
                </div>
              </div>
              <ExpiryBadge date={r.cartItem.expiry_date} windowDays={data.hospital.near_expiry_days} />
            </>
          );
          return can.restock(data.role) ? (
            <button key={r.cartItem.id} className="list-item" onClick={() => setEditing(r)}>
              {body}
            </button>
          ) : (
            <div key={r.cartItem.id} className="list-item">
              {body}
            </div>
          );
        })}
      </div>
      {editing && <RestockSheet row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RestockSheet({ row, onClose }: { row: api.StockRow; onClose: () => void }) {
  const { backend, run } = useApp();
  const [expiry, setExpiry] = useState(row.cartItem.expiry_date ?? "");
  const [lot, setLot] = useState(row.cartItem.lot_number);
  return (
    <Sheet title={`Replace ${row.item.name}`} onClose={onClose}>
      <p className="muted small" style={{ marginTop: -6 }}>
        {row.cart.name} · {row.drawer.name}. Enter the new stock's details after replacing it.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.updateCartItem(backend, row.cartItem.id, { expiry_date: expiry || null, lot_number: lot }), "Restocked")) onClose();
        }}
      >
        <Field label="New expiry date">
          <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="New lot / batch number">
          <input className="input" value={lot} onChange={(e) => setLot(e.target.value)} />
        </Field>
        <button className="btn primary block">Save</button>
      </form>
    </Sheet>
  );
}
