import { getStore } from "@netlify/blobs";
import config from "./config.js";

export { config };

export const store = () => getStore("myrtles-booking");

export const slotKey = (date, time) => `slot:${date}:${time}`;

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

// All slot start times for a given YYYY-MM-DD, per business hours
export function slotsForDate(dateStr) {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  const hours = config.hours[String(dow)];
  if (!hours) return [];
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

export function isValidSlot(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) return false;
  if (!slotsForDate(date).includes(time)) return false;
  const { date: today, time: nowTime } = nowInTz();
  if (date < today) return false;
  if (date === today && time <= nowTime) return false;
  const max = new Date(Date.now() + config.bookingWindowDays * 86400000)
    .toISOString()
    .slice(0, 10);
  if (date > max) return false;
  return true;
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
