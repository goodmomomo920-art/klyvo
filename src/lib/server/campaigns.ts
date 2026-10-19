"use server";

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { deriveCampaignStatus } from "@/lib/campaigns";
import {
  Campaign,
  CampaignFormData,
  CampaignPerformance,
  CampaignStatus,
} from "@/types/campaigns";
import type { CouponComputedStatus } from "@/types/coupons";
import type {
  CampaignOrderRow,
  CampaignVisitRow,
  MarketingCampaignRow,
} from "@/types/database";

/**
 * Server Actions for marketing campaigns.
 *
 * - Campaigns reference an existing coupon; no second discount engine exists.
 * - Store scope is taken from the session and every query is store-filtered
 *   (plus RLS). Selected products are validated to belong to the store both in
 *   this action and by a database trigger.
 * - Tokens are cryptographically random and only identify a campaign. Visits
 *   and attributed orders are measured by dedicated RPCs; the dashboard shows
 *   exactly those measurements and labels attribution as same-browser.
 * - No email/SMS/WhatsApp/ad-platform delivery is implemented.
 */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type CampaignResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type CampaignRowWithCoupon = MarketingCampaignRow & {
  coupons?: {
    id?: string;
    code?: string;
    is_active?: boolean;
    starts_at?: string;
    expires_at?: string | null;
  } | null;
};

function couponStatus(
  coupon: NonNullable<CampaignRowWithCoupon["coupons"]>
): CouponComputedStatus {
  const now = Date.now();
  const expired =
    coupon.expires_at !== null &&
    coupon.expires_at !== undefined &&
    new Date(coupon.expires_at).getTime() <= now;
  const scheduled =
    coupon.starts_at !== undefined &&
    new Date(coupon.starts_at).getTime() > now;
  if (expired) return "expired";
  if (coupon.is_active === false) return "inactive";
  if (scheduled) return "scheduled";
  return "active";
}

function mapCampaign(
  row: CampaignRowWithCoupon,
  visits: number,
  performance: CampaignPerformance,
  productNames: Map<string, string>
): Campaign {
  const status = deriveCampaignStatus(
    {
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    },
    Date.now()
  );

  return {
    id: row.id,
    storeId: row.store_id,
    couponId: row.coupon_id,
    couponCode: row.coupons?.code ?? "—",
    couponStatus: row.coupons ? couponStatus(row.coupons) : "inactive",
    name: row.name,
    token: row.token,
    status: row.status,
    computedStatus: status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    productIds: Array.isArray(row.product_ids) ? row.product_ids : [],
    productNames: (Array.isArray(row.product_ids) ? row.product_ids : [])
      .map((id) => productNames.get(id))
      .filter((name): name is string => Boolean(name)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAuthorizedStoreCampaigns(): Promise<
  CampaignResult<{
    campaigns: Campaign[];
    performance: CampaignPerformance[];
    storeSlug: string;
  }>
> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select(
      "*, coupons(id, code, is_active, starts_at, expires_at)"
    )
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      return {
        success: false,
        error:
          "Campaigns table is missing. Apply migration 20261019000004_marketing_campaigns.sql in Supabase first.",
      };
    }
    return { success: false, error: error.message };
  }

  const rows = (data ?? []) as CampaignRowWithCoupon[];
  const campaignIds = rows.map((row) => row.id);

  const visitsByCampaign = new Map<string, number>();
  const ordersByCampaign = new Map<string, { orders: number; revenue: number; discount: number }>();

  if (campaignIds.length > 0) {
    const [{ data: visits, error: visitsError }, { data: attributed, error: attributedError }] =
      await Promise.all([
        supabase
          .from("campaign_visits")
          .select("campaign_id")
          .eq("store_id", store.id)
          .in("campaign_id", campaignIds),
        supabase
          .from("campaign_orders")
          .select("campaign_id, revenue, discount_amount")
          .eq("store_id", store.id)
          .in("campaign_id", campaignIds),
      ]);

    if (visitsError || attributedError) {
      return {
        success: false,
        error: visitsError?.message || attributedError?.message || "Failed to load campaign measurements.",
      };
    }

    for (const visit of (visits ?? []) as Pick<CampaignVisitRow, "campaign_id">[]) {
      visitsByCampaign.set(
        visit.campaign_id,
        (visitsByCampaign.get(visit.campaign_id) ?? 0) + 1
      );
    }

    for (const order of (attributed ?? []) as Array<
      Pick<CampaignOrderRow, "campaign_id" | "revenue" | "discount_amount">
    >) {
      const current = ordersByCampaign.get(order.campaign_id) ?? {
        orders: 0,
        revenue: 0,
        discount: 0,
      };
      ordersByCampaign.set(order.campaign_id, {
        orders: current.orders + 1,
        revenue: current.revenue + Number(order.revenue),
        discount: current.discount + Number(order.discount_amount),
      });
    }
  }

  const allProductIds = Array.from(
    new Set(rows.flatMap((row) => (Array.isArray(row.product_ids) ? row.product_ids : [])))
  );
  const productNames = new Map<string, string>();
  if (allProductIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name")
      .eq("store_id", store.id)
      .in("id", allProductIds);
    for (const product of (products ?? []) as Array<{ id: string; name: string }>) {
      productNames.set(product.id, product.name);
    }
  }

  const performance: CampaignPerformance[] = rows.map((row) => {
    const orders = ordersByCampaign.get(row.id);
    return {
      campaignId: row.id,
      visits: visitsByCampaign.get(row.id) ?? 0,
      attributedOrders: orders?.orders ?? 0,
      revenue: Math.round((orders?.revenue ?? 0) * 100) / 100,
      discountAmount: Math.round((orders?.discount ?? 0) * 100) / 100,
    };
  });

  return {
    success: true,
    data: {
      campaigns: rows.map((row) =>
        mapCampaign(
          row,
          visitsByCampaign.get(row.id) ?? 0,
          performance.find((entry) => entry.campaignId === row.id) ?? {
            campaignId: row.id,
            visits: 0,
            attributedOrders: 0,
            revenue: 0,
            discountAmount: 0,
          },
          productNames
        )
      ),
      performance,
      storeSlug: store.slug,
    },
  };
}

