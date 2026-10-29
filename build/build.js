(function () {
  // Same Formspree form as the contact form on the home page.
  const FORMSPREE_ID = "xaenbayy";
  const DRAFT_KEY = "eluxen-build-draft";

  const form = document.getElementById("build-form");
  const statusEl = document.getElementById("build-status");
  const sendBtn = document.getElementById("send");

  const ROWS = [
    ["Starting point", ["start", "owncart", "brand", "power"]],
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
    ["Battery", ["battery"]],
    ["Budget", ["budget"]],
    ["Timeline", ["timeline"]],
    ["Found us via", ["source"]],
    ["Name", ["name"]],
    ["Phone", ["phone"]],
    ["Email", ["email"]],
    ["Neighborhood", ["hood"]],
    ["Contact by", ["contact"]],
    ["Notes", ["notes"]],
  ];
  const PROGRESS = ["start", "use", "seats", "name", "stance", "body", "lights", "tech", "addons", "battery", "budget"];

  // ---------------------------------------------------------------------------
  // Running estimate. Every value is a [low, high] planning range in dollars,
  // aligned with the published "from" prices on the home page Upgrades section
  // (soundbar from $349, LED kit from $449, lift + wheels + tires from $799,
  // full sound from $899, lithium from $1,899). Edit here, not in the HTML.
  // ---------------------------------------------------------------------------
  const BASE = {
    // Eluxen sources the cart. Ranges by seating.
    source: { "2 seats": [3500, 5000], "4 seats (2 + rear flip seat)": [4500, 6500], "4 seats forward-facing": [5500, 7500], "6 seats": [6500, 9000], _default: [4500, 8000] },
    // Eluxen inventory cart, already prepped. Matches current list prices.
    inventory: [8500, 9900],
  };
  const PRICE = {
    stance: {
      "Lifted, street tires": ["Lift kit, wheels and street tires", 800, 1800],
      "Lifted, all-terrain tires and brush guard": ["Lift kit, wheels, all-terrain tires and brush guard", 1000, 2200],
    },
    wheel: { "15 inch": ["15\" wheel upcharge", 200, 400] },
    wheelfinish: {
      "Chrome or silver": ["Chrome / silver wheel finish", 100, 250],
      "Bronze or gunmetal": ["Bronze / gunmetal wheel finish", 100, 250],
    },
    body: { "Custom color (see notes)": ["Custom body color (paint or wrap)", 1200, 2500] },
    seatstyle: {
      "New covers, solid color": ["New seat covers, solid", 350, 600],
      "Two-tone custom upholstery": ["Two-tone custom upholstery", 600, 1100],
      "Captain's chairs up front": ["Captain's chairs", 900, 1600],
    },
    floor: {
      "Diamond plate": ["Diamond-plate floor", 250, 450],
      "Marine-style SeaDek": ["Marine-style foam floor", 450, 800],
    },
    lights: {
      "LED headlights and taillights": ["LED headlight and taillight kit", 449, 650],
      "Turn signals and hazards": ["Turn signals and hazards", 150, 300],
      "Color halo headlights": ["Color halo headlights", 200, 400],
      "Underglow": ["Underglow", 150, 350],
      "Roof light bar": ["Roof light bar", 200, 450],
      "Under-roof dome lights": ["Under-roof dome lights", 100, 250],
    },
    tech: {
      "Bluetooth soundbar": ["Bluetooth soundbar", 349, 600],
      "Touchscreen with CarPlay and Android Auto": ["CarPlay / Android Auto screen", 700, 1200],
      "Dash speakers and subwoofer": ["Speakers, amp and sub", 899, 1600],
      "USB-C fast charging": ["USB-C charging", 60, 120],
      "Live battery display": ["Battery display", 80, 180],
      "Backup camera": ["Backup camera", 150, 350],
      "GPS tracker": ["GPS tracker", 100, 250],
    },
    addons: {
      "Extended roof": ["Extended roof", 450, 900],
      "Folding windshield": ["Folding windshield", 150, 350],
      "Rain enclosure": ["Rain enclosure", 250, 600],
      "Side mirrors": ["Side mirrors", 40, 120],
      "Seat belts": ["Seat belts", 80, 200],
      "Grab bars": ["Grab bars", 80, 200],
      "Brush guard": ["Brush guard", 150, 350],
      "Fender flares": ["Fender flares", 120, 300],
      "Running boards": ["Running boards", 150, 350],
      "Cooler and rack": ["Cooler and rack", 150, 400],
      "Beach and fishing rod holders": ["Beach and rod holders", 80, 200],
      "Storage cover": ["Storage cover", 100, 250],
    },
  };
  const LITHIUM = { "6 seats": [2400, 3800], _default: [1899, 3200] };

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

  // Which branch of Step 1 are we on?
  function startMode() {
    const s = vals("start")[0] || "";
    if (s.indexOf("own") !== -1) return "own";
    if (s.indexOf("inventory") !== -1) return "inventory";
    if (s) return "source";
    return "";
  }

  function estimate() {
    const lines = [];
    let lo = 0, hi = 0;
    const add = (label, l, h) => { lines.push([label, l, h]); lo += l; hi += h; };
    const mode = startMode();
    const seats = vals("seats")[0] || "";
    const gas = (vals("power")[0] || "") === "Gas";

    if (mode === "source") { const r = BASE.source[seats] || BASE.source._default; add(seats ? `Base cart, ${seats.toLowerCase()}` : "Base cart", r[0], r[1]); }
    else if (mode === "inventory") add("Eluxen inventory cart", BASE.inventory[0], BASE.inventory[1]);

    const stance = vals("stance")[0];
    const atStance = stance === "Lifted, all-terrain tires and brush guard";
    Object.keys(PRICE).forEach((group) => {
      vals(group).forEach((v) => {
        const p = PRICE[group][v];
        if (!p) return;
        // Avoid double counting: brush guard rides with the all-terrain stance, camera comes with the screen.
        if (group === "addons" && v === "Brush guard" && atStance) return;
        if (group === "tech" && v === "Backup camera" && vals("tech").indexOf("Touchscreen with CarPlay and Android Auto") !== -1) return;
        add(p[0], p[1], p[2]);
      });
    });

    if (!gas) {
      const b = vals("battery")[0] || "";
      if (b.indexOf("Lithium") === 0 || b === "Recommend for me") {
        const r = LITHIUM[seats] || LITHIUM._default;
        add(b === "Recommend for me" ? "Lithium pack, if recommended" : "Lithium pack and charger", r[0], r[1]);
      }
    }
    return { lines, lo, hi, started: mode !== "" };
  }

  function fmt(n, exact) { return "$" + (exact ? n : Math.round(n / 50) * 50).toLocaleString("en-US"); }

  function renderEstimate() {
    const est = estimate();
    const box = document.getElementById("est");
    const totalEl = document.getElementById("est-total");
    const list = document.getElementById("est-lines");
    const hint = document.getElementById("budget-hint");
    const ptxt = document.getElementById("ptxt");

    if (!est.started || !est.lines.length) {
      box.hidden = true;
      hint.hidden = true;
      return "";
    }
    box.hidden = false;
    totalEl.textContent = `${fmt(est.lo)} to ${fmt(est.hi)}`;
    list.textContent = "";
    est.lines.forEach(([label, l, h]) => {
      const li = document.createElement("li");
      const a = document.createElement("span"); a.textContent = label;
      const b = document.createElement("span"); b.textContent = `${fmt(l, true)} to ${fmt(h, true)}`;
      li.append(a, b);
      list.append(li);
    });
    hint.hidden = false;
    hint.textContent = `Your picks so far come to about ${fmt(est.lo)} to ${fmt(est.hi)} all-in.`;
    return `${fmt(est.lo)} to ${fmt(est.hi)}`;
  }

  // Show/hide fields that depend on an earlier answer.
  // data-show="start:own|source|inventory" shows only in that branch; data-hide="power:Gas" hides on that value.
  function applyBranches() {
    const mode = startMode();
    form.querySelectorAll("[data-show]").forEach((el) => {
      const [, want] = el.getAttribute("data-show").split(":");
      el.hidden = mode !== "" && mode !== want;
    });
    const gas = (vals("power")[0] || "") === "Gas";
    form.querySelectorAll("[data-hide]").forEach((el) => { el.hidden = gas; });

    // Budget: own-cart builds are upgrades-only by definition.
    const upgradesOnly = form.querySelector('[name="budget"][value="Upgrades only, own cart"]');
    if (upgradesOnly) upgradesOnly.closest("label").hidden = mode === "source" || mode === "inventory";
  }

  function render() {
    applyBranches();
    const estText = renderEstimate();
    const spec = document.getElementById("spec");
    spec.textContent = "";
    const text = ["Eluxen Carts custom build sheet", ""];
    if (estText) text.push(`Estimated all-in: ${estText}`, "");
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
    document.getElementById("ptxt").textContent = estText ? `${done} of ${PROGRESS.length} · est. ${estText}` : `${done} of ${PROGRESS.length} answered`;
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
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus("err", "That email doesn't look right. Fix it, or clear it and we'll text you instead.");
      document.getElementById("email").focus();
      return;
    }
    if (!name || (!phone && !email)) {
      showStatus("err", "Add your name and a phone number or email so we can send your quote.");
      (name ? document.getElementById("phone") : nameEl).focus();
      document.getElementById(name ? "phone" : "name").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const est = estimate();
    const estText = est.lines.length ? `${fmt(est.lo)} to ${fmt(est.hi)}` : "-";
    const body = new FormData();
    body.set("_subject", `Custom build: ${name}${phone ? " · " + phone : ""} · est. ${estText}`);
    if (email) body.set("_replyto", email);
    body.set("topic", "Custom build questionnaire");
    body.set("Estimated all-in", estText);
    // Formspree validates any field named "email", so leave it out when it's blank.
    sheetLines().forEach(([label, v]) => {
      if (label === "Email" && !v.length) return;
      body.set(label, v.length ? v.join(", ") : "-");
    });
    body.set("Build sheet", document.getElementById("out").value);
    body.set("Page", location.href);

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    statusEl.hidden = true;
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, { method: "POST", body, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearDraft();
      if (window.gtag) gtag("event", "build_submit", { event_category: "lead", event_label: estText });
      showStatus("ok", `<strong>Thanks, ${esc(name)}. Your build is on its way.</strong> Nick will reply with a written quote within a day at ${esc(phone || email)}. Want to speed it up? Text a photo of any cart you love to <a href="sms:+19043955452">(904) 395-5452</a>.`);
      sendBtn.textContent = "Sent";
      document.getElementById("summary").scrollIntoView({ behavior: "smooth", block: "start" });
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
