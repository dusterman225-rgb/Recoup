// Quotes, invoices, change orders, deposits, signatures, price book, recurring invoices.
import { S, ui, VIEWS, forms, acts, AFTER, PARENT, go, back, backBtn, errBox, fail, toast, now, custName, customerSelect, jobSelect, needCustomer, confirmTap, copyText, esc, usd } from "./core.js";
import { persistCore, F, callFunction } from "./store.js";
import { todayStr, addDays, longDay, nextNumber, docTotals, money2, parseMoney, parsePercent, norm, documentHtml, plural, isDay, uid, daysBetween, jobContract, dueRecurring, addMonths } from "./lib.js";
import { itemsEditor, readDoc, afterEditor, signaturePad, initSignature, signatureImage } from "./kit.js";
import { hasKey } from "./ai.js";

const paper = (kind, doc, customer, job) => `<div class="paper-wrap">${documentHtml({ kind, doc, S, customer, job })}</div>`;
const quote = id => S.quotes.find(q => q.id === id), invoice = id => S.invoices.find(i => i.id === id), co = id => S.changeOrders.find(c => c.id === id);
const dueDays = () => S.profile.dueDays ?? 14;
const statusTone = s => ({ won: "ok", approved: "ok", paid: "ok", lost: "late", declined: "late" }[s] || "");

/* ---------- creating invoices (shared by editor, quotes, change orders, recurring) ---------- */
export function makeInvoice({ customerId, jobId = null, quoteId = null, coId = null, title = "", items, taxRate = 0, discountCents = 0, dueDate, notes = "", kind = "full" }) {
  const t = docTotals(items, taxRate, discountCents);
  const inv = { id: uid(), number: nextNumber(S.invoices, S.profile.invoicePrefix || "INV-"), customerId, jobId, quoteId, coId, kind, title, items, taxRate, discountCents, notes,
    amountCents: t.total, dueDate: dueDate || addDays(todayStr(), dueDays()), status: "unpaid", paidAt: null, createdAt: now() };
  S.invoices.push(inv); persistCore(); return inv;
}
function addToCatalog(items) {
  let n = 0;
  for (const it of items) {
    if (!(it.unitCents > 0) || S.catalog.some(c => norm(c.name) === norm(it.desc))) continue;
    S.catalog.push({ id: uid(), name: it.desc, unitCents: it.unitCents, kind: it.kind || "other" }); n++;
  }
  return n;
}

/* ================= quotes ================= */
VIEWS.quotes = () => {
  const order = { sent: 0, draft: 1, won: 2, lost: 3 };
  const list = S.quotes.slice().sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
  return `<div class="row between"><h1>Quotes</h1>${S.customers.length ? `<button class="btn hi small" data-go="quoteEdit">New quote</button>` : ""}</div>${errBox()}
  ${!S.customers.length ? needCustomer("a quote") : ""}
  ${list.length ? `<ul class="list">${list.map(q => `<li><button class="card link-card" data-go="quote" data-id="${q.id}"><div class="row between"><strong>${esc(q.title)}</strong><strong>${usd(q.amountCents)}</strong></div>
    <div class="row between"><span class="muted">${esc(q.number || "")} · ${esc(custName(q.customerId))}${q.sentAt ? " · sent " + longDay(q.sentAt) : ""}</span><span class="chip ${statusTone(q.status)}">${q.status}</span></div></button></li>`).join("")}</ul>` : S.customers.length ? `<div class="empty"><p class="muted">No quotes yet.</p><button class="btn hi" data-go="quoteEdit">Write your first quote</button></div>` : ""}`;
};
PARENT.quotes = "quotes";

