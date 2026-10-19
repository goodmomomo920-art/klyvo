"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/server/authorization";

const missing = "Inventory migration 20261020000000_batch2_operations.sql is required in Supabase.";
export type InventoryFilters = { search?: string; status?: "all" | "in_stock" | "low_stock" | "out_of_stock"; page?: number; pageSize?: number };

export async function getInventory(filters: InventoryFilters = {}) {
  const access = await requirePermission("inventory.read"); if (!access) return { success: false, error: "You do not have permission to view inventory." };
  const supabase = await createClient(); const db = supabase as any;
  const thresholdResult = await db.from("inventory_settings").select("low_stock_threshold").eq("store_id", access.store.id).maybeSingle();
  const threshold = Number(thresholdResult.data?.low_stock_threshold ?? 5);
  const page = Math.max(1, filters.page ?? 1); const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const { data, error, count } = await db.from("products").select("id,name,name_ar,name_en,sku,stock,price,status", { count: "exact" }).eq("store_id", access.store.id).order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message.includes("does not exist") ? missing : error.message };
  const rows = (data ?? []).filter((row: any) => { const term = filters.search?.trim().toLowerCase(); if (term && ![row.name,row.name_ar,row.name_en,row.sku].filter(Boolean).some((v: string) => v.toLowerCase().includes(term))) return false; const status = Number(row.stock) <= 0 ? "out_of_stock" : Number(row.stock) <= threshold ? "low_stock" : "in_stock"; return !filters.status || filters.status === "all" || status === filters.status; });
  return { success: true, data: rows.slice((page - 1) * pageSize, page * pageSize).map((row: any) => ({ ...row, stock: Number(row.stock), stockStatus: Number(row.stock) <= 0 ? "out_of_stock" : Number(row.stock) <= threshold ? "low_stock" : "in_stock" })), total: count ?? rows.length, threshold, page, pageSize };
}

export async function setInventoryThreshold(value: number) { const access = await requirePermission("inventory.write"); if (!access) return { success: false, error: "You do not have permission to change inventory settings." }; if (!Number.isInteger(value) || value < 0 || value > 1000000) return { success: false, error: "Threshold must be a whole number from 0 to 1,000,000." }; const db = (await createClient()) as any; const { error } = await db.from("inventory_settings").upsert({ store_id: access.store.id, low_stock_threshold: value }, { onConflict: "store_id" }); return { success: !error, error: error?.message.includes("does not exist") ? missing : error?.message };
}

export async function recordInventoryMovement(input: { productId?: string; variantId?: string; movementType: "receipt" | "adjustment" | "order" | "return" | "correction"; quantityChange: number; reason: string; idempotencyKey: string }) {
  const access = await requirePermission("inventory.write"); if (!access) return { success: false, error: "You do not have permission to change inventory." }; if ((!input.productId) === (!input.variantId) || !Number.isInteger(input.quantityChange) || input.quantityChange === 0 || !input.reason.trim() || !input.idempotencyKey.trim()) return { success: false, error: "A valid item, non-zero quantity, reason, and idempotency key are required." };
  const db = (await createClient()) as any; const { error } = await db.from("inventory_movements").insert({ store_id: access.store.id, product_id: input.productId ?? null, variant_id: input.variantId ?? null, movement_type: input.movementType, quantity_change: input.quantityChange, reason: input.reason.trim(), idempotency_key: input.idempotencyKey.trim(), responsible_user_id: access.user.id });
  if (error) return { success: false, error: error.message.includes("does not exist") ? missing : error.message.includes("duplicate") ? "This movement was already recorded." : error.message }; return { success: true };
}

export async function getInventoryMovements(itemId?: string) { const access = await requirePermission("inventory.read"); if (!access) return { success: false, error: "You do not have permission to view inventory." }; const db = (await createClient()) as any; let query = db.from("inventory_movements").select("id,product_id,variant_id,movement_type,quantity_change,reason,responsible_user_id,created_at").eq("store_id", access.store.id).order("created_at", { ascending: false }).limit(100); if (itemId) query = query.or(`product_id.eq.${itemId},variant_id.eq.${itemId}`); const { data, error } = await query; return error ? { success: false, error: error.message.includes("does not exist") ? missing : error.message } : { success: true, data: data ?? [] }; }
