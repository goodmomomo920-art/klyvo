"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { EGYPT_GOVERNORATES, isEgyptGovernorate } from "@/lib/shipping";
import { ShippingZone, ShippingZoneInput } from "@/types/shipping";
import { ShippingZoneRow } from "@/types/database";
import { invalidateStorefrontCache } from "@/lib/server/storefrontCache";

/**
 * Server Actions for Egyptian shipping zones.
 *
 * Security:
 * - Store id is derived from the verified session; every query filters store_id
 *   and RLS enforces the same isolation.
 * - Fees and thresholds are validated server-side and bounded. The storefront
 *   never submits a shipping fee — the checkout RPC re-reads the selected zone.
 * - This configures delivery areas only. No courier integration is implemented.
 */

const MAX_FEE = 999999.99;
const GOVERNORATE_SET = new Set<string>(EGYPT_GOVERNORATES);

export type ShippingResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function mapZone(row: ShippingZoneRow): ShippingZone {
  return {
    id: row.id,
    governorate: row.governorate as ShippingZone["governorate"],
    area: row.area,
    fee: Number(row.fee),
    freeShippingThreshold:
      row.free_shipping_threshold === null
        ? null
        : Number(row.free_shipping_threshold),
    isActive: row.is_active,
    position: row.position,
  };
}

function validateZone(
  input: ShippingZoneInput
): { ok: true; value: Omit<ShippingZoneInput, "id"> } | { ok: false; error: string } {
  const governorate = (input.governorate ?? "").trim();
  if (!GOVERNORATE_SET.has(governorate) || !isEgyptGovernorate(governorate)) {
    return { ok: false, error: "Choose a valid Egyptian governorate." };
  }

  const area = (input.area ?? "").trim() || "All areas";
  if (area.length > 120) {
    return { ok: false, error: "Delivery area name cannot exceed 120 characters." };
  }

  const fee = Number(input.fee);
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_FEE) {
    return {
      ok: false,
      error: "Shipping fee must be a number between 0 and 999,999.99 EGP.",
    };
  }

  let threshold: number | null = null;
  if (input.freeShippingThreshold !== null && input.freeShippingThreshold !== undefined) {
    const parsed = Number(input.freeShippingThreshold);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_FEE) {
      return {
        ok: false,
        error: "Free shipping threshold must be between 0 and 999,999.99 EGP.",
      };
    }
    threshold = Math.round(parsed * 100) / 100;
  }

  const position = Number.isFinite(input.position) ? Math.max(0, Math.trunc(input.position as number)) : 0;

  return {
    ok: true,
    value: {
      governorate,
      area,
      fee: Math.round(fee * 100) / 100,
      freeShippingThreshold: threshold,
      isActive: Boolean(input.isActive),
      position,
    },
  };
}

export async function getAuthorizedShippingZones(): Promise<ShippingResult<ShippingZone[]>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_zones")
    .select("*")
    .eq("store_id", store.id)
    .order("governorate", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    if (error.code === "42P01") {
      return {
        success: false,
        error:
          "Shipping zones table is missing. Apply migration 20261019000001_shipping_zones.sql in Supabase first.",
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: (data as ShippingZoneRow[]).map(mapZone) };
}

export async function createAuthorizedShippingZone(
  input: ShippingZoneInput
): Promise<ShippingResult<ShippingZone>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const checked = validateZone(input);
  if (!checked.ok) return { success: false, error: checked.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_zones")
    .insert({
      store_id: store.id,
      governorate: checked.value.governorate,
      area: checked.value.area,
      fee: checked.value.fee,
      free_shipping_threshold: checked.value.freeShippingThreshold,
      is_active: checked.value.isActive,
      position: checked.value.position ?? 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        error: `A delivery area named "${checked.value.area}" already exists for ${checked.value.governorate}.`,
      };
    }
    if (error.code === "42P01") {
      return {
        success: false,
        error:
          "Shipping zones table is missing. Apply migration 20261019000001_shipping_zones.sql in Supabase first.",
      };
    }
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: mapZone(data as ShippingZoneRow) };
}

export async function updateAuthorizedShippingZone(
  zoneId: string,
  input: ShippingZoneInput
): Promise<ShippingResult<ShippingZone>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const checked = validateZone(input);
  if (!checked.ok) return { success: false, error: checked.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_zones")
    .update({
      governorate: checked.value.governorate,
      area: checked.value.area,
      fee: checked.value.fee,
      free_shipping_threshold: checked.value.freeShippingThreshold,
      is_active: checked.value.isActive,
      position: checked.value.position ?? 0,
    })
    .eq("id", zoneId)
    .eq("store_id", store.id)
    .select()
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        success: false,
        error: `A delivery area named "${checked.value.area}" already exists for ${checked.value.governorate}.`,
      };
    }
    return { success: false, error: error?.message || "Failed to update delivery area." };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: mapZone(data as ShippingZoneRow) };
}

export async function setAuthorizedShippingZoneActive(
  zoneId: string,
  isActive: boolean
): Promise<ShippingResult<ShippingZone>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_zones")
    .update({ is_active: Boolean(isActive) })
    .eq("id", zoneId)
    .eq("store_id", store.id)
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "Failed to update delivery area status.",
    };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: mapZone(data as ShippingZoneRow) };
}

export async function deleteAuthorizedShippingZone(
  zoneId: string
): Promise<ShippingResult<undefined>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shipping_zones")
    .delete()
    .eq("id", zoneId)
    .eq("store_id", store.id);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: undefined };
}
