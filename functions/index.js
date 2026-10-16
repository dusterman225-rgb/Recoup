"use strict";
// Everything here needs the paid Firebase plan (Blaze) and stays dormant until you deploy it and add the keys. See README sections 5 to 8.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { validate, fromHeader } = require("./send");
const { verifyStripeSignature, checkoutParams, paymentFromEvent } = require("./stripe");
const { buildDigest } = require("./digest");

admin.initializeApp();
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const FROM_ADDRESS = defineString("FROM_ADDRESS");              // e.g. notifications@yourdomain.com, verified in Resend
const TWILIO_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = defineString("TWILIO_FROM_NUMBER");          // your Twilio number, +1555...
const STRIPE_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const PRICE_API_KEY = defineSecret("PRICE_API_KEY");

async function sendEmail(msg) {
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY.value()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromHeader(msg.fromName, FROM_ADDRESS.value()), to: [msg.to], reply_to: msg.replyTo, subject: msg.subject, text: msg.body }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.message || `The email service refused it (${res.status}).`), { provider: out });
  return out.id || null;
}
async function sendSms(msg) {
  const sid = TWILIO_SID.value(), auth = Buffer.from(`${sid}:${TWILIO_TOKEN.value()}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: msg.to, From: TWILIO_FROM.value(), Body: msg.body }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.message || `The text service refused it (${res.status}).`), { provider: out });
  return out.sid || null;
}

// Runs when an owner approves a message in the app. Re-checks it against the owner's records, sends it, records the result.
exports.sendApproved = onDocumentCreated(
  { document: "users/{uid}/outbox/{id}", secrets: [RESEND_API_KEY, TWILIO_SID, TWILIO_TOKEN], region: "us-central1", maxInstances: 5 },
  async event => {
    const snap = event.data; if (!snap) return;
    const msg = snap.data(); if (msg.status !== "approved") return;
    const db = admin.firestore(), { uid } = event.params;
    const fail = reason => snap.ref.update({ status: "failed", error: String(reason).slice(0, 300), failedAt: new Date().toISOString() });
    try {
      const core = (await db.doc(`users/${uid}/data/core`).get()).data();
      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
      const counted = await db.collection(`users/${uid}/outbox`).where("sentAt", ">=", startOfDay.toISOString()).count().get();
      const check = validate({ msg, core, sentToday: counted.data().count });
      if (!check.ok) return fail(check.reason);
      const providerId = (msg.channel || "email") === "sms" ? await sendSms(msg) : await sendEmail(msg);
      await snap.ref.update({ status: "sent", sentAt: new Date().toISOString(), providerId });
    } catch (e) { logger.error("sendApproved failed", e); await fail(e.message && e.provider ? e.message : "Something went wrong while sending. Try again."); }
  }
);

// Card payments. The app asks for a link for one invoice. The amount comes from the saved invoice, never from the browser.
exports.createCheckout = onCall({ secrets: [STRIPE_KEY], region: "us-central1", maxInstances: 5 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid, id = String(req.data && req.data.invoiceId || ""), origin = String(req.data && req.data.origin || "");
  if (!/^https:\/\/[\w.-]+(:\d+)?$/.test(origin)) throw new HttpsError("invalid-argument", "Bad origin.");
  const core = (await admin.firestore().doc(`users/${uid}/data/core`).get()).data() || {}, invoice = (core.invoices || []).find(i => i.id === id);
  if (!invoice || invoice.status !== "unpaid" || !(invoice.amountCents >= 50)) throw new HttpsError("failed-precondition", "That invoice can't be paid online.");
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${STRIPE_KEY.value()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: checkoutParams({ invoice, businessName: core.profile && core.profile.name, successUrl: `${origin}/?paid=1`, cancelUrl: `${origin}/`, uid }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.url) { logger.warn("Stripe refused", res.status, out.error && out.error.message); throw new HttpsError("internal", "The payment service refused the request."); }
  return { url: out.url };
});
exports.stripeWebhook = onRequest({ secrets: [STRIPE_WEBHOOK_SECRET], region: "us-central1", maxInstances: 5 }, async (req, res) => {
  if (!verifyStripeSignature(req.rawBody ? req.rawBody.toString("utf8") : "", req.get("stripe-signature"), STRIPE_WEBHOOK_SECRET.value())) { res.status(400).send("bad signature"); return; }
  const rec = paymentFromEvent(req.body);
  if (rec) await admin.firestore().doc(`users/${rec.uid}/payments/${rec.payment.id}`).set(rec.payment);
  res.json({ received: true });
});

// Weekly summary to the owner. Each owner is emailed only if they switched it on (profile.digest) and something happened.
exports.weeklyDigest = onSchedule({ schedule: "every monday 08:00", timeZone: "America/Los_Angeles", secrets: [RESEND_API_KEY], region: "us-central1" }, async () => {
  const db = admin.firestore(), snap = await db.collectionGroup("data").get(), today = new Date().toISOString().slice(0, 10);
  for (const d of snap.docs) {
    if (d.id !== "core") continue; const core = d.data(), to = core.profile && core.profile.digestEmail; if (!core.profile || !core.profile.digest || !to) continue;
    const dg = buildDigest(core, today); if (!dg.worthSending) continue;
    try { await sendEmail({ fromName: "Recoup", to, replyTo: to, subject: dg.subject, body: dg.text }); } catch (e) { logger.warn("digest failed", d.ref.path); }
  }
});

// Live price lookup. Provider-agnostic placeholder: wire your price data provider in here (README section 8).
exports.lookupPrice = onCall({ secrets: [PRICE_API_KEY], region: "us-central1", maxInstances: 3 }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  throw new HttpsError("unimplemented", "No price provider is connected yet. See README section 8.");
});

