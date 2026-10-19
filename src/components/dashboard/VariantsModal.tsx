"use client";

import { useEffect, useMemo, useState } from "react";
import { Product } from "@/types/product";
import type { ProductVariantsBundle } from "@/types/variants";
import {
  getAuthorizedProductVariants,
  saveAuthorizedProductVariants,
} from "@/lib/server/variants";

interface VariantsModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: (variantCount: number) => void;
}

interface DraftValue {
  id: string;
  value: string;
}

interface DraftOption {
  id: string;
  name: string;
  values: DraftValue[];
}

interface DraftVariant {
  id: string;
  sku: string;
  price: string;
  stock: string;
  isActive: boolean;
  selected: Record<string, string>;
}

function newId(): string {
  return crypto.randomUUID();
}

function combinationKey(values: string[]): string {
  return [...values].sort().join("|");
}

function draftsFromBundle(bundle: ProductVariantsBundle): {
  options: DraftOption[];
  variants: DraftVariant[];
} {
  const valueToOption = new Map<string, string>();
  const options: DraftOption[] = bundle.options.map((option) => {
    for (const value of option.values) valueToOption.set(value.id, option.id);
    return {
      id: option.id,
      name: option.name,
      values: option.values.map((value) => ({ id: value.id, value: value.value })),
    };
  });

  const variants: DraftVariant[] = bundle.variants.map((variant) => {
    const selected: Record<string, string> = {};
    for (const valueId of variant.optionValueIds) {
      const optionId = valueToOption.get(valueId);
      if (optionId) selected[optionId] = valueId;
    }
    return {
      id: variant.id,
      sku: variant.sku,
      price: variant.price === null ? "" : String(variant.price),
      stock: String(variant.stock),
      isActive: variant.isActive,
      selected,
    };
  });

  return { options, variants };
}

