"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  CartItem,
  MAX_QUANTITY_PER_LINE,
  PublicStoreConfig,
  PublicProduct,
} from "@/types/storefront";
import type { PublicVariant } from "@/types/variants";
import CartLifecycleSync from "@/components/storefront/CartLifecycleSync";
import CampaignTracker from "@/components/storefront/CampaignTracker";
import { cartLineId, formatVariantLabel } from "@/lib/variants";
import { fontFamilyStack } from "@/lib/appearance";

interface StorefrontContextValue {
  store: PublicStoreConfig;
  slug: string;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (
    product: PublicProduct,
    qty: number,
    showFeedback?: boolean,
    variant?: PublicVariant | null
  ) => boolean;
  updateQuantity: (lineId: string, qty: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

interface StoreShellProps {
  store: PublicStoreConfig;
  slug: string;
  children: React.ReactNode;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

export function useStorefront(): StorefrontContextValue {
  const ctx = useContext(StorefrontContext);
  if (!ctx) {
    throw new Error("useStorefront must be used inside a StorefrontShell.");
  }
  return ctx;
}

const cartStorageKey = (slug: string) => `klyvo_cart_${slug}`;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

// Module-level cache so useSyncExternalStore snapshots stay referentially
// stable while external-system state (localStorage) is the single source of
// truth for the cart.
const cartCache = new Map<string, CartItem[]>();
const cartListeners = new Set<() => void>();

function readCart(slug: string): CartItem[] {
  if (cartCache.has(slug)) return cartCache.get(slug)!;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cartStorageKey(slug));
    const parsed = sanitizeCart(raw ? JSON.parse(raw) : null, slug);
    cartCache.set(slug, parsed);
    return parsed;
  } catch {
    cartCache.set(slug, []);
    return [];
  }
}

function writeCart(slug: string, items: CartItem[]): void {
  cartCache.set(slug, items);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(cartStorageKey(slug), JSON.stringify(items));
    }
  } catch {
    // Storage unavailable; memory cache still keeps the session cart.
  }
  for (const notify of cartListeners) notify();
}

function subscribeCart(notify: () => void): () => void {
  cartListeners.add(notify);
  return () => {
    cartListeners.delete(notify);
  };
}

function useStoreCart(slug: string) {
  const items = useSyncExternalStore(
    subscribeCart,
    () => readCart(slug),
    () => EMPTY_CART
  );
  const setItems = useCallback(
    (updater: (prev: CartItem[]) => CartItem[]) => {
      writeCart(slug, updater(readCart(slug)));
    },
    [slug]
  );
  return [items, setItems] as const;
}

const EMPTY_CART: CartItem[] = [];

/**
 * Reads and migrates stored cart lines.
 * - Legacy lines stored "<slug>:<productId>" with no variant; they are upgraded
 *   to the new {lineId, productId, variantId} shape.
 * - Anything not belonging to this store, malformed, or negative is dropped.
 */
function sanitizeCart(raw: unknown, slug: string): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: CartItem[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;

    const storedProductId = String(record.productId ?? "");
    const storedLineId = String(record.lineId ?? "");

    let productId = storedProductId;
    let variantId =
      typeof record.variantId === "string" && UUID_RE.test(record.variantId)
        ? record.variantId
        : null;

    if (productId.startsWith(`${slug}:`)) {
      const rest = productId.slice(slug.length + 1);
      const [parsedProductId, parsedVariantId] = rest.split(":");
      productId = parsedProductId;
      if (!variantId && parsedVariantId && UUID_RE.test(parsedVariantId)) {
        variantId = parsedVariantId;
      }
    } else if (storedLineId.startsWith(`${slug}:`)) {
      const rest = storedLineId.slice(slug.length + 1);
      const [parsedProductId, parsedVariantId] = rest.split(":");
      productId = parsedProductId;
      if (!variantId && parsedVariantId && UUID_RE.test(parsedVariantId)) {
        variantId = parsedVariantId;
      }
    }

    if (!UUID_RE.test(productId)) continue;

    const lineId = cartLineId(slug, productId, variantId);
    if (seen.has(lineId)) continue;
    seen.add(lineId);

    const quantity = Number(record.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) continue;

    items.push({
      lineId,
      productId,
      variantId,
      variantLabel:
        typeof record.variantLabel === "string" && record.variantLabel
          ? record.variantLabel
          : null,
      name: String(record.name ?? "Product"),
      price: Math.max(0, Number(record.price ?? 0)),
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : null,
      quantity: Math.min(quantity, MAX_QUANTITY_PER_LINE),
      stock: Math.max(0, Number(record.stock ?? 0)),
    });
  }

  return items;
}

