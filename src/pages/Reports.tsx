import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/app-context";
import { can } from "../lib/catalog";
import { usePath } from "../lib/router";
import {
  currentMonth,
  dayTitle,
  expiryNote,
  loadReport,
  monthLong,
  monthRemark,
  monthShort,
  pctOf,
  performanceScore,
  qtyPresent,
  rating,
  recentMonths,
  shiftMonth,
  sumMetrics,
  trend,
  wardItemRows,
  wardName,
  type Metrics,
  type Month,
  type Report,
  type Trend,
} from "../lib/reports";
import { Icon } from "../components/icons";
import { Empty, Field } from "../components/ui";

type Mode = "single" | "multi";

function wardFromHash(): string {
  const q = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(q).get("ward") ?? "";
}

export function ReportsPage() {
  const { data, backend, toast } = useApp();
  const path = usePath();
  const p = data.perm;
  const now = currentMonth();
  const [mode, setMode] = useState<Mode>("single");
  const [month, setMonth] = useState<Month>(now);
  const [months, setMonths] = useState<Month[]>(recentMonths(now, 3));
  const [ward, setWard] = useState<string>(wardFromHash());
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setWard(wardFromHash()), [path]);

  // Pharmacists see their own wards; the pharmacy manager and Super admin see every ward.
  const wards = useMemo(() => data.carts.filter((c) => !ward || c.id === ward), [data.carts, ward]);
  const selected = mode === "single" ? [month] : [...months].sort();
  const key = `${mode}|${selected.join(",")}|${wards.map((w) => w.id).join(",")}`;

  useEffect(() => {
    let live = true;
    setReport(null);
    if (!selected.length) return;
    loadReport(backend, data.hospital.id, wards, selected)
      .then((r) => live && setReport(r))
      .catch((e) => toast((e as Error).message, "error"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data.checks]);

  if (!can.reports(p))
    return (
      <div className="page">
        <div className="card">
          <Empty>Reports are for pharmacists and the pharmacy manager.</Empty>
        </div>
      </div>
    );

  const choices = recentMonths(now, 12).reverse();

  async function exportXlsx() {
    if (!report) return;
    setBusy(true);
    try {
      const { reportWorkbook, reportFileName } = await import("../lib/xlsx-report");
      const blob = await reportWorkbook(report, data.hospital.name);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = reportFileName(report, data.hospital.code);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast((e as Error).message || "Export failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  const period = mode === "single" ? monthLong(month) : selected.length ? `${monthLong(selected[0])} – ${monthLong(selected[selected.length - 1])}` : "";

  return (
    <div className="page">
      <div className="print-only">
        <strong>{data.hospital.name}</strong> · Crash cart audit report · {period}
      </div>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>
            Monthly crash cart audit, from the pharmacists' audits.{" "}
            {p.isSuper || p.role === "pharmacy_manager" ? "All wards." : p.wardIds.length ? "Your wards." : "All wards."}
          </p>
        </div>
        <div className="row wrap no-print">
          <button className="btn primary small" disabled={!report || busy} onClick={() => void exportXlsx()}>
            <Icon.excel /> {busy ? "Preparing…" : "Excel"}
          </button>
          <button className="btn small" onClick={() => window.print()}>
            <Icon.print /> Print / PDF
          </button>
        </div>
      </div>

      <div className="card card-pad no-print" style={{ marginBottom: 14 }}>
        <div className="grid cols-2">
          <Field label="Report">
            <div className="seg">
              <button type="button" className={mode === "single" ? "on neutral" : ""} onClick={() => setMode("single")}>
                One month
              </button>
              <button type="button" className={mode === "multi" ? "on neutral" : ""} onClick={() => setMode("multi")}>
                Several months
              </button>
            </div>
          </Field>
          <Field label="Ward">
            <select className="input" value={ward} onChange={(e) => setWard(e.target.value)}>
              <option value="">{data.carts.length > 1 ? "All my wards" : "My ward"}</option>
              {data.carts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.location} · {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {mode === "single" ? (
          <Field label="Month">
            <input className="input" type="month" value={month} max={now} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </Field>
        ) : (
          <Field label="Months (remarks of each selected month are included)">
            <div className="month-chips">
              {choices.map((m) => {
                const on = months.includes(m);
                return (
                  <button
                    type="button"
                    key={m}
                    aria-pressed={on}
                    className={`chip ${on ? "on" : ""}`}
                    onClick={() => setMonths((ms) => (on ? ms.filter((x) => x !== m) : [...ms, m]))}
                  >
                    {monthShort(m)}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
      </div>

      {data.carts.length === 0 ? (
        <div className="card">
          <Empty>No wards assigned to you yet.</Empty>
        </div>
      ) : !selected.length ? (
        <div className="card">
          <Empty>Pick at least one month.</Empty>
        </div>
      ) : !report ? (
        <div className="muted">Loading…</div>
      ) : (
        <ReportView report={report} />
      )}
    </div>
  );
}

function trendClass(t: Trend) {
  return t === "Improved" ? "trend-up" : t === "Declined" ? "trend-down" : "muted";
}

function TrendText({ t }: { t: Trend }) {
  const arrow = t === "Improved" ? "▲ " : t === "Declined" ? "▼ " : "";
  return (
    <span className={trendClass(t)}>
      {arrow}
      {t}
    </span>
  );
}

/** Half-circle meter for the overall performance score (0-100). */
function Gauge({ score, label }: { score: number; label: string }) {
  const r = 80;
  const len = Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / 100));
  return (
    <svg className="gauge" viewBox="0 0 200 118" role="img" aria-label={`Performance score ${score} of 100, ${label}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
      <path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${len * frac} ${len}`}
      />
      <text x="100" y="88" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--ink)">
        {score}
      </text>
      <text x="100" y="110" textAnchor="middle" fontSize="12" fill="var(--muted)">
        {label}
      </text>
    </svg>
  );
}

function ReportView({ report }: { report: Report }) {
  const last = report.months.length - 1;
  const multi = report.months.length > 1;
  const total = sumMetrics(report.cells.map((c) => c[last].metrics));
  const prevTotal = sumMetrics(report.cells.map((c, i) => (last > 0 ? c[last - 1].metrics : report.previous[i].metrics)));
  const prevLabel = monthShort(last > 0 ? report.months[last - 1] : shiftMonth(report.months[0], -1));
  const score = total ? performanceScore(total) : 0;
  const t = trend(prevTotal ? performanceScore(prevTotal) : null, total ? score : null);

  return (
    <>
      <div className="card card-pad gauge-card">
        {total ? <Gauge score={score} label={rating(score)} /> : null}
        <div className="list-main">
          <h2>Overall performance · {monthLong(report.months[last])}</h2>
          {total ? (
            <div className="small" style={{ marginTop: 6 }}>
              <div>
                Availability <strong>{total.availabilityPct}%</strong> ({total.available} of {total.approved} approved items)
              </div>
              <div>
                Near expiry {total.nearExpiry} · Expired {total.expired} · Below standard {total.below} · Above standard {total.above}
              </div>
              <div style={{ marginTop: 6 }}>
                vs {prevLabel}: {prevTotal ? `${prevTotal.availabilityPct}% availability, score ${performanceScore(prevTotal)}` : "no audits"} ·{" "}
                <TrendText t={t} />
              </div>
            </div>
          ) : (
            <p className="muted">No pharmacist audits for these wards in {monthLong(report.months[last])}.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <h2>Comparison</h2>
        </div>
        <ComparisonTable report={report} />
      </div>

      <div className="section">
        <div className="section-title">
          <h2>{multi ? "Monthly summary by ward" : "Summary by ward"}</h2>
        </div>
        <div className="report-grid">
          {report.wards.map((w, wi) => (
            <WardSummary key={w.id} report={report} wi={wi} />
          ))}
        </div>
      </div>

      {report.wards.map((w, wi) => (
        <WardItems key={w.id} report={report} wi={wi} />
      ))}
    </>
  );
}

function ComparisonTable({ report }: { report: Report }) {
  const multi = report.months.length > 1;
  const cols: Month[] = multi ? report.months : [shiftMonth(report.months[0], -1), report.months[0]];
  const metricsFor = (wi: number): (Metrics | null)[] =>
    multi ? report.cells[wi].map((c) => c.metrics) : [report.previous[wi].metrics, report.cells[wi][0].metrics];
  const rows = report.wards.map((w, wi) => ({ name: wardName(w), ms: metricsFor(wi) }));
  rows.push({ name: "All wards", ms: cols.map((_, ci) => sumMetrics(report.wards.map((_, wi) => metricsFor(wi)[ci]))) });

  return (
    <div className="card table-scroll">
      <table className="kv">
        <thead>
          <tr>
            <th>Ward</th>
            {cols.map((m) => (
              <th key={m} className="num">
                {monthShort(m)}
              </th>
            ))}
            <th className="num">Change</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const first = r.ms.find((m) => m) ?? null;
            const lastM = r.ms[r.ms.length - 1];
            const t = trend(first && first !== lastM ? performanceScore(first) : null, lastM ? performanceScore(lastM) : null);
            return (
              <tr key={r.name} style={i === rows.length - 1 ? { fontWeight: 600 } : undefined}>
                <td>{r.name}</td>
                {r.ms.map((m, ci) => (
                  <td key={ci} className="num">
                    {m ? (
                      <>
                        {m.availabilityPct}%<div className="muted small">score {performanceScore(m)}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                ))}
                <td className="num">
                  {first && lastM && first !== lastM ? `${(Math.round((performanceScore(lastM) - performanceScore(first)) * 10) / 10).toString()} pts` : "—"}
                </td>
                <td>
                  <TrendText t={t} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small" style={{ padding: "0 8px 8px" }}>
        Percent = availability (available ÷ approved items). Score = availability less deductions for expired, near-expiry, damaged and
        off-quantity items; the trend follows the score. Excellent ≥ 95, Good ≥ 90, Fair ≥ 80.
      </p>
    </div>
  );
}

const SUMMARY_ROWS: [string, (m: Metrics) => number, boolean][] = [
  ["Total approved items", (m) => m.approved, false],
  ["Total available items", (m) => m.available, false],
  ["Near expiry issues", (m) => m.nearExpiry, true],
  ["Expired items", (m) => m.expired, true],
  ["Items below standard", (m) => m.below, true],
  ["Items above standard", (m) => m.above, true],
];

function WardSummary({ report, wi }: { report: Report; wi: number }) {
  const cells = report.cells[wi];
  const latest = cells[cells.length - 1];
  const multi = cells.length > 1;
  return (
    <div className="card card-pad">
      <h3>{wardName(report.wards[wi]).toUpperCase()} CRASH CART</h3>
      <div className="muted small" style={{ marginBottom: 8 }}>
        {latest.check ? `${dayTitle(latest.check.submitted_at ?? latest.check.created_at)} · ${latest.check.performed_by_name}` : "No audit in the latest month"}
      </div>
      <div className="table-scroll">
        <table className="kv" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th>Summary</th>
              {multi ? cells.map((c) => <th key={c.month} className="num">{monthShort(c.month)}</th>) : <th className="num">Count</th>}
              {!multi && <th className="num">% variation</th>}
            </tr>
          </thead>
          <tbody>
            {SUMMARY_ROWS.map(([label, f, showPct]) => (
              <tr key={label}>
                <td>{label}</td>
                {cells.map((c) => (
                  <td key={c.month} className="num">
                    {c.metrics ? f(c.metrics) : "—"}
                  </td>
                ))}
                {!multi && <td className="num">{latest.metrics && showPct ? `${pctOf(f(latest.metrics), latest.metrics)}%` : ""}</td>}
              </tr>
            ))}
            <tr>
              <td>
                <strong>Percent availability</strong>
              </td>
              {cells.map((c) => (
                <td key={c.month} className="num">
                  <strong>{c.metrics ? `${c.metrics.availabilityPct}%` : "—"}</strong>
                </td>
              ))}
              {!multi && <td />}
            </tr>
            <tr>
              <td>Performance score</td>
              {cells.map((c) => (
                <td key={c.month} className="num">
                  {c.metrics ? `${performanceScore(c.metrics)} · ${rating(performanceScore(c.metrics))}` : "—"}
                </td>
              ))}
              {!multi && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      {cells.map((c) =>
        c.check?.remarks ? (
          <p key={c.month} className="small" style={{ marginBottom: 0 }}>
            {multi && <strong>{monthShort(c.month)}: </strong>}
            <em>{c.check.remarks}</em>
          </p>
        ) : null,
      )}
    </div>
  );
}

function WardItems({ report, wi }: { report: Report; wi: number }) {
  const [open, setOpen] = useState(false);
  const cells = report.cells[wi];
  const multi = cells.length > 1;
  const rows = wardItemRows(cells);
  const issues = rows.filter((r) => r.byMonth.some((l) => l && (l.line_status !== "present" || (l.found_qty !== null && l.found_qty !== l.par_qty)))).length;
  if (!rows.length) return null;
  let drawer = "";
  let n = 0;
  return (
    <div className="section print-break">
      <div className="section-title">
        <h2>{report.wards[wi].name}</h2>
        <button className="btn ghost small no-print" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide items" : `Show ${rows.length} items${issues ? ` (${issues} with remarks)` : ""}`}
        </button>
      </div>
      <div className={`card table-scroll ${open ? "" : "hide-screen"}`}>
        <table className="kv">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Items</th>
              <th className="num">Qty</th>
              <th>Qty present</th>
              {multi ? (
                cells.map((c) => <th key={c.month}>{monthShort(c.month)} remarks</th>)
              ) : (
                <>
                  <th>Expiry</th>
                  <th>Remarks</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = r.byMonth[r.byMonth.length - 1] ?? [...r.byMonth].reverse().find(Boolean);
              const head =
                r.drawer !== drawer ? (
                  <tr key={`d-${r.key}`} className="drawer-row">
                    <td colSpan={multi ? 4 + cells.length : 6}>{(drawer = r.drawer)}</td>
                  </tr>
                ) : null;
              const qp = cur ? qtyPresent(cur) : "";
              return [
                head,
                <tr key={r.key}>
                  <td className="num">{++n}</td>
                  <td>{r.label}</td>
                  <td className="num">{r.qty}</td>
                  <td style={qp !== "OK" ? { color: "var(--danger)", fontWeight: 600 } : undefined}>{qp}</td>
                  {multi ? (
                    r.byMonth.map((l, i) => (
                      <td key={i} className="small">
                        {monthRemark(l)}
                      </td>
                    ))
                  ) : (
                    <>
                      <td className="small">{cur ? expiryNote(cur) : ""}</td>
                      <td className="small">
                        {cur ? [cur.remarks, cur.obs_closed && cur.obs_action ? `Closed: ${cur.obs_action}` : ""].filter(Boolean).join(" · ") : ""}
                      </td>
                    </>
                  )}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