VIEWS.quoteEdit = p => {
  const q = p.id ? quote(p.id) : null, src = q || (p.copy ? quote(p.copy) : null);
  return `${backBtn("Quotes")}<h1>${q ? "Edit quote" : "New quote"}</h1>${errBox()}
  <form class="card" data-form="saveQuote"><input type="hidden" name="id" value="${q ? q.id : ""}">
    <label>Customer${customerSelect("customerId", true, src?.customerId || p.customerId)}</label>
    <label>What is it for?<input name="title" value="${esc(src?.title || "")}" placeholder="Panel upgrade" required maxlength="160"></label>
    ${hasKey() ? `<details><summary>Draft the lines with AI</summary><div class="stack"><label>Describe the job<textarea name="aidesc" placeholder="Replace a 100 amp panel with 200 amp, 12 new circuits, permit" style="min-height:80px"></textarea></label>
      <button type="button" class="btn light small" data-act="aidraft" style="align-self:flex-start">Draft lines</button><p class="muted">The AI suggests lines and quantities only. Prices come from your price book, and anything unknown stays blank for you to fill in.</p></div></details>` : ""}
    ${itemsEditor(src?.items, { taxRate: src ? src.taxRate : (S.profile.taxRate || 0), discountCents: src?.discountCents || 0 })}
    <label>Notes for the customer <span class="hint">(optional)</span><textarea name="notes" maxlength="1500" style="min-height:80px">${esc(src?.notes || "")}</textarea></label>
    <div class="grid2"><label>Valid until<input name="validUntil" type="date" value="${esc(src?.validUntil && !p.copy ? src.validUntil : addDays(todayStr(), 30))}"></label>
    <label>Deposit % <span class="hint">(optional)</span><input name="depositPct" inputmode="decimal" value="${src?.depositPct ? esc(String(src.depositPct)) : (S.profile.depositPct || "")}" placeholder="30"></label></div>
    ${q ? "" : `<label>Status<select name="status"><option value="sent">Sent to the customer</option><option value="draft">Draft</option></select></label>`}
    <label class="check"><input type="checkbox" name="toCatalog" checked> <span>Save new lines to my price book</span></label>
    <button class="btn" type="submit">${q ? "Save changes" : "Save quote"}</button></form>`;
};
PARENT.quoteEdit = "quotes"; AFTER.quoteEdit = afterEditor;

forms.saveQuote = fd => {
  const form = document.querySelector('form[data-form="saveQuote"]'), id = String(fd.get("id") || ""), cid = String(fd.get("customerId") || ""), title = String(fd.get("title") || "").trim();
  if (!S.customers.some(c => c.id === cid)) return fail("Choose a customer."); if (!title) return fail("Say what the quote is for.");
  const d = readDoc(form); if (d.error) return fail(d.error);
  const valid = String(fd.get("validUntil") || ""); if (valid && !isDay(valid)) return fail("Choose a valid-until date.");
  const dep = parsePercent(fd.get("depositPct")); if (dep === null) return fail("Enter the deposit as a percent from 0 to 100.");
  const t = docTotals(d.items, d.taxRate, d.discountCents);
  let q = id ? quote(id) : null;
  if (q) Object.assign(q, { customerId: cid, title, items: d.items, taxRate: d.taxRate, discountCents: d.discountCents, amountCents: t.total, notes: String(fd.get("notes") || "").trim(), validUntil: valid || null, depositPct: dep });
  else {
    const sent = fd.get("status") === "sent";
    q = { id: uid(), number: nextNumber(S.quotes, S.profile.quotePrefix || "Q-"), customerId: cid, title, items: d.items, taxRate: d.taxRate, discountCents: d.discountCents, amountCents: t.total, notes: String(fd.get("notes") || "").trim(),
      validUntil: valid || null, depositPct: dep, status: sent ? "sent" : "draft", sentAt: sent ? todayStr() : null, lastContactAt: null, signature: null, createdAt: now() };
    S.quotes.push(q);
  }
  const added = fd.get("toCatalog") ? addToCatalog(d.items) : 0;
  persistCore(); go("quote", { id: q.id }, { replace: true }); toast(added ? `Saved. ${plural(added, "line")} added to your price book.` : "Quote saved");
};

VIEWS.quote = p => {
  const q = quote(p.id); if (!q) return VIEWS.quotes();
  const c = S.customers.find(x => x.id === q.customerId), job = S.jobs.find(j => j.quoteId === q.id);
  const billed = S.invoices.filter(i => i.quoteId === q.id).reduce((s, i) => s + i.amountCents, 0), left = q.amountCents - billed;
  return `${backBtn("Quotes")}${errBox()}
  <div class="row between noprint"><span class="chip ${statusTone(q.status)}">${q.status}</span><span class="muted">${q.validUntil ? "Valid until " + longDay(q.validUntil) : ""}</span></div>
  ${paper("quote", q, c, job)}
  <section class="card noprint"><div class="row">
    <button class="btn small" data-act="print">Print or save as PDF</button>
    ${q.status === "draft" ? `<button class="btn small hi" data-act="qstatus" data-id="${q.id}" data-status="sent">Mark sent</button>` : ""}
    ${q.status === "sent" ? `<button class="btn small hi" data-act="qstatus" data-id="${q.id}" data-status="won">Won</button><button class="btn small light" data-act="qstatus" data-id="${q.id}" data-status="lost">Lost</button><button class="btn small light" data-act="contact" data-id="${q.id}">I followed up</button>` : ""}
    ${q.status === "lost" ? `<button class="btn small light" data-act="qstatus" data-id="${q.id}" data-status="sent">Reopen</button>` : ""}
    ${!q.signature && q.status !== "lost" ? `<button class="btn small light" data-go="sign" data-kind="quote" data-id="${q.id}">Get customer signature</button>` : ""}
    ${q.status === "draft" || q.status === "sent" ? `<button class="btn small light" data-go="quoteEdit" data-id="${q.id}">Edit</button>` : ""}
    <button class="btn small light" data-go="quoteEdit" data-copy="${q.id}">Copy as new</button></div>
    ${c && c.email ? `<p class="muted">To email this: save it as a PDF, then attach it to your own email to ${esc(c.email)}.</p>` : ""}</section>
  ${q.status === "won" ? `<section class="card noprint"><h2>Billing</h2>
    <p class="muted">Billed ${usd(billed)} of ${usd(q.amountCents)}. ${left > 0 ? usd(left) + " not yet billed." : "Fully billed."}</p>
    ${left > 0 ? `<form data-form="billQuote" class="stack"><input type="hidden" name="id" value="${q.id}">
      <label>Invoice for<select name="mode"><option value="deposit">A deposit</option><option value="progress">A progress payment</option><option value="balance">The remaining balance (${usd(left)})</option></select></label>
      <label>Percent of the quote <span class="hint">(ignored for the remaining balance)</span><input name="pct" inputmode="decimal" value="${esc(String(q.depositPct || 30))}"></label>
      <button class="btn" type="submit">Create invoice</button><p class="muted">Amounts already include the quote's tax.</p></form>` : ""}
    ${job ? `<button class="btn light small" data-go="job" data-id="${job.id}">Open the job</button>` : `<button class="btn hi small" data-act="quote2job" data-id="${q.id}">Start the job</button>`}</section>` : ""}
  <button class="btn light block noprint" data-act="delquote" data-id="${q.id}">Delete this quote</button>`;
};

