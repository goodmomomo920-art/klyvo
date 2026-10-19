/**
 * Marketing campaign domain types (migration
 * 20261019000004_marketing_campaigns.sql).
 *
 * Campaigns reference existing coupons — they never create a second discount
 * engine. No email/SMS/WhatsApp/ad delivery is implemented or claimed.
 */

import type { CouponComputedStatus } from "@/types/coupons";

export type CampaignStatus = "draft" | "active" | "paused";
export type CampaignComputedStatus = "draft" | "scheduled" | "active" | "paused" | "ended";

export interface Campaign {
  id: string;
  storeId: string;
  couponId: string;
  couponCode: string;
  couponStatus: CouponComputedStatus;
  name: string;
  token: string;
  status: CampaignStatus;
  computedStatus: CampaignComputedStatus;
  startsAt: string;
  endsAt: string | null;
  productIds: string[];
  productNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignPerformance {
  campaignId: string;
  visits: number;
  attributedOrders: number;
  revenue: number;
  discountAmount: number;
}

export interface CampaignFormData {
  name: string;
  couponId: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string | null;
  productIds: string[];
}

export interface CampaignVisitResult {
  valid: boolean;
  campaignId?: string;
  campaignName?: string;
  couponCode?: string;
  alreadyCounted?: boolean;
  errorCode?: string;
}
