"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { Customer, CustomerFormData } from "@/types/customers";
import { CustomerRow, OrderRow } from "@/types/database";
import { Order } from "@/types/orders";

function mapCustomerRowToCustomer(row: CustomerRow, orders?: Order[]): Customer {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address || "",
    city: row.city || "",
    governorate: row.governorate || "",
    totalOrders: Number(row.total_orders || 0),
    totalSpent: Number(row.total_spent || 0),
    orders,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Server Action: Fetches all customers for the authenticated merchant's store.
 */
export async function getAuthorizedStoreCustomers(search?: string): Promise<{
  success: boolean;
  data?: Customer[];
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  let customers = (data as CustomerRow[]).map((r) => mapCustomerRowToCustomer(r));

  if (search && search.trim()) {
    const term = search.toLowerCase().trim();
    customers = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        c.city.toLowerCase().includes(term) ||
        c.governorate.toLowerCase().includes(term)
    );
  }

  return { success: true, data: customers };
}

/**
 * Server Action: Retrieves customer details and their order history.
 */
export async function getAuthorizedStoreCustomerDetails(customerId: string): Promise<{
  success: boolean;
  data?: Customer;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();

  const { data: customerData, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("store_id", store.id)
    .single();

  if (customerError || !customerData) {
    return { success: false, error: customerError?.message || "Customer not found." };
  }

  const { data: ordersData } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  const mappedOrders: Order[] = (ordersData as OrderRow[] || []).map((o) => ({
    id: o.id,
    storeId: o.store_id,
    customerId: o.customer_id,
    orderNumber: o.order_number,
    customerName: o.customer_name,
    customerEmail: o.customer_email,
    customerPhone: o.customer_phone,
    shippingAddress: o.shipping_address,
    shippingCity: o.shipping_city,
    shippingGovernorate: o.shipping_governorate,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    currency: o.currency,
    subtotal: Number(o.subtotal),
    shippingFee: Number(o.shipping_fee),
    total: Number(o.total),
    notes: o.notes,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));

  return {
    success: true,
    data: mapCustomerRowToCustomer(customerData as CustomerRow, mappedOrders),
  };
}

/**
 * Server Action: Creates or updates a customer in the store directory.
 */
export async function saveAuthorizedCustomer(
  formData: CustomerFormData,
  customerId?: string
): Promise<{
  success: boolean;
  data?: Customer;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  if (!formData.name.trim() || !formData.phone.trim()) {
    return { success: false, error: "Customer name and phone number are required." };
  }

  const supabase = await createClient();

  if (customerId) {
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: formData.name.trim(),
        email: formData.email?.trim() || null,
        phone: formData.phone.trim(),
        address: formData.address?.trim() || "",
        city: formData.city?.trim() || "",
        governorate: formData.governorate?.trim() || "",
      })
      .eq("id", customerId)
      .eq("store_id", store.id)
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to update customer." };
    }
    return { success: true, data: mapCustomerRowToCustomer(data as CustomerRow) };
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        store_id: store.id,
        name: formData.name.trim(),
        email: formData.email?.trim() || null,
        phone: formData.phone.trim(),
        address: formData.address?.trim() || "",
        city: formData.city?.trim() || "",
        governorate: formData.governorate?.trim() || "",
        total_orders: 0,
        total_spent: 0,
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create customer." };
    }
    return { success: true, data: mapCustomerRowToCustomer(data as CustomerRow) };
  }
}
