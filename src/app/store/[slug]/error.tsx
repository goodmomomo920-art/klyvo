"use client";

import RuntimeErrorState from "@/components/RuntimeErrorState";

export default function StorefrontError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RuntimeErrorState area="storefront" error={error} retry={retry} />;
}
