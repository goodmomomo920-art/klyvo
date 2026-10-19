"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStorefront } from "@/components/storefront/StorefrontShell";
import { PublicProduct } from "@/types/storefront";
import type { PublicReview, PublicReviewPage } from "@/types/reviews";
import type { PublicVariant } from "@/types/variants";
import {
  findVariantBySelection,
  formatVariantLabel,
} from "@/lib/variants";
import { isValidRating, starLabel } from "@/lib/reviews";
import {
  getPublicStoreProductReviews,
  submitPublicStoreProductReview,
} from "@/lib/server/storefront";

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

function selectionForVariant(
  product: PublicProduct,
  variant: PublicVariant | null
): Record<string, string> {
  if (!variant) return {};
  const selection: Record<string, string> = {};
  for (const option of product.options) {
    const match = option.values.find((value) =>
      variant.optionValueIds.includes(value.id)
    );
    if (match) selection[option.id] = match.id;
  }
  return selection;
}

export default function ProductDetailView({ product }: { product: PublicProduct }) {
  const { store, slug, addItem, showToast } = useStorefront();
  const [quantity, setQuantity] = useState(1);
  const isArabic = store.language === "ar";

  const initialVariant = useMemo(() => {
    if (!product.hasVariants) return null;
    return (
      product.variants.find((variant) => variant.stock > 0) ??
      product.variants[0] ??
      null
    );
  }, [product]);

  const [selectedValues, setSelectedValues] = useState<Record<string, string>>(
    () => selectionForVariant(product, initialVariant)
  );

  const selectedVariant = useMemo(() => {
    if (!product.hasVariants) return null;
    const ids = Object.values(selectedValues).filter(Boolean);
    return findVariantBySelection(product.variants, ids);
  }, [product, selectedValues]);

  const effectivePrice = product.hasVariants
    ? selectedVariant?.price ?? 0
    : product.price;
  const effectiveStock = product.hasVariants
    ? selectedVariant?.stock ?? 0
    : product.stock;
  const selectionComplete = !product.hasVariants || Boolean(selectedVariant);
  const inStock = selectionComplete && effectiveStock > 0;
  const hasDiscount =
    product.compareAtPrice !== null && product.compareAtPrice > effectivePrice;
  const discountPct = hasDiscount
    ? Math.round((1 - effectivePrice / (product.compareAtPrice as number)) * 100)
    : 0;

  const selectedLabel = selectedVariant
    ? formatVariantLabel(selectedVariant.optionValueIds, product.options)
    : "";

  function valueStillAvailable(optionId: string, valueId: string): boolean {
    const trial = { ...selectedValues, [optionId]: valueId };
    const ids = Object.values(trial).filter(Boolean);
    const exact = findVariantBySelection(product.variants, ids);
    if (exact) return exact.stock > 0 || Object.values(trial).some((v) => !v);
    // Partial selection: allow any value that participates in an in-stock
    // variant so the customer can discover a valid combination.
    return product.variants.some(
      (variant) => variant.stock > 0 && variant.optionValueIds.includes(valueId)
    );
  }

  // ---------------- Reviews ----------------
  const [reviewState, setReviewState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: PublicReviewPage }
  >({ status: "loading" });
  const [reviewPage, setReviewPage] = useState(1);

  useEffect(() => {
    let ignore = false;
    getPublicStoreProductReviews(slug, product.id, reviewPage)
      .then((res) => {
        if (ignore) return;
        if (res.success && res.data) {
          setReviewState({ status: "ready", data: res.data });
        } else {
          setReviewState({
            status: "error",
            message: res.error || "Could not load reviews.",
          });
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setReviewState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not load reviews.",
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, [slug, product.id, reviewPage]);

  const [form, setForm] = useState({
    rating: 0,
    title: "",
    body: "",
    reviewerName: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setFormSuccess(null);

    if (!isValidRating(form.rating)) {
      setFormError(isArabic ? "اختر تقييمًا من 1 إلى 5 نجوم." : "Choose a star rating from 1 to 5.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPublicStoreProductReview(slug, product.id, form);
      if (res.success) {
        setFormSuccess(
          res.data?.isVerifiedPurchase
            ? isArabic
              ? "شكرًا! تم التحقق من شرائك، وسيُراجع تقييمك قبل النشر."
              : "Thank you! Your purchase was verified and your review will be moderated before publishing."
            : isArabic
              ? "شكرًا! سيُراجع تقييمك قبل نشره."
              : "Thank you! Your review will be moderated before publishing."
        );
        setForm({ rating: 0, title: "", body: "", reviewerName: "", phone: "" });
      } else {
        setFormError(res.error || "Your review could not be submitted.");
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Your review could not be submitted."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const summary =
    reviewState.status === "ready"
      ? {
          average: reviewState.data.averageRating,
          count: reviewState.data.reviewCount,
        }
      : { average: product.ratingAverage, count: product.reviewCount };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-5 text-xs text-zinc-500">
        <Link href={`/store/${slug}`} className="hover:opacity-80">
          {isArabic ? "المتجر" : store.name}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-zinc-700">{product.category}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Image */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
          <div
            className={`aspect-[4/3] w-full ${
              !product.imageUrl ? "flex items-center justify-center" : ""
            }`}
          >
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <svg
                className="h-16 w-16 text-zinc-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            )}
          </div>
          {hasDiscount && (
            <span
              className="absolute top-3 left-3 rounded-lg px-2.5 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: store.primaryColor }}
            >
              -{discountPct}%
            </span>
          )}
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-bold text-zinc-600">
              {product.category}
            </span>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              {product.name}
            </h1>
            {isArabic && product.nameAr && (
              <h2 dir="rtl" className="mt-1 text-lg font-bold text-zinc-700">
                {product.nameAr}
              </h2>
            )}
            {summary.count > 0 && (
              <p className="mt-2 text-xs font-semibold text-amber-600">
                {starLabel(summary.average)}{" "}
                <span className="text-zinc-500">
                  {summary.average} · {summary.count}{" "}
                  {isArabic ? "تقييم" : summary.count === 1 ? "review" : "reviews"}
                </span>
              </p>
            )}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-zinc-950">
              {effectivePrice.toLocaleString()}
            </span>
            <span className="text-sm font-bold text-zinc-500">{store.currency}</span>
            {hasDiscount && (
              <span className="text-sm text-zinc-400 line-through">
                {(product.compareAtPrice as number).toLocaleString()}
              </span>
            )}
          </div>

          {/* Variant options */}
          {product.hasVariants && (
            <div className="space-y-4 border-t border-zinc-100 pt-5">
              {product.options.map((option) => (
                <fieldset key={option.id}>
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {option.name}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((value) => {
                      const active = selectedValues[option.id] === value.id;
                      const available = valueStillAvailable(option.id, value.id);
                      return (
                        <button
                          key={value.id}
                          type="button"
                          disabled={!available}
                          aria-pressed={active}
                          onClick={() =>
                            setSelectedValues((prev) => ({
                              ...prev,
                              [option.id]: value.id,
                            }))
                          }
                          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            active
                              ? "border-transparent text-white"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          }`}
                          style={active ? { backgroundColor: store.primaryColor } : undefined}
                        >
                          {value.value}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {selectedVariant && (
                <p className="text-[11px] text-zinc-500">
                  {selectedLabel} · {selectedVariant.sku}
                </p>
              )}
            </div>
          )}

          {/* Availability */}
          <p
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold ${
              inStock
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                inStock ? "bg-emerald-600" : "bg-rose-600"
              }`}
            />
            {!selectionComplete
              ? isArabic
                ? "اختر الخيارات المتاحة"
                : "Select the available options"
              : inStock
                ? isArabic
                  ? `متوفر · ${effectiveStock} قطعة`
                  : `In stock · ${effectiveStock} ${
                      effectiveStock === 1 ? "unit" : "units"
                    }`
                : isArabic
                  ? "نفدت الكمية"
                  : "Out of stock"}
          </p>

          {/* Quantity + Add */}
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-5">
            <div className="flex items-center rounded-xl border border-zinc-200">
              <button
                type="button"
                aria-label={isArabic ? "إنقاص الكمية" : "Decrease quantity"}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3.5 py-2.5 text-sm font-bold text-zinc-500 hover:text-zinc-950"
              >
                −
              </button>
              <input
                type="number"
                aria-label={isArabic ? "الكمية" : "Quantity"}
                value={Math.min(quantity, Math.max(1, effectiveStock))}
                min={1}
                max={Math.max(1, Math.min(effectiveStock, 100000))}
                onChange={(e) => {
                  const next = Math.max(
                    1,
                    Math.min(Number(e.target.value) || 1, Math.max(1, effectiveStock), 100000)
                  );
                  setQuantity(next);
                }}
                className="w-14 border-x border-zinc-200 bg-white py-2.5 text-center text-sm font-bold focus:outline-none"
              />
              <button
                type="button"
                aria-label={isArabic ? "زيادة الكمية" : "Increase quantity"}
                onClick={() =>
                  setQuantity((q) =>
                    Math.min(Math.min(Math.max(1, effectiveStock), 100000), q + 1)
                  )
                }
                className="px-3.5 py-2.5 text-sm font-bold text-zinc-500 hover:text-zinc-950"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!inStock}
              onClick={() => {
                const chosenQty = Math.max(1, Math.min(quantity, Math.max(1, effectiveStock)));
                if (addItem(product, chosenQty, true, selectedVariant)) {
                  showToast(isArabic ? "أُضيف إلى السلة." : "Added to cart.");
                }
              }}
              className="flex-1 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: store.primaryColor }}
            >
              {inStock
                ? isArabic
                  ? "أضف إلى السلة"
                  : "Add to cart"
                : isArabic
                  ? "غير متوفر"
                  : "Unavailable"}
            </button>
          </div>

          {/* Description */}
          {product.description && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                {isArabic ? "الوصف" : "Description"}
              </h3>
              <p className="text-sm leading-relaxed text-zinc-600">
                {product.description}
              </p>
            </div>
          )}

          <p className="text-[11px] text-zinc-400">
            {isArabic
              ? "الأسعار والرسوم النهائية تُحتسب عندما تكمل عملية الشراء."
              : "Final totals and shipping are calculated when you proceed to checkout."}
          </p>
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-12 border-t border-zinc-200 pt-8" aria-labelledby="reviews-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="reviews-heading" className="text-xl font-black">
              {isArabic ? "التقييمات" : "Reviews"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {isArabic
                ? "المراجعات المنشورة فقط تظهر هنا وتُحتسب في المتوسط."
                : "Only published reviews appear here and count toward the average."}
            </p>
          </div>
          {summary.count > 0 && (
            <p className="text-sm font-bold text-amber-600">
              {starLabel(summary.average)}{" "}
              <span className="text-zinc-600">
                {summary.average} / 5 · {summary.count}
              </span>
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-3">
            {reviewState.status === "loading" && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50"
                  />
                ))}
              </div>
            )}

            {reviewState.status === "error" && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                {reviewState.message}
              </div>
            )}

            {reviewState.status === "ready" && reviewState.data.reviews.length === 0 && (
              <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500">
                {isArabic
                  ? "لا توجد تقييمات منشورة بعد. كن أول من يشارك رأيه."
                  : "No published reviews yet. Be the first to share your experience."}
              </div>
            )}

            {reviewState.status === "ready" &&
              reviewState.data.reviews.map((review: PublicReview) => (
                <article
                  key={review.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-zinc-900">
                      {review.reviewerName}
                      {review.isVerifiedPurchase && (
                        <span className="ms-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {isArabic ? "شراء موثّق" : "Verified purchase"}
                        </span>
                      )}
                    </p>
                    <span className="text-[11px] text-amber-600">
                      {starLabel(review.rating)}
                    </span>
                  </div>
                  {review.title && (
                    <h3 className="mt-2 text-sm font-bold text-zinc-900">
                      {review.title}
                    </h3>
                  )}
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-zinc-600">
                    {review.body}
                  </p>
                  {review.createdAt && (
                    <p className="mt-2 text-[10px] text-zinc-400">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </article>
              ))}

            {reviewState.status === "ready" && reviewState.data.total > 10 && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={reviewPage <= 1}
                  onClick={() => {
                    setReviewState({ status: "loading" });
                    setReviewPage((p) => Math.max(1, p - 1));
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40"
                >
                  {isArabic ? "السابق" : "Previous"}
                </button>
                <span className="text-[11px] font-mono text-zinc-500">
                  {reviewPage}
                </span>
                <button
                  type="button"
                  disabled={!reviewState.data.hasMore}
                  onClick={() => {
                    setReviewState({ status: "loading" });
                    setReviewPage((p) => p + 1);
                  }}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 disabled:opacity-40"
                >
                  {isArabic ? "التالي" : "Next"}
                </button>
              </div>
            )}
          </div>

          {/* Write a review */}
          <form
            onSubmit={submitReview}
            className="lg:col-span-2 h-fit space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5"
          >
            <h3 className="text-sm font-bold">
              {isArabic ? "اكتب تقييمًا" : "Write a review"}
            </h3>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {isArabic
                ? "يُحفظ رقم هاتفك كبصمة مشفّرة لمنع التكرار، ولا يُعرض أبدًا. قد يظهر شراء موثّق إذا وُجد طلب مُسلَّم لهذا المنتج بنفس الرقم."
                : "Your phone is stored only as a one-way hash to prevent duplicates and is never shown. A verified badge appears only when a Delivered order for this product uses the same number."}
            </p>

            <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={form.rating === star}
                  aria-label={`${star} star${star === 1 ? "" : "s"}`}
                  onClick={() => setForm((prev) => ({ ...prev, rating: star }))}
                  className={`text-2xl leading-none transition-transform hover:scale-110 ${
                    form.rating >= star ? "text-amber-500" : "text-zinc-300"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>

            <input
              type="text"
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={isArabic ? "عنوان التقييم (اختياري)" : "Review title (optional)"}
              aria-label={isArabic ? "عنوان التقييم" : "Review title"}
              className={inputClass}
            />
            <textarea
              required
              rows={3}
              maxLength={2000}
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              placeholder={
                isArabic ? "شاركنا تجربتك مع المنتج…" : "Share your experience with this product…"
              }
              aria-label={isArabic ? "نص التقييم" : "Review text"}
              className={inputClass}
            />
            <input
              type="text"
              required
              maxLength={80}
              value={form.reviewerName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reviewerName: e.target.value }))
              }
              placeholder={isArabic ? "اسمك" : "Your name"}
              aria-label={isArabic ? "الاسم" : "Your name"}
              className={inputClass}
            />
            <input
              type="tel"
              required
              maxLength={50}
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder={isArabic ? "رقم الهاتف" : "Phone number"}
              aria-label={isArabic ? "رقم الهاتف" : "Phone number"}
              className={inputClass}
            />

            {formError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800">
                {formError}
              </p>
            )}
            {formSuccess && (
              <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
                {formSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: store.primaryColor }}
            >
              {submitting
                ? isArabic
                  ? "جارٍ الإرسال…"
                  : "Submitting…"
                : isArabic
                  ? "إرسال التقييم"
                  : "Submit review"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