acts.print = () => window.print();
acts.qstatus = el => {
  const q = quote(el.dataset.id), s = el.dataset.status; if (!q) return;
  q.status = s; if (s === "sent" && !q.sentAt) q.sentAt = todayStr(); persistCore();
  toast(s === "won" ? "Marked won" : s === "lost" ? "Marked lost" : "Marked sent"); if (ui.view === "home") go("home"); else go(ui.view, ui.p, { replace: true });
};
acts.contact = el => { const q = quote(el.dataset.id); if (q) { q.lastContactAt = todayStr(); persistCore(); toast("Logged. The clock restarts."); go(ui.view, ui.p, { replace: true }); } };
acts.quote2job = el => {
  const q = quote(el.dataset.id); if (!q) return;
  const j = { id: uid(), title: q.title, customerId: q.customerId, quoteId: q.id, budgetCents: 0, status: "open", address: S.customers.find(c => c.id === q.customerId)?.address || "", createdAt: now() };
  S.jobs.push(j); persistCore(); go("job", { id: j.id }); toast("Job started. Set a budget.");
};
acts.delquote = el => {
  const q = quote(el.dataset.id); if (!q || !confirmTap(el, "Tap again to delete")) return;
  if (S.invoices.some(i => i.quoteId === q.id) || S.jobs.some(j => j.quoteId === q.id)) return fail("This quote has an invoice or a job. Delete those first, or mark it lost instead.");
  S.quotes = S.quotes.filter(x => x.id !== q.id); persistCore(); go("quotes"); toast("Quote deleted");
};
forms.billQuote = fd => {
  const q = quote(String(fd.get("id"))); if (!q) return;
  const mode = String(fd.get("mode")), pct = parsePercent(fd.get("pct")), billed = S.invoices.filter(i => i.quoteId === q.id).reduce((s, i) => s + i.amountCents, 0), left = q.amountCents - billed;
  let amount, desc;
  if (mode === "balance") { amount = left; desc = `Balance for ${q.title}`; }
  else { if (!pct) return fail("Enter a percent between 1 and 100."); amount = Math.round(q.amountCents * pct / 100); desc = `${pct}% ${mode === "deposit" ? "deposit" : "progress payment"} for ${q.title}`; }
  if (amount <= 0) return fail("Nothing left to bill on this quote."); if (amount > left) return fail(`That is more than the ${usd(left)} still unbilled.`);
  const job = S.jobs.find(j => j.quoteId === q.id);
  const inv = makeInvoice({ customerId: q.customerId, jobId: job?.id || null, quoteId: q.id, title: q.title, kind: mode, items: [{ desc, qty: 1, unitCents: amount, tax: false, kind: "other" }], notes: q.taxRate ? `Includes tax from quote ${q.number}.` : "" });
  go("invoice", { id: inv.id }); toast("Invoice created");
};