interface ValidatedCampaign {
  name: string;
  couponId: string;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string | null;
  productIds: string[];
}

async function validateCampaign(
  storeId: string,
  input: CampaignFormData
): Promise<{ ok: true; value: ValidatedCampaign } | { ok: false; error: string }> {
  const name = (input.name ?? "").trim();
  if (name.length < 1 || name.length > 120) {
    return { ok: false, error: "Campaign name must be 1–120 characters." };
  }

  if (!input.couponId || !UUID_RE.test(input.couponId)) {
    return { ok: false, error: "Choose one of your coupons for this campaign." };
  }

  if (!["draft", "active", "paused"].includes(input.status)) {
    return { ok: false, error: "Invalid campaign status." };
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "A valid campaign start date is required." };
  }

  let endsAt: string | null = null;
  if (input.endsAt) {
    const parsedEnd = new Date(input.endsAt);
    if (Number.isNaN(parsedEnd.getTime())) {
      return { ok: false, error: "Campaign end date is invalid." };
    }
    if (parsedEnd.getTime() <= startsAt.getTime()) {
      return { ok: false, error: "Campaign end must be after its start." };
    }
    endsAt = parsedEnd.toISOString();
  }

  const productIds = Array.isArray(input.productIds)
    ? Array.from(new Set(input.productIds.filter((id) => UUID_RE.test(id))))
    : [];
  if (productIds.length > 200) {
    return { ok: false, error: "A campaign can select at most 200 products." };
  }

  const supabase = await createClient();

  const { data: coupon, error: couponError } = await supabase
    .from("coupons")
    .select("id, code")
    .eq("id", input.couponId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (couponError || !coupon) {
    return { ok: false, error: "That coupon does not belong to this store." };
  }

  if (productIds.length > 0) {
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id")
      .eq("store_id", storeId)
      .in("id", productIds);

    if (productsError) {
      return { ok: false, error: productsError.message };
    }
    if ((products ?? []).length !== productIds.length) {
      return {
        ok: false,
        error: "One or more selected products do not belong to this store.",
      };
    }
  }

  return {
    ok: true,
    value: {
      name,
      couponId: input.couponId,
      status: input.status as CampaignStatus,
      startsAt: startsAt.toISOString(),
      endsAt,
      productIds,
    },
  };
}

