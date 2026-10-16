// Home, sign-in, first-run setup, and the More menu with business settings.
import { S, ui, render, VIEWS, forms, acts, PARENT, go, back, backBtn, errBox, fail, toast, now, download, confirmTap, jobBased, resetState, esc, usd } from "./core.js";
import { persistCore, flush, auth, F, fbReady, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, publishPublic } from "./store.js";
import { todayStr, addDays, dayNum, plural, computeFindings, parseMoney, parsePercent, uid, nextNumber, money2, CORE_KEYS, longDay, expiryState } from "./lib.js";
import { TYPES, typeOf } from "./types.js";
import { hasKey, aiCfg } from "./ai.js";
import { queueCount } from "./queue.js";
import { todayList, newLeads } from "./ops.js";
import { priceTip } from "./money.js";

/* ---------- home ---------- */
function findingCard(x) {
  const fu = ui.rw[x.id] || x.followUp, late = x.kind === "invoice";
  return `<li class="card ticket ${late ? "late" : ""}"><div class="row between"><strong>${esc(x.title)}</strong>${x.amountCents ? `<strong class="mark">${usd(x.amountCents)}</strong>` : ""}</div>
  <div class="stack">${x.evidence.map(([l, t]) => `<p class="ev"><span class="chip ${l === "verified" ? "ok" : l === "estimate" ? "est" : ""}">${l}</span><span>${esc(t)}</span></p>`).join("")}</div>
  <p><strong>Suggestion:</strong> ${esc(x.suggestion)}</p>
  ${fu ? `<details><summary>Show the message</summary><div class="stack"><p class="muted">To: ${fu.to ? esc(fu.to) : "No email saved for this customer"}</p><p class="muted">Subject: ${esc(fu.subject)}</p><div class="msg">${esc(fu.body)}</div>
    <div class="row"><button class="btn small" data-act="copy" data-text="${esc(fu.subject + "\n\n" + fu.body)}">Copy message</button>${fu.to ? `<a class="btn small light" style="text-decoration:none" href="mailto:${esc(fu.to)}?subject=${encodeURIComponent(fu.subject)}&body=${encodeURIComponent(fu.body)}">Open in email</a>` : ""}</div>
    ${ui.rw[x.id] ? `<p class="ev"><span class="chip est">AI reworded</span><span>Amounts, numbers and dates were checked against your record.</span></p>` : ""}</div></details>` : ""}
  <div class="row">
    ${x.kind === "invoice" ? `<button class="btn small" data-act="paidnow" data-id="${x.refId}">Mark paid</button><button class="btn small light" data-go="invoice" data-id="${x.refId}">Open</button>` : ""}
    ${x.kind === "quote" ? `<button class="btn small" data-act="contact" data-id="${x.refId}">I followed up</button><button class="btn small light" data-act="qstatus" data-id="${x.refId}" data-status="lost">Mark lost</button><button class="btn small light" data-go="quote" data-id="${x.refId}">Open</button>` : ""}
    ${x.kind === "job" ? `<button class="btn small" data-go="job" data-id="${x.refId}">Review job</button><button class="btn small light" data-go="coEdit" data-job-id="${x.refId}">Change order</button>` : ""}
    ${x.kind === "renewal" ? `<button class="btn small" data-go="compliance">Open licenses</button>` : ""}
    ${hasKey() ? `<button class="btn small light" data-act="explain" data-id="${x.id}">Explain</button>${x.followUp ? `<button class="btn small light" data-act="rewrite" data-id="${x.id}">Reword with AI</button>` : ""}` : ""}
  </div>${ui.ex[x.id] ? `<p class="ev"><span class="chip est">AI explanation</span><span>${esc(ui.ex[x.id])}</span></p>` : ""}</li>`;
}
function supplierSection() {
  const cutoff = addDays(todayStr(), -30), by = new Map();
  for (const r of S.receipts) {
    if (!r.confirmed || r.totalCents == null || (r.date || r.createdAt.slice(0, 10)) < cutoff) continue;
    const k = (r.vendor || "").trim().toLowerCase(), e = by.get(k) || { name: r.vendor.trim(), total: 0, n: 0 }; e.total += r.totalCents; e.n++; by.set(k, e);
  }
  const rows = [...by.values()].sort((a, b) => b.total - a.total).slice(0, 6); if (!rows.length) return ""; const max = rows[0].total;
  return `<section class="card"><h2>Spend by supplier, last 30 days</h2><p class="muted">From receipts you confirmed.</p><div class="stack">${rows.map(r => `<div class="sup"><span>${esc(r.name)} <span class="muted">(${plural(r.n, "receipt")})</span></span><strong>${usd(r.total)}</strong><div class="bar"><span style="width:${Math.round(r.total / max * 100)}%"></span></div></div>`).join("")}</div></section>`;
}
VIEWS.home = () => {
  const f = computeFindings(S), today = todayStr(), owed = S.invoices.filter(i => i.status === "unpaid"), owedTotal = owed.reduce((s, i) => s + i.amountCents, 0), lateTotal = owed.filter(i => dayNum(i.dueDate) < dayNum(today)).reduce((s, i) => s + i.amountCents, 0);
  const toConfirm = S.receipts.filter(r => !r.confirmed).length, q = queueCount(), leads = newLeads(), td = todayList();
  const empty = !S.invoices.length && !S.quotes.length && !S.jobs.length && !S.receipts.length;
  const month = today.slice(0, 7), earned = S.invoices.filter(i => i.status === "paid" && (i.paidAt || "").startsWith(month)).reduce((s, i) => s + i.amountCents, 0);
  return `<h1>${esc(S.profile.name || "Your business")}</h1>${errBox()}
  <section class="card"><span class="muted">Owed to you</span><p class="hero"><span class="mark">${usd(owedTotal)}</span></p>
    <p class="muted">${owed.length ? `${plural(owed.length, "unpaid invoice")}, ${usd(lateTotal)} of it past due.` : "No unpaid invoices recorded."}${earned ? ` Received this month: ${usd(earned)}.` : ""}</p></section>
  ${td ? `<section class="stack"><h2>Today</h2>${td}</section>` : ""}
  ${q ? `<button class="card link-card" data-go="queue"><strong>${plural(q, "message")} ready to review</strong><span class="muted">${F.sendEmail || F.sendSms ? "Approve them all in one tap." : "Reminders and follow-ups are drafted for you."}</span></button>` : ""}
  ${leads ? `<button class="card link-card" data-go="leads"><strong>${plural(leads, "new request")}</strong><span class="muted">Customers asked for a quote through your request page.</span></button>` : ""}
  ${toConfirm ? `<button class="card link-card" data-go="receipts"><strong>${plural(toConfirm, "receipt")} to confirm</strong><span class="muted">Receipts only count in your numbers once you confirm them.</span></button>` : ""}
  ${priceTip()}
  <section class="stack"><h2>Worth chasing</h2>${f.length ? `<ul class="list">${f.map(findingCard).join("")}</ul>` :
    empty ? `<div class="empty"><p>Nothing to chase yet. Add a customer, then a quote or an invoice, and Recoup will start watching for money that slips.</p><div class="row"><button class="btn hi" data-go="${S.customers.length ? (jobBased() ? "quotes" : "invoices") : "customerEdit"}">${S.customers.length ? "Add your first record" : "Add your first customer"}</button><button class="btn light" data-act="examples">Try with example data</button></div></div>`
    : `<div class="empty"><p>Nothing is slipping right now. Quotes quiet for a week, overdue invoices, jobs over budget and expiring licenses show up here.</p></div>`}</section>
  ${supplierSection()}`;
};

