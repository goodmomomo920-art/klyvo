/**
 * Product variant domain types (migration 20261019000000_product_variants.sql).
 *
 * A product WITH variants uses the sum of active variant stock as its own stock
 * (derived in the database). A product WITHOUT variants keeps using
 * products.stock exactly as before.
 */

export interface ProductOptionValue {
  id: string;
  optionId: string;
  value: string;
  position: number;
}

export interface ProductOption {
  id: string;
  name: string;
  position: number;
  values: ProductOptionValue[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  /** NULL means the variant inherits the product price. */
  price: number | null;
  stock: number;
  isActive: boolean;
  optionValueIds: string[];
}

export interface ProductVariantsBundle {
  options: ProductOption[];
  variants: ProductVariant[];
}

/** Payload accepted by the dashboard "save variants" server action. */
export interface VariantOptionInput {
  id?: string;
  name: string;
  values: Array<{ id?: string; value: string }>;
}

export interface VariantInput {
  id?: string;
  sku: string;
  price: number | null;
  stock: number;
  isActive: boolean;
  optionValueIds: string[];
}

export interface SaveVariantsInput {
  options: VariantOptionInput[];
  variants: VariantInput[];
}

/** Public, price-resolved variant projection used by the storefront. */
export interface PublicVariant {
  id: string;
  sku: string;
  /** Effective price (variant override or product price), resolved server-side. */
  price: number;
  stock: number;
  optionValueIds: string[];
}
