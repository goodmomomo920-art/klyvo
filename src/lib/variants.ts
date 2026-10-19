import type {
  ProductOption,
  PublicVariant,
} from "../types/variants";

/**
 * Pure variant helpers shared by the storefront cart, checkout validation and
 * tests. No prices or stock are trusted from here at checkout — the SQL RPC
 * re-resolves both from the catalog/variant rows.
 */

/**
 * Stable cart line identity. One line per product/variant combination; a
 * variantless product keeps the historical "<slug>:<productId>" shape.
 */
export function cartLineId(
  slug: string,
  productId: string,
  variantId?: string | null
): string {
  const base = `${slug}:${productId}`;
  return variantId ? `${base}:${variantId}` : base;
}

/** Builds a key for a chosen set of option values (order-independent). */
export function variantSelectionKey(optionValueIds: string[]): string {
  return [...optionValueIds].sort().join("|");
}

/**
 * Finds the exact purchasable variant matching the merchant's option choice.
 * Returns null when the selection is incomplete or the combination is missing.
 */
export function findVariantBySelection(
  variants: PublicVariant[],
  selectedOptionValueIds: string[]
): PublicVariant | null {
  if (selectedOptionValueIds.length === 0) return null;
  const key = variantSelectionKey(selectedOptionValueIds);
  return (
    variants.find(
      (variant) => variantSelectionKey(variant.optionValueIds) === key
    ) ?? null
  );
}

export function isSelectionComplete(
  options: ProductOption[],
  selected: Record<string, string | null | undefined>
): boolean {
  if (options.length === 0) return false;
  return options.every((option) => Boolean(selected[option.id]));
}

/**
 * Human-readable combination label, e.g. "Size: M / Color: Blue".
 * Only plain text from merchant-entered option values is used.
 */
export function formatVariantLabel(
  optionValueIds: string[],
  options: ProductOption[]
): string {
  const wanted = new Set(optionValueIds);
  const parts: string[] = [];
  for (const option of options) {
    const value = option.values.find((v) => wanted.has(v.id));
    if (value) parts.push(`${option.name}: ${value.value}`);
  }
  return parts.join(" / ");
}

/** Price shown to the customer: variant override, else product price. */
export function effectiveVariantPrice(
  basePrice: number,
  variant: Pick<PublicVariant, "price"> | null
): number {
  if (!variant) return basePrice;
  return Number.isFinite(variant.price) ? variant.price : basePrice;
}

export function isPurchasable(
  variant: Pick<PublicVariant, "stock"> | null
): boolean {
  return Boolean(variant && variant.stock > 0);
}

/** Lowest display price across purchasable variants (for catalog cards). */
export function lowestVariantPrice(
  basePrice: number,
  variants: PublicVariant[]
): number {
  const inStock = variants.filter((v) => v.stock > 0);
  const pool = inStock.length > 0 ? inStock : variants;
  if (pool.length === 0) return basePrice;
  return Math.min(...pool.map((v) => effectiveVariantPrice(basePrice, v)));
}

/** Total stock across active variants (mirrors the DB aggregate). */
export function totalVariantStock(variants: PublicVariant[]): number {
  return variants.reduce(
    (sum, v) => sum + Math.max(0, Math.trunc(v.stock)),
    0
  );
}
