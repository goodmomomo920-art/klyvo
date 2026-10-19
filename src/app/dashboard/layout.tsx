import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import DashboardShell from "@/components/dashboard/DashboardShell";

// Opt dashboard routes out of static prerendering since they read auth cookies at runtime
export const dynamic = 'force-dynamic';

/**
 * Server Component layout for /dashboard routes.
 * Verifies session server-side with Supabase Auth before rendering any child components.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: claimsResult } = await supabase.auth.getClaims();
  const claims = claimsResult?.claims;

  if (!claims?.sub) {
    redirect("/login");
  }

  // Resolve the authenticated merchant's store so UI can link to its real
  // public storefront (/store/[slug]). Returns null only on query/insert error.
  const store = await getAuthorizedStore();
  const storeSlug = store?.slug?.trim() || null;

  return (
    <DashboardShell
      userEmail={typeof claims.email === "string" ? claims.email : null}
      storeSlug={storeSlug}
    >
      {children}
    </DashboardShell>
  );
}
