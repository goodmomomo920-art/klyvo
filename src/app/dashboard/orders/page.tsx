"use client";

import { useState, useMemo, useEffect } from "react";
import { Order, CreateOrderInput } from "@/types/orders";
import { OrderStatus, PaymentStatus } from "@/types/database";
import {
  getAuthorizedStoreOrders,
  createAuthorizedStoreOrder,
  updateAuthorizedOrderStatus,
} from "@/lib/server/orders";
import OrderDetailsModal from "@/components/dashboard/OrderDetailsModal";
import CreateOrderModal from "@/components/dashboard/CreateOrderModal";
import { cached, clearClientCache } from "@/lib/clientCache";

const STATUS_FILTERS: Array<{ label: string; value: OrderStatus | "All" }> = [
  { label: "All Orders", value: "All" },
  { label: "Pending", value: "Pending" },
  { label: "Processing", value: "Processing" },
  { label: "Shipped", value: "Shipped" },
  { label: "Delivered", value: "Delivered" },
  { label: "Cancelled", value: "Cancelled" },
];

const STATUS_BADGES: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  Pending: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  Processing: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  Shipped: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
  Delivered: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
  Cancelled: { bg: "bg-zinc-100", text: "text-zinc-600", border: "border-zinc-200" },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [activeStatus, setActiveStatus] = useState<OrderStatus | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Toast feedback
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
    async function fetchOrders() {
      try {
        const res = await cached("dashboard:orders", getAuthorizedStoreOrders);
        if (!ignore) {
          if (res.success && res.data) {
            setOrders(res.data);
          } else if (res.error) {
            showToast(res.error, "error");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          showToast(
            err instanceof Error ? err.message : "Failed to load store orders.",
            "error"
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchOrders();
    return () => {
      ignore = true;
    };
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const res = await cached("dashboard:orders", getAuthorizedStoreOrders);
      if (res.success && res.data) {
        setOrders(res.data);
      } else if (res.error) {
        showToast(res.error, "error");
      }
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to refresh orders.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrder = async (input: CreateOrderInput) => {
    const res = await createAuthorizedStoreOrder(input);
    if (res.success && res.data) {
      clearClientCache();
      setOrders((prev) => [res.data!, ...prev]);
      showToast(`Created order ${res.data.orderNumber} successfully.`);
    } else {
      showToast(res.error || "Failed to create order.", "error");
      throw new Error(res.error);
    }
  };

  const handleStatusUpdate = async (
    orderId: string,
    status: OrderStatus,
    paymentStatus?: PaymentStatus
  ) => {
    const res = await updateAuthorizedOrderStatus(orderId, status, paymentStatus);
    if (res.success && res.data) {
      clearClientCache();
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data! : o)));
      setSelectedOrder(res.data);
      showToast(`Order ${res.data.orderNumber} status updated to ${status}.`);
    } else {
      showToast(res.error || "Failed to update order status.", "error");
      throw new Error(res.error);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesStatus = activeStatus === "All" || o.status === activeStatus;
      const term = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !term ||
        o.orderNumber.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        o.customerPhone.toLowerCase().includes(term) ||
        (o.customerEmail && o.customerEmail.toLowerCase().includes(term));

      return matchesStatus && matchesSearch;
    });
  }, [orders, activeStatus, searchQuery]);

  // Counts for tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: orders.length };
    orders.forEach((o) => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Toast banner */}
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
              Orders & Fulfillment
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-700 border border-zinc-200">
              {orders.length} {orders.length === 1 ? "Order" : "Orders"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Track customer orders, delivery destinations across Egyptian governorates, and payment reconciliations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors shadow-xs disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors"
          >
            + Record Order
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3">
        {/* Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {STATUS_FILTERS.map((f) => {
            const count = statusCounts[f.value] || 0;
            const isActive = activeStatus === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setActiveStatus(f.value)}
                className={`rounded-xl px-3 py-1.5 font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#080B12] text-white shadow-xs"
                    : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-zinc-200/80 text-zinc-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
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
            placeholder="Search by order number (ORD-...), customer name, or phone..."
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-10 pr-4 py-2 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
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
      </div>

      {/* Main Content: Table on Desktop, Cards on Mobile */}
      {isLoading && orders.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center text-[#2563EB]">
            <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-zinc-950">Loading orders...</h3>
          <p className="text-xs text-zinc-500">Connecting to store database.</p>
        </div>
      ) : orders.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 sm:p-16 text-center shadow-xs space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          </div>

          <div className="max-w-sm mx-auto space-y-1.5">
            <h3 className="text-lg font-bold text-zinc-950">No customer orders yet</h3>
            <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
              When shoppers place orders on your store or you record manual orders via phone/WhatsApp, their Egyptian shipping destinations and payment statuses will appear here.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600"
            >
              + Record First Order
            </button>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <p className="text-sm font-bold text-zinc-950">No matching orders found</p>
          <p className="text-xs text-zinc-500">
            No orders match your filter criteria or search query &quot;{searchQuery}&quot;.
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveStatus("All");
              setSearchQuery("");
            }}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-3.5 px-4">Order Number</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Customer & City</th>
                  <th className="py-3.5 px-4">Total (EGP)</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredOrders.map((order) => {
                  const badge = STATUS_BADGES[order.status] || STATUS_BADGES.Pending;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => {
                        setSelectedOrder(order);
                        setIsDetailsOpen(true);
                      }}
                      className="hover:bg-zinc-50/70 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-950 group-hover:text-[#2563EB]">
                        {order.orderNumber}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-zinc-500">
                        {new Date(order.createdAt).toLocaleDateString("en-EG", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-zinc-900 block truncate">
                          {order.customerName}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          📞 {order.customerPhone}
                          {order.shippingGovernorate ? ` · ${order.shippingGovernorate}` : ""}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-950">
                        {order.currency} {order.total.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                            order.paymentStatus === "Paid"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : order.paymentStatus === "Refunded"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {order.paymentStatus}
                        </span>
                        <span className="block text-[10px] text-zinc-400 mt-0.5">
                          {order.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-xs font-semibold text-[#2563EB] group-hover:underline">
                          View Details →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredOrders.map((order) => {
              const badge = STATUS_BADGES[order.status] || STATUS_BADGES.Pending;
              return (
                <div
                  key={order.id}
                  onClick={() => {
                    setSelectedOrder(order);
                    setIsDetailsOpen(true);
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-zinc-950">
                      {order.orderNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <p className="font-bold text-zinc-900">{order.customerName}</p>
                    <p className="text-zinc-500 font-mono">
                      📞 {order.customerPhone}
                      {order.shippingGovernorate ? ` · ${order.shippingGovernorate}` : ""}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-sm text-zinc-950">
                        {order.currency} {order.total.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-zinc-400 block">
                        {order.paymentMethod} ({order.paymentStatus})
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-[#2563EB]">
                      View Details →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Details Modal */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedOrder(null);
        }}
        onStatusUpdate={handleStatusUpdate}
      />

      {/* Create Modal */}
      <CreateOrderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateOrder}
      />
    </div>
  );
}
