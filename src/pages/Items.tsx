import { useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { KIND_LABEL, can } from "../lib/catalog";
import type { ItemKind } from "../lib/types";
import { Icon } from "../components/icons";
import { Empty, Field, Sheet } from "../components/ui";

export function ItemsPage() {
  const { data, backend, run } = useApp();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const edit = can.restock(data.role);
  const usage = new Map<string, number>();
  for (const ci of data.cartItems) usage.set(ci.item_id, (usage.get(ci.item_id) ?? 0) + 1);
  const items = data.items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.category.toLowerCase().includes(q.toLowerCase()));
  const kinds: ItemKind[] = ["medicine", "surgical", "misc"];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Item list</h1>
          <p>The medicines and supplies {data.hospital.name} keeps in its carts.</p>
        </div>
        {edit && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon.plus /> Add item
          </button>
        )}
      </div>
      <input className="input" style={{ maxWidth: 320, marginBottom: 12 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      {kinds.map((k) => {
        const mine = items.filter((i) => i.kind === k);
        if (!mine.length) return null;
        return (
          <div key={k} className="floor">
            <div className="floor-title">
              <h3>{KIND_LABEL[k]}</h3>
              <span className="muted small">{mine.length}</span>
            </div>
            <div className="card list">
              {mine.map((i) => (
                <div key={i.id} className="list-item" style={{ opacity: i.is_active ? 1 : 0.55 }}>
                  <div className="list-main">
                    <div className="t">
                      {i.name} {i.strength && <span className="muted small">{i.strength}</span>}
                    </div>
                    <div className="s">
                      {i.category} · in {usage.get(i.id) ?? 0} cart slot{usage.get(i.id) === 1 ? "" : "s"}
                      {!i.is_active && " · hidden"}
                    </div>
                  </div>
                  {edit && (
                    <button
                      className="btn ghost small"
                      onClick={() => void run(() => api.setItemActive(backend, i.id, !i.is_active), i.is_active ? "Hidden from pick lists" : "Restored")}
                    >
                      {i.is_active ? "Hide" : "Restore"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="card">
          <Empty>No items match.</Empty>
        </div>
      )}
      {adding && <AddCatalogItem onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddCatalogItem({ onClose }: { onClose: () => void }) {
  const { data, backend, run } = useApp();
  const [v, setV] = useState({ name: "", kind: "medicine" as ItemKind, strength: "", category: "" });
  return (
    <Sheet title="Add to item list" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.addItem(backend, data.hospital.id, v), "Item added")) onClose();
        }}
      >
        <Field label="Name">
          <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        </Field>
        <div className="grid cols-2">
          <Field label="Type">
            <select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as ItemKind })}>
              <option value="medicine">Medicine</option>
              <option value="surgical">Surgical</option>
              <option value="misc">Other</option>
            </select>
          </Field>
          <Field label="Strength / size">
            <input className="input" value={v.strength} onChange={(e) => setV({ ...v, strength: e.target.value })} />
          </Field>
        </div>
        <Field label="Category" hint="e.g. ACLS, Airway, Paediatric">
          <input className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
        </Field>
        <button className="btn primary block">Add item</button>
      </form>
    </Sheet>
  );
}
