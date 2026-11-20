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
  { key: "submitted", label: "Submitted" },
  { key: "in_review", label: "With manager" },
  { key: "closed", label: "Closed" },
];

export function ChecksPage() {
  const { data } = useApp();
  const pharmacy = data.perm.role === "pharmacy" || data.perm.role === "pharmacy_manager";
  const [filter, setFilter] = useState<CheckStatus | "all">("all");
  const [cartFilter, setCartFilter] = useState("");
  const [starting, setStarting] = useState(false);
  const carts = new Map(data.carts.map((c) => [c.id, c]));
  const issues = new Map<string, number>(data.checks.map((c) => [c.id, c.issue_count ?? 0]));
  // Lines of open checks give a live count for checks still being filled in.
  for (const c of data.checks.filter((x) => x.status === "draft")) issues.set(c.id, 0);
  for (const l of data.openLines) if (l.line_status !== "present" && data.checks.find((c) => c.id === l.check_id)?.status === "draft") issues.set(l.check_id, (issues.get(l.check_id) ?? 0) + 1);
  const nursing = data.perm.role === "nurse" || data.perm.role === "nursing_manager";
  const list = data.checks.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (!cartFilter || c.cart_id === cartFilter) &&
      // Nurses see what the pharmacy has submitted, not checks still being filled in.
      !(c.status === "draft" && (data.perm.role === "nurse" || data.perm.role === "nursing_manager")),
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Checks</h1>
          <p>
            {pharmacy
              ? "Pharmacists' checks of the crash carts. Pharmacists close each observation, then the pharmacy manager reviews."
              : nursing
                ? "The pharmacy's checks of your ward's crash cart: when it was checked, the issues found, and whether they are closed."
                : "The pharmacy's checks of every ward's crash cart."}
          </p>
        </div>
        {can.runChecks(data.perm) && data.carts.length > 0 && (
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
          <option value="">All wards</option>
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
            {c.status !== "draft" &&
              ((issues.get(c.id) ?? 0) > 0 ? (
                <span className="badge danger">
                  {issues.get(c.id)} issue{issues.get(c.id) === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="badge ok">No issues</span>
              ))}
            {nursing && c.status !== "draft" ? (
              <span className={`badge ${c.status === "closed" ? "ok" : "warn"}`}>{c.status === "closed" ? "Closed" : "Not closed yet"}</span>
            ) : (
              <StatusBadge status={c.status} />
            )}
          </a>
        ))}
      </div>
      {starting && <StartCheckSheet onClose={() => setStarting(false)} />}
    </div>
  );
}
