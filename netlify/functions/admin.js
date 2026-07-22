// POST /api/admin — owner actions. Requires header: x-admin-password
// Actions:
//   { action: "login" }
//   { action: "list", month: "YYYY-MM" }            -> all bookings & blocks (incl. awaiting-deposit)
//   { action: "block", date, times: ["10:00", ...] } -> block slots (whole day if times omitted)
//   { action: "unblock", date, time }
//   { action: "confirm", date, time }                -> mark awaiting-deposit booking confirmed
//   { action: "cancel", date, time }                 -> cancel a booking (frees the slot)
//   { action: "manual-book", date, time, name, serviceId?, phone?, notes? } -> owner-created booking (any day/time, e.g. flex hours or Sundays)
import { config, json, store, slotKey, isActive } from "./utils/shared.js";

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
  const { action, date, time } = body;
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
        if (!entry) continue;
        if (!isActive(entry)) continue; // skip expired holds & cancelled
        const m = b.key.match(/^slot:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
        if (!m) continue;
        slots.push({ date: m[1], time: m[2], ...entry });
      }
      slots.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return json({ slots });
    }

    case "block": {
      if (!validDate(date)) return json({ error: "Bad date" }, 400);
      let times = body.times;
      if (!Array.isArray(times) || times.length === 0) {
        // Whole day: block standard grid 08:00-19:00 hourly so nothing can slip through
        times = [];
        for (let h = 8; h <= 19; h++) times.push(String(h).padStart(2, "0") + ":00");
      }
      const blocked = [];
      for (const t of times) {
        if (!validTime(t)) continue;
        const key = slotKey(date, t);
        const existing = await s.get(key, { type: "json" });
        if (isActive(existing) && existing.type === "booking") continue; // don't overwrite bookings
        await s.setJSON(key, {
          type: "block",
          status: "blocked",
          createdAt: new Date().toISOString(),
        });
        blocked.push(t);
      }
      return json({ ok: true, blocked });
    }

    case "unblock": {
      if (!validDate(date) || !validTime(time)) return json({ error: "Bad date/time" }, 400);
      const key = slotKey(date, time);
      const entry = await s.get(key, { type: "json" });
      if (entry && entry.type === "block") await s.delete(key);
      return json({ ok: true });
    }

    case "confirm": {
      if (!validDate(date) || !validTime(time)) return json({ error: "Bad date/time" }, 400);
      const key = slotKey(date, time);
      const entry = await s.get(key, { type: "json" });
      if (!entry || entry.type !== "booking") return json({ error: "No booking there" }, 404);
      await s.setJSON(key, {
        ...entry,
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        expiresAt: undefined,
      });
      return json({ ok: true });
    }

    case "cancel": {
      if (!validDate(date) || !validTime(time)) return json({ error: "Bad date/time" }, 400);
      const key = slotKey(date, time);
      const entry = await s.get(key, { type: "json" });
      if (!entry || entry.type !== "booking") return json({ error: "No booking there" }, 404);
      await s.delete(key);
      return json({ ok: true, cancelled: entry });
    }

    case "manual-book": {
      if (!validDate(date) || !validTime(time)) return json({ error: "Bad date/time" }, 400);
      const key = slotKey(date, time);
      const existing = await s.get(key, { type: "json" });
      if (isActive(existing)) return json({ error: "Slot already taken/blocked" }, 409);
      const service = config.services.find((sv) => sv.id === body.serviceId);
      await s.setJSON(key, {
        id: crypto.randomUUID(),
        type: "booking",
        status: "confirmed",
        manual: true,
        serviceId: body.serviceId || null,
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
