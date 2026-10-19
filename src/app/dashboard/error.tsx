"use client";

import RuntimeErrorState from "@/components/RuntimeErrorState";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RuntimeErrorState area="dashboard" error={error} retry={retry} />;
}