/* ================= signatures (quotes and change orders) ================= */
VIEWS.sign = p => {
  const d = p.kind === "change" ? co(p.id) : quote(p.id); if (!d) return VIEWS.home();
  const cname = p.kind === "change" ? custName(S.jobs.find(j => j.id === d.jobId)?.customerId) : custName(d.customerId);
  return `${backBtn("Cancel")}<h1>Customer signature</h1>${errBox()}
  <section class="card"><strong>${esc(d.title)}</strong><span class="muted">${esc(d.number || "")} · ${usd(d.amountCents)} · ${esc(cname)}</span></section>
  <form class="card" data-form="saveSignature"><input type="hidden" name="kind" value="${esc(p.kind)}"><input type="hidden" name="id" value="${esc(p.id)}">
    <label>Customer's printed name<input name="name" value="${esc(cname === "No customer" ? "" : cname)}" required maxlength="120" autocomplete="off"></label>
    <p class="muted">Hand the phone to the customer. Sign with a finger in the box.</p>${signaturePad()}
    <label class="check"><input type="checkbox" name="agree" required> <span>I agree to ${p.kind === "change" ? "this change order" : "this quote"} for ${usd(d.amountCents)}.</span></label>
    <button class="btn hi" type="submit">Save signature</button></form>`;
};
PARENT.sign = "quotes"; AFTER.sign = initSignature;
forms.saveSignature = fd => {
  const kind = String(fd.get("kind")), d = kind === "change" ? co(String(fd.get("id"))) : quote(String(fd.get("id"))); if (!d) return;
  const name = String(fd.get("name") || "").trim(), img = signatureImage();
  if (!name) return fail("Enter the customer's name."); if (!img) return fail("Ask the customer to sign in the box first.");
  d.signature = { img, name, at: now() };
  if (kind === "change") { d.status = "approved"; d.approvedAt = todayStr(); } else { d.status = "won"; if (!d.sentAt) d.sentAt = todayStr(); }
  persistCore(); go(kind === "change" ? "changeOrder" : "quote", { id: d.id }, { replace: true }); toast(kind === "change" ? "Change order approved" : "Quote accepted and marked won");
};

/* ================= invoices ================= */
VIEWS.invoices = () => {
  const today = todayStr();
  const list = S.invoices.slice().sort((a, b) => (a.status === "unpaid" ? 0 : 1) - (b.status === "unpaid" ? 0 : 1) || a.dueDate.localeCompare(b.dueDate));
  return `<div class="row between"><h1>Invoices</h1>${S.customers.length ? `<button class="btn hi small" data-go="invoiceEdit">New invoice</button>` : ""}</div>${errBox()}
  ${!S.customers.length ? needCustomer("an invoice") : ""}
  ${list.length ? `<ul class="list">${list.map(i => { const late = i.status === "unpaid" && i.dueDate < today, d = late ? daysBetween(i.dueDate, today) : 0;
    return `<li class="card ticket ${late ? "late" : ""}"><button class="link-card plain" data-go="invoice" data-id="${i.id}"><div class="row between"><strong>${esc(i.number)} · ${esc(custName(i.customerId))}</strong><strong>${usd(i.amountCents)}</strong></div>
    <div class="row between"><span class="muted">${i.status === "paid" ? "Paid " + longDay(i.paidAt) : "Due " + longDay(i.dueDate)}</span><span class="chip ${i.status === "paid" ? "ok" : late ? "late" : ""}">${i.status === "paid" ? "paid" : late ? plural(d, "day") + " overdue" : "unpaid"}</span></div></button>
    ${i.status === "unpaid" ? `<div class="row"><button class="btn small light" data-act="paidnow" data-id="${i.id}">Mark paid today</button></div>` : ""}</li>`; }).join("")}</ul>` : S.customers.length ? `<div class="empty"><p class="muted">No invoices yet.</p><button class="btn hi" data-go="invoiceEdit">Write your first invoice</button></div>` : ""}`;
};
PARENT.invoices = "invoices";

