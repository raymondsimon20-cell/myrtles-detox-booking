// GET /api/config — public site configuration for the booking page
import { config, json } from "./utils/shared.js";
import { paymentsEnabled } from "./utils/paypal.js";

export default async () =>
  json({
    businessName: config.businessName,
    timezone: config.timezone,
    slotMinutes: config.slotMinutes,
    bookingWindowDays: config.bookingWindowDays,
    hours: config.hours,
    services: config.services,
    paymentMethods: config.paymentMethods,
    policies: config.policies,
    paymentsEnabled: paymentsEnabled(),
    paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
  });
