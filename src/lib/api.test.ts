import { describe, expect, it } from "vitest";
import * as api from "./api";
import { createLocalBackend } from "./backend/local";
import { addDays, daysUntil, expiryState } from "./dates";
import * as rep from "./reports";
import { reportWorkbook } from "./xlsx-report";

const TODAY = "2026-11-20";
const MONTH = "2026-11";

async function seeded() {
  const b = createLocalBackend();
  await api.seedDemo(b, TODAY);
  return b;
}

async function as(b: ReturnType<typeof createLocalBackend>, email: string, code = "CGH") {
  await b.signIn(email, api.DEMO_PASSWORD);
  const ws = (await api.loadWorkspace(b))!;
  const h = ws.hospitals.find((x) => x.code === code)!;
  return { ws, d: await api.loadHospital(b, h, api.permFor(ws, h.id)!) };
}

const ADMIN = "admin@demo.hospital";
const ADMIN_ICU = "admin.icu@demo.hospital";
const NURSE = "nurse@demo.hospital";
const NURSING_MGR = "nursing.manager@demo.hospital";
const PHARM = "pharmacist@demo.hospital";
const PHARM_ER = "pharmacist.er@demo.hospital";
const PHARM_MGR = "pharmacy.manager@demo.hospital";

describe("dates", () => {
  it("computes expiry windows", () => {
    expect(daysUntil("2026-11-30", TODAY)).toBe(10);
    expect(expiryState(addDays(TODAY, -1), 30, TODAY)).toBe("expired");
    expect(expiryState(addDays(TODAY, 30), 30, TODAY)).toBe("soon");
    expect(expiryState(addDays(TODAY, 31), 30, TODAY)).toBe("ok");
    expect(expiryState(null, 30, TODAY)).toBe("none");
  });
});

describe("demo hospitals", () => {
  it("seeds two themed hospitals, three wards each, with four floors", async () => {
    const b = await seeded();
    const { ws, d } = await as(b, ADMIN);
    expect(ws.isSuper).toBe(false);
    expect(ws.hospitals.map((h) => h.code).sort()).toEqual(["CGH", "RCH"]);
    expect(d.hospital.theme.preset).toBe("teal");
    expect(d.carts).toHaveLength(3);
    expect(d.drawers).toHaveLength(12);
    expect(d.members).toHaveLength(7);
  });

  it("blocks a stranger from another hospital's data", async () => {
    const b = await seeded();
    await b.signUp("stranger@else.org", "secret12", "Stranger");
    expect(await b.select("carts")).toHaveLength(0);
    expect((await api.loadWorkspace(b))!.hospitals).toHaveLength(0);
  });
});

describe("wards", () => {
  it("shows a nurse only their one ward, and an admin only their wards", async () => {
    const b = await seeded();
    let { d } = await as(b, NURSE);
    expect(d.carts.map((c) => c.cart_type)).toEqual(["ICU"]);
    expect(new Set(d.cartItems.map((c) => c.cart_id)).size).toBe(1);
    ({ d } = await as(b, ADMIN_ICU));
    expect(d.carts.map((c) => c.cart_type).sort()).toEqual(["Emergency", "ICU"]);
  });

  it("lets a ward's admin set items, but not another ward's", async () => {
    const b = await seeded();
    const { d: all } = await as(b, ADMIN);
    const ward = all.carts.find((c) => c.cart_type === "Ward")!;
    const icu = all.carts.find((c) => c.cart_type === "ICU")!;
    const { d } = await as(b, ADMIN_ICU);
    const icuItem = d.cartItems.find((c) => c.cart_id === icu.id)!;
    await api.updateCartItem(b, icuItem.id, { par_qty: 7 });
    const wardDrawer = all.drawers.find((x) => x.cart_id === ward.id)!;
    await expect(
      api.addCartItem(b, d.hospital.id, { cartId: ward.id, drawerId: wardDrawer.id, itemId: d.items[0].id, parQty: 1, lot: "", expiry: null }),
    ).rejects.toThrow(/Only the Hospital admin of this ward/);
  });

  it("keeps ward creation with the Super admin", async () => {
    const b = await seeded();
    const { d } = await as(b, ADMIN);
    await expect(api.createCart(b, d.hospital.id, { name: "New ward cart", location: "Ward 9", cart_type: "Ward" })).rejects.toThrow(/Super admin/);
  });
});