VIEWS.invoiceEdit = p => {
  const inv = p.id ? invoice(p.id) : null, src = inv || (p.copy ? invoice(p.copy) : null);
  return `${backBtn("Invoices")}<h1>${inv ? "Edit invoice" : "New invoice"}</h1>${errBox()}
  <form class="card" data-form="saveInvoice"><input type="hidden" name="id" value="${inv ? inv.id : ""}">
    <label>Customer${customerSelect("customerId", true, src?.customerId || p.customerId)}</label>
    ${S.jobs.length ? `<label>Job <span class="hint">(optional)</span>${jobSelect("jobId", src?.jobId || p.jobId)}</label>` : ""}
    <label>What is it for? <span class="hint">(optional)</span><input name="title" value="${esc(src?.title || "")}" maxlength="160" placeholder="Kitchen rewire"></label>
    ${itemsEditor(src?.items, { taxRate: src ? src.taxRate : (S.profile.taxRate || 0), discountCents: src?.discountCents || 0 })}
    <label>Notes <span class="hint">(optional)</span><textarea name="notes" maxlength="1500" style="min-height:70px">${esc(src?.notes || "")}</textarea></label>
    <label>Due date<input name="due" type="date" value="${esc(inv ? inv.dueDate : addDays(todayStr(), dueDays()))}" required></label>
    <label class="check"><input type="checkbox" name="toCatalog" checked> <span>Save new lines to my price book</span></label>
    <button class="btn" type="submit">${inv ? "Save changes" : "Save invoice"}</button></form>`;
};
PARENT.invoiceEdit = "invoices"; AFTER.invoiceEdit = afterEditor;
forms.saveInvoice = fd => {
  const form = document.querySelector('form[data-form="saveInvoice"]'), id = String(fd.get("id") || ""), cid = String(fd.get("customerId") || ""), due = String(fd.get("due") || "");
  if (!S.customers.some(c => c.id === cid)) return fail("Choose a customer."); if (!isDay(due)) return fail("Choose a due date.");
  const d = readDoc(form); if (d.error) return fail(d.error);
  const t = docTotals(d.items, d.taxRate, d.discountCents), jobId = String(fd.get("jobId") || "") || null, title = String(fd.get("title") || "").trim(), notes = String(fd.get("notes") || "").trim();
  let inv = id ? invoice(id) : null;
  if (inv) Object.assign(inv, { customerId: cid, jobId, title, items: d.items, taxRate: d.taxRate, discountCents: d.discountCents, amountCents: t.total, dueDate: due, notes });
  else inv = makeInvoice({ customerId: cid, jobId, title, items: d.items, taxRate: d.taxRate, discountCents: d.discountCents, dueDate: due, notes });
  if (fd.get("toCatalog")) addToCatalog(d.items);
  persistCore(); go("invoice", { id: inv.id }, { replace: true }); toast("Invoice saved");
};

VIEWS.invoice = p => {
  const i = invoice(p.id); if (!i) return VIEWS.invoices();
  const c = S.customers.find(x => x.id === i.customerId), job = S.jobs.find(j => j.id === i.jobId), today = todayStr();
  const late = i.status === "unpaid" && i.dueDate < today, d = late ? daysBetween(i.dueDate, today) : 0;
  const doc = i.items && i.items.length ? i : { ...i, items: [{ desc: i.title || "Services", qty: 1, unitCents: i.amountCents, tax: false }], taxRate: 0 };
  return `${backBtn("Invoices")}${errBox()}
  <div class="row between noprint"><span class="chip ${i.status === "paid" ? "ok" : late ? "late" : ""}">${i.status === "paid" ? "paid " + longDay(i.paidAt) + (i.paidMethod ? " · " + esc(i.paidMethod) : "") : late ? plural(d, "day") + " overdue" : "unpaid"}</span></div>
  ${paper("invoice", doc, c, job)}
  <section class="card noprint"><div class="row"><button class="btn small" data-act="print">Print or save as PDF</button>
    ${i.status === "unpaid" ? `<button class="btn small light" data-go="invoiceEdit" data-id="${i.id}">Edit</button>` : ""}
    <button class="btn small light" data-go="invoiceEdit" data-copy="${i.id}">Copy as new</button>
    ${late ? `<button class="btn small light" data-go="queue">Draft a reminder</button>` : ""}
    ${S.profile.payUrl && i.status === "unpaid" ? `<button class="btn small light" data-act="copy" data-text="${esc(S.profile.payUrl)}">Copy my pay link</button>` : ""}
    ${i.status === "unpaid" ? `<button class="btn small light" data-act="onlinelink" data-id="${i.id}">Card payment link</button>` : ""}</div>
    ${ui.p.link && ui.p.id === i.id ? `<p class="ev"><span class="chip ok">Link ready</span><span style="overflow-wrap:anywhere">${esc(ui.p.link)}</span></p><button class="btn small" data-act="copy" data-text="${esc(ui.p.link)}">Copy link</button>` : ""}
    ${c && c.email ? `<p class="muted">To email this invoice: save it as a PDF, then attach it to your own email to ${esc(c.email)}.</p>` : ""}</section>
  ${i.status === "unpaid" ? `<form class="card noprint" data-form="markPaid"><h2>Record a payment</h2><input type="hidden" name="id" value="${i.id}">
    <div class="grid2"><label>Date paid<input name="date" type="date" value="${today}" required></label>
    <label>How<select name="method"><option>Check</option><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Other</option></select></label></div>
    <button class="btn hi" type="submit">Mark paid</button></form>` : `<button class="btn light block noprint" data-act="unpay" data-id="${i.id}">Mark as unpaid</button>`}
  <button class="btn light block noprint" data-act="delinvoice" data-id="${i.id}">Delete this invoice</button>`;
};
acts.paidnow = el => { const i = invoice(el.dataset.id); if (i) { i.status = "paid"; i.paidAt = todayStr(); persistCore(); toast("Marked paid"); go(ui.view, ui.p, { replace: true }); } };
acts.paid = acts.paidnow;
forms.markPaid = fd => {
  const i = invoice(String(fd.get("id"))), date = String(fd.get("date")); if (!i) return; if (!isDay(date)) return fail("Choose the date it was paid.");
  i.status = "paid"; i.paidAt = date; i.paidMethod = String(fd.get("method") || ""); persistCore(); go("invoice", { id: i.id }, { replace: true }); toast("Marked paid");
};
acts.unpay = el => { const i = invoice(el.dataset.id); if (i) { i.status = "unpaid"; i.paidAt = null; i.paidMethod = ""; persistCore(); go("invoice", { id: i.id }, { replace: true }); } };
acts.delinvoice = el => {
  const i = invoice(el.dataset.id); if (!i || !confirmTap(el, "Tap again to delete")) return;
  S.invoices = S.invoices.filter(x => x.id !== i.id); persistCore(); go("invoices"); toast("Invoice deleted");
};
// Card payments through Stripe. Needs the paid Firebase plan and a Stripe account (README section 6).
acts.onlinelink = async el => {
  const i = invoice(el.dataset.id); if (!i || ui.busy) return;
  if (!F.payments) return toast("Card payments aren't set up yet. See README section 6.");
  ui.busy = true; toast("Making the link…");
  try { const r = await callFunction("createCheckout", { invoiceId: i.id, origin: location.origin }); if (!r || !r.url) throw new Error("no link"); go("invoice", { id: i.id, link: r.url }, { replace: true }); }
  catch (e) { toast("Couldn't make the payment link. Check the setup in the README."); } finally { ui.busy = false; }
};

