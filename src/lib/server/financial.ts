"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/server/authorization";
import { calculateFinancialMetrics, type FinancialMetrics } from "@/lib/financialReport";

export async function getFinancialReport(from: string, to: string): Promise<{ success: boolean; metrics?: FinancialMetrics; daily?: Array<{ date: string; orders: number; netSales: number }>; error?: string }> {
  const access = await requirePermission("reports.read");
  if (!access) return { success: false, error: "You do not have permission to view financial reports." };
  const db = (await createClient()) as any;
  const { data, error } = await db.from("orders").select("status,subtotal,total,shipping_fee,created_at").eq("store_id", access.store.id).gte("created_at", `${from}T00:00:00.000Z`).lt("created_at", `${to}T00:00:00.000Z`).order("created_at", { ascending: true });
  if (error) return { success: false, error: error.message };
  const orders = data ?? [];
  const metrics = calculateFinancialMetrics(orders);
  const daily = new Map<string, { orders: number; netSales: number }>();
  for (const order of orders) { if (order.status === "Cancelled") continue; const key = String(order.created_at).slice(0, 10); const item = daily.get(key) ?? { orders: 0, netSales: 0 }; item.orders += 1; item.netSales += Number(order.total || 0); daily.set(key, item); }
  return { success: true, metrics, daily: [...daily.entries()].map(([date, value]) => ({ date, ...value })) };
}
