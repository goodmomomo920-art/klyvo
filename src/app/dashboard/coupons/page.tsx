"use client";

import { useState, useMemo, useEffect } from "react";
import { Coupon, CouponFormData, CouponStatusFilter } from "@/types/coupons";
import {
  getAuthorizedStoreCoupons,
  createAuthorizedStoreCoupon,
  updateAuthorizedStoreCoupon,
  setAuthorizedStoreCouponActive,
  deleteAuthorizedStoreCoupon,
} from "@/lib/server/coupons";
import CouponModal from "@/components/dashboard/CouponModal";
import { cached, clearClientCache } from "@/lib/clientCache";

const STATUS_FILTERS: Array<{ label: string; value: CouponStatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Expired", value: "expired" },
];

const TYPE_FILTERS = [
  { label: "All types", value: "all" },
  { label: "Percentage", value: "percentage" },
  { label: "Fixed amount", value: "fixed_amount" },
] as const;

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<CouponStatusFilter>("all");
  const [activeType, setActiveType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Coupon | null>(null);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchCoupons() {
      try {
        const res = await cached("dashboard:coupons", getAuthorizedStoreCoupons);
        if (!ignore) {
          if (res.success && res.data) {
            setCoupons(res.data);
          } else if (res.error) {
            showToast(res.error, "error");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          showToast(
            err instanceof Error ? err.message : "Failed to load coupons.",
            "error"
          );
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    fetchCoupons();
    return () => {
      ignore = true;
    };
  }, []);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const res = await cached("dashboard:coupons", getAuthorizedStoreCoupons);
      if (res.success && res.data) setCoupons(res.data);
      else showToast(res.error || "Failed to load coupons.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<CouponStatusFilter, number> = {
      all: coupons.length,
      active: 0,
      inactive: 0,
      expired: 0,
    };
    for (const c of coupons) {
      // Server-computed status; purely counted here for the filter tabs.
      // Scheduled (enabled but not started) counts as Active.
      if (c.computedStatus === "active" || c.computedStatus === "scheduled") {
        counts.active += 1;
      } else if (c.computedStatus === "expired") {
        counts.expired += 1;
      } else if (c.computedStatus === "inactive") {
        counts.inactive += 1;
      }
    }
    return counts;
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return coupons.filter((c) => {
      // Active tab includes scheduled (enabled, not yet started) coupons.
      const matchesStatus =
        activeStatus === "all"
          ? true
          : activeStatus === "active"
            ? c.computedStatus === "active" || c.computedStatus === "scheduled"
            : activeStatus === "inactive"
              ? c.computedStatus === "inactive"
              : c.computedStatus === "expired";
      if (!matchesStatus) return false;
      if (activeType !== "all" && c.discountType !== activeType) return false;
      if (term && !c.code.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [coupons, activeStatus, activeType, searchQuery]);

  const handleFormSubmit = async (data: CouponFormData, editingId: string | null) => {
    const res =
      editingId !== null
        ? await updateAuthorizedStoreCoupon(editingId, data)
        : await createAuthorizedStoreCoupon(data);

    if (res.success && "data" in res && res.data) {
      clearClientCache();
      setCoupons((prev) =>
        editingId !== null
          ? prev.map((c) => (c.id === editingId ? res.data! : c))
          : [res.data!, ...prev]
      );
      showToast(editingId !== null ? "Coupon updated." : "Coupon created.");
    } else {
      showToast("error" in res ? res.error || "Failed to save coupon." : "Failed to save coupon.", "error");
      throw new Error(res.error);
    }
  };

  const handleToggle = async (coupon: Coupon) => {
    const res = await setAuthorizedStoreCouponActive(coupon.id, !coupon.isActive);
    if (res.success && res.data) {
      clearClientCache();
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? res.data! : c)));
      showToast(res.data.isActive ? "Coupon enabled." : "Coupon disabled.");
    } else {
      showToast(res.error || "Failed to update coupon.", "error");
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    const res = await deleteAuthorizedStoreCoupon(coupon.id);
    if (res.success) {
      clearClientCache();
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      setConfirmDelete(null);
      showToast("Coupon deleted.");
    } else {
      setConfirmDelete(null);
      showToast(res.error || "Failed to delete coupon.", "error");
    }
  };

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-EG", { month: "short", day: "numeric", year: "numeric" })
      : "—";

  const discountLabel = (c: Coupon) =>
    c.discountType === "percentage" ? `${c.discountValue}%` : `${c.discountValue.toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Coupons</h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            Create percentage and fixed-amount discount codes for your storefront checkout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-xs disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingCoupon(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors"
          >
            + New Coupon
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setActiveStatus(f.value)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                  activeStatus === f.value
                    ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/25"
                    : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
                }`}
              >
                {f.label} ({statusCounts[f.value]})
              </button>
            ))}
          </div>
          <select
            value={activeType}
            onChange={(e) => setActiveType(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 focus:outline-none focus:border-[#2563EB]"
            aria-label="Filter by discount type"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by coupon code…"
          aria-label="Search coupons"
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB]"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs">
          <p className="text-sm text-zinc-500 animate-pulse">Loading coupons…</p>
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
            🎟️
          </div>
          <p className="text-sm font-bold text-zinc-950">No coupons yet</p>
          <p className="text-xs text-zinc-500">
            Create your first discount coupon to attract customers to your storefront.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingCoupon(null);
              setIsFormOpen(true);
            }}
            className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600"
          >
            + New Coupon
          </button>
        </div>
      ) : filteredCoupons.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <p className="text-sm font-bold text-zinc-950">No matching coupons</p>
          <button
            type="button"
            onClick={() => {
              setActiveStatus("all");
              setActiveType("all");
              setSearchQuery("");
            }}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="hidden md:grid grid-cols-12 gap-x-3 rounded-2xl border border-zinc-200 bg-white shadow-xs text-left text-xs font-bold uppercase tracking-wider text-zinc-500 py-3 px-4">
          <span className="col-span-2">Code</span>
          <span className="col-span-2">Discount</span>
          <span className="col-span-3">Validity</span>
          <span className="col-span-2">Usage</span>
          <span className="col-span-1">State</span>
          <span className="col-span-2 text-right">Actions</span>
        </div>
      )}

      {!isLoading &&
        filteredCoupons.map((c) => {
          // Server-computed status; no clock reads during render.
          const expired = c.computedStatus === "expired";
          const usable = c.computedStatus === "active";
          const notStarted = c.computedStatus === "scheduled";
          const exhausted = c.usageLimit !== null && c.usageCount >= c.usageLimit;
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs mb-3"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="lg:w-48 min-w-0">
                  <span className="font-mono text-sm font-bold text-zinc-950">{c.code}</span>
                  <p className="text-[11px] text-zinc-400">
                    Created {formatDate(c.createdAt)}
                  </p>
                </div>
                <div className="lg:w-40">
                  <span className="text-sm font-bold text-[#2563EB]">
                    {discountLabel(c)}
                  </span>
                  {c.discountType === "percentage" && c.maxDiscountAmount !== null && (
                    <span className="block text-[11px] text-zinc-500">
                      up to {c.maxDiscountAmount.toLocaleString()}
                    </span>
                  )}
                  {c.minOrderSubtotal !== null && (
                    <span className="block text-[11px] text-zinc-400">
                      min. order {c.minOrderSubtotal.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="lg:w-64 text-[11px] text-zinc-500">
                  {formatDate(c.startsAt)} → {formatDate(c.expiresAt)}
                  {notStarted && !expired && (
                    <span className="ml-1 font-semibold text-amber-600">(starts soon)</span>
                  )}
                </div>
                <div className="lg:w-40">
                  <span className="font-mono text-xs font-bold text-zinc-900">
                    {c.usageCount}
                    {c.usageLimit !== null ? ` / ${c.usageLimit}` : ""}
                  </span>
                  {exhausted && (
                    <span className="block text-[11px] font-semibold text-rose-600">
                      Limit reached
                    </span>
                  )}
                  {c.perCustomerLimit !== null && (
                    <span className="block text-[11px] text-zinc-400">
                      ≤ {c.perCustomerLimit} per customer
                    </span>
                  )}
                </div>
                <div className="lg:w-28">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                      expired
                        ? "bg-zinc-100 text-zinc-600 border-zinc-200"
                        : usable
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}
                  >
                    {expired
                      ? "Expired"
                      : usable
                        ? "Active"
                        : notStarted
                          ? "Scheduled"
                          : "Disabled"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 lg:ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCoupon(c);
                      setIsFormOpen(true);
                    }}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(c)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${
                      c.isActive
                        ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    }`}
                  >
                    {c.isActive ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      c.usageCount > 0
                        ? showToast(
                            "Used coupons cannot be deleted (order audit). Disable it instead.",
                            "error"
                          )
                        : setConfirmDelete(c)
                    }
                    disabled={c.usageCount > 0}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      c.usageCount > 0 ? "Used coupons are kept as order audit history" : "Delete"
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

      {/* Create / Edit modal */}
      <CouponModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        coupon={editingCoupon}
      />

      {/* Delete confirmation */}
      {confirmDelete && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setConfirmDelete(null)}
            aria-hidden="true"
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl space-y-3">
              <h3 className="text-base font-bold text-zinc-950">Delete coupon {confirmDelete.code}?</h3>
              <p className="text-xs text-zinc-500">
                This coupon has never been used, so it is safe to delete. This cannot be
                undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(confirmDelete)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Delete coupon
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
