"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validate, fromHeader, cleanName, toE164 } = require("../send");

const core = {
  customers: [{ id: "c1", name: "Dana", email: "Dana@Example.com", phone: "(555) 010-0100", smsOk: true }, { id: "c2", name: "Sam", email: "sam@example.com", phone: "5550100200" }],
  invoices: [{ id: "i1", customerId: "c1", status: "unpaid" }, { id: "i2", customerId: "c1", status: "paid" }],
  events: [{ id: "e1", customerId: "c1" }], reviewAsked: {},
  quotes: [{ id: "q1", customerId: "c2", status: "sent" }, { id: "q2", customerId: "c2", status: "won" }],
};
const base = { status: "approved", kind: "invoice", refId: "i1", to: "dana@example.com", subject: "Reminder", body: "Hi", replyTo: "owner@shop.com" };
const run = (over, extra = {}) => validate({ msg: { ...base, ...over }, core, sentToday: 0, ...extra });

test("sends an approved reminder for an unpaid invoice (email match ignores case)", () => assert.equal(run({}).ok, true));
test("sends a follow-up for an open quote", () => assert.equal(run({ kind: "quote", refId: "q1", to: "sam@example.com" }).ok, true));
test("refuses a paid invoice", () => assert.match(run({ refId: "i2" }).reason, /already paid/));
test("refuses a quote that is no longer open", () => assert.match(run({ kind: "quote", refId: "q2", to: "sam@example.com" }).reason, /no longer open/));
test("refuses an address that is not a saved customer", () => assert.match(run({ to: "stranger@example.com" }).reason, /No customer/));
test("refuses a recipient that does not match the invoice's customer", () => assert.match(run({ to: "sam@example.com" }).reason, /does not match/));
test("refuses when not approved", () => assert.equal(run({ status: "draft" }).ok, false));
test("enforces the daily cap", () => assert.match(run({}, { sentToday: 25 }).reason, /Daily limit/));
test("refuses header tricks in subject or address", () => {
  assert.equal(run({ subject: "Hi\nBcc: x@y.com" }).ok, false);
  assert.equal(run({ to: "dana@example.com,evil@x.com" }).ok, false);
});
test("refuses unknown kind and oversize body", () => {
  assert.equal(run({ kind: "other" }).ok, false);
  assert.equal(run({ body: "x".repeat(3001) }).ok, false);
});
test("sender name cannot break the From header", () => {
  assert.equal(cleanName('Bad <evil@x.com>"\n'), "Bad evil@x.com");
  assert.equal(fromHeader("Bright Spark", "n@d.com"), "Bright Spark <n@d.com>");
  assert.equal(cleanName(""), "Your business");
});

const sms = over => run({ channel: "sms", to: "+15550100100", subject: "", replyTo: "", ...over });
test("sms: sends to a customer who agreed, matching their phone in any format", () => assert.equal(sms({}).ok, true));
test("sms: refuses a customer who has not agreed to texts", () => assert.match(sms({ kind: "quote", refId: "q1", to: "+15550100200" }).reason, /not agreed/));
test("sms: refuses unknown numbers, bad numbers and long messages", () => {
  assert.match(sms({ to: "+15559999999" }).reason, /No customer/);
  assert.match(sms({ to: "5550100100" }).reason, /not valid/);
  assert.match(sms({ body: "x".repeat(481) }).reason, /too long/);
});
test("review request only for a paid invoice that has not had one", () => {
  assert.equal(run({ kind: "review", refId: "i2" }).ok, true);
  assert.match(run({ kind: "review", refId: "i1" }).reason, /not paid/);
  assert.match(validate({ msg: { ...base, kind: "review", refId: "i2" }, core: { ...core, reviewAsked: { i2: "2026-10-01" } }, sentToday: 0 }).reason, /already sent/);
});
test("visit reminder must match the visit's customer", () => { assert.equal(run({ kind: "visit", refId: "e1" }).ok, true); assert.match(run({ kind: "visit", refId: "e1", to: "sam@example.com" }).reason, /does not match/); });
test("toE164 normalizes US numbers", () => { assert.equal(toE164("(555) 010-0100"), "+15550100100"); assert.equal(toE164("1-555-010-0100"), "+15550100100"); assert.equal(toE164("abc"), ""); });

