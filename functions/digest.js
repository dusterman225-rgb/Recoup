"use strict";
// Builds the weekly summary email text from an owner's saved records. Pure, tested in test/digest.test.js.
const usd = c => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dayNum = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

function buildDigest(core, today) {
  const p = core.profile || {}, inv = core.invoices || [], qs = core.quotes || [], lines = [];
  const unpaid = inv.filter(i => i.status === "unpaid"), late = unpaid.filter(i => i.dueDate < today);
  const week = d => d && dayNum(today) - dayNum(d) <= 7 && dayNum(today) - dayNum(d) >= 0;
  const paidWeek = inv.filter(i => i.status === "paid" && week(i.paidAt));
  const quiet = qs.filter(q => q.status === "sent" && dayNum(today) - dayNum(q.lastContactAt || q.sentAt || today) >= 7);
  const soon = (core.compliance || []).filter(c => c.expires && dayNum(c.expires) - dayNum(today) <= 30);
  lines.push(`Here is your week at ${p.name || "your business"}.`, "");
  lines.push(`Received this week: ${usd(paidWeek.reduce((s, i) => s + i.amountCents, 0))} (${paidWeek.length} invoice${paidWeek.length === 1 ? "" : "s"})`);
  lines.push(`Owed to you: ${usd(unpaid.reduce((s, i) => s + i.amountCents, 0))}, of which ${usd(late.reduce((s, i) => s + i.amountCents, 0))} is past due`);
  if (late.length) { lines.push("", "Past due:"); late.slice(0, 8).forEach(i => lines.push(`- ${i.number}: ${usd(i.amountCents)}, due ${i.dueDate}`)); }
  if (quiet.length) { lines.push("", "Quotes gone quiet:"); quiet.slice(0, 8).forEach(q => lines.push(`- ${q.title}: ${usd(q.amountCents)}`)); }
  if (soon.length) { lines.push("", "Renew soon:"); soon.forEach(c => lines.push(`- ${c.name}: ${c.expires}`)); }
  lines.push("", "Open Recoup to review and send reminders.");
  return { subject: `Your week: ${usd(unpaid.reduce((s, i) => s + i.amountCents, 0))} owed`, text: lines.join("\n"), worthSending: late.length + quiet.length + soon.length + paidWeek.length > 0 };
}
module.exports = { buildDigest };

