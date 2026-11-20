import {
  comparisonRows,
  expiryNote,
  lineRemark,
  monthRemark,
  monthShort,
  monthTitle,
  pctOf,
  performanceScore,
  qtyPresent,
  rating,
  sumMetrics,
  wardItemRows,
  wardName,
  type Metrics,
  type Report,
  type ReportMeta,
} from "./reports";

/**
 * CSV and PDF downloads of a report. Both open with the same header as the
 * screen and the Excel file: hospital details (and logo, in the PDF), the
 * period, and each ward's crash cart, responsible nurse and audits.
 */

export type ReportFormat = "xlsx" | "csv" | "pdf";

export function reportFileName(report: Report, code: string, ext: ReportFormat = "xlsx"): string {
  const first = monthTitle(report.months[0]);
  const last = monthTitle(report.months[report.months.length - 1]);
  const base = report.months.length > 1 ? `CRASH AUDIT ${first} - ${last} ${code}` : `CRASH AUDIT ${first} ${code}`;
  return `${base}.${ext}`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function auditText(meta: ReportMeta, wi: number, multi: boolean): string {
  const a = meta.wards[wi].audits;
  if (!a.length) return "No audit";
  return a.map((x) => `${multi ? `${monthShort(x.month)}: ` : ""}${x.date} by ${x.by}`).join("; ");
}

export function hospitalLines(meta: ReportMeta): string[] {
  const h = meta.hospital;
  return [h.address, [h.phone && `Tel ${h.phone}`, h.email].filter(Boolean).join(" · ")].filter(Boolean);
}

const SUMMARY: [string, (m: Metrics) => number | string][] = [
  ["Total approved items", (m) => m.approved],
  ["Total available items", (m) => m.available],
  ["Percent availability", (m) => `${m.availabilityPct}%`],
  ["Near expiry issues", (m) => m.nearExpiry],
  ["Expired items", (m) => m.expired],
  ["Items below standard", (m) => m.below],
  ["Items above standard", (m) => m.above],
  ["Performance score", (m) => `${performanceScore(m)} (${rating(performanceScore(m))})`],
];

// ------------------------------------------------------------------ CSV

export function reportCsv(report: Report, meta: ReportMeta): string {
  const multi = report.months.length > 1;
  const rows: unknown[][] = [];
  const h = meta.hospital;
  rows.push([[meta.title.toUpperCase(), meta.subtitle].filter(Boolean).join(" · ")]);
  rows.push(["Hospital", `${h.name} (${h.code})`]);
  if (h.address) rows.push(["Address", h.address]);
  if (h.phone) rows.push(["Phone", h.phone]);
  if (h.email) rows.push(["Email", h.email]);
  rows.push(["Period", meta.period]);
  rows.push(["Months", report.months.map(monthTitle).join(", ")]);
  rows.push(["Prepared by", meta.preparedBy]);
  rows.push(["Prepared on", meta.preparedOn]);
  rows.push([]);

  rows.push(["WARDS"]);
  rows.push(["Ward", "Crash cart", "Nurse responsible", "Audit performed"]);
  meta.wards.forEach((w, wi) => rows.push([wardName(w.cart), w.cart.name, w.nurses.join("; ") || "Not assigned", auditText(meta, wi, multi)]));
  rows.push([]);

  rows.push(["PERFORMANCE SUMMARY"]);
  rows.push(["Ward", "Month", "Audit date", "Audited by", ...SUMMARY.map(([l]) => l), "Remarks"]);
  report.wards.forEach((w, wi) =>
    report.cells[wi].forEach((c) => {
      const audit = meta.wards[wi].audits.find((a) => a.month === c.month);
      rows.push([
        wardName(w),
        monthTitle(c.month),
        audit?.date ?? "",
        audit?.by ?? "",
        ...SUMMARY.map(([, f]) => (c.metrics ? f(c.metrics) : "")),
        c.check?.remarks ?? (c.metrics ? "" : "No pharmacist audit"),
      ]);
    }),
  );
  const last = report.months.length - 1;
  const total = sumMetrics(report.cells.map((c) => c[last]?.metrics ?? null));
  if (total) rows.push(["All wards", monthTitle(report.months[last]), "", "", ...SUMMARY.map(([, f]) => f(total)), ""]);
  rows.push([]);

  const cmp = comparisonRows(report);
  rows.push(["PERFORMANCE COMPARISON"]);
  rows.push(["Ward", ...cmp.cols.map((m) => `${monthShort(m)} availability %`), ...cmp.cols.map((m) => `${monthShort(m)} score`), "Score change (points)", "Trend"]);
  for (const r of cmp.rows)
    rows.push([
      r.name,
      ...r.ms.map((m) => (m ? m.availabilityPct : "")),
      ...r.ms.map((m) => (m ? performanceScore(m) : "")),
      r.change ?? "",
      r.trend,
    ]);
  rows.push([]);

  rows.push(["ITEMS"]);
  rows.push(
    multi
      ? ["Ward", "Drawer", "#", "Items", "Qty", "Qty present", ...report.months.map((m) => `${monthShort(m)} Remarks`)]
      : ["Ward", "Drawer", "#", "Items", "Qty", "Qty present", "Expiry", "Remarks"],
  );
  report.wards.forEach((w, wi) => {
    wardItemRows(report.cells[wi]).forEach((r, i) => {
      const cur = r.byMonth[r.byMonth.length - 1] ?? [...r.byMonth].reverse().find(Boolean);
      rows.push([
        wardName(w),
        r.drawer,
        i + 1,
        r.label,
        r.qty,
        cur ? qtyPresent(cur) : "",
        ...(multi ? r.byMonth.map((l) => monthRemark(l)) : [cur ? expiryNote(cur) : "", lineRemark(cur)]),
      ]);
    });
  });
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// ------------------------------------------------------------------ logo

/** Any logo (PNG, JPEG, SVG data URL or https URL) as a PNG data URL, for PDF and Excel. */
export async function logoPng(url: string, size = 256): Promise<{ data: string; w: number; h: number } | null> {
  if (!url || typeof document === "undefined") return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("logo"));
      img.src = url;
    });
    const w0 = img.naturalWidth || size;
    const h0 = img.naturalHeight || size;
    const k = size / Math.max(w0, h0);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w0 * k);
    canvas.height = Math.round(h0 * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ PDF

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [15, 118, 110];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function reportPdf(report: Report, meta: ReportMeta, brand = "#0f766e"): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const multi = report.months.length > 1;
  const doc = new jsPDF({ orientation: multi && report.months.length > 3 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const color = hexToRgb(brand);
  const head = { fillColor: color, textColor: 255, fontStyle: "bold" as const };
  const logo = await logoPng(meta.hospital.logo_url);

  // ---- header band: logo, hospital details, report title
  doc.setFillColor(...color);
  doc.rect(0, 0, W, 4, "F");
  let x = M;
  if (logo) {
    const s = 22;
    const w = (logo.w / Math.max(logo.w, logo.h)) * s;
    const h = (logo.h / Math.max(logo.w, logo.h)) * s;
    doc.addImage(logo.data, "PNG", M, 10, w, h);
    x = M + s + 5;
  }
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const nameLines: string[] = doc.splitTextToSize(meta.hospital.name, W * 0.5 - x);
  doc.text(nameLines[0], x, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  hospitalLines(meta).forEach((l, i) => doc.text(l, x, 21.5 + i * 4.5));
  doc.text(`Hospital code ${meta.hospital.code}`, x, 21.5 + hospitalLines(meta).length * 4.5);

  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(meta.title.toUpperCase(), W - M, 16, { align: "right" });
  doc.setTextColor(40);
  doc.setFontSize(10);
  doc.text([meta.subtitle, meta.period].filter(Boolean).join(" · "), W - M, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90);
  doc.text(`Prepared by ${meta.preparedBy} on ${meta.preparedOn}`, W - M, 27, { align: "right" });
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.line(M, 37, W - M, 37);

  // ---- wards, carts, responsible nurse, audits
  autoTable(doc, {
    startY: 41,
    margin: { left: M, right: M },
    head: [["Ward", "Crash cart", "Nurse responsible", "Audit performed (date · pharmacist)"]],
    body: meta.wards.map((w, wi) => [wardName(w.cart), w.cart.name, w.nurses.join("\n") || "Not assigned", auditText(meta, wi, multi).replace(/; /g, "\n")]),
    headStyles: head,
    styles: { fontSize: 8.5, cellPadding: 1.8 },
  });

  // ---- overall performance
  const last = report.months.length - 1;
  const total = sumMetrics(report.cells.map((c) => c[last]?.metrics ?? null));
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Overall performance · ${monthTitle(report.months[last])}`, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (total) {
    const sc = performanceScore(total);
    doc.text(
      `Score ${sc} (${rating(sc)}) · availability ${total.availabilityPct}% (${total.available} of ${total.approved} items) · near expiry ${total.nearExpiry} · expired ${total.expired} · below standard ${total.below} · above standard ${total.above}`,
      M,
      y + 5,
      { maxWidth: W - 2 * M },
    );
  } else doc.text("No pharmacist audits for these wards in this month.", M, y + 5);
  y += 13;

  // ---- comparison
  const cmp = comparisonRows(report);
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Performance comparison", ...cmp.cols.map((m) => monthShort(m)), "Change", "Trend"]],
    body: cmp.rows.map((r) => [
      r.name,
      ...r.ms.map((m) => (m ? `${m.availabilityPct}%  ·  score ${performanceScore(m)}` : "—")),
      r.change === null ? "—" : `${r.change > 0 ? "+" : ""}${r.change} pts`,
      r.trend,
    ]),
    headStyles: head,
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    didParseCell: (c) => {
      if (c.section === "body" && c.row.index === cmp.rows.length - 1) c.cell.styles.fontStyle = "bold";
      if (c.section === "body" && c.column.index === cmp.cols.length + 2)
        c.cell.styles.textColor = c.cell.raw === "Improved" ? [0, 110, 50] : c.cell.raw === "Declined" ? [170, 20, 20] : [90, 90, 90];
    },
  });

  // ---- percentage summary per ward (several months: one table per ward, a column per month)
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (multi)
    report.wards.forEach((w, wi) =>
      autoTable(doc, {
        startY: lastY() + 6,
        margin: { left: M, right: M },
        head: [[`${wardName(w)} crash cart · summary`, ...report.months.map((m) => monthShort(m))]],
        body: SUMMARY.map(([label, f]) => [label, ...report.cells[wi].map((c) => (c.metrics ? String(f(c.metrics)) : "—"))]),
        headStyles: head,
        styles: { fontSize: 8.5, cellPadding: 1.6 },
        columnStyles: { 0: { cellWidth: 55 } },
        pageBreak: "avoid",
      }),
    );
  else
    autoTable(doc, {
      startY: lastY() + 6,
      margin: { left: M, right: M },
      head: [["Summary", ...report.wards.map((w) => wardName(w))]],
      body: SUMMARY.map(([label, f]) => [label, ...report.cells.map((cells) => (cells[0].metrics ? String(f(cells[0].metrics)) : "—"))]),
      headStyles: head,
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: 55 } },
    });
  const remarks = report.cells.flatMap((cells, wi) =>
    cells.filter((c) => c.check?.remarks).map((c) => [`${wardName(report.wards[wi])}${multi ? ` · ${monthShort(c.month)}` : ""}`, c.check!.remarks]),
  );
  if (remarks.length)
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4,
      margin: { left: M, right: M },
      head: [["Ward", "Pharmacist remarks"]],
      body: remarks,
      headStyles: { fillColor: [235, 235, 235], textColor: 30, fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: 40 } },
    });

  // ---- one section per ward: ITEMS / QTY / QTY PRESENT / EXPIRY / REMARKS
  report.wards.forEach((w, wi) => {
    const rows = wardItemRows(report.cells[wi]);
    doc.addPage();
    const info = meta.wards[wi];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(`${w.name.toUpperCase()}`, M, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Ward ${wardName(w)} · Nurse responsible: ${info.nurses.join(", ") || "Not assigned"}`, M, 21.5);
    doc.text(`Audit: ${auditText(meta, wi, multi)}`, M, 26, { maxWidth: W - 2 * M });
    const body: (string | number | { content: string; colSpan: number; styles: object })[][] = [];
    let drawer = "";
    const span = multi ? 4 + report.months.length : 6;
    rows.forEach((r, i) => {
      if (r.drawer !== drawer) {
        drawer = r.drawer;
        body.push([{ content: drawer, colSpan: span, styles: { fillColor: [255, 242, 204], fontStyle: "bold", halign: "left" } }]);
      }
      const cur = r.byMonth[r.byMonth.length - 1] ?? [...r.byMonth].reverse().find(Boolean);
      body.push([
        i + 1,
        r.label,
        r.qty,
        cur ? qtyPresent(cur) : "",
        ...(multi ? r.byMonth.map((l) => monthRemark(l)) : [cur ? expiryNote(cur) : "", lineRemark(cur)]),
      ]);
    });
    autoTable(doc, {
      startY: 31,
      margin: { left: M, right: M, top: 16 },
      head: [multi ? ["#", "Items", "Qty", "Qty present", ...report.months.map((m) => `${monthShort(m)} remarks`)] : ["#", "Items", "Qty", "Qty present", "Expiry", "Remarks"]],
      body: body.length ? body : [[{ content: "No items recorded.", colSpan: span, styles: {} }]],
      headStyles: head,
      styles: { fontSize: 7.5, cellPadding: 1.3 },
      columnStyles: { 0: { cellWidth: 8, halign: "right" }, 2: { cellWidth: 10, halign: "right" }, 3: { cellWidth: 18 } },
      didParseCell: (c) => {
        if (c.section === "body" && c.column.index === 3 && typeof c.cell.raw === "string" && c.cell.raw && c.cell.raw !== "OK") {
          c.cell.styles.textColor = [170, 20, 20];
          c.cell.styles.fontStyle = "bold";
        }
      },
    });
    const sums = report.cells[wi].filter((c) => c.metrics);
    if (sums.length) {
      const yy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
      doc.setFontSize(8);
      doc.setTextColor(60);
      doc.text(
        sums
          .map(
            (c) =>
              `${monthShort(c.month)}: approved ${c.metrics!.approved}, available ${c.metrics!.available} (${c.metrics!.availabilityPct}%), near expiry ${c.metrics!.nearExpiry} (${pctOf(c.metrics!.nearExpiry, c.metrics!)}%), expired ${c.metrics!.expired}, below ${c.metrics!.below}, above ${c.metrics!.above}`,
          )
          .join("\n"),
        M,
        yy,
        { maxWidth: W - 2 * M },
      );
    }
  });

  // ---- footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text([meta.hospital.name, meta.title, meta.subtitle, meta.period].filter(Boolean).join(" · "), M, H - 7);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 7, { align: "right" });
  }
  return doc.output("blob");
}
