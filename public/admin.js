/* Myrtle's Detox Spa — owner admin page */
(async function () {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const cfg = await (await fetch("/api/config")).json();

  let password = sessionStorage.getItem("adminPass") || "";
  const now = new Date();
  const state = { y: now.getFullYear(), m: now.getMonth(), slots: [], selDate: null };

  const fmt12 = (t) => {
    let [h, mm] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${pad(mm)} ${ap}`;
  };

  async function api(body) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-password": password },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function showError(id, msg) {
    const el = $(id);
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  // ---------- Login ----------
  async function tryLogin() {
    try {
      await api({ action: "login" });
      sessionStorage.setItem("adminPass", password);
      $("login-box").classList.add("hidden");
      $("admin-app").classList.remove("hidden");
      $("m-service").innerHTML =
        `<option value="">(service)</option>` +
        cfg.services.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
      await refresh();
    } catch (e) {
      showError("login-error", e.message);
    }
  }
  $("login-btn").onclick = () => { password = $("admin-pass").value; tryLogin(); };
  $("admin-pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { password = $("admin-pass").value; tryLogin(); }
  });
  if (password) tryLogin();

  // ---------- Calendar ----------
  async function refresh() {
    const month = `${state.y}-${pad(state.m + 1)}`;
    const r = await api({ action: "list", month });
    state.slots = r.slots;
    renderCalendar();
    if (state.selDate) renderDay();
  }

  function renderCalendar() {
    $("month-label").textContent = new Date(state.y, state.m, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const first = new Date(state.y, state.m, 1).getDay();
    const days = new Date(state.y, state.m + 1, 0).getDate();
    let html = "";
    for (let i = 0; i < first; i++) html += "<span></span>";
    for (let d = 1; d <= days; d++) {
      const dateStr = `${state.y}-${pad(state.m + 1)}-${pad(d)}`;
      const entries = state.slots.filter((s) => s.date === dateStr);
      const badges = entries
        .slice(0, 4)
        .map((s) => `<span class="badge ${s.status}">${fmt12(s.time)}</span>`)
        .join(" ");
      const more = entries.length > 4 ? `<span class="hint">+${entries.length - 4}</span>` : "";
      html += `<button type="button" class="cal-day admin-day ${state.selDate === dateStr ? "selected" : ""}"
        data-date="${dateStr}"><strong>${d}</strong><br/>${badges}${more}</button>`;
    }
    $("calendar").innerHTML = html;
  }

  $("calendar").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-day");
    if (!btn) return;
    state.selDate = btn.dataset.date;
    renderCalendar();
    renderDay();
  });

  $("prev-month").onclick = () => shift(-1);
  $("next-month").onclick = () => shift(1);
  function shift(d) {
    state.m += d;
    if (state.m < 0) { state.m = 11; state.y--; }
    if (state.m > 11) { state.m = 0; state.y++; }
    state.selDate = null;
    $("day-detail").classList.add("hidden");
    refresh();
  }

  // ---------- Day detail (grouped by service/station) ----------
  const stationOf = (s) =>
    s.group ? s.group.toLowerCase().replace(/[^a-z0-9]+/g, "-") : s.id;

  function stationList() {
    const seen = new Map();
    for (const s of cfg.services) {
      const st = stationOf(s);
      if (!seen.has(st)) seen.set(st, { station: st, label: s.group || s.name, rep: s });
    }
    return [...seen.values()];
  }

  function slotsForStation(rep, dateStr) {
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    const hrs = cfg.hours[String(dow)];
    if (!hrs) return [];
    if (!Array.isArray(hrs)) return hrs.slots || [];
    if (rep.times) return rep.times;
    const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const out = [];
    for (let m = toMin(hrs[0]); m + cfg.slotMinutes <= toMin(hrs[1]); m += cfg.slotMinutes)
      out.push(pad(Math.floor(m / 60)) + ":" + pad(m % 60));
    return out;
  }

  function renderDay() {
    const date = state.selDate;
    $("day-label").textContent = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });
    const entries = state.slots.filter((s) => s.date === date);
    let html = "";
    for (const { station, label, rep } of stationList()) {
      const stEntries = entries.filter((e) => e.station === station);
      const times = [...new Set([...slotsForStation(rep, date), ...stEntries.map((e) => e.time)])].sort();
      if (!times.length) continue;
      const rows = times.map((t) => {
        const e = stEntries.find((x) => x.time === t);
        if (!e) {
          return `<div class="slot-row"><span class="t">${fmt12(t)}</span>
            <span class="who hint">open</span>
            <button class="btn-small" data-act="block" data-time="${t}" data-station="${station}">Block</button></div>`;
        }
        if (e.type === "block") {
          return `<div class="slot-row"><span class="t">${fmt12(t)}</span>
            <span class="who"><span class="badge blocked">blocked</span></span>
            <button class="btn-small" data-act="unblock" data-time="${t}" data-station="${station}">Unblock</button></div>`;
        }
        const contact = [e.phone, e.email].filter(Boolean).join(" · ");
        const confirmBtn = e.status === "awaiting-deposit"
          ? `<button class="btn-primary" data-act="confirm" data-time="${t}" data-station="${station}">Deposit received ✓</button>` : "";
        return `<div class="slot-row"><span class="t">${fmt12(t)}</span>
          <span class="who"><span class="badge ${e.status}">${e.status}</span>
            <strong>${e.name || "?"}</strong> — ${e.serviceName || ""}${e.deposit ? ` ($${e.deposit})` : ""}
            <br/><span class="hint">${contact}${e.notes ? " · " + e.notes : ""}</span></span>
          ${confirmBtn}
          <button class="btn-danger" data-act="cancel" data-time="${t}" data-station="${station}">Cancel</button></div>`;
      }).join("");
      html += `<h4 style="margin:0.9rem 0 0.2rem">${label}</h4>${rows}`;
    }
    // manual/off-schedule entries not covered above
    const misc = entries.filter((e) => !stationList().some((s) => s.station === e.station));
    if (misc.length) {
      html += `<h4 style="margin:0.9rem 0 0.2rem">Other</h4>` + misc.map((e) =>
        `<div class="slot-row"><span class="t">${fmt12(e.time)}</span>
          <span class="who"><span class="badge ${e.status}">${e.status}</span>
            <strong>${e.name || "?"}</strong> — ${e.serviceName || ""}</span>
          <button class="btn-danger" data-act="cancel" data-time="${e.time}" data-station="${e.station}">Cancel</button></div>`
      ).join("");
    }
    $("day-slots").innerHTML = html ||
      "<p class='hint'>Closed this day — use the form below to add flex-hour bookings.</p>";
    $("day-detail").classList.remove("hidden");
  }

  $("day-slots").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const { act, time, station } = btn.dataset;
    if (act === "cancel" && !confirm(`Cancel the ${fmt12(time)} entry? This frees the slot.`)) return;
    try {
      showError("admin-error", null);
      await api({ action: act, date: state.selDate, time, station });
      await refresh();
    } catch (err) { showError("admin-error", err.message); }
  });

  $("block-day-btn").onclick = async () => {
    if (!confirm("Block every open slot for every service on this day?")) return;
    try {
      await api({ action: "block-day", date: state.selDate });
      await refresh();
    } catch (err) { showError("admin-error", err.message); }
  };

  $("manual-btn").onclick = async () => {
    const time = $("m-time").value.trim();
    if (!/^\d{2}:\d{2}$/.test(time)) return showError("admin-error", "Time must be HH:MM, e.g. 14:00");
    try {
      showError("admin-error", null);
      await api({
        action: "manual-book",
        date: state.selDate,
        time,
        name: $("m-name").value,
        serviceId: $("m-service").value || null,
        phone: $("m-phone").value,
      });
      $("m-name").value = $("m-time").value = $("m-phone").value = "";
      await refresh();
    } catch (err) { showError("admin-error", err.message); }
  };
})();
