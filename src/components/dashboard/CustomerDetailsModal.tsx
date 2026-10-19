"use client";

import { useState, useEffect } from "react";
import { Customer } from "@/types/customers";
import { Order } from "@/types/orders";
import { getAuthorizedStoreCustomerDetails } from "@/lib/server/customers";

interface CustomerDetailsModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onViewOrder?: (order: Order) => void;
}

export default function CustomerDetailsModal({
  customer,
  isOpen,
  onClose,
  onViewOrder,
}: CustomerDetailsModalProps) {
  const [details, setDetails] = useState<Customer | null>(null);
  const loading = Boolean(isOpen && customer?.id && (!details || details.id !== customer.id));

  useEffect(() => {
    let ignore = false;
    if (isOpen && customer?.id) {
      getAuthorizedStoreCustomerDetails(customer.id).then((res) => {
        if (!ignore && res.success && res.data) {
          setDetails(res.data);
        }
      });
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, customer?.id]);

  if (!isOpen || !customer) return null;

  const activeCustomer = details && details.id === customer.id ? details : customer;
  const avgOrderValue =
    activeCustomer.totalOrders > 0
      ? Math.round(activeCustomer.totalSpent / activeCustomer.totalOrders)
      : 0;

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
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB] text-white font-bold text-sm">
                {activeCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-950">{activeCustomer.name}</h3>
                <p className="text-xs text-zinc-500 font-mono">📞 {activeCustomer.phone}</p>
              </div>
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

          <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
            {/* Lifetime Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 text-center">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Total Orders
                </span>
                <span className="text-lg font-black text-zinc-950 font-mono mt-0.5 block">
                  {activeCustomer.totalOrders}
                </span>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 text-center">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Total Spent
                </span>
                <span className="text-lg font-black text-[#2563EB] font-mono mt-0.5 block">
                  EGP {activeCustomer.totalSpent.toLocaleString()}
                </span>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 text-center">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Avg Order Value
                </span>
                <span className="text-lg font-black text-zinc-950 font-mono mt-0.5 block">
                  EGP {avgOrderValue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Contact & Address Information */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2 text-xs">
              <h4 className="font-bold uppercase tracking-wider text-zinc-400 text-[10px]">
                Customer Contact & Delivery Location
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-700">
                <div>
                  <span className="text-zinc-400 block text-[11px]">Primary Phone</span>
                  <span className="font-mono font-bold text-zinc-950">{activeCustomer.phone}</span>
                </div>
                {activeCustomer.email && (
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Email Address</span>
                    <span className="text-zinc-900">{activeCustomer.email}</span>
                  </div>
                )}
                <div>
                  <span className="text-zinc-400 block text-[11px]">Location</span>
                  <span className="text-zinc-900">
                    {[activeCustomer.city, activeCustomer.governorate].filter(Boolean).join(", ") ||
                      "Egypt"}
                  </span>
                </div>
                {activeCustomer.address && (
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Default Street Address</span>
                    <span className="text-zinc-900">{activeCustomer.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Order History */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Order History ({activeCustomer.orders?.length || activeCustomer.totalOrders})
              </h4>

              {loading ? (
                <div className="py-8 text-center text-xs text-zinc-400">Loading order history...</div>
              ) : activeCustomer.orders && activeCustomer.orders.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase font-bold text-zinc-500">
                      <tr>
                        <th className="py-2.5 px-3">Order Number</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {activeCustomer.orders.map((ord) => (
                        <tr
                          key={ord.id}
                          onClick={() => onViewOrder && onViewOrder(ord)}
                          className={`hover:bg-zinc-50 transition-colors ${
                            onViewOrder ? "cursor-pointer" : ""
                          }`}
                        >
                          <td className="py-2 px-3 font-mono font-bold text-zinc-950 hover:text-[#2563EB]">
                            {ord.orderNumber}
                          </td>
                          <td className="py-2 px-3 text-zinc-500">
                            {new Date(ord.createdAt).toLocaleDateString("en-EG", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-2 px-3">
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-right text-zinc-950">
                            {ord.currency} {ord.total.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-400">
                  No orders recorded for this customer yet.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-200 bg-zinc-50/70 px-6 py-3 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
