(function () {
  const PHONE = "+19043955452";
  const EMAIL = "hello@eluxencarts.com";

  const inventory = (window.INVENTORY || []).slice();

  const grid = document.getElementById("inventory-grid");
  const empty = document.getElementById("inventory-empty");
  const filtersEl = document.getElementById("filters");
  const state = { seats: "all", power: "all", lifted: false, streetLegal: false, sort: "new" };

  const money = (n) => (n ? "$" + n.toLocaleString("en-US") : "Call for price");
  const title = (c) => c.name || `${c.year} ${c.make} ${c.model}`;
  const fullName = (c) => `${c.year} ${c.make} ${c.model}`;
  const powerLabel = { lithium: "Lithium", "lead-acid": "Lead-acid", gas: "Gas" };
  const statusLabel = { available: "Available", pending: "Sale pending", sold: "Sold" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const mailLink = (c) => {
    const subject = c.inquirySubject || `Inquiry: ${fullName(c)} ${money(c.price)}`;
    const body = `Hi Eluxen Carts,\n\nI'm interested in the ${fullName(c)} listed at ${money(c.price)}. Is it still available?\n\nThanks!`;
    return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const has = (v) => v !== undefined && v !== null && v !== "";

  function specs(c, full) {
    return [
      ["Seats", c.seats],
      ["Battery", [c.voltage, powerLabel[c.power]].filter(Boolean).join(" ")],
      ["Top speed", c.topSpeed],
      ["Battery pack", full ? c.batteryDetail : undefined],
      ["Miles", has(c.miles) ? c.miles.toLocaleString("en-US") : undefined],
      ["Range", c.range],
      ["Lifted", has(c.lifted) ? (c.lifted ? "Yes" : "No") : undefined],
      ["Street legal", has(c.streetLegal) ? (c.streetLegal ? "Yes" : "No") : undefined],
      ["Battery year", c.batteryYear],
      ["Color", c.color],
      ["Warranty", c.warranty],
      ["Location", c.location]
    ].filter(([, v]) => has(v));
  }

  const ctas = (c, withEmail) => `
    <div class="card__ctas">
      <a class="btn btn--primary" href="tel:${PHONE}">Schedule a walkthrough</a>
      ${c.reportUrl ? `<a class="btn btn--ghost" href="${esc(c.reportUrl)}" target="_blank" rel="noopener">View the Cart Report ↗</a>` : ""}
    </div>
    ${withEmail ? `<a class="detail__email" href="${mailLink(c)}">Or email about this cart</a>` : ""}`;

  function card(c) {
    const s = specs(c).slice(0, 4);
    const tags = c.highlights || [];
    const shown = tags.slice(0, 4);
    return `
      <article class="card${c.status === "sold" ? " is-sold" : ""}">
        <button class="card__media" data-open="${esc(c.id)}" aria-label="View photos and details for ${esc(title(c))}">
          <img src="${esc(c.photos[0])}" alt="${esc(fullName(c))}" loading="lazy" />
          <span class="pill pill--${c.status}">${statusLabel[c.status]}</span>
          ${c.photos.length > 1 ? `<span class="card__count">${c.photos.length} photos</span>` : ""}
        </button>
        <div class="card__body">
          <div class="card__top">
            <div>
              <p class="card__meta">${esc(c.year)}${c.location ? ` · ${esc(c.location)}` : ""}</p>
              <h3>${esc(title(c))}</h3>
            </div>
            <p class="card__price">${money(c.price)}</p>
          </div>
          <dl class="specs">${s.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
          ${c.summary ? `<p class="card__summary">${esc(c.summary)}</p>` : ""}
          ${shown.length ? `<ul class="tags">${shown.map((h) => `<li>${esc(h)}</li>`).join("")}${tags.length > shown.length ? `<li class="tags__more"><button class="linklike" data-open="${esc(c.id)}">+${tags.length - shown.length} more</button></li>` : ""}</ul>` : ""}
          ${ctas(c, false)}
          <button class="card__details linklike" data-open="${esc(c.id)}">See all photos &amp; full details</button>
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

    filtersEl.hidden = inventory.length < 2;
    empty.hidden = inventory.length > 0;
    grid.classList.toggle("is-single", list.length === 1);
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
    const desc = Array.isArray(c.description) ? c.description : c.description ? [c.description] : c.summary ? [c.summary] : [];
    body.innerHTML = `
      <div class="detail__gallery">
        <img id="detail-main" src="${esc(c.photos[0])}" alt="${esc(fullName(c))}" />
        ${c.photos.length > 1 ? `<div class="detail__thumbs">${c.photos.map((p, i) => `<button data-src="${esc(p)}" class="${i ? "" : "is-on"}" aria-label="Photo ${i + 1}"><img src="${esc(p)}" alt="" /></button>`).join("")}</div>` : ""}
      </div>
      <div class="detail__info">
        <span class="pill pill--${c.status}">${statusLabel[c.status]}</span>
        <p class="card__meta">${esc(fullName(c))}${c.location ? ` · ${esc(c.location)}` : ""}</p>
        <h2 id="detail-title">${esc(title(c))}</h2>
        <p class="detail__price">${money(c.price)}</p>
        <dl class="specs specs--full">${specs(c, true).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
        ${c.highlights?.length ? `<ul class="tags">${c.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        <div class="detail__desc">${desc.map((d) => `<p>${esc(d)}</p>`).join("")}</div>
        <p class="detail__note">Want it louder, brighter, or a different look? Upgrades can be installed before delivery. <a href="#upgrades" data-close>See pricing</a></p>
        ${ctas(c, true)}
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
