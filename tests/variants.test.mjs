import test from "node:test";
import assert from "node:assert/strict";
import {
  cartLineId,
  effectiveVariantPrice,
  findVariantBySelection,
  formatVariantLabel,
  isPurchasable,
  isSelectionComplete,
  lowestVariantPrice,
  totalVariantStock,
  variantSelectionKey,
} from "../src/lib/variants.ts";

const options = [
  {
    id: "opt-size",
    name: "Size",
    position: 0,
    values: [
      { id: "val-s", optionId: "opt-size", value: "S", position: 0 },
      { id: "val-m", optionId: "opt-size", value: "M", position: 1 },
    ],
  },
  {
    id: "opt-color",
    name: "Color",
    position: 1,
    values: [{ id: "val-blue", optionId: "opt-color", value: "Blue", position: 0 }],
  },
];

const variants = [
  { id: "var-s", sku: "T-S", price: 300, stock: 2, optionValueIds: ["val-s", "val-blue"] },
  { id: "var-m", sku: "T-M", price: 350, stock: 0, optionValueIds: ["val-m", "val-blue"] },
];

test("cart line identity is variant-aware and stable", () => {
  assert.equal(cartLineId("demo", "p1"), "demo:p1");
  assert.equal(cartLineId("demo", "p1", "v1"), "demo:p1:v1");
});

test("selection matching is order-independent", () => {
  assert.equal(variantSelectionKey(["b", "a"]), variantSelectionKey(["a", "b"]));
  assert.equal(findVariantBySelection(variants, ["val-blue", "val-s"])?.id, "var-s");
  assert.equal(findVariantBySelection(variants, ["val-s"]), null);
});

test("selection completeness requires one value per option", () => {
  assert.equal(isSelectionComplete(options, { "opt-size": "val-s", "opt-color": "val-blue" }), true);
  assert.equal(isSelectionComplete(options, { "opt-size": "val-s" }), false);
  assert.equal(isSelectionComplete([], {}), false);
});

test("variant labels use option names and values", () => {
  assert.equal(
    formatVariantLabel(["val-blue", "val-s"], options),
    "Size: S / Color: Blue"
  );
});

test("variant price overrides the product price", () => {
  assert.equal(effectiveVariantPrice(250, variants[0]), 300);
  assert.equal(effectiveVariantPrice(250, null), 250);
});

test("stock helpers exclude inactive availability", () => {
  assert.equal(isPurchasable(variants[0]), true);
  assert.equal(isPurchasable(variants[1]), false);
  assert.equal(totalVariantStock(variants), 2);
  assert.equal(lowestVariantPrice(250, variants), 300);
});