/* ---------- first run ---------- */
VIEWS.onboarding = () => `<h1>What kind of business do you run?</h1><p class="muted">This sets which tabs you see and which notes show up about your purchases. You can change it later.</p>${errBox()}
  <form data-form="onboard"><label>Business name<input name="name" autocomplete="organization" required maxlength="120" value="${esc(S.profile.name)}"></label>
    <div class="stack" role="radiogroup" aria-label="Business type">${TYPES.map(t => `<label class="type-opt"><input type="radio" name="type" value="${t.id}" required ${S.profile.type === t.id ? "checked" : ""}><span><b>${esc(t.label)}</b><span class="muted">${esc(t.purchases)}</span></span></label>`).join("")}</div>
    <button class="btn hi block" type="submit">Start with my business</button></form>`;
PARENT.onboarding = "more";
forms.onboard = fd => {
  const name = String(fd.get("name") || "").trim(), type = String(fd.get("type") || "");
  if (!name) return fail("Enter your business name."); if (!typeOf(type)) return fail("Choose the closest business type.");
  S.profile = { ...S.profile, name, type }; persistCore(); publishPublic(); go("home"); toast("Saved");
};
VIEWS.setup = () => `<h1>One setup step left</h1><p>Recoup needs your Firebase project details. Open <strong>public/firebase-config.js</strong>, paste in the values from the Firebase console, and redeploy.</p><p class="muted">The README lists every step.</p>`;

