"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import {
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  ProductVariantsBundle,
  SaveVariantsInput,
  VariantInput,
  VariantOptionInput,
} from "@/types/variants";
import {
  ProductOptionRow,
  ProductOptionValueRow,
  ProductVariantRow,
} from "@/types/database";
import { invalidateStorefrontCache } from "@/lib/server/storefrontCache";

/**
 * Server Actions for product variants.
 *
 * Security / integrity:
 * - Store id always comes from the verified session; product ownership is
 *   re-checked before any read or write and every query filters by store_id.
 * - SKUs are validated for uniqueness within the store across BOTH products and
 *   variants (the DB trigger is the final authority).
 * - Variant combinations must select exactly one value per option, cannot
 *   duplicate another combination, and reference only this product's values.
 * - products.stock is derived by a database trigger from active variant stock;
 *   this action never writes products.stock for variant products.
 */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_OPTIONS = 6;
const MAX_VALUES_PER_OPTION = 30;
const MAX_VARIANTS = 200;

export type VariantsResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function mapOption(
  row: ProductOptionRow,
  values: ProductOptionValueRow[]
): ProductOption {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    values: values
      .filter((value) => value.option_id === row.id)
      .sort((a, b) => a.position - b.position || a.value.localeCompare(b.value))
      .map<ProductOptionValue>((value) => ({
        id: value.id,
        optionId: value.option_id,
        value: value.value,
        position: value.position,
      })),
  };
}

function mapVariant(row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    price: row.price === null ? null : Number(row.price),
    stock: row.stock,
    isActive: row.is_active,
    optionValueIds: Array.isArray(row.option_value_ids)
      ? row.option_value_ids
      : [],
  };
}

async function loadBundle(
  storeId: string,
  productId: string
): Promise<ProductVariantsBundle> {
  const supabase = await createClient();

  const [{ data: optionRows, error: optionsError }, { data: valueRows, error: valuesError }, { data: variantRows, error: variantsError }] =
    await Promise.all([
      supabase
        .from("product_options")
        .select("*")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .order("position", { ascending: true }),
      supabase
        .from("product_option_values")
        .select("*")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .order("position", { ascending: true }),
      supabase
        .from("product_variants")
        .select("*")
        .eq("store_id", storeId)
        .eq("product_id", productId)
        .order("created_at", { ascending: true }),
    ]);

  if (optionsError || valuesError || variantsError) {
    throw new Error(
      optionsError?.message ||
        valuesError?.message ||
        variantsError?.message ||
        "Failed to load variants."
    );
  }

  const options = (optionRows ?? []) as ProductOptionRow[];
  const values = (valueRows ?? []) as ProductOptionValueRow[];

  return {
    options: options.map((option) => mapOption(option, values)),
    variants: ((variantRows ?? []) as ProductVariantRow[]).map(mapVariant),
  };
}

async function assertProductOwned(
  storeId: string,
  productId: string
): Promise<boolean> {
  if (!UUID_RE.test(productId)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * Server Action: loads option groups and variants for one owned product.
 */
export async function getAuthorizedProductVariants(
  productId: string
): Promise<VariantsResult<ProductVariantsBundle>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }
  if (!(await assertProductOwned(store.id, productId))) {
    return { success: false, error: "Product not found in this store." };
  }

  try {
    return { success: true, data: await loadBundle(store.id, productId) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load variants.",
    };
  }
}

interface ValidatedOptions {
  options: Array<{
    id: string;
    name: string;
    position: number;
    values: Array<{ id: string; value: string; position: number }>;
  }>;
  valueIds: Set<string>;
}

