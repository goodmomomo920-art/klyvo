"use client";

import { useEffect } from "react";

export default function RuntimeErrorState({
  area,
  error,
  retry,
}: {
  area: "dashboard" | "storefront";
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(`${area} route failed to render`, error);
  }, [area, error]);

  const isDashboard = area === "dashboard";

  return (
    <main className={`flex min-h-[60vh] items-center justify-center px-6 py-16 ${isDashboard ? "bg-zinc-50" : "bg-white"}`}>
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700" aria-hidden="true">
          !
        </div>
        <h1 className="mt-5 text-xl font-bold text-zinc-950">
          {isDashboard ? "تعذر تحميل لوحة التحكم" : "المتجر غير متاح مؤقتًا"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          حدثت مشكلة مؤقتة في الاتصال بالخدمة. حاول مرة أخرى، وإذا استمرت المشكلة راجع إعدادات قاعدة البيانات.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
        >
          حاول مرة أخرى
        </button>
      </section>
    </main>
  );
}
