"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStorefront } from "@/components/storefront/StorefrontShell";
import { calculateShippingQuote, freeShippingGap as freeShippingGapForQuote } from "@/lib/shipping";

export default function CartView() {
  const { store, slug, items, itemCount, subtotal, updateQuantity, removeItem, clearCart, showToast } =
    useStorefront();
  const isArabic = store.language === "ar";

  // Estimated totals are convenience only; the server recomputes authoritative
  // values from the selected delivery zone at checkout.
  const { estimatedShipping, estimatedTotal, freeShippingGap, hasZones } = useMemo(() => {
    if (!store.shippingEnabled) {
      return {
        estimatedShipping: 0,
        estimatedTotal: subtotal,
        freeShippingGap: 0,
        hasZones: store.shippingZones.length > 0,
      };
    }

    if (store.shippingZones.length > 0) {
      // Without a governorate/area choice the cart shows the lowest available
      // fee (“from”). Checkout computes the exact zone fee server-side.
      const minFee = Math.min(...store.shippingZones.map((zone) => zone.fee));
      return {
        estimatedShipping: minFee,
        estimatedTotal: subtotal + minFee,
        freeShippingGap: 0,
        hasZones: true,
      };
    }

    const quote = calculateShippingQuote({
      shippingEnabled: store.shippingEnabled,
      defaultFee: store.shippingFee,
      storeFreeShippingThreshold: store.freeShippingThreshold,
      zones: [],
      zoneId: null,
      subtotal,
    });

    return {
      estimatedShipping: quote.fee,
      estimatedTotal: subtotal + quote.fee,
      freeShippingGap: freeShippingGapForQuote(quote, subtotal) ?? 0,
      hasZones: false,
    };
  }, [store, subtotal]);

  const formatMoney = (n: number) => `${n.toLocaleString()} ${store.currency}`;

  if (itemCount === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-zinc-200 p-12 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl">
            🛒
          </div>
          <h1 className="text-xl font-black">
            {isArabic ? "سلتك فارغة" : "Your cart is empty"}
          </h1>
          <p className="text-xs text-zinc-500">
            {isArabic
              ? "أضف منتجات من صفحة المتجر لتتمكن من إتمام الشراء."
              : "Add products from the store page to start shopping."}
          </p>
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          {isArabic ? "سلة المشتريات" : "Cart"}
        </h1>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const lineId = item.lineId;
          const lineTotal = item.price * item.quantity;
          const overStock = item.quantity > item.stock;
          return (
            <div
              key={lineId}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-center gap-3">
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-300 text-xl">
                      📦
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/store/${slug}/product/${item.productId}`}
                    className="block truncate text-sm font-bold hover:text-[#2563EB]"
                  >
                    {item.name}
                  </Link>
                  {item.variantLabel && (
                    <p className="text-[11px] font-semibold text-zinc-600">
                      {item.variantLabel}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {item.price.toLocaleString()} {store.currency} × {item.quantity}
                    {overStock && (
                      <span className="ml-2 font-bold text-rose-600">
                        {isArabic
                          ? `المخزون ${item.stock} فقط`
                          : `Only ${item.stock} left in stock`}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                <div className="flex items-center rounded-xl border border-zinc-200">
                  <button
                    type="button"
                    aria-label={isArabic ? "إنقاص" : "Decrease"}
                    onClick={() => updateQuantity(lineId, item.quantity - 1)}
                    className="px-3 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-950"
                  >
                    −
                  </button>
                  <span className="w-10 border-x border-zinc-200 text-center text-sm font-bold py-2">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={isArabic ? "زيادة" : "Increase"}
                    disabled={item.quantity >= item.stock}
                    onClick={() =>
                      updateQuantity(lineId, item.quantity + 1)
                    }
                    className="px-3 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-950 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <span className="min-w-24 text-sm font-black text-right">
                  {formatMoney(lineTotal)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    removeItem(lineId);
                    showToast(isArabic ? "تم حذف المنتج." : "Item removed.", "error");
                  }}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                  aria-label={`${isArabic ? "حذف" : "Remove"} ${item.name}`}
                >
                  {isArabic ? "حذف" : "Remove"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-2.5">
        <div className="flex justify-between text-sm text-zinc-600">
          <span>{isArabic ? "المجموع الفرعي" : "Subtotal"}</span>
          <span className="font-bold text-zinc-950">{formatMoney(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-zinc-600">
          <span>{isArabic ? "تقدير الشحن" : "Shipping estimate"}</span>
          <span className="font-bold text-zinc-950">
            {!store.shippingEnabled
              ? isArabic
                ? "غير متاح"
                : "Not offered"
              : hasZones
                ? `${isArabic ? "من" : "From"} ${formatMoney(estimatedShipping)}`
                : formatMoney(estimatedShipping)}
          </span>
        </div>
        {hasZones && (
          <p className="text-[11px] text-zinc-500">
            {isArabic
              ? "تُحدد رسوم الشحن النهائية حسب المحافظة/المنطقة في صفحة الدفع."
              : "The exact fee is calculated from your governorate and delivery area at checkout."}
          </p>
        )}
        {freeShippingGap > 0 && (
          <p className="text-[11px] font-semibold rounded-lg bg-blue-50 border border-blue-200/60 px-3 py-1.5 text-[#2563EB]">
            {isArabic
              ? `أضف ${formatMoney(freeShippingGap)} للحصول على شحن مجاني!`
              : `Add ${formatMoney(freeShippingGap)} more for free shipping!`}
          </p>
        )}
        <div className="flex justify-between border-t border-zinc-100 pt-2.5 text-base font-black">
          <span>{isArabic ? "الإجمالي التقديري" : "Estimated total"}</span>
          <span>{formatMoney(estimatedTotal)}</span>
        </div>
        <p className="text-[11px] text-zinc-400">
          {isArabic
            ? "الإجمالي النهائي يُحتسب على الخادم عند اكتمال الطلب."
            : "The final total is computed server-side when the order is created."}
        </p>
        <Link
          href={`/store/${slug}/checkout`}
          className="mt-2 block w-full rounded-xl px-5 py-3 text-center text-sm font-bold text-white shadow-md hover:opacity-90"
          style={{ backgroundColor: store.primaryColor }}
        >
          {isArabic ? "إتمام الشراء" : "Proceed to checkout"}
          {overStockCount(items) > 0 &&
            ` (${overStockCount(items)} ${isArabic ? "عنصر يتجاوز المخزون" : "item(s) over stock"})`}
        </Link>
        <button
          type="button"
          onClick={() => {
            clearCart();
            showToast(isArabic ? "تم تفريغ السلة." : "Cart cleared.");
          }}
          className="block w-full rounded-xl border border-zinc-200 px-5 py-2.5 text-center text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          {isArabic ? "تفريغ السلة" : "Clear cart"}
        </button>
      </div>
    </div>
  );
}

function overStockCount(arr: Array<{ quantity: number; stock: number }>): number {
  return arr.filter((it) => it.quantity > it.stock).length;
}
