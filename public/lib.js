// Pure logic for Recoup. No page, no Firebase. Everything here is covered by tests (tests/lib.test.mjs).
//
// Labels used in findings:
//   verified   read directly from the owner's records
//   estimate   computed from records, with the method stated
//   hypothesis a possible explanation the data cannot confirm
// Nothing here claims a problem is fixed. Fixing happens when the owner acts.

/* ---------- the shape of one business's data ---------- */
export const CORE_KEYS = ["profile", "customers", "catalog", "quotes", "jobs", "costs", "invoices", "changeOrders", "time", "timer", "trips", "activeTrip", "events", "recurring", "subs", "compliance", "lists", "bills", "snoozed", "reviewAsked"];
export const freshState = () => ({
  profile: { name: "", type: null }, customers: [], catalog: [], quotes: [], jobs: [], costs: [], invoices: [], changeOrders: [],
  time: [], timer: null, trips: [], activeTrip: null, events: [], recurring: [], subs: [], compliance: [], lists: [], bills: [],
  snoozed: {}, reviewAsked: {},
  // loaded from their own collections, not saved in the main record:
  receipts: [], files: [], outbox: [], payments: [], leads: []
});

/* ---------- basics ---------- */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export const usd = c => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const pad2 = n => String(n).padStart(2, "0");
export const dateStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
export const dayNum = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const daysBetween = (a, b) => Math.round(dayNum(b) - dayNum(a));
const utcStr = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
export const addDays = (s, n) => utcStr(new Date(dayNum(s) * 86400000 + n * 86400000));
export function addMonths(s, n) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number), t = (m - 1) + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${pad2(mm + 1)}-${pad2(Math.min(d, last))}`;
}
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
export const longDay = s => s ? new Date(s.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
export const weekdayDay = s => new Date(s.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
export const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function parseMoney(raw) {
  const s = String(raw ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(parseFloat(s) * 100);
  return c > 100000000000 ? null : c;
}
export function parseQty(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = parseFloat(s);
  return n > 0 && n < 1e7 ? n : null;
}
export function parsePercent(raw) {
  const s = String(raw ?? "").trim().replace(/%$/, "");
  if (s === "") return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = parseFloat(s);
  return n <= 100 ? n : null;
}
export const money2 = c => (c / 100).toFixed(2);
export const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/* ---------- documents: line items, tax, totals ---------- */
export const lineTotal = it => Math.round((Number(it.qty) || 0) * (Number(it.unitCents) || 0));
export function docTotals(items, taxRate = 0, discountCents = 0) {
  const list = Array.isArray(items) ? items : [];
  const subtotal = list.reduce((s, i) => s + lineTotal(i), 0);
  const taxableSub = list.filter(i => i.tax !== false).reduce((s, i) => s + lineTotal(i), 0);
  const discount = Math.min(Math.max(0, Math.round(Number(discountCents) || 0)), subtotal);
  const ratio = subtotal ? 1 - discount / subtotal : 1;
  const tax = Math.round(taxableSub * ratio * (Number(taxRate) || 0) / 100);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}
export function nextNumber(list, prefix) {
  const max = list.reduce((m, x) => { const n = parseInt(String(x.number || "").replace(/\D/g, ""), 10); return n > m ? n : m; }, 0);
  return prefix + String(max + 1).padStart(4, "0");
}
// Clean the items a form submitted: drops empty rows, rejects bad numbers.
export function cleanItems(rows) {
  const out = [];
  for (const r of rows) {
    const desc = String(r.desc || "").trim();
    if (!desc && !String(r.qty || "").trim() && !String(r.price || "").trim()) continue;
    if (!desc) return { error: "Every line needs a description." };
    const qty = parseQty(r.qty === "" || r.qty == null ? "1" : r.qty);
    if (qty === null) return { error: `Check the quantity on "${desc.slice(0, 40)}".` };
    const unitCents = parseMoney(r.price === "" || r.price == null ? "0" : r.price);
    if (unitCents === null) return { error: `Check the price on "${desc.slice(0, 40)}".` };
    out.push({ desc: desc.slice(0, 200), qty, unitCents, tax: r.tax !== false, kind: ["material", "labor", "other"].includes(r.kind) ? r.kind : "other" });
  }
  if (!out.length) return { error: "Add at least one line." };
  if (out.length > 60) return { error: "That is more than 60 lines. Split it into two documents." };
  return { items: out };
}
// Contract value of a job: the accepted quote plus approved change orders.
export function jobContract(S, job) {
  const q = job.quoteId ? S.quotes.find(x => x.id === job.quoteId) : null;
  const base = q ? q.amountCents : (job.contractCents || 0);
  const co = S.changeOrders.filter(c => c.jobId === job.id && c.status === "approved").reduce((s, c) => s + c.amountCents, 0);
  return base + co;
}

/* ---------- time ---------- */
export const entryCost = e => Math.round((e.minutes || 0) / 60 * (e.rateCents || 0));
export const minutesBetween = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
export const hoursText = m => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

/* ---------- job money ---------- */
export function jobCost(S, jobId) {
  const direct = S.costs.filter(c => c.jobId === jobId).reduce((s, c) => s + c.amountCents, 0);
  const timed = S.time.filter(t => t.jobId === jobId).reduce((s, t) => s + entryCost(t), 0);
  return direct + timed;
}
export function jobFinancials(S, job) {
  const costs = S.costs.filter(c => c.jobId === job.id), by = { material: 0, labor: 0, sub: 0, other: 0 };
  costs.forEach(c => { by[c.kind in by ? c.kind : "other"] += c.amountCents; });
  const timeMin = S.time.filter(t => t.jobId === job.id).reduce((s, t) => s + (t.minutes || 0), 0);
  const timeCost = S.time.filter(t => t.jobId === job.id).reduce((s, t) => s + entryCost(t), 0);
  const inv = S.invoices.filter(i => i.jobId === job.id);
  const billed = inv.reduce((s, i) => s + i.amountCents, 0), paid = inv.filter(i => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
  const contract = jobContract(S, job), totalCost = by.material + by.labor + by.sub + by.other + timeCost;
  return { contract, billed, paid, unbilled: Math.max(0, contract - billed), by, timeMin, timeCost, totalCost,
    profitBilled: billed - totalCost, expectedProfit: contract ? contract - totalCost : null,
    margin: billed > 0 ? (billed - totalCost) / billed : null };
}

/* ---------- findings ---------- */
function greeting(name) { const f = (name || "").trim().split(/\s+/)[0]; return f ? `Hi ${f},` : "Hi,"; }
export function invoiceTone(d) { return d <= 14 ? "friendly" : d <= 30 ? "firm" : "final"; }
const payLine = S => (S.profile.payUrl ? `\n\nYou can pay online here: ${S.profile.payUrl}` : "");
export function invoiceReminder(S, inv, c, late) {
  const biz = S.profile.name || "Your business", tone = invoiceTone(late), amt = usd(inv.amountCents), due = longDay(inv.dueDate);
  let subject, mid;
  if (tone === "friendly") { subject = `Reminder: invoice ${inv.number}`; mid = `A quick reminder that invoice ${inv.number} for ${amt} was due on ${due}. If you have already sent payment, thank you, and please ignore this note.`; }
  else if (tone === "firm") { subject = `Invoice ${inv.number} is past due`; mid = `Invoice ${inv.number} for ${amt} was due on ${due} and is now ${plural(late, "day")} past due. Please send payment this week, or let me know if there is a problem with the invoice.`; }
  else { subject = `Final notice: invoice ${inv.number}`; mid = `Invoice ${inv.number} for ${amt} was due on ${due} and is ${plural(late, "day")} past due. Please pay it in full or call me to arrange payment. I would like to settle this without further steps.`; }
  return { to: c?.email || null, phone: c?.phone || null, subject, body: `${greeting(c?.name)}\n\n${mid}${payLine(S)}\n\nThanks,\n${biz}` };
}
export function quoteFollowUp(S, q, c) {
  const biz = S.profile.name || "Your business";
  return { to: c?.email || null, phone: c?.phone || null, subject: `Following up on your quote: ${q.title}`,
    body: `${greeting(c?.name)}\n\nI wanted to follow up on the quote I sent for ${q.title} (${usd(q.amountCents)}). Do you have any questions, or would you like me to adjust anything?\n\nThanks,\n${biz}` };
}
export function reviewRequest(S, inv, c) {
  const biz = S.profile.name || "Your business";
  return { to: c?.email || null, phone: c?.phone || null, subject: `Thanks from ${biz}`,
    body: `${greeting(c?.name)}\n\nThank you for your business. If you were happy with the work, a short review helps a small business like ours a lot:\n${S.profile.reviewUrl}\n\nThanks again,\n${biz}` };
}
export function visitReminder(S, ev, c) {
  const biz = S.profile.name || "Your business", when = `${weekdayDay(ev.date)}${ev.time ? " at " + timeText(ev.time) : ""}`;
  return { to: c?.email || null, phone: c?.phone || null, subject: `Reminder: ${biz} visit on ${weekdayDay(ev.date)}`,
    body: `${greeting(c?.name)}\n\nA reminder that we are scheduled to be there ${when}${ev.title ? " for " + ev.title : ""}. Reply if you need to change the time.\n\nThanks,\n${biz}` };
}
export function timeText(t) { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad2(m)} ${h < 12 ? "AM" : "PM"}`; }