/* ---------- sign in ---------- */
function authMsg(e) {
  return ({ "auth/invalid-credential": "That email and password don't match.", "auth/wrong-password": "That email and password don't match.", "auth/user-not-found": "That email and password don't match.",
    "auth/email-already-in-use": "An account with that email exists. Sign in instead.", "auth/weak-password": "Use a password with at least 6 characters.", "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.", "auth/network-request-failed": "No connection. Check your signal and try again.",
    "auth/operation-not-allowed": "This sign-in method isn't turned on in Firebase yet.", "auth/unauthorized-domain": "This web address isn't authorized in Firebase yet." })[e && e.code] || "Couldn't sign in. Try again.";
}
VIEWS.auth = () => {
  const up = ui.authMode === "signup";
  return `<h1>${up ? "Create your account" : "Sign in to Recoup"}</h1><p class="muted">Find the money your business is leaving behind. Your records are private to your account.</p>${errBox()}
  <form class="card" data-form="${up ? "signup" : "signin"}"><label>Email<input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(ui.authEmail || "")}" required></label>
    <label>Password ${up ? `<span class="hint">(6 or more characters)</span>` : ""}<input name="password" type="password" autocomplete="${up ? "new-password" : "current-password"}" required minlength="6"></label>
    <button class="btn" type="submit">${up ? "Create account" : "Sign in"}</button><button class="btn light" type="button" data-act="google">Continue with Google</button>
    <div class="row between"><button class="back" type="button" data-act="authmode">${up ? "I already have an account" : "Create an account"}</button>${up ? "" : `<button class="back" type="button" data-act="reset">Forgot password</button>`}</div></form>`;
};
forms.signin = fd => { ui.authEmail = String(fd.get("email")).trim(); signInWithEmailAndPassword(auth, ui.authEmail, String(fd.get("password"))).catch(e => fail(authMsg(e))); };
forms.signup = fd => { ui.authEmail = String(fd.get("email")).trim(); createUserWithEmailAndPassword(auth, ui.authEmail, String(fd.get("password"))).catch(e => fail(authMsg(e))); };
acts.authmode = () => { ui.authMode = ui.authMode === "signup" ? "signin" : "signup"; ui.err = ""; render(); };
acts.google = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") fail(authMsg(e)); });
acts.reset = () => { const em = document.querySelector('input[name="email"]')?.value.trim(); if (!em) return fail("Type your email above, then tap Forgot password."); sendPasswordResetEmail(auth, em).then(() => toast("Check your email for a reset link"), e => fail(authMsg(e))); };
acts.signout = () => { flush(); signOut(auth); };

/* ---------- More ---------- */
const row = (view, title, sub, badge = "") => `<li><button class="card link-card" data-go="${view}"><div class="row between"><strong>${title}</strong>${badge}</div><span class="muted">${sub}</span></button></li>`;
VIEWS.more = () => {
  const t = typeOf(S.profile.type), jb = jobBased(), exp = S.compliance.filter(c => { const s = expiryState(c.expires, todayStr()); return s && s.state !== "ok"; }).length;
  return `<h1>More</h1>${errBox()}
  <button class="card link-card" data-go="search"><strong>Search</strong><span class="muted">Customers, invoices, jobs, receipts, items</span></button>
  <ul class="list">
    ${row("schedule", "Schedule", "Visits and appointments, with calendar export")}
    ${row("leads", "Requests", "Quote requests from your request page", newLeads() ? `<span class="chip est">${newLeads()} new</span>` : "")}
    ${row("reports", "Reports", "Profit, expenses by category, set-aside estimate, CSV exports")}
    ${row("cashflow", "Cash flow", "Next 30 days from invoices and bills")}
    ${row("prices", "Price tracker", "Where you paid less, from your own receipts")}
    ${jb ? row("customers", "Customers", "Contacts and history") : ""}
    ${row("catalog", "Price book", "Items you sell often")}
    ${row("recurring", "Recurring invoices", "Monthly or repeat billing")}
    ${row("mileage", "Mileage", "Track drives for your deduction")}
    ${jb ? row("subs", "Subcontractors", "Payments and W-9 watch") : ""}
    ${row("compliance", "Licenses and insurance", "Expiry reminders and certificates", exp ? `<span class="chip late">${exp} to renew</span>` : "")}
    ${row("settings", "Business details", "Name, logo, tax, terms, how customers pay")}
    ${row("aisettings", "AI helper", hasKey() ? "Key saved on this device" : "Optional. Add your own free Gemini key")}
    ${row("data", "Your data", "Backup, restore, example data, account")}
  </ul>
  ${t ? `<section class="card"><h2>What to watch in your purchases</h2><p><strong>You usually buy:</strong> ${esc(t.purchases)}</p><p><strong>Worth comparing:</strong> ${esc(t.compare)}</p><p><strong>Be careful:</strong> ${esc(t.caution)}</p></section>` : ""}`;
};

