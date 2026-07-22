// GET /api/availability?month=YYYY-MM — returns taken slots for the month, per station
// { taken: { "YYYY-MM-DD": [ { time: "10:00", station: "colonic" }, ... ] } }
import { json, listSlots, parseSlotKey } from "./utils/shared.js";

export default async (req) => {
  const month = new URL(req.url).searchParams.get("month");
  if (!/^\d{4}-\d{2}$/.test(month || "")) {
    return json({ error: "month must be YYYY-MM" }, 400);
  }
  const slots = await listSlots(`slot:${month}`);
  const taken = {};
  for (const { key } of slots) {
    const m = parseSlotKey(key);
    if (!m) continue;
    (taken[m[1]] ||= []).push({ time: m[2], station: m[3] });
  }
  return json({ taken });
};
