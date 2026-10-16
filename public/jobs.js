// Customers, jobs, job costs, time tracking, job photos and shopping lists.
import { S, ui, render, VIEWS, forms, acts, AFTER, PARENT, go, back, backBtn, errBox, fail, toast, now, custName, customerSelect, confirmTap, esc, usd, shrinkImage, copyText } from "./core.js";
import { persistCore, putFile, removeFile, listFiles, getFile } from "./store.js";
import { todayStr, longDay, parseMoney, isDay, plural, uid, jobFinancials, jobCost, entryCost, minutesBetween, hoursText, daysBetween, norm } from "./lib.js";
import { bar } from "./kit.js";

const job = id => S.jobs.find(j => j.id === id), cust = id => S.customers.find(c => c.id === id);
const emailOk = s => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const phoneE164 = s => { const d = String(s || "").replace(/[^\d+]/g, ""); if (/^\+\d{8,15}$/.test(d)) return d; if (/^\d{10}$/.test(d)) return "+1" + d; if (/^1\d{10}$/.test(d)) return "+" + d; return ""; };
export { phoneE164 };

/* ================= customers ================= */
VIEWS.customers = () => {
  const q = norm(ui.q || ""), list = S.customers.filter(c => !q || norm([c.name, c.email, c.phone, c.address].join(" ")).includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="row between"><h1>Customers</h1><button class="btn hi small" data-go="customerEdit">Add</button></div>${errBox()}
  ${S.customers.length > 6 ? `<label>Find a customer<input data-q type="search" value="${esc(ui.q || "")}" autocomplete="off"></label>` : ""}
  ${list.length ? `<ul class="list">${list.map(c => { const owed = S.invoices.filter(i => i.customerId === c.id && i.status === "unpaid").reduce((s, i) => s + i.amountCents, 0);
    return `<li><button class="card link-card" data-go="customer" data-id="${c.id}"><div class="row between"><strong>${esc(c.name)}</strong>${owed ? `<span class="chip late">${usd(owed)} owed</span>` : ""}</div><span class="muted">${esc([c.email, c.phone].filter(Boolean).join(" · ") || "No contact details")}</span></button></li>`; }).join("")}</ul>`
    : `<div class="empty"><p class="muted">${S.customers.length ? "No match." : "No customers yet."}</p>${S.customers.length ? "" : `<button class="btn hi" data-go="customerEdit">Add your first customer</button>`}</div>`}`;
};
PARENT.customers = "customers";
document.addEventListener("input", e => {
  if (e.target.matches("[data-q]")) { ui.q = e.target.value; const pos = e.target.selectionStart; render(); const n = document.querySelector("[data-q]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
});

VIEWS.customerEdit = p => {
  const c = p.id ? cust(p.id) : null;
  return `${backBtn(c ? c.name : "Customers")}<h1>${c ? "Edit customer" : "New customer"}</h1>${errBox()}
  <form class="card" data-form="saveCustomer"><input type="hidden" name="id" value="${c ? c.id : ""}">
    <label>Name<input name="name" value="${esc(c?.name || p.name || "")}" required maxlength="120" autocomplete="off"></label>
    <label>Email<input name="email" type="email" inputmode="email" value="${esc(c?.email || "")}" autocomplete="off"></label>
    <label>Phone<input name="phone" type="tel" inputmode="tel" value="${esc(c?.phone || p.phone || "")}" autocomplete="off"></label>
    <label>Address <span class="hint">(optional)</span><input name="address" value="${esc(c?.address || "")}" maxlength="200" autocomplete="off"></label>
    <label>Notes <span class="hint">(gate code, preferences, anything to remember)</span><textarea name="notes" maxlength="1500" style="min-height:80px">${esc(c?.notes || "")}</textarea></label>
    <label class="check"><input type="checkbox" name="smsOk" ${c?.smsOk ? "checked" : ""}> <span>This customer agreed to receive text messages from me</span></label>
    <button class="btn" type="submit">Save customer</button></form>`;
};
PARENT.customerEdit = "customers";
forms.saveCustomer = fd => {
  const id = String(fd.get("id") || ""), name = String(fd.get("name") || "").trim(), email = String(fd.get("email") || "").trim().toLowerCase();
  if (!name) return fail("Enter the customer's name."); if (!emailOk(email)) return fail("That email address doesn't look right.");
  const f = { name, email, phone: String(fd.get("phone") || "").trim(), address: String(fd.get("address") || "").trim(), notes: String(fd.get("notes") || "").trim(), smsOk: !!fd.get("smsOk") };
  let c = id ? cust(id) : null; if (c) Object.assign(c, f); else { c = { id: uid(), createdAt: now(), ...f }; S.customers.push(c); }
  persistCore(); go("customer", { id: c.id }, { replace: true }); toast("Customer saved");
};
VIEWS.customer = p => {
  const c = cust(p.id); if (!c) return VIEWS.customers();
  const inv = S.invoices.filter(i => i.customerId === c.id), paid = inv.filter(i => i.status === "paid").reduce((s, i) => s + i.amountCents, 0), owed = inv.filter(i => i.status === "unpaid").reduce((s, i) => s + i.amountCents, 0);
  const qs = S.quotes.filter(q => q.customerId === c.id), js = S.jobs.filter(j => j.customerId === c.id), evs = S.events.filter(e => e.customerId === c.id && e.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date));
  const tel = c.phone ? c.phone.replace(/[^\d+]/g, "") : "";
  return `${backBtn("Customers")}<h1>${esc(c.name)}</h1>${errBox()}
  <section class="card">${[c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`, c.phone && `<a href="tel:${esc(tel)}">${esc(c.phone)}</a>`, c.address && `<a href="https://maps.google.com/?q=${encodeURIComponent(c.address)}" target="_blank" rel="noopener">${esc(c.address)}</a>`].filter(Boolean).map(x => `<span>${x}</span>`).join("") || `<span class="muted">No contact details yet.</span>`}
    ${c.notes ? `<p class="msg">${esc(c.notes)}</p>` : ""}
    <div class="row"><button class="btn small light" data-go="customerEdit" data-id="${c.id}">Edit</button>
    ${tel ? `<a class="btn small light" style="text-decoration:none" href="sms:${esc(tel)}">Text</a>` : ""}</div></section>
  <section class="card"><div class="row between"><span class="muted">Paid to you</span><strong>${usd(paid)}</strong></div><div class="row between"><span class="muted">Owed to you</span><strong>${usd(owed)}</strong></div></section>
  <div class="row"><button class="btn small hi" data-go="quoteEdit" data-customer-id="${c.id}">New quote</button><button class="btn small light" data-go="invoiceEdit" data-customer-id="${c.id}">New invoice</button><button class="btn small light" data-go="eventEdit" data-customer-id="${c.id}">Schedule a visit</button></div>
  ${evs.length ? `<section class="stack"><h2>Upcoming</h2><ul class="list">${evs.map(e => `<li class="card">${esc(e.title)} <span class="muted">${longDay(e.date)}${e.time ? " " + esc(e.time) : ""}</span></li>`).join("")}</ul></section>` : ""}
  ${[["Jobs", js, j => `<button class="link-card plain" data-go="job" data-id="${j.id}"><strong>${esc(j.title)}</strong> <span class="chip">${j.status}</span></button>`],
     ["Quotes", qs, q => `<button class="link-card plain" data-go="quote" data-id="${q.id}"><strong>${esc(q.title)}</strong> <span class="muted">${usd(q.amountCents)}</span> <span class="chip">${q.status}</span></button>`],
     ["Invoices", inv, i => `<button class="link-card plain" data-go="invoice" data-id="${i.id}"><strong>${esc(i.number)}</strong> <span class="muted">${usd(i.amountCents)}</span> <span class="chip ${i.status === "paid" ? "ok" : ""}">${i.status}</span></button>`]]
    .map(([t, l, f]) => l.length ? `<section class="stack"><h2>${t}</h2><ul class="list">${l.map(x => `<li class="card">${f(x)}</li>`).join("")}</ul></section>` : "").join("")}
  <button class="btn light block" data-act="delcustomer" data-id="${c.id}">Delete this customer</button>`;
};
PARENT.customer = "customers";
acts.delcustomer = el => {
  const c = cust(el.dataset.id); if (!c || !confirmTap(el, "Tap again to delete")) return;
  if ([S.quotes, S.jobs, S.invoices].some(l => l.some(x => x.customerId === c.id))) return fail("This customer has quotes, jobs or invoices. Delete those first.");
  S.customers = S.customers.filter(x => x.id !== c.id); persistCore(); go("customers"); toast("Customer deleted");
};

/* ================= jobs ================= */
VIEWS.jobs = () => {
  const list = S.jobs.slice().sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
  return `<div class="row between"><h1>Jobs</h1><button class="btn hi small" data-go="jobEdit">New job</button></div>${errBox()}
  ${list.length ? `<ul class="list">${list.map(j => { const f = jobFinancials(S, j), over = j.budgetCents > 0 && f.totalCost > j.budgetCents;
    return `<li><button class="card link-card" data-go="job" data-id="${j.id}"><div class="row between"><strong>${esc(j.title)}</strong><span class="chip ${j.status === "done" ? "ok" : over ? "late" : ""}">${j.status === "done" ? "done" : over ? "over budget" : "open"}</span></div>
      <span class="muted">${esc(custName(j.customerId))}${f.contract ? " · contract " + usd(f.contract) : ""} · costs ${usd(f.totalCost)}${j.budgetCents ? " of " + usd(j.budgetCents) : ""}</span>${j.budgetCents ? bar(f.totalCost / j.budgetCents * 100, over) : ""}</button></li>`; }).join("")}</ul>`
    : `<div class="empty"><p class="muted">No jobs yet. Start one from a won quote, or add one here.</p><button class="btn hi" data-go="jobEdit">Add a job</button></div>`}`;
};
PARENT.jobs = "jobs";
VIEWS.jobEdit = p => {
  const j = p.id ? job(p.id) : null;
  return `${backBtn(j ? j.title : "Jobs")}<h1>${j ? "Edit job" : "New job"}</h1>${errBox()}
  <form class="card" data-form="saveJob"><input type="hidden" name="id" value="${j ? j.id : ""}">
    <label>Job name<input name="title" value="${esc(j?.title || "")}" required maxlength="160"></label>
    <label>Customer ${customerSelect("customerId", false, j?.customerId || p.customerId)}</label>
    <label>Address <span class="hint">(optional)</span><input name="address" value="${esc(j?.address || "")}" maxlength="200"></label>
    <label>Budget for costs <span class="hint">(optional. Recoup warns you when costs pass it)</span><input name="budget" inputmode="decimal" value="${j?.budgetCents ? (j.budgetCents / 100).toFixed(2) : ""}" placeholder="3000.00"></label>
    ${j && !j.quoteId ? `<label>Contract value <span class="hint">(what you agreed to charge, if there is no quote)</span><input name="contract" inputmode="decimal" value="${j.contractCents ? (j.contractCents / 100).toFixed(2) : ""}" placeholder="5000.00"></label>` : ""}
    <button class="btn" type="submit">Save job</button></form>`;
};
PARENT.jobEdit = "jobs";
forms.saveJob = fd => {
  const id = String(fd.get("id") || ""), title = String(fd.get("title") || "").trim(), raw = String(fd.get("budget") || "").trim(), b = raw ? parseMoney(raw) : 0, craw = String(fd.get("contract") || "").trim(), cc = craw ? parseMoney(craw) : 0;
  if (!title) return fail("Name the job."); if (b === null) return fail("Enter the budget as a plain number, for example 3000.00."); if (cc === null) return fail("Enter the contract value as a plain number.");
  const f = { title, customerId: String(fd.get("customerId") || "") || null, address: String(fd.get("address") || "").trim(), budgetCents: b };
  let j = id ? job(id) : null;
  if (j) { Object.assign(j, f); if (fd.has("contract")) j.contractCents = cc; } else { j = { id: uid(), quoteId: null, contractCents: 0, status: "open", createdAt: now(), ...f }; S.jobs.push(j); }
  persistCore(); go("job", { id: j.id }, { replace: true }); toast("Job saved");
};

VIEWS.job = p => {
  const j = job(p.id); if (!j) return VIEWS.jobs();
  const f = jobFinancials(S, j), costs = S.costs.filter(c => c.jobId === j.id).sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
  const times = S.time.filter(t => t.jobId === j.id).sort((a, b) => b.date.localeCompare(a.date)), cos = S.changeOrders.filter(c => c.jobId === j.id), invs = S.invoices.filter(i => i.jobId === j.id);
  const lists = S.lists.filter(l => l.jobId === j.id), running = S.timer && S.timer.jobId === j.id, over = j.budgetCents > 0 && f.totalCost > j.budgetCents;
  const mt = S.profile.hourlyRateCents ? "" : `<p class="muted">Set your cost per hour in More → Business details so tracked time counts toward the job's cost.</p>`;
  return `${backBtn("Jobs")}${errBox()}
  <div class="row between"><h1>${esc(j.title)}</h1><span class="chip ${j.status === "done" ? "ok" : ""}">${j.status}</span></div>
  <p class="muted">${esc(custName(j.customerId))}${j.address ? ` · <a href="https://maps.google.com/?q=${encodeURIComponent(j.address)}" target="_blank" rel="noopener">${esc(j.address)}</a>` : ""}</p>
  <section class="card"><h2>Profit on this job</h2>
    <div class="row between"><span class="muted">Contract value</span><strong>${f.contract ? usd(f.contract) : "not set"}</strong></div>
    <div class="row between"><span class="muted">Billed / paid</span><span>${usd(f.billed)} / ${usd(f.paid)}</span></div>
    <div class="split"><span class="muted">Costs: materials ${usd(f.by.material)}, labor ${usd(f.by.labor + f.timeCost)}${f.by.sub ? ", subs " + usd(f.by.sub) : ""}${f.by.other ? ", other " + usd(f.by.other) : ""}</span><strong>${usd(f.totalCost)}</strong></div>
    <p class="ev"><span class="chip ok">verified</span><span>Profit so far (billed minus recorded costs): <strong>${usd(f.profitBilled)}</strong>${f.margin !== null ? ` (${Math.round(f.margin * 100)}% of billed)` : ""}.</span></p>
    ${f.expectedProfit !== null ? `<p class="ev"><span class="chip est">estimate</span><span>If the whole contract is billed and no more costs come in: ${usd(f.expectedProfit)}.</span></p>` : ""}
    ${f.unbilled > 0 ? `<p class="ev"><span class="chip">${usd(f.unbilled)}</span><span>of the contract is not billed yet.</span></p>` : ""}
    ${j.budgetCents ? `<div>${bar(f.totalCost / j.budgetCents * 100, over)}<p class="muted">${usd(f.totalCost)} of ${usd(j.budgetCents)} budget${over ? ` · ${usd(f.totalCost - j.budgetCents)} over` : ""}</p></div>` : `<p class="muted">No cost budget set. Edit the job to add one.</p>`}</section>
  <div class="row"><button class="btn small hi" data-go="invoiceEdit" data-job-id="${j.id}" data-customer-id="${j.customerId || ""}">Invoice</button><button class="btn small light" data-go="coEdit" data-job-id="${j.id}">Change order</button><button class="btn small light" data-go="jobEdit" data-id="${j.id}">Edit</button><button class="btn small light" data-act="jobstatus" data-id="${j.id}" data-status="${j.status === "open" ? "done" : "open"}">${j.status === "open" ? "Mark done" : "Reopen"}</button></div>

  <section class="card"><h2>Time</h2>${mt}
    <div class="row"><button class="btn small ${running ? "" : "hi"}" data-act="${running ? "timerstop" : "timerstart"}" data-id="${j.id}">${running ? "Stop timer" : "Start timer"}</button>${running ? `<span class="muted" id="tick" data-since="${esc(S.timer.startedAt)}"></span>` : ""}</div>
    ${S.timer && !running ? `<p class="muted">A timer is already running on another job.</p>` : ""}
    <form data-form="addTime" class="stack"><input type="hidden" name="jobId" value="${j.id}"><div class="grid2"><label>Hours<input name="hours" inputmode="decimal" placeholder="2.5" required></label><label>Date<input name="date" type="date" value="${todayStr()}"></label></div>
      <label>Note <span class="hint">(optional)</span><input name="note" maxlength="160"></label><button class="btn light small" type="submit" style="align-self:flex-start">Add time</button></form>
    ${times.length ? `<ul class="list">${times.slice(0, 8).map(t => `<li class="row between"><span>${longDay(t.date)} · ${hoursText(t.minutes)}${t.note ? " · " + esc(t.note) : ""}</span><span class="row"><span class="muted">${usd(entryCost(t))}</span><button class="back" data-act="deltime" data-id="${t.id}">Remove</button></span></li>`).join("")}</ul>` : ""}</section>

  <section class="card"><h2>Costs</h2>
    <form data-form="addCost" class="stack"><input type="hidden" name="jobId" value="${j.id}"><label>What was it<input name="description" required maxlength="160" placeholder="Cable and breakers"></label>
      <div class="grid2"><label>Amount<input name="amount" inputmode="decimal" required placeholder="85.50"></label><label>Type<select name="kind"><option value="material">Material</option><option value="labor">Labor</option><option value="sub">Subcontractor</option><option value="other">Other</option></select></label></div>
      ${S.subs.length ? `<label>Paid to a subcontractor <span class="hint">(optional)</span><select name="subId"><option value="">No</option>${S.subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>` : ""}
      <button class="btn light small" type="submit" style="align-self:flex-start">Add cost</button></form>
    ${costs.length ? `<ul class="list">${costs.map(c => `<li class="row between"><span>${esc(c.description)} <span class="muted">${esc(c.kind)}${c.subId ? " · " + esc(S.subs.find(s => s.id === c.subId)?.name || "") : ""}</span></span><span class="row"><strong>${usd(c.amountCents)}</strong>${c.receiptId ? "" : `<button class="back" data-act="delcost" data-id="${c.id}">Remove</button>`}</span></li>`).join("")}</ul>` : `<p class="muted">No costs yet. Confirm a receipt and choose this job to add it here.</p>`}</section>

  ${cos.length ? `<section class="stack"><h2>Change orders</h2><ul class="list">${cos.map(c => `<li class="card"><button class="link-card plain" data-go="changeOrder" data-id="${c.id}"><div class="row between"><strong>${esc(c.number)} ${esc(c.title)}</strong><strong>${usd(c.amountCents)}</strong></div><span class="chip ${c.status === "approved" ? "ok" : ""}">${c.status}</span></button></li>`).join("")}</ul></section>` : ""}
  ${invs.length ? `<section class="stack"><h2>Invoices</h2><ul class="list">${invs.map(i => `<li class="card"><button class="link-card plain" data-go="invoice" data-id="${i.id}"><div class="row between"><strong>${esc(i.number)}</strong><strong>${usd(i.amountCents)}</strong></div><span class="chip ${i.status === "paid" ? "ok" : ""}">${i.status}</span></button></li>`).join("")}</ul></section>` : ""}

  <section class="card"><h2>Photos</h2><p class="muted">Before, during and after photos protect you in a dispute.</p>
    <div class="row"><label class="btn hi small" style="cursor:pointer">Add a photo<input id="job-photo" data-job="${j.id}" type="file" accept="image/*" capture="environment" hidden></label>
    <select id="photo-label" aria-label="Photo label" style="width:auto"><option>Before</option><option>During</option><option>After</option><option>Damage</option><option>Other</option></select></div>
    <div id="photos" class="photo-grid"><p class="muted">Loading photos…</p></div></section>

  <section class="card"><h2>Lists</h2><p class="muted">Materials to buy or things to finish. Tick items as you go.</p>
    <form data-form="addList" class="row"><input type="hidden" name="jobId" value="${j.id}"><input name="name" placeholder="Materials list" required maxlength="80" style="flex:1"><button class="btn small light" type="submit">New list</button></form>
    ${lists.map(listCard).join("")}</section>
  <button class="btn light block" data-act="deljob" data-id="${j.id}">Delete this job</button>`;
};
PARENT.job = "jobs";
AFTER.job = async p => {
  tick();
  const box = document.getElementById("photos"); if (!box) return;
  try {
    const files = await listFiles(p.id); if (!document.getElementById("photos")) return;
    document.getElementById("photos").innerHTML = files.length ? files.map(f => `<figure><img src="${esc(f.img)}" alt="${esc(f.label || "Job photo")}" data-act="viewphoto" data-id="${f.id}"><figcaption>${esc(f.label || "")}<br><span class="muted">${longDay((f.createdAt || "").slice(0, 10))}</span> <button class="back" data-act="delphoto" data-id="${f.id}">Remove</button></figcaption></figure>`).join("") : `<p class="muted">No photos yet.</p>`;
  } catch (e) { box.innerHTML = `<p class="muted">Photos will load when you're back online.</p>`; }
};
let tickT = null;
function tick() {
  clearInterval(tickT); const el = document.getElementById("tick"); if (!el) return;
  const upd = () => { const e = document.getElementById("tick"); if (!e) return clearInterval(tickT); e.textContent = "Running: " + hoursText(minutesBetween(e.dataset.since, new Date().toISOString())); };
  upd(); tickT = setInterval(upd, 15000);
}
function listCard(l) {
  const done = l.items.filter(i => i.done).length;
  return `<div class="card" style="background:var(--bg)"><div class="row between"><strong>${esc(l.name)}</strong><span class="muted">${done}/${l.items.length}</span></div>
    <ul class="list" style="gap:4px">${l.items.map(i => `<li class="row between"><label class="check" style="font-weight:400"><input type="checkbox" data-act="tickitem" data-list="${l.id}" data-id="${i.id}" ${i.done ? "checked" : ""}> <span style="${i.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(i.text)}</span></label><button class="back" data-act="delitem" data-list="${l.id}" data-id="${i.id}">Remove</button></li>`).join("")}</ul>
    <form data-form="addItem" class="row"><input type="hidden" name="listId" value="${l.id}"><input name="text" placeholder="Add an item" required maxlength="120" style="flex:1"><button class="btn small light" type="submit">Add</button></form>
    <div class="row"><button class="btn small light" data-act="copylist" data-id="${l.id}">Copy list</button><button class="btn small light" data-act="dellist" data-id="${l.id}">Delete list</button></div></div>`;
}

acts.jobstatus = el => { const j = job(el.dataset.id); if (j) { j.status = el.dataset.status; persistCore(); go("job", { id: j.id }, { replace: true }); } };
acts.deljob = el => {
  const j = job(el.dataset.id); if (!j || !confirmTap(el, "Tap again to delete")) return;
  if (S.invoices.some(i => i.jobId === j.id)) return fail("This job has invoices. Delete or detach those first, or mark the job done.");
  S.jobs = S.jobs.filter(x => x.id !== j.id); S.costs = S.costs.filter(c => c.jobId !== j.id); S.time = S.time.filter(t => t.jobId !== j.id); S.lists = S.lists.filter(l => l.jobId !== j.id); S.changeOrders = S.changeOrders.filter(c => c.jobId !== j.id);
  persistCore(); go("jobs"); toast("Job deleted");
};
forms.addCost = fd => {
  const j = job(String(fd.get("jobId"))), a = parseMoney(fd.get("amount")), d = String(fd.get("description") || "").trim(), k = ["material", "labor", "sub", "other"].includes(fd.get("kind")) ? fd.get("kind") : "other";
  if (!j) return; if (!d) return fail("Say what the cost was."); if (a === null) return fail("Enter the amount as a plain number, for example 85.50.");
  const subId = String(fd.get("subId") || "") || null;
  S.costs.push({ id: uid(), jobId: j.id, kind: subId ? "sub" : k, subId, description: d, amountCents: a, date: todayStr(), receiptId: null, createdAt: now() });
  persistCore(); go("job", { id: j.id }, { replace: true }); toast("Cost added");
};
acts.delcost = el => { S.costs = S.costs.filter(c => c.id !== el.dataset.id); persistCore(); go("job", ui.p, { replace: true }); };

/* ---------- time ---------- */
const rate = () => S.profile.hourlyRateCents || 0;
acts.timerstart = el => { if (S.timer) return toast("A timer is already running."); S.timer = { jobId: el.dataset.id, startedAt: new Date().toISOString() }; persistCore(); go("job", ui.p, { replace: true }); toast("Timer started"); };
acts.timerstop = el => {
  const t = S.timer; if (!t) return; const m = Math.max(1, minutesBetween(t.startedAt, new Date().toISOString()));
  S.time.push({ id: uid(), jobId: t.jobId, minutes: m, rateCents: rate(), date: todayStr(), note: "Timer", createdAt: now() }); S.timer = null; persistCore(); go("job", ui.p, { replace: true }); toast(`Added ${hoursText(m)}`);
};
forms.addTime = fd => {
  const j = job(String(fd.get("jobId"))), h = parseFloat(String(fd.get("hours") || "").replace(",", ".")), date = String(fd.get("date") || todayStr());
  if (!j) return; if (!(h > 0 && h <= 24)) return fail("Enter hours between 0 and 24, for example 2.5."); if (!isDay(date)) return fail("Choose a date.");
  S.time.push({ id: uid(), jobId: j.id, minutes: Math.round(h * 60), rateCents: rate(), date, note: String(fd.get("note") || "").trim(), createdAt: now() });
  persistCore(); go("job", { id: j.id }, { replace: true }); toast("Time added");
};
acts.deltime = el => { S.time = S.time.filter(t => t.id !== el.dataset.id); persistCore(); go("job", ui.p, { replace: true }); };

/* ---------- photos ---------- */
document.addEventListener("change", async e => {
  if (e.target.id !== "job-photo") return;
  const file = e.target.files[0], jobId = e.target.dataset.job; e.target.value = ""; if (!file) return;
  const label = document.getElementById("photo-label")?.value || "Other";
  try {
    toast("Saving the photo…");
    const img = await shrinkImage(file, [[1000, .6], [800, .5], [600, .45], [450, .4]], 220000); if (!img) return fail("That photo is too detailed to store. Try again from a bit farther back.");
    await putFile({ id: uid(), jobId, kind: "photo", label, img, createdAt: now() });
    go("job", { id: jobId }, { replace: true }); toast("Photo saved");
  } catch (err) { fail("Couldn't save that photo. Check your connection and try again."); }
});
acts.viewphoto = async el => { const f = await getFile(el.dataset.id); if (!f) return; const w = window.open(); if (w) { w.document.write(`<img src="${f.img}" style="max-width:100%">`); w.document.close(); } };
acts.delphoto = el => { if (!confirmTap(el, "Tap again")) return; removeFile(el.dataset.id); go("job", ui.p, { replace: true }); };

/* ---------- lists ---------- */
const listOf = id => S.lists.find(l => l.id === id);
forms.addList = fd => { const name = String(fd.get("name") || "").trim(); if (!name) return; S.lists.push({ id: uid(), jobId: String(fd.get("jobId") || "") || null, name, items: [] }); persistCore(); go(ui.view, ui.p, { replace: true }); };
forms.addItem = fd => { const l = listOf(String(fd.get("listId"))), t = String(fd.get("text") || "").trim(); if (!l || !t) return; l.items.push({ id: uid(), text: t, done: false }); persistCore(); go(ui.view, ui.p, { replace: true }); };
acts.tickitem = el => { const l = listOf(el.dataset.list), i = l && l.items.find(x => x.id === el.dataset.id); if (i) { i.done = !i.done; persistCore(); go(ui.view, ui.p, { replace: true }); } };
acts.delitem = el => { const l = listOf(el.dataset.list); if (l) { l.items = l.items.filter(x => x.id !== el.dataset.id); persistCore(); go(ui.view, ui.p, { replace: true }); } };
acts.dellist = el => { if (!confirmTap(el, "Tap again")) return; S.lists = S.lists.filter(l => l.id !== el.dataset.id); persistCore(); go(ui.view, ui.p, { replace: true }); };
acts.copylist = el => { const l = listOf(el.dataset.id); if (l) copyText(l.name + "\n" + l.items.map(i => `${i.done ? "[x]" : "[ ]"} ${i.text}`).join("\n")); };