export const daysUntil = (date, today) => daysBetween(today, date);
export function expiryState(date, today, warnDays = 30) {
  if (!date) return null;
  const d = daysUntil(date, today);
  return d < 0 ? { state: "expired", days: -d } : d <= warnDays ? { state: "soon", days: d } : { state: "ok", days: d };
}

export function computeFindings(S, today = todayStr()) {
  const biz = S.profile.name || "Your business", out = [], cust = id => S.customers.find(c => c.id === id);
  for (const inv of S.invoices) {
    if (inv.status !== "unpaid" || dayNum(inv.dueDate) >= dayNum(today)) continue;
    const c = cust(inv.customerId), late = daysBetween(inv.dueDate, today), tone = invoiceTone(late);
    out.push({ id: "invoice:" + inv.id, kind: "invoice", refId: inv.id, title: `${inv.number} is ${plural(late, "day")} overdue`, amountCents: inv.amountCents,
      evidence: [["verified", `Invoice ${inv.number} to ${c?.name ?? "a customer"} for ${usd(inv.amountCents)} was due ${longDay(inv.dueDate)} and is not marked paid.`],
        ["hypothesis", "The customer may have paid without it being recorded here."]],
      suggestion: tone === "friendly" ? "Send a friendly reminder." : tone === "firm" ? "Send a firm reminder and set a pay-by date." : "Send a final notice and follow up with a phone call.",
      followUp: invoiceReminder(S, inv, c, late) });
  }
  for (const q of S.quotes) {
    if (q.status !== "sent") continue;
    const last = q.lastContactAt || q.sentAt; if (!last) continue;
    const quiet = daysBetween(last, today); if (quiet < 7) continue;
    const c = cust(q.customerId);
    out.push({ id: "quote:" + q.id, kind: "quote", refId: q.id, title: `${q.title} has gone quiet for ${plural(quiet, "day")}`, amountCents: q.amountCents,
      evidence: [["verified", `The ${usd(q.amountCents)} quote to ${c?.name ?? "a customer"} was last touched on ${longDay(last)}, and has not been marked won or lost.`],
        ["estimate", "The amount shown is the quote value. It is not a forecast of what will be won."],
        ["hypothesis", "The customer may be waiting on a decision, or may have gone elsewhere."]],
      suggestion: "Follow up now, then log it so the clock restarts.", followUp: quoteFollowUp(S, q, c) });
  }
  for (const j of S.jobs) {
    if (j.status !== "open" || j.budgetCents <= 0) continue;
    const cost = jobCost(S, j.id); if (cost <= j.budgetCents) continue;
    const over = cost - j.budgetCents, pct = Math.round(over / j.budgetCents * 100);
    out.push({ id: "job:" + j.id, kind: "job", refId: j.id, title: `${j.title} is over budget`, amountCents: over,
      evidence: [["verified", `Recorded costs and time are ${usd(cost)} against a budget of ${usd(j.budgetCents)}: ${usd(over)} over (${pct}%).`],
        ["hypothesis", "Costs recorded so far may be incomplete, and extra work may not have been billed."]],
      suggestion: "Check for extra work the customer asked for. If there was some, a change order recovers it." });
  }
  // Review requests: a paid invoice from the last 30 days, once, when a review link is saved.
  if (S.profile.reviewUrl) {
    for (const inv of S.invoices) {
      if (inv.status !== "paid" || !inv.paidAt || S.reviewAsked[inv.id]) continue;
      const since = daysBetween(inv.paidAt, today); if (since < 1 || since > 30) continue;
      const c = cust(inv.customerId);
      out.push({ id: "review:" + inv.id, kind: "review", refId: inv.id, title: `Ask ${c?.name ?? "the customer"} for a review`, amountCents: 0,
        evidence: [["verified", `Invoice ${inv.number} was paid ${plural(since, "day")} ago and no review request was sent.`], ["hypothesis", "Customers are most likely to leave a review in the first few weeks."]],
        suggestion: "Send a short thank-you with your review link.", followUp: reviewRequest(S, inv, c) });
    }
  }
  // Visit reminders: appointments tomorrow.
  const tomorrow = addDays(today, 1);
  for (const ev of S.events) {
    if (ev.date !== tomorrow || ev.remindedAt || !ev.customerId) continue;
    const c = cust(ev.customerId);
    out.push({ id: "visit:" + ev.id, kind: "visit", refId: ev.id, title: `Remind ${c?.name ?? "the customer"} about tomorrow`, amountCents: 0,
      evidence: [["verified", `${ev.title || "A visit"} is scheduled for ${weekdayDay(ev.date)}${ev.time ? " at " + timeText(ev.time) : ""}.`], ["hypothesis", "A reminder can reduce missed appointments."]],
      suggestion: "Send a reminder so the customer is ready.", followUp: visitReminder(S, ev, c) });
  }
  // Licenses, insurance and certificates.
  for (const it of S.compliance) {
    const st = expiryState(it.expires, today); if (!st || st.state === "ok") continue;
    out.push({ id: "renewal:" + it.id, kind: "renewal", refId: it.id, title: st.state === "expired" ? `${it.name} expired ${plural(st.days, "day")} ago` : `${it.name} expires in ${plural(st.days, "day")}`, amountCents: 0,
      evidence: [["verified", `${it.name}${it.number ? " (" + it.number + ")" : ""} is dated ${longDay(it.expires)}.`], ["hypothesis", "A lapse can stop you from bidding or working on some jobs."]],
      suggestion: "Renew it, then update the date under Licenses and insurance." });
  }
  for (const sb of S.subs) {
    const st = expiryState(sb.insuranceExpires, today); if (!st || st.state === "ok") continue;
    out.push({ id: "subins:" + sb.id, kind: "renewal", refId: sb.id, title: `${sb.name}'s insurance ${st.state === "expired" ? "expired " + plural(st.days, "day") + " ago" : "expires in " + plural(st.days, "day")}`, amountCents: 0,
      evidence: [["verified", `The insurance date on file for ${sb.name} is ${longDay(sb.insuranceExpires)}.`]], suggestion: "Ask for a new certificate before they work on another job." });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents);
}

