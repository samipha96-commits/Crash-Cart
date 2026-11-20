import { useState } from "react";
import { useApp } from "../lib/app-context";
import { startCheck } from "../lib/api";
import { CHECK_TYPE_LABEL, audienceOf, can } from "../lib/catalog";
import { navigate } from "../lib/router";
import type { CheckType } from "../lib/types";
import { Field, Sheet } from "./ui";

export function StartCheckSheet({ cartId, onClose }: { cartId?: string; onClose: () => void }) {
  const { backend, data, ws, toast, reload } = useApp();
  const carts = data.carts.filter((c) => can.runChecks(data.perm, c.id));
  const [cart, setCart] = useState(cartId ?? carts[0]?.id ?? "");
  // Pharmacists do the monthly audit; nurses usually the daily check.
  const [type, setType] = useState<CheckType>(data.perm.role === "pharmacy" ? "monthly" : "daily");
  const [busy, setBusy] = useState(false);
  const open = data.checks.find((c) => c.cart_id === cart && c.status === "draft" && c.audience === audienceOf(data.perm.role));

  async function go() {
    if (open) {
      onClose();
      navigate(`/checks/${open.id}`);
      return;
    }
    setBusy(true);
    try {
      const id = await startCheck(backend, data, ws.user, cart, type);
      await reload();
      onClose();
      navigate(`/checks/${id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <Sheet title={data.perm.role === "pharmacy" ? "Start an audit" : "Start a check"} onClose={onClose}>
      <Field label="Ward">
        <select className="input" value={cart} onChange={(e) => setCart(e.target.value)}>
          {carts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.location}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type of check">
        <div className="seg">
          {(Object.keys(CHECK_TYPE_LABEL) as CheckType[]).map((t) => (
            <button type="button" key={t} className={type === t ? "on neutral" : ""} onClick={() => setType(t)}>
              {CHECK_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </Field>
      {open && (
        <p className="small" style={{ color: "var(--warn)" }}>
          This cart already has a check in progress (started by {open.performed_by_name}). You'll continue that one.
        </p>
      )}
      <button className="btn primary block" disabled={busy || !cart} onClick={() => void go()}>
        {open ? "Continue check" : busy ? "Starting…" : "Start check"}
      </button>
    </Sheet>
  );
}
