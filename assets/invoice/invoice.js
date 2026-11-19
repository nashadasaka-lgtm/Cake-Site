/* Shared code for the "your cake order" page: turns order details into the page, and packs them into a link. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => { const v = parseFloat(n); return isFinite(v) ? v : 0; };
  const money = (n) => { const v = Math.round(num(n) * 100) / 100; return "£" + (Number.isInteger(v) ? v.toLocaleString("en-GB") : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
  const toDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return y ? new Date(y, m - 1, d) : null; };
  const fmtDate = (iso) => { const d = toDate(iso); return d ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : ""; };
  const fmtShort = (iso) => { const d = toDate(iso); return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""; };
  const daysUntil = (iso) => { const d = toDate(iso); if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 86400000); };

  // Pack and unpack order details for the link (nothing is stored anywhere).
  function encode(data) {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(str) {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  }

  function totals(d) {
    const total = (d.items || []).reduce((s, i) => s + num(i.a), 0);
    let dep = num(d.dep);
    const split = dep > 0 && dep < total;
    if (!split) dep = 0;
    return { total, dep, bal: total - dep, split };
  }

  // A little drawing of their cake, sized to the order
  function cakeArt(size) {
    const s = String(size || "").toLowerCase();
    if (s.includes("cupcake")) return `<div class="cups">${'<div class="cup"><i></i><b></b></div>'.repeat(3)}</div><div class="plate" style="width:200px"></div>`;
    const w = s.includes("4") ? 92 : s.includes("8") ? 170 : 130;
    const h = s.includes("4") ? 64 : s.includes("8") ? 80 : 72;
    return `<i class="candle"></i><div class="tier" style="width:${w}px;height:${h}px"></div><div class="plate" style="width:${w + 46}px"></div>`;
  }

  function render(d, opts = {}) {
    const { total, dep, bal, split } = totals(d);
    const paid = d.paid || "none";
    const first = (d.c?.name || "").trim().split(/\s+/)[0];
    const days = daysUntil(d.e?.date);
    const isPaid = paid === "full" || (paid === "deposit" && !split);

    // The friendly "what happens next" box
    let title, line, amt;
    if (isPaid) { title = "You're all paid. Thank you!"; line = "Nothing left to pay. See you on cake day!"; amt = money(total); }
    else if (split && paid === "deposit") { title = "Your date is booked!"; line = `Thank you for your deposit. The balance is due${d.balDue ? " by " + fmtDate(d.balDue) : " before cake day"}.`; amt = money(bal); }
    else if (split) { title = "Secure your date"; line = `Pay your 50% deposit${d.depDue ? " by " + fmtDate(d.depDue) : ""} and your date is booked.`; amt = money(dep); }
    else { title = "Secure your date"; line = `Payment due${d.balDue ? " by " + fmtDate(d.balDue) : " to book your date"}.`; amt = money(total); }

    const cakeDayText = d.e?.date ? (days > 1 ? `${days} days to go` : days === 1 ? "Tomorrow!" : days === 0 ? "Today!" : fmtShort(d.e.date)) : "Date to confirm";
    const steps = [{ t: "Enquiry", s: "Received", st: "done" }];
    if (split) {
      steps.push({ t: "Deposit", s: paid !== "none" ? "Paid" : `${money(dep)}${d.depDue ? ", " + fmtShort(d.depDue) : ""}`, st: paid !== "none" ? "done" : "now" });
      steps.push({ t: "Balance", s: paid === "full" ? "Paid" : `${money(bal)}${d.balDue ? ", " + fmtShort(d.balDue) : ""}`, st: paid === "full" ? "done" : paid === "deposit" ? "now" : "" });
    } else {
      steps.push({ t: "Payment", s: isPaid ? "Paid" : money(total), st: isPaid ? "done" : "now" });
    }
    steps.push({ t: "Cake day", s: cakeDayText, st: isPaid ? "now" : "" });
    const icon = (s, i) => s.st === "done" ? "&#10003;" : s.t === "Cake day" ? "&#127874;" : i + 1;

    const method = d.e?.method === "delivery" ? "Delivery" : "Collection";
    const chip = (label, v) => (v ? `<span class="chip"><small>${label}</small>${esc(v)}</span>` : "");
    const chips = [chip("Occasion", d.e?.occ), chip("Size", d.k?.size), chip("Flavour", d.k?.flavour)].join("");
    const row = (label, value) => (value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : "");
    const detailRows = [
      row("Design", d.k?.design),
      row("On the cake", d.k?.msg),
      row(method, [fmtDate(d.e?.date), d.e?.time].filter(Boolean).join(", ")),
      d.e?.method === "delivery" ? row("Address", d.e?.addr) : ""
    ].join("");
    const youRows = [row("Name", d.c?.name), row("Phone", d.c?.phone), row("Email", d.c?.email)].join("");

    const items = (d.items || []).filter((i) => i.t || num(i.a));
    const itemRows = items.map((i) => `<tr><td>${esc(i.t)}</td><td>${money(i.a)}</td></tr>`).join("");
    const subRows = split
      ? `<tr class="sub ${paid !== "none" ? "done" : ""}"><td>50% deposit${paid !== "none" ? " (paid)" : ""}</td><td>${money(dep)}</td></tr>
         <tr class="sub ${paid === "full" ? "done" : ""}"><td>Balance${paid === "full" ? " (paid)" : ""}</td><td>${money(bal)}</td></tr>`
      : "";

    const b = d.bank || {};
    const bankRow = (label, value) => `<div class="bank-row"><div><small>${label}</small><b>${value ? esc(value) : '<span class="missing">Not added yet</span>'}</b></div>${value ? `<button class="copy" data-copy="${esc(value)}" aria-label="Copy ${label}">Copy</button>` : ""}</div>`;
    const flakes = [[8, 18, 10], [22, 64, 8], [88, 24, 12], [72, 70, 9], [48, 10, 7], [94, 58, 8]].map(([x, y, z]) => `<span class="flake" style="left:${x}%;top:${y}%;font-size:${z}px">&#10052;</span>`).join("");
    const nowD = new Date(); const xmas = nowD.getMonth() === 10 || (nowD.getMonth() === 11 && nowD.getDate() <= 26);

    return `
<article class="inv">
  <header class="hero">
    ${xmas ? flakes : ""}
    <div class="hero-top">
      <img src="${esc(opts.logo || "assets/brand/wordmark-cream.png")}" alt="Cakes by Nashada Jones">
      <span class="ref">Order ${esc(d.n || "")}</span>
    </div>
    <p class="hi">${first ? `Hi ${esc(first)}, let's make your cake!` : "Let's make your cake!"}</p>
    <p class="sub">Thank you for your order. Here's everything in one place.</p>
    ${d.e?.date ? `<div class="countdown">${days > 0 ? `<b>${days}</b> day${days === 1 ? "" : "s"} to cake day` : esc(cakeDayText)}</div>` : ""}
    <div class="art" aria-hidden="true">${cakeArt(d.k?.size)}</div>
  </header>

  <div class="inv-body">
    <section class="next ${isPaid ? "paid" : ""}">
      <div class="next-main">
        <div><p class="eyebrow">What happens next</p><h2>${esc(title)}</h2><p>${esc(line)}</p></div>
        <div class="amt">${isPaid ? "Paid" : amt}</div>
      </div>
      <ol class="journey" style="--n:${steps.length}">${steps.map((s, i) => `<li class="${s.st}"><span class="dot">${icon(s, i)}</span><b>${s.t}</b><span>${esc(s.s)}</span></li>`).join("")}</ol>
    </section>

    <section class="inv-sec">
      <p class="eyebrow">Your cake</p>
      <p class="cake-name">${esc(d.k?.title || "Your cake")}</p>
      ${chips ? `<div class="chips">${chips}</div>` : ""}
      ${detailRows ? `<dl class="dl">${detailRows}</dl>` : ""}
    </section>

    ${isPaid ? "" : `
    <section class="inv-sec">
      <h2>How to <em>pay</em></h2>
      <div class="bank">
        ${bankRow("Account name", b.name)}
        ${bankRow("Sort code", b.sort)}
        ${bankRow("Account number", b.acc)}
        ${b.bank ? bankRow("Bank", b.bank) : ""}
        ${bankRow("Payment reference", d.n || "")}
        <p class="hint">Please pay by bank transfer and use the reference above, so I can match your payment. Payment can't be made on this page.</p>
      </div>
    </section>`}

    <div class="two">
      <section class="inv-sec">
        <h2>The <em>price</em></h2>
        <table class="prices"><tbody>${itemRows || '<tr><td class="missing">Prices to follow</td><td></td></tr>'}
          <tr class="total"><td>Total</td><td>${money(total)}</td></tr>${subRows}</tbody></table>
      </section>
      <section class="inv-sec">
        <h2>Your <em>details</em></h2>
        <dl class="dl">${youRows || '<dt>Name</dt><dd class="missing">Not added yet</dd>'}</dl>
      </section>
    </div>

    ${d.notes ? `<p class="inv-notes">${esc(d.notes)}</p>` : ""}
  </div>

  <footer class="inv-foot">
    <img src="${esc(opts.logo || "assets/brand/wordmark-cream.png")}" alt="">
    <div class="contact">
      <span>Questions? Just message me.</span>
      <a href="https://www.instagram.com/cakesbynashadajones" target="_blank" rel="noopener">@cakesbynashadajones</a>
      <a href="mailto:njcakeacademy@outlook.com">njcakeacademy@outlook.com</a>
    </div>
    ${opts.printButton ? '<button class="copy no-print" data-print>Save a copy</button>' : ""}
  </footer>
</article>`;
  }

  // Copy buttons and the save button
  function bind(root) {
    root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-copy]");
      if (btn) {
        const text = btn.dataset.copy;
        const done = () => { btn.textContent = "Copied"; btn.classList.add("ok"); setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("ok"); }, 1800); };
        const fallback = () => { const r = document.createRange(); r.selectNodeContents(btn.previousElementSibling.querySelector("b")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Selected"; };
        try { navigator.clipboard.writeText(text).then(done, fallback); } catch (_) { fallback(); }
      }
      if (e.target.closest("[data-print]")) window.print();
    });
  }

  window.NJInvoice = { render, bind, encode, decode, money, totals, fmtDate };
})();
