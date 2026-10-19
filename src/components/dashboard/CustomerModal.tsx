"use client";

import { useState } from "react";
import { Customer, CustomerFormData } from "@/types/customers";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CustomerFormData, customerId?: string) => Promise<void>;
  customerToEdit?: Customer | null;
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

export default function CustomerModal({
  isOpen,
  onClose,
  onSubmit,
  customerToEdit,
}: CustomerModalProps) {
  const isEditing = Boolean(customerToEdit);

  const [name, setName] = useState(customerToEdit?.name || "");
  const [phone, setPhone] = useState(customerToEdit?.phone || "");
  const [email, setEmail] = useState(customerToEdit?.email || "");
  const [address, setAddress] = useState(customerToEdit?.address || "");
  const [city, setCity] = useState(customerToEdit?.city || "");
  const [governorate, setGovernorate] = useState(
    customerToEdit?.governorate || EGYPTIAN_GOVERNORATES[0]
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = "Customer name is required.";
    if (!phone.trim()) newErrors.phone = "Phone number is required.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(
        {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          governorate: governorate.trim() || undefined,
        },
        customerToEdit?.id
      );
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
        <div className="relative w-full max-w-lg transform overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl transition-all">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-6 py-4">
            <div>
              <h3 className="text-base font-bold text-zinc-950">
                {isEditing ? "Edit Customer Details" : "Add New Customer"}
              </h3>
              <p className="text-xs text-zinc-500">
                Customer records are linked to future orders and delivery waybills.
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

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
            <div>
              <label htmlFor="customer-name-field" className="block text-xs font-semibold text-zinc-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="customer-name-field"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mahmoud El-Sayed"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
              />
              {errors.name && <p className="text-[11px] text-rose-500 mt-0.5">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="customer-phone-field" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Phone (Egypt) <span className="text-rose-500">*</span>
                </label>
                <input
                  id="customer-phone-field"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 01123456789"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                />
                {errors.phone && <p className="text-[11px] text-rose-500 mt-0.5">{errors.phone}</p>}
              </div>

              <div>
                <label htmlFor="customer-email-field" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  id="customer-email-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mahmoud@gmail.com"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="customer-gov-field" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Governorate
                </label>
                <select
                  id="customer-gov-field"
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                >
                  {EGYPTIAN_GOVERNORATES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="customer-city-field" className="block text-xs font-semibold text-zinc-700 mb-1">
                  City / District
                </label>
                <input
                  id="customer-city-field"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Heliopolis"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="customer-address-field" className="block text-xs font-semibold text-zinc-700 mb-1">
                Default Shipping Address (Optional)
              </label>
              <input
                id="customer-address-field"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Building, street, apartment..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-[#2563EB]"
              />
            </div>

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
                {submitting ? "Saving..." : isEditing ? "Save Changes" : "Add Customer"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
