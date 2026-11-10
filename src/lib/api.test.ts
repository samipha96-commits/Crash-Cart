import { describe, expect, it } from "vitest";
import * as api from "./api";
import { createLocalBackend } from "./backend/local";
import { addDays, daysUntil, expiryState } from "./dates";

const TODAY = "2026-11-10";

async function seeded() {
  const b = createLocalBackend();
  await api.seedDemo(b, TODAY);
  return b;
}

async function hospitalFor(b: ReturnType<typeof createLocalBackend>, code: string) {
  const ws = (await api.loadWorkspace(b))!;
  const h = ws.hospitals.find((x) => x.code === code)!;
  return { ws, d: await api.loadHospital(b, h, api.roleFor(ws, h.id)!) };
}

describe("dates", () => {
  it("computes expiry windows", () => {
    expect(daysUntil("2026-11-20", TODAY)).toBe(10);
    expect(expiryState(addDays(TODAY, -1), 30, TODAY)).toBe("expired");
    expect(expiryState(addDays(TODAY, 30), 30, TODAY)).toBe("soon");
    expect(expiryState(addDays(TODAY, 31), 30, TODAY)).toBe("ok");
    expect(expiryState(null, 30, TODAY)).toBe("none");
  });
});

describe("demo hospitals", () => {
  it("seeds two hospitals, three carts each, with four floors", async () => {
    const b = await seeded();
    const { ws, d } = await hospitalFor(b, "CGH");
    expect(ws.isSuper).toBe(false);
    expect(ws.hospitals.map((h) => h.code).sort()).toEqual(["CGH", "RCH"]);
    expect(d.carts).toHaveLength(3);
    expect(d.drawers).toHaveLength(12);
    expect(d.members).toHaveLength(4);
    const rows = api.stockRows(d, TODAY);
    expect(rows.some((r) => r.state === "expired")).toBe(true);
    expect(rows.some((r) => r.state === "soon")).toBe(true);
  });

  it("keeps hospitals apart: staff only see hospitals they belong to", async () => {
    const b = await seeded();
    await b.signIn("nurse@demo.hospital", api.DEMO_PASSWORD);
    const ws = (await api.loadWorkspace(b))!;
    expect(ws.hospitals.map((h) => h.code)).toEqual(["CGH"]);
    const all = await b.select("carts");
    expect(new Set(all.map((c) => c.hospital_id)).size).toBe(1);
  });

  it("blocks a stranger from another hospital's data", async () => {
    const b = await seeded();
    await b.signUp("stranger@else.org", "secret12", "Stranger");
    expect(await b.select("carts")).toHaveLength(0);
    const ws = (await api.loadWorkspace(b))!;
    expect(ws.hospitals).toHaveLength(0);
  });
});

