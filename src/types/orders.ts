import { OrderStatus, PaymentStatus, PaymentMethod } from "@/types/database";

export interface OrderItem {
  id?: string;
  productId?: string | null;
  variantId?: string | null;
  variantLabel?: string | null;
  productName: string;
  sku?: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  storeId: string;
  customerId?: string | null;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingGovernorate: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  currency: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  notes: string;
  items?: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  shippingAddress: string;
  shippingCity?: string;
  shippingGovernorate?: string;
  paymentMethod?: PaymentMethod;
  shippingFee?: number;
  notes?: string;
  items: Array<{
    productId?: string | null;
    productName: string;
    sku?: string | null;
    unitPrice: number;
    quantity: number;
  }>;
}
