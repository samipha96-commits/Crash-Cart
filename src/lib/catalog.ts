import type { Audience, CheckType, ItemKind, LineStatus, Role } from "./types";

export interface StarterItem {
  code?: string;
  generic?: string;
  name: string;
  kind: ItemKind;
  category: string;
  strength: string;
  /** Floor index (0-3) and par quantity used when seeding a starter cart. */
  floor: number;
  qty: number;
}

/** Standard adult crash-cart contents. Each hospital can edit its own list. */
export const STARTER_ITEMS: StarterItem[] = [
  { code: "CC-M01", name: "Inj. Epinephrine", generic: "Epinephrine (adrenaline)", category: "Emergency drugs", strength: "1 mg/10 mL", kind: "medicine", floor: 0, qty: 10 },
  { code: "CC-M02", name: "Inj. Amiodarone", generic: "Amiodarone", category: "Antiarrhythmic", strength: "150 mg/3 mL", kind: "medicine", floor: 0, qty: 3 },
  { code: "CC-M03", name: "Inj. Atropine", generic: "Atropine sulfate", category: "Emergency drugs", strength: "1 mg/1 mL", kind: "medicine", floor: 0, qty: 3 },
  { code: "CC-M04", name: "Inj. Adenosine", generic: "Adenosine", category: "Antiarrhythmic", strength: "6 mg/2 mL", kind: "medicine", floor: 0, qty: 5 },
  { code: "CC-M05", name: "Inj. Lidocaine 2%", generic: "Lidocaine", category: "Antiarrhythmic", strength: "100 mg/5 mL", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-M06", name: "Inj. Sodium bicarbonate 8.4%", generic: "Sodium bicarbonate", category: "Electrolytes & metabolic", strength: "50 mL", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-M07", name: "Inj. Calcium chloride 10%", generic: "Calcium chloride", category: "Electrolytes & metabolic", strength: "10 mL", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-M08", name: "Inj. Magnesium sulfate", generic: "Magnesium sulfate", category: "Electrolytes & metabolic", strength: "2 g", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-M09", name: "Inj. Dextrose 50%", generic: "Glucose", category: "Electrolytes & metabolic", strength: "50 mL", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-M10", name: "Inj. Naloxone", generic: "Naloxone", category: "Reversal agent", strength: "0.4 mg/1 mL", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-M11", name: "Inj. Norepinephrine", generic: "Norepinephrine (noradrenaline)", category: "Vasopressor", strength: "4 mg/4 mL", kind: "medicine", floor: 0, qty: 2 },
  { code: "CC-A01", name: "Endotracheal tubes (assorted)", generic: "", category: "Airway", strength: "", kind: "surgical", floor: 1, qty: 6 },
  { code: "CC-A02", name: "Laryngoscope with blades", generic: "", category: "Airway", strength: "", kind: "surgical", floor: 1, qty: 1 },
  { code: "CC-A03", name: "Stylet", generic: "", category: "Airway", strength: "", kind: "surgical", floor: 1, qty: 2 },
  { code: "CC-A04", name: "Oropharyngeal airways", generic: "", category: "Airway", strength: "# 2, 3, 4, 5", kind: "surgical", floor: 1, qty: 4 },
  { code: "CC-A05", name: "Bag-valve-mask", generic: "", category: "Airway", strength: "Adult", kind: "surgical", floor: 1, qty: 1 },
  { code: "CC-A06", name: "Suction catheters", generic: "", category: "Airway", strength: "12-18 Fr", kind: "surgical", floor: 1, qty: 4 },
  { code: "CC-V01", name: "IV cannulas (assorted)", generic: "", category: "IV access", strength: "16-24 G", kind: "surgical", floor: 2, qty: 10 },
  { code: "CC-V02", name: "IV administration sets", generic: "", category: "IV access", strength: "", kind: "surgical", floor: 2, qty: 4 },
  { code: "CC-V03", name: "Syringes (assorted)", generic: "", category: "IV access", strength: "1-50 mL", kind: "surgical", floor: 2, qty: 20 },
  { code: "CC-F01", name: "Inf. Normal saline 0.9%", generic: "Sodium chloride", category: "IV fluids", strength: "500 mL", kind: "medicine", floor: 2, qty: 4 },
  { code: "CC-D01", name: "Defibrillator pads", generic: "", category: "Monitoring & defibrillation", strength: "Adult", kind: "surgical", floor: 3, qty: 2 },
  { code: "CC-D02", name: "ECG electrodes", generic: "", category: "Monitoring & defibrillation", strength: "Adult", kind: "surgical", floor: 3, qty: 2 },
  { code: "CC-P01", name: "Sterile gloves", generic: "", category: "PPE", strength: "# 6.5-7.5", kind: "misc", floor: 3, qty: 4 },
  { code: "CC-P02", name: "Gauze pads", generic: "", category: "Dressing", strength: "4 x 4", kind: "misc", floor: 3, qty: 10 },
  { code: "CC-P03", name: "Adhesive tape", generic: "", category: "Dressing", strength: "", kind: "misc", floor: 3, qty: 2 },
];

