import type { Borders, Fill, Worksheet } from "exceljs";
import {
  dayTitle,
  expiryNote,
  monthRemark,
  monthShort,
  monthTitle,
  pctOf,
  performanceScore,
  qtyPresent,
  rating,
  shiftMonth,
  sumMetrics,
  trend,
  wardItemRows,
  wardName,
  type Metrics,
  type Report,
  type WardMonth,
} from "./reports";

/**
 * Excel export in the layout of the hospital's audit workbooks:
 *  - "percentage summary": one SUMMARY block per ward, two blocks side by side
 *  - "performance comparison": month-over-month comparison (added to every report)
 *  - one sheet per ward: ITEMS / QTY / QTY PRESENT / EXPIRY / REMARKS by drawer
 *    (several months: one "<Month> Remarks" column per selected month)
 */

const thin = { style: "thin" as const, color: { argb: "FF7F7F7F" } };
const BOX: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const HEAD = fill("FFD9E2F3");
const DRAW = fill("FFFFF2CC");
const TITLE = fill("FFE2EFDA");

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Ward";
  let n = base;
  let i = 2;
  while (used.has(n.toUpperCase())) n = `${base.slice(0, 26)} ${i++}`;
  used.add(n.toUpperCase());
  return n;
}

function pct(n: number) {
  return Math.round(n * 10) / 10;
}

/** One SUMMARY block at (row, col), matching the audit workbook. Returns rows used. */
function summaryBlock(ws: Worksheet, row: number, col: number, cell: WardMonth, extraTitle = "") {
  const at = (r: number, c: number) => ws.getCell(row + r, col + c);
  const m = cell.metrics;
  const title = `${wardName(cell.cart).toUpperCase()} CRASH CART${extraTitle}`;
  at(0, 0).value = cell.check ? `${title}   (${dayTitle(cell.check.submitted_at ?? cell.check.created_at)})` : title;
  at(0, 0).font = { bold: true, size: 12 };
  at(1, 0).value = "SUMMARY : ";
  at(1, 0).font = { bold: true, underline: true };
  if (!m) {
    at(2, 0).value = "No pharmacist audit this month.";
    at(2, 0).font = { italic: true, color: { argb: "FF9C0006" } };
    return 9;
  }
  const C = (r: number, c: number) => ws.getCell(row + r, col + c).address;
  const rows: [string, number | string, number | { formula: string; result: number } | string][] = [
    ["Total approved items", m.approved, "% variations "],
    ["Total available items", m.available, ""],
    ["Percent availability", "%", { formula: `${C(3, 1)}/${C(2, 1)}*100`, result: m.availabilityPct }],
    ["Near expiry issues ", m.nearExpiry, { formula: `${C(5, 1)}/${C(2, 1)}`, result: m.nearExpiry / m.approved }],
    ["Expired items", m.expired, { formula: `${C(6, 1)}/${C(2, 1)}`, result: m.expired / m.approved }],
    ["Items below standard ", m.below, { formula: `${C(7, 1)}/${C(2, 1)}`, result: m.below / m.approved }],
    ["Items above standard ", m.above, { formula: `${C(8, 1)}/${C(2, 1)}`, result: m.above / m.approved }],
  ];
  rows.forEach(([label, v, extra], i) => {
    const r = 2 + i;
    at(r, 0).value = label;
    at(r, 1).value = v;
    at(r, 2).value = extra as never;
    for (let c = 0; c < 3; c++) at(r, c).border = BOX;
    if (i === 0) at(r, 2).font = { bold: true };
    if (i >= 3) at(r, 2).numFmt = "0.0%";
    if (i === 2) at(r, 2).numFmt = "0.0";
  });
  const score = performanceScore(m);
  at(9, 0).value = `Performance score: ${score} (${rating(score)})`;
  at(9, 0).font = { bold: true, color: { argb: "FF1F4E79" } };
  at(10, 0).value = cell.check?.remarks || "";
  at(10, 0).font = { italic: true };
  at(10, 0).alignment = { wrapText: true, vertical: "top" };
  return 12;
}