/* ================= change orders ================= */
VIEWS.coEdit = p => {
  const c = p.id ? co(p.id) : null, job = S.jobs.find(j => j.id === (c?.jobId || p.jobId)); if (!job) return VIEWS.jobs();
  return `${backBtn("Job")}<h1>${c ? "Edit change order" : "New change order"}</h1><p class="muted">${esc(job.title)}</p>${errBox()}
  <form class="card" data-form="saveCo"><input type="hidden" name="id" value="${c ? c.id : ""}"><input type="hidden" name="jobId" value="${job.id}">
    <label>What changed?<input name="title" value="${esc(c?.title || "")}" placeholder="Add 4 recessed lights in the hallway" required maxlength="160"></label>
    ${itemsEditor(c?.items, { taxRate: c ? c.taxRate : (S.profile.taxRate || 0), discountCents: c?.discountCents || 0 })}
    <label>Notes <span class="hint">(optional)</span><textarea name="notes" maxlength="1500" style="min-height:70px">${esc(c?.notes || "")}</textarea></label>
    <button class="btn" type="submit">Save change order</button></form>`;
};
PARENT.coEdit = "jobs"; AFTER.coEdit = afterEditor;
forms.saveCo = fd => {
  const form = document.querySelector('form[data-form="saveCo"]'), job = S.jobs.find(j => j.id === String(fd.get("jobId"))), title = String(fd.get("title") || "").trim(), id = String(fd.get("id") || "");
  if (!job) return; if (!title) return fail("Say what changed.");
  const d = readDoc(form); if (d.error) return fail(d.error); const t = docTotals(d.items, d.taxRate, d.discountCents);
  let c = id ? co(id) : null;
  if (c) Object.assign(c, { title, items: d.items, taxRate: d.taxRate, discountCents: d.discountCents, amountCents: t.total, notes: String(fd.get("notes") || "").trim() });
  else { c = { id: uid(), number: nextNumber(S.changeOrders, "CO-"), jobId: job.id, title, items: d.items, taxRate: d.taxRate, discountCents: d.discountCents, amountCents: t.total, notes: String(fd.get("notes") || "").trim(), status: "draft", signature: null, createdAt: now() }; S.changeOrders.push(c); }
  persistCore(); go("changeOrder", { id: c.id }, { replace: true }); toast("Change order saved");
};
VIEWS.changeOrder = p => {
  const c = co(p.id); if (!c) return VIEWS.jobs();
  const job = S.jobs.find(j => j.id === c.jobId), cust = S.customers.find(x => x.id === job?.customerId), invoiced = S.invoices.some(i => i.coId === c.id);
  return `${backBtn("Job")}${errBox()}<div class="row between noprint"><span class="chip ${statusTone(c.status)}">${c.status}</span></div>
  ${paper("change", c, cust, job)}
  <section class="card noprint"><div class="row"><button class="btn small" data-act="print">Print or save as PDF</button>
    ${c.status === "draft" ? `<button class="btn small hi" data-act="costatus" data-id="${c.id}" data-status="sent">Mark sent</button>` : ""}
    ${c.status === "sent" || c.status === "draft" ? `<button class="btn small hi" data-go="sign" data-kind="change" data-id="${c.id}">Get customer signature</button><button class="btn small light" data-act="costatus" data-id="${c.id}" data-status="approved">Approved without signature</button><button class="btn small light" data-act="costatus" data-id="${c.id}" data-status="declined">Declined</button>` : ""}
    ${c.status !== "approved" ? `<button class="btn small light" data-go="coEdit" data-id="${c.id}">Edit</button>` : ""}
    ${c.status === "approved" && !invoiced ? `<button class="btn small hi" data-act="coinvoice" data-id="${c.id}">Invoice this change order</button>` : ""}</div>
    ${c.status === "approved" ? `<p class="muted">Approved. It raises this job's contract value to ${usd(job ? jobContract(S, job) : c.amountCents)}.</p>` : ""}</section>
  <button class="btn light block noprint" data-act="delco" data-id="${c.id}">Delete this change order</button>`;
};
PARENT.changeOrder = "jobs";
acts.costatus = el => { const c = co(el.dataset.id); if (!c) return; c.status = el.dataset.status; if (c.status === "approved") c.approvedAt = todayStr(); persistCore(); go("changeOrder", { id: c.id }, { replace: true }); };
acts.coinvoice = el => {
  const c = co(el.dataset.id), job = c && S.jobs.find(j => j.id === c.jobId); if (!c || !job) return;
  if (!job.customerId) return fail("Add a customer to this job first.");
  const inv = makeInvoice({ customerId: job.customerId, jobId: job.id, coId: c.id, title: `${c.number}: ${c.title}`, kind: "change", items: c.items, taxRate: c.taxRate, discountCents: c.discountCents, notes: c.notes });
  go("invoice", { id: inv.id }); toast("Invoice created");
};
acts.delco = el => { const c = co(el.dataset.id); if (!c || !confirmTap(el, "Tap again to delete")) return; S.changeOrders = S.changeOrders.filter(x => x.id !== c.id); persistCore(); back(); toast("Deleted"); };

/* ================= price book ================= */
VIEWS.catalog = () => `${backBtn("More")}<h1>Price book</h1><p class="muted">Items you sell often. They fill in on quotes and invoices when you type the name.</p>${errBox()}
  <form class="card" data-form="addCatalog"><label>Name<input name="name" placeholder="200 amp panel, installed" required maxlength="200"></label>
    <div class="grid2"><label>Price each<input name="price" inputmode="decimal" placeholder="0.00" required></label>
    <label>Type<select name="kind"><option value="material">Material</option><option value="labor">Labor</option><option value="other">Other</option></select></label></div>
    <button class="btn" type="submit">Add to price book</button></form>
  ${S.catalog.length ? `<ul class="list">${S.catalog.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<li class="card"><form data-form="editCatalog" class="row between" style="flex-wrap:wrap"><input type="hidden" name="id" value="${c.id}">
    <strong style="flex:1 1 100%">${esc(c.name)}</strong><span class="muted">${esc(c.kind)}</span><input name="price" inputmode="decimal" value="${money2(c.unitCents)}" aria-label="Price" style="width:110px"><button class="btn small light" type="submit">Update</button><button type="button" class="btn small light" data-act="delcatalog" data-id="${c.id}">Delete</button></form></li>`).join("")}</ul>` : `<div class="empty"><p class="muted">Empty. Items are added here when you save a quote or invoice, or add them above.</p></div>`}`;
