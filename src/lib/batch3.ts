import crypto from "crypto";

export type PaymentStatus = "pending" | "successful" | "failed" | "cancelled" | "refunded";
export type ShipmentStatus = "pending" | "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "cancelled" | "returned";
export type ReturnStatus = "requested" | "approved" | "rejected" | "received" | "refunded" | "cancelled";

const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = { pending: ["successful", "failed", "cancelled"], successful: ["refunded"], failed: [], cancelled: [], refunded: [] };
const shipmentTransitions: Record<ShipmentStatus, ShipmentStatus[]> = { pending: ["label_created", "cancelled"], label_created: ["in_transit", "cancelled"], in_transit: ["out_for_delivery", "failed", "returned"], out_for_delivery: ["delivered", "failed", "returned"], delivered: ["returned"], failed: ["pending", "cancelled"], cancelled: [], returned: [] };
const returnTransitions: Record<ReturnStatus, ReturnStatus[]> = { requested: ["approved", "rejected", "cancelled"], approved: ["received", "cancelled"], rejected: [], received: ["refunded"], refunded: [], cancelled: [] };

export function canTransition<T extends "payment" | "shipment" | "return">(kind: T, from: string, to: string) { const table = kind === "payment" ? paymentTransitions : kind === "shipment" ? shipmentTransitions : returnTransitions; return table[from as keyof typeof table]?.includes(to as never) ?? false; }
export function verifyHmacSignature(payload: string, signature: string, secret: string) { if (!signature || !secret) return false; const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex"); const left = Buffer.from(expected); const right = Buffer.from(signature.replace(/^sha256=/, "")); return left.length === right.length && crypto.timingSafeEqual(left, right); }
export function nextNotificationAttempt(attempts: number, now = Date.now()) { const bounded = Math.min(5, Math.max(0, attempts)); return new Date(now + Math.min(60 * 60 * 1000, 2 ** bounded * 60 * 1000)).toISOString(); }
export function safeMediaPath(storeId: string, productId: string, fileName: string) { const ext = fileName.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)?.[1]; if (!ext) return null; return `${storeId}/${productId}/${crypto.randomUUID()}.${ext}`; }
export const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
