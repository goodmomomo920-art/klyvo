"use server";

import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedStore } from "@/lib/server/stores";
import { applyLoyaltyForOrderTransition } from "@/lib/server/loyalty";
import { Order, OrderItem, CreateOrderInput } from "@/types/orders";
import { OrderRow, OrderItemRow, OrderStatus, PaymentStatus, PaymentMethod } from "@/types/database";

/**
 * Generates an order number using ORD-YYYYMMDD-[RANDOM] with cryptographically
 * secure randomness.
 */
export async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `ORD-${yyyy}${mm}${dd}-${rand}`;
}

function mapOrderRowToOrder(row: OrderRow, items?: OrderItem[]): Order {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingGovernorate: row.shipping_governorate,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    shippingFee: Number(row.shipping_fee),
    total: Number(row.total),
    notes: row.notes,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItemRowToItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id ?? null,
    variantLabel: row.variant_label ?? null,
    productName: row.product_name,
    sku: row.sku,
    unitPrice: Number(row.unit_price),
    quantity: row.quantity,
    lineTotal: Number(row.line_total),
  };
}

/**
 * Server Action: Fetches all orders for the authenticated merchant's store.
 */
export async function getAuthorizedStoreOrders(filters?: {
  status?: OrderStatus;
  search?: string;
}): Promise<{
  success: boolean;
  data?: Order[];
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(`
      *,
      order_items (*)
    `)
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ordersList = (data as any[]).map((row) => {
    const items = Array.isArray(row.order_items)
      ? (row.order_items as OrderItemRow[]).map(mapItemRowToItem)
      : [];
    return mapOrderRowToOrder(row as OrderRow, items);
  });

  if (filters?.search && filters.search.trim()) {
    const term = filters.search.toLowerCase().trim();
    ordersList = ordersList.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(term) ||
        o.customerName.toLowerCase().includes(term) ||
        o.customerPhone.toLowerCase().includes(term) ||
        (o.customerEmail && o.customerEmail.toLowerCase().includes(term))
    );
  }

  return { success: true, data: ordersList };
}

/**
 * Server Action: Retrieves single order details along with line item snapshots.
 */
