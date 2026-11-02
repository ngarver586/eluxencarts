// Shared script for the thin landing pages (/maintenance/, /detailing/, /sell/).
(function () {
  const PHONE = "+19043955452";
  const EMAIL = "hello@eluxencarts.com";
  const FORMSPREE_ID = "xaenbayy";
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  // Mobile menu
  const nav = document.getElementById("nav");
  const menuBtn = document.querySelector(".menu-btn");
  if (nav && menuBtn) {
    menuBtn.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", open);
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") { nav.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); }
    });
  }

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Sell-your-cart form -> Formspree
  const form = document.getElementById("sell-form");
  if (!form) return;
  const status = document.getElementById("sell-status");
  const showStatus = (kind, html) => {
    status.className = `form__status form__status--${kind}`;
    status.innerHTML = html;
    status.hidden = false;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get("_gotcha")) return;
    let ok = true;
    ["cart", "name", "phone"].forEach((n) => {
      const el = form.elements[n];
      const bad = !el.value.trim();
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad) ok = false;
    });
    if (!ok) {
      showStatus("err", "<strong>A few things are missing.</strong> Fill in your cart, name and phone.");
      return;
    }
    const subject = `Sell inquiry: ${f.get("cart")} · ${f.get("name")}`;
    f.set("topic", "Selling my cart");
    f.set("_subject", subject);
    const email = String(f.get("email") || "").trim();
    if (!email) f.delete("email");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus("err", "<strong>That email doesn't look right.</strong> Fix it, or clear it and we'll text you.");
      form.elements.email.focus();
      return;
    }
    else f.set("_replyto", email);

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Sending…";
    status.hidden = true;
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, { method: "POST", body: f, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      showStatus("ok", `<strong>Got it, ${esc(f.get("name"))}.</strong> I'll text ${esc(f.get("phone"))} with an offer or a couple of questions. Want it faster? Text photos to <a href="sms:${PHONE}">(904) 395-5452</a>.`);
    } catch (err) {
      showStatus("err", `<strong>That didn't send.</strong> Please text or call <a href="sms:${PHONE}">(904) 395-5452</a>, or email <a href="mailto:${EMAIL}">${EMAIL}</a>.`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Get my offer";
    }
  });
})();
