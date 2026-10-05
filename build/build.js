(function () {
  // Same Formspree form as the contact form on the home page.
  const FORMSPREE_ID = "xaenbayy";
  const DRAFT_KEY = "eluxen-build-draft";

  const form = document.getElementById("build-form");
  const statusEl = document.getElementById("build-status");
  const sendBtn = document.getElementById("send");

  const ROWS = [
    ["Starting point", ["start", "owncart", "brand"]],
    ["Uses", ["use"]],
    ["Longest day", ["range"]],
    ["Seats", ["seats"]],
    ["Stance", ["stance"]],
    ["Wheels", ["wheel", "wheelfinish"]],
    ["Body color", ["body"]],
    ["Seats and floor", ["seatstyle", "seatcolor", "floor"]],
    ["Lighting", ["lights"]],
    ["Sound and tech", ["tech"]],
    ["Add-ons", ["addons"]],
    ["Battery and speed", ["battery", "speed"]],
    ["Budget", ["budget"]],
    ["Timeline", ["timeline"]],
    ["Name", ["name"]],
    ["Phone", ["phone"]],
    ["Email", ["email"]],
    ["Neighborhood", ["hood"]],
    ["Contact by", ["contact"]],
    ["Notes", ["notes"]],
  ];
  const PROGRESS = ["start", "use", "seats", "stance", "body", "lights", "tech", "battery", "budget", "name"];

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

  function vals(name) {
    const els = Array.from(form.querySelectorAll(`[name="${name}"]`));
    if (!els.length) return [];
    if (els[0].type === "checkbox" || els[0].type === "radio") return els.filter((e) => e.checked).map((e) => e.value);
    const v = els[0].value.trim();
    return v ? [v] : [];
  }

  function sheetLines() {
    return ROWS.map(([label, names]) => [label, names.flatMap(vals)]);
  }

  function render() {
    const spec = document.getElementById("spec");
    spec.textContent = "";
    const text = ["Eluxen Carts custom build sheet", ""];
    sheetLines().forEach(([label, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      if (v.length) { dd.textContent = v.join(", "); text.push(`${label}: ${v.join(", ")}`); }
      else { dd.textContent = "Not answered"; dd.className = "is-empty"; }
      spec.append(dt, dd);
    });
    document.getElementById("out").value = text.join("\n");
    const done = PROGRESS.filter((n) => vals(n).length).length;
    document.getElementById("pbar").style.width = `${(done / PROGRESS.length) * 100}%`;
    document.getElementById("ptxt").textContent = `${done} of ${PROGRESS.length} answered`;
  }

  function saveDraft() {
    try {
      const d = {};
      Array.from(form.elements).forEach((e) => {
        if (!e.name || e.name === "_gotcha") return;
        if (e.type === "checkbox" || e.type === "radio") { if (e.checked) (d[e.name] = d[e.name] || []).push(e.value); }
        else d[e.name] = e.value;
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (_) {}
  }

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!d) return;
      Array.from(form.elements).forEach((e) => {
        if (!e.name || !(e.name in d)) return;
        if (e.type === "checkbox" || e.type === "radio") e.checked = d[e.name].includes(e.value);
        else e.value = d[e.name];
      });
    } catch (_) {}
  }

  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

  function showStatus(kind, html) {
    statusEl.className = `form__status form__status--${kind}`;
    statusEl.innerHTML = html;
    statusEl.hidden = false;
  }

  form.addEventListener("input", () => { render(); saveDraft(); });
  form.addEventListener("change", () => { render(); saveDraft(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.querySelector('[name="_gotcha"]').value) return;

    const nameEl = document.getElementById("name");
    const phone = vals("phone")[0] || "";
    const email = vals("email")[0] || "";
    const name = vals("name")[0] || "";
    nameEl.setAttribute("aria-invalid", name ? "false" : "true");
    if (!name || (!phone && !email)) {
      showStatus("err", "Add your name and a phone number or email so we can send your quote.");
      (name ? document.getElementById("phone") : nameEl).focus();
      return;
    }

    const body = new FormData();
    body.set("_subject", `Custom build: ${name}`);
    if (email) body.set("_replyto", email);
    body.set("topic", "Custom build questionnaire");
    sheetLines().forEach(([label, v]) => body.set(label, v.length ? v.join(", ") : "-"));
    body.set("Build sheet", document.getElementById("out").value);

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    statusEl.hidden = true;
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, { method: "POST", body, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearDraft();
      showStatus("ok", `<strong>Thanks, ${esc(name)}. Your build is on its way.</strong> Nick will reply with a quote within a day at ${esc(phone || email)}.`);
      sendBtn.textContent = "Sent";
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send my build";
      showStatus("err", `That didn't go through. Tap <strong>Copy build sheet</strong> and text it to <a href="sms:+19043955452">(904) 395-5452</a>, or try again.`);
    }
  });

  document.getElementById("copy").addEventListener("click", () => {
    const ta = document.getElementById("out");
    const ok = () => showStatus("ok", `Copied. Paste it in a text to <a href="sms:+19043955452">(904) 395-5452</a>.`);
    const fallback = () => {
      ta.removeAttribute("aria-hidden");
      ta.style.cssText = "position:fixed;left:0;top:0;opacity:0";
      ta.select();
      try { document.execCommand("copy"); ok(); } catch (_) { showStatus("err", "Couldn't copy. Select the build sheet above and copy it."); }
      ta.style.cssText = "";
      ta.setAttribute("aria-hidden", "true");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, fallback);
    else fallback();
  });

  document.getElementById("reset").addEventListener("click", () => {
    form.reset();
    clearDraft();
    render();
    sendBtn.disabled = false;
    sendBtn.textContent = "Send my build";
    statusEl.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Header menu (same behavior as the home page)
  const menuBtn = document.querySelector(".menu-btn");
  const nav = document.getElementById("nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", open);
  });

  document.getElementById("year").textContent = new Date().getFullYear();

  loadDraft();
  render();
})();
