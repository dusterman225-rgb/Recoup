"use strict";
const test = require("node:test"); const assert = require("node:assert/strict"); const { buildDigest } = require("../digest");
test("summarizes owed, late and quiet quotes", () => {
  const core = { profile: { name: "Spark" }, invoices: [{ number: "INV-0001", status: "unpaid", dueDate: "2026-09-01", amountCents: 100000 }, { number: "INV-0002", status: "paid", paidAt: "2026-10-12", amountCents: 50000 }], quotes: [{ title: "Deck", status: "sent", sentAt: "2026-09-20", amountCents: 300000 }], compliance: [] };
  const d = buildDigest(core, "2026-10-15"); assert.equal(d.worthSending, true); assert.match(d.text, /INV-0001/); assert.match(d.text, /Deck/); assert.match(d.subject, /\$1,000\.00 owed/);
});
test("skips an empty week", () => assert.equal(buildDigest({ profile: {}, invoices: [], quotes: [] }, "2026-10-15").worthSending, false));

