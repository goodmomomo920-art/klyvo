import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHmacSignature } from "@/lib/batch3";

export async function POST(request: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const body = await request.text();
  const signature = request.headers.get("x-provider-signature") ?? request.headers.get("x-signature") ?? "";
  const secret = process.env.COURIER_WEBHOOK_SECRET;
  if (!secret || !verifyHmacSignature(body, signature, secret)) return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  let payload: { event_id?: string; shipment_id?: string; status?: string; description?: string };
  try { payload = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const { storeId } = await params; const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Courier provider is not configured." }, { status: 503 });
  if (!payload.event_id || !payload.shipment_id || !payload.status) return Response.json({ error: "Incomplete webhook payload." }, { status: 400 });
  const { error } = await admin.from("shipment_events").insert({ store_id: storeId, shipment_id: payload.shipment_id, provider_event_id: payload.event_id, status: payload.status, description: payload.description ?? "" });
  if (error?.code === "23505") return Response.json({ ok: true, duplicate: true });
  if (error) return Response.json({ error: "Webhook could not be recorded." }, { status: 500 });
  return Response.json({ ok: true });
}
