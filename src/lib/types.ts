/**
 * Roles inside a hospital. The Super admin is not a role: it is the platform
 * owner (see Workspace.isSuper).
 *  - hospital_admin    sets up crash cart items for its wards, creates nurses and pharmacists
 *  - nurse             assesses the cart of one ward; reports go to nursing only
 *  - nursing_manager   reviews and closes nurses' checks (all wards)
 *  - pharmacy          pharmacist: monthly audits for its wards, closes observations, reports
 *  - pharmacy_manager  reviews pharmacists' audits; reports for every ward (was "Quality")
 */
export type Role = "hospital_admin" | "nurse" | "nursing_manager" | "pharmacy" | "pharmacy_manager";
/** Who a check belongs to: nurses' checks stay inside nursing, pharmacist audits inside pharmacy. */
export type Audience = "nursing" | "pharmacy";
export type ItemKind = "medicine" | "surgical" | "misc";
export type CheckType = "daily" | "monthly" | "quarterly" | "after_use";
/** draft → submitted → (pharmacy audits: in_review, observations closed) → closed */
export type CheckStatus = "draft" | "submitted" | "in_review" | "closed";
export type LineStatus = "present" | "short" | "absent" | "expired" | "near_expiry" | "damaged";

export interface User {
  id: string;
  email: string;
  name: string;
}

export type ThemePreset = "teal" | "navy" | "crimson" | "emerald" | "plum" | "amber" | "slate";

/** Look and feel of a hospital's portal, set by the Super admin. */
/** Whole-portal UI designs: layout, navigation, cards, type and shape together. */
export type DesignStyle = "classic" | "clinical" | "modern" | "friendly" | "executive";

export interface HospitalTheme {
  /** Colour palette. */
  preset?: ThemePreset;
  /** Custom brand colour (#rrggbb); overrides the preset's main colour. */
  primary?: string;
  /** UI design; the fields below override single parts of it. */
  design?: DesignStyle;
  /** Navigation: a side bar, or a bar across the top (desktop). */
  layout?: "sidebar" | "topnav";
  /** Navigation colour. */
  nav?: "light" | "brand" | "dark";
  /** Card style. */
  cards?: "elevated" | "outlined" | "flat";
  /** Body typeface. */
  font?: "outfit" | "inter" | "plex" | "nunito";
  /** Corner style of cards and buttons. */
  corners?: "round" | "rounded" | "soft" | "square";
  /** Spacing of lists and cards. */
  density?: "comfortable" | "compact";
  /** Heading typeface. */
  headings?: "serif" | "sans";
}

export interface Hospital {
  id: string;
  name: string;
  code: string;
  near_expiry_days: number;
  theme: HospitalTheme;
  /** Logo as a small data: URL (or https URL); empty when none. */
  logo_url: string;
  /** Shown in the header of every report. */
  address: string;
  phone: string;
  email: string;
  created_by: string;
  created_at: string;
}

export interface Membership {
  id: string;
  hospital_id: string;
  user_id: string;
  email: string;
  name: string;
  role: Role;
  /** Carts (wards) this person works on; empty means every ward. */
  ward_ids: string[];
  created_at: string;
}

export interface Invite {
  id: string;
  hospital_id: string;
  email: string;
  role: Role;
  ward_ids: string[];
  created_at: string;
}

export interface Item {
  id: string;
  hospital_id: string;
  /** Hospital's own item code. */
  code: string;
  /** Description, e.g. "INJ: ATROPINE". */
  name: string;
  /** Generic name. */
  generic: string;
  kind: ItemKind;
  category: string;
  strength: string;
  is_active: boolean;
  created_at: string;
}

export interface Cart {
  id: string;
  hospital_id: string;
  name: string;
  location: string;
  cart_type: string;
  seal_number: string;
  created_at: string;
}

export interface Drawer {
  id: string;
  hospital_id: string;
  cart_id: string;
  sort_order: number;
  name: string;
}

export interface CartItem {
  id: string;
  hospital_id: string;
  cart_id: string;
  drawer_id: string;
  item_id: string;
  par_qty: number;
  lot_number: string;
  /** YYYY-MM-DD or null when the item has no expiry. */
  expiry_date: string | null;
  updated_at: string;
}

export interface Check {
  id: string;
  hospital_id: string;
  cart_id: string;
  check_type: CheckType;
  audience: Audience;
  status: CheckStatus;
  /** Items not OK when the check was submitted. */
  issue_count: number;
  performed_by: string;
  performed_by_name: string;
  seal_number: string;
  remarks: string;
  review_notes: string;
  reviewed_by_name: string;
  created_at: string;
  submitted_at: string | null;
  closed_at: string | null;
}

export interface CheckLine {
  id: string;
  hospital_id: string;
  check_id: string;
  cart_item_id: string | null;
  item_code: string;
  item_name: string;
  strength: string;
  drawer_name: string;
  drawer_order: number;
  par_qty: number;
  found_qty: number | null;
  expiry_date: string | null;
  line_status: LineStatus;
  remarks: string;
  /** Pharmacist's follow-up on an observation (an item that wasn't OK). */
  obs_action: string;
  obs_closed: boolean;
}

export interface Tables {
  hospitals: Hospital;
  memberships: Membership;
  invites: Invite;
  items: Item;
  carts: Cart;
  drawers: Drawer;
  cart_items: CartItem;
  checks: Check;
  check_lines: CheckLine;
}

export type TableName = keyof Tables;
