import { handleWebhookEvent } from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/paypal";

export async function POST(request: Request) {
  // Verification needs the body exactly as PayPal sent it.
  const rawBody = await request.text();
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof event?.id !== "string" || typeof event?.event_type !== "string") {
    return Response.json({ error: "not a PayPal event" }, { status: 400 });
  }

  const verified = await verifyWebhookSignature(request.headers, rawBody).catch((err) => {
    console.error("[webhook] verification call failed", err);
    return false;
  });
  const outcome = await handleWebhookEvent(event, verified);
  console.log(`[webhook] ${event.event_type} ${event.id} → ${outcome}`);

  // Unverified events are stored for the audit trail but never change a payment.
  if (outcome === "rejected") return Response.json({ outcome }, { status: 401 });
  return Response.json({ outcome });
}
