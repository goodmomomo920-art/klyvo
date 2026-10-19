"use client";

import { useState } from "react";
import Link from "next/link";
import AuthCard from "@/components/AuthCard";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your registered email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const redirectOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${redirectOrigin}/login`,
        }
      );

      if (resetError) {
        setError(resetError.message);
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setSubmitted(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send password reset email.";
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email associated with your Klyvo store account"
    >
      {submitted ? (
        <div className="space-y-5 text-left">
          {/* Real Confirmation Message */}
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-xs leading-relaxed space-y-2">
            <div className="flex items-center gap-2 text-emerald-300 font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                ✓
              </span>
              <span>Password Reset Link Sent</span>
            </div>
            <p className="text-zinc-300">
              A single-use password recovery link has been dispatched to:
            </p>
            <p className="font-mono font-bold text-white bg-black/30 p-2 rounded border border-white/10 break-all">
              {email}
            </p>
            <p className="text-[11px] text-zinc-400">
              Please check your inbox (and spam folder) and follow the instructions to choose a new password.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setEmail("");
              }}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              Try another email
            </button>

            <Link
              href="/login"
              className="w-full text-center rounded-xl bg-[#2563EB] py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-600 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Email Field */}
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-zinc-300"
            >
              Account Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="merchant@example.com"
              className={`w-full rounded-xl border bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 ${
                error
                  ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-white/15 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
              }`}
            />
            {error && (
              <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                <span>⚠</span> {error}
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-600 active:scale-98 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 focus:ring-offset-[#080B12] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </div>

          {/* Link Back to Login */}
          <div className="pt-4 border-t border-white/10 text-center text-xs text-zinc-400">
            <span>Remember your password? </span>
            <Link
              href="/login"
              className="font-bold text-[#2563EB] hover:text-blue-400 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
