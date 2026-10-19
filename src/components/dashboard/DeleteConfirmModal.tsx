"use client";

import { Product } from "@/types/product";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export default function DeleteConfirmModal({
  isOpen,
  product,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!isOpen || !product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-2xl transition-all">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <div>
              <h3 id="delete-dialog-title" className="text-base font-bold text-zinc-950">
                Delete Product
              </h3>
              <p className="text-xs text-zinc-500">
                This action will permanently delete this demo item from your local browser catalog.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-1">
            <p className="text-sm font-bold text-zinc-900">{product.name}</p>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>SKU: {product.sku}</span>
              <span>•</span>
              <span className="font-semibold text-zinc-800">
                EGP {product.price.toLocaleString()}
              </span>
              <span>•</span>
              <span>{product.stock} units</span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm(product.id);
                onClose();
              }}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-rose-600/30 hover:bg-rose-700 transition-colors"
            >
              Delete Product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
