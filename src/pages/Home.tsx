import { useState } from "react";
import { useApp } from "../lib/app-context";
import { cartSummaries } from "../lib/api";
import { can } from "../lib/catalog";
import { formatDateTime } from "../lib/dates";
import { Icon } from "../components/icons";
import { StartCheckSheet } from "../components/StartCheck";
import { Empty, StatusBadge, TypeLabel } from "../components/ui";

export function HomePage() {
  const { ws, data } = useApp();
  const [starting, setStarting] = useState(false);
  const summaries = cartSummaries(data);
  const due = summaries.filter((s) => s.dailyDue);
  const review = data.checks.filter((c) => c.status === "submitted");
  const expired = summaries.reduce((n, s) => n + s.expired, 0);
  const soon = summaries.reduce((n, s) => n + s.soon, 0);
  const attention = summaries
    .filter((s) => s.dailyDue || s.expired || s.openIssues || s.soon)
    .sort((a, b) => b.expired + b.openIssues - (a.expired + a.openIssues));
  const carts = new Map(data.carts.map((c) => [c.id, c]));
  const first = (ws.user.name || "").split(" ")[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {hello}
            {first ? `, ${first}` : ""}
          </h1>
          <p>
            {data.hospital.name} · {data.carts.length} cart{data.carts.length === 1 ? "" : "s"}
          </p>
        </div>
        {can.runChecks(data.role) && data.carts.length > 0 && (
          <button className="btn primary" onClick={() => setStarting(true)}>
            <Icon.plus /> Start a check
          </button>
        )}
      </div>

      <div className="stats">
        <a href="#/carts" className={`stat ${due.length ? "warn" : ""}`}>
          <div className="n">{due.length}</div>
          <div className="l">Carts due a daily check</div>
        </a>
        <a href="#/checks" className={`stat ${review.length ? "warn" : ""}`}>
          <div className="n">{review.length}</div>
          <div className="l">Checks awaiting review</div>
        </a>
        <a href="#/expiry" className={`stat ${expired ? "danger" : ""}`}>
          <div className="n">{expired}</div>
          <div className="l">Expired items in carts</div>
        </a>
        <a href="#/expiry" className={`stat ${soon ? "warn" : ""}`}>
          <div className="n">{soon}</div>
          <div className="l">Expiring within {data.hospital.near_expiry_days} days</div>
        </a>
      </div>

      <div className="grid cols-2 section" style={{ alignItems: "start" }}>
        <div>
          <div className="section-title">
            <h2>Needs attention</h2>
          </div>
          <div className="card list">
            {attention.length === 0 && <Empty>All carts are checked and in date.</Empty>}
            {attention.map((s) => (
              <a key={s.cart.id} href={`#/carts/${s.cart.id}`} className="list-item">
                <div className="list-main">
                  <div className="t">{s.cart.name}</div>
                  <div className="s">{s.cart.location}</div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    {s.dailyDue && <span className="badge warn">Check due</span>}
                    {s.expired > 0 && <span className="badge danger">{s.expired} expired</span>}
                    {s.soon > 0 && <span className="badge warn">{s.soon} expiring</span>}
                    {s.openIssues > 0 && <span className="badge danger">{s.openIssues} open issue{s.openIssues > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <Icon.chevron />
              </a>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title">
            <h2>Recent checks</h2>
            <a href="#/checks" className="small">
              See all
            </a>
          </div>
          <div className="card list">
            {data.checks.length === 0 && <Empty>No checks yet.</Empty>}
            {data.checks.slice(0, 6).map((c) => (
              <a key={c.id} href={`#/checks/${c.id}`} className="list-item">
                <div className="list-main">
                  <div className="t">{carts.get(c.cart_id)?.name ?? "Cart"}</div>
                  <div className="s">
                    <TypeLabel type={c.check_type} /> · {c.performed_by_name} · {formatDateTime(c.created_at)}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </a>
            ))}
          </div>
        </div>
      </div>
      {starting && <StartCheckSheet onClose={() => setStarting(false)} />}
    </div>
  );
}