function summarySheet(wb: import("exceljs").Workbook, report: Report, title: string) {
  const ws = wb.addWorksheet("percentage summary");
  ws.columns = [{ width: 3 }, { width: 30 }, { width: 10 }, { width: 14 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 3 }, { width: 30 }, { width: 10 }, { width: 14 }];
  ws.mergeCells("B3:F3");
  ws.getCell("B3").value = title;
  ws.getCell("B3").font = { bold: true, size: 14 };
  ws.getCell("B3").fill = TITLE;

  const last = report.months.length - 1;
  // Overall hospital performance (all selected wards, latest month).
  const total = sumMetrics(report.cells.map((c) => c[last]?.metrics ?? null));
  const prevTotal = sumMetrics(
    report.cells.map((c, i) => (last > 0 ? c[last - 1]?.metrics : report.previous[i]?.metrics) ?? null),
  );
  ws.getCell("B4").value = total
    ? `Overall availability ${total.availabilityPct}% · score ${performanceScore(total)} (${rating(performanceScore(total))})` +
      (prevTotal ? ` · previous month ${prevTotal.availabilityPct}% (${trend(performanceScore(prevTotal), performanceScore(total))})` : "")
    : "No audits in this period.";
  ws.getCell("B4").font = { bold: true, color: { argb: "FF1F4E79" } };

  let row = 6;
  for (let i = 0; i < report.wards.length; i += 2) {
    const left = report.cells[i][last];
    const right = report.cells[i + 1]?.[last];
    const used = Math.max(summaryBlock(ws, row, 2, left), right ? summaryBlock(ws, row, 9, right) : 0);
    row += used;
  }

  if (report.months.length > 1) {
    // Monthly summary per ward: one column per selected month.
    row += 1;
    ws.getCell(row, 2).value = "MONTHLY PERFORMANCE SUMMARY";
    ws.getCell(row, 2).font = { bold: true, size: 13 };
    row += 2;
    for (const [wi, ward] of report.wards.entries()) {
      ws.getCell(row, 2).value = `${wardName(ward).toUpperCase()} CRASH CART`;
      ws.getCell(row, 2).font = { bold: true };
      row++;
      const header = ["", ...report.months.map(monthShort)];
      header.forEach((h, c) => {
        const cell = ws.getCell(row, 2 + c);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = HEAD;
        cell.border = BOX;
      });
      row++;
      const ms = report.cells[wi].map((c) => c.metrics);
      const lines: [string, (m: Metrics) => number | string][] = [
        ["Total approved items", (m) => m.approved],
        ["Total available items", (m) => m.available],
        ["Percent availability", (m) => m.availabilityPct],
        ["Near expiry issues", (m) => m.nearExpiry],
        ["Expired items", (m) => m.expired],
        ["Items below standard", (m) => m.below],
        ["Items above standard", (m) => m.above],
        ["Performance score", (m) => performanceScore(m)],
      ];
      for (const [label, f] of lines) {
        ws.getCell(row, 2).value = label;
        ws.getCell(row, 2).border = BOX;
        ms.forEach((m, c) => {
          const cell = ws.getCell(row, 3 + c);
          cell.value = m ? f(m) : "—";
          cell.border = BOX;
        });
        row++;
      }
      row++;
    }
  }
}

