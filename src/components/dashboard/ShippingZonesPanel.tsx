"use client";

import { useState } from "react";
import { ShippingZone } from "@/types/shipping";
import { EGYPT_GOVERNORATES } from "@/lib/shipping";
import {
  createAuthorizedShippingZone,
  deleteAuthorizedShippingZone,
  setAuthorizedShippingZoneActive,
  updateAuthorizedShippingZone,
} from "@/lib/server/shipping";

interface ShippingZonesPanelProps {
  zones: ShippingZone[];
  error?: string | null;
  onChanged: () => Promise<void> | void;
  onNotify: (message: string, type?: "success" | "error") => void;
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20";

function ZoneRow({
  zone,
  onChanged,
  onNotify,
}: {
  zone: ShippingZone;
  onChanged: () => Promise<void> | void;
  onNotify: (message: string, type?: "success" | "error") => void;
}) {
  const [area, setArea] = useState(zone.area);
  const [fee, setFee] = useState(String(zone.fee));
  const [threshold, setThreshold] = useState(
    zone.freeShippingThreshold === null ? "" : String(zone.freeShippingThreshold)
  );
  const [isActive, setIsActive] = useState(zone.isActive);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await updateAuthorizedShippingZone(zone.id, {
        governorate: zone.governorate,
        area,
        fee: Number(fee),
        freeShippingThreshold: threshold.trim() === "" ? null : Number(threshold),
        isActive,
        position: zone.position,
      });
      if (res.success) {
        onNotify("Delivery area updated.");
        await onChanged();
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update delivery area.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await setAuthorizedShippingZoneActive(zone.id, !isActive);
      if (res.success) {
        setIsActive(!isActive);
        onNotify(!isActive ? "Delivery area activated." : "Delivery area paused.");
        await onChanged();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteAuthorizedShippingZone(zone.id);
      if (res.success) {
        onNotify("Delivery area deleted.");
        await onChanged();
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
        <div className="sm:col-span-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Governorate
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-900">{zone.governorate}</p>
        </div>
        <div className="sm:col-span-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400" htmlFor={`zone-area-${zone.id}`}>
            Area
          </label>
          <input
            id={`zone-area-${zone.id}`}
            value={area}
            maxLength={120}
            onChange={(e) => setArea(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400" htmlFor={`zone-fee-${zone.id}`}>
            Fee (EGP)
          </label>
          <input
            id={`zone-fee-${zone.id}`}
            type="number"
            min="0"
            step="0.01"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400" htmlFor={`zone-threshold-${zone.id}`}>
            Free ≥
          </label>
          <input
            id={`zone-threshold-${zone.id}`}
            type="number"
            min="0"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="None"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {isActive ? "Pause" : "Activate"}
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-[11px]"
              >
                No
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[11px] font-semibold text-rose-600 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span
          className={`rounded-full border px-2 py-0.5 font-bold ${
            isActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-zinc-50 text-zinc-500"
          }`}
        >
          {isActive ? "Available at checkout" : "Paused"}
        </span>
        {error && <span className="font-semibold text-rose-700">{error}</span>}
      </div>
    </div>
  );
}

export default function ShippingZonesPanel({
  zones,
  error,
  onChanged,
  onNotify,
}: ShippingZonesPanelProps) {
  const [governorate, setGovernorate] = useState<string>("Cairo");
  const [area, setArea] = useState("All areas");
  const [fee, setFee] = useState("0");
  const [threshold, setThreshold] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await createAuthorizedShippingZone({
        governorate,
        area,
        fee: Number(fee),
        freeShippingThreshold: threshold.trim() === "" ? null : Number(threshold),
        isActive,
      });
      if (res.success) {
        setArea("All areas");
        setFee("0");
        setThreshold("");
        setIsActive(true);
        onNotify("Delivery area added.");
        await onChanged();
      } else {
        setAddError(res.error);
      }
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add delivery area.");
    } finally {
      setAdding(false);
    }
  };

  const activeCount = zones.filter((zone) => zone.isActive).length;

  return (
    <section className="mt-6 border-t border-zinc-100 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-zinc-950">Delivery areas — Egypt</h4>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-500">
            Add per-governorate areas with their own fees and optional free-shipping
            thresholds. Once at least one area is active, checkout requires the customer
            to choose one of these areas and the server calculates the fee from it. With
            no areas, the default fee above applies. No courier integration is included.
          </p>
        </div>
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[10px] font-bold text-zinc-600">
          {activeCount} active / {zones.length} total
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {zones.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
            No delivery areas configured. Customers use the default shipping settings.
          </p>
        ) : (
          zones.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              onChanged={onChanged}
              onNotify={onNotify}
            />
          ))
        )}
      </div>

      <form onSubmit={add} className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
        <p className="text-xs font-bold text-zinc-900">Add a delivery area</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-3">
            <label htmlFor="new-zone-governorate" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Governorate
            </label>
            <select
              id="new-zone-governorate"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className={inputClass}
            >
              {EGYPT_GOVERNORATES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="new-zone-area" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Area
            </label>
            <input
              id="new-zone-area"
              value={area}
              maxLength={120}
              onChange={(e) => setArea(e.target.value)}
              placeholder="All areas or e.g. Nasr City"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="new-zone-fee" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Fee (EGP)
            </label>
            <input
              id="new-zone-fee"
              type="number"
              min="0"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="new-zone-threshold" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Free ≥ (optional)
            </label>
            <input
              id="new-zone-threshold"
              type="number"
              min="0"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="None"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={adding}
              className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add area"}
            </button>
          </div>
        </div>
        <label className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold text-zinc-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-[#2563EB]"
          />
          Available at checkout
        </label>
        {addError && (
          <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">
            {addError}
          </p>
        )}
      </form>
    </section>
  );
}