async function insertCampaignWithToken(
  storeId: string,
  value: ValidatedCampaign
): Promise<{ data: MarketingCampaignRow } | { error: string }> {
  const supabase = await createClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const token = crypto.randomBytes(24).toString("base64url");
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        store_id: storeId,
        coupon_id: value.couponId,
        name: value.name,
        token,
        status: value.status,
        starts_at: value.startsAt,
        ends_at: value.endsAt,
        product_ids: value.productIds,
      })
      .select("*, coupons(id, code, is_active, starts_at, expires_at)")
      .single();

    if (!error && data) {
      return { data: data as MarketingCampaignRow };
    }
    if (error?.code !== "23505") {
      return { error: error?.message || "Failed to create campaign." };
    }
  }

  return { error: "Could not allocate a unique campaign link. Please try again." };
}

export async function createAuthorizedStoreCampaign(
  input: CampaignFormData
): Promise<CampaignResult<{ campaign: Campaign; performance: CampaignPerformance }>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const checked = await validateCampaign(store.id, input);
  if (!checked.ok) return { success: false, error: checked.error };

  const created = await insertCampaignWithToken(store.id, checked.value);
  if ("error" in created) {
    if (created.error.includes("marketing_campaigns") && created.error.includes("does not exist")) {
      return {
        success: false,
        error:
          "Campaigns table is missing. Apply migration 20261019000004_marketing_campaigns.sql in Supabase first.",
      };
    }
    return { success: false, error: created.error };
  }

  const row = created.data as CampaignRowWithCoupon;
  const performance: CampaignPerformance = {
    campaignId: row.id,
    visits: 0,
    attributedOrders: 0,
    revenue: 0,
    discountAmount: 0,
  };

  return {
    success: true,
    data: {
      campaign: mapCampaign(row, 0, performance, new Map()),
      performance,
    },
  };
}

export async function updateAuthorizedStoreCampaign(
  campaignId: string,
  input: CampaignFormData
): Promise<CampaignResult<Campaign>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const checked = await validateCampaign(store.id, input);
  if (!checked.ok) return { success: false, error: checked.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .update({
      coupon_id: checked.value.couponId,
      name: checked.value.name,
      status: checked.value.status,
      starts_at: checked.value.startsAt,
      ends_at: checked.value.endsAt,
      product_ids: checked.value.productIds,
    })
    .eq("id", campaignId)
    .eq("store_id", store.id)
    .select("*, coupons(id, code, is_active, starts_at, expires_at)")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to update campaign." };
  }

  const row = data as CampaignRowWithCoupon;
  return {
    success: true,
    data: mapCampaign(row, 0, {
      campaignId: row.id,
      visits: 0,
      attributedOrders: 0,
      revenue: 0,
      discountAmount: 0,
    }, new Map()),
  };
}

export async function setAuthorizedCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<CampaignResult<Campaign>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }
  if (!["draft", "active", "paused"].includes(status)) {
    return { success: false, error: "Invalid campaign status." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .update({ status })
    .eq("id", campaignId)
    .eq("store_id", store.id)
    .select("*, coupons(id, code, is_active, starts_at, expires_at)")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to update campaign status." };
  }

  const row = data as CampaignRowWithCoupon;
  return {
    success: true,
    data: mapCampaign(row, 0, {
      campaignId: row.id,
      visits: 0,
      attributedOrders: 0,
      revenue: 0,
      discountAmount: 0,
    }, new Map()),
  };
}

export async function deleteAuthorizedStoreCampaign(
  campaignId: string
): Promise<CampaignResult<undefined>> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("campaign_orders")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("store_id", store.id);

  if (count && count > 0) {
    return {
      success: false,
      error:
        "This campaign has attributed orders and cannot be deleted. Pause or end it instead to keep your measurements.",
    };
  }

  const { error } = await supabase
    .from("marketing_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("store_id", store.id);

  if (error) {
    if (error.code === "23503") {
      return {
        success: false,
        error:
          "This campaign has attributed orders and cannot be deleted. Pause or end it instead.",
      };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: undefined };
}
