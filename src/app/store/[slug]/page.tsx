import ProductBrowser from "@/components/storefront/ProductBrowser";

/**
 * Public storefront homepage for /store/[slug].
 * Store config (name, logo, description, branding) is resolved in the layout;
 * this page renders the product catalog via the public catalog RPC.
 */
export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <ProductBrowser slug={slug} />;
}
