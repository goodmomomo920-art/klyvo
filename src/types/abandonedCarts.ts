/**
 * Abandoned-cart lifecycle types, mirroring public.carts,
 * public.abandoned_cart_settings, and the RPC projections from migration
 * 20261018000000_analytics_carts_loyalty.sql.
 *
 * Lifecycle: 'active' -> 'abandoned' (idle beyond the store's configured
 * inactivity threshold) -> 'converted' ( resulted in a real order, verified
 * server-side). An 'abandoned' cart that resumes activity returns to 'active'.
 * Stored items are VALID, ACTIVE catalog products of the cart's store only —
 * token hashes never leave the server, and no customer PII is stored at all.
 */

export type CartLifecycleStatus = "active" | "abandoned" | "converted";

export interface CartStoredItem {
  product_id: string;
  quantity: number;
}

export interface AbandonedCartListItem {
  id: string;
  status: CartLifecycleStatus;
  /** Total units across all cart lines. */
  item_count: number;
  /** Catalog-derived current value (never a client-supplied number). */
  estimated_value: number;
  items: CartStoredItem[] | null;
  first_seen_at: string;
  last_activity_at: string;
  abandoned_at: string | null;
  restored_at: string | null;
  converted_at: string | null;
  /** Real order number of the converting order, when converted. */
  converted_order_number: string | null;
}

/** Sync payload shape used both by the client and the sync RPC. */
export interface CartSyncItem {
  product_id: string;
  quantity: number;
}

export interface AbandonedCartsStats {
  active_count: number;
  abandoned_count: number;
  converted_count: number;
  active_value: number;
  abandoned_value: number;
  converted_value: number;
}

export interface AbandonedCartsOverview {
  store: {
    name: string;
    slug: string;
    currency: string;
  };
  config: {
    tracking_enabled: boolean;
    inactivity_hours: number;
  };
  stats: AbandonedCartsStats;
  carts: AbandonedCartListItem[];
}

export interface RestoredStorefrontItem {
  /** Namespaced storefront cart id ("<slug>:<product uuid>"). */
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  stock: number;
}