// What can go in the Ready to send queue right now.
export function queueItems(S, today = todayStr()) {
  const waiting = new Set(S.outbox.filter(o => o.status === "approved").map(o => `${o.kind}:${o.refId}`));
  return computeFindings(S, today).filter(f => {
    if (!f.followUp || waiting.has(f.id)) return false;
    if ((S.snoozed[f.id] || "") > today) return false;
    if (f.kind === "invoice") { const i = S.invoices.find(x => x.id === f.refId); if (i && i.lastReminderAt && daysBetween(i.lastReminderAt, today) < 7) return false; }
    return true;
  });
}
// After the server confirms a send, restart the clock on the thing that was sent. Returns true if anything changed.
export function applySent(S) {
  let changed = false;
  for (const o of S.outbox) {
    if (o.status !== "sent" || !o.sentAt) continue;
    const day = o.sentAt.slice(0, 10);
    if (o.kind === "invoice") { const i = S.invoices.find(x => x.id === o.refId); if (i && (!i.lastReminderAt || i.lastReminderAt < day)) { i.lastReminderAt = day; changed = true; } }
    if (o.kind === "quote") { const q = S.quotes.find(x => x.id === o.refId); if (q && (!q.lastContactAt || q.lastContactAt < day)) { q.lastContactAt = day; changed = true; } }
    if (o.kind === "review" && !S.reviewAsked[o.refId]) { S.reviewAsked[o.refId] = day; changed = true; }
    if (o.kind === "visit") { const e = S.events.find(x => x.id === o.refId); if (e && !e.remindedAt) { e.remindedAt = day; changed = true; } }
  }
  return changed;
}
// Payments confirmed by the server (Stripe webhook). Idempotent.
export function applyPayments(S) {
  let changed = false;
  for (const p of S.payments) {
    const i = S.invoices.find(x => x.id === p.invoiceId);
    if (i && i.status !== "paid") { i.status = "paid"; i.paidAt = (p.paidAt || "").slice(0, 10) || todayStr(); i.paidOnline = true; changed = true; }
  }
  return changed;
}

