"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";

export const ROLES = ["owner", "store_admin", "orders_manager", "product_inventory_manager", "marketing_manager", "read_only_analyst"] as const;
export type TeamRole = typeof ROLES[number];
export type Permission = "inventory.read" | "inventory.write" | "orders.read" | "orders.write" | "products.write" | "customers.read" | "customers.write" | "reports.read" | "team.manage" | "marketing.write";

const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  owner: ["inventory.read","inventory.write","orders.read","orders.write","products.write","customers.read","customers.write","reports.read","team.manage","marketing.write"],
  store_admin: ["inventory.read","inventory.write","orders.read","orders.write","products.write","customers.read","customers.write","reports.read","team.manage","marketing.write"],
  orders_manager: ["orders.read","orders.write","customers.read","customers.write"],
  product_inventory_manager: ["inventory.read","inventory.write","products.write","reports.read"],
  marketing_manager: ["customers.read","reports.read","marketing.write"],
  read_only_analyst: ["inventory.read","orders.read","customers.read","reports.read"],
};

export async function getAuthorizedMembership() {
  const store = await getAuthorizedStore();
  if (!store) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (store.owner_id === user.id) return { store, user, role: "owner" as TeamRole };
  const { data } = await (supabase as any).from("team_members").select("role,status").eq("store_id", store.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!data || !ROLES.includes(data.role as TeamRole)) return null;
  return { store, user, role: data.role as TeamRole };
}

export async function requirePermission(permission: Permission) {
  const membership = await getAuthorizedMembership();
  if (!membership || !ROLE_PERMISSIONS[membership.role].includes(permission)) return null;
  return membership;
}

