// POST /api/capture-payment
// Body: { orderId, date, time } - captures the PayPal deposit and confirms the booking
import { json, store, slotKey } from "./utils/shared.js";
import { captureOrder } from "./utils/paypal.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { orderId, date, time } = body;
  if (!orderId || !date || !time) return json({ error: "Missing fields" }, 400);

  const s = store();
  const key = slotKey(date, time);
  const entry = await s.get(key, { type: "json" });
  if (!entry || entry.paypalOrderId !== orderId)
    return json({ error: "Booking not found for this payment" }, 404);

  const capture = await captureOrder(orderId);
  const status = capture.status; // COMPLETED expected
  if (status !== "COMPLETED")
    return json({ error: `Payment not completed (status: ${status})` }, 402);

  const captureId =
    capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

  await s.setJSON(key, {
    ...entry,
    status: "confirmed",
    paidAt: new Date().toISOString(),
    paypalCaptureId: captureId,
    expiresAt: undefined,
  });

  return json({ ok: true, bookingId: entry.id });
};
