import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextNotificationAttempt, safeMediaPath, verifyHmacSignature } from "../src/lib/batch3.ts";
import crypto from "node:crypto";

test("Batch 3 state transitions reject invalid payment and return changes", () => {
  assert.equal(canTransition("payment", "pending", "successful"), true);
  assert.equal(canTransition("payment", "successful", "pending"), false);
  assert.equal(canTransition("return", "received", "refunded"), true);
  assert.equal(canTransition("return", "requested", "refunded"), false);
});

test("Batch 3 webhook signatures use HMAC", () => {
  const payload = "{\"event_id\":\"evt_1\"}";
  const signature = crypto.createHmac("sha256", "secret").update(payload).digest("hex");
  assert.equal(verifyHmacSignature(payload, signature, "secret"), true);
  assert.equal(verifyHmacSignature(payload, "bad", "secret"), false);
});

test("Batch 3 media paths are store/product scoped and extensions are restricted", () => {
  assert.match(safeMediaPath("store", "product", "photo.webp"), /^store\/product\/[0-9a-f-]+\.webp$/);
  assert.equal(safeMediaPath("store", "product", "photo.exe"), null);
});

test("Batch 3 notification retry delay is bounded", () => {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  const next = Date.parse(nextNotificationAttempt(5, base));
  assert.ok(next - base <= 60 * 60 * 1000);
  assert.ok(next - base > 0);
});
