import { Order } from "@/types/orders";

export interface Customer {
  id: string;
  storeId: string;
  name: string;
  email?: string | null;
  phone: string;
  address: string;
  city: string;
  governorate: string;
  totalOrders: number;
  totalSpent: number;
  orders?: Order[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFormData {
  name: string;
  email?: string | null;
  phone: string;
  address?: string;
  city?: string;
  governorate?: string;
}
