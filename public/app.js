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

  const stationOf = (s) =>
    s.station || (s.group ? s.group.toLowerCase().replace(/[^a-z0-9]+/g, "-") : s.id);

  function slotsForDate(dateStr) {
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    const hrs = cfg.hours[String(dow)];
    if (!hrs) return [];
    if (!Array.isArray(hrs)) return hrs.slots || []; // Sunday explicit slots
    if (state.service && state.service.times) return state.service.times;
    const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const out = [];
    for (let m = toMin(hrs[0]); m + cfg.slotMinutes <= toMin(hrs[1]); m += cfg.slotMinutes)
      out.push(pad(Math.floor(m / 60)) + ":" + pad(m % 60));
    return out;
  }

  // Earliest bookable moment: now (business timezone) + minHoursAhead
  function cutoffEpoch() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: cfg.timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const g = (t) => +parts.find((p) => p.type === t).value;
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) +
      (cfg.minHoursAhead ?? 0) * 3600000;
  }
  const slotEpoch = (d, t) =>
    Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +t.slice(0, 2), +t.slice(3, 5));
  const bookableSlots = (dateStr) => {
    if (!state.service) return [];
    // Sundays close for online booking after Thursday (prepay-by-Thursday rule)
    if (isSunday(dateStr)) {
      const dayStart = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
      if (cutoffEpoch() - (cfg.minHoursAhead ?? 0) * 3600000 >= dayStart - 2 * 86400000) return [];
    }
    const cut = cutoffEpoch();
    const myStation = stationOf(state.service);
    const takenTimes = (state.taken[dateStr] || [])
      .filter((e) => e.station === myStation)
      .map((e) => e.time);
    return slotsForDate(dateStr).filter(
      (t) => !takenTimes.includes(t) && slotEpoch(dateStr, t) >= cut
    );
  };

  const isSunday = (d) => d && new Date(d + "T12:00:00Z").getUTCDay() === 0;
  const isFlexTime = (d, t) =>
    !isSunday(d) && state.service && (state.service.flexTimes || []).includes(t);
  function amountDue() {
    const s = state.service;
    if (!s) return 0;
    if (isSunday(state.date)) {
      if (cfg.sundayPrepay && cfg.sundayPrepay[s.id] != null) return cfg.sundayPrepay[s.id];
      const m = String(s.price).match(/\d+/);
      return (m ? +m[0] : s.deposit) + (cfg.flexFee ?? 25);
    }
    if (isFlexTime(state.date, state.time)) return s.deposit + (cfg.flexFee ?? 25);
    return s.deposit;
  }

  // ---------- Policies ----------
  $("policy-list").innerHTML = cfg.policies.map((p) => `<li>${p}</li>`).join("");

  // ---------- Step 1: services ----------
  // Group duration-variant services (same "group") into one card with a dropdown
  const cards = [];
  for (const s of cfg.services) {
    if (s.group) {
      let g = cards.find((c) => c.group === s.group);
      if (!g) {
        g = { group: s.group, img: s.img || s.id, variants: [] };
        cards.push(g);
      }
      g.variants.push(s);
    } else {
      cards.push({ single: s });
    }
  }

  $("service-list").innerHTML = cards
    .map((c) => {
      if (c.single) {
        const s = c.single;
        return `<div class="service-card" role="button" tabindex="0" data-id="${s.id}">
          <img src="img/${s.img || s.id}.jpg" alt="${s.name}" loading="lazy"
               onerror="this.style.display='none'" />
          <span class="s-body">
            <span class="s-name">${s.name}</span>
            <span class="s-price">${s.price}</span><br/>
            ${s.note ? `<span class="hint">${s.note}</span><br/>` : ""}
            <span class="s-dep">Deposit: $${s.deposit}</span>
          </span>
        </div>`;
      }
      const opts = c.variants
        .map((v, i) => `<option value="${v.id}" ${i === 0 ? "selected" : ""}>${v.label} — ${v.price}</option>`)
        .join("");
      return `<div class="service-card" role="button" tabindex="0" data-group="${c.group}" data-id="${c.variants[0].id}">
        <img src="img/${c.img}.jpg" alt="${c.group}" loading="lazy"
             onerror="this.style.display='none'" />
        <span class="s-body">
          <span class="s-name">${c.group}</span>
          <select class="s-duration" aria-label="${c.group} duration">${opts}</select><br/>
          ${c.variants[0].note ? `<span class="hint">${c.variants[0].note}</span><br/>` : ""}
          <span class="s-dep">Deposit: $${c.variants[0].deposit}</span>
        </span>
      </div>`;
    })
    .join("");

  function selectCard(card) {
    document.querySelectorAll(".service-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    const sel = card.querySelector(".s-duration");
    const id = sel ? sel.value : card.dataset.id;
    state.service = cfg.services.find((s) => s.id === id);
    card.querySelector(".s-dep").textContent = `Deposit: $${state.service.deposit}`;
    $("step-datetime").classList.remove("hidden");
    renderCalendar();
    updatePayStep();
  }

  const goToStep2 = () =>
    $("step-datetime").scrollIntoView({ behavior: "smooth", block: "start" });

  $("service-list").addEventListener("click", (e) => {
    const card = e.target.closest(".service-card");
    if (!card) return;
    selectCard(card);
    if (!e.target.closest("select")) goToStep2();
  });
  $("service-list").addEventListener("change", (e) => {
    const card = e.target.closest(".service-card");
    if (card && e.target.classList.contains("s-duration")) { selectCard(card); goToStep2(); }
  });
  $("service-list").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".service-card");
    if (card && !e.target.closest("select")) { e.preventDefault(); selectCard(card); goToStep2(); }
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
      const open = bookableSlots(dateStr);
      const inRange = dateStr >= todayStr && dateStr <= maxStr;
      const disabled = !inRange || slots.length === 0 || open.length === 0;
      const myStation = state.service ? stationOf(state.service) : null;
      const full = inRange && slots.length > 0 && open.length === 0 &&
        (state.taken[dateStr] || []).some((e) => e.station === myStation);
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
    const slots = bookableSlots(state.date);
    $("slot-date-label").textContent = fmtDate(state.date);
    $("slots").innerHTML = slots.length
      ? slots.map((t) => {
          const flex = isFlexTime(state.date, t);
          return `<button type="button" class="slot-btn ${flex ? "flex-slot" : ""}" data-time="${t}">
            ${fmt12(t)}${flex ? `<span class="flex-tag">flex +$${cfg.flexFee ?? 25}</span>` : ""}</button>`;
        }).join("")
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
    const due = amountDue();
    const label = isSunday(state.date)
      ? `Sunday prepayment (full amount, incl. $${cfg.flexFee ?? 25} flex fee): $${due}`
      : isFlexTime(state.date, state.time)
        ? `Deposit + $${cfg.flexFee ?? 25} flex-time fee: $${due}`
        : `Deposit due now: $${due}`;
    $("summary").innerHTML = `
      <strong>${s.name}</strong> (${s.price})<br/>
      ${state.date ? fmtDate(state.date) : ""} ${state.time ? "at " + fmt12(state.time) : ""}<br/>
      <strong>${label}</strong> <span class="hint">(non-refundable)</span>`;
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
      const word = r.sunday
        ? "Sunday prepayment (full amount)"
        : r.flex
          ? `deposit (includes $${cfg.flexFee ?? 25} flex-time fee)`
          : "deposit";
      finish("Your slot is held!", `
        <p>Your appointment is <strong>held</strong> and will be <strong>confirmed once your
        $${r.depositDue} ${word} is received</strong>.</p>
        <div class="pay-instructions">
          <strong>Send your $${r.depositDue} ${word} to one of:</strong>
          <ul class="copy-list">
            <li><strong>Zelle:</strong> <code>${pm.zelle}</code>
              <button type="button" class="copy-btn" data-copy="${pm.zelle}">Copy</button></li>
            <li><strong>Cash App:</strong> <code>${pm.cashTag ? "$" + pm.cashTag : pm.cashApp}</code>
              <button type="button" class="copy-btn" data-copy="${pm.cashTag ? "$" + pm.cashTag : pm.cashApp}">Copy</button>
              ${pm.cashTag ? `<a class="copy-btn paylink" target="_blank" rel="noopener"
                 href="https://cash.app/$${pm.cashTag}/${r.depositDue}">Pay $${r.depositDue} in Cash App →</a>` : ""}</li>
            <li><strong>PayPal:</strong> <code>${pm.payPalHandle}</code>
              <button type="button" class="copy-btn" data-copy="${pm.payPalHandle}">Copy</button>
              <a class="copy-btn paylink" target="_blank" rel="noopener"
                 href="https://paypal.me/${pm.payPalHandle}/${r.depositDue}">Pay $${r.depositDue} in PayPal →</a></li>
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

  // Copy-to-clipboard for payment handles
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const old = btn.textContent;
    btn.textContent = "✓ Copied";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = old; btn.classList.remove("copied"); }, 1600);
  });

  function finish(title, bodyHtml) {
    $("done-title").textContent = title;
    $("done-body").innerHTML = bodyHtml;
    ["step-service", "step-datetime", "step-details", "step-pay"].forEach((id) =>
      $(id).classList.add("hidden")
    );
    $("step-done").classList.remove("hidden");
    $("step-done").scrollIntoView({ behavior: "smooth" });
  }

  // ---------- Shop: farm & home products ----------
  const products = cfg.products || [];
  if (products.length) {
    $("product-list").innerHTML = products.map((p) => {
      const canBuy = typeof p.price === "number";
      const qty = `<select class="p-qty" aria-label="Quantity" data-id="${p.id}">
        ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">Qty: ${n}</option>`).join("")}</select>`;
      const buy = canBuy
        ? (cfg.paymentsEnabled && cfg.paypalClientId
            ? `${qty}<div class="pp-product" id="pp-${p.id}"></div>`
            : `<span class="hint">Call or text 340.513.2343 to order.</span>`)
        : `<span class="hint">Call or text 340.513.2343 for pricing &amp; to order.</span>`;
      return `<div class="service-card product-card" data-id="${p.id}">
        <img src="img/${p.img || p.id}.jpg" alt="${p.name}" loading="lazy"
             onerror="this.style.display='none'" />
        <span class="s-body">
          <span class="s-name">${p.name}</span>
          <span class="s-price">${canBuy ? `$${p.price}` : "Price TBD — call for price"}</span><br/>
          ${p.note ? `<span class="hint">${p.note}</span><br/>` : ""}
          <span class="p-buy">${buy}</span>
        </span>
      </div>`;
    }).join("");
  }

  function showShopError(msg) {
    const el = $("shop-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }

  function renderProductButtons() {
    for (const p of products) {
      if (typeof p.price !== "number") continue;
      const el = document.getElementById(`pp-${p.id}`);
      if (!el) continue;
      let orderRef = null;
      window.paypal.Buttons({
        style: { height: 32 },
        createOrder: async () => {
          showShopError(null);
          const qty = +(document.querySelector(`.p-qty[data-id="${p.id}"]`)?.value || 1);
          const r = await api("/api/create-product-order", { productId: p.id, quantity: qty });
          orderRef = r.orderRef;
          return r.orderId;
        },
        onApprove: async (data) => {
          try {
            await api("/api/capture-product-order", { orderId: data.orderID, orderRef });
            const card = el.closest(".product-card");
            card.querySelector(".p-buy").innerHTML =
              `<strong>✅ Paid — thank you!</strong><br/><span class="hint">We'll contact you to arrange pickup.</span>`;
          } catch (e) { showShopError(e.message); }
        },
        onError: () =>
          showShopError("Payment didn't go through — you can try again or call 340.513.2343 to order."),
      }).render(el);
    }
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
            await api("/api/capture-payment", { orderId: data.orderID, date: state.date, time: state.time, serviceId: state.service.id });
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
      renderProductButtons();
    };
    document.head.appendChild(script);
  }
})();