/* ---------- reports, tax, cash flow ---------- */
export const EXPENSE_CATEGORIES = ["Materials", "Tools and equipment", "Fuel and vehicle", "Supplies", "Subcontractors", "Labor", "Rent and utilities", "Insurance and licenses", "Advertising", "Meals", "Office and software", "Other"];
const COST_CATEGORY = { material: "Materials", labor: "Labor", sub: "Subcontractors", other: "Other" };
export function incomeRows(S) {
  return S.invoices.filter(i => i.status === "paid" && i.paidAt).map(i => {
    const t = docTotals(i.items || [], i.taxRate || 0, i.discountCents || 0), c = S.customers.find(x => x.id === i.customerId);
    return { date: i.paidAt.slice(0, 10), number: i.number, customer: c?.name || "", amountCents: i.amountCents, taxCents: i.items && i.items.length ? t.tax : 0, jobId: i.jobId || null, customerId: i.customerId };
  });
}
export function expenseRows(S) {
  const rows = [];
  for (const r of S.receipts) if (r.confirmed && r.totalCents != null) rows.push({ date: r.date || (r.createdAt || "").slice(0, 10), what: r.vendor || "Receipt", category: r.category || "Materials", amountCents: r.totalCents, jobId: r.jobId || null, source: "receipt" });
  for (const c of S.costs) if (!c.receiptId) rows.push({ date: c.date || (c.createdAt || "").slice(0, 10), what: c.description, category: COST_CATEGORY[c.kind] || "Other", amountCents: c.amountCents, jobId: c.jobId, source: "cost" });
  return rows;
}
export function inRange(date, from, to) { return date >= from && date <= to; }
export function summary(S, from, to) {
  const inc = incomeRows(S).filter(r => inRange(r.date, from, to)), exp = expenseRows(S).filter(r => inRange(r.date, from, to));
  const trips = S.trips.filter(t => inRange(t.date, from, to)), miles = trips.reduce((s, t) => s + t.miles, 0);
  const rate = S.profile.mileageRateCents ?? 70, mileageCents = Math.round(miles * rate);
  const income = inc.reduce((s, r) => s + r.amountCents, 0), salesTax = inc.reduce((s, r) => s + r.taxCents, 0), expenses = exp.reduce((s, r) => s + r.amountCents, 0);
  const profit = income - salesTax - expenses - mileageCents;
  const byCategory = {}; exp.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + r.amountCents; });
  if (mileageCents) byCategory["Vehicle mileage"] = mileageCents;
  const byCustomer = {}; inc.forEach(r => { const k = r.customer || "No customer"; byCustomer[k] = (byCustomer[k] || 0) + r.amountCents; });
  const byMonth = {};
  inc.forEach(r => { const m = r.date.slice(0, 7); (byMonth[m] = byMonth[m] || { income: 0, expenses: 0 }).income += r.amountCents; });
  exp.forEach(r => { const m = r.date.slice(0, 7); (byMonth[m] = byMonth[m] || { income: 0, expenses: 0 }).expenses += r.amountCents; });
  const pct = S.profile.setAsidePct ?? 25;
  return { income, salesTax, expenses, miles, mileageCents, profit, byCategory, byCustomer, byMonth, setAside: Math.round(Math.max(0, profit) * pct / 100), setAsidePct: pct };
}
export function toCsv(headers, rows) {
  const cell = v => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // stop spreadsheet formulas
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
export function cashflow(S, today, days = 30) {
  const start = S.profile.startingBalanceCents || 0, list = [];
  for (let i = 0; i <= days; i++) list.push({ date: addDays(today, i), in: 0, out: 0, items: [] });
  const at = d => list.find(x => x.date === d);
  for (const inv of S.invoices) {
    if (inv.status !== "unpaid") continue;
    const d = inv.dueDate < today ? today : inv.dueDate, slot = at(d); if (!slot) continue;
    slot.in += inv.amountCents; slot.items.push({ dir: "in", label: `${inv.number}${inv.dueDate < today ? " (overdue)" : ""}`, cents: inv.amountCents });
  }
  for (const b of S.bills) {
    for (const slot of list) {
      const [y, m, dd] = slot.date.split("-").map(Number);
      if (Math.min(b.day, daysInMonth(y, m)) === dd) { slot.out += b.amountCents; slot.items.push({ dir: "out", label: b.name, cents: b.amountCents }); }
    }
  }
  let bal = start, low = { balance: start, date: today };
  for (const s of list) { bal += s.in - s.out; s.balance = bal; if (bal < low.balance) low = { balance: bal, date: s.date }; }
  return { days: list, start, end: bal, low, totalIn: list.reduce((s, x) => s + x.in, 0), totalOut: list.reduce((s, x) => s + x.out, 0) };
}

/* ---------- price tracker: built only from receipts the owner confirmed ---------- */
export function priceInsights(S, caution = "") {
  const groups = new Map();
  for (const r of S.receipts) {
    if (!r.confirmed || !Array.isArray(r.items)) continue;
    const date = r.date || (r.createdAt || "").slice(0, 10), vendor = (r.vendor || "").trim();
    for (const it of r.items) {
      const key = norm(it.name); if (!key || !vendor || !(it.unitCents > 0)) continue;
      (groups.get(key) || groups.set(key, { name: it.name, rows: [] }).get(key)).rows.push({ vendor, vkey: norm(vendor), date, unitCents: it.unitCents, qty: it.qty || 1 });
    }
  }
  const out = [];
  for (const [key, g] of groups) {
    const rows = g.rows.slice().sort((a, b) => a.date.localeCompare(b.date)), latest = rows[rows.length - 1];
    const latestByVendor = new Map(); rows.forEach(r => latestByVendor.set(r.vkey, r));
    const best = [...latestByVendor.values()].sort((a, b) => a.unitCents - b.unitCents)[0];
    if (latestByVendor.size >= 2 && best.vkey !== latest.vkey && best.unitCents < latest.unitCents) {
      const per = latest.unitCents - best.unitCents, pct = per / latest.unitCents, total = Math.round(per * latest.qty);
      if (pct >= 0.03 && total >= 100) out.push({ kind: "cheaper", key, name: g.name, savingCents: total, evidence: [
        ["verified", `You paid ${usd(latest.unitCents)} each at ${latest.vendor} on ${longDay(latest.date)}.`],
        ["verified", `You paid ${usd(best.unitCents)} each at ${best.vendor} on ${longDay(best.date)}.`],
        ["estimate", `Buying your last quantity (${latest.qty}) at the lower price would have saved about ${usd(total)} (${Math.round(pct * 100)}%).`],
        ["hypothesis", `Check it is the same product, size and quality before switching.${caution ? " " + caution : ""}`]] });
    }
    const sameVendor = rows.filter(r => r.vkey === latest.vkey);
    if (sameVendor.length >= 2) {
      const prev = sameVendor[sameVendor.length - 2], rise = (latest.unitCents - prev.unitCents) / prev.unitCents;
      if (rise >= 0.1) out.push({ kind: "rise", key, name: g.name, savingCents: 0, evidence: [
        ["verified", `${latest.vendor} charged ${usd(prev.unitCents)} on ${longDay(prev.date)} and ${usd(latest.unitCents)} on ${longDay(latest.date)}.`],
        ["estimate", `That is up ${Math.round(rise * 100)}%.`], ["hypothesis", "Prices move with supply. It may be worth asking for a quote elsewhere."]] });
    }
  }
  return out.sort((a, b) => b.savingCents - a.savingCents);
}
export function priceHistory(S) {
  const map = new Map();
  for (const r of S.receipts) {
    if (!r.confirmed || !Array.isArray(r.items)) continue;
    const date = r.date || (r.createdAt || "").slice(0, 10);
    for (const it of r.items) { const k = norm(it.name); if (!k || !(it.unitCents > 0)) continue; (map.get(k) || map.set(k, { name: it.name, rows: [] }).get(k)).rows.push({ vendor: r.vendor || "Unknown", date, unitCents: it.unitCents, qty: it.qty || 1 }); }
  }
  return [...map.values()].map(g => ({ ...g, rows: g.rows.sort((a, b) => b.date.localeCompare(a.date)) })).sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- recurring invoices ---------- */
export function dueRecurring(S, today) {
  const out = [];
  for (const r of S.recurring) {
    if (!r.active) continue;
    let next = r.nextDate, n = 0;
    while (next <= today && n < 12) { out.push({ template: r, date: next }); next = addMonths(next, r.intervalMonths || 1); n++; }
  }
  return out;
}

/* ---------- subcontractors (1099 watch) ---------- */
export function subYearTotals(S, year) {
  return S.subs.map(s => {
    const paid = S.costs.filter(c => c.kind === "sub" && c.subId === s.id && String(c.date || c.createdAt || "").startsWith(String(year))).reduce((t, c) => t + c.amountCents, 0);
    const limit = S.profile.subThresholdCents ?? 200000;
    return { sub: s, paid, needsW9: !s.w9 && paid >= limit };
  });
}

/* ---------- mileage ---------- */
export function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8, rad = x => x * Math.PI / 180, dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* ---------- calendar file ---------- */
const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export function icsFor(ev, who = "") {
  const d = ev.date.replace(/-/g, ""), uidv = `${ev.id}@recoup`;
  let when;
  if (ev.time) { const [h, m] = ev.time.split(":").map(Number), end = h * 60 + m + (ev.durationMin || 60); when = `DTSTART:${d}T${ev.time.replace(":", "")}00\r\nDTEND:${d}T${pad2(Math.floor(end / 60) % 24)}${pad2(end % 60)}00`; }
  else when = `DTSTART;VALUE=DATE:${d}\r\nDTEND;VALUE=DATE:${addDays(ev.date, 1).replace(/-/g, "")}`;
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Recoup//EN", "BEGIN:VEVENT", `UID:${uidv}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, when,
    `SUMMARY:${icsEsc(ev.title)}`, who ? `DESCRIPTION:${icsEsc(who + (ev.notes ? "\n" + ev.notes : ""))}` : (ev.notes ? `DESCRIPTION:${icsEsc(ev.notes)}` : ""), "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n") + "\r\n";
}

/* ---------- search ---------- */
export function search(S, q) {
  const n = norm(q); if (n.length < 2) return [];
  const has = (...f) => f.some(x => norm(x).includes(n)), out = [], cname = id => S.customers.find(c => c.id === id)?.name || "";
  S.customers.forEach(c => { if (has(c.name, c.email, c.phone, c.address)) out.push({ type: "customer", id: c.id, label: c.name, sub: [c.email, c.phone].filter(Boolean).join(" · ") }); });
  S.quotes.forEach(x => { if (has(x.title, x.number, cname(x.customerId))) out.push({ type: "quote", id: x.id, label: `${x.number || "Quote"} ${x.title}`, sub: `${cname(x.customerId)} · ${usd(x.amountCents)}` }); });
  S.jobs.forEach(x => { if (has(x.title, x.address, cname(x.customerId))) out.push({ type: "job", id: x.id, label: x.title, sub: cname(x.customerId) }); });
  S.invoices.forEach(x => { if (has(x.number, cname(x.customerId))) out.push({ type: "invoice", id: x.id, label: `${x.number} · ${usd(x.amountCents)}`, sub: `${cname(x.customerId)} · ${x.status}` }); });
  S.receipts.forEach(x => { if (has(x.vendor, ...(x.items || []).map(i => i.name))) out.push({ type: "receipt", id: x.id, label: x.vendor || "Receipt", sub: x.totalCents != null ? usd(x.totalCents) : "" }); });
  S.subs.forEach(x => { if (has(x.name, x.trade, x.email)) out.push({ type: "sub", id: x.id, label: x.name, sub: x.trade || "Subcontractor" }); });
  return out.slice(0, 40);
}

/* ---------- AI answer checks ---------- */
export const FACTS = /\$[\d,]+\.\d{2}|[A-Z]+-\d+|[A-Z][a-z]{2} \d{1,2}, \d{4}|\b\d+ days?\b/g;
export const factsKept = (orig, next) => (orig.match(FACTS) || []).every(f => next.includes(f));
// Turns the AI's rough list into quote lines. It never invents prices: a price comes only from the owner's catalog.
export function itemsFromAi(list, catalog) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).map(x => {
    const desc = String(x && x.desc || "").trim().slice(0, 200); if (!desc) return null;
    const qty = Number(x.qty) > 0 && Number(x.qty) < 1e6 ? Math.round(Number(x.qty) * 1000) / 1000 : 1;
    const hit = catalog.find(c => norm(c.name) === norm(desc)) || catalog.find(c => norm(desc).includes(norm(c.name)) && norm(c.name).length > 3);
    return { desc: hit ? hit.name : desc, qty, unitCents: hit ? hit.unitCents : 0, tax: true, kind: hit ? hit.kind || "material" : "other", fromCatalog: !!hit };
  }).filter(Boolean);
}
export const sanitizeLineItems = items => (Array.isArray(items) ? items : []).map(i => ({ desc: String(i.desc || "").slice(0, 200), qty: Number(i.qty) || 0, unitCents: Math.round(Number(i.unitCents) || 0), tax: i.tax !== false, kind: i.kind || "other" }));

