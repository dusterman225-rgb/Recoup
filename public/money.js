// Receipts, price tracker, reports and exports, cash flow, search.
import { S, ui, render, VIEWS, forms, acts, AFTER, PARENT, go, backBtn, errBox, fail, toast, now, custName, jobSelect, confirmTap, download, esc, usd, jobBased, shrinkImage } from "./core.js";
import { persistCore, persistReceipt, deleteReceiptDoc, F, callFunction } from "./store.js";
import { todayStr, addDays, addMonths, longDay, parseMoney, parseQty, isDay, plural, uid, norm, summary, incomeRows, expenseRows, toCsv, money2, cashflow, priceInsights, priceHistory, EXPENSE_CATEGORIES, jobFinancials, search, entryCost, hoursText, docTotals, daysInMonth } from "./lib.js";
import { hasKey } from "./ai.js";
import { bar } from "./kit.js";

/* ================= receipts ================= */
VIEWS.receipts = () => {
  const list = S.receipts.slice().sort((a, b) => (a.confirmed ? 1 : 0) - (b.confirmed ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  return `<h1>Receipts</h1>${errBox()}
  <section class="card"><h2>Photograph a receipt</h2>
    <label class="btn hi" style="text-align:center;cursor:pointer;display:block">Take a photo or choose one<input id="rc-file" type="file" accept="image/*" capture="environment" hidden></label>
    <p class="muted">You check the supplier, total and items, then confirm. Only confirmed receipts count in your numbers and in price comparisons.</p></section>
  ${list.length ? `<ul class="list">${list.map(r => `<li><button class="card link-card" data-go="receipt" data-id="${r.id}" style="display:flex"><div class="row between"><strong>${esc(r.vendor || "Supplier not entered")}</strong><strong>${r.totalCents == null ? "" : usd(r.totalCents)}</strong></div>
    <div class="row between"><span class="muted">${r.date ? longDay(r.date) : "No date"}${r.category ? " · " + esc(r.category) : ""}</span><span class="chip ${r.confirmed ? "ok" : ""}">${r.confirmed ? "confirmed" : "to confirm"}</span></div></button></li>`).join("")}</ul>` : `<div class="empty"><p class="muted">No receipts yet.</p></div>`}`;
};
PARENT.receipts = "receipts";
const rline = (it = {}) => `<div class="line" data-rline><label>Item<input name="iname" value="${esc(it.name || "")}" maxlength="120"></label><div class="line-nums"><label>Qty<input name="iqty" inputmode="decimal" value="${it.qty != null ? esc(String(it.qty)) : ""}" placeholder="1"></label><label>Price each<input name="iprice" inputmode="decimal" value="${it.unitCents != null ? money2(it.unitCents) : ""}" placeholder="0.00"></label><span></span></div><button type="button" class="back" data-act="rmrline">Remove this line</button></div>`;
VIEWS.receipt = p => {
  const r = S.receipts.find(x => x.id === p.id); if (!r) return VIEWS.receipts();
  const openJobs = S.jobs.filter(j => j.status === "open" || j.id === r.jobId);
  return `${backBtn("All receipts")}<h1>${r.confirmed ? "Receipt" : "Check this receipt"}</h1>${errBox()}
  <div class="card"><img class="receipt-img" src="${esc(r.img)}" alt="Photo of the receipt"></div>
  ${r.confirmed ? `<section class="card"><p><strong>${esc(r.vendor)}</strong></p><p>${usd(r.totalCents)} · ${r.date ? longDay(r.date) : "no date"} · ${esc(r.category || "Materials")}</p>
    ${(r.items || []).length ? `<ul class="list" style="gap:4px">${r.items.map(i => `<li class="row between"><span>${esc(i.name)} <span class="muted">× ${esc(String(i.qty || 1))}</span></span><span>${usd(i.unitCents)}</span></li>`).join("")}</ul>` : ""}
    <p class="muted">Confirmed. It counts in your numbers.</p><button class="btn light small" data-act="unconfirm" data-id="${r.id}" style="align-self:flex-start">Edit this receipt</button></section>`
  : `<form class="card" data-form="saveReceipt"><input type="hidden" name="id" value="${r.id}">
    ${r.aiFilled ? `<p class="ev"><span class="chip est">AI filled in</span><span>Check each number against the photo before you confirm.</span></p>` : `<p class="muted">Type what the photo says, or let AI read it for you to check.</p>`}${hasKey() ? `<button class="btn light small" type="button" data-act="readrc" data-id="${r.id}" style="align-self:flex-start">Read with AI</button>` : `<p class="muted">Add a Gemini key in More to let AI read receipts.</p>`}
    <label>Supplier<input name="vendor" value="${esc(r.vendor || "")}" placeholder="Home Depot" maxlength="120"></label>
    <div class="grid2"><label>Date<input name="date" type="date" value="${esc(r.date || "")}"></label><label>Total<input name="total" inputmode="decimal" value="${r.totalCents == null ? "" : money2(r.totalCents)}" placeholder="84.20"></label></div>
    <label>Category<select name="category">${EXPENSE_CATEGORIES.map(c => `<option ${((r.category || "Materials") === c) ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    ${jobBased() && openJobs.length ? `<label>Job <span class="hint">(optional)</span>${jobSelect("jobId", r.jobId, true)}</label>` : ""}
    <details ${(r.items || []).length ? "open" : ""}><summary>Items (lets Recoup compare prices)</summary><div class="stack"><p class="muted">Enter the price for one unit. Skip this if you don't need price comparison.</p><div class="stack" data-ritems>${((r.items || []).length ? r.items : [{}]).map(rline).join("")}</div><button type="button" class="btn light small" data-act="addrline" style="align-self:flex-start">Add an item</button></div></details>
    <button class="btn" type="submit" name="intent" value="confirm">Confirm receipt</button><button class="btn light" type="submit" name="intent" value="save">Save and finish later</button>
    <button class="btn light" type="button" data-act="delrc" data-id="${r.id}">Delete this receipt</button></form>`}`;
};
PARENT.receipt = "receipts";
acts.addrline = el => { const box = el.closest("form").querySelector("[data-ritems]"); box.insertAdjacentHTML("beforeend", rline()); box.lastElementChild.querySelector("input").focus(); };
acts.rmrline = el => { const l = el.closest("[data-rline]"), box = l.parentElement; if (box.children.length > 1) l.remove(); else l.querySelectorAll("input").forEach(i => i.value = ""); };
async function onPhoto(file) {
  if (!file) return;
  try {
    toast("Reading the photo…"); const img = await shrinkImage(file); if (!img) return fail("That photo is too detailed to store. Try a closer shot of the receipt.");
    const r = { id: uid(), img, vendor: "", date: null, totalCents: null, jobId: null, category: "Materials", items: [], confirmed: false, createdAt: now() };
    S.receipts.push(r); persistReceipt(r); go("receipt", { id: r.id });
  } catch (e) { fail("Couldn't read that photo. Try a JPEG or PNG."); }
}
document.addEventListener("change", e => { if (e.target.id === "rc-file") { const f = e.target.files[0]; e.target.value = ""; onPhoto(f); } });
forms.saveReceipt = async (fd, sub, form) => {
  const r = S.receipts.find(x => x.id === fd.get("id")); if (!r || r.confirmed) return;
  const intent = sub && sub.value === "confirm", vendor = String(fd.get("vendor") || "").trim(), date = String(fd.get("date") || ""), raw = String(fd.get("total") || "").trim(), jobId = String(fd.get("jobId") || "") || null, total = raw ? parseMoney(raw) : null;
  if (date && !isDay(date)) return fail("Enter the date as year-month-day."); if (raw && total === null) return fail("Enter the total, for example 84.20.");
  if (intent && (!vendor || total === null)) return fail("Add the supplier and the total before confirming.");
  const names = fd.getAll("iname"), qtys = fd.getAll("iqty"), prices = fd.getAll("iprice"), items = [];
  for (let i = 0; i < names.length; i++) {
    const n = String(names[i]).trim(), q = String(qtys[i]).trim(), p = String(prices[i]).trim(); if (!n && !q && !p) continue;
    const qty = parseQty(q || "1"), up = parseMoney(p); if (!n || qty === null || up === null) return fail(`Check the item "${n.slice(0, 30) || "(no name)"}". It needs a name, a quantity and a price.`);
    items.push({ name: n.slice(0, 120), qty, unitCents: up });
  }
  Object.assign(r, { vendor, date: date || null, totalCents: total, jobId, items, category: String(fd.get("category") || "Materials"), confirmed: !!intent });
  if (intent && jobId && total !== null && S.jobs.some(j => j.id === jobId) && !S.costs.some(c => c.receiptId === r.id))
    S.costs.push({ id: uid(), jobId, kind: "material", description: `${vendor} receipt`, amountCents: total, date: date || todayStr(), receiptId: r.id, createdAt: now() });
  persistCore(); persistReceipt(r);
  if (intent) { go("receipts"); toast("Receipt confirmed"); } else { render(); toast("Saved"); }
};
acts.unconfirm = el => { const r = S.receipts.find(x => x.id === el.dataset.id); if (!r) return; r.confirmed = false; S.costs = S.costs.filter(c => c.receiptId !== r.id); persistCore(); persistReceipt(r); go("receipt", { id: r.id }, { replace: true }); };
acts.delrc = el => {
  const id = el.dataset.id; if (!confirmTap(el, "Tap again to delete")) return;
  S.receipts = S.receipts.filter(r => r.id !== id); S.costs = S.costs.filter(c => c.receiptId !== id); persistCore(); deleteReceiptDoc(id); go("receipts"); toast("Deleted");
};

/* ================= price tracker ================= */
const evHtml = ev => ev.map(([l, t]) => `<p class="ev"><span class="chip ${l === "verified" ? "ok" : l === "estimate" ? "est" : ""}">${l}</span><span>${esc(t)}</span></p>`).join("");
export function priceTip() { const i = priceInsights(S).filter(x => x.kind === "cheaper")[0]; return i ? `<button class="card link-card" data-go="prices"><strong>You may be overpaying for ${esc(i.name)}</strong><span class="muted">About ${usd(i.savingCents)} on your last purchase. See the receipts it comes from.</span></button>` : ""; }
VIEWS.prices = () => {
  const ins = priceInsights(S), hist = priceHistory(S), t = S.profile.type;
  return `${backBtn("More")}<h1>Price tracker</h1><p class="muted">Built only from receipts you confirmed with items. Recoup compares what you paid at each supplier. It does not guess at prices you never paid.</p>${errBox()}
  ${ins.length ? `<ul class="list">${ins.map(i => `<li class="card ticket"><div class="row between"><strong>${i.kind === "cheaper" ? "Cheaper elsewhere: " : "Price went up: "}${esc(i.name)}</strong>${i.savingCents ? `<strong class="mark">${usd(i.savingCents)}</strong>` : ""}</div>${evHtml(i.evidence)}</li>`).join("")}</ul>`
    : `<div class="empty"><p class="muted">${hist.length ? "No price differences worth flagging yet." : "Nothing to compare yet. On a receipt, open Items and enter what you paid for each product. Two receipts for the same item from different suppliers is enough to start."}</p></div>`}
  ${hist.length ? `<section class="stack"><h2>Everything you've paid</h2>${hist.map(g => `<details class="card"><summary>${esc(g.name)} <span class="muted">(${g.rows.length})</span></summary><ul class="list" style="gap:4px">${g.rows.map(r => `<li class="row between"><span>${esc(r.vendor)} <span class="muted">${longDay(r.date)}</span></span><strong>${usd(r.unitCents)}</strong></li>`).join("")}</ul>
    ${F.priceApi ? `<button class="btn light small" data-act="lookupprice" data-name="${esc(g.name)}">Check today's price online</button>` : ""}</details>`).join("")}</section>` : ""}
  ${F.priceApi ? "" : `<section class="card"><h2>Live price lookup</h2><p class="muted">Checking current prices at other stores needs a paid price service. It is wired in but switched off. See the README, section 8. Your own receipts are always free.</p></section>`}
  ${t ? "" : ""}`;
};
PARENT.prices = "more";
acts.lookupprice = async el => {
  if (!F.priceApi || ui.busy) return; ui.busy = true; toast("Looking up…");
  try { const r = await callFunction("lookupPrice", { query: el.dataset.name }); const box = el.parentElement; box.insertAdjacentHTML("beforeend", `<div class="stack">${(r.results || []).slice(0, 5).map(x => `<p class="ev"><span class="chip est">estimate</span><span>${esc(x.store)}: ${usd(x.priceCents)} (as of ${esc(x.asOf || "today")}). Confirm it's the same product.</span></p>`).join("") || `<p class="muted">No results.</p>`}</div>`); }
  catch { toast("Price lookup isn't available."); } finally { ui.busy = false; }
};

/* ================= reports and exports ================= */
function periodRange(k) {
  const t = todayStr(), y = +t.slice(0, 4), m = +t.slice(5, 7), pm = n => String(n).padStart(2, "0");
  if (k === "lastmonth") { const d = addMonths(t.slice(0, 8) + "01", -1); const yy = +d.slice(0, 4), mm = +d.slice(5, 7); return [d, `${yy}-${pm(mm)}-${pm(daysInMonth(yy, mm))}`, "Last month"]; }
  if (k === "quarter") { const q = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${pm(q)}-01`, `${y}-${pm(q + 2)}-${pm(daysInMonth(y, q + 2))}`, "This quarter"]; }
  if (k === "year") return [`${y}-01-01`, `${y}-12-31`, "This year"];
  if (k === "lastyear") return [`${y - 1}-01-01`, `${y - 1}-12-31`, "Last year"];
  return [`${y}-${pm(m)}-01`, `${y}-${pm(m)}-${pm(daysInMonth(y, m))}`, "This month"];
}
VIEWS.reports = p => {
  const k = p.period || "year", [from, to, label] = periodRange(k), s = summary(S, from, to), cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]), custs = Object.entries(s.byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const months = Object.entries(s.byMonth).sort(), max = Math.max(1, ...months.map(([, v]) => Math.max(v.income, v.expenses)));
  const jobs = S.jobs.map(j => ({ j, f: jobFinancials(S, j) })).filter(x => x.f.billed || x.f.totalCost).sort((a, b) => b.f.profitBilled - a.f.profitBilled);
  return `${backBtn("More")}<h1>Reports</h1>${errBox()}
  <div class="row">${[["month", "This month"], ["lastmonth", "Last month"], ["quarter", "Quarter"], ["year", "This year"], ["lastyear", "Last year"]].map(([v, l]) => `<button class="btn small ${k === v ? "" : "light"}" data-go="reports" data-period="${v}">${l}</button>`).join("")}</div>
  <section class="card"><h2>${esc(label)}</h2><p class="muted">${longDay(from)} to ${longDay(to)}. Income counts invoices when marked paid. Expenses count confirmed receipts and job costs.</p>
    <div class="row between"><span>Income received</span><strong>${usd(s.income)}</strong></div>${s.salesTax ? `<div class="row between"><span class="muted">of which sales tax collected</span><span>${usd(s.salesTax)}</span></div>` : ""}
    <div class="row between"><span>Expenses</span><strong>${usd(s.expenses)}</strong></div>${s.mileageCents ? `<div class="row between"><span>Mileage deduction (${s.miles.toFixed(1)} mi)</span><strong>${usd(s.mileageCents)}</strong></div>` : ""}
    <div class="row between"><span><strong>Profit</strong> <span class="muted">(before your own pay and income tax)</span></span><strong class="mark">${usd(s.profit)}</strong></div>
    <p class="ev"><span class="chip est">estimate</span><span>Setting aside ${s.setAsidePct}% of profit would be ${usd(s.setAside)} for taxes. This is a rough planning number, not tax advice. Change the percent in Business details.</span></p></section>
  ${months.length > 1 ? `<section class="card"><h2>By month</h2>${months.map(([m, v]) => `<div class="stack" style="gap:2px"><div class="row between"><span>${esc(m)}</span><span class="muted">${usd(v.income)} in · ${usd(v.expenses)} out</span></div>${bar(v.income / max * 100)}${bar(v.expenses / max * 100, true)}</div>`).join("")}</section>` : ""}
  ${cats.length ? `<section class="card"><h2>Expenses by category</h2>${cats.map(([c, v]) => `<div class="row between"><span>${esc(c)}</span><strong>${usd(v)}</strong></div>`).join("")}</section>` : ""}
  ${custs.length ? `<section class="card"><h2>Income by customer</h2>${custs.map(([c, v]) => `<div class="row between"><span>${esc(c)}</span><strong>${usd(v)}</strong></div>`).join("")}</section>` : ""}
  ${jobs.length ? `<section class="card"><h2>Profit by job</h2><p class="muted">All time. Billed minus recorded costs.</p>${jobs.slice(0, 12).map(({ j, f }) => `<button class="link-card plain row between" data-go="job" data-id="${j.id}"><span>${esc(j.title)}</span><strong class="${f.profitBilled < 0 ? "neg" : ""}">${usd(f.profitBilled)}</strong></button>`).join("")}</section>` : ""}
  <section class="card"><h2>Export for your accountant</h2><p class="muted">Spreadsheet files (CSV) for the period above. They open in Excel, Google Sheets and most accounting software.</p>
    <div class="row">${[["income", "Income"], ["expenses", "Expenses"], ["mileage", "Mileage"], ["time", "Time"], ["invoices", "Invoices"], ["customers", "Customers"]].map(([v, l]) => `<button class="btn small light" data-act="export" data-kind="${v}" data-period="${k}">${l}</button>`).join("")}</div></section>`;
};
PARENT.reports = "more";
acts.export = el => {
  const [from, to] = periodRange(el.dataset.period || "year"), kind = el.dataset.kind, inR = d => d >= from && d <= to; let name, head, rows;
  if (kind === "income") { name = "income"; head = ["Date paid", "Invoice", "Customer", "Amount", "Sales tax included"]; rows = incomeRows(S).filter(r => inR(r.date)).map(r => [r.date, r.number, r.customer, money2(r.amountCents), money2(r.taxCents)]); }
  if (kind === "expenses") { name = "expenses"; head = ["Date", "Description", "Category", "Amount", "Job"]; rows = expenseRows(S).filter(r => inR(r.date)).map(r => [r.date, r.what, r.category, money2(r.amountCents), S.jobs.find(j => j.id === r.jobId)?.title || ""]); }
  if (kind === "mileage") { name = "mileage"; head = ["Date", "Miles", "Purpose"]; rows = S.trips.filter(t => inR(t.date)).map(t => [t.date, t.miles, t.purpose || ""]); }
  if (kind === "time") { name = "time"; head = ["Date", "Job", "Hours", "Cost rate per hour", "Cost", "Note"]; rows = S.time.filter(t => inR(t.date)).map(t => [t.date, S.jobs.find(j => j.id === t.jobId)?.title || "", (t.minutes / 60).toFixed(2), money2(t.rateCents || 0), money2(entryCost(t)), t.note || ""]); }
  if (kind === "invoices") { name = "invoices"; head = ["InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Terms", "Total", "Status", "PaidDate"]; rows = S.invoices.filter(i => inR((i.createdAt || "").slice(0, 10)) || inR(i.dueDate)).map(i => [i.number, custName(i.customerId), (i.createdAt || "").slice(0, 10), i.dueDate, "", money2(i.amountCents), i.status, i.paidAt || ""]); }
  if (kind === "customers") { name = "customers"; head = ["Name", "Email", "Phone", "Address"]; rows = S.customers.map(c => [c.name, c.email, c.phone, c.address || ""]); }
  download(`recoup-${name}-${from}-to-${to}.csv`, toCsv(head, rows)); toast(`${plural(rows.length, "row")} exported`);
};