VIEWS.aisettings = () => `${backBtn("More")}<h1>AI helper</h1>${errBox()}
  <section class="card"><p class="muted">Optional. Recoup works fully without it. Paste your own free Gemini key to let AI read receipt photos, reword reminders, explain findings and draft quote lines.</p>
    <p class="muted">The key stays in this browser and goes only to Google. When you tap an AI button, that item's photo or text is sent to Google under your key. The AI never sets prices, and it can't change an amount, number or date in a message.</p>
    <p>${hasKey() ? `<span class="chip ok">Key saved on this device</span>` : `<span class="chip">No key yet</span>`}</p>
    <form data-form="aiKey"><label>Gemini API key <span class="hint">(create one free at aistudio.google.com/apikey)</span><input name="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${hasKey() ? "Saved. Paste a new key to replace it." : "Paste your key"}"></label>
      <label>Model <span class="hint">(leave as is unless Google renames it)</span><input name="model" value="${esc(aiCfg().model)}" autocapitalize="off" spellcheck="false"></label>
      <div class="row"><button class="btn small" type="submit">Save</button>${hasKey() ? `<button class="btn light small" type="button" data-act="testkey">Test key</button><button class="btn light small" type="button" data-act="rmkey">Remove key</button>` : ""}</div></form></section>`;
PARENT.aisettings = "more";

