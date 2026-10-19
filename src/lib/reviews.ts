import type {
  RatingSummary,
  ReviewSubmission,
  ReviewSubmissionErrorCode,
} from "../types/reviews";

/**
 * Review validation shared by the storefront form and server action. The SQL
 * RPC re-validates everything and owns the identity/dedup/verified rules.
 */

export const REVIEW_LIMITS = {
  title: 120,
  bodyMin: 3,
  bodyMax: 2000,
  nameMin: 2,
  nameMax: 80,
} as const;

export function isValidRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

/** Strips control characters and angle brackets; trims plain text. */
export function sanitizeReviewText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

export type ReviewValidationResult =
  | { ok: true; value: ReviewSubmission }
  | { ok: false; errorCode: ReviewSubmissionErrorCode; message: string };

export function validateReviewSubmission(
  input: unknown
): ReviewValidationResult {
  const raw = (typeof input === "object" && input !== null
    ? input
    : {}) as Partial<Record<keyof ReviewSubmission, unknown>>;

  if (!isValidRating(raw.rating)) {
    return {
      ok: false,
      errorCode: "INVALID_RATING",
      message: "Choose a star rating from 1 to 5.",
    };
  }

  const title = sanitizeReviewText(raw.title);
  if (title.length > REVIEW_LIMITS.title) {
    return {
      ok: false,
      errorCode: "TITLE_TOO_LONG",
      message: `Review title cannot exceed ${REVIEW_LIMITS.title} characters.`,
    };
  }

  const body = sanitizeReviewText(raw.body);
  if (
    body.length < REVIEW_LIMITS.bodyMin ||
    body.length > REVIEW_LIMITS.bodyMax
  ) {
    return {
      ok: false,
      errorCode: "INVALID_BODY",
      message: `Review text must be between ${REVIEW_LIMITS.bodyMin} and ${REVIEW_LIMITS.bodyMax} characters.`,
    };
  }

  const reviewerName = sanitizeReviewText(raw.reviewerName);
  if (
    reviewerName.length < REVIEW_LIMITS.nameMin ||
    reviewerName.length > REVIEW_LIMITS.nameMax
  ) {
    return {
      ok: false,
      errorCode: "INVALID_NAME",
      message: `Please enter your name (${REVIEW_LIMITS.nameMin}–${REVIEW_LIMITS.nameMax} characters).`,
    };
  }

  const phone = sanitizeReviewText(raw.phone);
  if (!/^\+?[0-9][0-9 \-()]{4,49}$/.test(phone)) {
    return {
      ok: false,
      errorCode: "INVALID_PHONE",
      message: "Please enter a valid phone number.",
    };
  }

  return {
    ok: true,
    value: { rating: raw.rating, title, body, reviewerName, phone },
  };
}

/**
 * Average/count over already-filtered rows. Callers must pass only published
 * reviews; the database RPC applies the same rule when serving public data.
 */
export function computeRatingSummary(ratings: number[]): RatingSummary {
  const valid = ratings.filter(isValidRating);
  if (valid.length === 0) return { average: 0, count: 0 };
  const sum = valid.reduce((acc, rating) => acc + rating, 0);
  return {
    average: Math.round((sum / valid.length) * 100) / 100,
    count: valid.length,
  };
}

export function starLabel(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}
