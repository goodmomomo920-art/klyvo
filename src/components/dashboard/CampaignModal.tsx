"use client";

import { useMemo, useState } from "react";
import type { Campaign, CampaignStatus } from "@/types/campaigns";
import type { Coupon } from "@/types/coupons";
import type { Product } from "@/types/product";
import {
  createAuthorizedStoreCampaign,
  updateAuthorizedStoreCampaign,
} from "@/lib/server/campaigns";

interface CampaignModalProps {
  isOpen: boolean;
  campaign: Campaign | null;
  coupons: Coupon[];
  products: Product[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onNotify: (message: string, type?: "success" | "error") => void;
}

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

function toLocalInput(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function CampaignModal({
  isOpen,
  campaign,
  coupons,
  products,
  onClose,
  onSaved,
  onNotify,
}: CampaignModalProps) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [couponId, setCouponId] = useState(
    campaign?.couponId ?? coupons[0]?.id ?? ""
  );
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? "draft");
  const [startsAt, setStartsAt] = useState(toLocalInput(campaign?.startsAt));
  const [endsAt, setEndsAt] = useState(
    campaign?.endsAt ? toLocalInput(campaign.endsAt) : ""
  );
  const [selectedProducts, setSelectedProducts] = useState<string[]>(
    campaign?.productIds ?? []
  );
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term)
    );
  }, [products, productSearch]);

  if (!isOpen) return null;

  const toggleProduct = (id: string) =>
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);

    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    if (!couponId) {
      setError("Choose one of your coupons. Campaigns reuse the existing coupon discount.");
      return;
    }
    const startDate = new Date(startsAt);
    if (Number.isNaN(startDate.getTime())) {
      setError("Choose a valid start date and time.");
      return;
    }
    let endIso: string | null = null;
    if (endsAt) {
      const endDate = new Date(endsAt);
      if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
        setError("The end must be after the start.");
        return;
      }
      endIso = endDate.toISOString();
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        couponId,
        status,
        startsAt: startDate.toISOString(),
        endsAt: endIso,
        productIds: selectedProducts,
      };
      const res = campaign
        ? await updateAuthorizedStoreCampaign(campaign.id, payload)
        : await createAuthorizedStoreCampaign(payload);

      if (res.success) {
        onNotify(campaign ? "Campaign updated." : "Campaign created.");
        await onSaved();
        onClose();
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save campaign.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="campaign-title" className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl">
          <div className="flex items-start justify-between border-b border-zinc-200 bg-zinc-50/70 px-5 py-4">
            <div>
              <h3 id="campaign-title" className="text-lg font-bold text-zinc-950">
                {campaign ? "Edit campaign" : "New campaign"}
              </h3>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Campaigns reuse an existing coupon and generate a tracked storefront link.
                They do not send email, SMS, WhatsApp or ads.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100"
              aria-label="Close campaign dialog"
            >
              ✕
            </button>
          </div>

          <form onSubmit={submit} className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
            <div>
              <label htmlFor="campaign-name" className="mb-1 block text-xs font-semibold text-zinc-700">
                Campaign name <span className="text-rose-500">*</span>
              </label>
              <input
                id="campaign-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ramadan sale"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="campaign-coupon" className="mb-1 block text-xs font-semibold text-zinc-700">
                  Coupon <span className="text-rose-500">*</span>
                </label>
                {coupons.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                    Create a coupon first — campaigns cannot invent discounts.
                  </p>
                ) : (
                  <select
                    id="campaign-coupon"
                    value={couponId}
                    onChange={(e) => setCouponId(e.target.value)}
                    className={inputClass}
                  >
                    {coupons.map((coupon) => (
                      <option key={coupon.id} value={coupon.id}>
                        {coupon.code} —{" "}
                        {coupon.discountType === "percentage"
                          ? `${coupon.discountValue}%`
                          : `${coupon.discountValue} EGP`}{" "}
                        ({coupon.computedStatus})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="campaign-status" className="mb-1 block text-xs font-semibold text-zinc-700">
                  Status
                </label>
                <select
                  id="campaign-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CampaignStatus)}
                  className={inputClass}
                >
                  <option value="draft">Draft (link inactive)</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <div>
                <label htmlFor="campaign-start" className="mb-1 block text-xs font-semibold text-zinc-700">
                  Starts <span className="text-rose-500">*</span>
                </label>
                <input
                  id="campaign-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="campaign-end" className="mb-1 block text-xs font-semibold text-zinc-700">
                  Ends (optional)
                </label>
                <input
                  id="campaign-end"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-zinc-700">
                  Featured products{" "}
                  <span className="font-normal text-zinc-400">
                    ({selectedProducts.length} selected, optional)
                  </span>
                </p>
                {selectedProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedProducts([])}
                    className="text-[11px] font-semibold text-zinc-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products…"
                aria-label="Search products for campaign"
                className={`${inputClass} mt-2`}
              />
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-zinc-200">
                {filteredProducts.length === 0 ? (
                  <p className="p-3 text-center text-[11px] text-zinc-500">
                    No products match this search.
                  </p>
                ) : (
                  filteredProducts.map((product) => (
                    <label
                      key={product.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs last:border-0 hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        className="h-4 w-4 accent-[#2563EB]"
                      />
                      <span className="min-w-0 flex-1 truncate">{product.name}</span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {product.sku}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Selections are stored with the campaign for display and filtering; the
                tracked link opens the full store.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || coupons.length === 0}
                className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? "Saving…" : campaign ? "Save changes" : "Create campaign"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
