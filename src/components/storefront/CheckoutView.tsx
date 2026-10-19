"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStorefront } from "@/components/storefront/StorefrontShell";
import { submitPublicStoreOrder, validatePublicStoreCoupon } from "@/lib/server/storefront";
import { CheckoutFormData, PublicOrderResult } from "@/types/storefront";
import { getOrCreateCartToken } from "@/lib/cartToken";
import { PaymentMethod } from "@/types/database";
import {
  EGYPT_GOVERNORATES,
  calculateShippingQuote,
  freeShippingGap as freeShippingGapForQuote,
  shippingAreaLabel,
} from "@/lib/shipping";
import { readStoredCampaign } from "@/components/storefront/CampaignTracker";

const GOVERNORATES = EGYPT_GOVERNORATES;

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 invalid:border-rose-300";

const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

const COUPON_ERROR_KEYS = [
  "NOT_FOUND",
  "NOT_STARTED",
  "EXPIRED",
  "MIN_SUBTOTAL",
  "USAGE_LIMIT",
  "PER_CUSTOMER_LIMIT",
  "DISCOUNT_EXCEEDS_SUBTOTAL",
  "ZERO_DISCOUNT",
] as const;

type CouponErrorCode = (typeof COUPON_ERROR_KEYS)[number];

function localizedCouponError(
  code: string | null,
  rawMessage: string | null,
  isArabic: boolean
): string {
  // The RPC message is English-only; map known codes to localized copy and
  // fall back to a neutral localized message for anything unrecognized.
  const messages: Record<CouponErrorCode, { en: string; ar: string }> = {
    NOT_FOUND: {
      en: "This coupon code is not valid for this store.",
      ar: "كود الخصم غير صالح لهذا المتجر.",
    },
    NOT_STARTED: {
      en: "This coupon is not active yet.",
      ar: "لم يبدأ هذا الكود بعد.",
    },
    EXPIRED: {
      en: "This coupon has expired.",
      ar: "انتهت صلاحية هذا الكود.",
    },
    MIN_SUBTOTAL: {
      en: "Your order does not reach the minimum required for this coupon.",
      ar: "قيمة طلبك أقل من الحد الأدنى المطلوب لهذا الكود.",
    },
    USAGE_LIMIT: {
      en: "This coupon has reached its usage limit.",
      ar: "لقد وصل هذا الكود إلى الحد الأقصى للاستخدام.",
    },
    PER_CUSTOMER_LIMIT: {
      en: "You have already used this coupon the maximum number of times.",
      ar: "لقد استخدمت هذا الكود الحد الأقصى المسموح به.",
    },
    DISCOUNT_EXCEEDS_SUBTOTAL: {
      en: "This coupon discount exceeds the eligible order subtotal.",
      ar: "قيمة الخصم تتجاوز المجموع الفرعي المؤهل.",
    },
    ZERO_DISCOUNT: {
      en: "This coupon provides no discount for this order.",
      ar: "لا يوفر هذا الكود أي خصم لهذا الطلب.",
    },
  };
  const key = COUPON_ERROR_KEYS.find((k) => k === code);
  if (key) return messages[key][isArabic ? "ar" : "en"];
  if (isArabic) return "تعذر تطبيق كود الخصم. حاول مرة أخرى.";
  return rawMessage && rawMessage.length < 200
    ? rawMessage
    : "Could not apply this coupon. Please try again.";
}

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export default function CheckoutView() {
  const { store, slug, items, itemCount, subtotal, updateQuantity, removeItem, clearCart, showToast } =
    useStorefront();
  const isArabic = store.language === "ar";

  const [formData, setFormData] = useState<CheckoutFormData>({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    shippingGovernorate: "",
    shippingCity: "",
    shippingZoneId: null,
    shippingAddress: "",
    notes: "",
    paymentMethod: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<PublicOrderResult | null>(null);

  // Coupon state. Only the CODE is held; the amount shown comes from the
  // server pre-check and is revalidated (and recomputed) at order time.
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
  } | null>(null);
  const [couponMessage, setCouponMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const formatMoney = (n: number) => `${n.toLocaleString()} ${store.currency}`;

  // Active campaign context (tracked link). Prefills its linked coupon once;
  // the coupon is still validated and recomputed server-side.
  const [campaign, setCampaign] = useState<{
    token: string;
    name: string;
    couponCode: string;
  } | null>(null);

  // Read campaign context from localStorage after mount (never during render,
  // which keeps the server and client markup identical). The linked coupon is
  // only pre-filled — it is still validated server-side on Apply/checkout.
  useEffect(() => {
    const stored = readStoredCampaign(slug);
    if (!stored) return;
    const timer = window.setTimeout(() => {
      setCampaign(stored);
      if (stored.couponCode) {
        setCouponInput((prev) => prev || stored.couponCode);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [slug]);

  const hasZones = store.shippingZones.length > 0;
  const zonesForGovernorate = useMemo(() => {
    if (!hasZones) return [];
    if (!formData.shippingGovernorate) return [];
    return store.shippingZones.filter(
      (zone) => zone.governorate === formData.shippingGovernorate
    );
  }, [hasZones, store.shippingZones, formData.shippingGovernorate]);

  const governorateOptions = useMemo(() => {
    if (!hasZones) return [...GOVERNORATES];
    return Array.from(new Set(store.shippingZones.map((zone) => zone.governorate))).sort();
  }, [hasZones, store.shippingZones]);

  const shippingQuote = useMemo(
    () =>
      calculateShippingQuote({
        shippingEnabled: store.shippingEnabled,
        defaultFee: store.shippingFee,
        storeFreeShippingThreshold: store.freeShippingThreshold,
        zones: store.shippingZones,
        zoneId: formData.shippingZoneId,
        subtotal,
      }),
    [store, formData.shippingZoneId, subtotal]
  );

  // Client estimate only; authoritative totals come from the server RPC.
  const {
    estimatedShipping,
    estimatedDiscount,
    estimatedTotal,
    freeShippingGap,
    hasStockConflict,
  } = useMemo(() => {
    // Server-verified at apply time; recomputed authoritatively at order time.
    const discount = appliedCoupon ? Math.min(appliedCoupon.discountAmount, subtotal) : 0;
    return {
      estimatedShipping: shippingQuote.fee,
      estimatedDiscount: discount,
      estimatedTotal: Math.max(0, subtotal - discount) + shippingQuote.fee,
      freeShippingGap: freeShippingGapForQuote(shippingQuote, subtotal),
      hasStockConflict:
        items.some((it) => it.quantity > it.stock && it.stock > 0) ||
        items.some((it) => it.stock <= 0),
    };
  }, [shippingQuote, subtotal, items, appliedCoupon]);

  const selectedPayment = store.paymentMethods.find((pm) => pm.method === formData.paymentMethod) ?? null;
  const isCard = formData.paymentMethod === "Credit / Debit Card";

  const applyCoupon = async (codeOverride?: string) => {
    if (couponChecking) return;
    const code = (codeOverride ?? couponInput).trim();
    if (!code) return;
    setCouponChecking(true);
    setCouponMessage(null);
    try {
      // Include the entered phone (when valid) for an indicative
      // per-customer-limit check; the server normalizes it.
      const phone = /^[+]?[0-9][ \-()0-9]{4,49}$/.test(formData.customerPhone.trim())
        ? formData.customerPhone
        : undefined;
      const res = await validatePublicStoreCoupon(slug, code, subtotal, phone);
      const verdict = res.data;
      if (res.success && verdict?.valid && typeof verdict.discountAmount === "number") {
        setAppliedCoupon({ code: verdict.code ?? code.toUpperCase(), discountAmount: verdict.discountAmount });
        setCouponMessage({
          type: "success",
          text: isArabic
            ? `تم تطبيق ${verdict.code ?? code.toUpperCase()} — خصم ${verdict.discountAmount.toLocaleString()} ${store.currency}.`
            : `Applied ${verdict.code ?? code.toUpperCase()} — ${verdict.discountAmount.toLocaleString()} ${store.currency} off.`,
        });
        setCouponInput("");
      } else {
        setAppliedCoupon(null);
        setCouponMessage({
          type: "error",
          text: localizedCouponError(verdict?.errorCode ?? null, res.error ?? verdict?.message ?? null, isArabic),
        });
      }
    } catch {
      setAppliedCoupon(null);
      setCouponMessage({
        type: "error",
        text: isArabic ? "تعذر التحقق من كود الخصم." : "Could not verify this coupon.",
      });
    } finally {
      setCouponChecking(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponMessage(null);
    setCouponInput("");
  };

  if (itemCount === 0 && !placedOrder) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-zinc-200 p-12 text-center space-y-4">
          <h1 className="text-xl font-black">
            {isArabic ? "لا توجد منتجات في السلة" : "Your cart is empty"}
          </h1>
          <Link
            href={`/store/${slug}`}
            className="inline-block rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md"
            style={{ backgroundColor: store.primaryColor }}
          >
            {isArabic ? "تصفح المنتجات" : "Browse products"}
          </Link>
        </div>
      </div>
    );
  }

  // Success confirmation
  if (placedOrder) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-3xl">
            ✓
          </div>
          <h1 className="text-xl font-black text-emerald-900">
            {isArabic ? "تم إنشاء طلبك!" : "Order placed!"}
          </h1>
          <p className="text-sm text-emerald-800">
            {isArabic ? "رقم الطلب:" : "Order number:"}{" "}
            <strong className="font-mono">{placedOrder.orderNumber}</strong>
          </p>
          <div className="mx-auto max-w-sm rounded-xl border border-emerald-200 bg-white p-4 text-xs text-zinc-700 space-y-1.5">
            <div className="flex justify-between">
              <span>{isArabic ? "المنتجات" : "Items"}</span>
              <span className="font-bold">{formatMoney(placedOrder.subtotal)}</span>
            </div>
            {placedOrder.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  {isArabic ? "الخصم" : "Discount"}
                  {placedOrder.couponCode && (
                    <span className="font-mono text-[11px]"> ({placedOrder.couponCode})</span>
                  )}
                </span>
                <span className="font-bold">−{formatMoney(placedOrder.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>
                {isArabic ? "الشحن" : "Shipping"}
                {placedOrder.shippingArea && (
                  <span className="block text-[10px] text-zinc-500">
                    {placedOrder.shippingArea}
                  </span>
                )}
              </span>
              <span className="font-bold">{formatMoney(placedOrder.shippingFee)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-100 pt-1.5 text-sm">
              <span className="font-bold">{isArabic ? "الإجمالي" : "Total"}</span>
              <span className="font-black">{formatMoney(placedOrder.total)}</span>
            </div>
          </div>
          {selectedPayment && (
            <div className="mx-auto max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 text-start">
              <p className="text-xs font-bold text-amber-900 mb-1">
                {isArabic ? "طريقة الدفع:" : "Payment method:"} {placedOrder.paymentMethod}
              </p>
              {isCard ? (
                <p className="text-[11px] leading-relaxed text-amber-800">
                  {isArabic
                    ? "لا تُجمع أي بيانات بطاقة هنا. سيتواصل معك المتجر لترتيب الدفع — لم يتم معالجة أي دفعة إلكترونية."
                    : "No card details are collected here. The store will contact you to arrange payment — no online transaction has been processed."}
                </p>
              ) : (
                <p className="text-[11px] leading-relaxed text-amber-800">
                  {selectedPayment.instructions ||
                    (isArabic
                      ? "يرجى إكمال الدفع كما يشرحه المتجر عند التسليم أو التواصل."
                      : "Please complete payment as instructed by the store.")}
                </p>
              )}
            </div>
          )}
          <Link
            href={`/store/${slug}`}
            className="inline-block rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md"
            style={{ backgroundColor: store.primaryColor }}
          >
            {isArabic ? "متابعة التسوق" : "Continue shopping"}
          </Link>
        </div>
      </div>
    );
  }

  const setField = (key: keyof CheckoutFormData, value: string | PaymentMethod) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // guards double-submit

    if (formData.paymentMethod === null) {
      setError(isArabic ? "يرجى اختيار طريقة دفع." : "Please choose a payment method.");
      return;
    }

    // When the merchant configured delivery areas, the zone is mandatory and
    // its fee is resolved by the checkout RPC (never submitted by the client).
    if (hasZones) {
      if (!formData.shippingGovernorate) {
        setError(isArabic ? "يرجى اختيار المحافظة." : "Please choose your governorate.");
        return;
      }
      if (!formData.shippingZoneId) {
        setError(
          isArabic
            ? "يرجى اختيار منطقة التوصيل."
            : "Please choose a delivery area."
        );
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // the lifecycle token only marks a cart conversion server-side;
      // prices/discounts stay fully server-computed either way.
      const cartToken = getOrCreateCartToken(slug);
      const res = await submitPublicStoreOrder(
        slug,
        formData,
        items,
        appliedCoupon ? appliedCoupon.code : null,
        cartToken,
        campaign?.token ?? null
      );

      if (res.success && res.data) {
        setPlacedOrder(res.data);
        clearCart();
        showToast(isArabic ? "تم إنشاء الطلب بنجاح." : "Order created successfully.");
      } else {
        const msg = res.success ? "Order failed." : res.error || "Failed to place your order.";
        if (msg.includes("Rate limit")) {
          setError(isArabic ? "تم تجاوز حد الطلبات. حاول بعد قليل." : "Too many order attempts. Please try again in a few minutes.");
        } else {
          setError(
            isArabic && /coupon/i.test(msg)
              ? "تعذر تأكيد كود الخصم — تمت إزالته. حاول مجددًا أو أكمل الطلب بدونه."
              : msg
          );
          if (/coupon/i.test(msg)) {
            // The server rejected the coupon authoritatively; drop the stale
            // pre-check state so the displayed estimate matches reality.
            setAppliedCoupon(null);
            setCouponMessage(null);
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to place your order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-black tracking-tight sm:text-3xl">
        {isArabic ? "إتمام الشراء" : "Checkout"}
      </h1>

      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-800">
          ⚠ {error}
        </div>
      )}

      {hasStockConflict && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-semibold text-amber-900">
          {isArabic
            ? "بعض عناصر السلة تتجاوز المخزون المتوفأ — عدّل الكميات قبل الطلب."
            : "Some cart items exceed the available stock — adjust quantities before placing the order."}
        </div>
      )}
      {hasStockConflict && (
        <div className="mb-6 space-y-2">
          {items
            .filter((it) => it.quantity > it.stock || it.stock <= 0)
            .map((it) => (
              <div
                key={it.lineId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs"
              >
                <span className="font-semibold text-zinc-800">
                  {it.name}
                  {it.variantLabel && (
                    <span className="block text-[10px] font-normal text-zinc-500">
                      {it.variantLabel}
                    </span>
                  )}
                  {it.stock <= 0
                    ? ` — ${isArabic ? "غير متوفر" : "out of stock"}`
                    : ` — ${isArabic ? `المخزون ${it.stock}` : `only ${it.stock} left`}`}
                </span>
                <span className="flex gap-2">
                  {it.stock > 0 && (
                    <button
                      type="button"
                      onClick={() => updateQuantity(it.lineId, it.stock)}
                      className="rounded-lg bg-[#2563EB] px-3 py-1.5 font-bold text-white"
                    >
                      {isArabic ? "اضبط للمخزون" : `Set to ${it.stock}`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(it.lineId)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-bold text-rose-700"
                  >
                    {isArabic ? "حذف" : "Remove"}
                  </button>
                </span>
              </div>
            ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Delivery & contact form */}
        <div className="lg:col-span-3 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
          <h2 className="text-base font-bold">{isArabic ? "معلومات التوصيل" : "Delivery details"}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="checkout-name" label={isArabic ? "الاسم الكامل" : "Full name"} required>
              <input
                id="checkout-name"
                autoComplete="name"
                required
                maxLength={255}
                value={formData.customerName}
                onChange={(e) => setField("customerName", e.target.value)}
                className={inputClass}
                placeholder={isArabic ? "الاسم" : "Ahmed Mohamed"}
              />
            </Field>
            <Field
              id="checkout-phone"
              label={isArabic ? "رقم الهاتف" : "Phone number"}
              required
              hint={isArabic ? "مثال: 01012345678" : "e.g. 01012345678 (or +20 …)"}
            >
              <input
                id="checkout-phone"
                type="tel"
                autoComplete="tel"
                required
                maxLength={50}
                pattern="^\+?[0-9][ \-()0-9]{4,49}$"
                value={formData.customerPhone}
                onChange={(e) => setField("customerPhone", e.target.value)}
                className={inputClass}
                placeholder={isArabic ? "01012345678" : "01012345678"}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                id="checkout-email"
                label={isArabic ? "البريد الإلكتروني (اختياري)" : "Email (optional)"}
                hint={isArabic ? "يُستخدم لتأكيد الطلب فقط." : "Used for order confirmation only."}
              >
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  value={formData.customerEmail}
                  onChange={(e) => setField("customerEmail", e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
            <Field
              id="checkout-governorate"
              label={isArabic ? "المحافظة" : "Governorate"}
              required={hasZones}
            >
              <select
                id="checkout-governorate"
                value={formData.shippingGovernorate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    shippingGovernorate: e.target.value,
                    shippingZoneId: null,
                  }))
                }
                className={inputClass}
              >
                <option value="">{isArabic ? "اختر…" : "Select…"}</option>
                {governorateOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>

            {hasZones && (
              <Field
                id="checkout-zone"
                label={isArabic ? "منطقة التوصيل" : "Delivery area"}
                required
                hint={
                  isArabic
                    ? "تُحتسب رسوم الشحن من المنطقة المختارة على الخادم."
                    : "The shipping fee for this area is computed server-side."
                }
              >
                <select
                  id="checkout-zone"
                  required
                  disabled={!formData.shippingGovernorate}
                  value={formData.shippingZoneId ?? ""}
                  onChange={(e) => {
                    const zone =
                      store.shippingZones.find((entry) => entry.id === e.target.value) ??
                      null;
                    setFormData((prev) => ({
                      ...prev,
                      shippingZoneId: zone?.id ?? null,
                      shippingGovernorate: zone?.governorate ?? prev.shippingGovernorate,
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">
                    {formData.shippingGovernorate
                      ? isArabic
                        ? "اختر منطقة…"
                        : "Select an area…"
                      : isArabic
                        ? "اختر المحافظة أولًا"
                        : "Choose a governorate first"}
                  </option>
                  {zonesForGovernorate.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {shippingAreaLabel(zone)} — {zone.fee.toLocaleString()}{" "}
                      {store.currency}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field id="checkout-city" label={isArabic ? "المدينة" : "City"}>
              <input
                id="checkout-city"
                maxLength={100}
                value={formData.shippingCity}
                onChange={(e) => setField("shippingCity", e.target.value)}
                className={inputClass}
                placeholder={isArabic ? "المدينة" : "Nasr City"}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                id="checkout-address"
                label={isArabic ? "العنوان بالتفصيل" : "Detailed delivery address"}
                required
              >
                <textarea
                  id="checkout-address"
                  required
                  rows={3}
                  maxLength={500}
                  value={formData.shippingAddress}
                  onChange={(e) => setField("shippingAddress", e.target.value)}
                  className={inputClass}
                  placeholder={
                    isArabic
                      ? "الشارع، رقم العمارة، الطابق، علامة مميزة…"
                      : "Street, building, floor, landmark…"
                  }
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                id="checkout-notes"
                label={isArabic ? "ملاحظات للمتجر (اختياري)" : "Order notes (optional)"}
                hint={isArabic ? "حتى 1000 حرف." : "Up to 1000 characters."}
              >
                <textarea
                  id="checkout-notes"
                  rows={2}
                  maxLength={1000}
                  value={formData.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  className={inputClass}
                  placeholder={isArabic ? "أي تعليمات إضافية…" : "Any additional instructions…"}
                />
              </Field>
            </div>
          </div>

          {/* Payment methods */}
          <div className="border-t border-zinc-100 pt-4">
            <h2 className="text-base font-bold mb-3">
              {isArabic ? "طريقة الدفع" : "Payment method"} <span className="text-rose-500">*</span>
            </h2>
            {store.paymentMethods.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 text-xs text-zinc-600">
                {isArabic
                  ? "هذا المتجر لم يُمكّن أي طريقة دفع. تواصل مع المتجر مباشرة."
                  : "This store has not enabled any payment methods. Please contact the store directly."}
              </p>
            ) : (
              <div className="space-y-2">
                {store.paymentMethods.map((pm) => (
                  <label
                    key={pm.method}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      formData.paymentMethod === pm.method
                        ? "border-[#2563EB] bg-blue-50/50"
                        : "border-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      className="mt-1 accent-[#2563EB]"
                      value={pm.method}
                      checked={formData.paymentMethod === pm.method}
                      onChange={() => setField("paymentMethod", pm.method)}
                      aria-label={pm.method}
                    />
                    <span>
                      <span className="block text-xs font-bold">{pm.method}</span>
                      {formData.paymentMethod === pm.method && pm.instructions && !isCard && (
                        <span className="mt-1 block text-[11px] leading-relaxed rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-amber-900">
                          {pm.instructions}
                        </span>
                      )}
                      {formData.paymentMethod === pm.method && isCard && (
                        <span className="mt-1 block text-[11px] leading-relaxed rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-amber-900">
                          {isArabic
                            ? "لا تُقبل بيانات البطاقة في هذا المتجر على الإنترنت. سيُتّفق على الدفع مع المتجر — تسجيل الطلب فقط."
                            : "No card details are accepted online in this store. Payment will be arranged with the merchant — this only records your order."}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">
              {isArabic
                ? "لا تقم بإدخال أي بيانات بطاقة أو أرقام سرية في ملاحظات الطلب."
                : "Never enter card numbers or passwords in the order notes."}
            </p>
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-2 lg:sticky lg:top-24 h-fit space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <h2 className="text-base font-bold">{isArabic ? "ملخص الطلب" : "Order summary"}</h2>

          <ul className="space-y-2.5 max-h-72 overflow-y-auto">
            {items.map((it) => (
              <li key={it.lineId} className="flex items-start justify-between gap-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-zinc-800">{it.name}</span>
                  {it.variantLabel && (
                    <span className="block text-[10px] text-zinc-500">
                      {it.variantLabel}
                    </span>
                  )}
                  <span className="text-zinc-500">
                    {it.quantity} × {it.price.toLocaleString()}
                  </span>
                  {it.quantity > it.stock && it.stock > 0 && (
                    <span className="block font-bold text-rose-600">
                      {isArabic ? `المخزون ${it.stock}` : `over stock (${it.stock})`}
                    </span>
                  )}
                </span>
                <span className="font-bold whitespace-nowrap">
                  {formatMoney(it.price * it.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-zinc-100 pt-3 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>{isArabic ? "المجموع الفرعي" : "Subtotal"}</span>
              <span className="font-bold text-zinc-950">{formatMoney(subtotal)}</span>
            </div>
            {appliedCoupon && estimatedDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  {isArabic ? "الخصم" : "Discount"}{" "}
                  <span className="font-mono text-[11px]">({appliedCoupon.code})</span>
                </span>
                <span className="font-bold">−{formatMoney(estimatedDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span>{isArabic ? "الشحن" : "Shipping"}</span>
              <span className="font-bold text-zinc-950">
                {!store.shippingEnabled
                  ? isArabic
                    ? "غير متاح"
                    : "Not offered"
                  : !shippingQuote.available
                    ? isArabic
                      ? "اختر المنطقة"
                      : "Select area"
                    : formatMoney(estimatedShipping)}
              </span>
            </div>
            {hasZones && !shippingQuote.available && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-900">
                {isArabic
                  ? "اختر المحافظة ومنطقة التوصيل لحساب الشحن."
                  : "Choose your governorate and delivery area to calculate shipping."}
              </p>
            )}
            {freeShippingGap !== null && freeShippingGap > 0 && (
              <p className="rounded-lg bg-blue-50 border border-blue-200/60 px-3 py-1.5 text-[11px] font-semibold text-[#2563EB]">
                {isArabic
                  ? `أضف ${formatMoney(freeShippingGap)} للشحن المجاني!`
                  : `Add ${formatMoney(freeShippingGap)} more for free shipping!`}
              </p>
            )}
            <div className="flex justify-between border-t border-zinc-100 pt-2 text-base font-black">
              <span>{isArabic ? "الإجمالي التقديري" : "Estimated total"}</span>
              <span>{formatMoney(estimatedTotal)}</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {isArabic
                ? "الإجمالي النهائي يُحتسب على الخادم باستخدام أسعار المتجر ورسومه."
                : "The final total is computed server-side using the store's catalog prices and shipping settings."}
            </p>
          </div>

          {/* Campaign context (tracked link) */}
          {campaign && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px]">
              <p className="font-bold text-blue-900">
                {isArabic ? "حملة:" : "Campaign:"} {campaign.name}
              </p>
              {campaign.couponCode && (
                <p className="mt-0.5 text-blue-800">
                  {isArabic
                    ? `كود الخصم ${campaign.couponCode} تم تعبئته — اضغط تطبيق للتحقق.`
                    : `Coupon ${campaign.couponCode} was pre-filled — press Apply to verify.`}
                </p>
              )}
            </div>
          )}

          {/* Coupon entry */}
          <div className="space-y-2 border-t border-zinc-100 pt-3">
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="min-w-0 text-xs font-semibold text-emerald-900">
                  <span className="font-mono">{appliedCoupon.code}</span>
                  {" "}
                  {isArabic ? "— مطبّق ✓" : "applied ✓"}
                </span>
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  {isArabic ? "إزالة" : "Remove"}
                </button>
              </div>
            ) : (
              <div
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  maxLength={32}
                  placeholder={isArabic ? "كود الخصم" : "Coupon code"}
                  aria-label={isArabic ? "كود الخصم" : "Coupon code"}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs font-mono uppercase text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB]"
                />
                <button
                  type="button"
                  onClick={() => void applyCoupon()}
                  disabled={couponChecking || !couponInput.trim() || itemCount === 0}
                  className="rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {couponChecking ? (isArabic ? "جارٍ التحقق…" : "Checking…") : isArabic ? "تطبيق" : "Apply"}
                </button>
              </div>
            )}
            {couponMessage && (
              <p
                role="status"
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                  couponMessage.type === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border border-rose-200 text-rose-800"
                }`}
              >
                {couponMessage.text}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || itemCount === 0}
            className="w-full rounded-xl px-5 py-3 text-sm font-bold text-white shadow-md hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: store.primaryColor }}
          >
            {isSubmitting
              ? isArabic
                ? "جاري إرسال الطلب…"
                : "Placing order…"
              : isArabic
              ? "تأكيد الطلب"
              : "Place order"}
          </button>
        </aside>
      </form>
    </div>
  );
}
