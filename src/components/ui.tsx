import { useEffect, type ReactNode } from "react";
import { expiryState, expiryText } from "../lib/dates";
import { CHECK_TYPE_LABEL, LINE_STATUS_LABEL } from "../lib/catalog";
import type { CheckStatus, CheckType, LineStatus } from "../lib/types";
import { Icon } from "./icons";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function ExpiryBadge({ date, windowDays }: { date: string | null; windowDays: number }) {
  const s = expiryState(date, windowDays);
  const cls = s === "expired" ? "danger" : s === "soon" ? "warn" : s === "ok" ? "ok" : "";
  return <span className={`badge ${cls}`}>{expiryText(date)}</span>;
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, [string, string]> = {
    draft: ["In progress", "info"],
    submitted: ["Awaiting review", "warn"],
    closed: ["Closed", "ok"],
  };
  const [label, cls] = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function LineBadge({ status }: { status: LineStatus }) {
  const cls = status === "present" ? "ok" : status === "short" || status === "near_expiry" ? "warn" : "danger";
  return <span className={`badge ${cls}`}>{LINE_STATUS_LABEL[status]}</span>;
}

export function TypeLabel({ type }: { type: CheckType }) {
  return <>{CHECK_TYPE_LABEL[type]}</>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="row muted small no-print" style={{ textDecoration: "none", gap: 4, marginBottom: 8 }}>
      <Icon.back /> {children}
    </a>
  );
}
