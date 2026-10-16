"use strict";
// Rules for what the server will send. Pure functions, no network, so they can be tested.
// The browser is never trusted: every message is checked again against the owner's saved records.

const DAILY_CAP = 25;
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const E164 = /^\+[1-9]\d{7,14}$/;

function cleanName(name) {
  return String(name || "").replace(/[<>"\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Your business";
}
function fromHeader(name, address) {
  return `${cleanName(name)} <${address}>`;
}
// "(555) 010-0100" -> "+15550100100" for US numbers. Returns "" when it can't be made into a valid number.
function toE164(raw) {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (E164.test(d)) return d;
  if (/^\d{10}$/.test(d)) return "+1" + d;
  if (/^1\d{10}$/.test(d)) return "+" + d;
  return "";
}

function validate({ msg, core, sentToday, cap = DAILY_CAP }) {
  const no = reason => ({ ok: false, reason });
  if (!msg || msg.status !== "approved") return no("This message was not approved.");
  const channel = msg.channel || "email";
  if (channel !== "email" && channel !== "sms") return no("Unknown channel.");
  const need = channel === "email" ? ["to", "subject", "body", "replyTo"] : ["to", "body"];
  for (const k of need) if (typeof msg[k] !== "string" || !msg[k].trim()) return no(`Missing ${k}.`);
  if (msg.body.length > (channel === "sms" ? 480 : 3000)) return no("The message is too long.");
  if (sentToday >= cap) return no(`Daily limit of ${cap} messages reached. Try again tomorrow.`);

  let customer;
  if (channel === "email") {
    if (msg.subject.length > 200 || /[\r\n]/.test(msg.subject)) return no("The subject is not valid.");
    if (!EMAIL.test(msg.to) || !EMAIL.test(msg.replyTo)) return no("An email address is not valid.");
    customer = ((core && core.customers) || []).find(c => String(c.email || "").toLowerCase() === msg.to.toLowerCase());
    if (!customer) return no("No customer has that email address.");
  } else {
    if (!E164.test(msg.to)) return no("The phone number is not valid.");
    customer = ((core && core.customers) || []).find(c => toE164(c.phone) === msg.to);
    if (!customer) return no("No customer has that phone number.");
    if (!customer.smsOk) return no("This customer has not agreed to text messages.");
  }

  const kind = msg.kind;
  if (kind === "invoice") {
    const inv = (core.invoices || []).find(i => i.id === msg.refId);
    if (!inv) return no("The invoice was not found.");
    if (inv.status !== "unpaid") return no("That invoice is already paid.");
    if (inv.customerId !== customer.id) return no("The recipient does not match the invoice.");
  } else if (kind === "quote") {
    const q = (core.quotes || []).find(x => x.id === msg.refId);
    if (!q) return no("The quote was not found.");
    if (q.status !== "sent") return no("That quote is no longer open.");
    if (q.customerId !== customer.id) return no("The recipient does not match the quote.");
  } else if (kind === "review") {
    const inv = (core.invoices || []).find(i => i.id === msg.refId);
    if (!inv) return no("The invoice was not found.");
    if (inv.status !== "paid") return no("That invoice is not paid.");
    if (inv.customerId !== customer.id) return no("The recipient does not match the invoice.");
    if (core.reviewAsked && core.reviewAsked[inv.id]) return no("A review request was already sent for this invoice.");
  } else if (kind === "visit") {
    const ev = (core.events || []).find(e => e.id === msg.refId);
    if (!ev) return no("The visit was not found.");
    if (ev.customerId !== customer.id) return no("The recipient does not match the visit.");
  } else {
    return no("Unknown message type.");
  }
  return { ok: true };
}

module.exports = { validate, fromHeader, cleanName, toE164, DAILY_CAP };
                                    
