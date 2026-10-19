import type {
  CampaignComputedStatus,
  CampaignStatus,
} from "../types/campaigns";

/**
 * Campaign helpers. Status is derived server-side from the stored status plus
 * the campaign window, so the dashboard and storefront never disagree.
 */

export interface CampaignWindow {
  status: CampaignStatus;
  startsAt: string;
  endsAt: string | null;
}

export function deriveCampaignStatus(
  campaign: CampaignWindow,
  nowMs: number
): CampaignComputedStatus {
  if (campaign.status === "draft") return "draft";
  if (campaign.status === "paused") return "paused";

  const start = Date.parse(campaign.startsAt);
  const end = campaign.endsAt ? Date.parse(campaign.endsAt) : null;

  if (Number.isFinite(start) && start > nowMs) return "scheduled";
  if (end !== null && Number.isFinite(end) && end <= nowMs) return "ended";
  return "active";
}

export function campaignStatusLabel(
  status: CampaignComputedStatus
): string {
  switch (status) {
    case "active":
      return "Active";
    case "scheduled":
      return "Scheduled";
    case "ended":
      return "Ended";
    case "paused":
      return "Paused";
    case "draft":
    default:
      return "Draft";
  }
}

export function isValidCampaignToken(token: unknown): token is string {
  return (
    typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token)
  );
}

/** Relative tracked storefront link for a campaign. */
export function buildCampaignLink(slug: string, token: string): string {
  return `/store/${encodeURIComponent(slug)}?campaign=${encodeURIComponent(token)}`;
}

/** Attributed orders per tracked visit; null until at least one visit exists. */
export function conversionRate(
  visits: number,
  attributedOrders: number
): number | null {
  if (!Number.isFinite(visits) || visits <= 0) return null;
  return Math.round((attributedOrders / visits) * 10000) / 100;
}

export function performanceMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
