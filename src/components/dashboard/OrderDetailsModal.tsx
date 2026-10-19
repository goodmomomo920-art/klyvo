"use client";

import { useState } from "react";
import { Order } from "@/types/orders";
import { OrderStatus, PaymentStatus } from "@/types/database";

interface OrderDetailsModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (orderId: string, status: OrderStatus, paymentStatus?: PaymentStatus) => Promise<void>;
}

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  Pending: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  Processing: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  Shipped: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  Delivered: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  Cancelled: { bg: "bg-zinc-100", text: "text-zinc-700", border: "border-zinc-200" },
};

export default function OrderDetailsModal({
  order,
  isOpen,
  onClose,
  onStatusUpdate,
}: OrderDetailsModalProps) {
  const [updating, setUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>(order?.status || "Pending");
  const [currentPaymentStatus, setCurrentPaymentStatus] = useState<PaymentStatus>(
    order?.paymentStatus || "Unpaid"
  );

  if (!isOpen || !order) return null;

  const handleSaveStatus = async () => {
    setUpdating(true);
    try {
      await onStatusUpdate(order.id, currentStatus, currentPaymentStatus);
    } finally {
      setUpdating(false);
    }
  };

  const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.Pending;

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
        <div className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-2xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-base sm:text-lg font-black tracking-tight text-zinc-950">
                {order.orderNumber}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
              >
                {order.status}
              </span>
              <span className="text-xs text-zinc-500">
                {new Date(order.createdAt).toLocaleString("en-EG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
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
            {/* Status Update Controls */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Fulfillment & Payment Workflow
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="modal-order-status" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Order Status
                  </label>
                  <select
                    id="modal-order-status"
                    value={currentStatus}
                    onChange={(e) => setCurrentStatus(e.target.value as OrderStatus)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="Pending">Pending (New)</option>
                    <option value="Processing">Processing (Packed)</option>
                    <option value="Shipped">Shipped (With Courier)</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="modal-payment-status" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    id="modal-payment-status"
                    value={currentPaymentStatus}
                    onChange={(e) => setCurrentPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="Unpaid">Unpaid (COD Pending)</option>
                    <option value="Paid">Paid</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSaveStatus}
                    disabled={updating}
                    className="w-full rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {updating ? "Saving..." : "Update Status"}
                  </button>
                </div>
              </div>
            </div>

            {/* Customer & Shipping Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Customer Information
                </h4>
                <div>
                  <p className="text-sm font-bold text-zinc-950">{order.customerName}</p>
                  <p className="text-xs text-zinc-600 font-mono mt-0.5">📞 {order.customerPhone}</p>
                  {order.customerEmail && (
                    <p className="text-xs text-zinc-500 mt-0.5">✉️ {order.customerEmail}</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Delivery Destination
                </h4>
                <div>
                  <p className="text-xs text-zinc-700 leading-relaxed">{order.shippingAddress}</p>
                  {(order.shippingCity || order.shippingGovernorate) && (
                    <p className="text-xs font-semibold text-zinc-950 mt-1">
                      {[order.shippingCity, order.shippingGovernorate].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Payment Method: <strong>{order.paymentMethod}</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* Order Items Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Purchased Items ({order.items?.length || 0})
              </h4>
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Item Snapshot</th>
                      <th className="py-2.5 px-4">SKU</th>
                      <th className="py-2.5 px-4 text-right">Price</th>
                      <th className="py-2.5 px-4 text-center">Qty</th>
                      <th className="py-2.5 px-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-zinc-50/50">
                          <td className="py-2.5 px-4 font-semibold text-zinc-950">
                            {item.productName}
                            {item.variantLabel && (
                              <span className="block text-[10px] font-normal text-zinc-500">
                                {item.variantLabel}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-zinc-500">
                            {item.sku || "—"}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-zinc-700">
                            {order.currency} {item.unitPrice.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-center text-zinc-950">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-right text-zinc-950">
                            {order.currency} {item.lineTotal.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-zinc-400">
                          No items listed for this order.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="flex justify-end">
              <div className="w-full sm:w-72 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-mono">
                    {order.currency} {order.subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Shipping Fee</span>
                  <span className="font-mono">
                    {order.currency} {order.shippingFee.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-zinc-200 pt-2 flex justify-between font-bold text-sm text-zinc-950">
                  <span>Total Due</span>
                  <span className="font-mono text-[#2563EB]">
                    {order.currency} {order.total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {order.notes && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                <span className="font-semibold text-zinc-700">Order Notes: </span>
                <span className="text-zinc-600">{order.notes}</span>
              </div>
            )}
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