PARENT.catalog = "more";
forms.addCatalog = fd => {
  const name = String(fd.get("name") || "").trim(), price = parseMoney(fd.get("price")); if (!name) return fail("Name the item."); if (price === null) return fail("Enter the price as a plain number, for example 85.00.");
  if (S.catalog.some(c => norm(c.name) === norm(name))) return fail("That item is already in the price book.");
  S.catalog.push({ id: uid(), name, unitCents: price, kind: ["material", "labor", "other"].includes(fd.get("kind")) ? fd.get("kind") : "other" }); persistCore(); go("catalog", {}, { replace: true }); toast("Added");
};
forms.editCatalog = fd => { const c = S.catalog.find(x => x.id === String(fd.get("id"))), p = parseMoney(fd.get("price")); if (!c) return; if (p === null) return fail("Enter the price as a plain number."); c.unitCents = p; persistCore(); toast("Updated"); };
acts.delcatalog = el => { S.catalog = S.catalog.filter(c => c.id !== el.dataset.id); persistCore(); go("catalog", {}, { replace: true }); };

/* ================= recurring invoices ================= */
VIEWS.recurring = () => `${backBtn("More")}<h1>Recurring invoices</h1><p class="muted">For customers you bill every month or so. Recoup creates each invoice for you to review when you open the app on or after its date. It never emails them.</p>${errBox()}
  ${S.customers.length ? `<div class="row"><button class="btn hi small" data-go="recurEdit">New recurring invoice</button></div>` : needCustomer("a recurring invoice")}
  ${S.recurring.length ? `<ul class="list">${S.recurring.map(r => { const t = docTotals(r.items, r.taxRate, 0); return `<li class="card"><div class="row between"><strong>${esc(r.title)}</strong><strong>${usd(t.total)}</strong></div>
    <span class="muted">${esc(custName(r.customerId))} · every ${r.intervalMonths === 1 ? "month" : r.intervalMonths + " months"} · next ${longDay(r.nextDate)}${r.active ? "" : " · paused"}</span>
    <div class="row"><button class="btn small light" data-go="recurEdit" data-id="${r.id}">Edit</button><button class="btn small light" data-act="recurnow" data-id="${r.id}">Create one now</button><button class="btn small light" data-act="recurtoggle" data-id="${r.id}">${r.active ? "Pause" : "Resume"}</button><button class="btn small light" data-act="recurdel" data-id="${r.id}">Delete</button></div></li>`; }).join("")}</ul>` : S.customers.length ? `<div class="empty"><p class="muted">None yet.</p></div>` : ""}`;
