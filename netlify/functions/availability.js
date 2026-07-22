// GET /api/availability?month=YYYY-MM — returns taken slots for the month
// { taken: { "YYYY-MM-DD": ["09:00", "13:00"], ... } }
import { json, listSlots } from "./utils/shared.js";

export default async (req) => {
  const month = new URL(req.url).searchParams.get("month");
  if (!/^\d{4}-\d{2}$/.test(month || "")) {
    return json({ error: "month must be YYYY-MM" }, 400);
  }
  const slots = await listSlots(`slot:${month}`);
  const taken = {};
  for (const { key } of slots) {
    const m = key.match(/^slot:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
    if (!m) continue;
    (taken[m[1]] ||= []).push(m[2]);
  }
  return json({ taken });
};