/* ---------- printable document ---------- */
export function documentHtml({ kind, doc, S, customer, job }) {
  const p = S.profile, t = docTotals(doc.items, doc.taxRate, doc.discountCents), word = { quote: "Quote", invoice: "Invoice", change: "Change order" }[kind];
  const lines = (doc.items || []).map(i => `<tr><td>${esc(i.desc)}</td><td class="n">${esc(String(i.qty))}</td><td class="n">${usd(i.unitCents)}</td><td class="n">${usd(lineTotal(i))}</td></tr>`).join("");
  const addr = [p.address, [p.phone, p.email].filter(Boolean).join(" · "), p.license ? "License " + p.license : "", p.website].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join("");
  const meta = [`<div><b>${word} ${esc(doc.number || "")}</b></div>`, `<div>${esc(longDay((doc.createdAt || "").slice(0, 10) || todayStr()))}</div>`,
    kind === "quote" && doc.validUntil ? `<div>Valid until ${esc(longDay(doc.validUntil))}</div>` : "",
    kind === "invoice" ? `<div>Due ${esc(longDay(doc.dueDate))}</div>` : ""].join("");
  const sig = doc.signature && doc.signature.img
    ? `<div class="sig"><img src="${esc(doc.signature.img)}" alt="Signature"><div>${esc(doc.signature.name || "")} · ${esc(longDay((doc.signature.at || "").slice(0, 10)))}</div></div>`
    : (kind !== "invoice" ? `<div class="sig blank"><div class="line"></div><div>Customer signature and date</div></div>` : "");
  return `<article class="paper">
    <header class="paper-head"><div>${p.logo ? `<img class="logo" src="${esc(p.logo)}" alt="">` : ""}<h2>${esc(p.name || "Your business")}</h2>${addr}</div><div class="meta">${meta}</div></header>
    <section class="paper-to"><div class="k">For</div><div><b>${esc(customer?.name || "")}</b></div>${[customer?.address, customer?.email, customer?.phone].filter(Boolean).map(x => `<div>${esc(x)}</div>`).join("")}${job ? `<div class="k" style="margin-top:8px">Job</div><div>${esc(job.title)}${job.address ? " · " + esc(job.address) : ""}</div>` : ""}</section>
    <h3 class="paper-title">${esc(doc.title || "")}</h3>
    <div class="scroll-x"><table class="paper-table"><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${lines}</tbody></table></div>
    <table class="paper-totals"><tbody><tr><td>Subtotal</td><td class="n">${usd(t.subtotal)}</td></tr>${t.discount ? `<tr><td>Discount</td><td class="n">-${usd(t.discount)}</td></tr>` : ""}${doc.taxRate ? `<tr><td>Tax (${esc(String(doc.taxRate))}%)</td><td class="n">${usd(t.tax)}</td></tr>` : ""}<tr class="grand"><td>${kind === "invoice" ? "Total due" : "Total"}</td><td class="n">${usd(t.total)}</td></tr></tbody></table>
    ${doc.depositNote ? `<p class="note">${esc(doc.depositNote)}</p>` : ""}
    ${doc.notes ? `<p class="note">${esc(doc.notes).replace(/\n/g, "<br>")}</p>` : ""}
    ${kind === "invoice" && (p.payInstructions || p.payUrl) ? `<div class="note"><b>How to pay</b><br>${esc(p.payInstructions || "").replace(/\n/g, "<br>")}${p.payUrl ? `<br>Pay online: ${esc(p.payUrl)}` : ""}</div>` : ""}
    ${p.terms ? `<p class="terms">${esc(p.terms).replace(/\n/g, "<br>")}</p>` : ""}
    ${sig}</article>`;
}