PARENT.recurring = "more";
VIEWS.recurEdit = p => {
  const r = p.id ? S.recurring.find(x => x.id === p.id) : null;
  return `${backBtn("Recurring invoices")}<h1>${r ? "Edit recurring invoice" : "New recurring invoice"}</h1>${errBox()}
  <form class="card" data-form="saveRecur"><input type="hidden" name="id" value="${r ? r.id : ""}">
    <label>Customer${customerSelect("customerId", true, r?.customerId)}</label>
    <label>What is it for?<input name="title" value="${esc(r?.title || "")}" placeholder="Monthly lawn care" required maxlength="160"></label>
    ${itemsEditor(r?.items, { taxRate: r ? r.taxRate : (S.profile.taxRate || 0) })}
    <div class="grid2"><label>Repeat every<select name="interval">${[1, 2, 3, 6, 12].map(n => `<option value="${n}" ${r?.intervalMonths === n ? "selected" : ""}>${n === 1 ? "month" : n + " months"}</option>`).join("")}</select></label>
    <label>First invoice on<input name="start" type="date" value="${esc(r ? r.nextDate : todayStr())}" required></label></div>
    <button class="btn" type="submit">Save</button></form>`;
};
PARENT.recurEdit = "more"; AFTER.recurEdit = afterEditor;
forms.saveRecur = fd => {
  const form = document.querySelector('form[data-form="saveRecur"]'), id = String(fd.get("id") || ""), cid = String(fd.get("customerId") || ""), title = String(fd.get("title") || "").trim(), start = String(fd.get("start") || "");
  if (!S.customers.some(c => c.id === cid)) return fail("Choose a customer."); if (!title) return fail("Say what it is for."); if (!isDay(start)) return fail("Choose the first invoice date.");
  const d = readDoc(form); if (d.error) return fail(d.error);
  const r = id ? S.recurring.find(x => x.id === id) : null, fields = { customerId: cid, title, items: d.items, taxRate: d.taxRate, intervalMonths: parseInt(fd.get("interval"), 10) || 1, nextDate: start };
  if (r) Object.assign(r, fields); else S.recurring.push({ id: uid(), active: true, createdAt: now(), ...fields });
  persistCore(); go("recurring", {}, { replace: true }); toast("Saved");
};
function createFromTemplate(r, date) {
  return makeInvoice({ customerId: r.customerId, title: r.title, items: r.items, taxRate: r.taxRate, dueDate: addDays(date, dueDays()), notes: "", kind: "recurring" });
}
acts.recurnow = el => { const r = S.recurring.find(x => x.id === el.dataset.id); if (!r) return; const inv = createFromTemplate(r, todayStr()); go("invoice", { id: inv.id }); toast("Invoice created"); };
acts.recurtoggle = el => { const r = S.recurring.find(x => x.id === el.dataset.id); if (r) { r.active = !r.active; persistCore(); go("recurring", {}, { replace: true }); } };
acts.recurdel = el => { if (!confirmTap(el, "Tap again to delete")) return; S.recurring = S.recurring.filter(x => x.id !== el.dataset.id); persistCore(); go("recurring", {}, { replace: true }); };
// Runs when the app opens. Creates any invoices that came due and moves each template forward.
export function runRecurring() {
  const due = dueRecurring(S, todayStr()).filter(x => S.customers.some(c => c.id === x.template.customerId)); let n = 0;
  for (const { template, date } of due) { createFromTemplate(template, date); template.nextDate = addMonths(date, template.intervalMonths || 1); n++; }
  if (n) persistCore();
  return n;
}