VIEWS.settings = () => {
  const p = S.profile;
  return `${backBtn("More")}<h1>Business details</h1><p class="muted">These appear on your quotes and invoices.</p>${errBox()}
  <form class="card" data-form="saveSettings">
    <label>Business name<input name="name" value="${esc(p.name || "")}" required maxlength="120"></label>
    <div class="grid2"><label>Phone<input name="phone" type="tel" value="${esc(p.phone || "")}"></label><label>Email<input name="email" type="email" value="${esc(p.email || "")}"></label></div>
    <label>Address<input name="address" value="${esc(p.address || "")}" maxlength="200"></label>
    <div class="grid2"><label>License number <span class="hint">(optional)</span><input name="license" value="${esc(p.license || "")}" maxlength="60"></label><label>Website <span class="hint">(optional)</span><input name="website" value="${esc(p.website || "")}" maxlength="120"></label></div>
    <div class="row"><label class="btn light small" style="cursor:pointer">${p.logo ? "Replace logo" : "Add logo"}<input id="logo-file" type="file" accept="image/*" hidden></label>${p.logo ? `<img src="${esc(p.logo)}" alt="Logo" style="height:40px"><button type="button" class="back" data-act="rmlogo">Remove</button>` : ""}</div>
    <h2>Billing</h2>
    <div class="grid2"><label>Sales tax % <span class="hint">(default)</span><input name="taxRate" inputmode="decimal" value="${p.taxRate ? esc(String(p.taxRate)) : ""}" placeholder="0"></label><label>Payment due in days<input name="dueDays" type="number" min="0" max="120" value="${p.dueDays ?? 14}"></label></div>
    <div class="grid2"><label>Quote prefix<input name="quotePrefix" value="${esc(p.quotePrefix || "Q-")}" maxlength="8"></label><label>Invoice prefix<input name="invoicePrefix" value="${esc(p.invoicePrefix || "INV-")}" maxlength="8"></label></div>
    <label>Default deposit % <span class="hint">(optional)</span><input name="depositPct" inputmode="decimal" value="${p.depositPct ? esc(String(p.depositPct)) : ""}" placeholder="30"></label>
    <label>How customers pay <span class="hint">(printed on invoices)</span><textarea name="payInstructions" maxlength="500" style="min-height:70px" placeholder="Check to 12 Main St, or Zelle to 555-0100">${esc(p.payInstructions || "")}</textarea></label>
    <label>Online payment link <span class="hint">(optional: Venmo, Square, PayPal, Stripe link. Added to invoices and reminders)</span><input name="payUrl" inputmode="url" autocapitalize="off" value="${esc(p.payUrl || "")}" placeholder="https://"></label>
    <label>Terms <span class="hint">(printed on quotes and invoices)</span><textarea name="terms" maxlength="1200" style="min-height:90px">${esc(p.terms || "")}</textarea></label>
    <label>Review link <span class="hint">(Google or Yelp page. Recoup then drafts review requests after a job is paid)</span><input name="reviewUrl" inputmode="url" autocapitalize="off" value="${esc(p.reviewUrl || "")}" placeholder="https://"></label>
    <h2>Rates and thresholds</h2>
    <div class="grid2"><label>Your cost per hour<input name="hourly" inputmode="decimal" value="${p.hourlyRateCents ? money2(p.hourlyRateCents) : ""}" placeholder="35.00"></label><label>Mileage rate (cents)<input name="mileage" inputmode="decimal" value="${p.mileageRateCents ?? 70}"></label></div>
    <div class="grid2"><label>Tax set-aside %<input name="setAside" inputmode="decimal" value="${p.setAsidePct ?? 25}"></label><label>Subcontractor 1099 watch ($)<input name="subLimit" inputmode="decimal" value="${money2(p.subThresholdCents ?? 200000)}"></label></div>
    <h2>Weekly summary email</h2>
    <label class="check"><input type="checkbox" name="digest" ${p.digest ? "checked" : ""}> <span>Email me a summary every Monday</span></label>
    <label>Send it to<input name="digestEmail" type="email" value="${esc(p.digestEmail || ui.user?.email || "")}"></label>
    ${F.digest ? "" : `<p class="muted">Saved now, but it only sends once the weekly email service is set up (README section 7).</p>`}
    <p class="muted">The mileage rate, set-aside and 1099 limit are planning numbers. Confirm the current figures with your accountant.</p>
    <button class="btn" type="submit">Save</button></form>
  <button class="btn light block" data-go="onboarding">Change business type</button>`;
};
PARENT.settings = "more";
forms.saveSettings = fd => {
  const p = S.profile, tax = parsePercent(fd.get("taxRate")), dep = parsePercent(fd.get("depositPct")), setA = parsePercent(fd.get("setAside")), hr = String(fd.get("hourly") || "").trim() ? parseMoney(fd.get("hourly")) : 0, lim = parseMoney(fd.get("subLimit")), mile = parseFloat(String(fd.get("mileage") || "70"));
  const name = String(fd.get("name") || "").trim(); if (!name) return fail("Enter your business name.");
  if (tax === null || dep === null || setA === null) return fail("Percentages must be numbers from 0 to 100."); if (hr === null) return fail("Enter your hourly cost as a plain number, for example 35.00."); if (lim === null) return fail("Enter the 1099 limit as a plain number."); if (!(mile >= 0 && mile < 500)) return fail("Enter the mileage rate in cents, for example 70.");
  const url = k => { const v = String(fd.get(k) || "").trim(); return v && !/^https?:\/\//i.test(v) ? "https://" + v : v; };
  Object.assign(p, { name, phone: String(fd.get("phone") || "").trim(), email: String(fd.get("email") || "").trim(), address: String(fd.get("address") || "").trim(), license: String(fd.get("license") || "").trim(), website: String(fd.get("website") || "").trim(),
    taxRate: tax, dueDays: Math.max(0, Math.min(120, parseInt(fd.get("dueDays"), 10) || 0)), quotePrefix: String(fd.get("quotePrefix") || "Q-").trim() || "Q-", invoicePrefix: String(fd.get("invoicePrefix") || "INV-").trim() || "INV-", depositPct: dep,
    payInstructions: String(fd.get("payInstructions") || "").trim(), payUrl: url("payUrl"), terms: String(fd.get("terms") || "").trim(), reviewUrl: url("reviewUrl"), hourlyRateCents: hr, mileageRateCents: mile, setAsidePct: setA, subThresholdCents: lim, digest: !!fd.get("digest"), digestEmail: String(fd.get("digestEmail") || "").trim() });
  persistCore(); publishPublic(); go("more"); toast("Saved");
};
document.addEventListener("change", async e => {
  if (e.target.id !== "logo-file") return; const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const { shrinkImage } = await import("./core.js"); const img = await shrinkImage(f, [[400, .8], [300, .7], [220, .6]], 60000); if (!img) return fail("That logo is too detailed. Try a simpler image.");
  S.profile.logo = img; persistCore(); render(); toast("Logo saved");
});
acts.rmlogo = () => { delete S.profile.logo; persistCore(); render(); };

/* ---------- your data ---------- */
VIEWS.data = () => `${backBtn("More")}<h1>Your data</h1>${errBox()}
  <section class="card"><h2>Account</h2><p class="muted">Signed in as ${esc(ui.user?.email || "")}</p><button class="btn light small" data-act="signout" style="align-self:flex-start">Sign out</button></section>
  <section class="card"><h2>Backup and restore</h2><p class="muted">Your data is saved privately to your account and kept on this device, so it works offline and syncs when you are back online. A backup file is a second copy you hold yourself. Photos are not in the file.</p>
    <div class="row"><button class="btn light small" data-act="backup">Download a backup</button><label class="btn light small" style="cursor:pointer">Restore from a backup<input id="restore-file" type="file" accept="application/json,.json" hidden></label></div></section>
  <section class="card"><h2>Example data</h2><p class="muted">Fills the app with fake customers and records so you can try every screen. Remove it whenever you like.</p>
    <div class="row">${S.customers.some(c => c.ex) ? `<button class="btn light small" data-act="rmexamples">Remove example data</button>` : `<button class="btn light small" data-act="examples">Add example data</button>`}</div></section>
  <section class="card"><h2>What leaves this device</h2><p class="muted">Nothing is sent to customers unless you approve it in Ready to send, and only if you turned on sending. AI features send one item to Google under your own key, only when you tap an AI button.</p></section>`;
PARENT.data = "more";
acts.backup = () => { const b = {}; CORE_KEYS.forEach(k => b[k] = S[k]); b.receipts = S.receipts.map(({ img, ...r }) => r); download(`recoup-backup-${todayStr()}.json`, JSON.stringify({ app: "recoup", version: 2, saved: now(), data: b }, null, 1), "application/json"); };
document.addEventListener("change", async e => {
  if (e.target.id !== "restore-file") return; const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); if (j.app !== "recoup" || !j.data) throw 0;
    if (!window.confirm("Replace everything in this account with the backup? This can't be undone.")) return;
    CORE_KEYS.forEach(k => { if (j.data[k] !== undefined) S[k] = j.data[k]; }); persistCore(); go("home"); toast("Restored. Receipt photos aren't in backups.");
  } catch { fail("That file isn't a Recoup backup."); }
});
acts.examples = () => {
  if (S.customers.some(c => c.ex)) return; const t = todayStr(), mk = o => Object.assign({ id: uid(), ex: true, createdAt: now() }, o);
  const a = mk({ name: "Example: Dana Whitfield", email: "dana@example.com", phone: "5555550100", smsOk: false }), b = mk({ name: "Example: Harbor Street Cafe", email: "", phone: "" }); S.customers.push(a, b);
  S.quotes.push(mk({ number: nextNumber(S.quotes, "Q-"), customerId: a.id, title: "Example: Panel upgrade", items: [{ desc: "200 amp panel, installed", qty: 1, unitCents: 385000, tax: false, kind: "other" }], taxRate: 0, discountCents: 0, amountCents: 385000, status: "sent", sentAt: addDays(t, -12), lastContactAt: null, notes: "" }));
  const j = mk({ title: "Example: Kitchen rewire", customerId: b.id, quoteId: null, budgetCents: 300000, contractCents: 450000, status: "open" }); S.jobs.push(j);
  S.costs.push(mk({ jobId: j.id, kind: "material", description: "Example: cable and breakers", amountCents: 182000, date: t, receiptId: null }), mk({ jobId: j.id, kind: "labor", description: "Example: two days labor", amountCents: 165000, date: t, receiptId: null }));
  S.invoices.push(mk({ number: nextNumber(S.invoices, "INV-"), customerId: b.id, jobId: j.id, items: [], title: "Example: Kitchen rewire deposit", amountCents: 142000, dueDate: addDays(t, -21), status: "unpaid", paidAt: null }));
  S.events.push(mk({ title: "Example: Estimate visit", date: addDays(t, 1), time: "09:00", durationMin: 60, customerId: a.id, notes: "" }));
  persistCore(); go("home"); toast("Example data added");
};
acts.rmexamples = () => { ["customers", "quotes", "jobs", "invoices", "costs", "events"].forEach(k => S[k] = S[k].filter(x => !x.ex)); persistCore(); render(); toast("Example data removed"); };

