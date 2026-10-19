"use client";

import { useState } from "react";
import { Product, ProductFormData, ProductStatus } from "@/types/product";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: ProductFormData, id?: string) => void;
  productToEdit?: Product | null;
}

const CATEGORIES = [
  "Audio & Headphones",
  "Smartphones",
  "Wearables",
  "Accessories",
  "Computers & Tablets",
  "General Merchandise",
];

interface FormContentProps {
  onClose: () => void;
  onSubmit: (formData: ProductFormData, id?: string) => void;
  productToEdit?: Product | null;
}

function ProductFormContent({ onClose, onSubmit, productToEdit }: FormContentProps) {
  const isEditing = Boolean(productToEdit);
  const hasVariants = Boolean(productToEdit?.variantCount);

  const [name, setName] = useState(productToEdit?.name || "");
  const [sku, setSku] = useState(productToEdit?.sku || "");
  const [description, setDescription] = useState(productToEdit?.description || "");
  const [category, setCategory] = useState(productToEdit?.category || CATEGORIES[0]);
  const [price, setPrice] = useState(
    productToEdit?.price !== undefined ? productToEdit.price.toString() : ""
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    productToEdit?.compareAtPrice !== undefined ? productToEdit.compareAtPrice.toString() : ""
  );
  const [stock, setStock] = useState(
    productToEdit?.stock !== undefined ? productToEdit.stock.toString() : "10"
  );
  const [imageUrl, setImageUrl] = useState(productToEdit?.imageUrl || "");
  const [status, setStatus] = useState<ProductStatus>(productToEdit?.status || "Active");

  const [errors, setErrors] = useState<{
    name?: string;
    price?: string;
    compareAtPrice?: string;
    stock?: string;
  }>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};

    // 1. Name validation
    if (!name.trim()) {
      newErrors.name = "Product name is required.";
    }

    // 2. Price validation (positive number > 0)
    const numPrice = parseFloat(price);
    if (!price || isNaN(numPrice) || numPrice <= 0) {
      newErrors.price = "Enter a valid positive price in EGP.";
    }

    // 3. Compare-at price validation (if provided, must be > 0)
    let numCompare: number | undefined = undefined;
    if (compareAtPrice.trim()) {
      numCompare = parseFloat(compareAtPrice);
      if (isNaN(numCompare) || numCompare <= 0) {
        newErrors.compareAtPrice = "Compare-at price must be a positive number.";
      }
    }

    // 4. Stock validation (non-negative integer)
    const numStock = Number(stock);
    if (
      stock === "" ||
      isNaN(numStock) ||
      !Number.isInteger(numStock) ||
      numStock < 0
    ) {
      newErrors.stock = "Stock must be a whole non-negative integer (e.g. 0, 5, 20).";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onSubmit(
      {
        name: name.trim(),
        sku: sku.trim() || `KV-${Date.now().toString().slice(-4)}`,
        description: description.trim(),
        category,
        price: numPrice,
        compareAtPrice: numCompare,
        stock: numStock,
        imageUrl: imageUrl.trim() || undefined,
        status,
      },
      productToEdit?.id
    );
    onClose();
  };

  return (
    <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-6 py-4">
        <div>
          <h3 id="modal-title" className="text-lg font-bold text-zinc-950">
            {isEditing ? "Edit Product" : "Add New Product"}
          </h3>
          <p className="text-xs text-zinc-500">
            {isEditing
              ? "Update product details, pricing, and stock levels."
              : "Fill in the details to add a new product to your Egyptian store catalog."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Close modal"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* Name */}
        <div className="space-y-1 text-left">
          <label htmlFor="prod-name" className="block text-xs font-semibold text-zinc-700">
            Product Name <span className="text-rose-500">*</span>
          </label>
          <input
            id="prod-name"
            type="text"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="e.g. AeroSound Pro Wireless Headphones"
            className={`w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 ${
              errors.name
                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-200"
                : "border-zinc-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
            }`}
          />
          {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
        </div>

        {/* SKU and Category Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 text-left">
            <label htmlFor="prod-sku" className="block text-xs font-semibold text-zinc-700">
              SKU (Stock Keeping Unit)
            </label>
            <input
              id="prod-sku"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. KV-AUD-07"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="space-y-1 text-left">
            <label htmlFor="prod-category" className="block text-xs font-semibold text-zinc-700">
              Category
            </label>
            <select
              id="prod-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pricing Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 text-left">
            <label htmlFor="prod-price" className="block text-xs font-semibold text-zinc-700">
              Price in EGP <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-xs font-bold text-zinc-500 pointer-events-none">
                EGP
              </span>
              <input
                id="prod-price"
                type="number"
                step="0.5"
                min="1"
                required
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                }}
                placeholder="2450"
                className={`w-full rounded-xl border bg-white pl-14 pr-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 ${
                  errors.price
                    ? "border-rose-500 focus:border-rose-500 focus:ring-rose-200"
                    : "border-zinc-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
                }`}
              />
            </div>
            {errors.price && <p className="text-xs text-rose-500 mt-1">{errors.price}</p>}
          </div>

          <div className="space-y-1 text-left">
            <label htmlFor="prod-compare-price" className="block text-xs font-semibold text-zinc-700">
              Compare-at Price in EGP (Optional)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-xs font-bold text-zinc-500 pointer-events-none">
                EGP
              </span>
              <input
                id="prod-compare-price"
                type="number"
                step="0.5"
                min="1"
                value={compareAtPrice}
                onChange={(e) => {
                  setCompareAtPrice(e.target.value);
                  if (errors.compareAtPrice)
                    setErrors((prev) => ({ ...prev, compareAtPrice: undefined }));
                }}
                placeholder="2800"
                className={`w-full rounded-xl border bg-white pl-14 pr-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 ${
                  errors.compareAtPrice
                    ? "border-rose-500 focus:border-rose-500 focus:ring-rose-200"
                    : "border-zinc-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
                }`}
              />
            </div>
            {errors.compareAtPrice && (
              <p className="text-xs text-rose-500 mt-1">{errors.compareAtPrice}</p>
            )}
          </div>
        </div>

        {/* Stock and Status Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1 text-left">
            <label htmlFor="prod-stock" className="block text-xs font-semibold text-zinc-700">
              Stock Quantity (Whole Units) <span className="text-rose-500">*</span>
            </label>
            <input
              id="prod-stock"
              type="number"
              step="1"
              min="0"
              required
              disabled={hasVariants}
              value={stock}
              onChange={(e) => {
                setStock(e.target.value);
                if (errors.stock) setErrors((prev) => ({ ...prev, stock: undefined }));
              }}
              placeholder="15"
              className={`w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 ${
                errors.stock
                  ? "border-rose-500 focus:border-rose-500 focus:ring-rose-200"
                  : "border-zinc-300 focus:border-[#2563EB] focus:ring-[#2563EB]/20"
              }`}
            />
            {hasVariants ? (
              <p className="text-[11px] text-zinc-500">
                Stock is derived from this product&apos;s variants. Manage it in the
                Variants panel.
              </p>
            ) : (
              errors.stock && <p className="text-xs text-rose-500 mt-1">{errors.stock}</p>
            )}
          </div>

          <div className="space-y-1 text-left">
            <label htmlFor="prod-status" className="block text-xs font-semibold text-zinc-700">
              Status
            </label>
            <select
              id="prod-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            >
              <option value="Active">Active (Visible in Store)</option>
              <option value="Draft">Draft (Hidden)</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Image URL with Preview */}
        <div className="space-y-1 text-left">
          <label htmlFor="prod-image" className="block text-xs font-semibold text-zinc-700">
            Product Image URL (Optional)
          </label>
          <input
            id="prod-image"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/... (optional demo photo)"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
          />
          <p className="text-[11px] text-zinc-400">
            Leave empty to use a clean generated demo fallback placeholder.
          </p>
        </div>

        {/* Description */}
        <div className="space-y-1 text-left">
          <label htmlFor="prod-desc" className="block text-xs font-semibold text-zinc-700">
            Description (Optional)
          </label>
          <textarea
            id="prod-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief technical or product overview for Egyptian customers..."
            className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 resize-none"
          />
        </div>

        {/* Footer Buttons */}
        <div className="pt-4 border-t border-zinc-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600 transition-colors"
          >
            {isEditing ? "Save Changes" : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ProductModal({
  isOpen,
  onClose,
  onSubmit,
  productToEdit,
}: ProductModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        <ProductFormContent
          key={productToEdit ? productToEdit.id : "new-product"}
          onClose={onClose}
          onSubmit={onSubmit}
          productToEdit={productToEdit}
        />
      </div>
    </div>
  );
}
