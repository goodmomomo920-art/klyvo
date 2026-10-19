import test from "node:test";
import assert from "node:assert/strict";
import {
  EGYPT_GOVERNORATES,
  calculateShippingQuote,
  freeShippingGap,
  groupZonesByGovernorate,
  shippingAreaLabel,
} from "../src/lib/shipping.ts";

const zone = {
  id: "11111111-1111-4111-8111-111111111111",
  governorate: "Cairo",
  area: "Nasr City",
  fee: 65,
  freeShippingThreshold: null,
};

const base = {
  shippingEnabled: true,
  defaultFee: 50,
  storeFreeShippingThreshold: null,
  zones: [],
  zoneId: null,
  subtotal: 500,
};

test("uses the legacy default fee when the store has no zones", () => {
  const quote = calculateShippingQuote(base);
  assert.equal(quote.available, true);
  assert.equal(quote.fee, 50);
  assert.equal(quote.zoneId, null);
});

test("applies the store free-shipping threshold", () => {
  const quote = calculateShippingQuote({
    ...base,
    storeFreeShippingThreshold: 400,
  });
  assert.equal(quote.fee, 0);
  assert.equal(quote.freeShippingApplied, true);
  assert.equal(freeShippingGap(quote, 500), null);
});

test("requires a zone when the store has active zones", () => {
  const quote = calculateShippingQuote({ ...base, zones: [zone] });
  assert.equal(quote.available, false);
  assert.equal(quote.reason, "zone_required");
  assert.equal(quote.fee, 0);
});

test("rejects an unknown zone id", () => {
  const quote = calculateShippingQuote({
    ...base,
    zones: [zone],
    zoneId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(quote.available, false);
  assert.equal(quote.reason, "invalid_zone");
});

test("charges the selected zone fee", () => {
  const quote = calculateShippingQuote({
    ...base,
    zones: [zone],
    zoneId: zone.id,
  });
  assert.equal(quote.available, true);
  assert.equal(quote.fee, 65);
  assert.equal(quote.zoneId, zone.id);
  assert.equal(quote.areaLabel, "Cairo — Nasr City");
});

test("zone threshold overrides the store threshold", () => {
  const quote = calculateShippingQuote({
    ...base,
    storeFreeShippingThreshold: 100,
    zones: [{ ...zone, freeShippingThreshold: 1000 }],
    zoneId: zone.id,
    subtotal: 500,
  });
  assert.equal(quote.fee, 65);
  assert.equal(quote.threshold, 1000);
});

test("falls back to the store threshold when a zone threshold is null", () => {
  const quote = calculateShippingQuote({
    ...base,
    storeFreeShippingThreshold: 400,
    zones: [zone],
    zoneId: zone.id,
  });
  assert.equal(quote.fee, 0);
  assert.equal(quote.threshold, 400);
});

test("disabled shipping is always free", () => {
  const quote = calculateShippingQuote({
    ...base,
    shippingEnabled: false,
    zones: [zone],
    zoneId: zone.id,
  });
  assert.equal(quote.fee, 0);
  assert.equal(quote.zoneId, null);
});

test("free shipping gap is the remaining amount", () => {
  const quote = calculateShippingQuote({
    ...base,
    zones: [{ ...zone, freeShippingThreshold: 700 }],
    zoneId: zone.id,
    subtotal: 500,
  });
  assert.equal(freeShippingGap(quote, 500), 200);
});

test("supports all 27 Egyptian governorates and groups zones", () => {
  assert.equal(EGYPT_GOVERNORATES.length, 27);
  const grouped = groupZonesByGovernorate([
    zone,
    { ...zone, id: "33333333-3333-4333-8333-333333333333", area: "Heliopolis" },
    { ...zone, id: "44444444-4444-4444-8444-444444444444", governorate: "Giza" },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].zones.length, 2);
  assert.equal(shippingAreaLabel({ governorate: "Giza", area: "All areas" }), "Giza");
});