describe("staff IDs", () => {
  it("lets a Hospital admin create nurses (one ward) and pharmacists (some or all wards)", async () => {
    const b = await seeded();
    const { d } = await as(b, ADMIN_ICU);
    const icu = d.carts.find((c) => c.cart_type === "ICU")!;
    const er = d.carts.find((c) => c.cart_type === "Emergency")!;
    await expect(api.inviteMember(b, d, "n2@cgh.org", "nurse", [icu.id, er.id])).rejects.toThrow(/one ward/);
    await api.inviteMember(b, d, "n2@cgh.org", "nurse", [icu.id]);
    await api.inviteMember(b, d, "p2@cgh.org", "pharmacy", [icu.id, er.id]);
    // Outside their wards, or "all wards" when they don't have all: refused.
    const { d: full } = await as(b, ADMIN);
    const ward = full.carts.find((c) => c.cart_type === "Ward")!;
    await b.signIn(ADMIN_ICU, api.DEMO_PASSWORD);
    await expect(api.inviteMember(b, d, "p3@cgh.org", "pharmacy", [ward.id])).rejects.toThrow(/Super admin/);
    await expect(api.inviteMember(b, d, "p3@cgh.org", "pharmacy", [])).rejects.toThrow(/Super admin/);
    // Only the Super admin makes admins and managers.
    await expect(api.inviteMember(b, d, "a2@cgh.org", "hospital_admin", [icu.id])).rejects.toThrow(/give that role/);
  });

  it("lets the Super admin create several Hospital admins with ward rights", async () => {
    const b = await seeded();
    const { d } = await as(b, api.DEMO_SUPER.email);
    const er = d.carts.find((c) => c.cart_type === "Emergency")!;
    await api.inviteMember(b, d, "er.admin@cgh.org", "hospital_admin", [er.id]);
    await b.signUp("er.admin@cgh.org", "secret12", "ER Admin");
    const ws = (await api.loadWorkspace(b))!;
    expect(ws.memberships[0]).toMatchObject({ role: "hospital_admin", ward_ids: [er.id] });
  });

  it("stops a nurse or pharmacist from giving rights", async () => {
    const b = await seeded();
    const { d } = await as(b, PHARM);
    await expect(api.inviteMember(b, d, "x@cgh.org", "nurse", [d.carts[0].id])).rejects.toThrow(/give that role/);
    const nurse = d.members.find((m) => m.role === "nurse")!;
    await expect(api.changeAccess(b, nurse.id, "pharmacy", [])).rejects.toThrow(/Super admin/);
  });
});

describe("nurses", () => {
  it("cannot start a check; they see the pharmacy's checks of their ward, read-only", async () => {
    const b = await seeded();
    const { ws, d } = await as(b, NURSE);
    const icu = d.carts[0];
    expect(icu.cart_type).toBe("ICU");
    await expect(api.startCheck(b, d, ws.user, icu.id, "daily", TODAY)).rejects.toThrow(/pharmacist/);
    const seen = d.checks.filter((c) => c.status !== "draft");
    expect(seen.length).toBe(4);
    expect(seen.every((c) => c.cart_id === icu.id && c.audience === "pharmacy")).toBe(true);
    expect(seen.some((c) => c.issue_count > 0)).toBe(true);
    const open = seen.find((c) => c.status === "submitted")!;
    await expect(api.closeCheck(b, open, ws.user, "")).rejects.toThrow();
    await expect(b.update("checks", { id: open.id }, { remarks: "x" })).rejects.toThrow(/role/);
    const { lines } = await api.loadCheck(b, open.id);
    await expect(api.closeObservation(b, lines[0].id, "x")).rejects.toThrow();
  });

  it("leaves the nursing manager with every ward's checks but no Staff rights", async () => {
    const b = await seeded();
    const { d } = await as(b, NURSING_MGR);
    expect(new Set(d.checks.map((c) => c.cart_id)).size).toBe(3);
    expect(d.invites).toHaveLength(0);
    await expect(api.inviteMember(b, d, "x@cgh.org", "nurse", [d.carts[0].id])).rejects.toThrow(/give that role/);
  });

  it("update expiry dates of their ward, but not the items themselves", async () => {
    const b = await seeded();
    const { d } = await as(b, NURSE);
    const row = d.cartItems[0];
    await api.updateCartItem(b, row.id, { expiry_date: "2028-03-31", lot_number: "L1" });
    expect((await as(b, NURSE)).d.cartItems.find((c) => c.id === row.id)).toMatchObject({ expiry_date: "2028-03-31" });
    await expect(api.updateCartItem(b, row.id, { par_qty: 9 })).rejects.toThrow(/Hospital admin/);
    await expect(api.removeCartItem(b, row.id)).rejects.toThrow(/Hospital admin/);
  });

  it("get the ward item list as CSV with code, description, strength, generic and category", async () => {
    const b = await seeded();
    const { d } = await as(b, NURSE);
    const csv = api.wardItemsCsv(d, d.carts[0].id);
    expect(csv.split("\r\n")[0]).toContain('"Code","Description","Strength","Generic","Category"');
    expect(csv).toContain('"CC-M03","Inj. Atropine","1 mg/1 mL","Atropine sulfate"');
  });
});

