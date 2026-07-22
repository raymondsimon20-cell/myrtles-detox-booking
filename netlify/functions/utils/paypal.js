// PayPal REST helpers. Requires env vars:
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET, and optionally PAYPAL_ENV=live (defaults to sandbox)

const base = () =>
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export const paymentsEnabled = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);

async function accessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString("base64");
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  return (await res.json()).access_token;
}

export async function createOrder(amountUSD, description) {
  const token = await accessToken();
  const res = await fetch(`${base()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: amountUSD.toFixed(2) },
          description,
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal order failed: ${JSON.stringify(data)}`);
  return data; // { id, status, ... }
}

export async function captureOrder(orderId) {
  const token = await accessToken();
  const res = await fetch(`${base()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal capture failed: ${JSON.stringify(data)}`);
  return data;
}