function comparisonSheet(wb: import("exceljs").Workbook, report: Report) {
  const ws = wb.addWorksheet("performance comparison");
  const multi = report.months.length > 1;
  // Columns: ward, then the previous month (single) or each selected month, then change and trend.
  const periods = multi ? report.months : [null, report.months[0]];
  const labels = (multi ? report.months : [prevOf(report), report.months[0]]).map((m) => `${monthShort(m)} availability %`);
  const header = ["WARD", ...labels, "Availability change (points)", "Score first", "Score last", "Score change", "Trend"];
  ws.columns = header.map((h, i) => ({ width: i === 0 ? 26 : Math.max(14, h.length + 2) }));
  ws.getCell(1, 1).value = multi
    ? `PERFORMANCE COMPARISON ${monthTitle(report.months[0])} – ${monthTitle(report.months[report.months.length - 1])}`
    : `PERFORMANCE COMPARISON ${monthTitle(prevOf(report))} vs ${monthTitle(report.months[0])}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  header.forEach((h, c) => {
    const cell = ws.getCell(3, c + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = HEAD;
    cell.border = BOX;
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  let row = 4;
  const rowFor = (label: string, ms: (Metrics | null)[]) => {
    const first = ms.find((m) => m) ?? null;
    const lastM = ms[ms.length - 1];
    const vals = [
      label,
      ...ms.map((m) => (m ? m.availabilityPct : "—")),
      first && lastM ? pct(lastM.availabilityPct - first.availabilityPct) : "—",
      first ? performanceScore(first) : "—",
      lastM ? performanceScore(lastM) : "—",
      first && lastM ? pct(performanceScore(lastM) - performanceScore(first)) : "—",
      trend(first && first !== lastM ? performanceScore(first) : null, lastM ? performanceScore(lastM) : null),
    ];
    vals.forEach((v, c) => {
      const cell = ws.getCell(row, c + 1);
      cell.value = v;
      cell.border = BOX;
      if (c === vals.length - 1) cell.font = { bold: true, color: { argb: v === "Improved" ? "FF006100" : v === "Declined" ? "FF9C0006" : "FF595959" } };
    });
    row++;
  };
  report.wards.forEach((w, i) => {
    const ms = multi ? report.cells[i].map((c) => c.metrics) : [report.previous[i]?.metrics ?? null, report.cells[i][0].metrics];
    rowFor(`${wardName(w)} crash cart`, ms);
  });
  const totals = periods.map((_, pi) =>
    sumMetrics(report.wards.map((_, i) => (multi ? report.cells[i][pi].metrics : pi === 0 ? report.previous[i]?.metrics ?? null : report.cells[i][0].metrics))),
  );
  rowFor("ALL WARDS", totals);
  ws.getRow(row - 1).font = { bold: true };
  row += 1;
  ws.getCell(row, 1).value =
    "Availability = available items ÷ approved items. Score = availability less deductions for expired, near-expiry, damaged and off-quantity items; the trend follows the score. Excellent ≥ 95, Good ≥ 90, Fair ≥ 80.";
  ws.getCell(row, 1).font = { italic: true, size: 9, color: { argb: "FF595959" } };
}

function prevOf(report: Report) {
  return shiftMonth(report.months[0], -1);
}

function wardSheet(wb: import("exceljs").Workbook, report: Report, wi: number, used: Set<string>) {
  const cart = report.wards[wi];
  const cells = report.cells[wi];
  const multi = report.months.length > 1;
  const ws = wb.addWorksheet(safeSheetName(wardName(cart).toUpperCase(), used));
  const latest = [...cells].reverse().find((c) => c.check) ?? cells[cells.length - 1];
  const rows = wardItemRows(cells);
  const header = multi
    ? ["", "ITEMS", "QTY", "QTY PRESENT ", ...report.months.map((m) => `${monthShort(m)} Remarks`)]
    : ["", "ITEMS", "QTY", "QTY PRESENT ", "EXPIRY", "REMARKS"];
  const lastCol = header.length;
  ws.columns = header.map((_, i) => ({ width: [7, 60, 12, 15][i] ?? 26 }));

  ws.mergeCells(2, 1, 2, 4);
  ws.getCell("A2").value = `${cart.name.toUpperCase()}`;
  ws.getCell("A2").font = { bold: true, size: 18 };
  ws.mergeCells(3, 1, 3, 4);
  ws.getCell("A3").value = latest.check
    ? `${multi ? `${monthTitle(report.months[0])} – ${monthTitle(report.months[report.months.length - 1])}` : monthTitle(report.months[0])} · audited ${dayTitle(latest.check.submitted_at ?? latest.check.created_at)} by ${latest.check.performed_by_name}`
    : `No pharmacist audit in ${multi ? "these months" : monthTitle(report.months[0])}.`;
  ws.getCell("A3").font = { italic: true, color: { argb: "FF595959" } };
  header.forEach((h, c) => {
    const cell = ws.getCell(4, c + 1);
    cell.value = h || null;
    cell.font = { bold: true };
    cell.fill = HEAD;
    cell.border = BOX;
  });

  let row = 5;
  let n = 0;
  let drawer = "";
  for (const r of rows) {
    if (r.drawer !== drawer) {
      drawer = r.drawer;
      ws.mergeCells(row, 1, row, lastCol);
      const cell = ws.getCell(row, 1);
      cell.value = drawer;
      cell.font = { bold: true };
      cell.fill = DRAW;
      cell.border = BOX;
      row++;
    }
    const cur = r.byMonth[r.byMonth.length - 1] ?? [...r.byMonth].reverse().find(Boolean);
    const vals: (string | number)[] = [++n, r.label, r.qty, cur ? qtyPresent(cur) : ""];
    if (multi) vals.push(...r.byMonth.map((l) => monthRemark(l)));
    else vals.push(cur ? expiryNote(cur) : "", cur ? [cur.remarks, cur.obs_closed && cur.obs_action ? `Closed: ${cur.obs_action}` : ""].filter(Boolean).join(" · ") : "");
    vals.forEach((v, c) => {
      const cell = ws.getCell(row, c + 1);
      cell.value = v;
      cell.border = BOX;
      cell.alignment = { wrapText: c >= 4, vertical: "top" };
      if (c === 3 && v !== "OK") cell.font = { bold: true, color: { argb: "FF9C0006" } };
    });
    row++;
  }
  if (!rows.length) ws.getCell(row, 2).value = "No items recorded.";

  row += 2;
  for (const c of cells) {
    if (!c.metrics) continue;
    ws.getCell(row, 2).value =
      `${monthShort(c.month)}: approved ${c.metrics.approved}, available ${c.metrics.available} (${c.metrics.availabilityPct}%), near expiry ${c.metrics.nearExpiry} (${pctOf(c.metrics.nearExpiry, c.metrics)}%), expired ${c.metrics.expired}, below standard ${c.metrics.below}, above standard ${c.metrics.above}` +
      (c.check?.remarks ? ` — ${c.check.remarks}` : "");
    ws.getCell(row, 2).alignment = { wrapText: true };
    row++;
  }
}

export async function reportWorkbook(report: Report, hospitalName: string): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Crash Cart";
  wb.created = new Date();
  const multi = report.months.length > 1;
  const period = multi
    ? `${monthTitle(report.months[0])} – ${monthTitle(report.months[report.months.length - 1])}`
    : monthTitle(report.months[0]);
  summarySheet(wb, report, `SUMMARY PERCENTAGES OF CRASH CART INSPECTION ${period} · ${hospitalName.toUpperCase()}`);
  comparisonSheet(wb, report);
  const used = new Set(["PERCENTAGE SUMMARY", "PERFORMANCE COMPARISON"]);
  report.wards.forEach((_, i) => wardSheet(wb, report, i, used));
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function reportFileName(report: Report, code: string): string {
  const first = monthTitle(report.months[0]);
  const last = monthTitle(report.months[report.months.length - 1]);
  return report.months.length > 1 ? `CRASH AUDIT ${first} - ${last} ${code}.xlsx` : `CRASH AUDIT ${first} ${code}.xlsx`;
}
