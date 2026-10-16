import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../public/lib.js";

const S0 = () => { const S = L.freshState(); S.profile = { name: "Bright Spark", type: "electrician", payUrl: "" }; return S; };
const TODAY = "2026-10-15";

test("money and quantity parsing", () => {
  assert.equal(L.parseMoney("$1,250.5"), 125050); assert.equal(L.parseMoney("12.345"), null); assert.equal(L.parseMoney("-3"), null);
  assert.equal(L.parseQty("2.5"), 2.5); assert.equal(L.parseQty("0"), null); assert.equal(L.parsePercent("8.25%"), 8.25); assert.equal(L.parsePercent("101"), null); assert.equal(L.parsePercent(""), 0);
});
test("date helpers", () => {
  assert.equal(L.addDays("2026-10-31", 1), "2026-11-01"); assert.equal(L.addMonths("2026-01-31", 1), "2026-02-28"); assert.equal(L.addMonths("2026-11-15", 3), "2027-02-15");
  assert.equal(L.daysBetween("2026-10-01", "2026-10-15"), 14); assert.equal(L.daysInMonth(2028, 2), 29);
});
test("document totals: tax only on taxable lines, discount applied pro rata", () => {
  const items = [{ qty: 2, unitCents: 10000, tax: true }, { qty: 1, unitCents: 5000, tax: false }];
  const t = L.docTotals(items, 10, 0); assert.deepEqual(t, { subtotal: 25000, discount: 0, tax: 2000, total: 27000 });
  const d = L.docTotals(items, 10, 5000); assert.equal(d.discount, 5000); assert.equal(d.tax, 1600); assert.equal(d.total, 21600);
  assert.equal(L.docTotals(items, 10, 999999).total, 0 + L.docTotals(items, 10, 999999).tax);
});
test("numbering continues from the highest", () => {
  assert.equal(L.nextNumber([], "INV-"), "INV-0001"); assert.equal(L.nextNumber([{ number: "INV-0007" }, { number: "INV-0003" }], "INV-"), "INV-0008");
});
test("cleanItems validates rows", () => {
  assert.equal(L.cleanItems([{ desc: "", qty: "", price: "" }]).error, "Add at least one line.");
  assert.match(L.cleanItems([{ desc: "Wire", qty: "x", price: "1" }]).error, /quantity/);
  assert.match(L.cleanItems([{ desc: "Wire", qty: "1", price: "abc" }]).error, /price/);
  const ok = L.cleanItems([{ desc: " Panel ", qty: "1", price: "1200" }, { desc: "", qty: "", price: "" }]); assert.equal(ok.items.length, 1); assert.equal(ok.items[0].unitCents, 120000);
});
test("findings: overdue invoice, stale quote, job overrun, sorted by amount; never says fixed", () => {
  const S = S0(); S.customers.push({ id: "c1", name: "Dana Whitfield", email: "d@x.com" });
  S.invoices.push({ id: "i1", number: "INV-0001", customerId: "c1", amountCents: 142000, dueDate: "2026-09-24", status: "unpaid" });
  S.quotes.push({ id: "q1", title: "Panel", customerId: "c1", amountCents: 385000, status: "sent", sentAt: "2026-10-03" });
  S.jobs.push({ id: "j1", title: "Rewire", budgetCents: 100000, status: "open" }); S.costs.push({ id: "k", jobId: "j1", kind: "material", amountCents: 150000 });
  const f = L.computeFindings(S, TODAY); assert.deepEqual(f.map(x => x.kind), ["quote", "invoice", "job"]);
  assert.match(f[1].title, /21 days overdue/); assert.equal(f[2].amountCents, 50000);
  assert.ok(!/fixed|recovered|resolved|collected/i.test(JSON.stringify(f)));
  assert.match(f[1].followUp.body, /Hi Dana,/);
});
test("job cost includes tracked time", () => {
  const S = S0(); S.jobs.push({ id: "j1", title: "J", budgetCents: 10000, status: "open" });
  S.time.push({ id: "t", jobId: "j1", minutes: 90, rateCents: 6000 }); assert.equal(L.jobCost(S, "j1"), 9000);
  S.costs.push({ id: "c", jobId: "j1", kind: "material", amountCents: 2000 }); assert.equal(L.jobCost(S, "j1"), 11000);
  assert.equal(L.computeFindings(S, TODAY).filter(f => f.kind === "job").length, 1);
});
test("job financials: contract = quote + approved change orders; profit and margin", () => {
  const S = S0(); S.quotes.push({ id: "q", amountCents: 100000 }); S.jobs.push({ id: "j", title: "J", quoteId: "q", status: "open" });
  S.changeOrders.push({ id: "a", jobId: "j", status: "approved", amountCents: 20000 }, { id: "b", jobId: "j", status: "sent", amountCents: 99999 });
  S.invoices.push({ id: "i", jobId: "j", amountCents: 120000, status: "paid" });
  S.costs.push({ id: "c1", jobId: "j", kind: "material", amountCents: 30000 }, { id: "c2", jobId: "j", kind: "sub", amountCents: 20000 });
  S.time.push({ id: "t", jobId: "j", minutes: 120, rateCents: 5000 });
  const f = L.jobFinancials(S, S.jobs[0]);
  assert.equal(f.contract, 120000); assert.equal(f.totalCost, 60000); assert.equal(f.profitBilled, 60000); assert.equal(f.margin, 0.5); assert.equal(f.expectedProfit, 60000); assert.equal(f.paid, 120000);
});
test("review requests need a review link, a paid invoice 1 to 30 days old, once", () => {
  const S = S0(); S.customers.push({ id: "c", name: "Sam", email: "s@x.com" }); S.invoices.push({ id: "i", number: "INV-0001", customerId: "c", amountCents: 1, status: "paid", paidAt: "2026-10-10" });
  assert.equal(L.computeFindings(S, TODAY).filter(f => f.kind === "review").length, 0);
  S.profile.reviewUrl = "https://g.page/r/abc"; const f = L.computeFindings(S, TODAY).filter(x => x.kind === "review"); assert.equal(f.length, 1); assert.match(f[0].followUp.body, /g\.page/);
  S.reviewAsked.i = "2026-10-15"; assert.equal(L.computeFindings(S, TODAY).filter(x => x.kind === "review").length, 0);
});
test("visit reminders for tomorrow only, until reminded", () => {
  const S = S0(); S.customers.push({ id: "c", name: "Sam", email: "s@x.com" }); S.events.push({ id: "e", title: "Estimate", date: "2026-10-16", time: "14:30", customerId: "c" });
  const f = L.computeFindings(S, TODAY).filter(x => x.kind === "visit"); assert.equal(f.length, 1); assert.match(f[0].followUp.body, /2:30 PM/);
  S.events[0].remindedAt = TODAY; assert.equal(L.computeFindings(S, TODAY).filter(x => x.kind === "visit").length, 0);
});
test("expiring licenses and sub insurance are flagged", () => {
  const S = S0(); S.compliance.push({ id: "l", name: "Contractor license", expires: "2026-10-30" }, { id: "m", name: "Old permit", expires: "2026-10-01" }, { id: "n", name: "Far", expires: "2027-12-01" });
  S.subs.push({ id: "s", name: "Pat", insuranceExpires: "2026-10-20" });
  const f = L.computeFindings(S, TODAY).filter(x => x.kind === "renewal"); assert.equal(f.length, 3);
  assert.ok(f.some(x => /expired 14 days ago/.test(x.title)));
});
test("queue: cooldown after reminder, snooze, and waiting approvals", () => {
  const S = S0(); S.customers.push({ id: "c", name: "A", email: "a@x.com" }); S.invoices.push({ id: "i", number: "INV-0001", customerId: "c", amountCents: 1000, dueDate: "2026-09-01", status: "unpaid" });
  assert.equal(L.queueItems(S, TODAY).length, 1);
  S.invoices[0].lastReminderAt = "2026-10-12"; assert.equal(L.queueItems(S, TODAY).length, 0);
  S.invoices[0].lastReminderAt = "2026-10-01"; assert.equal(L.queueItems(S, TODAY).length, 1);
  S.snoozed["invoice:i"] = "2026-10-18"; assert.equal(L.queueItems(S, TODAY).length, 0); S.snoozed = {};
  S.outbox.push({ kind: "invoice", refId: "i", status: "approved" }); assert.equal(L.queueItems(S, TODAY).length, 0);
});
test("applySent restarts clocks; applyPayments marks invoices paid once", () => {
  const S = S0(); S.invoices.push({ id: "i", status: "unpaid" }); S.quotes.push({ id: "q", status: "sent" }); S.events.push({ id: "e" });
  S.outbox.push({ kind: "invoice", refId: "i", status: "sent", sentAt: "2026-10-15T10:00:00Z" }, { kind: "quote", refId: "q", status: "sent", sentAt: "2026-10-15T10:00:00Z" }, { kind: "visit", refId: "e", status: "sent", sentAt: "2026-10-15T10:00:00Z" }, { kind: "review", refId: "i", status: "sent", sentAt: "2026-10-15T10:00:00Z" });
  assert.equal(L.applySent(S), true); assert.equal(S.invoices[0].lastReminderAt, "2026-10-15"); assert.equal(S.quotes[0].lastContactAt, "2026-10-15"); assert.equal(S.events[0].remindedAt, "2026-10-15"); assert.equal(S.reviewAsked.i, "2026-10-15"); assert.equal(L.applySent(S), false);
  S.payments.push({ invoiceId: "i", paidAt: "2026-10-16T00:00:00Z" }); assert.equal(L.applyPayments(S), true); assert.equal(S.invoices[0].status, "paid"); assert.equal(L.applyPayments(S), false);
});
test("reports: income net of sales tax, receipts not double counted, mileage deduction", () => {
  const S = S0(); S.profile.setAsidePct = 20; S.profile.mileageRateCents = 70;
  S.invoices.push({ id: "i", number: "INV-1", status: "paid", paidAt: "2026-10-05", amountCents: 110000, items: [{ qty: 1, unitCents: 100000, tax: true }], taxRate: 10, customerId: "c" });
  S.customers.push({ id: "c", name: "Dana" });
  S.receipts.push({ id: "r", confirmed: true, totalCents: 20000, vendor: "HD", date: "2026-10-02", category: "Materials", jobId: "j" }, { id: "r2", confirmed: false, totalCents: 99999, date: "2026-10-02" });
  S.costs.push({ id: "k1", jobId: "j", kind: "material", amountCents: 20000, receiptId: "r", createdAt: "2026-10-02T00:00:00Z" }, { id: "k2", jobId: "j", kind: "other", amountCents: 5000, createdAt: "2026-10-03T00:00:00Z", description: "Permit" });
  S.trips.push({ id: "t", date: "2026-10-04", miles: 100 });
  const r = L.summary(S, "2026-10-01", "2026-10-31");
  assert.equal(r.income, 110000); assert.equal(r.salesTax, 10000); assert.equal(r.expenses, 25000); assert.equal(r.mileageCents, 7000); assert.equal(r.profit, 110000 - 10000 - 25000 - 7000); assert.equal(r.setAside, Math.round(68000 * 0.2));
  assert.equal(r.byCategory.Materials, 20000); assert.equal(r.byCategory["Vehicle mileage"], 7000); assert.equal(r.byCustomer.Dana, 110000);
});
test("csv escaping and formula guard", () => {
  assert.equal(L.toCsv(["a", "b"], [["x,y", 'q"t'], ["=SUM(A1)", "-5"]]), 'a,b\r\n"x,y","q""t"\r\n\'=SUM(A1),-5\r\n');
});
test("cash flow: overdue lands today, bills recur by day of month, running balance and low point", () => {
  const S = S0(); S.profile.startingBalanceCents = 100000;
  S.invoices.push({ id: "i", number: "INV-1", status: "unpaid", dueDate: "2026-10-01", amountCents: 50000 }, { id: "j", number: "INV-2", status: "unpaid", dueDate: "2026-10-25", amountCents: 80000 });
  S.bills.push({ id: "b", name: "Truck", amountCents: 120000, day: 20 }, { id: "b2", name: "Rent", amountCents: 10000, day: 31 });
  const c = L.cashflow(S, TODAY, 30); assert.equal(c.days[0].in, 50000); assert.equal(c.totalIn, 130000);
  assert.ok(c.days.find(d => d.date === "2026-10-20").out === 120000); assert.ok(c.days.find(d => d.date === "2026-10-31").out === 10000);
  assert.equal(c.end, 100000 + 130000 - 130000); assert.equal(c.low.balance, 30000);
});
test("price insights: cheaper vendor, quantity-weighted saving, price rise; ignores unconfirmed", () => {
  const S = S0();
  const rc = (id, vendor, date, unit, qty, confirmed = true) => ({ id, vendor, date, confirmed, items: [{ name: "Romex 12/2 250ft", qty, unitCents: unit }] });
  S.receipts.push(rc("a", "Lowe's", "2026-09-01", 15000, 1), rc("b", "Home Depot", "2026-10-10", 18000, 3), rc("c", "Cheapo", "2026-09-20", 10000, 1, false));
  const ins = L.priceInsights(S, "Check ratings."); assert.equal(ins.length, 1); assert.equal(ins[0].kind, "cheaper"); assert.equal(ins[0].savingCents, 9000);
  assert.ok(ins[0].evidence.some(e => e[0] === "estimate") && ins[0].evidence.some(e => e[0] === "hypothesis") && /Check ratings/.test(JSON.stringify(ins[0].evidence)));
  S.receipts.push(rc("d", "Home Depot", "2026-08-01", 12000, 1)); const up = L.priceInsights(S).find(x => x.kind === "rise"); assert.ok(up); assert.match(up.evidence[1][1], /50%/);
});
test("recurring invoices: due templates with catch-up, capped", () => {
  const S = S0(); S.recurring.push({ id: "r", active: true, nextDate: "2026-08-15", intervalMonths: 1 }, { id: "p", active: false, nextDate: "2026-01-01", intervalMonths: 1 });
  assert.deepEqual(L.dueRecurring(S, TODAY).map(x => x.date), ["2026-08-15", "2026-09-15", "2026-10-15"]);
});
test("1099 watch uses saved threshold and W-9 status", () => {
  const S = S0(); S.subs.push({ id: "s", name: "Pat", w9: false }, { id: "t", name: "Lee", w9: true });
  S.costs.push({ id: "1", kind: "sub", subId: "s", amountCents: 150000, date: "2026-03-01" }, { id: "2", kind: "sub", subId: "s", amountCents: 60000, date: "2026-06-01" }, { id: "3", kind: "sub", subId: "t", amountCents: 500000, date: "2026-06-01" }, { id: "4", kind: "sub", subId: "s", amountCents: 999999, date: "2025-06-01" });
  const r = L.subYearTotals(S, 2026); assert.equal(r[0].paid, 210000); assert.equal(r[0].needsW9, true); assert.equal(r[1].needsW9, false);
});
test("distance and calendar file", () => {
  assert.ok(Math.abs(L.haversineMiles(40.7128, -74.006, 34.0522, -118.2437) - 2445) < 15);
  const ics = L.icsFor({ id: "e1", title: "Estimate, rewire", date: "2026-10-16", time: "14:30", durationMin: 90 }, "Dana");
  assert.match(ics, /DTSTART:20261016T143000/); assert.match(ics, /DTEND:20261016T160000/); assert.match(ics, /SUMMARY:Estimate\\, rewire/);
});
test("search finds across records", () => {
  const S = S0(); S.customers.push({ id: "c", name: "Harbor Street Cafe", email: "" }); S.jobs.push({ id: "j", title: "Cafe rewire", customerId: "c" });
  assert.equal(L.search(S, "cafe").length, 2); assert.equal(L.search(S, "x").length, 0);
});
test("AI helpers: facts guard, and quote lines never get invented prices", () => {
  assert.equal(L.factsKept("Invoice INV-0001 for $1,420.00 due Sep 24, 2026, 21 days", "INV-0001 $1,420.00 Sep 24, 2026 21 days late"), true);
  assert.equal(L.factsKept("for $1,420.00", "for $1,000.00"), false);
  const out = L.itemsFromAi([{ desc: "20 amp breaker", qty: 3 }, { desc: "Labor", qty: 4 }], [{ name: "20 amp breaker", unitCents: 1200, kind: "material" }]);
  assert.equal(out[0].unitCents, 1200); assert.equal(out[1].unitCents, 0); assert.equal(out[1].fromCatalog, false);
});
test("printable document escapes content and shows signature or blank line", () => {
  const S = S0(); S.profile.name = "<b>Bad</b> Co"; const doc = { number: "Q-0001", title: "Job", items: [{ desc: "<script>x</script>", qty: 1, unitCents: 1000, tax: true }], taxRate: 0, createdAt: "2026-10-15T00:00:00Z" };
  const html = L.documentHtml({ kind: "quote", doc, S, customer: { name: "A" } });
  assert.ok(!html.includes("<script>") && !html.includes("<b>Bad")); assert.match(html, /Customer signature/);
  doc.signature = { img: "data:image/png;base64,AAA", name: "A", at: "2026-10-15T00:00:00Z" }; assert.match(L.documentHtml({ kind: "quote", doc, S, customer: {} }), /alt="Signature"/);
});
