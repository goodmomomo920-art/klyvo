"use client";

import { useState, useMemo, useEffect } from "react";
import { Customer, CustomerFormData } from "@/types/customers";
import {
  getAuthorizedStoreCustomers,
  saveAuthorizedCustomer,
} from "@/lib/server/customers";
import CustomerDetailsModal from "@/components/dashboard/CustomerDetailsModal";
import CustomerModal from "@/components/dashboard/CustomerModal";
import { cached, clearClientCache } from "@/lib/clientCache";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  // Feedback Toast
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
    async function fetchCustomers() {
      try {
        const res = await cached("dashboard:customers", getAuthorizedStoreCustomers);
        if (!ignore) {
          if (res.success && res.data) {
            setCustomers(res.data);
          } else if (res.error) {
            showToast(res.error, "error");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          showToast(
            err instanceof Error ? err.message : "Failed to load customers from database.",
            "error"
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchCustomers();
    return () => {
      ignore = true;
    };
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const res = await cached("dashboard:customers", getAuthorizedStoreCustomers);
      if (res.success && res.data) {
        setCustomers(res.data);
      } else if (res.error) {
        showToast(res.error, "error");
      }
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Failed to refresh customers.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCustomer = async (formData: CustomerFormData, id?: string) => {
    const res = await saveAuthorizedCustomer(formData, id);
    if (res.success && res.data) {
      clearClientCache();
      if (id) {
        setCustomers((prev) => prev.map((c) => (c.id === id ? res.data! : c)));
        showToast(`Updated customer "${formData.name}" successfully.`);
      } else {
        setCustomers((prev) => [res.data!, ...prev]);
        showToast(`Added customer "${formData.name}" to directory.`);
      }
    } else {
      showToast(res.error || "Failed to save customer.", "error");
      throw new Error(res.error);
    }
  };

  // Filtered
  const filteredCustomers = useMemo(() => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        c.city.toLowerCase().includes(term) ||
        c.governorate.toLowerCase().includes(term)
    );
  }, [customers, searchQuery]);

  // Aggregate metrics
  const totalRevenue = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
  }, [customers]);

  const repeatCustomers = useMemo(() => {
    return customers.filter((c) => c.totalOrders > 1).length;
  }, [customers]);

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
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
              Customers Directory
            </h2>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-700 border border-zinc-200">
              {customers.length} {customers.length === 1 ? "Customer" : "Customers"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            View customer contact records, order histories, and Egyptian delivery governorates.
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
            onClick={() => {
              setCustomerToEdit(null);
              setIsFormModalOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-600 transition-colors"
          >
            + Add Customer
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
            Total Buyers
          </span>
          <span className="text-2xl font-black text-zinc-950 font-mono mt-1 block">
            {customers.length}
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
            Repeat Customers
          </span>
          <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">
            {repeatCustomers}
          </span>
          <span className="text-[11px] text-zinc-400">Placed 2+ store orders</span>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
            Customer Lifetime Value
          </span>
          <span className="text-2xl font-black text-[#2563EB] font-mono mt-1 block">
            EGP {totalRevenue.toLocaleString()}
          </span>
          <span className="text-[11px] text-zinc-400">Total customer spend</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
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
            placeholder="Search by customer name, phone number, email, or Egyptian governorate..."
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

      {/* Main Content: Table or Empty */}
      {isLoading && customers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center text-[#2563EB]">
            <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-zinc-950">Loading customer directory...</h3>
          <p className="text-xs text-zinc-500">Connecting to store database.</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 sm:p-16 text-center shadow-xs space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#2563EB]">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>

          <div className="max-w-sm mx-auto space-y-1.5">
            <h3 className="text-lg font-bold text-zinc-950">No customers registered yet</h3>
            <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
              When shoppers place orders on your store or you manually record customer contact records, their names, phone numbers, and purchase histories will be cataloged here.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setCustomerToEdit(null);
                setIsFormModalOpen(true);
              }}
              className="rounded-xl bg-[#2563EB] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-600"
            >
              + Add First Customer
            </button>
          </div>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs space-y-3">
          <p className="text-sm font-bold text-zinc-950">No matching customers found</p>
          <p className="text-xs text-zinc-500">
            No customer records match your search &quot;{searchQuery}&quot;.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Phone & Email</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4 text-center">Orders</th>
                  <th className="py-3.5 px-4 text-right">Total Spent</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredCustomers.map((cust) => (
                  <tr
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setIsDetailsOpen(true);
                    }}
                    className="hover:bg-zinc-50/70 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-white font-bold text-xs">
                          {cust.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-zinc-950 group-hover:text-[#2563EB] transition-colors">
                          {cust.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-zinc-700">
                      <div>📞 {cust.phone}</div>
                      {cust.email && <div className="text-zinc-400 text-[11px]">{cust.email}</div>}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600">
                      {[cust.city, cust.governorate].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-zinc-950">
                      {cust.totalOrders}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-right text-zinc-950">
                      EGP {cust.totalSpent.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerToEdit(cust);
                            setIsFormModalOpen(true);
                          }}
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(cust);
                            setIsDetailsOpen(true);
                          }}
                          className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                        >
                          History →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {filteredCustomers.map((cust) => (
              <div
                key={cust.id}
                onClick={() => {
                  setSelectedCustomer(cust);
                  setIsDetailsOpen(true);
                }}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs space-y-3 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-white font-bold text-xs">
                      {cust.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-950">{cust.name}</h4>
                      <p className="text-xs text-zinc-500 font-mono">📞 {cust.phone}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-zinc-950 block">
                      EGP {cust.totalSpent.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {cust.totalOrders} {cust.totalOrders === 1 ? "order" : "orders"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                  <span className="text-zinc-500">
                    {[cust.city, cust.governorate].filter(Boolean).join(", ") || "Egypt"}
                  </span>
                  <span className="text-[#2563EB] font-semibold">View History →</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Customer Details Modal */}
      <CustomerDetailsModal
        customer={selectedCustomer}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedCustomer(null);
        }}
      />

      {/* Customer Form Modal */}
      <CustomerModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setCustomerToEdit(null);
        }}
        onSubmit={handleSaveCustomer}
        customerToEdit={customerToEdit}
      />
    </div>
  );
}
