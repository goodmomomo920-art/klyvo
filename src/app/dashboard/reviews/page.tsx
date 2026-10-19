"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteAuthorizedStoreReview,
  getAuthorizedStoreReviews,
  moderateAuthorizedStoreReview,
} from "@/lib/server/reviews";
import { ProductReview, ReviewStatus } from "@/types/reviews";
import { computeRatingSummary, starLabel } from "@/lib/reviews";

const FILTERS: Array<{ id: "all" | ReviewStatus; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "published", label: "Published" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const STATUS_STYLE: Record<ReviewStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ReviewStatus>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const notify = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const res = await getAuthorizedStoreReviews();
      if (res.success) {
        setReviews(res.data);
      } else {
        setLoadError(res.error);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load reviews.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    return {
      all: reviews.length,
      pending: reviews.filter((review) => review.status === "pending").length,
      published: reviews.filter((review) => review.status === "published").length,
      rejected: reviews.filter((review) => review.status === "rejected").length,
    };
  }, [reviews]);

  const publishedSummary = useMemo(
    () =>
      computeRatingSummary(
        reviews
          .filter((review) => review.status === "published")
          .map((review) => review.rating)
      ),
    [reviews]
  );

  const visible = useMemo(
    () =>
      filter === "all"
        ? reviews
        : reviews.filter((review) => review.status === filter),
    [reviews, filter]
  );

  const moderate = async (review: ProductReview, status: ReviewStatus) => {
    if (busyId) return;
    setBusyId(review.id);
    try {
      const res = await moderateAuthorizedStoreReview(
        review.id,
        status,
        notes[review.id] ?? review.moderationNote ?? ""
      );
      if (res.success && res.data) {
        setReviews((prev) =>
          prev.map((entry) => (entry.id === review.id ? res.data! : entry))
        );
        notify(
          "success",
          status === "published"
            ? "Review published. It now counts toward the product rating."
            : status === "rejected"
              ? "Review rejected and hidden from the storefront."
              : "Review hidden (moved back to pending)."
        );
      } else {
        notify("error", res.success ? "Failed to moderate review." : res.error);
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await deleteAuthorizedStoreReview(id);
      if (res.success) {
        setReviews((prev) => prev.filter((review) => review.id !== id));
        notify("success", "Review deleted.");
      } else {
        notify("error", res.error);
      }
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Reviews & Ratings</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Moderate customer submissions. Only published reviews appear on the storefront
            and count toward product averages. Verified badges are set by the database only
            when a Delivered order contains the product.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-center">
            <p className="text-lg font-black text-zinc-950">{publishedSummary.average || "—"}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Published avg
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center">
            <p className="text-lg font-black text-amber-900">{counts.pending}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Awaiting moderation
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Review filters">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            onClick={() => setFilter(entry.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
              filter === entry.id
                ? "bg-[#2563EB] text-white shadow-md shadow-blue-600/25"
                : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {entry.label}{" "}
            <span className={filter === entry.id ? "text-white/80" : "text-zinc-400"}>
              ({counts[entry.id]})
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-bold">Could not load reviews.</p>
          <p className="mt-1 text-xs">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setLoadError(null);
              void load();
            }}
            className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
            ★
          </div>
          <h2 className="mt-3 text-base font-bold text-zinc-950">
            {reviews.length === 0 ? "No reviews yet" : `No ${filter} reviews`}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
            {reviews.length === 0
              ? "Customer reviews submitted from product pages will appear here for moderation."
              : "Try a different filter to see other reviews."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((review) => (
            <article
              key={review.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-zinc-950">
                      {review.productName ?? "Product"}
                    </span>
                    {review.productSku && (
                      <span className="font-mono text-[10px] text-zinc-400">
                        {review.productSku}
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[review.status]}`}
                    >
                      {review.status}
                    </span>
                    {review.isVerifiedPurchase && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        Verified purchase
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {review.reviewerName} ·{" "}
                    {new Date(review.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-sm font-bold text-amber-600" title={`${review.rating} / 5`}>
                  {starLabel(review.rating)}
                </span>
              </div>

              {review.title && (
                <h3 className="mt-3 text-sm font-bold text-zinc-900">{review.title}</h3>
              )}
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-600">
                {review.body}
              </p>

              <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={notes[review.id] ?? review.moderationNote ?? ""}
                  maxLength={500}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [review.id]: e.target.value }))
                  }
                  placeholder="Moderation note (optional, private)"
                  aria-label="Moderation note"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-1.5 text-[11px] text-zinc-800 focus:border-[#2563EB] focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {review.status !== "published" && (
                    <button
                      type="button"
                      onClick={() => void moderate(review, "published")}
                      disabled={busyId === review.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Publish
                    </button>
                  )}
                  {review.status !== "pending" && (
                    <button
                      type="button"
                      onClick={() => void moderate(review, "pending")}
                      disabled={busyId === review.id}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Hide
                    </button>
                  )}
                  {review.status !== "rejected" && (
                    <button
                      type="button"
                      onClick={() => void moderate(review, "rejected")}
                      disabled={busyId === review.id}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  )}
                  {deleteTarget === review.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void remove(review.id)}
                        disabled={busyId === review.id}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(null)}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[11px] font-semibold"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(review.id)}
                      className="px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
