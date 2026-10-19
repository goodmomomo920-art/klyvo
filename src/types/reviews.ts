/**
 * Product review domain types (migration 20261019000003_product_reviews.sql).
 * Raw reviewer phone numbers are never stored or returned.
 */

export type ReviewStatus = "pending" | "published" | "rejected";

export interface ProductReview {
  id: string;
  storeId: string;
  productId: string;
  productName?: string;
  productSku?: string | null;
  customerId: string | null;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  reviewerName: string;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  moderationNote: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerName: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface PublicReviewPage {
  reviews: PublicReview[];
  total: number;
  averageRating: number;
  reviewCount: number;
  page: number;
  hasMore: boolean;
}

export interface ReviewSubmission {
  rating: number;
  title: string;
  body: string;
  reviewerName: string;
  phone: string;
}

export type ReviewSubmissionErrorCode =
  | "INVALID_STORE"
  | "PRODUCT_NOT_FOUND"
  | "INVALID_RATING"
  | "TITLE_TOO_LONG"
  | "INVALID_BODY"
  | "INVALID_NAME"
  | "INVALID_PHONE"
  | "RATE_LIMITED"
  | "DUPLICATE";

export interface RatingSummary {
  average: number;
  count: number;
}
