"use strict";
const test = require("node:test"); const assert = require("node:assert/strict"); const crypto = require("node:crypto");
const { verifyStripeSignature, checkoutParams, paymentFromEvent } = require("../stripe");
const sign = (body, secret, t) => `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
test("accepts a correctly signed body", () => assert.equal(verifyStripeSignature("{}", sign("{}", "whsec_x", 1000), "whsec_x", 1100), true));
test("rejects a wrong secret, a changed body and an old timestamp", () => {
  assert.equal(verifyStripeSignature("{}", sign("{}", "other", 1000), "whsec_x", 1100), false);
  assert.equal(verifyStripeSignature("{ }", sign("{}", "whsec_x", 1000), "whsec_x", 1100), false);
  assert.equal(verifyStripeSignature("{}", sign("{}", "whsec_x", 1000), "whsec_x", 2000), false);
  assert.equal(verifyStripeSignature("{}", "", "whsec_x", 1100), false);
});
test("checkout amount comes from the invoice", () => { const p = checkoutParams({ invoice: { id: "i1", number: "INV-0001", amountCents: 12345 }, businessName: "Spark", successUrl: "https://a/", cancelUrl: "https://a/", uid: "u1" }); assert.equal(p.get("line_items[0][price_data][unit_amount]"), "12345"); assert.equal(p.get("metadata[invoiceId]"), "i1"); });
test("only a paid completed session becomes a payment", () => {
  const evt = { type: "checkout.session.completed", created: 1700000000, data: { object: { id: "cs_1", payment_status: "paid", amount_total: 500, metadata: { uid: "u1", invoiceId: "i1" } } } };
  assert.deepEqual(paymentFromEvent(evt).payment.invoiceId, "i1");
  assert.equal(paymentFromEvent({ ...evt, type: "charge.refunded" }), null);
  assert.equal(paymentFromEvent({ ...evt, data: { object: { ...evt.data.object, payment_status: "unpaid" } } }), null);
  assert.equal(paymentFromEvent({ ...evt, data: { object: { ...evt.data.object, metadata: {} } } }), null);
});
  
