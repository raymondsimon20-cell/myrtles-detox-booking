// POST /api/create-product-order
// Body: { productId, quantity }
// Creates a PayPal order for a product purchase (no time slot involved).
// Returns: { orderId, orderRef, amount }
import { config, json, store } from "./utils/shared.js";
import { paymentsEnabled, createOrder } from "./utils/paypal.js";

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

  if (!paymentsEnabled())
    return json({ error: "Online payment is not set up yet — please call (340) 513-2343 to order." }, 400);

  const amount = product.price * quantity;
  const order = await createOrder(
    amount,
    `${product.name} x${quantity} - ${config.businessName}`
  );

  const orderRef = crypto.randomUUID();
  const s = store();
  await s.setJSON(`order:${orderRef}`, {
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