export async function getAuthorizedStoreOrder(orderId: string): Promise<{
  success: boolean;
  data?: Order;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (*)
    `)
    .eq("id", orderId)
    .eq("store_id", store.id)
    .single();

  if (orderError || !orderData) {
    return { success: false, error: orderError?.message || "Order not found." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = orderData as any;
  const items = Array.isArray(row.order_items)
    ? (row.order_items as OrderItemRow[]).map(mapItemRowToItem)
    : [];

  return { success: true, data: mapOrderRowToOrder(row as OrderRow, items) };
}

/**
 * Server Action: Updates order fulfillment status and optional payment status.
 */
export async function updateAuthorizedOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  newPaymentStatus?: PaymentStatus
): Promise<{
  success: boolean;
  data?: Order;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  const supabase = await createClient();
  const updatePayload: { status: OrderStatus; payment_status?: PaymentStatus } = {
    status: newStatus,
  };
  if (newPaymentStatus) {
    updatePayload.payment_status = newPaymentStatus;
  }

  const { data, error } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("store_id", store.id)
    .select(`
      *,
      order_items (*)
    `)
    .single();

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to update order status." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  const items = Array.isArray(row.order_items)
    ? (row.order_items as OrderItemRow[]).map(mapItemRowToItem)
    : [];

  const mapped = mapOrderRowToOrder(row as OrderRow, items);

  // Loyalty side effect (Feature C): earning triggers when the merchant has
  // confirmed payment on a non-cancelled order; cancellation/refund reverses
  // an existing award. Both paths are idempotent ledger operations inside
  // SECURITY DEFINER RPCs and never block or fail the order update itself.
  const effectivePaymentStatus =
    (newPaymentStatus ?? mapped.paymentStatus) as PaymentStatus;
  await applyLoyaltyForOrderTransition(orderId, {
    paid: effectivePaymentStatus === "Paid" && newStatus !== "Cancelled",
    cancelled: newStatus === "Cancelled",
  });

  return { success: true, data: mapped };
}

/**
 * Server Action: Creates a new order authoritatively on the server.
 * Subtotals, totals, item pricing, and referential integrity are strictly
 * validated and executed atomically via the database RPC `create_store_order`.
 */
export async function createAuthorizedStoreOrder(
  input: CreateOrderInput
): Promise<{
  success: boolean;
  data?: Order;
  error?: string;
}> {
  const store = await getAuthorizedStore();
  if (!store) {
    return { success: false, error: "Unauthorized: No merchant store context found." };
  }

  // 1. Strict Server-Side Input Validations (No silent coercion)
  if (!input.customerName || !input.customerName.trim()) {
    return { success: false, error: "Customer name is required." };
  }

  if (!input.customerPhone || !input.customerPhone.trim()) {
    return { success: false, error: "Customer phone number is required." };
  }

  if (!input.shippingAddress || !input.shippingAddress.trim()) {
    return { success: false, error: "Shipping address is required." };
  }

  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    return { success: false, error: "An order must contain at least one item." };
  }

  const validPaymentMethods: PaymentMethod[] = [
    "Cash on Delivery",
    "InstaPay",
    "Vodafone Cash",
    "Credit / Debit Card",
  ];
  const paymentMethod = input.paymentMethod || "Cash on Delivery";
  if (!validPaymentMethods.includes(paymentMethod)) {
    return { success: false, error: `Invalid payment method: "${paymentMethod}".` };
  }

  const rawShippingFee = input.shippingFee !== undefined && input.shippingFee !== null ? Number(input.shippingFee) : 0;
  if (isNaN(rawShippingFee) || !isFinite(rawShippingFee) || rawShippingFee < 0 || rawShippingFee > 999999.99) {
    return { success: false, error: "Shipping fee must be a valid number between 0 and 999,999.99 EGP." };
  }
  const shippingFee = Number(rawShippingFee.toFixed(2));

  if (input.items.length > 100) {
    return { success: false, error: "An order cannot contain more than 100 line items." };
  }

  // 2. Validate Items and quantities strictly
  const itemsPayload: Array<{
    product_id: string | null;
    product_name?: string;
    sku?: string | null;
    unit_price?: number;
    quantity: number;
  }> = [];

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 100000) {
      return {
        success: false,
        error: `Item #${i + 1} (${it.productName || "Item"}): Quantity must be an integer between 1 and 100,000.`,
      };
    }

    if (it.productId && it.productId.trim()) {
      // Catalog item: catalog lookup will determine price and name authoritatively
      itemsPayload.push({
        product_id: it.productId.trim(),
        quantity: qty,
      });
    } else {
      // Manual custom line item by merchant
      if (!it.productName || !it.productName.trim()) {
        return { success: false, error: `Item #${i + 1}: Line item name cannot be empty.` };
      }
      if (it.productName.trim().length > 255) {
        return { success: false, error: `Item #${i + 1}: Line item name exceeds 255 characters.` };
      }
      const unitPrice = Number(it.unitPrice);
      if (isNaN(unitPrice) || !isFinite(unitPrice) || unitPrice < 0 || unitPrice > 9999999.99) {
        return {
          success: false,
          error: `Item #${i + 1} (${it.productName}): Unit price must be a valid number between 0 and 9,999,999.99 EGP.`,
        };
      }
      itemsPayload.push({
        product_id: null,
        product_name: it.productName.trim(),
        sku: it.sku ? it.sku.trim() : null,
        unit_price: Number(unitPrice.toFixed(2)),
        quantity: qty,
      });
    }
  }

  // 3. Execute atomic transaction in PostgreSQL via secure RPC
  const supabase = await createClient();
  const { data: rpcData, error: rpcError } = await supabase.rpc("create_store_order", {
    p_store_id: store.id,
    p_customer_name: input.customerName.trim(),
    p_customer_phone: input.customerPhone.trim(),
    p_customer_email: input.customerEmail?.trim() || null,
    p_shipping_address: input.shippingAddress.trim(),
    p_shipping_city: input.shippingCity?.trim() || null,
    p_shipping_governorate: input.shippingGovernorate?.trim() || null,
    p_payment_method: paymentMethod,
    p_shipping_fee: shippingFee,
    p_notes: input.notes?.trim() || null,
    p_items: itemsPayload,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = rpcData as any;
  if (!result || !result.order_id) {
    return { success: false, error: "Order transaction failed: No order identifier returned." };
  }

  // 4. Retrieve newly created authoritative order and items
  const createdOrderRes = await getAuthorizedStoreOrder(result.order_id);
  if (!createdOrderRes.success || !createdOrderRes.data) {
    return {
      success: false,
      error: createdOrderRes.error || "Order was created but failed to load its details.",
    };
  }

  return {
    success: true,
    data: createdOrderRes.data,
  };
}
