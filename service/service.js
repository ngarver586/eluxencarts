(function () {
  const PHONE = "+19043955452";
  const EMAIL = "hello@eluxencarts.com";
  // Same Formspree form as the rest of the site. Empty = fall back to a prefilled email.
  const FORMSPREE_ID = "xaenbayy";

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  // Mobile menu
  const nav = document.getElementById("nav");
  const menuBtn = document.querySelector(".menu-btn");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") { nav.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); }
  });

  const form = document.getElementById("service-form");
  const status = document.getElementById("svc-status");
  const estimate = document.getElementById("svc-estimate");
  const detailLevel = document.getElementById("detail-level");
  const dateInput = document.getElementById("svc-date");

  // No booking in the past
  const today = new Date();
  dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  // "Join the plan" and other deep links preselect a service
  document.querySelectorAll("[data-service]").forEach((a) => {
    a.addEventListener("click", () => {
      const r = form.querySelector(`input[name=service][value="${a.dataset.service}"]`);
      if (r) { r.checked = true; update(); }
    });
  });
  const hash = new URLSearchParams(location.search).get("service");
  if (hash) {
    const r = form.querySelector(`input[name=service][value="${hash}"]`);
    if (r) r.checked = true;
  }

  const val = (name) => (form.querySelector(`[name="${name}"]:checked`) || {}).value || "";
  const field = (name) => (form.elements[name] && form.elements[name].value) || "";

  function priceFor() {
    const svc = val("service");
    const gas = val("power") === "Gas";
    const big = Number(field("seats")) >= 6;
    const show = val("detail_level") === "Show";
    const detail = show ? (big ? 279 : 249) : (big ? 179 : 149);
    const maint = gas ? 219 : 189;
    const pickup = field("area") === "Nocatee" ? 150 : 250;
    const own = form.elements.bought_from_eluxen.checked;
    switch (svc) {
      case "Maintenance": return `Maintenance: $${maint}, done at your home. No trip fee.`;
      case "Detailing": return `${show ? "Show" : "Signature"} detail: $${detail}, done at your home. No trip fee.`;
      case "Maintenance + detailing": return `Maintenance $${maint} + ${show ? "Show" : "Signature"} detail $${detail}, one visit at your home.`;
      case "Annual Care Plan": return `Annual Care Plan: $${gas ? 399 : 349} per year, two visits scheduled at signup.`;
      case "Repair": return own || !field("area")
        ? `Repair: $99 diagnostic, credited toward the repair.${own ? " Pickup and return included for Eluxen carts." : ""}`
        : `Repair: $99 diagnostic, credited toward the repair. Pickup and return $${pickup}, included on repairs over $1,500.`;
      case "Customization": return "Customization: quoted per build. For a full spec, the custom build page walks you through it.";
      default: return "";
    }
  }

  function update() {
    const svc = val("service");
    detailLevel.hidden = !/Detailing|detailing/.test(svc);
    const txt = priceFor();
    estimate.hidden = !txt;
    estimate.textContent = txt ? `${txt} Tax not included.` : "";
  }
  form.addEventListener("change", update);
  update();

  const showStatus = (kind, html) => {
    status.className = `form__status form__status--${kind}`;
    status.innerHTML = html;
    status.hidden = false;
  };

  function validate() {
    let ok = true;
    const svcGroup = form.querySelector("[aria-label=Service]");
    svcGroup.classList.toggle("is-invalid", !val("service"));
    if (!val("service")) ok = false;
    ["cart", "area", "name", "phone"].forEach((n) => {
      const el = form.elements[n];
      const bad = !el.value.trim();
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad) ok = false;
    });
    return ok;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get("_gotcha")) return;
    if (!validate()) {
      showStatus("err", "<strong>A few things are missing.</strong> Pick a service and fill in your cart, neighborhood, name and phone.");
      return;
    }
    const subject = `Service request: ${f.get("service")} · ${f.get("name")}`;
    f.set("topic", "Service request");
    f.set("estimate", priceFor());
    if (!f.get("bought_from_eluxen")) f.set("bought_from_eluxen", "No");

    if (!FORMSPREE_ID) {
      const lines = [...f.entries()].filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k}: ${v}`).join("\n");
      location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`;
      return;
    }
    f.set("_subject", subject);
    if (String(f.get("email")).includes("@")) f.set("_replyto", f.get("email"));

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Sending…";
    status.hidden = true;
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, { method: "POST", body: f, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      update();
      showStatus("ok", `<strong>Got it, ${esc(f.get("name"))}.</strong> I'll text ${esc(f.get("phone"))} to confirm a time. Same day in Nocatee? Text <a href="sms:${PHONE}">(904) 395-5452</a> to make sure it's seen.`);
    } catch (err) {
      showStatus("err", `<strong>That didn't send.</strong> Please text or call <a href="sms:${PHONE}">(904) 395-5452</a>, or email <a href="mailto:${EMAIL}">${EMAIL}</a>.`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Request service";
    }
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
