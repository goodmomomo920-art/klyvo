"use client";

import { useEffect, useRef } from "react";
import { useStorefront } from "@/components/storefront/StorefrontShell";
import {
  syncPublicCart,
  restorePublicCartActions,
} from "@/lib/server/cartLifecycle";
import { getPublicStoreProductDetail } from "@/lib/server/storefront";
import { getOrCreateCartToken, isValidCartTokenShape } from "@/lib/cartToken";
import { MAX_QUANTITY_PER_LINE } from "@/types/storefront";
import { CartSyncItem } from "@/types/abandonedCarts";

const SYNC_DEBOUNCE_FALLBACK_MS = 5000;

/**
 * Anonymous cart lifecycle sync for the public storefront (Feature B).
 *
 * - Debounced calls to the SECURITY DEFINER sync RPC after every cart change;
 *   the payload carries product references and quantities only (never prices,
 *   totals, or any identity beyond the anonymous random token).
 * - Empty carts delete only ACTIVE server rows; converted rows survive.
 * - Supports a customer-side recovery token (?recover=…) restoring catalog-
 *   back-to-cart items with CURRENT prices and stock — never stale prices.
 * - Failures are silently non-destructive: the feature can never break
 *   browsing, carting, or checkout.
 */
export default function CartLifecycleSync() {
  const { slug, items, addItem, showToast } = useStorefront();
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    const token = getOrCreateCartToken(slug);
    if (!token) return;

    const timer = window.setTimeout(() => {
      const payload: CartSyncItem[] = items
        .map((it) => ({
          product_id: it.productId,
          quantity: it.quantity,
        }))
        .filter(
          (it) =>
            /^[0-9a-fA-F-]{36}$/.test(it.product_id) &&
            Number.isInteger(it.quantity) &&
            it.quantity >= 1 &&
            it.quantity <= MAX_QUANTITY_PER_LINE
        );

      const syncedKey = `klyvo-cart-synced:${slug}`;
      const payloadKey = `klyvo-cart-sync-payload:${slug}`;
      const hasSynced = window.localStorage.getItem(syncedKey) === "1";
      if (payload.length === 0 && !hasSynced) return;

      const serializedPayload = JSON.stringify(payload);
      if (window.sessionStorage.getItem(payloadKey) === serializedPayload) return;

      void syncPublicCart({ slug, token, items: payload }).then((result) => {
        if (result?.success) {
          window.localStorage.setItem(syncedKey, "1");
          window.sessionStorage.setItem(payloadKey, serializedPayload);
        }
      });
    }, SYNC_DEBOUNCE_FALLBACK_MS);

    return () => window.clearTimeout(timer);
  }, [slug, items]);

  // Recovery restore, runs once per mount when the URL carries a token.
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawToken = params.get("recover");
    if (!isValidCartTokenShape(rawToken)) return;

    // Sometimes-first setState is avoided inside the effect body itself;
    // waiting-state changes happen only inside async callbacks.
    restorePublicCartActions(slug, rawToken as string)
      .then(async (res) => {
        if (res.success && res.data) {
          let restoredCount = 0;
          for (const restored of res.data) {
            const productId = restored.productId.includes(":")
              ? restored.productId.split(":")[1]
              : restored.productId;
            if (!productId || restored.stock < 1 || restored.quantity < 1) continue;

            // The abandoned-cart snapshot is product-level only and does not
            // store which variant was chosen. Re-fetch live product detail and
            // skip variant products rather than restoring a wrong base line.
            const detail = await getPublicStoreProductDetail(slug, productId);
            if (!detail?.product || detail.product.hasVariants) continue;

            addItem(
              {
                ...detail.product,
                stock: restored.stock,
              },
              Math.min(restored.quantity, restored.stock),
              false
            );
            restoredCount++;
          }
          if (restoredCount > 0) {
            showToast("Your cart was restored.");
            // Strip the token from the URL after a one-time restore.
            window.history.replaceState(null, '', window.location.pathname);
          } else {
            showToast(
              "Those products are no longer available.",
              "error"
            );
          }
        }
      })
      .catch(() => {
        /* Non-blocking: recovery is best-effort. */
      });
  }, [slug, addItem, showToast]);

  // Pure side-effect component: it renders nothing.
  return null;
}