describe("item list", () => {
  it("is each hospital's own, kept by the Hospital admin, with unique codes", async () => {
    const b = await seeded();
    const { d } = await as(b, ADMIN);
    const base = { code: "cc-x1", name: "Inj. Test", strength: "1 mg", generic: "Testamine", category: "My own category", kind: "medicine" as const };
    const id = await api.addItem(b, d.hospital.id, base, d.items);
    await expect(api.addItem(b, d.hospital.id, base, [...d.items, { ...base, id, code: "CC-X1" } as never])).rejects.toThrow(/already used/);
    const after = (await as(b, ADMIN)).d.items.find((i) => i.id === id)!;
    expect(after).toMatchObject({ code: "CC-X1", generic: "Testamine", category: "My own category" });
    const { d: rch } = await as(b, ADMIN, "RCH");
    expect(rch.items.some((i) => i.id === id)).toBe(false);
    const { d: pd } = await as(b, PHARM);
    await expect(api.updateItem(b, id, base)).rejects.toThrow(/Hospital admin/);
    expect(pd.items.length).toBeGreaterThan(0);
  });
});

describe("pharmacist audits", () => {
  it("runs draft → submitted → observations closed → in review → closed by the pharmacy manager", async () => {
    const b = await seeded();
    const { ws, d } = await as(b, PHARM_ER);
    const er = d.carts.find((c) => c.cart_type === "Emergency")!;
    const id = await api.startCheck(b, d, ws.user, er.id, "monthly", TODAY);
    let { check, lines } = await api.loadCheck(b, id);
    expect(check.audience).toBe("pharmacy");
    await api.saveLine(b, lines[0].id, { line_status: "absent", found_qty: 0, remarks: "NA in pharmacy" });
    await api.submitCheck(b, check, { seal_number: "S-1", remarks: "" });
    // Lines are frozen after submit, except the follow-up of observations.
    await expect(api.saveLine(b, lines[1].id, { line_status: "absent" })).rejects.toThrow(/submitted/);
    ({ check, lines } = await api.loadCheck(b, id));
    const open = lines.filter((l) => l.line_status !== "present");
    expect(open.length).toBeGreaterThan(0);
    // The manager can't close before the pharmacist closes observations.
    const { ws: mws } = await as(b, PHARM_MGR);
    await expect(api.closeCheck(b, check, mws.user, "")).rejects.toThrow(/pharmacist closes/);
    await b.signIn(PHARM_ER, api.DEMO_PASSWORD);
    await expect(api.sendForReview(b, check)).rejects.toThrow(/Close all observations/);
    for (const l of open) await api.closeObservation(b, l.id, "Restocked");
    await api.sendForReview(b, check);
    await expect(api.closeCheck(b, { ...check, status: "in_review" }, ws.user, "")).rejects.toThrow(/pharmacy manager/);
    await b.signIn(PHARM_MGR, api.DEMO_PASSWORD);
    await api.closeCheck(b, { ...check, status: "in_review" }, mws.user, "Verified");
    expect((await api.loadCheck(b, id)).check).toMatchObject({ status: "closed", reviewed_by_name: "Yusuf Ali" });
  });

  it("lets a pharmacist update expiry dates in their wards", async () => {
    const b = await seeded();
    const { d } = await as(b, PHARM);
    const row = d.cartItems[0];
    await api.updateCartItem(b, row.id, { expiry_date: "2028-01-31", lot_number: "LOT9" });
    const after = (await as(b, PHARM)).d.cartItems.find((c) => c.id === row.id)!;
    expect(after).toMatchObject({ expiry_date: "2028-01-31", lot_number: "LOT9" });
  });
});

