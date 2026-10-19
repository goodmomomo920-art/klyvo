import { notFound } from "next/navigation";
import ProductDetailView from "@/components/storefront/ProductDetailView";
import { getPublicStoreProductDetail } from "@/lib/server/storefront";

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const detail = await getPublicStoreProductDetail(slug, productId);

  if (!detail?.product) {
    notFound();
  }

  return <ProductDetailView product={detail.product} />;
}
