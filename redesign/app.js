(function () {
  const PHONE = "+19043955452";
  const EMAIL = "hello@eluxencarts.com";

  // ?sample shows one clearly-labeled layout example. Never shown on the live site otherwise.
  const SAMPLE = {
    id: "sample", sample: true, status: "available",
    year: 2024, make: "Make", model: "Model", price: 0,
    seats: 4, power: "lithium", voltage: "48V", topSpeed: "— mph", range: "— mi",
    streetLegal: true, lifted: true, color: "Color",
    photos: ["images/hero.webp"],
    highlights: ["Highlight one", "Highlight two", "Highlight three"],
    description: "Sample layout. Your real listing replaces this card."
  };

  const params = new URLSearchParams(location.search);
  const inventory = (window.INVENTORY || []).slice();
  if (params.has("sample") && inventory.length === 0) inventory.push(SAMPLE);

  const grid = document.getElementById("inventory-grid");
  const empty = document.getElementById("inventory-empty");
  const filtersEl = document.getElementById("filters");
  const state = { seats: "all", power: "all", lifted: false, streetLegal: false, sort: "new" };

  const money = (n) => (n ? "$" + n.toLocaleString("en-US") : "Call for price");
  const title = (c) => `${c.year} ${c.make} ${c.model}`;
  const powerLabel = { lithium: "Lithium", "lead-acid": "Lead-acid", gas: "Gas" };
  const statusLabel = { available: "Available", pending: "Sale pending", sold: "Sold" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const textLink = (c) => `sms:${PHONE}?&body=${encodeURIComponent(`Hi Eluxen, is the ${title(c)} (${money(c.price)}) still available?`)}`;

  function specs(c) {
    return [
      ["Seats", c.seats],
      ["Battery", [c.voltage, powerLabel[c.power]].filter(Boolean).join(" ")],
      ["Top speed", c.topSpeed],
      ["Range", c.range],
      ["Street legal", c.streetLegal ? "Yes" : "No"],
      ["Lifted", c.lifted ? "Yes" : "No"],
      ["Battery year", c.batteryYear],
      ["Color", c.color],
      ["Warranty", c.warranty]
    ].filter(([, v]) => v !== undefined && v !== "");
  }

  function card(c) {
    const s = specs(c).slice(0, 4);
    return `
      <article class="card${c.status === "sold" ? " is-sold" : ""}">
        <button class="card__media" data-open="${esc(c.id)}" aria-label="View details for ${esc(title(c))}">
          <img src="${esc(c.photos[0])}" alt="${esc(title(c))}" loading="lazy" />
          <span class="pill pill--${c.status}">${statusLabel[c.status]}</span>
          ${c.photos.length > 1 ? `<span class="card__count">${c.photos.length} photos</span>` : ""}
          ${c.sample ? `<span class="card__sample">Sample layout</span>` : ""}
        </button>
        <div class="card__body">
          <div class="card__top">
            <h3>${esc(title(c))}</h3>
            <p class="card__price">${c.sample ? "$00,000" : money(c.price)}</p>
          </div>
          <dl class="specs">${s.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          ${c.highlights?.length ? `<ul class="tags">${c.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
          <div class="card__ctas">
            <a class="btn btn--primary" href="${textLink(c)}">Text about this cart</a>
            <button class="btn btn--ghost" data-open="${esc(c.id)}">Details</button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    let list = inventory.filter((c) => {
      if (state.seats !== "all" && (state.seats === "6" ? c.seats < 6 : c.seats !== +state.seats)) return false;
      if (state.power !== "all" && c.power !== state.power) return false;
      if (state.lifted && !c.lifted) return false;
      if (state.streetLegal && !c.streetLegal) return false;
      return true;
    });
    if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
    // Sold carts sink to the bottom.
    list.sort((a, b) => (a.status === "sold") - (b.status === "sold"));

    filtersEl.hidden = inventory.length < 2 && !params.has("sample");
    empty.hidden = inventory.length > 0;
    grid.innerHTML = list.length
      ? list.map(card).join("")
      : inventory.length ? `<p class="no-match">No carts match those filters. <button class="linklike" id="reset">Clear filters</button></p>` : "";
  }

  filtersEl.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state[b.dataset.filter] = b.dataset.value;
    filtersEl.querySelectorAll(`.chip[data-filter="${b.dataset.filter}"]`).forEach((x) => x.classList.toggle("is-on", x === b));
    render();
  });
  filtersEl.addEventListener("change", (e) => {
    if (e.target.id === "sort") state.sort = e.target.value;
    else if (e.target.dataset.filter) state[e.target.dataset.filter] = e.target.checked;
    render();
  });
  grid.addEventListener("click", (e) => {
    if (e.target.id === "reset") {
      Object.assign(state, { seats: "all", power: "all", lifted: false, streetLegal: false });
      filtersEl.querySelectorAll(".chip").forEach((x) => x.classList.toggle("is-on", x.dataset.value === "all"));
      filtersEl.querySelectorAll("input[type=checkbox]").forEach((x) => (x.checked = false));
      render();
      return;
    }
    const o = e.target.closest("[data-open]");
    if (o) openDetail(o.dataset.open);
  });

  // Detail dialog
  const dlg = document.getElementById("detail");
  const body = document.getElementById("detail-body");
  function openDetail(id) {
    const c = inventory.find((x) => x.id === id);
    if (!c) return;
    body.innerHTML = `
      <div class="detail__gallery">
        <img id="detail-main" src="${esc(c.photos[0])}" alt="${esc(title(c))}" />
        ${c.photos.length > 1 ? `<div class="detail__thumbs">${c.photos.map((p, i) => `<button data-src="${esc(p)}" class="${i ? "" : "is-on"}"><img src="${esc(p)}" alt="" /></button>`).join("")}</div>` : ""}
      </div>
      <div class="detail__info">
        <span class="pill pill--${c.status}">${statusLabel[c.status]}</span>
        <h2 id="detail-title">${esc(title(c))}</h2>
        <p class="detail__price">${c.sample ? "$00,000" : money(c.price)}</p>
        <p>${esc(c.description || "")}</p>
        <dl class="specs specs--full">${specs(c).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        ${c.highlights?.length ? `<ul class="tags">${c.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        <p class="detail__note">Want it lifted, lithium, or louder? Any upgrade can be installed before delivery. <a href="#upgrades" data-close>See pricing</a></p>
        <div class="card__ctas">
          <a class="btn btn--primary" href="${textLink(c)}">Text about this cart</a>
          <a class="btn btn--ghost" href="tel:${PHONE}">Call</a>
        </div>
      </div>`;
    dlg.showModal();
  }
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest(".detail__close") || e.target.closest("[data-close]")) dlg.close();
    const t = e.target.closest(".detail__thumbs button");
    if (t) {
      document.getElementById("detail-main").src = t.dataset.src;
      dlg.querySelectorAll(".detail__thumbs button").forEach((x) => x.classList.toggle("is-on", x === t));
    }
  });

  // Mobile menu
  const menuBtn = document.querySelector(".menu-btn");
  const nav = document.getElementById("nav");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") { nav.classList.remove("is-open"); menuBtn.setAttribute("aria-expanded", "false"); }
  });

  // Contact form -> prefilled email
  document.getElementById("contact-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const subject = `${f.get("topic")}: ${f.get("name")}`;
    const text = `${f.get("message")}\n\nName: ${f.get("name")}\nReply to: ${f.get("reply")}`;
    location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  });

  document.getElementById("year").textContent = new Date().getFullYear();
  render();
})();
