"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useStorefront } from "@/components/storefront/StorefrontShell";
import {
  LOADING_CATALOG_SNAPSHOT,
  READ_CATALOG,
  SUBSCRIBE_CATALOG,
  makeCatalogKey,
  requestCatalog,
} from "@/components/storefront/catalogStore";
import { PublicProduct } from "@/types/storefront";
import {
  heroCta,
  heroSubtitle,
  heroTitle,
  sectionVisible,
} from "@/lib/appearance";
import { lowestVariantPrice } from "@/lib/variants";
import { starLabel } from "@/lib/reviews";

export default function ProductBrowser({ slug }: { slug: string }) {
  const { store, addItem } = useStorefront();
  const isArabic = store.language === "ar";
  const appearance = store.appearance;

  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const keyPath = useMemo(
    () => makeCatalogKey(slug, activeSearch, category),
    [slug, activeSearch, category]
  );
  const snapshot = useSyncExternalStore(
    SUBSCRIBE_CATALOG,
    () => READ_CATALOG(keyPath),
    () => LOADING_CATALOG_SNAPSHOT
  );
  const [page, setPage] = useState(1);

  // (Re)query on page/filter changes. This only synchronizes with the external
  // catalog store — requestCatalog never calls React setState.
  useEffect(() => {
    requestCatalog(slug, page, activeSearch, category);
  }, [slug, page, activeSearch, category]);

  const applySearch = () => {
    setActiveSearch(searchInput.trim());
    setPage(1);
  };

  const showHero = sectionVisible(appearance, "hero") && appearance.hero.visible;
  const showCategories = sectionVisible(appearance, "categories");
  const showCatalog = sectionVisible(appearance, "catalog");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const product of snapshot.products) {
      if (product.category) set.add(product.category);
    }
    return Array.from(set).slice(0, 12);
  }, [snapshot.products]);

  const title = heroTitle(appearance.hero, isArabic ? "ar" : "en", store.name);
  const subtitle = heroSubtitle(appearance.hero, isArabic ? "ar" : "en");
  const cta = heroCta(appearance.hero, isArabic ? "ar" : "en");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Published hero / banner */}
      {showHero && (
        <section
          className="relative mb-8 overflow-hidden rounded-3xl border border-zinc-200"
          style={{ backgroundColor: store.secondaryColor }}
        >
          {appearance.hero.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appearance.hero.imageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-35"
            />
          )}
          <div className="relative space-y-3 px-6 py-10 sm:px-10 sm:py-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
              {store.name}
            </p>
            <h1 className="max-w-2xl text-2xl font-black leading-tight text-white sm:text-4xl">
              {title}
            </h1>
            {subtitle && (
              <p className="max-w-xl text-sm leading-relaxed text-white/80">{subtitle}</p>
            )}
            {cta && showCatalog && (
              <a
                href="#store-catalog"
                className="inline-block rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: store.primaryColor }}
              >
                {cta}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Store intro (shown when no hero title is configured) */}
      {!showHero && (
        <div className="mb-8">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{store.name}</h1>
          {store.description && (
            <p className="mt-1.5 max-w-2xl text-sm text-zinc-600">{store.description}</p>
          )}
        </div>
      )}

      {showCategories && categories.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Product categories">
          <button
            type="button"
            onClick={() => {
              setCategory(null);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
              category === null
                ? "border-transparent text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
            style={category === null ? { backgroundColor: store.primaryColor } : undefined}
          >
            {isArabic ? "الكل" : "All"}
          </button>
          {categories.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => {
                setCategory(entry);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                category === entry
                  ? "border-transparent text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
              style={category === entry ? { backgroundColor: store.primaryColor } : undefined}
            >
              {entry}
            </button>
          ))}
        </div>
      )}

      {showCatalog && (
        <div id="store-catalog">
          {/* Search bar */}
          <form
            className="mb-5 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              applySearch();
            }}
          >
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={isArabic ? "ابحث في المنتجات…" : "Search products…"}
              aria-label={isArabic ? "بحث المنتجات" : "Search products"}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md hover:opacity-90 sm:flex-none"
                style={{ backgroundColor: store.primaryColor }}
              >
                {isArabic ? "بحث" : "Search"}
              </button>
              {activeSearch && (
                <button
                  type="button"
                  aria-label={isArabic ? "مسح البحث" : "Clear search"}
                  onClick={() => {
                    setSearchInput("");
                    setActiveSearch("");
                    setPage(1);
                  }}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  ✕
                </button>
              )}
            </div>
          </form>

          {/* Active category filter chip */}
          {category && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  setCategory(null);
                  setPage(1);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-bold text-zinc-700"
              >
                {category} ✕
              </button>
            </div>
          )}

          {/* States */}
          {snapshot.status === "loading" && (
            <>
              <div className="mb-5 h-0.5 w-full animate-pulse overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full w-1/3 rounded-full"
                  style={{ backgroundColor: store.primaryColor }}
                />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="space-y-3 rounded-2xl border border-zinc-200 p-4 animate-pulse"
                  >
                    <div className="h-36 rounded-xl bg-zinc-100" />
                    <div className="h-4 w-3/4 rounded bg-zinc-200" />
                    <div className="h-4 w-1/3 rounded bg-zinc-100" />
                  </div>
                ))}
              </div>
            </>
          )}

          {snapshot.status === "error" && (
            <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-12 text-center">
              <p className="text-sm font-bold text-rose-800">
                {isArabic ? "تعذر تحميل المنتجات." : "Could not load products."}
              </p>
              <button
                type="button"
                onClick={() => requestCatalog(slug, snapshot.page, activeSearch, category)}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                {isArabic ? "إعادة المحاولة" : "Try again"}
              </button>
            </div>
          )}

          {snapshot.status === "ready" && snapshot.products.length === 0 && (
            <div className="space-y-2 rounded-2xl border border-zinc-200 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
                🛍️
              </div>
              <h3 className="text-base font-bold">
                {activeSearch || category
                  ? isArabic
                    ? "لا توجد نتائج مطابقة"
                    : "No matching products"
                  : isArabic
                    ? "لم يقم هذا المتجر بإضافة منتجات بعد"
                    : "This store has no products yet"}
              </h3>
              {(activeSearch || category) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setActiveSearch("");
                    setCategory(null);
                    setPage(1);
                  }}
                  className="mt-2 rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  {isArabic ? "إعادة تعيين التصفية" : "Reset filters"}
                </button>
              )}
            </div>
          )}

          {snapshot.status === "ready" && snapshot.products.length > 0 && (
            <>
              <p className="mb-4 text-xs text-zinc-500">
                {isArabic
                  ? `${snapshot.total} منتج`
                  : `${snapshot.total} ${snapshot.total === 1 ? "product" : "products"}`}
              </p>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {snapshot.products.map((product: PublicProduct) => {
                  const displayPrice = product.hasVariants
                    ? lowestVariantPrice(product.price, product.variants)
                    : product.price;
                  return (
                    <div
                      key={product.id}
                      className="group flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-xs transition-shadow hover:shadow-md"
                    >
                      <Link href={`/store/${slug}/product/${product.id}`} className="block">
                        <div className="relative h-44 w-full overflow-hidden rounded-t-2xl bg-zinc-100">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-300">
                              <svg
                                className="h-10 w-10"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                />
                              </svg>
                            </div>
                          )}
                          {product.stock === 0 && (
                            <span className="absolute top-2 right-2 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              {isArabic ? "نفدت الكمية" : "Out of stock"}
                            </span>
                          )}
                          {product.hasVariants && product.stock > 0 && (
                            <span className="absolute top-2 right-2 rounded-md bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold text-white">
                              {product.variants.length}{" "}
                              {isArabic ? "خيارات" : "options"}
                            </span>
                          )}
                        </div>
                      </Link>

                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                            {product.category}
                          </span>
                          {product.reviewCount > 0 && (
                            <span
                              className="text-[11px] font-semibold text-amber-600"
                              title={`${product.ratingAverage} / 5`}
                            >
                              {starLabel(product.ratingAverage)}{" "}
                              <span className="text-zinc-400">
                                ({product.reviewCount})
                              </span>
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/store/${slug}/product/${product.id}`}
                          className="line-clamp-2 text-sm font-bold text-zinc-950 hover:opacity-80"
                        >
                          {product.name}
                        </Link>
                        {product.description && (
                          <p className="line-clamp-2 text-xs text-zinc-500">
                            {product.description}
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-between pt-2">
                          <div className="flex items-baseline gap-1.5">
                            {product.hasVariants && (
                              <span className="text-[10px] font-semibold text-zinc-400">
                                {isArabic ? "من" : "from"}
                              </span>
                            )}
                            <span className="text-sm font-black text-zinc-950">
                              {displayPrice.toLocaleString()}
                            </span>
                            <span className="text-[11px] font-semibold text-zinc-500">
                              {store.currency}
                            </span>
                            {product.compareAtPrice !== null &&
                              product.compareAtPrice > displayPrice && (
                                <span className="text-[11px] text-zinc-400 line-through">
                                  {product.compareAtPrice.toLocaleString()}
                                </span>
                              )}
                          </div>
                          {product.hasVariants ? (
                            <Link
                              href={`/store/${slug}/product/${product.id}`}
                              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                              style={{ backgroundColor: store.primaryColor }}
                            >
                              {isArabic ? "اختر" : "Options"}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled={product.stock < 1}
                              onClick={() => addItem(product, 1)}
                              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ backgroundColor: store.primaryColor }}
                            >
                              {isArabic ? "أضف" : "Add"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {(snapshot.hasMore || snapshot.page > 1) && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={snapshot.page <= 1}
                    onClick={() => setPage(snapshot.page - 1)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {isArabic ? "السابق" : "Previous"}
                  </button>
                  <span className="text-xs font-mono text-zinc-500">
                    {isArabic ? "صفحة" : "Page"} {snapshot.page}
                  </span>
                  <button
                    type="button"
                    disabled={!snapshot.hasMore}
                    onClick={() => setPage(snapshot.page + 1)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {isArabic ? "التالي" : "Next"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
