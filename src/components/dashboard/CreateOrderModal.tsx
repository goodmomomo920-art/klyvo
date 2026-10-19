"use client";

import { useState } from "react";
import { CreateOrderInput } from "@/types/orders";
import { PaymentMethod } from "@/types/database";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateOrderInput) => Promise<void>;
}

const EGYPTIAN_GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Sharqia",
  "Dakahlia",
  "Gharbia",
  "Monufia",
  "Damietta",
  "Port Said",
  "Ismailia",
  "Suez",
  "Kafr El Sheikh",
  "Beheira",
  "Beni Suef",
  "Fayoum",
  "Minya",
  "Asyut",
  "Sohag",
  "Qena",
  "Luxor",
  "Aswan",
  "Red Sea",
  "South Sinai",
];

export default function CreateOrderModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateOrderModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingGovernorate, setShippingGovernorate] = useState(EGYPTIAN_GOVERNORATES[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash on Delivery");
  const [shippingFee, setShippingFee] = useState("50");
  const [notes, setNotes] = useState("");

  // Items
  const [items, setItems] = useState<
    Array<{ productName: string; sku: string; unitPrice: string; quantity: string }>
  >([{ productName: "", sku: "", unitPrice: "", quantity: "1" }]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems((prev) => [...prev, { productName: "", sku: "", unitPrice: "", quantity: "1" }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, val: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!customerName.trim()) newErrors.customerName = "Customer name is required.";
    if (!customerPhone.trim()) newErrors.customerPhone = "Customer phone number is required.";
    if (!shippingAddress.trim()) newErrors.shippingAddress = "Shipping address is required.";

    const parsedFee = parseFloat(shippingFee);
    if (isNaN(parsedFee) || parsedFee < 0) {
      newErrors.shippingFee = "Valid non-negative shipping fee required.";
    }

    const validatedItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.productName.trim()) {
        newErrors[`item_${i}_name`] = "Item name required.";
      }
      const price = parseFloat(it.unitPrice);
      if (isNaN(price) || price < 0) {
        newErrors[`item_${i}_price`] = "Valid non-negative price required.";
      }
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        newErrors[`item_${i}_qty`] = "Qty must be a positive integer.";
      }
      if (it.productName.trim() && !isNaN(price) && price >= 0 && Number.isInteger(qty) && qty > 0) {
        validatedItems.push({
          productName: it.productName.trim(),
          sku: it.sku.trim() || undefined,
          unitPrice: price,
          quantity: qty,
        });
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        shippingAddress: shippingAddress.trim(),
        shippingCity: shippingCity.trim() || undefined,
        shippingGovernorate: shippingGovernorate.trim() || undefined,
        paymentMethod,
        shippingFee: parsedFee,
        notes: notes.trim() || undefined,
        items: validatedItems,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
        <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-6 py-4">
            <div>
              <h3 className="text-lg font-bold text-zinc-950">Record New Order</h3>
              <p className="text-xs text-zinc-500">
                Create a manual customer order from WhatsApp, Instagram, or phone inquiries.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Customer Information */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Customer Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-order-cust-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Customer Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="create-order-cust-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ahmed Mahmoud"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                  />
                  {errors.customerName && (
                    <p className="text-[11px] text-rose-500 mt-0.5">{errors.customerName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="create-order-cust-phone" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Phone Number (Egypt) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="create-order-cust-phone"
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 01012345678"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                  />
                  {errors.customerPhone && (
                    <p className="text-[11px] text-rose-500 mt-0.5">{errors.customerPhone}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="create-order-cust-email" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  id="create-order-cust-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="ahmed@example.com"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-3 pt-2 border-t border-zinc-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Delivery Destination
              </h4>
              <div>
                <label htmlFor="create-order-ship-addr" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Street Address & Apartment <span className="text-rose-500">*</span>
                </label>
                <input
                  id="create-order-ship-addr"
                  type="text"
                  required
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="e.g. 15 El-Tahrir St, Apt 4"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                />
                {errors.shippingAddress && (
                  <p className="text-[11px] text-rose-500 mt-0.5">{errors.shippingAddress}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-order-ship-gov" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Governorate
                  </label>
                  <select
                    id="create-order-ship-gov"
                    value={shippingGovernorate}
                    onChange={(e) => setShippingGovernorate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                  >
                    {EGYPTIAN_GOVERNORATES.map((gov) => (
                      <option key={gov} value={gov}>
                        {gov}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="create-order-ship-city" className="block text-xs font-semibold text-zinc-700 mb-1">
                    City / District
                  </label>
                  <input
                    id="create-order-ship-city"
                    type="text"
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                    placeholder="e.g. Nasr City, Dokki"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3 pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Order Items
                </h4>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-xs font-bold text-[#2563EB] hover:underline"
                >
                  + Add Item
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-0.5">
                        Product Name
                      </label>
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) => handleItemChange(idx, "productName", e.target.value)}
                        placeholder="e.g. Wireless Headphones"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-0.5">
                        SKU
                      </label>
                      <input
                        type="text"
                        value={item.sku}
                        onChange={(e) => handleItemChange(idx, "sku", e.target.value)}
                        placeholder="OPT-01"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-0.5">
                        Price (EGP)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value)}
                        placeholder="350"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-0.5">
                        Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 font-bold text-center"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="rounded p-1 text-rose-500 hover:bg-rose-50"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment & Shipping Fee */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-100">
              <div>
                <label htmlFor="create-order-pay-method" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Payment Method
                </label>
                <select
                  id="create-order-pay-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                >
                  <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                  <option value="InstaPay">InstaPay Egypt</option>
                  <option value="Vodafone Cash">Vodafone Cash</option>
                  <option value="Credit / Debit Card">Credit / Debit Card</option>
                </select>
              </div>

              <div>
                <label htmlFor="create-order-ship-fee" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Courier Shipping Fee (EGP)
                </label>
                <input
                  id="create-order-ship-fee"
                  type="number"
                  min="0"
                  step="5"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none ${
                    errors.shippingFee ? "border-rose-500 bg-rose-50/30" : "border-zinc-300 focus:border-[#2563EB]"
                  }`}
                />
                {errors.shippingFee && (
                  <p className="mt-1 text-[11px] text-rose-500">{errors.shippingFee}</p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="create-order-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
                Notes for Courier / Customer (Optional)
              </label>
              <textarea
                id="create-order-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Call customer before delivery; leave with building security if absent"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 resize-none focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-zinc-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-[#2563EB] px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600 disabled:opacity-50"
              >
                {submitting ? "Creating Order..." : "Create Order"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
