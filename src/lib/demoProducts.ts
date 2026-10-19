import { useSyncExternalStore } from "react";
import { Product } from "@/types/product";

export const INITIAL_DEMO_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name: "AeroSound Pro Wireless ANC Headphones",
    sku: "KV-AUD-01",
    description: "40h battery life with hybrid active noise cancellation and USB-C fast charging.",
    category: "Audio & Headphones",
    price: 3250,
    compareAtPrice: 3800,
    stock: 24,
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80",
    status: "Active",
    createdAt: "2026-10-10T12:00:00Z",
    updatedAt: "2026-10-14T09:30:00Z",
  },
  {
    id: "prod-2",
    name: "Apex Nova 5G Smartphone (256GB)",
    sku: "KV-PHN-02",
    description: "6.7-inch AMOLED 120Hz display, dual SIM with official Egyptian warranty.",
    category: "Smartphones",
    price: 16900,
    compareAtPrice: 18500,
    stock: 12,
    imageUrl:
      "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=500&auto=format&fit=crop&q=80",
    status: "Active",
    createdAt: "2026-10-11T14:15:00Z",
    updatedAt: "2026-10-14T11:00:00Z",
  },
  {
    id: "prod-3",
    name: "Titan Ultra GPS Smartwatch",
    sku: "KV-WAT-03",
    description: "Sapphire glass, heart rate & SpO2 tracking, 14-day battery life.",
    category: "Wearables",
    price: 4100,
    compareAtPrice: 4600,
    stock: 8,
    imageUrl:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80",
    status: "Active",
    createdAt: "2026-10-12T08:45:00Z",
    updatedAt: "2026-10-14T14:20:00Z",
  },
  {
    id: "prod-4",
    name: "AirBeat Pro TWS Earbuds w/ Spatial Audio",
    sku: "KV-AUD-04",
    description: "Quad beamforming microphones with wireless charging case.",
    category: "Audio & Headphones",
    price: 1650,
    compareAtPrice: 1950,
    stock: 35,
    imageUrl:
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500&auto=format&fit=crop&q=80",
    status: "Active",
    createdAt: "2026-10-12T16:30:00Z",
    updatedAt: "2026-10-13T10:15:00Z",
  },
  {
    id: "prod-5",
    name: "TurboCharge 65W GaN Fast Charger (3-Port)",
    sku: "KV-ACC-05",
    description: "Dual USB-C and USB-A ports compatible with phones and laptops.",
    category: "Accessories",
    price: 780,
    compareAtPrice: 920,
    stock: 50,
    imageUrl:
      "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500&auto=format&fit=crop&q=80",
    status: "Active",
    createdAt: "2026-10-13T11:00:00Z",
    updatedAt: "2026-10-14T08:00:00Z",
  },
  {
    id: "prod-6",
    name: "BassWave 360 Portable Bluetooth Speaker",
    sku: "KV-AUD-06",
    description: "IPX7 waterproof submersible speaker with 24W stereo output.",
    category: "Audio & Headphones",
    price: 2100,
    compareAtPrice: 2450,
    stock: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=500&auto=format&fit=crop&q=80",
    status: "Draft",
    createdAt: "2026-10-13T13:40:00Z",
    updatedAt: "2026-10-14T15:00:00Z",
  },
];

const STORAGE_KEY = "klyvo_demo_products_v1";

let memoryCache: Product[] | null = null;
let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeProducts(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getStoredProducts(): Product[] {
  if (typeof window === "undefined") {
    return INITIAL_DEMO_PRODUCTS;
  }

  if (memoryCache !== null) {
    return memoryCache;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_PRODUCTS));
      memoryCache = INITIAL_DEMO_PRODUCTS;
      return INITIAL_DEMO_PRODUCTS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 0) {
      memoryCache = parsed;
      return parsed;
    }
    memoryCache = INITIAL_DEMO_PRODUCTS;
    return INITIAL_DEMO_PRODUCTS;
  } catch (error) {
    console.error("Failed to read demo products from localStorage:", error);
    memoryCache = INITIAL_DEMO_PRODUCTS;
    return INITIAL_DEMO_PRODUCTS;
  }
}

export function saveStoredProducts(products: Product[]): void {
  memoryCache = products;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    } catch (error) {
      console.error("Failed to persist demo products to localStorage:", error);
    }
  }
  notifyListeners();
}

export function resetStoredProducts(): Product[] {
  memoryCache = INITIAL_DEMO_PRODUCTS;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_PRODUCTS));
    } catch (error) {
      console.error("Failed to reset demo products in localStorage:", error);
    }
  }
  notifyListeners();
  return INITIAL_DEMO_PRODUCTS;
}

export function useProducts(): Product[] {
  return useSyncExternalStore(
    subscribeProducts,
    getStoredProducts,
    () => INITIAL_DEMO_PRODUCTS
  );
}
