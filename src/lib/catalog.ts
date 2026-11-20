import type { Audience, CheckType, ItemKind, LineStatus, Role } from "./types";

export interface StarterItem {
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
  { name: "Epinephrine", kind: "medicine", category: "ACLS", strength: "1 mg/10 mL", floor: 0, qty: 10 },
  { name: "Amiodarone", kind: "medicine", category: "ACLS", strength: "150 mg/3 mL", floor: 0, qty: 3 },
  { name: "Atropine", kind: "medicine", category: "ACLS", strength: "1 mg", floor: 0, qty: 3 },
  { name: "Adenosine", kind: "medicine", category: "ACLS", strength: "6 mg/2 mL", floor: 0, qty: 5 },
  { name: "Lidocaine", kind: "medicine", category: "ACLS", strength: "100 mg", floor: 0, qty: 2 },
  { name: "Sodium bicarbonate", kind: "medicine", category: "ACLS", strength: "8.4% 50 mL", floor: 0, qty: 2 },
  { name: "Calcium chloride", kind: "medicine", category: "ACLS", strength: "10% 10 mL", floor: 0, qty: 2 },
  { name: "Magnesium sulfate", kind: "medicine", category: "ACLS", strength: "2 g", floor: 0, qty: 2 },
  { name: "Dextrose", kind: "medicine", category: "Metabolic", strength: "50% 50 mL", floor: 0, qty: 2 },
  { name: "Naloxone", kind: "medicine", category: "Reversal", strength: "0.4 mg", floor: 0, qty: 2 },
  { name: "Norepinephrine", kind: "medicine", category: "Vasopressor", strength: "4 mg", floor: 0, qty: 2 },
  { name: "Endotracheal tubes (assorted)", kind: "surgical", category: "Airway", strength: "", floor: 1, qty: 6 },
  { name: "Laryngoscope with blades", kind: "surgical", category: "Airway", strength: "", floor: 1, qty: 1 },
  { name: "Stylet", kind: "surgical", category: "Airway", strength: "", floor: 1, qty: 2 },
  { name: "Oropharyngeal airways", kind: "surgical", category: "Airway", strength: "", floor: 1, qty: 4 },
  { name: "Bag-valve-mask", kind: "surgical", category: "Airway", strength: "", floor: 1, qty: 1 },
  { name: "Suction catheters", kind: "surgical", category: "Airway", strength: "", floor: 1, qty: 4 },
  { name: "IV cannulas (assorted)", kind: "surgical", category: "Access", strength: "", floor: 2, qty: 10 },
  { name: "IV administration sets", kind: "surgical", category: "Access", strength: "", floor: 2, qty: 4 },
  { name: "Syringes (assorted)", kind: "surgical", category: "Access", strength: "", floor: 2, qty: 20 },
  { name: "Normal saline", kind: "medicine", category: "Fluid", strength: "500 mL", floor: 2, qty: 4 },
  { name: "Defibrillator pads", kind: "surgical", category: "Defib", strength: "", floor: 3, qty: 2 },
  { name: "ECG electrodes", kind: "surgical", category: "Defib", strength: "", floor: 3, qty: 2 },
  { name: "Sterile gloves", kind: "misc", category: "PPE", strength: "", floor: 3, qty: 4 },
  { name: "Gauze pads", kind: "misc", category: "Dressing", strength: "", floor: 3, qty: 10 },
  { name: "Adhesive tape", kind: "misc", category: "Dressing", strength: "", floor: 3, qty: 2 },
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
  nurse: "Assesses the crash cart of one ward; the report goes to the nursing manager only",
  nursing_manager: "Reviews and closes nurses' checks for every ward",
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
  /** Update lot and expiry when stock is replaced. */
  restock: (p: Perm, cartId?: string) =>
    can.setItems(p, cartId) || (p.role === "pharmacy" && (!cartId || coversWard(p, cartId))),
  /** Start a check: nurses assess their ward, pharmacists audit theirs. */
  runChecks: (p: Perm, cartId?: string) =>
    !p.isSuper && (p.role === "nurse" || p.role === "pharmacy") && (!cartId || coversWard(p, cartId)),
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