describe("reports", () => {
  it("computes the audit summary like the CRASH AUDIT sheet", () => {
    const line = (status: string, par: number, found: number | null) =>
      ({ line_status: status, par_qty: par, found_qty: found }) as never;
    const m = rep.computeMetrics([
      line("present", 2, null),
      line("present", 2, 3),
      line("absent", 1, 0),
      line("short", 5, 3),
      line("near_expiry", 1, null),
    ]);
    expect(m).toMatchObject({ approved: 5, available: 4, availabilityPct: 80, nearExpiry: 1, expired: 0, below: 2, above: 1 });
  });

  it("builds single- and multi-month reports from the seeded audits, with comparison", async () => {
    const b = await seeded();
    const { d } = await as(b, PHARM_MGR);
    const single = await rep.loadReport(b, d.hospital.id, d.carts, [MONTH]);
    expect(single.cells.every((w) => w[0].metrics)).toBe(true);
    expect(single.previous.every((w) => w.metrics)).toBe(true);
    const months = rep.recentMonths(MONTH, 4);
    expect(months).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    const multi = await rep.loadReport(b, d.hospital.id, d.carts, months);
    const rows = rep.wardItemRows(multi.cells[0]);
    expect(rows.length).toBe(multi.cells[0][3].lines.length);
    expect(rows.some((r) => r.byMonth.some((l) => rep.monthRemark(l) !== ""))).toBe(true);
    const ward = multi.wards.findIndex((w) => w.cart_type === "Ward");
    const [, , oct, nov] = multi.cells[ward].map((c) => c.metrics!.availabilityPct);
    expect(nov).toBeLessThanOrEqual(oct);

    const blob = await reportWorkbook(multi, d.hospital.name);
    expect(blob.size).toBeGreaterThan(5000);
  });

  it("limits a pharmacist's report to their wards", async () => {
    const b = await seeded();
    const { d } = await as(b, PHARM_ER);
    expect(d.carts.map((c) => c.cart_type).sort()).toEqual(["Emergency", "Ward"]);
    const { d: all } = await as(b, PHARM_MGR);
    const icu = all.carts.find((c) => c.cart_type === "ICU")!;
    await b.signIn(PHARM_ER, api.DEMO_PASSWORD);
    const r = await rep.loadReport(b, d.hospital.id, [icu], [MONTH]);
    expect(r.cells[0][0].check).toBeNull();
  });
});

describe("super admin", () => {
  it("is the only one who can create hospitals and set their look", async () => {
    const b = await seeded();
    await b.signIn(ADMIN, api.DEMO_PASSWORD);
    await expect(api.createHospital(b, { name: "Rogue Clinic", code: "RC", starterCarts: false })).rejects.toThrow(/Super admin/);
    const { d } = await as(b, ADMIN);
    await expect(api.updateHospital(b, d.hospital.id, { theme: { preset: "navy" } })).rejects.toThrow(/Super admin/);
    await b.signIn(api.DEMO_SUPER.email, api.DEMO_PASSWORD);
    await api.createHospital(b, { name: "North Clinic", code: "NC", starterCarts: false, theme: { preset: "navy" }, logo_url: "data:image/png;base64,AA==" });
    const ws = (await api.loadWorkspace(b))!;
    expect(ws.hospitals.find((h) => h.code === "NC")).toMatchObject({ theme: { preset: "navy" }, logo_url: "data:image/png;base64,AA==" });
  });
});

describe("csv", () => {
  it("quotes cells and defuses formulas", () => {
    expect(api.toCsv(["a"], [["=1+1"], ['x"y']])).toBe('"a"\r\n"\'=1+1"\r\n"x""y"');
  });
});