describe("checks workflow", () => {
  it("pre-flags expired items and runs draft → submitted → closed", async () => {
    const b = await seeded();
    const { ws, d } = await hospitalFor(b, "CGH");
    const cart = d.carts.find((c) => c.cart_type === "Emergency")!;
    const id = await api.startCheck(b, d, ws.user, cart.id, "monthly", TODAY);
    const { check, lines } = await api.loadCheck(b, id);
    const expected = api.stockRows(d, TODAY).filter((r) => r.cart.id === cart.id);
    expect(lines).toHaveLength(expected.length);
    expect(lines.filter((l) => l.line_status === "expired").length).toBe(expected.filter((r) => r.state === "expired").length);

    await api.submitCheck(b, check, { seal_number: "S-1", remarks: "" });
    // Lines are frozen after submit.
    await expect(api.saveLine(b, lines[0].id, { line_status: "absent" })).rejects.toThrow(/submitted/);
    await api.closeCheck(b, { ...check, status: "submitted" }, ws.user, "Reviewed");
    const after = await api.loadCheck(b, id);
    expect(after.check.status).toBe("closed");
    expect(after.check.reviewed_by_name).toBe("Aisha Rahman");
  });

  it("lets a nurse run checks but not close them or edit cart stock", async () => {
    const b = await seeded();
    await b.signIn("nurse@demo.hospital", api.DEMO_PASSWORD);
    const { ws, d } = await hospitalFor(b, "CGH");
    const id = await api.startCheck(b, d, ws.user, d.carts[0].id, "daily", TODAY);
    const { check } = await api.loadCheck(b, id);
    await api.submitCheck(b, check, { seal_number: "", remarks: "" });
    await expect(api.closeCheck(b, check, ws.user, "")).rejects.toThrow(/close/);
    await expect(api.updateCartItem(b, d.cartItems[0].id, { par_qty: 99 })).rejects.toThrow(/role/);
  });

  it("lets pharmacy restock expiry dates", async () => {
    const b = await seeded();
    await b.signIn("pharmacy@demo.hospital", api.DEMO_PASSWORD);
    const { d } = await hospitalFor(b, "CGH");
    const expired = api.stockRows(d, TODAY).find((r) => r.state === "expired")!;
    await api.updateCartItem(b, expired.cartItem.id, { expiry_date: "2028-01-31", lot_number: "LOT9" });
    const { d: d2 } = await hospitalFor(b, "CGH");
    const row = d2.cartItems.find((c) => c.id === expired.cartItem.id)!;
    expect(row.expiry_date).toBe("2028-01-31");
    expect(row.lot_number).toBe("LOT9");
  });

  it("shows the seeded ICU check as done with one open issue", async () => {
    const b = await seeded();
    const { d } = await hospitalFor(b, "CGH");
    const icu = api.cartSummaries(d, TODAY).find((s) => s.cart.cart_type === "ICU")!;
    expect(icu.lastCheck?.status).toBe("submitted");
    expect(icu.dailyDue).toBe(false);
    expect(icu.openIssues).toBeGreaterThanOrEqual(1);
  });
});

describe("super admin", () => {
  it("is the only one who can create hospitals", async () => {
    const b = await seeded();
    await expect(api.createHospital(b, { name: "Rogue Clinic", code: "RC", starterCarts: false })).rejects.toThrow(/Super admin/);
    await b.signIn(api.DEMO_SUPER.email, api.DEMO_PASSWORD);
    const ws = (await api.loadWorkspace(b))!;
    expect(ws.isSuper).toBe(true);
    expect(ws.hospitals).toHaveLength(2);
    await api.createHospital(b, { name: "North Clinic", code: "NC", starterCarts: false });
    expect((await api.loadWorkspace(b))!.hospitals).toHaveLength(3);
  });

  it("is the only one who can give or change rights", async () => {
    const b = await seeded();
    const { d } = await hospitalFor(b, "CGH");
    expect(d.role).toBe("hospital_admin");
    await expect(api.inviteMember(b, d, "someone@cgh.org", "nurse")).rejects.toThrow(/Super admin/);
    const nurse = d.members.find((m) => m.role === "nurse")!;
    await expect(api.changeRole(b, nurse.id, "hospital_admin")).rejects.toThrow(/Super admin/);
    await expect(api.removeMember(b, nurse.id)).rejects.toThrow(/Super admin/);
  });

  it("adds people by email and they join on next sign-in", async () => {
    const b = await seeded();
    await b.signIn(api.DEMO_SUPER.email, api.DEMO_PASSWORD);
    const { d } = await hospitalFor(b, "RCH");
    await api.inviteMember(b, d, "New.Nurse@Riverside.org", "nurse");
    await b.signUp("new.nurse@riverside.org", "secret12", "New Nurse");
    const ws = (await api.loadWorkspace(b))!;
    expect(ws.hospitals.map((h) => h.code)).toEqual(["RCH"]);
    expect(ws.memberships[0].role).toBe("nurse");
  });
});

describe("csv", () => {
  it("quotes cells and defuses formulas", () => {
    expect(api.toCsv(["a"], [["=1+1"], ['x"y']])).toBe('"a"\r\n"\'=1+1"\r\n"x""y"');
  });
});
