"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { createClient } from "@/lib/supabase/client";
import { clearClientCache } from "@/lib/clientCache";

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validation & Submission States
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    agreeTerms?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setSuccessNotice(null);
    const newErrors: typeof errors = {};

    // 1. Full name validation
    if (!fullName.trim()) {
      newErrors.fullName = "Please enter your full name";
    }

    // 2. Email format validation
    if (!email.trim()) {
      newErrors.email = "Please enter your email address";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please enter a valid email address";
    }

    // 3. Password length validation
    if (!password) {
      newErrors.password = "Please enter a password";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters long";
    }

    // 4. Password confirmation match
    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    // 5. Terms acceptance
    if (!agreeTerms) {
      newErrors.agreeTerms = "You must accept the Terms of Service to proceed";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const redirectOrigin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: `${redirectOrigin}/auth/callback`,
        },
      });

      if (signUpError) {
        setServerError(signUpError.message);
        setIsSubmitting(false);
        return;
      }

      if (data?.session) {
        // Direct session established (e.g. if email confirmation is disabled)
        clearClientCache();
        router.push("/dashboard");
        router.refresh();
      } else {
        // Email confirmation is required by Supabase Auth configuration
        setIsSubmitting(false);
        setSuccessNotice(
          `Account created successfully! A verification email has been sent to ${email.trim()}. Please verify your email before logging in.`
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred during signup.";
      setServerError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your merchant account"
      subtitle="Start building your Egyptian online store with Klyvo"
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

        {/* Success Confirmation Banner */}
        {successNotice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs text-emerald-200 leading-relaxed flex items-start gap-2.5"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
              ✓
            </span>
            <span>{successNotice}</span>
          </div>
        )}

        {/* Full Name Field */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="fullName"
            className="block text-xs font-semibold text-zinc-300"
          >
            Full Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
            }}
            placeholder="Karim El-Sayed"
            className={`w-full rounded-xl border bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 ${
              errors.fullName
                ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-white/15 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
            }`}
          />
          {errors.fullName && (
            <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
              <span>⚠</span> {errors.fullName}
            </p>
          )}
        </div>

        {/* Email Address Field */}
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
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-zinc-300"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="At least 8 characters"
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

        {/* Confirm Password Field */}
        <div className="space-y-1.5 text-left">
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-semibold text-zinc-300"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword)
                  setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              placeholder="Re-enter your password"
              className={`w-full rounded-xl border bg-white/5 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 ${
                errors.confirmPassword
                  ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20"
                  : "border-white/15 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-200 focus:outline-none"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? (
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
          {errors.confirmPassword && (
            <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
              <span>⚠</span> {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* Terms & Conditions Checkbox */}
        <div className="space-y-1 text-left pt-1">
          <div className="flex items-start">
            <input
              id="agree-terms"
              name="agree-terms"
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => {
                setAgreeTerms(e.target.checked);
                if (errors.agreeTerms)
                  setErrors((prev) => ({ ...prev, agreeTerms: undefined }));
              }}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
            />
            <label
              htmlFor="agree-terms"
              className="ml-2 block text-xs text-zinc-300 leading-normal cursor-pointer select-none"
            >
              I agree to the{" "}
              <span className="text-[#2563EB] hover:underline cursor-pointer">
                Terms of Service
              </span>{" "}
              and{" "}
              <span className="text-[#2563EB] hover:underline cursor-pointer">
                Merchant Policy
              </span>
              .
            </label>
          </div>
          {errors.agreeTerms && (
            <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
              <span>⚠</span> {errors.agreeTerms}
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
            {isSubmitting ? "Creating Account..." : "Create Account"}
          </button>
        </div>

        {/* Switch to Sign In */}
        <div className="pt-4 border-t border-white/10 text-center text-xs text-zinc-400">
          <span>Already have an account? </span>
          <Link
            href="/login"
            className="font-bold text-[#2563EB] hover:text-blue-400 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
