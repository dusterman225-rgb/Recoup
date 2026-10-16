"use strict";
// Pure helpers for card payments. No network. Tested in test/stripe.test.js.
const crypto = require("node:crypto");

// Verifies Stripe's webhook signature header ("t=...,v1=...") against the raw request body.
function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!rawBody || !header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(",").map(p => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }));
  const t = Number(parts.t), v1 = parts.v1; if (!t || !v1) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Form-encoded body for creating a Checkout Session for one invoice. The amount comes from the saved invoice, never the browser.
function checkoutParams({ invoice, businessName, successUrl, cancelUrl, uid }) {
  const p = new URLSearchParams();
  p.set("mode", "payment"); p.set("success_url", successUrl); p.set("cancel_url", cancelUrl);
  p.set("line_items[0][quantity]", "1"); p.set("line_items[0][price_data][currency]", "usd");
  p.set("line_items[0][price_data][unit_amount]", String(invoice.amountCents));
  p.set("line_items[0][price_data][product_data][name]", `${businessName || "Invoice"} ${invoice.number}`.slice(0, 120));
  p.set("client_reference_id", invoice.id); p.set("metadata[uid]", uid); p.set("metadata[invoiceId]", invoice.id);
  return p;
}
// Reads a completed Checkout event into the payment record to save. Returns null for events we ignore.
function paymentFromEvent(evt) {
  if (!evt || evt.type !== "checkout.session.completed") return null;
  const s = evt.data && evt.data.object; if (!s || s.payment_status !== "paid") return null;
  const uid = s.metadata && s.metadata.uid, invoiceId = s.metadata && s.metadata.invoiceId; if (!uid || !invoiceId) return null;
  return { uid, payment: { id: s.id, invoiceId, amountCents: s.amount_total, paidAt: new Date((evt.created || Date.now() / 1000) * 1000).toISOString() } };
}
module.exports = { verifyStripeSignature, checkoutParams, paymentFromEvent };

