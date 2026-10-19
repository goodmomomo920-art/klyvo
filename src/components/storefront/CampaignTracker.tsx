"use client";

import { useEffect, useRef } from "react";
import { isValidCampaignToken } from "@/lib/campaigns";
import { recordPublicCampaignVisit } from "@/lib/server/storefront";

const campaignKey = (slug: string) => `klyvo_campaign_${slug}`;
const visitorKey = (slug: string) => `klyvo_visitor_${slug}`;

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function randomToken(bytes = 24): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  let token = "";
  for (let i = 0; i < values.length; i++) {
    token += ALPHABET[values[i] & 63];
  }
  return token;
}

function getOrCreateVisitorToken(slug: string): string | null {
  try {
    const existing = window.localStorage.getItem(visitorKey(slug));
    if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
    const fresh = randomToken();
    window.localStorage.setItem(visitorKey(slug), fresh);
    return fresh;
  } catch {
    return null;
  }
}

export interface StoredCampaign {
  token: string;
  name: string;
  couponCode: string;
}

export function readStoredCampaign(slug: string): StoredCampaign | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(campaignKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCampaign>;
    if (!isValidCampaignToken(parsed.token)) return null;
    return {
      token: parsed.token,
      name: typeof parsed.name === "string" ? parsed.name : "Campaign",
      couponCode:
        typeof parsed.couponCode === "string" ? parsed.couponCode : "",
    };
  } catch {
    return null;
  }
}

export function clearStoredCampaign(slug: string): void {
  try {
    window.localStorage.removeItem(campaignKey(slug));
  } catch {
    /* ignore */
  }
}

/**
 * Records a campaign link visit exactly once per browser token and stores the
 * campaign context (including its linked coupon code) for checkout.
 *
 * The visitor token is random, contains no personal data, and is hashed by the
 * database for deduplication. Failures never affect browsing.
 */
export default function CampaignTracker({ slug }: { slug: string }) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    let token: string | null = null;
    try {
      token = new URLSearchParams(window.location.search).get("campaign");
    } catch {
      return;
    }
    if (!isValidCampaignToken(token)) return;

    const visitor = getOrCreateVisitorToken(slug);
    if (!visitor) return;

    void recordPublicCampaignVisit(slug, token, visitor)
      .then((res) => {
        if (!res.success || !res.data?.valid) {
          clearStoredCampaign(slug);
          return;
        }
        try {
          window.localStorage.setItem(
            campaignKey(slug),
            JSON.stringify({
              token,
              name: res.data.campaignName ?? "Campaign",
              couponCode: res.data.couponCode ?? "",
            } satisfies StoredCampaign)
          );
        } catch {
          /* storage unavailable */
        }
      })
      .catch(() => {
        /* measurement is non-blocking */
      });
  }, [slug]);

  return null;
}
