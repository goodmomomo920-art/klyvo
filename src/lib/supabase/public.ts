import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

/**
 * Anonymous, session-less Supabase client for the customer-facing storefront.
 *
 * Uses only publishable/public environment variables (never the service-role
 * key). All storefront reads and checkout writes go through the SECURITY
 * DEFINER RPC functions added in
 * supabase/migrations/20261016000005_public_storefront_checkout.sql; the
 * underlying tables remain locked behind RLS for anon.
 */
export function createPublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in your .env.local file."
    );
  }

  return createSupabaseJsClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
