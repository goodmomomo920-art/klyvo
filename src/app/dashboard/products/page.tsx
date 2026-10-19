"use client";

import { useState, useMemo, useEffect } from "react";
import { Product, ProductFormData, ProductStatus } from "@/types/product";
import {
  getAuthorizedStoreProducts,
  createAuthorizedStoreProduct,
  updateAuthorizedStoreProduct,
  deleteAuthorizedStoreProduct,
} from "@/lib/server/products";
import ProductModal from "@/components/dashboard/ProductModal";
import DeleteConfirmModal from "@/components/dashboard/DeleteConfirmModal";
import VariantsModal from "@/components/dashboard/VariantsModal";
import { cached, clearClientCache } from "@/lib/clientCache";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);

  // Toast / Feedback message
  const [feedback, setFeedback] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchProducts() {
      try {
        const res = await cached("dashboard:products", getAuthorizedStoreProducts);
        if (!ignore) {
          if (res.success && res.data) {
            setProducts(res.data);
          } else if (res.error) {
            showToast(res.error, "error");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          showToast(
            err instanceof Error ? err.message : "Failed to load products from database.",
            "error"
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchProducts();
    return () => {
      ignore = true;
    };
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const res = await cached("dashboard:products", getAuthorizedStoreProducts);
      if (res.success && res.data) {
        setProducts(res.data);
      } else if (res.error) {
        showToast(res.error, "error");
      }
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to load products from database.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Categories list derived from current items + standard defaults
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      // 1. Search Query
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase());

      // 2. Category
      const matchesCategory =
        selectedCategory === "All" || item.category === selectedCategory;

      // 3. Status
      const matchesStatus =
        selectedStatus === "All" || item.status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, selectedCategory, selectedStatus]);

  // Handle Create or Update
  const handleSaveProduct = async (formData: ProductFormData, id?: string) => {
    try {
      if (id) {
        // Update
        const res = await updateAuthorizedStoreProduct(id, formData);
        if (res.success && res.data) {
          clearClientCache();
          setProducts((prev) => prev.map((p) => (p.id === id ? res.data! : p)));
          showToast(`Updated "${formData.name}" successfully.`);
        } else {
          showToast(res.error || "Failed to update product.", "error");
        }
      } else {
        // Create
        const res = await createAuthorizedStoreProduct(formData);
        if (res.success && res.data) {
          clearClientCache();
          setProducts((prev) => [res.data!, ...prev]);
          showToast(`Added "${formData.name}" to your store catalog.`);
        } else {
          showToast(res.error || "Failed to create product.", "error");
        }
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to save product.", "error");
    }
  };

  // Handle Delete
  const handleConfirmDelete = async (id: string) => {
    const target = products.find((p) => p.id === id);
    try {
      const res = await deleteAuthorizedStoreProduct(id);
      if (res.success) {
        clearClientCache();
        setProducts((prev) => prev.filter((p) => p.id !== id));
        showToast(`Deleted "${target?.name || "Product"}" from catalog.`, "info");
      } else {
        showToast(res.error || "Failed to delete product.", "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to delete product.", "error");
    }
  };

  // Handle Quick Status Toggle
  const handleToggleStatus = async (id: string, newStatus: ProductStatus) => {
    const original = products.find((p) => p.id === id);
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
    );
    try {
      const res = await updateAuthorizedStoreProduct(id, { status: newStatus });
      if (res.success && res.data) {
        clearClientCache();
        setProducts((prev) => prev.map((p) => (p.id === id ? res.data! : p)));
        showToast(`Status changed to ${newStatus}.`);
      } else {
        if (original) {
          setProducts((prev) => prev.map((p) => (p.id === id ? original : p)));
        }
        showToast(res.error || "Failed to update product status.", "error");
      }
    } catch (err: unknown) {
      if (original) {
        setProducts((prev) => prev.map((p) => (p.id === id ? original : p)));
      }
      showToast(
        err instanceof Error ? err.message : "Failed to update product status.",
        "error"
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : feedback.type === "error"
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>
              {feedback.type === "success" ? "✓" : feedback.type === "error" ? "⚠" : "ℹ"}
            </span>
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Products
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-700 border border-zinc-200">
              {products.length} {products.length === 1 ? "Item" : "Items"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Manage your store catalog, pricing in Egyptian Pounds (EGP), and stock levels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Reload products from Supabase database"
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-xs disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh Catalog"}
          </button>

          <button
            type="button"
            onClick={() => {
              setProductToEdit(null);
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors"
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Connected database storage indicator banner */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 p-3 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          <span>
            <strong>Connected Store Catalog:</strong> Products are loaded and synchronized with your Supabase database using Row Level Security.
          </span>
        </span>
        <span className="text-[11px] text-emerald-700 font-semibold">Tenant Isolated</span>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name or SKU..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-cat" className="text-xs font-semibold text-zinc-500 whitespace-nowrap">
              Category:
            </label>
            <select
              id="filter-cat"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs sm:text-sm text-zinc-800 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            >
              {categoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="filter-status" className="text-xs font-semibold text-zinc-500 whitespace-nowrap">
              Status:
            </label>
            <select
              id="filter-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs sm:text-sm text-zinc-800 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Active Filters count summary */}
        <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-100">
          <span>
            Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> products
          </span>
          {(searchQuery || selectedCategory !== "All" || selectedStatus !== "All") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
                setSelectedStatus("All");
              }}
              className="text-[#2563EB] hover:underline font-medium"
            >
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Table on Desktop, Cards on Mobile */}
      {isLoading && products.length === 0 ? (
        // Catalog Loading State
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 sm:p-16 text-center shadow-xs space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center text-[#2563EB]">
            <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-zinc-950">Loading store catalog...</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Retrieving merchant products from your connected Supabase database.
          </p>
        </div>
      ) : products.length === 0 ? (
        // Catalog Empty State (0 total products)
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 sm:p-16 text-center shadow-xs space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <div className="max-w-sm mx-auto space-y-1">
            <h3 className="text-lg font-bold text-zinc-950">No products in your store</h3>
            <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
              Start building your online catalog. Add your first item to begin selling.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setProductToEdit(null);
                setIsFormModalOpen(true);
              }}
              className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600"
            >
              + Add First Product
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              {isLoading ? "Refreshing..." : "Refresh Catalog"}
            </button>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        // No Search Results State
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-base font-bold text-zinc-950">No matching products found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            No products matched your search &quot;{searchQuery}&quot; or the selected category/status filters.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
                setSelectedStatus("All");
              }}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-3.5 px-4">Product</th>
                  <th className="py-3.5 px-4">SKU & Category</th>
                  <th className="py-3.5 px-4">Price (EGP)</th>
                  <th className="py-3.5 px-4">Stock</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-zinc-50/70 transition-colors group"
                  >
                    {/* Product Name & Image */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 flex items-center justify-center">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="font-mono text-xs font-bold text-zinc-400">
                              IMG
                            </span>
                          )}
                        </div>
                        <div className="max-w-xs">
                          <span className="font-bold text-zinc-950 block truncate group-hover:text-[#2563EB] transition-colors">
                            {product.name}
                          </span>
                          {product.description && (
                            <span className="text-[11px] text-zinc-500 block truncate">
                              {product.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SKU & Category */}
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-xs text-zinc-700 block">
                        {product.sku}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {product.category}
                      </span>
                    </td>

                    {/* Price in EGP */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono font-bold text-zinc-950">
                          EGP {product.price.toLocaleString()}
                        </span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && (
                          <span className="text-[11px] font-mono text-zinc-400 line-through">
                            EGP {product.compareAtPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Stock */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            product.stock === 0
                              ? "text-rose-600"
                              : product.stock <= 5
                              ? "text-amber-600"
                              : "text-zinc-900"
                          }`}
                        >
                          {product.stock} in stock
                          {product.variantCount ? (
                            <span className="block text-[10px] font-normal text-zinc-500">
                              across {product.variantCount} variant
                              {product.variantCount === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </span>
                        {product.stock === 0 && (
                          <span className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                            Out of stock
                          </span>
                        )}
                        {product.stock > 0 && product.stock <= 5 && (
                          <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                            Low
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Toggle */}
                    <td className="py-3.5 px-4">
                      <select
                        value={product.status}
                        onChange={(e) =>
                          handleToggleStatus(product.id, e.target.value as ProductStatus)
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold border cursor-pointer ${
                          product.status === "Active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : product.status === "Draft"
                            ? "bg-zinc-100 text-zinc-700 border-zinc-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        <option value="Active">Active</option>
                        <option value="Draft">Draft</option>
                        <option value="Archived">Archived</option>
                      </select>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setVariantsProduct(product)}
                          className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50"
                          title="Manage variants"
                        >
                          Variants{product.variantCount ? ` (${product.variantCount})` : ""}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProductToEdit(product);
                            setIsFormModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 transition-colors"
                          title="Edit product"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProductToDelete(product);
                            setIsDeleteModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                          title="Delete product"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (Displayed on screens < md) */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 flex items-center justify-center">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="font-mono text-xs font-bold text-zinc-400">
                        IMG
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-zinc-950 truncate">
                      {product.name}
                    </h4>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {product.sku} · {product.category}
                    </p>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-zinc-950 font-mono">
                        EGP {product.price.toLocaleString()}
                      </span>
                      {product.compareAtPrice && product.compareAtPrice > product.price && (
                        <span className="text-xs text-zinc-400 line-through font-mono">
                          EGP {product.compareAtPrice.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
                  <span
                    className={`font-semibold ${
                      product.stock === 0 ? "text-rose-600" : "text-zinc-700"
                    }`}
                  >
                    {product.stock} units in stock
                  </span>

                  <select
                    value={product.status}
                    onChange={(e) =>
                      handleToggleStatus(product.id, e.target.value as ProductStatus)
                    }
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold border ${
                      product.status === "Active"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : product.status === "Draft"
                        ? "bg-zinc-100 text-zinc-700 border-zinc-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    <option value="Active">Active</option>
                    <option value="Draft">Draft</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setVariantsProduct(product)}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    Variants{product.variantCount ? ` (${product.variantCount})` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProductToEdit(product);
                      setIsFormModalOpen(true);
                    }}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProductToDelete(product);
                      setIsDeleteModalOpen(true);
                    }}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      <ProductModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setProductToEdit(null);
        }}
        onSubmit={handleSaveProduct}
        productToEdit={productToEdit}
      />

      {/* Variants Modal */}
      {variantsProduct && (
        <VariantsModal
          key={variantsProduct.id}
          isOpen
          product={variantsProduct}
          onClose={() => setVariantsProduct(null)}
          onSaved={(count) => {
            showToast(
              count > 0
                ? `Variants saved. Stock is now derived from ${count} variant(s).`
                : "Variants removed; this is a simple product again."
            );
            void handleRefresh();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        product={productToDelete}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setProductToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
