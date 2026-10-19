"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Campaign, CampaignPerformance } from "@/types/campaigns";
import type { Coupon } from "@/types/coupons";
import type { Product } from "@/types/product";
import {
  deleteAuthorizedStoreCampaign,
  getAuthorizedStoreCampaigns,
  setAuthorizedCampaignStatus,
} from "@/lib/server/campaigns";
import { getAuthorizedStoreCoupons } from "@/lib/server/coupons";
import { getAuthorizedStoreProducts } from "@/lib/server/products";
import CampaignModal from "@/components/dashboard/CampaignModal";
import {
  buildCampaignLink,
  campaignStatusLabel,
  conversionRate,
} from "@/lib/campaigns";

const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  scheduled: "border-blue-200 bg-blue-50 text-blue-800",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  ended: "border-zinc-200 bg-zinc-100 text-zinc-600",
  draft: "border-zinc-200 bg-white text-zinc-600",
};

function money(value: number, currency: string): string {
  return `${value.toLocaleString()} ${currency}`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [performance, setPerformance] = useState<CampaignPerformance[]>([]);
  const [storeSlug, setStoreSlug] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const loadCampaigns = useCallback(async () => {
    const res = await getAuthorizedStoreCampaigns();
    if (res.success) {
      setCampaigns(res.data.campaigns);
      setPerformance(res.data.performance);
      setStoreSlug(res.data.storeSlug);
    } else {
      setLoadError(res.error);
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [campaignRes, couponRes, productRes] = await Promise.all([
        getAuthorizedStoreCampaigns(),
        getAuthorizedStoreCoupons(),
        getAuthorizedStoreProducts(),
      ]);

      if (campaignRes.success) {
        setCampaigns(campaignRes.data.campaigns);
        setPerformance(campaignRes.data.performance);
        setStoreSlug(campaignRes.data.storeSlug);
      } else {
        setLoadError(campaignRes.error);
      }

      setCoupons(couponRes.success ? couponRes.data ?? [] : []);
      setProducts(productRes.success ? productRes.data ?? [] : []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load campaigns.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  const performanceById = useMemo(() => {
    const map = new Map<string, CampaignPerformance>();
    for (const entry of performance) map.set(entry.campaignId, entry);
    return map;
  }, [performance]);

  const totals = useMemo(
    () =>
      performance.reduce(
        (acc, entry) => ({
          visits: acc.visits + entry.visits,
          orders: acc.orders + entry.attributedOrders,
          revenue: acc.revenue + entry.revenue,
        }),
        { visits: 0, orders: 0, revenue: 0 }
      ),
    [performance]
  );

  const toggleStatus = async (campaign: Campaign) => {
    if (busyId) return;
    setBusyId(campaign.id);
    try {
      const next = campaign.status === "active" ? "paused" : "active";
      const res = await setAuthorizedCampaignStatus(campaign.id, next);
      if (res.success) {
        notify(next === "active" ? "Campaign activated." : "Campaign paused.");
        await loadCampaigns();
      } else {
        notify(res.error, "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await deleteAuthorizedStoreCampaign(id);
      if (res.success) {
        notify("Campaign deleted.");
        await loadCampaigns();
      } else {
        notify(res.error, "error");
      }
    } finally {
      setBusyId(null);
      setDeleteTarget(null);
    }
  };

  const copyLink = async (campaign: Campaign) => {
    const path = buildCampaignLink(storeSlug, campaign.token);
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Tracked campaign link copied.");
    } catch {
      notify(`Copy this link manually: ${url}`, "error");
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span className="break-all">{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Marketing Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Campaigns reuse your existing coupons and generate a tracked storefront link.
            Visits and attributed orders are measured from real traffic — no email, SMS,
            WhatsApp or advertising-platform delivery is included.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600"
        >
          + New Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Campaigns", value: String(campaigns.length), hint: "All statuses" },
          { label: "Tracked visits", value: String(totals.visits), hint: "Unique browsers" },
          { label: "Attributed orders", value: String(totals.orders), hint: "Measured" },
          {
            label: "Attributed revenue",
            value: totals.revenue.toLocaleString(),
            hint: "From order totals",
          },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-black text-zinc-950">{card.value}</p>
            <p className="text-[10px] text-zinc-500">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-900">
        <strong>How measurement works:</strong> a visit is one unique browser that loaded a
        campaign link while the campaign was active. An order is attributed only when the
        buyer&apos;s browser reports it after checkout, and the server verifies it belongs to
        this store, was created inside the campaign window, and has not already been
        attributed. This is same-browser attribution, not cross-device advertising
        tracking.
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          <p className="font-bold">Could not load campaigns.</p>
          <p className="mt-1 text-xs">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setLoadError(null);
              void loadAll();
            }}
            className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            Try again
          </button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
            🔗
          </div>
          <h2 className="mt-3 text-base font-bold text-zinc-950">No campaigns yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
            Create a campaign, attach one of your coupons, and share its tracked link.
            {coupons.length === 0 && " You need at least one coupon first."}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="mt-4 rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs font-bold text-white"
          >
            + New Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const stats = performanceById.get(campaign.id) ?? {
              campaignId: campaign.id,
              visits: 0,
              attributedOrders: 0,
              revenue: 0,
              discountAmount: 0,
            };
            const rate = conversionRate(stats.visits, stats.attributedOrders);

            return (
              <article
                key={campaign.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-bold text-zinc-950">{campaign.name}</h2>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          STATUS_STYLE[campaign.computedStatus] ?? STATUS_STYLE.draft
                        }`}
                      >
                        {campaignStatusLabel(campaign.computedStatus)}
                      </span>
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-700">
                        {campaign.couponCode}
                      </span>
                      {campaign.couponStatus !== "active" && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Coupon {campaign.couponStatus}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {new Date(campaign.startsAt).toLocaleString()} →{" "}
                      {campaign.endsAt ? new Date(campaign.endsAt).toLocaleString() : "No end"}
                    </p>
                    {campaign.productNames.length > 0 && (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Featured: {campaign.productNames.slice(0, 3).join(", ")}
                        {campaign.productNames.length > 3
                          ? ` +${campaign.productNames.length - 3} more`
                          : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void toggleStatus(campaign)}
                      disabled={busyId === campaign.id}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {campaign.status === "active" ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(campaign);
                        setModalOpen(true);
                      }}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </button>
                    {deleteTarget === campaign.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void remove(campaign.id)}
                          disabled={busyId === campaign.id}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(null)}
                          className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[11px] font-semibold"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(campaign.id)}
                        className="px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-600">
                    {buildCampaignLink(storeSlug, campaign.token)}
                  </code>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void copyLink(campaign)}
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-zinc-800"
                    >
                      Copy tracked link
                    </button>
                    <a
                      href={buildCampaignLink(storeSlug, campaign.token)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      Open
                    </a>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Unique visits", value: String(stats.visits) },
                    { label: "Attributed orders", value: String(stats.attributedOrders) },
                    { label: "Revenue", value: money(stats.revenue, "EGP") },
                    {
                      label: "Visit → order",
                      value: rate === null ? "—" : `${rate}%`,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-lg border border-zinc-100 bg-white px-3 py-2"
                    >
                      <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">
                        {metric.label}
                      </p>
                      <p className="text-sm font-black text-zinc-950">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <CampaignModal
          key={`${editing?.id ?? "new-campaign"}-${coupons.length}`}
          isOpen={modalOpen}
          campaign={editing}
          coupons={coupons}
          products={products}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={loadCampaigns}
          onNotify={notify}
        />
      )}
    </div>
  );
}
