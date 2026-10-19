import type { PaymentMethod } from "@/types/database";
import type { StoreAppearance } from "@/types/appearance";
import type { PublicShippingZone } from "@/types/shipping";
import type { ProductOption, PublicVariant } from "@/types/variants";

/**
 * Storefront domain types for the public customer-facing store.
 * These mirror the safe projections returned by the public RPC functions
 * (migrations 20261016000005 and 20261019000005).
 */

export interface PublicStoreConfig {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  language: "en" | "ar";
  currency: string;
  shippingEnabled: boolean;
  shippingFee: number;
  freeShippingThreshold: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  governorate: string | null;
  paymentMethods: PublicPaymentMethod[];
  /** Published appearance, normalized with safe defaults. */
  appearance: StoreAppearance;
  /** Active delivery areas. Empty means store default shipping applies. */
  shippingZones: PublicShippingZone[];
}

export interface PublicPaymentMethod {
  method: PaymentMethod;
  instructions: string;
}

export interface PublicProduct {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  description: string;
  category: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  imageUrl: string | null;
  hasVariants: boolean;
  options: ProductOption[];
  variants: PublicVariant[];
  /** Rounded average over published reviews; 0 when none. */
  ratingAverage: number;
  reviewCount: number;
}

export interface PublicProductPage {
  products: PublicProduct[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PublicProductDetail {
  product: PublicProduct | null;
}

export interface PublicOrderResult {
  orderId: string;
  orderNumber: string;
  subtotal: number;
  /** Server-computed coupon discount. 0 when no coupon was used. */
  discountAmount: number;
  /** Uppercase coupon code recorded by the server; null when unused. */
  couponCode: string | null;
  shippingFee: number;
  /** Selected delivery zone, or null when store-default shipping applied. */
  shippingZoneId: string | null;
  shippingArea: string | null;
  total: number;
  currency: string;
  paymentMethod: PaymentMethod;
}

/**
 * One cart line = one product/variant combination. `lineId` is the stable
 * localStorage identity; `productId` is the raw catalog UUID sent to checkout.
 */
export interface CartItem {
  lineId: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
  stock: number;
}

export interface CheckoutFormData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingCity: string;
  shippingGovernorate: string;
  /** Required when the store has active shipping zones. */
  shippingZoneId: string | null;
  shippingAddress: string;
  notes: string;
  paymentMethod: PaymentMethod | null;
}

export const MAX_QUANTITY_PER_LINE = 100000;
