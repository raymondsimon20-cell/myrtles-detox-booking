// Email notifications via Gmail.
// Env vars: GMAIL_USER (the Gmail address), GMAIL_APP_PASSWORD (16-char app password),
// optional OWNER_EMAIL (where new-booking alerts go; defaults to GMAIL_USER).
// If not configured, emails are silently skipped — bookings still work.
import nodemailer from "nodemailer";
import config from "./config.js";

export const emailEnabled = () =>
  Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

export const ownerEmail = () =>
  process.env.OWNER_EMAIL || process.env.GMAIL_USER;

export async function sendEmail(to, subject, text) {
  if (!emailEnabled() || !to) return;
  try {
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    await t.sendMail({
      from: `"${config.businessName}" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text,
    });
  } catch (e) {
    // Never let email problems break a booking
    console.error("Email send failed:", e.message);
  }
}

export function fmtWhen(date, time) {
  const d = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  let [h, m] = time.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${d} at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function bookingLine(b) {
  return `${b.serviceName} — ${fmtWhen(b.date, b.time)}\nClient: ${b.name}${
    b.phone ? `\nPhone: ${b.phone}` : ""}${b.email ? `\nEmail: ${b.email}` : ""}${
    b.notes ? `\nNotes: ${b.notes}` : ""}`;
}

export function paymentInstructions(deposit) {
  const pm = config.paymentMethods;
  return `Send your $${deposit} deposit to one of:
  • Zelle: ${pm.zelle}
  • Cash App: ${pm.cashApp}
  • PayPal: ${pm.payPalHandle}
  • Cash: prepay in person

Please include your name with the payment. Your appointment is confirmed once the deposit is received. The deposit is non-refundable.`;
}
