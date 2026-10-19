"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/server/authorization";
import { ALLOWED_MEDIA_TYPES, MAX_MEDIA_BYTES, safeMediaPath } from "@/lib/batch3";
export async function listProductMedia(productId: string) { const access = await requirePermission("products.write"); if (!access) return { success: false, error: "You do not have permission to manage media." }; const db = await createClient() as any; const { data, error } = await db.from("product_media").select("*").eq("store_id", access.store.id).eq("product_id", productId).order("position"); return error ? { success: false, error: error.message } : { success: true, data: data ?? [] }; }
export async function uploadProductMedia(productId: string, file: File) {
  const access = await requirePermission("products.write");
  if (!access) return { success: false, error: "You do not have permission to upload media." };
  if (!ALLOWED_MEDIA_TYPES.includes(file.type as never) || file.size <= 0 || file.size > MAX_MEDIA_BYTES) {
    return { success: false, error: "Use a non-empty PNG, JPEG, WebP, or GIF image up to 5 MB." };
  }

  const supabase = await createClient();
  const db = supabase as any;
  const { data: product, error: productError } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", access.store.id)
    .maybeSingle();
  if (productError || !product) return { success: false, error: "Product not found in this store." };

  const path = safeMediaPath(access.store.id, productId, file.name);
  if (!path) return { success: false, error: "Unsupported image extension." };
  const upload = await supabase.storage.from("product-media").upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) return { success: false, error: upload.error.message };

  const record = await db.from("product_media").insert({
    store_id: access.store.id,
    product_id: productId,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
  }).select().single();
  if (record.error) {
    await supabase.storage.from("product-media").remove([path]);
    return { success: false, error: record.error.message };
  }
  return { success: true, data: record.data };
}
export async function removeProductMedia(mediaId: string) { const access = await requirePermission("products.write"); if (!access) return { success: false, error: "You do not have permission to remove media." }; const supabase = await createClient(); const db = supabase as any; const media = await db.from("product_media").select("storage_bucket,storage_path").eq("id", mediaId).eq("store_id", access.store.id).maybeSingle(); if (!media.data) return { success: false, error: "Media not found." }; const removed = await supabase.storage.from(media.data.storage_bucket).remove([media.data.storage_path]); if (removed.error) return { success: false, error: removed.error.message }; const result = await db.from("product_media").delete().eq("id", mediaId).eq("store_id", access.store.id); return result.error ? { success: false, error: result.error.message } : { success: true }; }
