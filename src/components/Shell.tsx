import type { ReactNode } from "react";
import { useApp } from "../lib/app-context";
import { cartSummaries } from "../lib/api";
import { ROLE_LABEL, can } from "../lib/catalog";
import { usePath } from "../lib/router";
import { BrandMark, Icon } from "./icons";

export function Shell({ children }: { children: ReactNode }) {
  const { ws, data, switchHospital, backend } = useApp();
  const path = usePath();
  const summaries = cartSummaries(data);
  const due = summaries.filter((s) => s.dailyDue).length;
  const p = data.perm;
  const review = data.checks.filter((c) => needsMe(c.status, c.audience)).length;
  const expiring = summaries.reduce((n, s) => n + s.expired + s.soon, 0);
  const roleLabel = p.isSuper ? "Super admin" : p.role ? ROLE_LABEL[p.role] : "";

  // What each role needs most sits in the tab bar; the rest goes under More.
  function needsMe(status: string, audience: "nursing" | "pharmacy") {
    if (can.review(p, audience) && (audience === "nursing" ? status === "submitted" : status === "in_review")) return true;
    return p.role === "pharmacy" && audience === "pharmacy" && status === "submitted";
  }
  // Nurses and the nursing manager see the pharmacy's checks of their wards (read-only).
  const seesChecks = p.isSuper || p.role !== "hospital_admin";
  const isOn = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const all = [
    { href: "/", label: "Home", icon: <Icon.home />, count: 0, show: true },
    { href: "/carts", label: "Wards", icon: <Icon.cart />, count: can.runChecks(p) ? due : 0, show: true },
    { href: "/checks", label: "Checks", icon: <Icon.check />, count: review, show: seesChecks },
    { href: "/reports", label: "Reports", icon: <Icon.chart />, count: 0, show: can.reports(p) },
    { href: "/expiry", label: "Expiry", icon: <Icon.clock />, count: expiring, show: true },
    { href: "/team", label: p.isSuper ? "Staff & rights" : "Staff", icon: <Icon.users />, count: 0, show: can.manageStaff(p) },
  ].filter((n) => n.show);
  const nav = all.slice(0, 4);
  const extra = [
    ...all.slice(4).map((n) => ({ href: n.href, label: n.label, icon: n.icon })),
    { href: "/items", label: "Item list", icon: <Icon.pill /> },
    { href: "/more", label: p.isSuper ? "Portal & settings" : "Settings", icon: <Icon.settings /> },
  ];
  const brand = data.hospital.logo_url ? <img className="brand-logo" src={data.hospital.logo_url} alt="" /> : <BrandMark />;

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
          {brand} <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{data.hospital.logo_url ? data.hospital.code : "Crash Cart"}</span>
        </div>
        {nav.map((n) => (
          <a key={n.href} href={`#${n.href}`} className={`side-link ${isOn(n.href) ? "active" : ""}`}>
            {n.icon} {n.label}
            {n.count > 0 && <span className="count">{n.count}</span>}
          </a>
        ))}
        <div className="nav-gap" style={{ height: 14 }} />
        {extra.map((n) => (
          <a key={n.href} href={`#${n.href}`} className={`side-link ${isOn(n.href) ? "active" : ""}`}>
            {n.icon} {n.label}
          </a>
        ))}
        <div className="spacer" />
        <div className="small muted side-user" style={{ padding: "0 8px" }}>
          <div className="strong" style={{ color: "var(--ink)" }}>
            {ws.user.name || ws.user.email}
          </div>
          <div>{roleLabel}</div>
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
          <div className="brand">{brand}</div>
          <div style={{ minWidth: 0, flex: 1, display: "flex" }}>{picker}</div>
          <span className="badge primary">{roleLabel}</span>
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
        <a href="#/more" className={`tab ${["/more", ...extra.map((x) => x.href)].some(isOn) ? "active" : ""}`}>
          <Icon.more />
          More
        </a>
      </nav>
    </div>
  );
}