/** Default item categories; each hospital can type its own too. */
export const DEFAULT_CATEGORIES = [
  "Emergency drugs",
  "Antiarrhythmic",
  "Vasopressor",
  "Reversal agent",
  "Electrolytes & metabolic",
  "IV fluids",
  "Airway",
  "IV access",
  "Monitoring & defibrillation",
  "PPE",
  "Dressing",
  "Other",
];

export const DRAWER_NAMES = ["Floor 1 · Medicines", "Floor 2 · Airway", "Floor 3 · IV access", "Floor 4 · Defib & PPE"];

export const STARTER_CARTS = [
  { name: "ICU Crash Cart", location: "ICU", cart_type: "ICU" },
  { name: "Emergency Crash Cart", location: "Emergency", cart_type: "Emergency" },
  { name: "Ward Crash Cart", location: "Medical ward", cart_type: "Ward" },
];

export const CART_TYPES = ["ICU", "Emergency", "Ward", "Paediatric", "Neonatal", "Operating theatre", "Other"];

export const ROLES: Role[] = ["hospital_admin", "nurse", "nursing_manager", "pharmacy", "pharmacy_manager"];

/** Roles a Hospital admin may create. Everything else is given by the Super admin. */
export const ADMIN_GRANTABLE: Role[] = ["nurse", "pharmacy"];

export const ROLE_LABEL: Record<Role, string> = {
  hospital_admin: "Hospital admin",
  nurse: "Nurse",
  nursing_manager: "Nursing manager",
  pharmacy: "Pharmacist",
  pharmacy_manager: "Pharmacy manager",
};

export const ROLE_HELP: Record<Role, string> = {
  hospital_admin: "Sets the crash cart items of their wards and creates nurse and pharmacist IDs",
  nurse: "One ward: item list (CSV) to check the cart against, updates expiry dates, sees the pharmacy's checks",
  nursing_manager: "Every ward: item lists, expiry dates and the pharmacy's checks",
  pharmacy: "Monthly audits of their wards, closes observations, ward reports",
  pharmacy_manager: "Reviews pharmacists' audits and sees the reports of every ward",
};

/** Roles that hold exactly one ward. */
export const SINGLE_WARD: Role[] = ["nurse"];
/** Roles that always cover every ward. */
export const ALL_WARDS: Role[] = ["nursing_manager", "pharmacy_manager"];

export const CHECK_TYPE_LABEL: Record<CheckType, string> = {
  daily: "Daily seal check",
  monthly: "Monthly full check",
  quarterly: "Quarterly audit",
  after_use: "After a code (restock)",
};

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  present: "OK",
  short: "Short",
  absent: "Missing",
  expired: "Expired",
  near_expiry: "Expiring",
  damaged: "Damaged",
};

export const LINE_STATUSES: LineStatus[] = ["present", "short", "absent", "expired", "near_expiry", "damaged"];

export const KIND_LABEL: Record<string, string> = { medicine: "Medicine", surgical: "Surgical", misc: "Other" };

/** The signed-in person's rights in the current hospital. */
export interface Perm {
  role: Role | null;
  isSuper: boolean;
  /** Carts (wards) they cover; empty means all. */
  wardIds: string[];
}

export function coversWard(p: Perm, cartId: string): boolean {
  return p.isSuper || p.wardIds.length === 0 || p.wardIds.includes(cartId);
}

/** Who can do what. Mirrors the row-level security in supabase/migrations. */
export const can = {
  /** Portal look, wards, hospital settings. */
  manageHospital: (p: Perm) => p.isSuper,
  /** Add or delete wards (carts). */
  manageWards: (p: Perm) => p.isSuper,
  /** Rename a cart, edit its floors and items. */
  setItems: (p: Perm, cartId?: string) =>
    p.isSuper || (p.role === "hospital_admin" && (!cartId || coversWard(p, cartId))),
  /** Update lot and expiry dates (Expiry tab). */
  restock: (p: Perm, cartId?: string) =>
    can.setItems(p, cartId) ||
    ((p.role === "pharmacy" || p.role === "nurse" || p.role === "nursing_manager") && (!cartId || coversWard(p, cartId))),
  /** Start a check. Only pharmacists check carts; nurses check against the CSV item list off the app. */
  runChecks: (p: Perm, cartId?: string) => !p.isSuper && p.role === "pharmacy" && (!cartId || coversWard(p, cartId)),
  /** Close a check of this audience. */
  review: (p: Perm, audience: Audience) =>
    p.isSuper || (audience === "nursing" ? p.role === "nursing_manager" : p.role === "pharmacy_manager"),
  /** Close observations of a pharmacy audit and send it to the Pharmacy manager. */
  closeObservations: (p: Perm, cartId: string) => !p.isSuper && p.role === "pharmacy" && coversWard(p, cartId),
  /** Reports tab. */
  reports: (p: Perm) => p.isSuper || p.role === "pharmacy" || p.role === "pharmacy_manager",
  /** Give people IDs and rights. */
  manageStaff: (p: Perm) => p.isSuper || p.role === "hospital_admin",
  grantableRoles: (p: Perm): Role[] => (p.isSuper ? ROLES : p.role === "hospital_admin" ? ADMIN_GRANTABLE : []),
};

/** Which department a role's checks belong to. */
export function audienceOf(role: Role | null): Audience {
  return role === "pharmacy" || role === "pharmacy_manager" ? "pharmacy" : "nursing";
}
