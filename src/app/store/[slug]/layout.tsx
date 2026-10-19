import { notFound } from "next/navigation";
import { getPublicStore } from "@/lib/server/storefront";
import StorefrontShell from "@/components/storefront/StorefrontShell";

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getPublicStore(slug);

  if (!store) {
    notFound();
  }

  return (
    <StorefrontShell store={store} slug={slug}>
      {children}
    </StorefrontShell>
  );
}
