"use client";

import { useState } from "react";
import { Coupon, CouponFormData, DiscountType } from "@/types/coupons";

interface CouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CouponFormData, editingId: string | null) => Promise<void>;
  coupon: Coupon | null; // null => create mode
}

const inputClass =
  "w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB]";

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function CouponModal({ isOpen, onClose, onSubmit, coupon }: CouponModalProps) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderSubtotal, setMinOrderSubtotal] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [perCustomerLimit, setPerCustomerLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState<string | null>(null); // coupon id this form is showing

  if (!isOpen) return null;

  if (coupon && hydrated !== coupon.id) {
    setCode(coupon.code);
    setDiscountType(coupon.discountType);
    setDiscountValue(String(coupon.discountValue));
    setMinOrderSubtotal(coupon.minOrderSubtotal === null ? "" : String(coupon.minOrderSubtotal));
    setMaxDiscountAmount(
      coupon.maxDiscountAmount === null ? "" : String(coupon.maxDiscountAmount)
    );
    setStartsAt(toLocalInputValue(coupon.startsAt));
    setExpiresAt(toLocalInputValue(coupon.expiresAt));
    setUsageLimit(coupon.usageLimit === null ? "" : String(coupon.usageLimit));
    setPerCustomerLimit(coupon.perCustomerLimit === null ? "" : String(coupon.perCustomerLimit));
    setIsActive(coupon.isActive);
    setErrors({});
    setHydrated(coupon.id);
  }
  if (!coupon && hydrated !== "new") {
    setCode("");
    setDiscountType("percentage");
    setDiscountValue("");
    setMinOrderSubtotal("");
    setMaxDiscountAmount("");
    setStartsAt(toLocalInputValue(new Date().toISOString()));
    setExpiresAt("");
    setUsageLimit("");
    setPerCustomerLimit("");
    setIsActive(true);
    setErrors({});
    setHydrated("new");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!/^[A-Za-z0-9_-]{2,32}$/.test(code.trim())) {
      newErrors.code = "2–32 letters, numbers, dashes or underscores.";
    }
    const parsedValue = Number(discountValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      newErrors.discountValue = "Must be a number greater than 0.";
    } else if (discountType === "percentage" && parsedValue > 100) {
      newErrors.discountValue = "Percentage cannot exceed 100.";
    }
    if (minOrderSubtotal.trim() !== "") {
      const parsed = Number(minOrderSubtotal);
      if (!Number.isFinite(parsed) || parsed < 0) {
        newErrors.minOrderSubtotal = "Must be a non-negative number.";
      }
    }
    if (maxDiscountAmount.trim() !== "") {
      const parsed = Number(maxDiscountAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        newErrors.maxDiscountAmount = "Must be a number greater than 0.";
      }
    }
    if (!startsAt) newErrors.startsAt = "Start date is required.";
    if (expiresAt && startsAt && new Date(expiresAt) <= new Date(startsAt)) {
      newErrors.expiresAt = "Expiration must be after the start date.";
    }
    if (usageLimit.trim() !== "" && (!/^\d+$/.test(usageLimit) || Number(usageLimit) <= 0)) {
      newErrors.usageLimit = "Whole number greater than 0.";
    }
    if (
      perCustomerLimit.trim() !== "" &&
      (!/^\d+$/.test(perCustomerLimit) || Number(perCustomerLimit) <= 0)
    ) {
      newErrors.perCustomerLimit = "Whole number greater than 0.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(
        {
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: parsedValue,
          minOrderSubtotal: minOrderSubtotal.trim() === "" ? null : Number(minOrderSubtotal),
          maxDiscountAmount:
            discountType === "percentage" && maxDiscountAmount.trim() !== ""
              ? Number(maxDiscountAmount)
              : null,
          startsAt: fromLocalInputValue(startsAt) ?? new Date().toISOString(),
          expiresAt: fromLocalInputValue(expiresAt),
          usageLimit: usageLimit.trim() === "" ? null : Number(usageLimit),
          perCustomerLimit: perCustomerLimit.trim() === "" ? null : Number(perCustomerLimit),
          isActive,
        },
        coupon ? coupon.id : null
      );
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-6 py-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-950">
                {coupon ? `Edit Coupon ${coupon.code}` : "Create Coupon"}
              </h3>
              <p className="text-xs text-zinc-500">
                Percentage and fixed-amount discounts apply to the order subtotal and are
                validated again on the server at checkout.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-code" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Coupon Code <span className="text-rose-500">*</span>
                </label>
                <input
                  id="coupon-code"
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. SUMMER20"
                  className={`${inputClass} font-mono uppercase`}
                />
                {errors.code && <p className="text-[11px] text-rose-500 mt-0.5">{errors.code}</p>}
              </div>

              <div>
                <label htmlFor="coupon-type" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Discount Type <span className="text-rose-500">*</span>
                </label>
                <select
                  id="coupon-type"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                  className={inputClass}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed amount</option>
                </select>
              </div>

              <div>
                <label htmlFor="coupon-value" className="block text-xs font-semibold text-zinc-700 mb-1">
                  {discountType === "percentage" ? "Discount %" : "Discount amount"}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  id="coupon-value"
                  type="number"
                  step="0.01"
                  min={discountType === "percentage" ? 0.01 : 0.01}
                  max={discountType === "percentage" ? 100 : undefined}
                  required
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                  className={inputClass}
                />
                {errors.discountValue && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.discountValue}</p>
                )}
              </div>

              {discountType === "percentage" && (
                <div>
                  <label
                    htmlFor="coupon-max"
                    className="block text-xs font-semibold text-zinc-700 mb-1"
                  >
                    Maximum discount (optional)
                  </label>
                  <input
                    id="coupon-max"
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={maxDiscountAmount}
                    onChange={(e) => setMaxDiscountAmount(e.target.value)}
                    placeholder="e.g. 500"
                    className={inputClass}
                  />
                  {errors.maxDiscountAmount && (
                    <p className="text-[11px] text-rose-500 mt-0.5">{errors.maxDiscountAmount}</p>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="coupon-min" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Minimum order subtotal (optional)
                </label>
                <input
                  id="coupon-min"
                  type="number"
                  step="0.01"
                  min={0}
                  value={minOrderSubtotal}
                  onChange={(e) => setMinOrderSubtotal(e.target.value)}
                  placeholder="e.g. 500"
                  className={inputClass}
                />
                {errors.minOrderSubtotal && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.minOrderSubtotal}</p>
                )}
              </div>

              <div>
                <label htmlFor="coupon-starts" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Starts at <span className="text-rose-500">*</span>
                </label>
                <input
                  id="coupon-starts"
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className={inputClass}
                />
                {errors.startsAt && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.startsAt}</p>
                )}
              </div>

              <div>
                <label htmlFor="coupon-expires" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Expires at (optional)
                </label>
                <input
                  id="coupon-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className={inputClass}
                />
                {errors.expiresAt && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.expiresAt}</p>
                )}
              </div>

              <div>
                <label htmlFor="coupon-limit" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Total usage limit (optional)
                </label>
                <input
                  id="coupon-limit"
                  type="number"
                  min={1}
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                  placeholder="e.g. 100"
                  className={inputClass}
                />
                {errors.usageLimit && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.usageLimit}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="coupon-per-customer"
                  className="block text-xs font-semibold text-zinc-700 mb-1"
                >
                  Per-customer limit (optional)
                </label>
                <input
                  id="coupon-per-customer"
                  type="number"
                  min={1}
                  value={perCustomerLimit}
                  onChange={(e) => setPerCustomerLimit(e.target.value)}
                  placeholder="e.g. 1"
                  className={inputClass}
                />
                {errors.perCustomerLimit && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.perCustomerLimit}</p>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-[#2563EB]"
              />
              Coupon is active and usable by customers
            </label>

            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[#2563EB] px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 disabled:opacity-50"
              >
                {submitting ? "Saving..." : coupon ? "Save changes" : "Create coupon"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
