// POST /api/capture-product-order
// Body: { orderId, orderRef } - captures the PayPal payment for a product order,
// records the buyer's PayPal name/email, and emails a receipt + owner alert.
import { config, json, store } from "./utils/shared.js";
import { captureOrder } from "./utils/paypal.js";
import { sendEmail, ownerEmail } from "./utils/email.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const { orderId, orderRef } = body;
  if (!orderId || !orderRef) return json({ error: "Missing fields" }, 400);

  const s = store();
  const key = `order:${orderRef}`;
  const entry = await s.get(key, { type: "json" });
  if (!entry || entry.paypalOrderId !== orderId)
    return json({ error: "Order not found for this payment" }, 404);

  const capture = await captureOrder(orderId);
  if (capture.status !== "COMPLETED")
    return json({ error: `Payment not completed (status: ${capture.status})` }, 402);

  const captureId =
    capture.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
  const payerName = [capture.payer?.name?.given_name, capture.payer?.name?.surname]
    .filter(Boolean).join(" ");
  const payerEmail = capture.payer?.email_address || "";

  await s.setJSON(key, {
    ...entry,
    status: "paid",
    paidAt: new Date().toISOString(),
    paypalCaptureId: captureId,
    buyerName: payerName,
    buyerEmail: payerEmail,
  });

  const line = `${entry.productName} x${entry.quantity} — $${entry.amount}`;
  await sendEmail(
    payerEmail,
    `Order received! ${config.businessName}`,
    `Hi ${payerName || "there"},

Thanks for your order — your payment was received:

${line}

We'll contact you to arrange pickup. Questions? Call or text (340) 513-2343.

${config.businessName}`
  );
  await sendEmail(
    ownerEmail(),
    `Product order PAID: ${line}`,
    `A product order was paid online via PayPal:

${line}
Buyer: ${payerName || "?"}${payerEmail ? `\nEmail: ${payerEmail}` : ""}

Contact the buyer to arrange pickup.`
  );

  return json({ ok: true, buyerName: payerName });
};
