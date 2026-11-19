/* Shared invoice code: turns invoice details into the invoice page, and packs them into a link. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => { const v = parseFloat(n); return isFinite(v) ? v : 0; };
  const money = (n) => { const v = Math.round(num(n) * 100) / 100; return "£" + (Number.isInteger(v) ? v.toLocaleString("en-GB") : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
  const toDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return y ? new Date(y, m - 1, d) : null; };
  const fmtDate = (iso) => { const d = toDate(iso); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : ""; };
  const fmtShort = (iso) => { const d = toDate(iso); return d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""; };
  const daysUntil = (iso) => { const d = toDate(iso); if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 86400000); };

  // Pack and unpack invoice details for the link (base64url of JSON, so nothing is stored anywhere).
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

  function render(d, opts = {}) {
    const logo = opts.logo || "assets/brand/wordmark-cream.png";
    const logoDark = opts.logoDark || "assets/brand/wordmark-brown.png";
    const { total, dep, bal, split } = totals(d);
    const paid = d.paid || "none";
    const first = (d.c?.name || "").trim().split(/\s+/)[0];
    const days = daysUntil(d.e?.date);

    // What is due now
    let dueAmt, dueLabel, dueWhen, isPaid = false;
    if (paid === "full" || (paid === "deposit" && !split)) { isPaid = true; dueAmt = money(0); dueLabel = "Paid in full"; dueWhen = "Thank you, you're all set!"; }
    else if (split && paid === "deposit") { dueAmt = money(bal); dueLabel = "Balance due"; dueWhen = d.balDue ? "by " + fmtDate(d.balDue) : "before your cake date"; }
    else if (split) { dueAmt = money(dep); dueLabel = "Deposit due now"; dueWhen = d.depDue ? "by " + fmtDate(d.depDue) : "to secure your date"; }
    else { dueAmt = money(total); dueLabel = "Amount due"; dueWhen = d.balDue ? "by " + fmtDate(d.balDue) : "to secure your date"; }

    const cakeDay = d.e?.date ? (days > 1 ? `${days} days to go` : days === 1 ? "Tomorrow!" : days === 0 ? "Today!" : fmtDate(d.e.date)) : "Date to confirm";
    const steps = split
      ? [
          { t: "Deposit", s: paid !== "none" ? "Paid, thank you" : `${money(dep)}${d.depDue ? " by " + fmtShort(d.depDue) : ""}`, st: paid !== "none" ? "done" : "now" },
          { t: "Balance", s: paid === "full" ? "Paid, thank you" : `${money(bal)}${d.balDue ? " by " + fmtShort(d.balDue) : ""}`, st: paid === "full" ? "done" : paid === "deposit" ? "now" : "" },
          { t: "Cake day", s: cakeDay, st: isPaid ? "now" : "" }
        ]
      : [
          { t: "Payment", s: isPaid ? "Paid, thank you" : `${money(total)}${d.balDue ? " by " + fmtShort(d.balDue) : ""}`, st: isPaid ? "done" : "now" },
          { t: "Cake day", s: cakeDay, st: isPaid ? "now" : "" }
        ];

    const row = (label, value) => (value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : "");
    const method = d.e?.method === "delivery" ? "Delivery" : "Collection";
    const cakeRows = [
      row("Occasion", d.e?.occ),
      row("Size", d.k?.size),
      row("Flavour", d.k?.flavour),
      row("Design", d.k?.design),
      row("Message on cake", d.k?.msg),
      row(method, [fmtDate(d.e?.date), d.e?.time].filter(Boolean).join(", ")),
      d.e?.method === "delivery" ? row("Address", d.e?.addr) : ""
    ].join("");
    const youRows = [row("Name", d.c?.name), row("Phone", d.c?.phone), row("Email", d.c?.email)].join("");

    const items = (d.items || []).filter((i) => i.t || num(i.a));
    const itemRows = items.map((i) => `<tr><td>${esc(i.t)}</td><td>${money(i.a)}</td></tr>`).join("");
    const subRows = split
      ? `<tr class="sub ${paid !== "none" ? "done" : ""}"><td>Deposit${paid !== "none" ? " (paid)" : ""}</td><td>${money(dep)}</td></tr>
         <tr class="sub ${paid === "full" ? "done" : ""}"><td>Balance${paid === "full" ? " (paid)" : ""}</td><td>${money(bal)}</td></tr>`
      : "";

    const b = d.bank || {};
    const bankRow = (label, value, key) => `<div class="bank-row"><div><small>${label}</small><b>${value ? esc(value) : '<span class="missing">Not added yet</span>'}</b></div>${value ? `<button class="copy" data-copy="${esc(value)}" aria-label="Copy ${label}">Copy</button>` : ""}</div>`;
    const ref = d.n || "";

    return `
<article class="inv">
  <header class="inv-top">
    <img src="${esc(logo)}" alt="Cakes by Nashada Jones">
    <div class="meta"><span>Invoice</span><b>${esc(d.n || "")}</b><span>${esc(fmtDate(d.date))}</span></div>
  </header>
  <div class="inv-body">
    <div class="inv-hello">
      <h1>${first ? `Thank you, ${esc(first)}!` : "Thank you for your order!"}</h1>
      <p>Here are the details of your cake and how to pay. If anything looks wrong, just message me.</p>
    </div>

    <section class="inv-due ${isPaid ? "paid" : ""}">
      <div class="inv-due-main">
        <div><p class="eyebrow">${esc(dueLabel)}</p><p class="amt">${dueAmt}</p></div>
        <div class="when"><b>${esc(dueWhen)}</b>${!isPaid && split && paid === "none" ? `<span class="eyebrow">Total ${money(total)}</span>` : ""}</div>
      </div>
      <ol class="steps" style="--n:${steps.length}">${steps.map((s) => `<li class="${s.st}"><b>${s.t}</b><span>${esc(s.s)}</span></li>`).join("")}</ol>
    </section>

    <section class="inv-sec">
      <p class="eyebrow">Your cake</p>
      <h2 class="cake-title">${esc(d.k?.title || "Your cake")}</h2>
      <dl class="dl">${cakeRows || '<dt>Details</dt><dd class="missing">Details to follow</dd>'}</dl>
    </section>

    <div class="two">
      <section class="inv-sec">
        <h2>Prices</h2>
        <table class="prices"><tbody>${itemRows || '<tr><td class="missing">No items yet</td><td></td></tr>'}
          <tr class="total"><td>Total</td><td>${money(total)}</td></tr>${subRows}</tbody></table>
      </section>
      <section class="inv-sec">
        <h2>Your details</h2>
        <dl class="dl">${youRows || '<dt>Name</dt><dd class="missing">Not added yet</dd>'}</dl>
      </section>
    </div>

    ${isPaid ? "" : `
    <section class="inv-sec">
      <h2>How to pay</h2>
      <div class="bank">
        ${bankRow("Account name", b.name)}
        ${bankRow("Sort code", b.sort)}
        ${bankRow("Account number", b.acc)}
        ${b.bank ? bankRow("Bank", b.bank) : ""}
        ${bankRow("Payment reference", ref)}
        <p class="hint">Please pay by bank transfer and use the reference above, so I can match your payment. Payment can't be made on this page.</p>
      </div>
    </section>`}

    ${d.notes ? `<p class="inv-notes">${esc(d.notes)}</p>` : ""}
  </div>
  <footer class="inv-foot">
    <img src="${esc(logoDark)}" alt="">
    <span>Buttercream cakes &middot; London</span>
    ${opts.printButton ? '<button class="copy no-print" data-print>Save as PDF</button>' : ""}
  </footer>
</article>`;
  }

  // Copy buttons and the PDF button
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
