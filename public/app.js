/* Myrtle's Detox Spa — customer booking page */
(async function () {
  const $ = (id) => document.getElementById(id);
  const cfg = await (await fetch("/api/config")).json();

  const state = {
    service: null,
    date: null,
    time: null,
    viewYear: null,
    viewMonth: null, // 0-based
    taken: {}, // "YYYY-MM-DD" -> ["10:00", ...]
  };

  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: cfg.timezone });
  const maxStr = new Date(Date.now() + cfg.bookingWindowDays * 86400000).toISOString().slice(0, 10);

  const fmt12 = (t) => {
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  };
  const fmtDate = (d) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    });

  function slotsForDate(dateStr) {
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    const hrs = cfg.hours[String(dow)];
    if (!hrs) return [];
    const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const out = [];
    for (let m = toMin(hrs[0]); m + cfg.slotMinutes <= toMin(hrs[1]); m += cfg.slotMinutes)
      out.push(pad(Math.floor(m / 60)) + ":" + pad(m % 60));
    return out;
  }

  // ---------- Policies ----------
  $("policy-list").innerHTML = cfg.policies.map((p) => `<li>${p}</li>`).join("");

  // ---------- Step 1: services ----------
  $("service-list").innerHTML = cfg.services
    .map(
      (s) => `<button type="button" class="service-card" data-id="${s.id}">
        <span class="s-name">${s.name}</span>
        <span class="s-price">${s.price}</span><br/>
        <span class="s-dep">Deposit: $${s.deposit}</span>
      </button>`
    )
    .join("");
  $("service-list").addEventListener("click", (e) => {
    const card = e.target.closest(".service-card");
    if (!card) return;
    document.querySelectorAll(".service-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    state.service = cfg.services.find((s) => s.id === card.dataset.id);
    $("step-datetime").classList.remove("hidden");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    renderCalendar();
    updatePayStep();
  });

  // ---------- Step 2: calendar ----------
  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();

  async function loadMonth() {
    const month = `${state.viewYear}-${pad(state.viewMonth + 1)}`;
    try {
      const res = await (await fetch(`/api/availability?month=${month}`)).json();
      Object.assign(state.taken, res.taken || {});
    } catch { /* availability best-effort */ }
  }

  async function renderCalendar() {
    await loadMonth();
    const y = state.viewYear, m = state.viewMonth;
    $("month-label").textContent = new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let html = "";
    for (let i = 0; i < first; i++) html += "<span></span>";
    for (let d = 1; d <= days; d++) {
      const dateStr = `${y}-${pad(m + 1)}-${pad(d)}`;
      const slots = slotsForDate(dateStr);
      const takenList = state.taken[dateStr] || [];
      const open = slots.filter((t) => !takenList.includes(t));
      const inRange = dateStr >= todayStr && dateStr <= maxStr;
      const disabled = !inRange || slots.length === 0;
      const full = inRange && slots.length > 0 && open.length === 0;
      html += `<button type="button" class="cal-day ${full ? "full" : ""} ${state.date === dateStr ? "selected" : ""}"
        data-date="${dateStr}" ${disabled || full ? "disabled" : ""}>${d}</button>`;
    }
    $("calendar").innerHTML = html;
  }

  $("calendar").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-day");
    if (!btn || btn.disabled) return;
    state.date = btn.dataset.date;
    state.time = null;
    document.querySelectorAll(".cal-day").forEach((c) => c.classList.remove("selected"));
    btn.classList.add("selected");
    renderSlots();
  });

  $("prev-month").onclick = () => { shiftMonth(-1); };
  $("next-month").onclick = () => { shiftMonth(1); };
  function shiftMonth(delta) {
    state.viewMonth += delta;
    if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
    if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
    renderCalendar();
  }

  function renderSlots() {
    const takenList = state.taken[state.date] || [];
    let slots = slotsForDate(state.date).filter((t) => !takenList.includes(t));
    if (state.date === todayStr) {
      const nowT = new Date().toLocaleTimeString("en-GB", { timeZone: cfg.timezone, hour: "2-digit", minute: "2-digit" });
      slots = slots.filter((t) => t > nowT);
    }
    $("slot-date-label").textContent = fmtDate(state.date);
    $("slots").innerHTML = slots.length
      ? slots.map((t) => `<button type="button" class="slot-btn" data-time="${t}">${fmt12(t)}</button>`).join("")
      : "<p class='hint'>No open times this day — please pick another.</p>";
    $("slot-area").classList.remove("hidden");
  }

  $("slots").addEventListener("click", (e) => {
    const btn = e.target.closest(".slot-btn");
    if (!btn) return;
    document.querySelectorAll(".slot-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.time = btn.dataset.time;
    $("step-details").classList.remove("hidden");
    $("step-pay").classList.remove("hidden");
    updatePayStep();
    $("step-details").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // ---------- Step 4: payment ----------
  function updatePayStep() {
    if (!state.service) return;
    const s = state.service;
    $("summary").innerHTML = `
      <strong>${s.name}</strong> (${s.price})<br/>
      ${state.date ? fmtDate(state.date) : ""} ${state.time ? "at " + fmt12(state.time) : ""}<br/>
      <strong>Deposit due now: $${s.deposit}</strong> <span class="hint">(non-refundable)</span>`;
  }

  function details() {
    return {
      name: $("f-name").value.trim(),
      phone: $("f-phone").value.trim(),
      email: $("f-email").value.trim(),
      notes: $("f-notes").value.trim(),
    };
  }
  function validate() {
    const d = details();
    if (!state.service || !state.date || !state.time) return "Please pick a service, date, and time.";
    if (d.name.length < 2) return "Please enter your name.";
    if (!d.phone && !d.email) return "Please enter a phone number or email.";
    return null;
  }
  function showError(msg) {
    const el = $("pay-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }

  // Reserve without online payment (Zelle / CashApp / cash)
  $("reserve-btn").onclick = async () => {
    const err = validate();
    if (err) return showError(err);
    showError(null);
    $("reserve-btn").disabled = true;
    try {
      const r = await api("/api/create-booking", {
        serviceId: state.service.id, date: state.date, time: state.time,
        ...details(), payMethod: "other",
      });
      const pm = r.paymentMethods || cfg.paymentMethods;
      finish("Your slot is held!", `
        <p>Your appointment is <strong>held</strong> and will be <strong>confirmed once your
        $${r.depositDue} deposit is received</strong>.</p>
        <div class="pay-instructions">
          <strong>Send your $${r.depositDue} deposit to one of:</strong>
          <ul>
            <li><strong>Zelle:</strong> ${pm.zelle}</li>
            <li><strong>Cash App:</strong> ${pm.cashApp}</li>
            <li><strong>PayPal:</strong> ${pm.payPalHandle}</li>
            <li><strong>Cash:</strong> prepay in person</li>
          </ul>
          <p>Please include your name (<strong>${details().name}</strong>) with the payment.
          If someone else pays for you, have them indicate who the funds are for.</p>
        </div>
        <p>${fmtDate(state.date)} at ${fmt12(state.time)} — ${state.service.name}</p>`);
    } catch (e) {
      showError(e.message);
      $("reserve-btn").disabled = false;
      renderCalendar();
    }
  };

  function finish(title, bodyHtml) {
    $("done-title").textContent = title;
    $("done-body").innerHTML = bodyHtml;
    ["step-service", "step-datetime", "step-details", "step-pay"].forEach((id) =>
      $(id).classList.add("hidden")
    );
    $("step-done").classList.remove("hidden");
    $("step-done").scrollIntoView({ behavior: "smooth" });
  }

  // PayPal / Venmo buttons
  if (cfg.paymentsEnabled && cfg.paypalClientId) {
    $("pay-online").classList.remove("hidden");
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=USD&intent=capture&enable-funding=venmo`;
    script.onload = () => {
      window.paypal.Buttons({
        createOrder: async () => {
          const err = validate();
          if (err) { showError(err); throw new Error(err); }
          showError(null);
          const r = await api("/api/create-booking", {
            serviceId: state.service.id, date: state.date, time: state.time,
            ...details(), payMethod: "paypal",
          });
          return r.orderId;
        },
        onApprove: async (data) => {
          try {
            await api("/api/capture-payment", { orderId: data.orderID, date: state.date, time: state.time });
            finish("Confirmed!", `
              <p>Your $${state.service.deposit} deposit was received — your appointment is
              <strong>confirmed</strong>.</p>
              <p><strong>${state.service.name}</strong><br/>
              ${fmtDate(state.date)} at ${fmt12(state.time)}</p>
              <p class="hint">The remainder can be paid in cash on the day of your appointment.</p>`);
          } catch (e) { showError(e.message); }
        },
        onError: () => showError("Payment didn't go through. You can try again or reserve and pay by Zelle/Cash App."),
      }).render("#paypal-buttons");
    };
    document.head.appendChild(script);
  }
})();
