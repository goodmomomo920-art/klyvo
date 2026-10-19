/**
 * Discount coupon domain types, mirroring public.coupons /
 * public.coupon_usage from migration
 * 20261017000000_discount_coupons.sql.
 */

export type DiscountType = "percentage" | "fixed_amount";

export type CouponComputedStatus = "active" | "inactive" | "expired" | "scheduled";

export interface Coupon {
  id: string;
  storeId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderSubtotal: number | null;
  maxDiscountAmount: number | null;
  startsAt: string;
  expiresAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
  usageCount: number;
  /** Server-time derived status (active/inactive/expired/scheduled). */
  computedStatus: CouponComputedStatus;
  createdAt: string;
  updatedAt: string;
}

export type CouponStatusFilter = "all" | "active" | "inactive" | "expired";

export interface CouponFormData {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderSubtotal: number | null;
  maxDiscountAmount: number | null;
  startsAt: string;
  expiresAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
}

/** Result shape of the public-coupon validation RPC verdict (UX pre-check). */
export interface PublicCouponCheck {
  valid: boolean;
  errorCode: string | null;
  message: string | null;
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
}
