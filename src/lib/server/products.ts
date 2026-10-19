"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { Product, ProductFormData } from "@/types/product";
import { ProductRow } from "@/types/database";
import { invalidateStorefrontCache } from "@/lib/server/storefrontCache";

/**
 * Maps a database product row to the application Product domain model.
 */
function mapProductRowToProduct(
  row: ProductRow,
  variantCount = 0
): Product {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    nameAr: row.name_ar ?? undefined,
    nameEn: row.name_en ?? undefined,
    sku: row.sku,
    description: row.description ?? "",
    category: row.category,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price ? Number(row.compare_at_price) : undefined,
    stock: row.stock,
    imageUrl: row.image_url ?? undefined,
    status: row.status,
    variantCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Server Action: Fetches all catalog products for the authenticated merchant's store.
 * Resolves the store ID server-side; rejects unauthenticated calls.
 */
export async function getAuthorizedStoreProducts(): Promise<{
  success: boolean;
  data?: Product[];
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  // Variant counts let the dashboard show the derived-stock state without
  // loading every option/value row. Failures fall back to 0 (simple product).
  const variantCounts = new Map<string, number>();
  const { data: variantRows, error: variantError } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("store_id", store.id);

  if (!variantError && Array.isArray(variantRows)) {
    for (const row of variantRows as Array<{ product_id: string }>) {
      variantCounts.set(row.product_id, (variantCounts.get(row.product_id) ?? 0) + 1);
    }
  }

  return {
    success: true,
    data: (data as ProductRow[]).map((row) =>
      mapProductRowToProduct(row, variantCounts.get(row.id) ?? 0)
    ),
  };
}

/**
 * Server Action: Creates a new product strictly within the authenticated merchant's store.
 * The store_id is NEVER accepted from the client; it is retrieved solely from the session.
 */
export async function createAuthorizedStoreProduct(
  formData: ProductFormData
): Promise<{
  success: boolean;
  data?: Product;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();

  const insertPayload = {
    store_id: store.id,
    name: formData.name.trim(),
    name_ar: formData.nameAr?.trim() || null,
    name_en: formData.nameEn?.trim() || null,
    sku: formData.sku.trim(),
    description: formData.description?.trim() || "",
    category: formData.category,
    price: formData.price,
    compare_at_price: formData.compareAtPrice ?? null,
    stock: formData.stock,
    image_url: formData.imageUrl?.trim() || null,
    status: formData.status,
  };

  const { data, error } = await supabase
    .from("products")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);

  return {
    success: true,
    data: mapProductRowToProduct(data as ProductRow),
  };
}

/**
 * Server Action: Updates an existing product belonging to the authenticated merchant's store.
 * Explicitly guards against cross-tenant modification using store_id in the query filter.
 */
export async function updateAuthorizedStoreProduct(
  productId: string,
  formData: Partial<ProductFormData>
): Promise<{
  success: boolean;
  data?: Product;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {};
  if (formData.name !== undefined) updatePayload.name = formData.name.trim();
  if (formData.nameAr !== undefined) updatePayload.name_ar = formData.nameAr.trim();
  if (formData.nameEn !== undefined) updatePayload.name_en = formData.nameEn.trim();
  if (formData.sku !== undefined) updatePayload.sku = formData.sku.trim();
  if (formData.description !== undefined) updatePayload.description = formData.description.trim();
  if (formData.category !== undefined) updatePayload.category = formData.category;
  if (formData.price !== undefined) updatePayload.price = formData.price;
  if (formData.compareAtPrice !== undefined) updatePayload.compare_at_price = formData.compareAtPrice;
  // Variant products derive stock from active variants (DB trigger); writing
  // products.stock here would create a conflicting stock source.
  const { count: existingVariantCount } = await supabase
    .from("product_variants")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("product_id", productId);

  if (formData.stock !== undefined && !existingVariantCount) {
    updatePayload.stock = formData.stock;
  }
  if (formData.imageUrl !== undefined) updatePayload.image_url = formData.imageUrl.trim() || null;
  if (formData.status !== undefined) updatePayload.status = formData.status;

  const { data, error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", productId)
    .eq("store_id", store.id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);

  return {
    success: true,
    data: mapProductRowToProduct(data as ProductRow, existingVariantCount ?? 0),
  };
}

/**
 * Server Action: Deletes a product belonging to the authenticated merchant's store.
 * Cross-tenant deletion is prevented both by the query condition and RLS.
 */
export async function deleteAuthorizedStoreProduct(
  productId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("store_id", store.id);

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateStorefrontCache(store.slug);

  return { success: true };
}