export default function VariantsModal({
  isOpen,
  product,
  onClose,
  onSaved,
}: VariantsModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<DraftOption[]>([]);
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !product) return;
    let ignore = false;
    getAuthorizedProductVariants(product.id)
      .then((res) => {
        if (ignore) return;
        if (res.success && res.data) {
          const drafts = draftsFromBundle(res.data);
          setOptions(drafts.options);
          setVariants(drafts.variants);
        } else {
          setLoadError(res.success ? "Failed to load variants." : res.error);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setLoadError(err instanceof Error ? err.message : "Failed to load variants.");
        }
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [isOpen, product]);

  const totalCombinations = useMemo(() => {
    if (options.length === 0) return 0;
    if (options.some((option) => option.values.length === 0)) return 0;
    return options.reduce((acc, option) => acc * option.values.length, 1);
  }, [options]);

  if (!isOpen || !product) return null;

  const updateOption = (optionId: string, patch: Partial<DraftOption>) => {
    setOptions((prev) =>
      prev.map((option) => (option.id === optionId ? { ...option, ...patch } : option))
    );
  };

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions((prev) => [
      ...prev,
      {
        id: newId(),
        name: "",
        values: [{ id: newId(), value: "" }],
      },
    ]);
  };

  const removeOption = (optionId: string) => {
    const removedValueIds = new Set(
      options.find((option) => option.id === optionId)?.values.map((value) => value.id) ?? []
    );
    setOptions((prev) => prev.filter((option) => option.id !== optionId));
    setVariants((prev) =>
      prev
        .filter(
          (variant) => !Object.values(variant.selected).some((id) => removedValueIds.has(id))
        )
        .map((variant) => {
          const selected = { ...variant.selected };
          delete selected[optionId];
          return { ...variant, selected };
        })
    );
  };

  const addValue = (optionId: string) => {
    setOptions((prev) =>
      prev.map((option) =>
        option.id === optionId && option.values.length < 30
          ? { ...option, values: [...option.values, { id: newId(), value: "" }] }
          : option
      )
    );
  };

  const updateValue = (optionId: string, valueId: string, value: string) => {
    setOptions((prev) =>
      prev.map((option) =>
        option.id === optionId
          ? {
              ...option,
              values: option.values.map((entry) =>
                entry.id === valueId ? { ...entry, value } : entry
              ),
            }
          : option
      )
    );
  };

  const removeValue = (optionId: string, valueId: string) => {
    setOptions((prev) =>
      prev.map((option) =>
        option.id === optionId
          ? { ...option, values: option.values.filter((entry) => entry.id !== valueId) }
          : option
      )
    );
    setVariants((prev) =>
      prev.filter((variant) => !Object.values(variant.selected).includes(valueId))
    );
  };

  const generateCombinations = () => {
    if (options.length === 0) return;
    if (options.some((option) => !option.name.trim() || option.values.length === 0)) {
      setSaveError("Every option needs a name and at least one value before generating combinations.");
      return;
    }
    if (options.some((option) => option.values.some((value) => !value.value.trim()))) {
      setSaveError("Every option value needs a label before generating combinations.");
      return;
    }

    const combos = options.reduce<Array<Record<string, string>>>(
      (acc, option) =>
        acc.flatMap((selection) =>
          option.values.map((value) => ({ ...selection, [option.id]: value.id }))
        ),
      [{}]
    );

    if (combos.length > 200) {
      setSaveError("That would create more than 200 variants. Reduce the number of option values.");
      return;
    }

    setSaveError(null);
    setVariants((prev) => {
      const existing = new Map(
        prev.map((variant) => [
          combinationKey(Object.values(variant.selected)),
          variant,
        ])
      );
      const usedSkus = new Set(prev.map((variant) => variant.sku.toLowerCase()));

      return combos.map((selected, index) => {
        const key = combinationKey(Object.values(selected));
        const match = existing.get(key);
        if (match) return { ...match, selected };

        let sku = `${product.sku}-${String(index + 1).padStart(2, "0")}`;
        let suffix = 1;
        while (usedSkus.has(sku.toLowerCase())) {
          sku = `${product.sku}-${String(index + 1).padStart(2, "0")}-${suffix}`;
          suffix += 1;
        }
        usedSkus.add(sku.toLowerCase());

        return {
          id: newId(),
          sku,
          price: "",
          stock: "0",
          isActive: true,
          selected,
        };
      });
    });
  };

  const updateVariant = (variantId: string, patch: Partial<DraftVariant>) => {
    setVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId ? { ...variant, ...patch } : variant
      )
    );
  };

  const handleSave = async () => {
    if (isSaving) return;
    setSaveError(null);

    const cleanedOptions = options.map((option) => ({
      id: option.id,
      name: option.name.trim(),
      values: option.values.map((value) => ({
        id: value.id,
        value: value.value.trim(),
      })),
    }));

    if (cleanedOptions.some((option) => !option.name)) {
      setSaveError("Every option needs a name.");
      return;
    }
    if (cleanedOptions.some((option) => option.values.some((value) => !value.value))) {
      setSaveError("Every option value needs a label.");
      return;
    }
    if (cleanedOptions.length > 0 && variants.length === 0) {
      setSaveError("Add at least one variant combination, or remove all options to sell this as a simple product.");
      return;
    }

    const payload = variants.map((variant) => {
      const selectedIds = cleanedOptions.map(
        (option) => variant.selected[option.id]
      );
      return {
        id: variant.id,
        sku: variant.sku.trim(),
        price: variant.price.trim() === "" ? null : Number(variant.price),
        stock: Number(variant.stock),
        isActive: variant.isActive,
        optionValueIds: selectedIds,
      };
    });

    if (payload.some((variant) => variant.optionValueIds.some((id) => !id))) {
      setSaveError("Every variant must select one value for each option.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveAuthorizedProductVariants(product.id, {
        options: cleanedOptions,
        variants: payload,
      });
      if (res.success && res.data) {
        onSaved(res.data.variants.length);
        onClose();
      } else {
        setSaveError(res.success ? "Failed to save variants." : res.error);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save variants.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="variants-title" className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-200 bg-zinc-50/70 px-5 py-4 sm:px-6">
            <div>
              <h3 id="variants-title" className="text-lg font-bold text-zinc-950">
                Product Variants
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {product.name} · <span className="font-mono">{product.sku}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Close variants"
            >
              ✕
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5 sm:p-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">
              Each variant has its own SKU, optional price (empty = inherit product
              price), and stock. While variants exist, the product&apos;s stock is
              derived from the active variants — manage stock here.
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                {loadError}
              </div>
            ) : (
              <>
                {/* Options */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900">Options</h4>
                      <p className="text-[11px] text-zinc-500">
                        Size, color, type… up to 6 options.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addOption}
                      disabled={options.length >= 6}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      + Add option
                    </button>
                  </div>

                  {options.length === 0 && (
                    <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
                      No options yet. This product sells as a simple product using its
                      base price and stock.
                    </p>
                  )}

                  {options.map((option, optionIndex) => (
                    <div key={option.id} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option.name}
                          maxLength={60}
                          onChange={(e) => updateOption(option.id, { name: e.target.value })}
                          placeholder={`Option name (e.g. ${optionIndex === 0 ? "Size" : "Color"})`}
                          aria-label={`Option ${optionIndex + 1} name`}
                          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold focus:border-[#2563EB] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(option.id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {option.values.map((value) => (
                          <div
                            key={value.id}
                            className="flex items-center overflow-hidden rounded-lg border border-zinc-300"
                          >
                            <input
                              type="text"
                              value={value.value}
                              maxLength={60}
                              onChange={(e) =>
                                updateValue(option.id, value.id, e.target.value)
                              }
                              placeholder="Value"
                              aria-label={`${option.name || "Option"} value`}
                              className="w-24 px-2.5 py-1.5 text-xs focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => removeValue(option.id, value.id)}
                              className="border-s border-zinc-200 px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                              aria-label={`Remove value ${value.value || ""}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addValue(option.id)}
                          className="rounded-lg border border-dashed border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                        >
                          + value
                        </button>
                      </div>
                    </div>
                  ))}

                  {options.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={generateCombinations}
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800"
                      >
                        Generate {totalCombinations} combination
                        {totalCombinations === 1 ? "" : "s"}
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        Existing combinations and their SKUs are preserved.
                      </span>
                    </div>
                  )}
                </section>

                {/* Variants */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900">Variants</h4>
                      <p className="text-[11px] text-zinc-500">
                        {variants.length} combination{variants.length === 1 ? "" : "s"} · SKUs
                        must be unique in this store.
                      </p>
                    </div>
                  </div>

                  {variants.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
                      No variants yet. Add options and generate combinations.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-zinc-200">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="px-3 py-2">Combination</th>
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2">Price</th>
                            <th className="px-3 py-2">Stock</th>
                            <th className="px-3 py-2">Active</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {variants.map((variant) => {
                            const label = options
                              .map((option) => {
                                const value = option.values.find(
                                  (entry) => entry.id === variant.selected[option.id]
                                );
                                return value ? `${option.name || "?"}: ${value.value || "?"}` : null;
                              })
                              .filter(Boolean)
                              .join(" / ");
                            return (
                              <tr key={variant.id}>
                                <td className="px-3 py-2 font-semibold text-zinc-800">
                                  {label || "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={variant.sku}
                                    maxLength={120}
                                    onChange={(e) =>
                                      updateVariant(variant.id, { sku: e.target.value })
                                    }
                                    aria-label="Variant SKU"
                                    className="w-32 rounded border border-zinc-300 px-2 py-1 font-mono text-[11px] focus:border-[#2563EB] focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={variant.price}
                                    onChange={(e) =>
                                      updateVariant(variant.id, { price: e.target.value })
                                    }
                                    placeholder={String(product.price)}
                                    aria-label="Variant price (empty inherits product price)"
                                    className="w-24 rounded border border-zinc-300 px-2 py-1 text-[11px] focus:border-[#2563EB] focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={variant.stock}
                                    onChange={(e) =>
                                      updateVariant(variant.id, { stock: e.target.value })
                                    }
                                    aria-label="Variant stock"
                                    className="w-20 rounded border border-zinc-300 px-2 py-1 text-[11px] focus:border-[#2563EB] focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={variant.isActive}
                                    onChange={(e) =>
                                      updateVariant(variant.id, { isActive: e.target.checked })
                                    }
                                    aria-label="Variant active"
                                    className="h-4 w-4 accent-[#2563EB]"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {deletingVariantId === variant.id ? (
                                    <span className="flex justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setVariants((prev) =>
                                            prev.filter((entry) => entry.id !== variant.id)
                                          );
                                          setDeletingVariantId(null);
                                        }}
                                        className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeletingVariantId(null)}
                                        className="rounded border border-zinc-300 px-2 py-1 text-[10px] font-semibold"
                                      >
                                        Cancel
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setDeletingVariantId(variant.id)}
                                      className="text-[11px] font-semibold text-rose-600 hover:underline"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {saveError && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
                    {saveError}
                  </div>
                )}

                {variants.length > 0 || options.length > 0 ? (
                  confirmClear ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs">
                      <p className="font-semibold text-rose-900">
                        Remove all options and variants? The product becomes a simple
                        product and keeps its last aggregated stock.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setOptions([]);
                            setVariants([]);
                            setConfirmClear(false);
                            setIsSaving(true);
                            try {
                              const res = await saveAuthorizedProductVariants(product.id, {
                                options: [],
                                variants: [],
                              });
                              if (res.success) {
                                onSaved(0);
                                onClose();
                              } else {
                                setSaveError(res.error);
                              }
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Yes, remove all
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(false)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Remove all options and variants
                    </button>
                  )
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/70 px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading || Boolean(loadError)}
              className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Variants"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
