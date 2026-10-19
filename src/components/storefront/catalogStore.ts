"use client";

import { createClient } from "@/lib/supabase/client";
import { PublicProduct } from "@/types/storefront";
import type { ProductOption, PublicVariant } from "@/types/variants";

/**
 * External catalog store for the public storefront.
 *
 * The public catalog RPC is an external system, so the catalog data lives
 * outside React: this module owns the snapshots, the in-flight request
 * versioning (no stale overwrites), and listener notifications. Components
 * read it through useSyncExternalStore — no setState inside effects.
 */

export interface CatalogSnapshot {
  status: "loading" | "ready" | "error";
  products: PublicProduct[];
  total: number;
  page: number;
  hasMore: boolean;
}

const LOADING_SNAPSHOT: CatalogSnapshot = {
  status: "loading",
  products: [],
  total: 0,
  page: 1,
  hasMore: false,
};

const CATALOG_PAGE_SIZE = 12;

const snapshots = new Map<string, CatalogSnapshot>();
const listeners = new Set<() => void>();
let activeRequestVersion = 0;

function catalogKey(slug: string, search: string, category: string | null): string {
  return `${slug}|${search}|${category ?? ""}`;
}

function subscribeCatalog(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

function readCatalog(key: string): CatalogSnapshot {
  let snapshot = snapshots.get(key);
  if (!snapshot) {
    snapshot = LOADING_SNAPSHOT;
    snapshots.set(key, snapshot);
  }
  return snapshot;
}

function publish(key: string, snapshot: CatalogSnapshot): void {
  snapshots.set(key, snapshot);
  for (const notify of listeners) notify();
}

function mapOptions(raw: unknown): ProductOption[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((option, index) => ({
      id: String(option.id),
      name: String(option.name ?? ""),
      position: Number(option.position ?? index),
      values: Array.isArray(option.values)
        ? (option.values as Array<Record<string, unknown>>).map((value, valueIndex) => ({
            id: String(value.id),
            optionId: String(option.id),
            value: String(value.value ?? ""),
            position: valueIndex,
          }))
        : [],
    }))
    .filter((option) => /^[0-9a-fA-F-]{36}$/.test(option.id));
}

function mapVariants(raw: unknown): PublicVariant[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((variant) => ({
      id: String(variant.id),
      sku: String(variant.sku ?? ""),
      price: Number(variant.price ?? 0),
      stock: Number(variant.stock ?? 0),
      optionValueIds: Array.isArray(variant.option_value_ids)
        ? (variant.option_value_ids as unknown[]).map(String)
        : [],
    }))
    .filter(
      (variant) =>
        /^[0-9a-fA-F-]{36}$/.test(variant.id) &&
        variant.optionValueIds.length > 0
    );
}

function mapProducts(products: unknown): PublicProduct[] {
  if (!Array.isArray(products)) return [];
  return (products as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? "Product"),
    nameAr: (p.name_ar as string | null) ?? null,
    nameEn: (p.name_en as string | null) ?? null,
    description: String(p.description ?? ""),
    category: String(p.category ?? "General Merchandise"),
    price: Number(p.price ?? 0),
    compareAtPrice: p.compare_at_price == null ? null : Number(p.compare_at_price),
    stock: Number(p.stock ?? 0),
    imageUrl: (p.image_url as string | null) ?? null,
    hasVariants: Boolean(p.has_variants),
    options: mapOptions(p.options),
    variants: mapVariants(p.variants),
    ratingAverage: Number(p.rating_average ?? 0),
    reviewCount: Number(p.review_count ?? 0),
  }));
}

/**
 * Issues a catalog query for the given inputs. The newest request always wins;
 * superseded responses are discarded (no setState anywhere — React subscribes
 * to the snapshot).
 */
export function requestCatalog(
  slug: string,
  page: number,
  search: string | null,
  category: string | null
): void {
  const key = catalogKey(slug, search ?? "", category);
  const myVersion = ++activeRequestVersion;

  readCatalog(key); // ensure a snapshot exists

  // Wrap the PostgREST PromiseLike in a real Promise so .catch chains typecheck.
  Promise.resolve(
    createClient().rpc("get_public_store_products", {
      p_slug: slug,
      p_page: page,
      p_page_size: 12,
      p_search: search || null,
      p_category: category || null,
      p_product_id: null,
    })
  )
    .then(({ data, error }) => {
      if (myVersion !== activeRequestVersion) return; // superseded by a newer query
      if (error) {
        publish(key, { ...LOADING_SNAPSHOT, status: "error" });
        return;
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      const products = mapProducts(payload.products);
      const total = Number(payload.total ?? products.length);

      // A deep page for a filter combination with fewer pages would show an
      // empty dead-end; clamp to the last valid page and re-query.
      if (products.length === 0 && total > 0) {
        const lastPage = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
        if (page > lastPage) {
          publish(key, { ...LOADING_SNAPSHOT });
          requestCatalog(slug, lastPage, search, category);
          return;
        }
      }

      publish(key, {
        status: "ready",
        products,
        total,
        page: Number(payload.page ?? page),
        hasMore: Boolean(payload.has_more),
      });
    })
    .catch(() => {
      if (myVersion !== activeRequestVersion) return;
      publish(key, { ...LOADING_SNAPSHOT, status: "error" });
    });
}

export const SUBSCRIBE_CATALOG = subscribeCatalog;
export const READ_CATALOG = readCatalog;
export const LOADING_CATALOG_SNAPSHOT = LOADING_SNAPSHOT;
export function makeCatalogKey(slug: string, search: string, category: string | null): string {
  return catalogKey(slug, search, category);
}