/* ================= cash flow ================= */
VIEWS.cashflow = () => {
  const cf = cashflow(S, todayStr(), 30), days = cf.days.filter(d => d.items.length);
  return `${backBtn("More")}<h1>Cash flow</h1><p class="muted">A 30-day look ahead using unpaid invoices (when due) and your recurring bills. It is a projection, not a promise: customers pay late.</p>${errBox()}
  <form class="card" data-form="setBalance"><label>Money in the bank today <span class="hint">(you update this)</span><input name="bal" inputmode="decimal" value="${S.profile.startingBalanceCents != null ? money2(S.profile.startingBalanceCents) : ""}" placeholder="5000.00"></label><button class="btn light small" type="submit" style="align-self:flex-start">Save balance</button></form>
  <section class="card"><div class="row between"><span>Expected in</span><strong>${usd(cf.totalIn)}</strong></div><div class="row between"><span>Bills going out</span><strong>${usd(cf.totalOut)}</strong></div><div class="row between"><span>Projected in 30 days</span><strong>${usd(cf.end)}</strong></div>
    <p class="ev"><span class="chip ${cf.low.balance < 0 ? "late" : "est"}">estimate</span><span>Lowest point: ${usd(cf.low.balance)} on ${longDay(cf.low.date)}.${cf.low.balance < 0 ? " That would be a shortfall. Chasing overdue invoices first would help." : ""}</span></p></section>
  ${days.length ? `<ul class="list">${days.map(d => `<li class="card"><div class="row between"><strong>${longDay(d.date)}</strong><span class="muted">balance ${usd(d.balance)}</span></div>${d.items.map(i => `<div class="row between"><span>${esc(i.label)}</span><span class="${i.dir === "in" ? "pos" : "neg"}">${i.dir === "in" ? "+" : "-"}${usd(i.cents)}</span></div>`).join("")}</li>`).join("")}</ul>` : ""}
  <section class="card"><h2>Recurring bills</h2><form data-form="addBill" class="stack"><label>Bill<input name="name" required maxlength="80" placeholder="Truck payment"></label><div class="grid2"><label>Amount<input name="amount" inputmode="decimal" required placeholder="480.00"></label><label>Day of month<input name="day" type="number" min="1" max="31" required value="1"></label></div><button class="btn light small" type="submit" style="align-self:flex-start">Add bill</button></form>
    ${S.bills.length ? `<ul class="list" style="gap:4px">${S.bills.map(b => `<li class="row between"><span>${esc(b.name)} <span class="muted">on the ${b.day}${["th", "st", "nd", "rd"][b.day % 10 > 3 || [11, 12, 13].includes(b.day) ? 0 : b.day % 10]}</span></span><span class="row"><strong>${usd(b.amountCents)}</strong><button class="back" data-act="delbill" data-id="${b.id}">Remove</button></span></li>`).join("")}</ul>` : ""}</section>`;
};
PARENT.cashflow = "more";
forms.setBalance = fd => { const raw = String(fd.get("bal") || "").trim(), v = raw ? parseMoney(raw) : null; if (raw && v === null) return fail("Enter a plain number, for example 5000.00."); S.profile.startingBalanceCents = v; persistCore(); go("cashflow", {}, { replace: true }); toast("Saved"); };
forms.addBill = fd => { const a = parseMoney(fd.get("amount")), d = parseInt(fd.get("day"), 10), name = String(fd.get("name") || "").trim(); if (!name) return fail("Name the bill."); if (a === null) return fail("Enter the amount as a plain number."); if (!(d >= 1 && d <= 31)) return fail("Day must be 1 to 31."); S.bills.push({ id: uid(), name, amountCents: a, day: d }); persistCore(); go("cashflow", {}, { replace: true }); };
acts.delbill = el => { S.bills = S.bills.filter(b => b.id !== el.dataset.id); persistCore(); go("cashflow", {}, { replace: true }); };

/* ================= search ================= */
VIEWS.search = () => {
  const res = search(S, ui.q || "");
  return `${backBtn("Back")}<h1>Search</h1><label>Search everything<input id="gq" type="search" value="${esc(ui.q || "")}" placeholder="Customer, invoice number, supplier, item" autocomplete="off" autofocus></label>
  ${(ui.q || "").length >= 2 ? (res.length ? `<ul class="list">${res.map(r => `<li><button class="card link-card" data-go="${r.type === "sub" ? "sub" : r.type}" data-id="${r.id}"><div class="row between"><strong>${esc(r.label)}</strong><span class="chip">${r.type}</span></div><span class="muted">${esc(r.sub || "")}</span></button></li>`).join("")}</ul>` : `<div class="empty"><p class="muted">No matches.</p></div>`) : `<p class="muted">Type at least two letters.</p>`}`;
};
document.addEventListener("input", e => {
  if (e.target.id !== "gq") return; ui.q = e.target.value; const pos = e.target.selectionStart; render(); const n = document.getElementById("gq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
});