export default function StorefrontShell({ store, slug, children }: StoreShellProps) {
  const [items, setItems] = useStoreCart(slug);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const addItem = useCallback(
    (
      product: PublicProduct,
      qty: number,
      showFeedback = true,
      variant: PublicVariant | null = null
    ) => {
      if (product.hasVariants && !variant) {
        if (showFeedback) {
          showToast("Choose the product options first.", "error");
        }
        return false;
      }

      const effectiveStock = variant ? variant.stock : product.stock;
      const effectivePrice = variant ? variant.price : product.price;

      if (effectiveStock < 1) {
        showToast("This option is out of stock.", "error");
        return false;
      }

      const quantity = Math.max(1, Math.min(Number(qty) || 1, MAX_QUANTITY_PER_LINE));
      const lineId = cartLineId(slug, product.id, variant?.id);
      const variantLabel = variant
        ? formatVariantLabel(variant.optionValueIds, product.options) || "Selected option"
        : null;

      setItems((prev) => {
        const existing = prev.find((it) => it.lineId === lineId);
        if (existing) {
          const capped = Math.min(existing.quantity + quantity, effectiveStock);
          if (capped === existing.quantity) {
            showToast(`Only ${effectiveStock} unit(s) available.`, "error");
          } else if (showFeedback) {
            showToast("Cart quantity updated.");
          }
          return prev.map((it) =>
            it.lineId === lineId
              ? {
                  ...it,
                  quantity: capped,
                  stock: effectiveStock,
                  price: effectivePrice,
                }
              : it
          );
        }
        if (showFeedback) showToast("Added to cart.");
        return [
          ...prev,
          {
            lineId,
            productId: product.id,
            variantId: variant?.id ?? null,
            variantLabel,
            name: product.name,
            price: effectivePrice,
            imageUrl: product.imageUrl,
            quantity: Math.min(quantity, effectiveStock),
            stock: effectiveStock,
          },
        ];
      });
      return true;
    },
    [showToast, slug, setItems]
  );

  const updateQuantity = useCallback(
    (lineId: string, qty: number) => {
      const nextQty = Math.max(0, Math.min(Number(qty) || 0, MAX_QUANTITY_PER_LINE));
      setItems((prev) => {
        if (nextQty <= 0) {
          return prev.filter((it) => it.lineId !== lineId);
        }
        return prev.map((it) =>
          it.lineId === lineId
            ? { ...it, quantity: Math.min(nextQty, Math.max(1, it.stock)) }
            : it
        );
      });
    },
    [setItems]
  );

  const removeItem = useCallback(
    (lineId: string) => {
      setItems((prev) => prev.filter((it) => it.lineId !== lineId));
    },
    [setItems]
  );

  const clearCart = useCallback(() => setItems(() => []), [setItems]);

  const itemCount = useMemo(() => items.reduce((acc, it) => acc + it.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.price * it.quantity, 0),
    [items]
  );

  const contextValue: StorefrontContextValue = useMemo(
    () => ({
      store,
      slug,
      items,
      itemCount,
      subtotal,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      showToast,
    }),
    [store, slug, items, itemCount, subtotal, addItem, updateQuantity, removeItem, clearCart, showToast]
  );

  const isArabic = store.language === "ar";
  const dir = isArabic ? "rtl" : "ltr";

  return (
    <StorefrontContext.Provider value={contextValue}>
      <CartLifecycleSync />
      <CampaignTracker slug={slug} />
      <div
        dir={dir}
        className="flex min-h-screen flex-col bg-white text-zinc-950"
        style={{ fontFamily: fontFamilyStack(store.appearance.fontFamily) }}
      >
        {/* Header */}
        <header
          className="sticky top-0 z-40 border-b border-white/10"
          style={{ backgroundColor: store.secondaryColor }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href={`/store/${slug}`} className="flex min-w-0 items-center gap-2.5">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logoUrl}
                  alt={`${store.name} logo`}
                  className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-black text-white"
                  style={{ backgroundColor: store.primaryColor }}
                >
                  {store.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="truncate text-base font-black tracking-tight text-white sm:text-lg">
                {store.name}
              </span>
              <span
                className="hidden rounded-full border px-2 py-0.5 text-[10px] font-bold text-white sm:inline"
                style={{ borderColor: store.primaryColor, color: store.primaryColor }}
              >
                {store.currency}
              </span>
            </Link>

            <nav className="flex flex-shrink-0 items-center gap-2" aria-label="Store navigation">
              <Link
                href={`/store/${slug}`}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                {isArabic ? "المنتجات" : "Products"}
              </Link>
              <Link
                href={`/store/${slug}/cart`}
                className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                style={{ backgroundColor: store.primaryColor }}
              >
                {isArabic ? "السلة" : "Cart"}
                {itemCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-zinc-950">
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </Link>
            </nav>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            className={`mx-auto mt-3 w-[calc(100%-2rem)] max-w-6xl rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold border ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
          >
            {toast.type === "success" ? "✓ " : "⚠ "}
            {toast.message}
          </div>
        )}

        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer
          className="mt-12 border-t border-white/10 py-8 text-center"
          style={{ backgroundColor: store.secondaryColor }}
        >
          <p className="px-4 text-xs text-zinc-400">
            {store.description ||
              `${store.name}${store.governorate ? ` · ${store.governorate}, Egypt` : ""}`}
          </p>
          <p className="mt-2 text-[11px] font-mono" style={{ color: store.primaryColor }}>
            Powered by Klyvo
          </p>
        </footer>
      </div>
    </StorefrontContext.Provider>
  );
}
