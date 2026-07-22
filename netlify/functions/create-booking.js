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
  if (!isValidSlot(date, time))
    return json({ error: "That time slot is not available for booking" }, 400);

  const s = store();
  const key = slotKey(date, time);

  // Slot must be free (or hold expired)
  const existing = await s.get(key, { type: "json" });
  if (isActive(existing))
    return json({ error: "Sorry, that slot was just taken. Please pick another." }, 409);

  const bookingId = crypto.randomUUID();
  const base = {
    id: bookingId,
    type: "booking",
    serviceId,
    serviceName: service.name,
    deposit: service.deposit,
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
      service.deposit,
      `Deposit - ${service.name} on ${date} at ${time} - ${config.businessName}`
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

  await sendEmail(
    base.email,
    `Your ${config.businessName} appointment is held — deposit needed to confirm`,
    `Hi ${base.name},

Your appointment is HELD:

${service.name} — ${fmtWhen(date, time)}

${paymentInstructions(service.deposit)}

See you soon!
${config.businessName}`
  );
  await sendEmail(
    ownerEmail(),
    `New booking (awaiting $${service.deposit} deposit): ${base.name} — ${fmtWhen(date, time)}`,
    `A new appointment was booked and is awaiting its deposit:

${bookingLine(base)}
Deposit due: $${service.deposit}

When the deposit arrives, open the admin page and click "Deposit received" to confirm it.`
  );

  return json({
    bookingId,
    status: "awaiting-deposit",
    paymentMethods: config.paymentMethods,
    depositDue: service.deposit,
  });
};
