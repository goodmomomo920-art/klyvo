/**
 * Shipping domain types (migration 20261019000001_shipping_zones.sql).
 *
 * Egyptian governorates only. A store with zero active zones falls back to its
 * legacy default fee/threshold. No courier integration exists.
 */

/**
 * The canonical list lives in src/lib/shipping.ts (runtime allowlist used for
 * validation). This union keeps the type module type-only so pure helpers stay
 * runnable under Node's type stripping in tests.
 */
export type EgyptGovernorate =
  | "Cairo"
  | "Giza"
  | "Alexandria"
  | "Qalyubia"
  | "Port Said"
  | "Suez"
  | "Dakahlia"
  | "Sharqia"
  | "Monufia"
  | "Beheira"
  | "Ismailia"
  | "Fayoum"
  | "Beni Suef"
  | "Minya"
  | "Asyut"
  | "Sohag"
  | "Qena"
  | "Luxor"
  | "Aswan"
  | "Red Sea"
  | "New Valley"
  | "Matrouh"
  | "North Sinai"
  | "South Sinai"
  | "Damietta"
  | "Kafr El Sheikh"
  | "Gharbia";

export interface ShippingZone {
  id: string;
  governorate: EgyptGovernorate;
  area: string;
  fee: number;
  freeShippingThreshold: number | null;
  isActive: boolean;
  position: number;
}

export interface ShippingZoneInput {
  id?: string;
  governorate: string;
  area: string;
  fee: number;
  freeShippingThreshold: number | null;
  isActive: boolean;
  position?: number;
}

/** Public-safe projection (active zones only). */
export interface PublicShippingZone {
  id: string;
  governorate: string;
  area: string;
  fee: number;
  freeShippingThreshold: number | null;
}

export type ShippingUnavailableReason =
  | "zone_required"
  | "invalid_zone"
  | "governorate_mismatch";

export interface ShippingQuote {
  /** Whether a valid delivery option exists for the requested inputs. */
  available: boolean;
  reason?: ShippingUnavailableReason;
  /** Charged shipping fee for this quote. 0 when unavailable. */
  fee: number;
  zoneId: string | null;
  /** "Cairo — Nasr City", or null when using store defaults. */
  areaLabel: string | null;
  /** True when a free-shipping threshold (zone or store) zeroed the fee. */
  freeShippingApplied: boolean;
  /** Threshold that applied to this quote, if any. */
  threshold: number | null;
}
