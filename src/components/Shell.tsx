import type { ReactNode } from "react";
import { useApp } from "../lib/app-context";
import { cartSummaries } from "../lib/api";
import { ROLE_LABEL } from "../lib/catalog";
import { usePath } from "../lib/router";
import { BrandMark, Icon } from "./icons";

export function Shell({ children }: { children: ReactNode }) {
  const { ws, data, switchHospital, backend } = useApp();
  const path = usePath();
  const summaries = cartSummaries(data);
  const due = summaries.filter((s) => s.dailyDue).length;
  const review = data.checks.filter((c) => c.status === "submitted").length;
  const expiring = summaries.reduce((n, s) => n + s.expired + s.soon, 0);

  const isOn = (p: string) => (p === "/" ? path === "/" : path.startsWith(p));
  const nav = [
    { href: "/", label: "Home", icon: <Icon.home />, count: 0 },
    { href: "/carts", label: "Carts", icon: <Icon.cart />, count: due },
    { href: "/checks", label: "Checks", icon: <Icon.check />, count: review },
    { href: "/expiry", label: "Expiry", icon: <Icon.clock />, count: expiring },
  ];
  const extra = [
    { href: "/items", label: "Item list", icon: <Icon.pill /> },
    { href: "/team", label: "Staff", icon: <Icon.users /> },
    { href: "/more", label: "Settings", icon: <Icon.settings /> },
  ];

  const picker =
    ws.hospitals.length > 1 ? (
      <select className="select-hospital" value={data.hospital.id} onChange={(e) => switchHospital(e.target.value)} aria-label="Hospital">
        {ws.hospitals.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    ) : (
      <span className="strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {data.hospital.name}
      </span>
    );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark /> Crash Cart
        </div>
        {nav.map((n) => (
          <a key={n.href} href={`#${n.href}`} className={`side-link ${isOn(n.href) ? "active" : ""}`}>
            {n.icon} {n.label}
            {n.count > 0 && <span className="count">{n.count}</span>}
          </a>
        ))}
        <div style={{ height: 14 }} />
        {extra.map((n) => (
          <a key={n.href} href={`#${n.href}`} className={`side-link ${isOn(n.href) ? "active" : ""}`}>
            {n.icon} {n.label}
          </a>
        ))}
        <div className="spacer" />
        <div className="small muted" style={{ padding: "0 8px" }}>
          <div className="strong" style={{ color: "var(--ink)" }}>
            {ws.user.name || ws.user.email}
          </div>
          <div>{ROLE_LABEL[data.role]}</div>
          <button className="btn ghost small" style={{ padding: 0, marginTop: 6 }} onClick={() => void backend.signOut()}>
            <Icon.logout /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        {backend.mode === "demo" && (
          <div className="banner no-print">Demo mode: sample data, saved on this device only.</div>
        )}
        <header className="topbar no-print">
          <div className="brand">
            <BrandMark />
          </div>
          <div style={{ minWidth: 0, flex: 1, display: "flex" }}>{picker}</div>
          <span className="badge primary">{ROLE_LABEL[data.role]}</span>
        </header>
        {children}
      </div>

      <nav className="tabbar no-print" aria-label="Main">
        {nav.map((n) => (
          <a key={n.href} href={`#${n.href}`} className={`tab ${isOn(n.href) ? "active" : ""}`}>
            {n.icon}
            {n.label}
            {n.count > 0 && <span className="dot">{n.count > 99 ? "99+" : n.count}</span>}
          </a>
        ))}
        <a href="#/more" className={`tab ${["/more", "/items", "/team"].some(isOn) ? "active" : ""}`}>
          <Icon.more />
          More
        </a>
      </nav>
    </div>
  );
}
