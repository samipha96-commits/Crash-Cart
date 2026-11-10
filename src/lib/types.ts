export type Role = "hospital_admin" | "pharmacy" | "nurse" | "quality" | "manager";
export type ItemKind = "medicine" | "surgical" | "misc";
export type CheckType = "daily" | "monthly" | "quarterly" | "after_use";
export type CheckStatus = "draft" | "submitted" | "closed";
export type LineStatus = "present" | "short" | "absent" | "expired" | "near_expiry" | "damaged";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Hospital {
  id: string;
  name: string;
  code: string;
  near_expiry_days: number;
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
  created_at: string;
}

export interface Invite {
  id: string;
  hospital_id: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface Item {
  id: string;
  hospital_id: string;
  name: string;
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
  status: CheckStatus;
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
  item_name: string;
  strength: string;
  drawer_name: string;
  drawer_order: number;
  par_qty: number;
  found_qty: number | null;
  expiry_date: string | null;
  line_status: LineStatus;
  remarks: string;
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
