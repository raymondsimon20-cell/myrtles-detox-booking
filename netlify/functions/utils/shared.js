import { getStore } from "@netlify/blobs";
import config from "./config.js";

export { config };

// "strong" consistency so a new booking is visible instantly (prevents double-booking)
export const store = () =>
  getStore({ name: "myrtles-booking", consistency: "strong" });

// Each service (or duration group) is its own "station" — different stations can
// be booked at overlapping times; the same station can't be double-booked.
export const stationOf = (service) =>
  service.group
    ? service.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    : service.id;

export const slotKey = (date, time, station) => `slot:${date}:${time}:${station}`;

export const parseSlotKey = (key) =>
  key.match(/^slot:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}):(.+)$/);

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Current date/time strings in the business's timezone
export function nowInTz() {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: config.timezone }); // YYYY-MM-DD
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }); // HH:MM
  return { date, time };
}

// All slot start times for a service on a given YYYY-MM-DD.
// Sundays use the explicit Sunday slots; weekdays use the service's own "times"
// list if it has one, otherwise the hourly grid.
export function slotsForService(service, dateStr) {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  const hours = config.hours[String(dow)];
  if (!hours) return [];
  if (!Array.isArray(hours)) return hours.slots || []; // Sunday explicit slots
  if (service && service.times) return service.times;
  const [open, close] = hours;
  const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const toStr = (m) =>
    String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const out = [];
  for (let m = toMin(open); m + config.slotMinutes <= toMin(close); m += config.slotMinutes) {
    out.push(toStr(m));
  }
  return out;
}

// Current wall-clock time in the business timezone, expressed as a UTC epoch
// (so it can be compared against Date.UTC(slot date, slot time)).
export function tzNowEpoch() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t) => +parts.find((p) => p.type === t).value;
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
}

export function isValidSlot(service, date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) return false;
  if (!slotsForService(service, date).includes(time)) return false;
  const slotEpoch = Date.UTC(
    +date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10),
    +time.slice(0, 2), +time.slice(3, 5)
  );
  // Must be at least minHoursAhead in the future
  if (slotEpoch < tzNowEpoch() + (config.minHoursAhead ?? 0) * 3600000) return false;
  // Sundays must be prepaid in full by Thursday -> online booking closes end of Thursday
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0) {
    const dayStart = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    if (tzNowEpoch() >= dayStart - 2 * 86400000) return false; // past Thursday 11:59 PM
  }
  const max = new Date(Date.now() + config.bookingWindowDays * 86400000)
    .toISOString()
    .slice(0, 10);
  if (date > max) return false;
  return true;
}

// Is this weekday time a flex slot for the service (outside regular hours -> +$25)?
export function isFlexTime(service, dateStr, time) {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  if (dow === 0) return false; // Sunday fee handled separately
  return Boolean(service && service.flexTimes && service.flexTimes.includes(time));
}

// Amount due to reserve: normal deposit, deposit+flex fee for flex times,
// or FULL prepay (+flex fee) on Sundays
export function amountDueFor(service, dateStr, time) {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  if (dow === 0) {
    const sp = config.sundayPrepay || {};
    if (sp[service.id] != null) return { amount: sp[service.id], sunday: true, flex: false };
    const m = String(service.price).match(/\d+/);
    const base = m ? +m[0] : service.deposit;
    return { amount: base + (config.flexFee ?? 25), sunday: true, flex: false };
  }
  if (isFlexTime(service, dateStr, time)) {
    return { amount: service.deposit + (config.flexFee ?? 25), sunday: false, flex: true };
  }
  return { amount: service.deposit, sunday: false, flex: false };
}

// A slot entry is "active" (occupies the slot) unless it's an expired pending hold
export function isActive(entry) {
  if (!entry) return false;
  if (entry.status === "pending" && entry.expiresAt && Date.now() > entry.expiresAt) return false;
  if (entry.status === "cancelled") return false;
  return true;
}

// List all active entries for keys with a prefix, e.g. "slot:2026-08"
export async function listSlots(prefix) {
  const s = store();
  const { blobs } = await s.list({ prefix });
  const results = [];
  for (const b of blobs) {
    const entry = await s.get(b.key, { type: "json" });
    if (isActive(entry)) results.push({ key: b.key, entry });
  }
  return results;
}
