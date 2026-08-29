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

export async function sendEmail(to, subject, text, ics) {
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
      // Attach a calendar event (.ics) when provided. Gmail shows an
      // "Add to calendar" button for it; Apple Mail and Outlook open it too.
      ...(ics
        ? { icalEvent: { filename: "appointment.ics", method: "PUBLISH", content: ics } }
        : {}),
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

// ---------------------------------------------------------------------------
// Calendar attachment (.ics)
// ---------------------------------------------------------------------------

// Interpret a wall-clock date ("YYYY-MM-DD") + time ("HH:MM") in `tz`
// (e.g. America/New_York) and return the corresponding UTC Date.
// Handles DST correctly via Intl - no libraries needed.
function tzOffsetMs(at, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? 0 : Number(p.hour); // some runtimes report midnight as 24
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return asUtc - at.getTime();
}

function zonedToUtc(date, time, tz) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes so the offset is taken AT the event's own moment
  // (correct even right around a DST switch).
  let utc = wall;
  for (let i = 0; i < 2; i++) utc = wall - tzOffsetMs(new Date(utc), tz);
  return new Date(utc);
}

// How long the event should be: "HydroMassage — 15 min" style services use
// their label's minutes; everything else uses the standard slot length.
function eventMinutes(b) {
  const service = config.services.find((sv) => sv.id === b.serviceId);
  const m = /(\d+)\s*min/i.exec(service?.label || "");
  return m ? Number(m[1]) : config.slotMinutes || 60;
}

// RFC 5545: escape special characters and fold lines longer than 75 octets.
const icsEscape = (s) =>
  String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

function icsFold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  while (start < bytes.length) {
    let len = Math.min(start === 0 ? 75 : 74, bytes.length - start);
    // Don't split a multi-byte UTF-8 character.
    while (len > 1 && (bytes[start + len] & 0xc0) === 0x80) len--;
    out.push((start === 0 ? "" : " ") + bytes.subarray(start, start + len).toString("utf8"));
    start += len;
  }
  return out.join("\r\n");
}

// Build an iCalendar event for a booking. `b` needs: date, time, serviceName,
// name, and (optionally) id / serviceId. Returned string goes straight into
// sendEmail's `ics` parameter.
export function buildIcs(b) {
  const start = zonedToUtc(b.date, b.time, config.timezone);
  const end = new Date(start.getTime() + eventMinutes(b) * 60000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${icsEscape(config.businessName)}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id || crypto.randomUUID()}@myrtles-detox-booking`,
    // Bumped on reschedule so calendars replace the old event instead of
    // keeping both (same UID + higher SEQUENCE = update).
    `SEQUENCE:${Number(b.icsSequence) || 0}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(`${b.serviceName} — ${config.businessName}`)}`,
    `DESCRIPTION:${icsEscape(
      `Appointment for ${b.name}: ${b.serviceName} — ${fmtWhen(b.date, b.time)}.\n${config.businessName}`
    )}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

export function paymentInstructions(deposit, word = "deposit") {
  const pm = config.paymentMethods;
  return `Send your $${deposit} ${word} to one of:
  • Zelle: ${pm.zelle}
  • Cash App: ${pm.cashTag ? `$${pm.cashTag} — https://cash.app/$${pm.cashTag}/${deposit}` : pm.cashApp}
  • PayPal: ${pm.payPalHandle} — https://paypal.me/${pm.payPalHandle}/${deposit}
  • Cash: prepay in person

Please include your name with the payment. Your appointment is confirmed once the deposit is received. The deposit is non-refundable.`;
}
