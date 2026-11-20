import { useCallback, useEffect, useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { CHECK_TYPE_LABEL, LINE_STATUSES, LINE_STATUS_LABEL, audienceOf, can } from "../lib/catalog";
import { formatDate, formatDateTime, todayISO } from "../lib/dates";
import { downloadText } from "../lib/download";
import { navigate } from "../lib/router";
import type { Check, CheckLine, LineStatus } from "../lib/types";
import { Icon } from "../components/icons";
import { BackLink, Empty, ExpiryBadge, Field, LineBadge, StatusBadge } from "../components/ui";

export function CheckPage({ id }: { id: string }) {
  const { backend, data, ws, run, toast, reload } = useApp();
  const [check, setCheck] = useState<Check | null>(null);
  const [lines, setLines] = useState<CheckLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [seal, setSeal] = useState("");
  const [remarks, setRemarks] = useState("");
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.loadCheck(backend, id);
      setCheck(r.check);
      setLines(r.lines);
      setSeal(r.check.seal_number);
      setRemarks(r.check.remarks);
      setReview(r.check.review_notes);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [backend, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return (
      <div className="page">
        <BackLink href="#/checks">Checks</BackLink>
        <div className="card">
          <Empty>{error}</Empty>
        </div>
      </div>
    );
  if (!check) return <div className="page muted">Loading…</div>;

  const cart = data.carts.find((c) => c.id === check.cart_id);
  const p = data.perm;
  const editable = check.status === "draft" && can.runChecks(p, check.cart_id) && audienceOf(p.role) === check.audience;
  const isAudit = check.audience === "pharmacy";
  const reviewer = can.review(p, check.audience);
  const obsEditable = isAudit && check.status === "submitted" && can.closeObservations(p, check.cart_id);
  const awaitingManager = isAudit ? check.status === "in_review" : check.status === "submitted";
  const managerName = isAudit ? "the pharmacy manager" : "the nursing manager";
  const stats = api.checkStats(lines);
  const shown = issuesOnly ? lines.filter((l) => l.line_status !== "present") : lines;
  const floors = [...new Set(shown.map((l) => `${l.drawer_order}|${l.drawer_name}`))].sort(
    (a, b) => Number(a.split("|")[0]) - Number(b.split("|")[0]),
  );
  const canDelete = (check.status === "draft" && check.performed_by === ws.user.id) || p.isSuper;

  async function patchLine(line: CheckLine, patch: Partial<CheckLine>) {
    setLines((ls) => ls.map((l) => (l.id === line.id ? { ...l, ...patch } : l)));
    try {
      await api.saveLine(backend, line.id, patch);
    } catch (e) {
      toast((e as Error).message, "error");
      void load();
    }
  }

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    const ok = await run(fn, msg);
    if (ok) await load();
    setBusy(false);
    return ok;
  }

  function exportCsv() {
    const csv = api.toCsv(
      ["Floor", "Item", "Strength", "Par qty", "Found qty", "Expiry", "Status", "Remarks"],
      lines.map((l) => [l.drawer_name, l.item_name, l.strength, l.par_qty, l.found_qty ?? "", l.expiry_date ?? "", LINE_STATUS_LABEL[l.line_status], l.remarks]),
    );
    downloadText(`${data.hospital.code}-${(cart?.name ?? "cart").replace(/\W+/g, "-")}-${check!.created_at.slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="page">
      <BackLink href={cart ? `#/carts/${cart.id}` : "#/checks"}>{cart?.name ?? "Checks"}</BackLink>
      <div className="print-only">
        <strong>{data.hospital.name}</strong> · Crash cart check report · printed {formatDate(todayISO())}
      </div>
      <div className="page-head">
        <div>
          <h1>{cart?.name ?? "Cart check"}</h1>
          <p>
            {isAudit ? "Pharmacy audit" : "Nursing check"} · {CHECK_TYPE_LABEL[check.check_type]} · {check.performed_by_name} ·{" "}
            {formatDateTime(check.created_at)}
          </p>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <StatusBadge status={check.status} />
            <span className="badge ok">{stats.ok} OK</span>
            {stats.issues > 0 && <span className="badge danger">{stats.issues} issues</span>}
            {isAudit && check.status !== "draft" && stats.issues > 0 && (
              <span className={`badge ${stats.obsOpen ? "warn" : "ok"}`}>
                {stats.obsOpen ? `${stats.obsOpen} observation${stats.obsOpen > 1 ? "s" : ""} open` : "Observations closed"}
              </span>
            )}
          </div>
        </div>
        <div className="row wrap no-print">
          <button className="btn small" onClick={exportCsv}>
            <Icon.download /> CSV
          </button>
          <button className="btn small" onClick={() => window.print()}>
            <Icon.print /> Print
          </button>
        </div>
      </div>

      {editable && (
        <div className="card card-pad no-print" style={{ marginBottom: 6 }}>
          <div className="small">
            Go floor by floor. Every item starts as <strong>OK</strong>, except items whose recorded expiry date has passed or is
            close. Tap a different status for anything that isn't right.
          </div>
        </div>
      )}

      <div className="row wrap no-print" style={{ marginTop: 12 }}>
        <label className="row small">
          <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Show issues only
        </label>
      </div>

      {lines.length === 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <Empty>This cart had no items when the check started.</Empty>
        </div>
      )}

      {floors.map((key) => {
        const name = key.split("|").slice(1).join("|");
        const mine = shown.filter((l) => `${l.drawer_order}|${l.drawer_name}` === key);
        return (
          <div className="floor" key={key}>
            <div className="floor-title">
              <h3>{name}</h3>
              <span className="muted small">{mine.length} items</span>
            </div>
            <div className="card">
              {mine.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  editable={editable}
                  obsEditable={obsEditable}
                  showObs={isAudit && check.status !== "draft"}
                  windowDays={data.hospital.near_expiry_days}
                  onChange={(patch) => void patchLine(l, patch)}
                  onObservation={(action) =>
                    act(
                      () => (action === null ? api.reopenObservation(backend, l.id) : api.closeObservation(backend, l.id, action)),
                      action === null ? "Observation reopened" : "Observation closed",
                    )
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="section">
        {editable ? (
          <div className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Finish the check</h2>
            <Field label="Seal / lock number after the check">
              <input className="input" value={seal} onChange={(e) => setSeal(e.target.value)} />
            </Field>
            <Field label="Remarks">
              <textarea className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Seal intact. Defib tested OK." />
            </Field>
            <div className="row wrap">
              <button
                className="btn"
                disabled={busy}
                onClick={() => void act(() => api.markAllPresent(backend, lines), "Remaining items marked OK")}
              >
                Mark remaining OK
              </button>
              <div className="spacer" />
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  const next = isAudit ? "You'll close each observation, then send it to the pharmacy manager." : "Your nursing manager will follow up.";
                  if (stats.issues > 0 && !confirm(`Submit with ${stats.issues} issue(s)? ${next}`)) return;
                  if (await act(() => api.submitCheck(backend, check, { seal_number: seal, remarks }), isAudit ? "Audit submitted" : "Sent to your nursing manager")) {
                    if (cart && seal.trim() && seal.trim() !== cart.seal_number && can.setItems(p, cart.id))
                      await api.updateCart(backend, cart.id, { seal_number: seal.trim() }).then(reload);
                  }
                }}
              >
                Submit check
              </button>
            </div>
          </div>
        ) : (
          <div className="card card-pad">
            <h2 style={{ marginBottom: 8 }}>Summary</h2>
            <div className="small">
              <div>
                <span className="muted">Seal number:</span> {check.seal_number || "—"}
              </div>
              <div>
                <span className="muted">Submitted:</span> {formatDateTime(check.submitted_at)}
              </div>
              <div>
                <span className="muted">Remarks:</span> {check.remarks || "—"}
              </div>
              {check.status === "closed" && (
                <>
                  <div>
                    <span className="muted">Reviewed by:</span> {check.reviewed_by_name} · {formatDateTime(check.closed_at)}
                  </div>
                  <div>
                    <span className="muted">Review notes:</span> {check.review_notes || "—"}
                  </div>
                </>
              )}
            </div>

            {obsEditable && (
              <div className="no-print" style={{ marginTop: 14 }}>
                <p className="small" style={{ marginTop: 0 }}>
                  Close each observation above with what was done, then send the audit to the pharmacy manager.
                </p>
                <button
                  className="btn primary"
                  disabled={busy || stats.obsOpen > 0}
                  onClick={() => void act(() => api.sendForReview(backend, check), "Sent to the pharmacy manager")}
                >
                  Send to pharmacy manager{stats.obsOpen ? ` (${stats.obsOpen} open)` : ""}
                </button>
              </div>
            )}
            {awaitingManager && reviewer && (
              <div className="no-print" style={{ marginTop: 14 }}>
                <Field label="Review notes" hint={isAudit ? "Your check of the pharmacist's follow-up" : "What was done about the issues (restocked, replaced, escalated…)"}>
                  <textarea className="input" value={review} onChange={(e) => setReview(e.target.value)} />
                </Field>
                <div className="row wrap">
                  <button className="btn" disabled={busy} onClick={() => void act(() => api.sendBack(backend, check, review), "Sent back")}>
                    {isAudit ? "Send back to pharmacist" : "Send back to nurse"}
                  </button>
                  <div className="spacer" />
                  <button className="btn primary" disabled={busy} onClick={() => void act(() => api.closeCheck(backend, check, ws.user, review), "Closed")}>
                    Review and close
                  </button>
                </div>
              </div>
            )}
            {check.status === "closed" && reviewer && (
              <button className="btn small no-print" style={{ marginTop: 12 }} disabled={busy} onClick={() => void act(() => api.sendBack(backend, check), "Reopened")}>
                Reopen
              </button>
            )}
            {awaitingManager && !reviewer && <p className="muted small">Waiting for {managerName} to review.</p>}
            {isAudit && check.status === "submitted" && !obsEditable && (
              <p className="muted small">Waiting for the pharmacist to close the observations.</p>
            )}
          </div>
        )}
      </div>

      {canDelete && (
        <div className="section no-print">
          <button
            className="btn danger small"
            onClick={async () => {
              if (!confirm("Delete this check?")) return;
              if (await run(() => api.deleteCheck(backend, check), "Check deleted")) navigate("/checks");
            }}
          >
            Delete check
          </button>
        </div>
      )}
    </div>
  );
}

function LineRow({
  line,
  editable,
  obsEditable,
  showObs,
  windowDays,
  onChange,
  onObservation,
}: {
  line: CheckLine;
  editable: boolean;
  obsEditable: boolean;
  showObs: boolean;
  windowDays: number;
  onChange: (p: Partial<CheckLine>) => void;
  /** Close with an action, or reopen with null. */
  onObservation: (action: string | null) => Promise<boolean>;
}) {
  const [remarks, setRemarks] = useState(line.remarks);
  const [action, setAction] = useState(line.obs_action);
  const [found, setFound] = useState(line.found_qty === null ? "" : String(line.found_qty));
  const issue = line.line_status !== "present";

  return (
    <div className={`line ${issue ? "issue" : ""}`}>
      <div className="line-head">
        <div>
          <div className="strong">
            {line.item_name} {line.strength && <span className="muted small">{line.strength}</span>}
          </div>
          <div className="muted small">
            Par {line.par_qty}
            {line.found_qty !== null ? ` · Found ${line.found_qty}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {line.expiry_date && <ExpiryBadge date={line.expiry_date} windowDays={windowDays} />}
          {!editable && (
            <div style={{ marginTop: 4 }}>
              <LineBadge status={line.line_status} />
            </div>
          )}
        </div>
      </div>
      {editable ? (
        <>
          <div className="seg" role="radiogroup" aria-label={`Status of ${line.item_name}`}>
            {LINE_STATUSES.map((s: LineStatus) => (
              <button
                key={s}
                role="radio"
                aria-checked={line.line_status === s}
                className={line.line_status === s ? `on ${s}` : ""}
                onClick={() => onChange({ line_status: s })}
              >
                {LINE_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {issue && (
            <div className="line-extra">
              <input
                className="input"
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Found qty"
                aria-label="Quantity found"
                value={found}
                onChange={(e) => setFound(e.target.value)}
                onBlur={() => {
                  const v = found === "" ? null : Math.max(0, Number(found));
                  if (v !== line.found_qty) onChange({ found_qty: v });
                }}
              />
              <input
                className="input"
                placeholder="What's wrong / action taken"
                aria-label="Remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                onBlur={() => remarks !== line.remarks && onChange({ remarks })}
              />
            </div>
          )}
        </>
      ) : (
        line.remarks && <div className="small muted">{line.remarks}</div>
      )}
      {showObs && issue && (
        <div className="small" style={{ marginTop: 8 }}>
          {line.obs_closed ? (
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge ok">Observation closed</span>
              <span>{line.obs_action}</span>
              {obsEditable && (
                <button className="btn ghost small no-print" onClick={() => void onObservation(null)}>
                  Reopen
                </button>
              )}
            </div>
          ) : obsEditable ? (
            <div className="line-extra no-print">
              <input
                className="input"
                placeholder="Action taken (restocked, replaced, escalated…)"
                aria-label={`Action taken for ${line.item_name}`}
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
              <button className="btn small primary" onClick={() => void onObservation(action)}>
                Close observation
              </button>
            </div>
          ) : (
            <span className="badge warn">Observation open</span>
          )}
        </div>
      )}
    </div>
  );
}
