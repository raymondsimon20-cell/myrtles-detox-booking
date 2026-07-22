// POST /api/create-booking
// Body: { serviceId, date, time, name, phone, email, notes, payMethod }
//   payMethod: "paypal" (pay deposit online now) | "other" (Zelle/CashApp/cash - owner confirms)
// Returns: paypal -> { orderId, bookingId }  |  other -> { bookingId, status: "awaiting-deposit" }
import {
  config,
  json,
  store,
  slotKey,
  isValidSlot,
  isActive,
  amountDueFor,
  stationOf,
} from "./utils/shared.js";
import { paymentsEnabled, createOrder } from "./utils/paypal.js";
import { sendEmail, ownerEmail, fmtWhen, bookingLine, paymentInstructions } from "./utils/email.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { serviceId, date, time, name, phone, email, notes, payMethod } = body;

  const service = config.services.find((s) => s.id === serviceId);
  if (!service) return json({ error: "Unknown service" }, 400);
  if (!name || String(name).trim().length < 2)
    return json({ error: "Please enter your name" }, 400);
  if (!phone && !email)
    return json({ error: "Please enter a phone number or email" }, 400);
  if (!isValidSlot(service, date, time))
    return json({ error: "That time slot is not available for booking" }, 400);

  const s = store();
  const station = stationOf(service);
  const key = slotKey(date, time, station);

  // Slot must be free (or hold expired)
  const existing = await s.get(key, { type: "json" });
  if (isActive(existing))
    return json({ error: "Sorry, that slot was just taken. Please pick another." }, 409);

  const { amount: amountDue, sunday } = amountDueFor(service, date);
  const bookingId = crypto.randomUUID();
  const base = {
    id: bookingId,
    type: "booking",
    serviceId,
    station,
    serviceName: service.name,
    deposit: amountDue,
    sundayPrepay: sunday || undefined,
    date,
    time,
    name: String(name).trim().slice(0, 100),
    phone: String(phone || "").trim().slice(0, 40),
    email: String(email || "").trim().slice(0, 100),
    notes: String(notes || "").trim().slice(0, 500),
    createdAt: new Date().toISOString(),
  };

  if (payMethod === "paypal") {
    if (!paymentsEnabled())
      return json({ error: "Online payment is not set up yet. Choose Zelle/CashApp/cash." }, 400);
    const order = await createOrder(
      amountDue,
      `${sunday ? "Sunday prepayment" : "Deposit"} - ${service.name} on ${date} at ${time} - ${config.businessName}`
    );
    await s.setJSON(key, {
      ...base,
      status: "pending",
      paypalOrderId: order.id,
      expiresAt: Date.now() + config.pendingHoldMinutes * 60000,
    });
    return json({ orderId: order.id, bookingId });
  }

  // Zelle / CashApp / cash: hold the slot, owner confirms when deposit arrives
  await s.setJSON(key, { ...base, status: "awaiting-deposit" });

  const word = sunday ? "prepayment (Sunday - full amount incl. flex fee)" : "deposit";
  await sendEmail(
    base.email,
    `Your ${config.businessName} appointment is held — ${sunday ? "prepayment" : "deposit"} needed to confirm`,
    `Hi ${base.name},

Your appointment is HELD:

${service.name} — ${fmtWhen(date, time)}
${sunday ? "\nSunday appointments must be PREPAID IN FULL (includes the $25 flex fee).\n" : ""}
${paymentInstructions(amountDue, word)}

See you soon!
${config.businessName}`
  );
  await sendEmail(
    ownerEmail(),
    `New booking (awaiting $${amountDue} ${sunday ? "Sunday prepayment" : "deposit"}): ${base.name} — ${fmtWhen(date, time)}`,
    `A new appointment was booked and is awaiting its ${sunday ? "Sunday prepayment (full amount)" : "deposit"}:

${bookingLine(base)}
Amount due: $${amountDue}

When the payment arrives, open the admin page and click "Deposit received" to confirm it.`
  );

  return json({
    bookingId,
    status: "awaiting-deposit",
    paymentMethods: config.paymentMethods,
    depositDue: amountDue,
    sunday,
  });
};
