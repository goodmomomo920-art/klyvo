import { createClient } from "@/lib/supabase/server";
import { StoreRow } from "@/types/database";
import { cache } from "react";

/**
 * Generates a clean URL slug from store name or email prefix.
 * Shared with the Store Settings server actions for consistent normalization.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Retrieves the verified store belonging to the authenticated merchant.
 * If the merchant has not yet created a store, automatically bootstraps an initial
 * default store for their account using their authenticated user session.
 *
 * Security: Uses the authenticated server Supabase client. Row Level Security guarantees
 * that merchants can only access or create stores where owner_id matches their own auth.uid().
 */
export const getAuthorizedStore = cache(async (): Promise<StoreRow | null> => {
  const supabase = await createClient();

  const { data: claimsResult, error: authError } = await supabase.auth.getClaims();
  const claims = claimsResult?.claims;

  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (authError || !userId) {
    return null;
  }

  // 1. Check if the user already has a store
  const { data: existingStores, error: queryError } = await supabase
    .from("stores")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (queryError) {
    console.error("Error querying merchant stores:", queryError.message);
    return null;
  }

  if (existingStores && existingStores.length > 0) {
    return existingStores[0] as StoreRow;
  }

  // 2. Bootstrap initial store for new merchant if none exists
  const merchantName =
    (typeof claims?.email === "string" ? claims.email.split("@")[0] : null) ||
    "my-store";

  const baseSlug = slugify(merchantName) || `store-${userId.slice(0, 6)}`;
  const uniqueSlug = `${baseSlug}-${userId.slice(0, 4)}`;

  const newStore = {
    owner_id: userId,
    name: merchantName,
    slug: uniqueSlug,
    currency: "EGP",
  };

  const { data: createdStore, error: createError } = await supabase
    .from("stores")
    .insert(newStore)
    .select()
    .single();

  if (createError) {
    console.error("Error creating initial merchant store:", createError.message);
    return null;
  }

  return createdStore as StoreRow;
});