function validateOptions(
  raw: VariantOptionInput[]
): { ok: true; value: ValidatedOptions } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Options must be a list." };
  }
  if (raw.length > MAX_OPTIONS) {
    return { ok: false, error: `A product can have at most ${MAX_OPTIONS} options.` };
  }

  const names = new Set<string>();
  const optionIds = new Set<string>();
  const valueIds = new Set<string>();
  const options: ValidatedOptions["options"] = [];

  for (let i = 0; i < raw.length; i++) {
    const option = raw[i] ?? { name: "", values: [] };
    const id = (option.id ?? "").trim();
    if (!id || !UUID_RE.test(id)) {
      return { ok: false, error: `Option #${i + 1} has an invalid identifier.` };
    }
    if (optionIds.has(id.toLowerCase())) {
      return { ok: false, error: `Option #${i + 1} is duplicated.` };
    }
    optionIds.add(id.toLowerCase());

    const name = (option.name ?? "").trim();
    if (!name || name.length > 60) {
      return { ok: false, error: `Option #${i + 1} needs a name of 1–60 characters.` };
    }
    const nameKey = name.toLowerCase();
    if (names.has(nameKey)) {
      return { ok: false, error: `Option name "${name}" is used more than once.` };
    }
    names.add(nameKey);

    if (!Array.isArray(option.values) || option.values.length === 0) {
      return { ok: false, error: `Option "${name}" needs at least one value.` };
    }
    if (option.values.length > MAX_VALUES_PER_OPTION) {
      return {
        ok: false,
        error: `Option "${name}" cannot have more than ${MAX_VALUES_PER_OPTION} values.`,
      };
    }

    const valueLabels = new Set<string>();
    const values: ValidatedOptions["options"][number]["values"] = [];
    for (let j = 0; j < option.values.length; j++) {
      const entry = option.values[j] ?? { value: "" };
      const valueId = (entry.id ?? "").trim();
      if (!valueId || !UUID_RE.test(valueId)) {
        return {
          ok: false,
          error: `Option "${name}" value #${j + 1} has an invalid identifier.`,
        };
      }
      if (valueIds.has(valueId.toLowerCase())) {
        return { ok: false, error: `Option value identifiers must be unique.` };
      }
      valueIds.add(valueId.toLowerCase());

      const label = (entry.value ?? "").trim();
      if (!label || label.length > 60) {
        return {
          ok: false,
          error: `Option "${name}" values need 1–60 characters.`,
        };
      }
      const labelKey = label.toLowerCase();
      if (valueLabels.has(labelKey)) {
        return { ok: false, error: `Option "${name}" has duplicate value "${label}".` };
      }
      valueLabels.add(labelKey);

      values.push({ id: valueId, value: label, position: j });
    }

    options.push({ id, name, position: i, values });
  }

  return { ok: true, value: { options, valueIds } };
}

function combinationKey(ids: string[]): string {
  return [...ids].map((id) => id.toLowerCase()).sort().join("|");
}

