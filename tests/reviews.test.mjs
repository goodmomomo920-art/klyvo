import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRatingSummary,
  isValidRating,
  sanitizeReviewText,
  starLabel,
  validateReviewSubmission,
} from "../src/lib/reviews.ts";

const valid = {
  rating: 5,
  title: "Excellent",
  body: "Very good product",
  reviewerName: "Mona",
  phone: "01012345678",
};

test("rating must be an integer between 1 and 5", () => {
  for (const rating of [0, 6, 2.5, "5", null]) {
    assert.equal(isValidRating(rating), false);
    assert.equal(validateReviewSubmission({ ...valid, rating }).ok, false);
  }
  assert.equal(validateReviewSubmission(valid).ok, true);
});

test("review body is bounded and sanitized", () => {
  assert.equal(validateReviewSubmission({ ...valid, body: "  " }).ok, false);
  assert.equal(validateReviewSubmission({ ...valid, body: "x".repeat(2001) }).ok, false);
  const result = validateReviewSubmission({
    ...valid,
    title: "<i>Nice</i>",
    body: "<b>Very good</b> product",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.body.includes("<"), false);
  assert.equal(result.value.title, "iNice/i");
});

test("reviewer name and Egyptian-style phone are required", () => {
  assert.equal(validateReviewSubmission({ ...valid, reviewerName: "" }).ok, false);
  assert.equal(validateReviewSubmission({ ...valid, phone: "not-a-phone" }).ok, false);
  assert.equal(validateReviewSubmission({ ...valid, phone: "+20 101 234 5678" }).ok, true);
});

test("control characters never survive sanitization", () => {
  assert.equal(sanitizeReviewText("good\u0000\u001b text"), "good text");
  assert.equal(sanitizeReviewText(null), "");
});

test("only the supplied published ratings count toward the average", () => {
  const summary = computeRatingSummary([5, 4, 5]);
  assert.equal(summary.count, 3);
  assert.equal(summary.average, 4.67);
});

test("invalid ratings and empty input do not invent an average", () => {
  assert.deepEqual(computeRatingSummary([]), { average: 0, count: 0 });
  assert.deepEqual(computeRatingSummary([9, 0, 4]), { average: 4, count: 1 });
});

test("star labels clamp safely", () => {
  assert.equal(starLabel(5), "★★★★★");
  assert.equal(starLabel(0), "☆☆☆☆☆");
  assert.equal(starLabel(99), "★★★★★");
});
