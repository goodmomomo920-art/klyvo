import type {
  PublicShippingZone,
  ShippingQuote,
} from "../types/shipping";

/**
 * Shipping calculation shared by the dashboard, cart/checkout estimates and
 * tests. The SQL checkout RPC mirrors these exact rules and remains the
 * authority — the client value is only ever an estimate.
 *
 * Rules:
 * - Shipping disabled  → fee 0 (existing behavior; checkout shows "not offered").
 * - Store has active zones → a zone is mandatory; fee comes from that zone.
 *   Zone threshold overrides the store threshold; NULL falls back to the store.
 * - Store has no zones → legacy default fee + store threshold.
 */
export const EGYPT_GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Port Said",
  "Suez",
  "Dakahlia",
  "Sharqia",
  "Monufia",
  "Beheira",
  "Ismailia",
  "Fayoum",
  "Beni Suef",
  "Minya",
  "Asyut",
  "Sohag",
  "Qena",
  "Luxor",
  "Aswan",
  "Red Sea",
  "New Valley",
  "Matrouh",
  "North Sinai",
  "South Sinai",
  "Damietta",
  "Kafr El Sheikh",
  "Gharbia",
] as const;

export function isEgyptGovernorate(value: string): boolean {
  return (EGYPT_GOVERNORATES as readonly string[]).includes(value);
}

export interface ShippingCalculationInput {
  shippingEnabled: boolean;
  /** Legacy store default fee. */
  defaultFee: number;
  storeFreeShippingThreshold: number | null;
  /** Active zones only. */
  zones: PublicShippingZone[];
  /** Selected zone id, or null when the customer has not chosen an area. */
  zoneId: string | null;
  subtotal: number;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateShippingQuote(
  input: ShippingCalculationInput
): ShippingQuote {
  const subtotal = Number.isFinite(input.subtotal)
    ? Math.max(0, Number(input.subtotal))
    : 0;

  if (!input.shippingEnabled) {
    return {
      available: true,
      fee: 0,
      zoneId: null,
      areaLabel: null,
      freeShippingApplied: false,
      threshold: null,
    };
  }

  if (input.zones.length > 0) {
    const zone = input.zoneId
      ? input.zones.find((z) => z.id === input.zoneId) ?? null
      : null;

    if (!zone) {
      return {
        available: false,
        reason: input.zoneId ? "invalid_zone" : "zone_required",
        fee: 0,
        zoneId: null,
        areaLabel: null,
        freeShippingApplied: false,
        threshold: null,
      };
    }

    const threshold =
      zone.freeShippingThreshold !== null
        ? zone.freeShippingThreshold
        : input.storeFreeShippingThreshold;
    const freeShippingApplied =
      threshold !== null && subtotal >= Math.max(0, threshold);

    return {
      available: true,
      fee: freeShippingApplied ? 0 : money(Math.max(0, zone.fee)),
      zoneId: zone.id,
      areaLabel: shippingAreaLabel(zone),
      freeShippingApplied,
      threshold,
    };
  }

  const threshold =
    input.storeFreeShippingThreshold !== null
      ? Math.max(0, input.storeFreeShippingThreshold)
      : null;
  const freeShippingApplied = threshold !== null && subtotal >= threshold;

  return {
    available: true,
    fee: freeShippingApplied ? 0 : money(Math.max(0, input.defaultFee)),
    zoneId: null,
    areaLabel: null,
    freeShippingApplied,
    threshold,
  };
}

export function shippingAreaLabel(
  zone: Pick<PublicShippingZone, "governorate" | "area">
): string {
  const area = zone.area.trim();
  if (!area || area.toLowerCase() === "all areas") {
    return zone.governorate;
  }
  return `${zone.governorate} — ${area}`;
}

export function groupZonesByGovernorate(
  zones: PublicShippingZone[]
): Array<{ governorate: string; zones: PublicShippingZone[] }> {
  const map = new Map<string, PublicShippingZone[]>();
  for (const zone of zones) {
    const list = map.get(zone.governorate) ?? [];
    list.push(zone);
    map.set(zone.governorate, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([governorate, list]) => ({ governorate, zones: list }));
}

/** Distance to free shipping, in currency units, or null when not applicable. */
export function freeShippingGap(
  quote: ShippingQuote,
  subtotal: number
): number | null {
  if (
    quote.threshold === null ||
    quote.freeShippingApplied ||
    subtotal <= 0 ||
    subtotal >= quote.threshold
  ) {
    return null;
  }
  return Math.round((quote.threshold - subtotal) * 100) / 100;
}
