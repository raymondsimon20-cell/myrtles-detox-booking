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
    s.station || (s.group ? s.group.toLowerCase().replace(/[^a-z0-9]+/g, "-") : s.id);

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
        const paid = (e.payments || []).reduce((a, p) => a + (+p.amount || 0), 0);
        return `<div class="slot-row"><span class="t">${fmt12(t)}</span>
          <span class="who"><span class="badge ${e.status}">${e.status}</span>
            <strong>${e.name || "?"}</strong> — ${e.serviceName || ""}${e.deposit ? ` ($${e.deposit})` : ""}${paid ? ` · <strong>paid $${paid}</strong>` : ""}
            <br/><span class="hint">${contact}${e.notes ? " · " + e.notes : ""}</span></span>
          ${confirmBtn}
          <button class="btn-small" data-act="pay" data-time="${t}" data-station="${station}">💵 Payment</button>
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
    renderTimeSelect(date);
    $("day-detail").classList.remove("hidden");
  }

  // Owner can book any time from 8:00 AM; outside Mon-Thu 10-5 = +$25 flex
  const isCore = (dateStr, t) => {
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 4 && t >= "10:00" && t <= "17:00";
  };

  function renderTimeSelect(dateStr) {
    const opts = [];
    for (let m = 8 * 60; m <= 18.5 * 60; m += 30) {
      const t = pad(Math.floor(m / 60)) + ":" + pad(m % 60);
      opts.push(`<option value="${t}">${fmt12(t)}${isCore(dateStr, t) ? "" : " (+$25 flex)"}</option>`);
    }
    $("m-time").innerHTML = opts.join("");
  }

  // Shared prompt flow for recording a payment against a booking
  async function promptPayment(date, time, station) {
    const amount = Number(prompt("Amount received ($):", ""));
    if (!(amount > 0)) return false;
    const method = (prompt("Payment method (cash / Zelle / Cash App / PayPal):", "cash") || "cash").trim();
    await api({ action: "record-payment", date, time, station, amount, method });
    return true;
  }

  $("day-slots").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const { act, time, station } = btn.dataset;
    try {
      showError("admin-error", null);
      if (act === "pay") {
        if (await promptPayment(state.selDate, time, station)) await refresh();
        return;
      }
      if (act === "cancel") {
        if (!confirm(`Cancel the ${fmt12(time)} entry? This frees the slot.`)) return;
        const fee = Number(prompt("Late-cancel fee kept from the deposit ($)? Enter 0 if none:", "50")) || 0;
        await api({ action: "cancel", date: state.selDate, time, station, cancelFee: fee });
        await refresh();
        return;
      }
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
    const time = $("m-time").value;
    if (!/^\d{2}:\d{2}$/.test(time)) return showError("admin-error", "Pick a time");
    const requestPay = $("m-request-pay").checked;
    const email = $("m-email").value.trim();
    if (requestPay && !email)
      return showError("admin-error", "Enter an email to send the payment request to");
    try {
      showError("admin-error", null);
      const r = await api({
        action: "manual-book",
        date: state.selDate,
        time,
        name: $("m-name").value,
        serviceId: $("m-service").value || null,
        phone: $("m-phone").value,
        email,
        requestPayment: requestPay,
      });
      $("m-name").value = $("m-phone").value = $("m-email").value = "";
      $("m-request-pay").checked = false;
      const notes = [];
      if (r.flex) notes.push(`$${r.flexFee} flex fee applied (outside Mon–Thu 10–5)`);
      if (r.emailSent) notes.push("payment-request email sent — confirm with “Deposit received” when it arrives");
      if (notes.length) alert(`Booking added. ${notes.join("; ")}.`);
      await refresh();
    } catch (err) { showError("admin-error", err.message); }
  };

  // ---------- Search & archive ----------
  const fmtD = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const todayStr = () => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  };

  function resultRow(e) {
    const contact = [e.phone, e.email].filter(Boolean).join(" · ");
    const badge = e.status === "cancelled"
      ? `<span class="badge blocked">cancelled${e.cancelFee ? ` ($${e.cancelFee} fee)` : ""}</span>`
      : e.archived
        ? `<span class="badge blocked">archived</span>`
        : `<span class="badge ${e.status}">${e.status}</span>`;
    const paid = (e.payments || []).reduce((a, p) => a + (+p.amount || 0), 0);
    const archiveBtn = !e.archived && e.date < todayStr()
      ? `<button class="btn-small" data-arch="1" data-date="${e.date}" data-time="${e.time}" data-station="${e.station}">Archive</button>`
      : "";
    const payBtn = e.status !== "cancelled"
      ? `<button class="btn-small" data-pay="1" data-date="${e.date}" data-time="${e.time}" data-station="${e.station}">💵 Payment</button>`
      : "";
    return `<div class="slot-row"><span class="t">${fmtD(e.date)} ${fmt12(e.time)}</span>
      <span class="who">${badge} <strong>${e.name || "?"}</strong> — ${e.serviceName || ""}${e.deposit ? ` ($${e.deposit}${e.flexFee ? ` incl. $${e.flexFee} flex` : ""})` : ""}${paid ? ` · <strong>paid $${paid}</strong>` : ""}
      <br/><span class="hint">${contact}${e.notes ? " · " + e.notes : ""}</span></span>${payBtn}${archiveBtn}</div>`;
  }

  async function runSearch() {
    const q = $("search-q").value.trim();
    if (q.length < 2) { $("search-results").innerHTML = "<p class='hint'>Type at least 2 characters.</p>"; return; }
    $("search-results").innerHTML = "<p class='hint'>Searching…</p>";
    try {
      const r = await api({ action: "search", query: q });
      $("search-results").innerHTML = r.results.length
        ? r.results.map(resultRow).join("")
        : "<p class='hint'>No matches.</p>";
    } catch (err) { $("search-results").innerHTML = `<p class='error'>${err.message}</p>`; }
  }
  $("search-btn").onclick = runSearch;
  $("search-q").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

  $("search-results").addEventListener("click", async (e) => {
    const arch = e.target.closest("button[data-arch]");
    const pay = e.target.closest("button[data-pay]");
    if (!arch && !pay) return;
    try {
      if (pay) {
        if (!(await promptPayment(pay.dataset.date, pay.dataset.time, pay.dataset.station))) return;
      } else {
        await api({ action: "archive", date: arch.dataset.date, time: arch.dataset.time, station: arch.dataset.station });
      }
      await runSearch();
      await refresh();
    } catch (err) { $("search-results").innerHTML = `<p class='error'>${err.message}</p>`; }
  });

  $("archive-past-btn").onclick = async () => {
    if (!confirm("Move every appointment before today into the archive? They stay searchable and in year reports, but leave the calendar.")) return;
    try {
      const r = await api({ action: "archive-past" });
      alert(`Archived ${r.archived} past appointment${r.archived === 1 ? "" : "s"}.`);
      await refresh();
    } catch (err) { alert(err.message); }
  };

  // ---------- Year report / CSV export (taxes) ----------
  {
    const y = new Date().getFullYear();
    $("report-year").innerHTML = [y, y - 1, y - 2]
      .map((v) => `<option value="${v}">${v}</option>`).join("");
  }
  let lastReport = null;

  $("report-btn").onclick = async () => {
    $("report-results").innerHTML = "<p class='hint'>Building report…</p>";
    $("csv-btn").classList.add("hidden");
    try {
      const year = $("report-year").value;
      const r = await api({ action: "export", year });
      lastReport = { ...r, year };
      const names = Object.keys(r.summary).sort();
      let dep = 0, col = 0, count = 0;
      const rows = names.map((n) => {
        const v = r.summary[n];
        dep += v.deposits; col += v.collected; count += v.count;
        return `<div class="slot-row"><span class="who"><strong>${n}</strong></span>
          <span class="t">${v.count} appt${v.count === 1 ? "" : "s"}</span>
          <span class="t">$${v.deposits} deposits</span>
          <span class="t">$${v.collected} payments</span></div>`;
      }).join("");
      const fees = r.cancelFees || 0;
      $("report-results").innerHTML = r.rows.length
        ? rows +
          (fees ? `<div class="slot-row"><span class="who"><strong>Late-cancel fees kept</strong></span>
            <span class="t"></span><span class="t"></span><span class="t">$${fees}</span></div>` : "") +
          `<div class="slot-row"><span class="who"><strong>TOTAL REVENUE</strong></span>
            <span class="t"><strong>${count} appts</strong></span>
            <span class="t"></span>
            <span class="t"><strong>$${dep + col + fees}</strong></span></div>
          <p class="hint">Deposits count once confirmed; "payments" are amounts recorded with the 💵 Payment button (cash remainders, day-of payments). Record those as they come in and this becomes a true revenue report.</p>`
        : "<p class='hint'>No appointments found for that year.</p>";
      if (r.rows.length) $("csv-btn").classList.remove("hidden");
    } catch (err) { $("report-results").innerHTML = `<p class='error'>${err.message}</p>`; }
  };

  $("csv-btn").onclick = () => {
    if (!lastReport) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["date", "time", "service", "client", "phone", "email", "status", "deposit", "flex_fee", "payments_recorded", "payment_methods", "cancel_fee", "archived", "notes"];
    const lines = [head.join(",")].concat(lastReport.rows.map((e) => [
      e.date, e.time, e.serviceName, e.name, e.phone, e.email, e.status,
      e.deposit ?? "", e.flexFee ?? "",
      (e.payments || []).reduce((a, p) => a + (+p.amount || 0), 0) || "",
      (e.payments || []).map((p) => `${p.method} $${p.amount}`).join("; "),
      e.cancelFee ?? "", e.archived ? "yes" : "no", e.notes,
    ].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `myrtles-appointments-${lastReport.year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
})();
