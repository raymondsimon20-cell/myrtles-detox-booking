// POST /api/create-product-order
// Body: { productId, quantity, payMethod, name?, phone?, email? }
//   payMethod: "paypal" (pay online now) | "other" (Zelle/CashApp/PayPal.me/cash — owner confirms)
// paypal -> { orderId, orderRef, amount }
// other  -> { orderRef, amount, paymentMethods }
import { config, json, store } from "./utils/shared.js";
import { paymentsEnabled, createOrder } from "./utils/paypal.js";
import { sendEmail, ownerEmail } from "./utils/email.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const product = (config.products || []).find((p) => p.id === body.productId);
  if (!product) return json({ error: "Unknown product" }, 400);
  if (typeof product.price !== "number")
    return json({ error: "This product isn't available for online purchase yet — please call (340) 513-2343." }, 400);

  const quantity = Math.floor(Number(body.quantity));
  if (!(quantity >= 1 && quantity <= 10))
    return json({ error: "Quantity must be between 1 and 10" }, 400);

  const amount = product.price * quantity;
  const orderRef = crypto.randomUUID();
  const line = `${product.name} x${quantity} — $${amount}`;

  // Zelle / Cash App / PayPal.me / cash: record the order, owner confirms when paid
  if (body.payMethod === "other") {
    const name = String(body.name || "").trim().slice(0, 100);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const email = String(body.email || "").trim().slice(0, 100);
    if (name.length < 2) return json({ error: "Please enter your name" }, 400);
    if (!phone && !email)
      return json({ error: "Please enter a phone number or email" }, 400);

    await store().setJSON(`order:${orderRef}`, {
      id: orderRef,
      type: "product-order",
      status: "awaiting-payment",
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      quantity,
      amount,
      name, phone, email,
      createdAt: new Date().toISOString(),
    });

    const pm = config.paymentMethods;
    const payLines = `  • Zelle: ${pm.zelle}
  • Cash App: ${pm.cashTag ? `$${pm.cashTag} — https://cash.app/$${pm.cashTag}/${amount}` : pm.cashApp}
  • PayPal: ${pm.payPalHandle} — https://paypal.me/${pm.payPalHandle}/${amount}
  • Cash: pay in person at pickup`;

    await sendEmail(
      email,
      `Your ${config.businessName} order — $${amount} payment needed`,
      `Hi ${name},

Thanks for your order:

${line}

Send your $${amount} payment to one of:
${payLines}

Please include your name with the payment. We'll contact you to arrange pickup once it's received. Questions? Call or text (340) 513-2343.

${config.businessName}`
    );
    await sendEmail(
      ownerEmail(),
      `New product order (awaiting $${amount}): ${name} — ${line}`,
      `A product order was placed and is awaiting payment by Zelle/Cash App/PayPal/cash:

${line}
Buyer: ${name}${phone ? `\nPhone: ${phone}` : ""}${email ? `\nEmail: ${email}` : ""}

When the payment arrives, contact the buyer to arrange pickup.`
    );

    return json({ orderRef, amount, paymentMethods: config.paymentMethods });
  }

  // PayPal: create the order for online capture
  if (!paymentsEnabled())
    return json({ error: "Online card payment is not set up yet — choose Zelle/Cash App instead." }, 400);

  const order = await createOrder(amount, `${line} - ${config.businessName}`);
  await store().setJSON(`order:${orderRef}`, {
    id: orderRef,
    type: "product-order",
    status: "pending",
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity,
    amount,
    paypalOrderId: order.id,
    createdAt: new Date().toISOString(),
  });

  return json({ orderId: order.id, orderRef, amount });
};
