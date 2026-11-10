import type { CheckType, ItemKind, LineStatus, Role } from "./types";

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

export const ROLES: Role[] = ["hospital_admin", "pharmacy", "nurse", "quality", "manager"];

export const ROLE_LABEL: Record<Role, string> = {
  hospital_admin: "Hospital admin",
  pharmacy: "Pharmacy",
  nurse: "Nurse",
  quality: "Quality",
  manager: "Manager",
};

export const ROLE_HELP: Record<Role, string> = {
  hospital_admin: "Everything: carts, items, staff, checks and review",
  pharmacy: "Restocks carts (quantity, lot, expiry) and runs checks",
  nurse: "Runs crash cart checks",
  quality: "Runs checks, reviews and closes them",
  manager: "Views everything, reviews and closes checks",
};

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

/** Who can do what. Mirrors the row-level security in supabase/migrations. */
export const can = {
  manageHospital: (r: Role | null) => r === "hospital_admin",
  manageCarts: (r: Role | null) => r === "hospital_admin",
  restock: (r: Role | null) => r === "hospital_admin" || r === "pharmacy",
  runChecks: (r: Role | null) => r === "hospital_admin" || r === "pharmacy" || r === "nurse" || r === "quality",
  review: (r: Role | null) => r === "hospital_admin" || r === "quality" || r === "manager",
};
