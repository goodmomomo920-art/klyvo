import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Route handler for Supabase Auth PKCE code exchange.
 * Triggered when a user clicks an email confirmation or password recovery link.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange fails or is missing, redirect to login with error indicator
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
