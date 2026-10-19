import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignLink,
  campaignStatusLabel,
  conversionRate,
  deriveCampaignStatus,
  isValidCampaignToken,
  performanceMoney,
} from "../src/lib/campaigns.ts";

const now = Date.parse("2026-10-17T12:00:00Z");

test("status follows the schedule and explicit overrides", () => {
  assert.equal(
    deriveCampaignStatus({ status: "active", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-10T00:00:00Z" }, now),
    "ended"
  );
  assert.equal(
    deriveCampaignStatus({ status: "active", startsAt: "2026-10-01T00:00:00Z", endsAt: null }, now),
    "active"
  );
  assert.equal(
    deriveCampaignStatus({ status: "active", startsAt: "2026-11-01T00:00:00Z", endsAt: null }, now),
    "scheduled"
  );
  assert.equal(
    deriveCampaignStatus({ status: "draft", startsAt: "2026-10-01T00:00:00Z", endsAt: null }, now),
    "draft"
  );
  assert.equal(
    deriveCampaignStatus({ status: "paused", startsAt: "2026-10-01T00:00:00Z", endsAt: null }, now),
    "paused"
  );
});

test("status labels are human readable", () => {
  assert.equal(campaignStatusLabel("active"), "Active");
  assert.equal(campaignStatusLabel("scheduled"), "Scheduled");
  assert.equal(campaignStatusLabel("ended"), "Ended");
  assert.equal(campaignStatusLabel("paused"), "Paused");
});

test("tracking tokens are opaque and URL-safe", () => {
  assert.equal(isValidCampaignToken("AbCdEf0123456789"), true);
  assert.equal(isValidCampaignToken("short"), false);
  assert.equal(isValidCampaignToken("../../etc/passwd"), false);
  assert.equal(isValidCampaignToken("x".repeat(65)), false);
  assert.equal(isValidCampaignToken(null), false);
});

test("campaign links keep the storefront path and token encoded", () => {
  assert.equal(
    buildCampaignLink("demo-store", "AbCdEf0123456789"),
    "/store/demo-store?campaign=AbCdEf0123456789"
  );
  assert.match(buildCampaignLink("a/b", "AbCdEf0123456789"), /^\/store\/a%2Fb\?campaign=/);
});

test("conversion rate is null until visits exist", () => {
  assert.equal(conversionRate(0, 0), null);
  assert.equal(conversionRate(-1, 2), null);
  assert.equal(conversionRate(200, 5), 2.5);
  assert.equal(conversionRate(3, 1), 33.33);
});

test("money is rounded to two decimals without inventing values", () => {
  assert.equal(performanceMoney(100.005), 100.01);
  assert.equal(performanceMoney(Number.NaN), 0);
  assert.equal(performanceMoney(49.999), 50);
});
