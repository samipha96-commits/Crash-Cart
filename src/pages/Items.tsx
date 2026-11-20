import { useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { DEFAULT_CATEGORIES, can } from "../lib/catalog";
import { downloadText } from "../lib/download";
import type { Item, ItemKind } from "../lib/types";
import { Icon } from "../components/icons";
import { Empty, Field, Sheet } from "../components/ui";

export const EMPTY_ITEM: api.ItemInput = { code: "", name: "", strength: "", generic: "", category: "", kind: "medicine" };

/** Each hospital keeps its own item list: Code, Description, Strength, Generic, Category. */
export function ItemsPage() {
  const { data, backend, run } = useApp();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const edit = can.setItems(data.perm);
  const usage = new Map<string, number>();
  for (const ci of data.cartItems) usage.set(ci.item_id, (usage.get(ci.item_id) ?? 0) + 1);
  const needle = q.trim().toLowerCase();
  const items = data.items
    .filter((i) => !cat || i.category === cat)
    .filter((i) => !needle || [i.code, i.name, i.generic, i.strength].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => a.category.localeCompare(b.category) || (a.code || "~").localeCompare(b.code || "~") || a.name.localeCompare(b.name));
  const categories = [...new Set(data.items.map((i) => i.category))].sort();

  function exportCsv() {
    downloadText(
      `${data.hospital.code}-item-list.csv`,
      api.toCsv(
        ["Code", "Description", "Strength", "Generic", "Category", "Active"],
        items.map((i) => [i.code, i.name, i.strength, i.generic, i.category, i.is_active ? "Yes" : "No"]),
      ),
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Item list</h1>
          <p>{data.hospital.name}'s own list of crash cart medicines and supplies.</p>
        </div>
        <div className="row wrap">
          <button className="btn small" onClick={exportCsv}>
            <Icon.download /> CSV
          </button>
          {edit && (
            <button className="btn primary" onClick={() => setEditing("new")}>
              <Icon.plus /> Add item
            </button>
          )}
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search code, description, generic" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select-hospital" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="card table-scroll">
        <table className="kv">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Strength</th>
              <th>Generic</th>
              <th>Category</th>
              <th className="num">In carts</th>
              {edit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ opacity: i.is_active ? 1 : 0.55 }}>
                <td className="strong">{i.code || <span className="muted">—</span>}</td>
                <td>
                  {i.name}
                  {!i.is_active && <span className="badge" style={{ marginLeft: 6 }}>Hidden</span>}
                </td>
                <td>{i.strength}</td>
                <td>{i.generic}</td>
                <td>{i.category}</td>
                <td className="num">{usage.get(i.id) ?? 0}</td>
                {edit && (
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn ghost small" onClick={() => setEditing(i)}>
                      Edit
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() => void run(() => api.setItemActive(backend, i.id, !i.is_active), i.is_active ? "Hidden from pick lists" : "Restored")}
                    >
                      {i.is_active ? "Hide" : "Restore"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <Empty>No items match.</Empty>}
      </div>
      {editing && <ItemSheet item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Category: the hospital's own (typed) or one of the defaults. */
export function ItemFields({ v, set }: { v: api.ItemInput; set: (v: api.ItemInput) => void }) {
  const { data } = useApp();
  const cats = [...new Set([...data.items.map((i) => i.category), ...DEFAULT_CATEGORIES])].filter(Boolean).sort();
  return (
    <>
      <div className="grid cols-2">
        <Field label="Code">
          <input className="input" value={v.code} onChange={(e) => set({ ...v, code: e.target.value })} placeholder="e.g. CC-M12" />
        </Field>
        <Field label="Strength">
          <input className="input" value={v.strength} onChange={(e) => set({ ...v, strength: e.target.value })} placeholder="e.g. 1 mg/1 mL" />
        </Field>
      </div>
      <Field label="Description">
        <input className="input" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} placeholder="e.g. Inj. Atropine" required />
      </Field>
      <Field label="Generic name">
        <input className="input" value={v.generic} onChange={(e) => set({ ...v, generic: e.target.value })} placeholder="e.g. Atropine sulfate" />
      </Field>
      <div className="grid cols-2">
        <Field label="Category" hint="Pick a default or type your hospital's own.">
          <input className="input" list="item-categories" value={v.category} onChange={(e) => set({ ...v, category: e.target.value })} />
          <datalist id="item-categories">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Type">
          <select className="input" value={v.kind} onChange={(e) => set({ ...v, kind: e.target.value as ItemKind })}>
            <option value="medicine">Medicine</option>
            <option value="surgical">Surgical / device</option>
            <option value="misc">Other</option>
          </select>
        </Field>
      </div>
    </>
  );
}

function ItemSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { data, backend, run } = useApp();
  const [v, setV] = useState<api.ItemInput>(
    item ? { code: item.code, name: item.name, strength: item.strength, generic: item.generic, category: item.category, kind: item.kind } : EMPTY_ITEM,
  );
  return (
    <Sheet title={item ? "Edit item" : "Add to item list"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () => (item ? api.updateItem(backend, item.id, v, data.items) : api.addItem(backend, data.hospital.id, v, data.items)),
            item ? "Item saved" : "Item added",
          );
          if (ok) onClose();
        }}
      >
        <ItemFields v={v} set={setV} />
        <button className="btn primary block">{item ? "Save" : "Add item"}</button>
      </form>
    </Sheet>
  );
}