export async function saveAuthorizedProductVariants(
  productId: string,
  input: SaveVariantsInput
): Promise<VariantsResult<ProductVariantsBundle>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }
  if (!(await assertProductOwned(store.id, productId))) {
    return { success: false, error: "Product not found in this store." };
  }

  const optionsCheck = validateOptions(input?.options ?? []);
  if (!optionsCheck.ok) {
    return { success: false, error: optionsCheck.error };
  }
  const { options, valueIds } = optionsCheck.value;

  if (!Array.isArray(input?.variants)) {
    return { success: false, error: "Variants must be a list." };
  }
  if (input.variants.length > MAX_VARIANTS) {
    return { success: false, error: `A product can have at most ${MAX_VARIANTS} variants.` };
  }

  const supabase = await createClient();

  // Fetch existing records for this store to validate supplied ids.
  const [{ data: allOptions, error: allOptionsError }, { data: allValues, error: allValuesError }, { data: allVariants, error: allVariantsError }] =
    await Promise.all([
      supabase.from("product_options").select("id, product_id").eq("store_id", store.id),
      supabase
        .from("product_option_values")
        .select("id, product_id")
        .eq("store_id", store.id),
      supabase
        .from("product_variants")
        .select("id, product_id")
        .eq("store_id", store.id),
    ]);

  if (allOptionsError || allValuesError || allVariantsError) {
    return {
      success: false,
      error:
        allOptionsError?.message ||
        allValuesError?.message ||
        allVariantsError?.message ||
        "Failed to validate variants.",
    };
  }

  const existingOptionIds = new Set(
    (allOptions ?? []).map((row) => String((row as { id: string }).id))
  );
  const existingValueIds = new Set(
    (allValues ?? []).map((row) => String((row as { id: string }).id))
  );
  const existingVariantIds = new Set(
    (allVariants ?? []).map((row) => String((row as { id: string }).id))
  );

  const optionIdToProduct = new Map(
    (allOptions ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { product_id: string }).product_id),
    ])
  );
  const valueIdToProduct = new Map(
    (allValues ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { product_id: string }).product_id),
    ])
  );
  const variantIdToProduct = new Map(
    (allVariants ?? []).map((row) => [
      String((row as { id: string }).id),
      String((row as { product_id: string }).product_id),
    ])
  );

  for (const option of options) {
    if (optionIdToProduct.has(option.id) && optionIdToProduct.get(option.id) !== productId) {
      return { success: false, error: "An option belongs to a different product." };
    }
  }
  for (const option of options) {
    for (const value of option.values) {
      if (valueIdToProduct.has(value.id) && valueIdToProduct.get(value.id) !== productId) {
        return { success: false, error: "An option value belongs to a different product." };
      }
    }
  }

  const optionValueToOption = new Map<string, string>();
  for (const option of options) {
    for (const value of option.values) {
      optionValueToOption.set(value.id.toLowerCase(), option.id.toLowerCase());
    }
  }

  const validatedVariants: Array<VariantInput & { id: string }> = [];
  const skus = new Set<string>();
  const combinations = new Set<string>();

  for (let i = 0; i < input.variants.length; i++) {
    const variant = input.variants[i] ?? ({} as VariantInput);
    const id = (variant.id ?? "").trim();
    if (!id || !UUID_RE.test(id)) {
      return { success: false, error: `Variant #${i + 1} has an invalid identifier.` };
    }
    if (variantIdToProduct.has(id) && variantIdToProduct.get(id) !== productId) {
      return { success: false, error: "A variant belongs to a different product." };
    }

    const sku = (variant.sku ?? "").trim();
    if (!sku || sku.length > 120) {
      return { success: false, error: `Variant #${i + 1} needs a SKU of 1–120 characters.` };
    }
    const skuKey = sku.toLowerCase();
    if (skus.has(skuKey)) {
      return { success: false, error: `SKU "${sku}" is used more than once in these variants.` };
    }
    skus.add(skuKey);

    const ids = Array.isArray(variant.optionValueIds) ? variant.optionValueIds : [];
    if (ids.length !== options.length) {
      return {
        success: false,
        error: `Variant "${sku}" must select one value for each of the ${options.length} option(s).`,
      };
    }
    if (new Set(ids.map((value) => value.toLowerCase())).size !== ids.length) {
      return { success: false, error: `Variant "${sku}" repeats an option value.` };
    }
    const seenOptions = new Set<string>();
    for (const valueId of ids) {
      if (!valueIds.has(valueId)) {
        return {
          success: false,
          error: `Variant "${sku}" references a value that is not part of this product.`,
        };
      }
      const optionId = optionValueToOption.get(valueId.toLowerCase());
      if (!optionId || seenOptions.has(optionId)) {
        return {
          success: false,
          error: `Variant "${sku}" must select exactly one value per option.`,
        };
      }
      seenOptions.add(optionId);
    }

    const combo = combinationKey(ids);
    if (combinations.has(combo)) {
      return { success: false, error: `Variant "${sku}" duplicates another combination.` };
    }
    combinations.add(combo);

    const stock = Number(variant.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
      return {
        success: false,
        error: `Variant "${sku}" stock must be a whole number between 0 and 1,000,000.`,
      };
    }

    let price: number | null = null;
    if (variant.price !== null && variant.price !== undefined) {
      const parsed = Number(variant.price);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999.99) {
        return {
          success: false,
          error: `Variant "${sku}" price must be between 0 and 9,999,999.99.`,
        };
      }
      price = Math.round(parsed * 100) / 100;
    }

    validatedVariants.push({
      id,
      sku,
      price,
      stock,
      isActive: Boolean(variant.isActive),
      optionValueIds: ids,
    });
  }

  // SKU collision with the parent product or another variant in this store.
  const { data: productRow } = await supabase
    .from("products")
    .select("sku")
    .eq("id", productId)
    .eq("store_id", store.id)
    .maybeSingle();

  const productSku = String((productRow as { sku?: string } | null)?.sku ?? "").toLowerCase();
  for (const variant of validatedVariants) {
    if (variant.sku.toLowerCase() === productSku && productSku) {
      return {
        success: false,
        error: `SKU "${variant.sku}" is already used by the product itself.`,
      };
    }
  }

  const { data: foreignSkuRows } = await supabase
    .from("product_variants")
    .select("id, sku, product_id")
    .eq("store_id", store.id)
    .neq("product_id", productId);

  const foreignSkus = new Set(
    (foreignSkuRows ?? []).map((row) =>
      String((row as { sku: string }).sku).trim().toLowerCase()
    )
  );
  for (const variant of validatedVariants) {
    if (foreignSkus.has(variant.sku.toLowerCase())) {
      return {
        success: false,
        error: `SKU "${variant.sku}" is already used by another product variant in this store.`,
      };
    }
  }

  // ---- Persist ------------------------------------------------------------
  // 1. Options and values (new ids supplied by the client, validated above).
  const optionRows = options.map((option) => ({
    id: option.id,
    store_id: store.id,
    product_id: productId,
    name: option.name,
    position: option.position,
  }));
  if (optionRows.length > 0) {
    const { error } = await supabase
      .from("product_options")
      .upsert(optionRows, { onConflict: "id" });
    if (error) {
      return { success: false, error: error.message };
    }
  }

  const valueRows = options.flatMap((option) =>
    option.values.map((value) => ({
      id: value.id,
      store_id: store.id,
      product_id: productId,
      option_id: option.id,
      value: value.value,
      position: value.position,
    }))
  );
  if (valueRows.length > 0) {
    const { error } = await supabase
      .from("product_option_values")
      .upsert(valueRows, { onConflict: "id" });
    if (error) {
      return { success: false, error: error.message };
    }
  }

  // 2. Delete variants that are no longer present (releases combinations).
  const keptVariantIds = new Set(validatedVariants.map((variant) => variant.id));
  const removedVariantIds = Array.from(existingVariantIds).filter(
    (id) => variantIdToProduct.get(id) === productId && !keptVariantIds.has(id)
  );
  if (removedVariantIds.length > 0) {
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("store_id", store.id)
      .eq("product_id", productId)
      .in("id", removedVariantIds);
    if (error) {
      return { success: false, error: error.message };
    }
  }

  // 3. Delete removed values, then removed options (cascades any leftover).
  const keptValueIds = new Set(
    options.flatMap((option) => option.values.map((value) => value.id))
  );
  const removedValueIds = Array.from(existingValueIds).filter(
    (id) => valueIdToProduct.get(id) === productId && !keptValueIds.has(id)
  );
  if (removedValueIds.length > 0) {
    const { error } = await supabase
      .from("product_option_values")
      .delete()
      .eq("store_id", store.id)
      .eq("product_id", productId)
      .in("id", removedValueIds);
    if (error) {
      return { success: false, error: error.message };
    }
  }

  const keptOptionIds = new Set(options.map((option) => option.id));
  const removedOptionIds = Array.from(existingOptionIds).filter(
    (id) => optionIdToProduct.get(id) === productId && !keptOptionIds.has(id)
  );
  if (removedOptionIds.length > 0) {
    const { error } = await supabase
      .from("product_options")
      .delete()
      .eq("store_id", store.id)
      .eq("product_id", productId)
      .in("id", removedOptionIds);
    if (error) {
      return { success: false, error: error.message };
    }
  }

  // 4. Upsert variants last so combinations and SKUs are validated by the DB.
  if (validatedVariants.length > 0) {
    const variantRows = validatedVariants.map((variant) => ({
      id: variant.id,
      store_id: store.id,
      product_id: productId,
      sku: variant.sku,
      price: variant.price,
      stock: variant.stock,
      is_active: variant.isActive,
      option_value_ids: variant.optionValueIds,
    }));
    const { error } = await supabase
      .from("product_variants")
      .upsert(variantRows, { onConflict: "id" });
    if (error) {
      if (error.code === "23505") {
        return {
          success: false,
          error:
            "That SKU or option combination already exists in this store. Choose a different SKU.",
        };
      }
      return { success: false, error: error.message };
    }
  }

  invalidateStorefrontCache(store.slug);

  try {
    return { success: true, data: await loadBundle(store.id, productId) };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Variants were saved but could not be reloaded.",
    };
  }
}

/**
 * Server Action: removes every option/variant from a product, returning it to a
 * simple product. The product keeps its last aggregated stock value.
 */
export async function clearAuthorizedProductVariants(
  productId: string
): Promise<VariantsResult<ProductVariantsBundle>> {
  return saveAuthorizedProductVariants(productId, { options: [], variants: [] });
}
