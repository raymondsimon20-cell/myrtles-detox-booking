// POST /api/admin — owner actions. Requires header: x-admin-password
// Actions:
//   { action: "login" }
//   { action: "list", month: "YYYY-MM" }                       -> all bookings & blocks
//   { action: "block", date, time, station }                   -> block one service slot
//   { action: "block-day", date }                              -> block every station's slots that day
//   { action: "unblock", date, time, station }
//   { action: "confirm", date, time, station }                 -> mark awaiting-deposit booking confirmed
//   { action: "cancel", date, time, station }                  -> cancel booking/blocked slot (frees it)
//   { action: "manual-book", date, time, serviceId, name, phone?, notes? } -> owner-created booking (any day/time)
import {
  config, json, store, slotKey, parseSlotKey, isActive, stationOf, slotsForService,
} from "./utils/shared.js";
import { sendEmail, fmtWhen } from "./utils/email.js";

// One representative service per station (for schedules/labels)
function stations() {
  const map = new Map();
  for (const s of config.services) {
    const st = stationOf(s);
    if (!map.has(st)) map.set(st, s);
  }
  return map; // station -> representative service
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD)
    return json({ error: "ADMIN_PASSWORD env var is not set on the site" }, 500);
  if (password !== process.env.ADMIN_PASSWORD)
    return json({ error: "Wrong password" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const s = store();
  const { action, date, time, station } = body;
  const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const validTime = (t) => /^\d{2}:\d{2}$/.test(t || "");

  switch (action) {
    case "login":
      return json({ ok: true });

    case "list": {
      if (!/^\d{4}-\d{2}$/.test(body.month || ""))
        return json({ error: "month must be YYYY-MM" }, 400);
      const { blobs } = await s.list({ prefix: `slot:${body.month}` });
      const slots = [];
      for (const b of blobs) {
        const entry = await s.get(b.key, { type: "json" });
        if (!entry || !isActive(entry)) continue;
        const m = parseSlotKey(b.key);
        if (!m) continue;
        slots.push({ date: m[1], time: m[2], station: m[3], ...entry });
      }
      slots.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return json({ slots });
    }

    case "block": {
      if (!validDate(date) || !validTime(time) || !station)
        return json({ error: "Bad date/time/station" }, 400);
      const key = slotKey(date, time, station);
      const existing = await s.get(key, { type: "json" });
      if (isActive(existing) && existing.type === "booking")
        return json({ error: "There's a booking in that slot" }, 409);
      await s.setJSON(key, { type: "block", status: "blocked", createdAt: new Date().toISOString() });
      return json({ ok: true });
    }

    case "block-day": {
      if (!validDate(date)) return json({ error: "Bad date" }, 400);
      const blocked = [];
      for (const [st, rep] of stations()) {
        for (const t of slotsForService(rep, date)) {
          const key = slotKey(date, t, st);
          const existing = await s.get(key, { type: "json" });
          if (isActive(existing)) continue; // don't overwrite bookings/blocks
          await s.setJSON(key, { type: "block", status: "blocked", createdAt: new Date().toISOString() });
          blocked.push(`${st} ${t}`);
        }
      }
      return json({ ok: true, blockedCount: blocked.length });
    }

    case "unblock": {
      if (!validDate(date) || !validTime(time) || !station)
        return json({ error: "Bad date/time/station" }, 400);
      const key = slotKey(date, time, station);
      const entry = await s.get(key, { type: "json" });
      if (entry && entry.type === "block") await s.delete(key);
      return json({ ok: true });
    }

    case "confirm": {
      if (!validDate(date) || !validTime(time) || !station)
        return json({ error: "Bad date/time/station" }, 400);
      const key = slotKey(date, time, station);
      const entry = await s.get(key, { type: "json" });
      if (!entry || entry.type !== "booking") return json({ error: "No booking there" }, 404);
      await s.setJSON(key, {
        ...entry,
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        expiresAt: undefined,
      });
      await sendEmail(
        entry.email,
        `Confirmed! Your ${config.businessName} appointment`,
        `Hi ${entry.name},

We received your ${entry.sundayPrepay ? "prepayment" : "deposit"} — your appointment is CONFIRMED:

${entry.serviceName} — ${fmtWhen(date, time)}

${entry.sundayPrepay ? "" : "The remainder can be paid in cash on the day of your appointment.\n\n"}See you soon!
${config.businessName}`
      );
      return json({ ok: true });
    }

    case "cancel": {
      if (!validDate(date) || !validTime(time) || !station)
        return json({ error: "Bad date/time/station" }, 400);
      const key = slotKey(date, time, station);
      const entry = await s.get(key, { type: "json" });
      if (!entry) return json({ error: "Nothing in that slot" }, 404);
      await s.delete(key);
      if (entry.type === "booking") {
        await sendEmail(
          entry.email,
          `Your ${config.businessName} appointment was cancelled`,
          `Hi ${entry.name},

Your appointment (${entry.serviceName} — ${fmtWhen(date, time)}) has been cancelled.

If you have questions or want to rebook, reach us on Facebook or book again online.

${config.businessName}`
        );
      }
      return json({ ok: true, cancelled: entry });
    }

    case "manual-book": {
      if (!validDate(date) || !validTime(time)) return json({ error: "Bad date/time" }, 400);
      const service = config.services.find((sv) => sv.id === body.serviceId);
      const st = service ? stationOf(service) : "manual";
      const key = slotKey(date, time, st);
      const existing = await s.get(key, { type: "json" });
      if (isActive(existing)) return json({ error: "Slot already taken/blocked" }, 409);
      await s.setJSON(key, {
        id: crypto.randomUUID(),
        type: "booking",
        status: "confirmed",
        manual: true,
        serviceId: body.serviceId || null,
        station: st,
        serviceName: service ? service.name : body.serviceName || "Owner-added",
        name: String(body.name || "").trim().slice(0, 100),
        phone: String(body.phone || "").trim().slice(0, 40),
        notes: String(body.notes || "").trim().slice(0, 500),
        createdAt: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};
