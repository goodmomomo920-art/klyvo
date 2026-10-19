"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { createClient } from "@/lib/supabase/client";
import { clearClientCache } from "@/lib/clientCache";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Validation & Submission States
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = "Please enter your email address";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Please enter your password";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setServerError(signInError.message);
        setIsSubmitting(false);
        return;
      }

      clearClientCache();
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred during sign in.";
      setServerError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Sign in to Klyvo"
      subtitle="Access your store dashboard, orders, and payment settings"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Error Notification Banner */}
        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3.5 text-xs text-rose-200 leading-relaxed flex items-start gap-2.5"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold">
              ⚠
            </span>
            <span>{serverError}</span>
          </div>
        )}

        {/* Email Field */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-zinc-300"
          >
            Email Address
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
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="merchant@example.com"
            className={`w-full rounded-xl border bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 ${
              errors.email
                ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-white/15 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
            }`}
          />
          {errors.email && (
            <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
              <span>⚠</span> {errors.email}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-zinc-300"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[#2563EB] hover:text-blue-400 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="••••••••"
              className={`w-full rounded-xl border bg-white/5 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 ${
                errors.password
                  ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-white/15 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-200 focus:outline-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
              <span>⚠</span> {errors.password}
            </p>
          )}
        </div>

        {/* Remember Me Checkbox */}
        <div className="flex items-center text-left pt-1">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 text-[#2563EB] focus:ring-[#2563EB] focus:ring-offset-0 focus:ring-offset-transparent cursor-pointer"
          />
          <label
            htmlFor="remember-me"
            className="ml-2 block text-xs text-zinc-300 cursor-pointer select-none"
          >
            Remember me on this device
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-600 active:scale-98 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 focus:ring-offset-[#080B12] disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </div>

        {/* Switch to Sign Up */}
        <div className="pt-4 border-t border-white/10 text-center text-xs text-zinc-400">
          <span>Don&apos;t have an account yet? </span>
          <Link
            href="/signup"
            className="font-bold text-[#2563EB] hover:text-blue-400 transition-colors"
          >
            Create an Account
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
