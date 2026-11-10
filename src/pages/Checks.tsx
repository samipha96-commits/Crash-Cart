import { useState } from "react";
import { useApp } from "../lib/app-context";
import { CHECK_TYPE_LABEL, can } from "../lib/catalog";
import { formatDateTime } from "../lib/dates";
import type { CheckStatus } from "../lib/types";
import { Icon } from "../components/icons";
import { StartCheckSheet } from "../components/StartCheck";
import { Empty, StatusBadge } from "../components/ui";

const FILTERS: { key: CheckStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "In progress" },
  { key: "submitted", label: "Awaiting review" },
  { key: "closed", label: "Closed" },
];

export function ChecksPage() {
  const { data } = useApp();
  const [filter, setFilter] = useState<CheckStatus | "all">("all");
  const [cartFilter, setCartFilter] = useState("");
  const [starting, setStarting] = useState(false);
  const carts = new Map(data.carts.map((c) => [c.id, c]));
  const issues = new Map<string, number>();
  for (const l of data.openLines) if (l.line_status !== "present") issues.set(l.check_id, (issues.get(l.check_id) ?? 0) + 1);
  const list = data.checks.filter((c) => (filter === "all" || c.status === filter) && (!cartFilter || c.cart_id === cartFilter));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Checks</h1>
          <p>Daily seal checks, monthly and quarterly audits, and restocks after a code.</p>
        </div>
        {can.runChecks(data.role) && data.carts.length > 0 && (
          <button className="btn primary" onClick={() => setStarting(true)}>
            <Icon.plus /> Start a check
          </button>
        )}
      </div>

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="seg">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "on neutral" : ""} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <select className="select-hospital" value={cartFilter} onChange={(e) => setCartFilter(e.target.value)} aria-label="Filter by cart">
          <option value="">All carts</option>
          {data.carts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card list">
        {list.length === 0 && <Empty>No checks here.</Empty>}
        {list.map((c) => (
          <a key={c.id} href={`#/checks/${c.id}`} className="list-item">
            <div className="list-main">
              <div className="t">{carts.get(c.cart_id)?.name ?? "Cart"}</div>
              <div className="s">
                {CHECK_TYPE_LABEL[c.check_type]} · {c.performed_by_name} · {formatDateTime(c.created_at)}
              </div>
            </div>
            {(issues.get(c.id) ?? 0) > 0 && <span className="badge danger hide-mobile">{issues.get(c.id)} issues</span>}
            <StatusBadge status={c.status} />
          </a>
        ))}
      </div>
      {starting && <StartCheckSheet onClose={() => setStarting(false)} />}
    </div>
  );
}
