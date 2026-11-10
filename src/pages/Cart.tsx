import { useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { KIND_LABEL, can } from "../lib/catalog";
import { formatDate, formatDateTime } from "../lib/dates";
import { navigate } from "../lib/router";
import type { Drawer, ItemKind } from "../lib/types";
import { Icon } from "../components/icons";
import { StartCheckSheet } from "../components/StartCheck";
import { BackLink, Empty, ExpiryBadge, Field, Sheet, StatusBadge, TypeLabel } from "../components/ui";
import { CartFormSheet } from "./Carts";

export function CartPage({ id }: { id: string }) {
  const { backend, data, run } = useApp();
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState<Drawer | null>(null);
  const [editRow, setEditRow] = useState<api.StockRow | null>(null);
  const [renaming, setRenaming] = useState<Drawer | null>(null);

  const cart = data.carts.find((c) => c.id === id);
  if (!cart)
    return (
      <div className="page">
        <BackLink href="#/carts">Carts</BackLink>
        <div className="card">
          <Empty>This cart no longer exists.</Empty>
        </div>
      </div>
    );

  const rows = api.stockRows(data).filter((r) => r.cart.id === id);
  const drawers = data.drawers.filter((d) => d.cart_id === id).sort((a, b) => a.sort_order - b.sort_order);
  const checks = data.checks.filter((c) => c.cart_id === id);
  const summary = api.cartSummaries(data).find((s) => s.cart.id === id)!;
  const restock = can.restock(data.role);
  const manage = can.manageCarts(data.role);

  async function remove() {
    if (!confirm(`Delete ${cart!.name}? Its contents and check history will be removed.`)) return;
    if (await run(() => api.deleteCart(backend, id), "Cart deleted")) navigate("/carts");
  }

  return (
    <div className="page">
      <BackLink href="#/carts">Carts</BackLink>
      <div className="page-head">
        <div>
          <h1>{cart.name}</h1>
          <p>
            {cart.location} · {cart.cart_type}
            {cart.seal_number ? ` · Seal ${cart.seal_number}` : ""}
          </p>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {summary.dailyDue ? <span className="badge warn">Check due</span> : <span className="badge ok">Checked in last 24 h</span>}
            {summary.expired > 0 && <span className="badge danger">{summary.expired} expired</span>}
            {summary.soon > 0 && <span className="badge warn">{summary.soon} expiring soon</span>}
          </div>
        </div>
        <div className="row wrap">
          {manage && (
            <button className="btn small" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {can.runChecks(data.role) && (
            <button className="btn primary" onClick={() => setStarting(true)}>
              {summary.openCheck ? "Continue check" : "Start check"}
            </button>
          )}
        </div>
      </div>

      {drawers.map((d) => {
        const mine = rows.filter((r) => r.drawer.id === d.id);
        return (
          <div className="floor" key={d.id}>
            <div className="floor-title">
              <h3>{d.name}</h3>
              <div className="row" style={{ gap: 4 }}>
                {manage && (
                  <button className="btn ghost small" onClick={() => setRenaming(d)}>
                    Rename
                  </button>
                )}
                {restock && (
                  <button className="btn small" onClick={() => setAdding(d)}>
                    <Icon.plus /> Item
                  </button>
                )}
              </div>
            </div>
            <div className="card list">
              {mine.length === 0 && <Empty>Nothing on this floor yet.</Empty>}
              {mine.map((r) => {
                const body = (
                  <>
                    <div className="list-main">
                      <div className="t">
                        {r.item.name} {r.item.strength && <span className="muted small">{r.item.strength}</span>}
                      </div>
                      <div className="s">
                        Par {r.cartItem.par_qty} · {KIND_LABEL[r.item.kind]}
                        {r.cartItem.lot_number ? ` · Lot ${r.cartItem.lot_number}` : ""}
                        {r.cartItem.expiry_date ? ` · Exp ${formatDate(r.cartItem.expiry_date)}` : ""}
                      </div>
                    </div>
                    <ExpiryBadge date={r.cartItem.expiry_date} windowDays={data.hospital.near_expiry_days} />
                  </>
                );
                return restock ? (
                  <button key={r.cartItem.id} className="list-item" onClick={() => setEditRow(r)}>
                    {body}
                  </button>
                ) : (
                  <div key={r.cartItem.id} className="list-item">
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {manage && (
        <button
          className="btn ghost small"
          style={{ marginTop: 10 }}
          onClick={() =>
            void run(() => api.addDrawer(backend, data.hospital.id, id, drawers.length, `Floor ${drawers.length + 1}`), "Floor added")
          }
        >
          <Icon.plus /> Add a floor
        </button>
      )}

      <div className="section">
        <div className="section-title">
          <h2>Check history</h2>
        </div>
        <div className="card list">
          {checks.length === 0 && <Empty>This cart has not been checked yet.</Empty>}
          {checks.slice(0, 15).map((c) => (
            <a key={c.id} href={`#/checks/${c.id}`} className="list-item">
              <div className="list-main">
                <div className="t">
                  <TypeLabel type={c.check_type} />
                </div>
                <div className="s">
                  {c.performed_by_name} · {formatDateTime(c.created_at)}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </a>
          ))}
        </div>
      </div>

      {manage && (
        <div className="section">
          <button className="btn danger small" onClick={() => void remove()}>
            Delete this cart
          </button>
        </div>
      )}

      {editing && (
        <CartFormSheet
          initial={{ name: cart.name, location: cart.location, cart_type: cart.cart_type, seal_number: cart.seal_number }}
          onClose={() => setEditing(false)}
          onSave={(v) => run(() => api.updateCart(backend, id, v), "Cart updated")}
        />
      )}
      {starting && <StartCheckSheet cartId={id} onClose={() => setStarting(false)} />}
      {adding && <AddItemSheet cartId={id} drawer={adding} onClose={() => setAdding(null)} />}
      {editRow && <EditStockSheet row={editRow} drawers={drawers} onClose={() => setEditRow(null)} />}
      {renaming && <RenameFloorSheet drawer={renaming} onClose={() => setRenaming(null)} />}
    </div>
  );
}

function AddItemSheet({ cartId, drawer, onClose }: { cartId: string; drawer: Drawer; onClose: () => void }) {
  const { backend, data, run } = useApp();
  const active = data.items.filter((i) => i.is_active);
  const [itemId, setItemId] = useState(active[0]?.id ?? "__new");
  const [newItem, setNewItem] = useState({ name: "", kind: "medicine" as ItemKind, strength: "", category: "" });
  const [qty, setQty] = useState(1);
  const [lot, setLot] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(
      () =>
        api.addCartItem(backend, data.hospital.id, {
          cartId,
          drawerId: drawer.id,
          itemId: itemId === "__new" ? undefined : itemId,
          newItem: itemId === "__new" ? newItem : undefined,
          parQty: qty,
          lot,
          expiry: expiry || null,
        }),
      "Item added",
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet title={`Add to ${drawer.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Item">
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {active.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.strength ? ` (${i.strength})` : ""}
              </option>
            ))}
            <option value="__new">+ New item not in the list…</option>
          </select>
        </Field>
        {itemId === "__new" && (
          <div className="card card-pad" style={{ marginBottom: 12, background: "var(--surface-2)" }}>
            <Field label="Item name">
              <input className="input" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required />
            </Field>
            <div className="grid cols-2">
              <Field label="Type">
                <select className="input" value={newItem.kind} onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as ItemKind })}>
                  <option value="medicine">Medicine</option>
                  <option value="surgical">Surgical</option>
                  <option value="misc">Other</option>
                </select>
              </Field>
              <Field label="Strength / size">
                <input className="input" value={newItem.strength} onChange={(e) => setNewItem({ ...newItem, strength: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
        <div className="grid cols-2">
          <Field label="Par quantity">
            <input className="input" type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
          <Field label="Expiry date">
            <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        <Field label="Lot / batch number">
          <input className="input" value={lot} onChange={(e) => setLot(e.target.value)} />
        </Field>
        <button className="btn primary block" disabled={busy}>
          {busy ? "Adding…" : "Add item"}
        </button>
      </form>
    </Sheet>
  );
}

function EditStockSheet({ row, drawers, onClose }: { row: api.StockRow; drawers: Drawer[]; onClose: () => void }) {
  const { backend, run } = useApp();
  const [qty, setQty] = useState(row.cartItem.par_qty);
  const [lot, setLot] = useState(row.cartItem.lot_number);
  const [expiry, setExpiry] = useState(row.cartItem.expiry_date ?? "");
  const [drawerId, setDrawerId] = useState(row.cartItem.drawer_id);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(
      () => api.updateCartItem(backend, row.cartItem.id, { par_qty: qty, lot_number: lot, expiry_date: expiry || null, drawer_id: drawerId }),
      "Saved",
    );
    setBusy(false);
    if (ok) onClose();
  }

  async function remove() {
    if (!confirm(`Remove ${row.item.name} from this cart?`)) return;
    if (await run(() => api.removeCartItem(backend, row.cartItem.id), "Removed")) onClose();
  }

  return (
    <Sheet title={row.item.name} onClose={onClose}>
      <form onSubmit={save}>
        <p className="muted small" style={{ marginTop: -6 }}>
          Restock: update the expiry date and lot when you replace this item.
        </p>
        <div className="grid cols-2">
          <Field label="Par quantity">
            <input className="input" type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
          <Field label="Expiry date">
            <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
        <Field label="Lot / batch number">
          <input className="input" value={lot} onChange={(e) => setLot(e.target.value)} />
        </Field>
        <Field label="Floor">
          <select className="input" value={drawerId} onChange={(e) => setDrawerId(e.target.value)}>
            {drawers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <button type="button" className="btn danger" onClick={() => void remove()}>
            Remove
          </button>
          <div className="spacer" />
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function RenameFloorSheet({ drawer, onClose }: { drawer: Drawer; onClose: () => void }) {
  const { backend, run } = useApp();
  const [name, setName] = useState(drawer.name);
  return (
    <Sheet title="Rename floor" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.renameDrawer(backend, drawer.id, name), "Renamed")) onClose();
        }}
      >
        <Field label="Floor name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <button className="btn primary block">Save</button>
      </form>
    </Sheet>
  );
}
