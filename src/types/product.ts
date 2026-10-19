export type ProductStatus = "Active" | "Draft" | "Archived";

export interface Product {
  id: string;
  storeId?: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  sku: string;
  description: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  imageUrl?: string;
  status: ProductStatus;
  /** Number of variants. Stock is derived from variants when this is > 0. */
  variantCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;
