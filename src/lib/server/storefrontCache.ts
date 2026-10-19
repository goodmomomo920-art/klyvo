import { revalidateTag } from "next/cache";
import { unstable_cache } from "next/cache";
import type {
  PublicProductDetail,
  PublicProductPage,
  PublicStoreConfig,
} from "@/types/storefront";
import type { PublicReviewPage } from "@/types/reviews";

type PublicStoreProductsParams = {
  slug: string;
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
};

export async function cachedPublicStore(
  slug: string,
  fetcher: (slug: string) => Promise<PublicStoreConfig | null>
): Promise<PublicStoreConfig | null> {
  const normalizedSlug = slug.trim();
  return unstable_cache(() => fetcher(normalizedSlug), ["public-store", normalizedSlug], {
    revalidate: 300,
    tags: [`store:${normalizedSlug}`],
  })();
}

export async function cachedPublicStoreProducts(
  params: PublicStoreProductsParams,
  fetcher: (params: PublicStoreProductsParams) => Promise<PublicProductPage>
): Promise<PublicProductPage> {
  const normalizedParams = { ...params, slug: params.slug.trim() };
  // Free-text searches are unbounded: caching them would let anyone fill the
  // cache with junk keys. Only the plain listing (no search) is cached.
  if ((normalizedParams.search ?? "").trim() !== "") {
    return fetcher(normalizedParams);
  }
  const key = [
    "public-store-products",
    normalizedParams.slug,
    normalizedParams.page ?? 1,
    normalizedParams.pageSize ?? 12,
    normalizedParams.search ?? "",
    normalizedParams.category ?? "",
  ].map(String);
  return unstable_cache(() => fetcher(normalizedParams), key, {
    revalidate: 120,
    tags: [`store:${normalizedParams.slug}`],
  })();
}

export async function cachedPublicStoreProductDetail(
  slug: string,
  productId: string,
  fetcher: (slug: string, productId: string) => Promise<PublicProductDetail | null>
): Promise<PublicProductDetail | null> {
  const normalizedSlug = slug.trim();
  return unstable_cache(
    () => fetcher(normalizedSlug, productId),
    ["public-store-product-detail", normalizedSlug, productId],
    { revalidate: 120, tags: [`store:${normalizedSlug}`] }
  )();
}

export async function cachedPublicStoreProductReviews(
  slug: string,
  productId: string,
  page: number,
  fetcher: (slug: string, productId: string, page: number) => Promise<{
    success: boolean;
    data?: PublicReviewPage;
    error?: string;
  }>
): Promise<{ success: boolean; data?: PublicReviewPage; error?: string }> {
  const normalizedSlug = slug.trim();
  return unstable_cache(
    () => fetcher(normalizedSlug, productId, page),
    ["public-store-product-reviews", normalizedSlug, productId, String(page)],
    { revalidate: 300, tags: [`store:${normalizedSlug}`] }
  )();
}

export function invalidateStorefrontCache(slug: string): void {
  revalidateTag(`store:${slug.trim()}`, "max");
}
