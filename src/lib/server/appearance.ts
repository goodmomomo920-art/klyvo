"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { invalidateStorefrontCache } from "@/lib/server/storefrontCache";
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  validateAppearanceInput,
} from "@/lib/appearance";
import { AppearanceState, StoreAppearance } from "@/types/appearance";
import { StoreAppearanceRow } from "@/types/database";

/**
 * Server Actions for storefront appearance.
 *
 * - Every read/write is scoped to the session-resolved store id (plus RLS).
 * - Input is validated and normalized by src/lib/appearance.ts before storage:
 *   fixed color/font/section allowlists, http(s) URLs only, plain text stripped
 *   of control characters and angle brackets.
 * - The public storefront only ever reads `published`. Draft edits and previews
 *   never leak to customers.
 */

export type AppearanceResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function fallbackForStore(store: {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}): StoreAppearance {
  return {
    ...DEFAULT_APPEARANCE,
    logoUrl: store.logo_url ?? "",
    primaryColor: store.primary_color || DEFAULT_APPEARANCE.primaryColor,
    secondaryColor: store.secondary_color || DEFAULT_APPEARANCE.secondaryColor,
  };
}

function toState(
  row: StoreAppearanceRow | null,
  fallback: StoreAppearance
): AppearanceState {
  return {
    draft: normalizeAppearance(row?.draft ?? {}, fallback),
    published: row?.published
      ? normalizeAppearance(row.published, fallback)
      : null,
    publishedAt: row?.published_at ?? null,
  };
}

export async function getAuthorizedStoreAppearance(): Promise<
  AppearanceResult<AppearanceState>
> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_appearance")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return {
        success: false,
        error:
          "Store appearance table is missing. Apply migration 20261019000002_store_appearance.sql in Supabase first.",
      };
    }
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: toState(
      (data as StoreAppearanceRow | null) ?? null,
      fallbackForStore(store)
    ),
  };
}

export async function saveAuthorizedAppearanceDraft(
  input: unknown
): Promise<AppearanceResult<AppearanceState>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const checked = validateAppearanceInput(input);
  if (!checked.ok) {
    return { success: false, error: checked.errors.join(" ") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_appearance")
    .upsert(
      { store_id: store.id, draft: checked.value },
      { onConflict: "store_id" }
    )
    .select()
    .single();

  if (error || !data) {
    if (error?.code === "42P01") {
      return {
        success: false,
        error:
          "Store appearance table is missing. Apply migration 20261019000002_store_appearance.sql in Supabase first.",
      };
    }
    return {
      success: false,
      error: error?.message || "Failed to save appearance draft.",
    };
  }

  return {
    success: true,
    data: toState(
      data as StoreAppearanceRow,
      fallbackForStore(store)
    ),
  };
}

/** Publishes the current draft. Customers see the new appearance immediately. */
export async function publishAuthorizedAppearance(): Promise<
  AppearanceResult<AppearanceState>
> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("store_appearance")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();

  if (readError) {
    return { success: false, error: readError.message };
  }

  const fallback = fallbackForStore(store);
  const draft = normalizeAppearance(
    (existing as StoreAppearanceRow | null)?.draft ?? {},
    fallback
  );

  const checked = validateAppearanceInput(draft);
  if (!checked.ok) {
    return { success: false, error: checked.errors.join(" ") };
  }

  const { data, error } = await supabase
    .from("store_appearance")
    .upsert(
      {
        store_id: store.id,
        draft: checked.value,
        published: checked.value,
        published_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    )
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "Failed to publish appearance.",
    };
  }

  invalidateStorefrontCache(store.slug);
  return {
    success: true,
    data: toState(data as StoreAppearanceRow, fallback),
  };
}

/** Reverts unsaved draft edits to the currently published appearance. */
export async function discardAuthorizedAppearanceDraft(): Promise<
  AppearanceResult<AppearanceState>
> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("store_appearance")
    .select("*")
    .eq("store_id", store.id)
    .maybeSingle();

  if (readError) {
    return { success: false, error: readError.message };
  }

  const fallback = fallbackForStore(store);
  const row = (existing as StoreAppearanceRow | null) ?? null;
  const draft = row?.published
    ? normalizeAppearance(row.published, fallback)
    : fallback;

  const { data, error } = await supabase
    .from("store_appearance")
    .upsert({ store_id: store.id, draft }, { onConflict: "store_id" })
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "Failed to discard appearance draft.",
    };
  }

  invalidateStorefrontCache(store.slug);
  return { success: true, data: toState(data as StoreAppearanceRow, fallback) };
}
