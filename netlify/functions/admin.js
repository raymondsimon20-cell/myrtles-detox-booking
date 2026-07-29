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
  isCoreTime, nowInTz,
} from "./utils/shared.js";
import { sendEmail, fmtWhen, paymentInstructions } from "./utils/email.js";

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
      // Owner can book ANY date/time (no 36-hour minimum). Times outside core
      // hours (Mon-Thu 10 AM - 5 PM starts) automatically carry the $25 flex fee.
      if (!validDate(date) || !validTime(time)) return json({ error: "Bad date/time" }, 400);
      const service = config.services.find((sv) => sv.id === body.serviceId);
      const st = service ? stationOf(service) : "manual";
      const key = slotKey(date, time, st);
      const existing = await s.get(key, { type: "json" });
      if (isActive(existing)) return json({ error: "Slot already taken/blocked" }, 409);
      const flex = !isCoreTime(date, time);
      const flexFee = flex ? (config.flexFee ?? 25) : 0;
      const email = String(body.email || "").trim().slice(0, 100);
      // requestPayment: hold the slot as awaiting-deposit and email the client
      // payment instructions; owner confirms with "Deposit received" as usual.
      const requestPayment = Boolean(body.requestPayment && email);
      const deposit = service ? service.deposit + flexFee : flexFee || undefined;
      const entry = {
        id: crypto.randomUUID(),
        type: "booking",
        status: requestPayment ? "awaiting-deposit" : "confirmed",
        manual: true,
        serviceId: body.serviceId || null,
        station: st,
        serviceName: service ? service.name : body.serviceName || "Owner-added",
        deposit,
        flexTime: flex || undefined,
        flexFee: flexFee || undefined,
        name: String(body.name || "").trim().slice(0, 100),
        phone: String(body.phone || "").trim().slice(0, 40),
        email,
        notes: String(body.notes || "").trim().slice(0, 500),
        createdAt: new Date().toISOString(),
      };
      await s.setJSON(key, entry);
      if (requestPayment && deposit) {
        const word = flex ? `deposit (includes $${config.flexFee ?? 25} flex-time fee)` : "deposit";
        await sendEmail(
          email,
          `Your ${config.businessName} appointment is held — deposit needed to confirm`,
          `Hi ${entry.name},

Your appointment is HELD:

${entry.serviceName} — ${fmtWhen(date, time)}

${paymentInstructions(deposit, word)}

See you soon!
${config.businessName}`
        );
      }
      return json({ ok: true, flex, flexFee, emailSent: requestPayment && Boolean(deposit) });
    }

    case "search": {
      // Search ALL appointments - current and archived - by name, phone, email,
      // service, or date fragment. Used for looking up past customer orders.
      const q = String(body.query || "").trim().toLowerCase();
      if (q.length < 2) return json({ error: "Type at least 2 characters" }, 400);
      const results = [];
      for (const prefix of ["slot:", "archive:"]) {
        const { blobs } = await s.list({ prefix });
        for (const b of blobs) {
          const m = b.key.match(/^(slot|archive):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}):(.+)$/);
          if (!m) continue;
          const entry = await s.get(b.key, { type: "json" });
          if (!entry || entry.type !== "booking") continue;
          const hay = [entry.name, entry.phone, entry.email, entry.serviceName, m[2]]
            .filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) continue;
          results.push({ date: m[2], time: m[3], station: m[4], archived: m[1] === "archive", ...entry });
        }
      }
      results.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      return json({ results: results.slice(0, 200) });
    }

    case "archive": {
      // Move one past booking out of the live calendar into the archive
      if (!validDate(date) || !validTime(time) || !station)
        return json({ error: "Bad date/time/station" }, 400);
      const key = slotKey(date, time, station);
      const entry = await s.get(key, { type: "json" });
      if (!entry) return json({ error: "Nothing in that slot" }, 404);
      await s.setJSON(`archive:${date}:${time}:${station}`, {
        ...entry, archivedAt: new Date().toISOString(),
      });
      await s.delete(key);
      return json({ ok: true });
    }

    case "archive-past": {
      // Bulk: archive every booking before today; past blocks are just deleted
      const { date: today } = nowInTz();
      const { blobs } = await s.list({ prefix: "slot:" });
      let archived = 0;
      for (const b of blobs) {
        const m = parseSlotKey(b.key);
        if (!m || m[1] >= today) continue;
        const entry = await s.get(b.key, { type: "json" });
        if (!entry) continue;
        if (entry.type === "booking") {
          await s.setJSON(`archive:${m[1]}:${m[2]}:${m[3]}`, {
            ...entry, archivedAt: new Date().toISOString(),
          });
          archived++;
        }
        await s.delete(b.key);
      }
      return json({ ok: true, archived });
    }

    case "export": {
      // All bookings (live + archived) for a year - totals per service and
      // row-level data the UI turns into a tax-ready CSV.
      const year = String(body.year || "");
      if (!/^\d{4}$/.test(year)) return json({ error: "year must be YYYY" }, 400);
      const rows = [];
      for (const prefix of [`slot:${year}`, `archive:${year}`]) {
        const { blobs } = await s.list({ prefix });
        for (const b of blobs) {
          const m = b.key.match(/^(slot|archive):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}):(.+)$/);
          if (!m) continue;
          const entry = await s.get(b.key, { type: "json" });
          if (!entry || entry.type !== "booking") continue;
          rows.push({ date: m[2], time: m[3], station: m[4], archived: m[1] === "archive", ...entry });
        }
      }
      rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const summary = {};
      for (const r of rows) {
        const k = r.serviceName || "Other";
        summary[k] ||= { count: 0, deposits: 0 };
        summary[k].count++;
        summary[k].deposits += Number(r.deposit) || 0;
      }
      return json({ rows, summary });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};
