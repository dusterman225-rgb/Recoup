// Day-to-day operations: schedule, subcontractors, licenses and insurance, leads inbox, mileage.
import { S, ui, VIEWS, forms, acts, AFTER, PARENT, go, backBtn, errBox, fail, toast, now, custName, customerSelect, jobSelect, confirmTap, download, esc, usd } from "./core.js";
import { persistCore, putFile, getFile, removeFile, updateLead, deleteLead, publishPublic } from "./store.js";
import { todayStr, addDays, longDay, weekdayDay, timeText, isDay, isTime, parseMoney, plural, uid, icsFor, expiryState, subYearTotals, haversineMiles, daysBetween, toCsv, money2 } from "./lib.js";
import { phoneE164 } from "./jobs.js";
import { shrinkImage as shrink } from "./core.js";

/* ================= schedule ================= */
export const eventsOn = d => S.events.filter(e => e.date === d).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
const evLine = e => `<li class="card"><div class="row between"><button class="link-card plain" data-go="eventEdit" data-id="${e.id}"><strong>${e.time ? esc(timeText(e.time)) + " · " : ""}${esc(e.title)}</strong></button><button class="back" data-act="evics" data-id="${e.id}">Add to calendar</button></div>
  <span class="muted">${esc(e.customerId ? custName(e.customerId) : "")}${e.jobId ? " · " + esc(S.jobs.find(j => j.id === e.jobId)?.title || "") : ""}</span>${e.notes ? `<span class="muted">${esc(e.notes)}</span>` : ""}</li>`;
export const todayList = () => { const l = eventsOn(todayStr()); return l.length ? `<ul class="list">${l.map(evLine).join("")}</ul>` : ""; };

VIEWS.schedule = () => {
  const t = todayStr(), up = S.events.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  const days = [...new Set(up.map(e => e.date))].slice(0, 30);
  return `${backBtn("More")}<div class="row between"><h1>Schedule</h1><button class="btn hi small" data-go="eventEdit">Add</button></div>${errBox()}
  ${days.length ? days.map(d => `<section class="stack"><h2>${d === t ? "Today" : d === addDays(t, 1) ? "Tomorrow" : esc(weekdayDay(d))}</h2><ul class="list">${eventsOn(d).map(evLine).join("")}</ul></section>`).join("") : `<div class="empty"><p class="muted">Nothing scheduled.</p><button class="btn hi" data-go="eventEdit">Schedule a visit</button></div>`}
  <p class="muted">Tap Add to calendar to put an item in your phone's calendar. If you save a customer's email, Recoup drafts a reminder the day before.</p>`;
};
PARENT.schedule = "more";
VIEWS.eventEdit = p => {
  const e = p.id ? S.events.find(x => x.id === p.id) : null;
  return `${backBtn("Schedule")}<h1>${e ? "Edit visit" : "New visit"}</h1>${errBox()}
  <form class="card" data-form="saveEvent"><input type="hidden" name="id" value="${e ? e.id : ""}">
    <label>What is it<input name="title" value="${esc(e?.title || "")}" required maxlength="120" placeholder="Estimate at the Whitfield house"></label>
    <div class="grid2"><label>Date<input name="date" type="date" value="${esc(e?.date || p.date || todayStr())}" required></label><label>Time <span class="hint">(optional)</span><input name="time" type="time" value="${esc(e?.time || "")}"></label></div>
    <label>Length<select name="dur">${[30, 60, 90, 120, 240, 480].map(m => `<option value="${m}" ${(e?.durationMin || 60) === m ? "selected" : ""}>${m < 120 ? m + " minutes" : m / 60 + " hours"}</option>`).join("")}</select></label>
    <label>Customer <span class="hint">(optional)</span>${customerSelect("customerId", false, e?.customerId || p.customerId)}</label>
    ${S.jobs.length ? `<label>Job <span class="hint">(optional)</span>${jobSelect("jobId", e?.jobId)}</label>` : ""}
    <label>Notes <span class="hint">(optional)</span><textarea name="notes" maxlength="600" style="min-height:70px">${esc(e?.notes || "")}</textarea></label>
    <button class="btn" type="submit">Save</button>${e ? `<button class="btn light" type="button" data-act="delevent" data-id="${e.id}">Delete</button>` : ""}</form>`;
};
PARENT.eventEdit = "more";
forms.saveEvent = fd => {
  const id = String(fd.get("id") || ""), title = String(fd.get("title") || "").trim(), date = String(fd.get("date") || ""), time = String(fd.get("time") || "");
  if (!title) return fail("Say what it is."); if (!isDay(date)) return fail("Choose a date."); if (time && !isTime(time)) return fail("Choose a valid time.");
  const f = { title, date, time, durationMin: parseInt(fd.get("dur"), 10) || 60, customerId: String(fd.get("customerId") || "") || null, jobId: String(fd.get("jobId") || "") || null, notes: String(fd.get("notes") || "").trim() };
  const e = id ? S.events.find(x => x.id === id) : null;
  if (e) { if (e.date !== date) e.remindedAt = null; Object.assign(e, f); } else S.events.push({ id: uid(), remindedAt: null, createdAt: now(), ...f });
  persistCore(); go("schedule", {}, { replace: true }); toast("Saved");
};
acts.delevent = el => { if (!confirmTap(el, "Tap again to delete")) return; S.events = S.events.filter(e => e.id !== el.dataset.id); persistCore(); go("schedule", {}, { replace: true }); };
acts.evics = el => { const e = S.events.find(x => x.id === el.dataset.id); if (e) download(`${e.title.replace(/[^\w]+/g, "-").slice(0, 40) || "visit"}.ics`, icsFor(e, e.customerId ? custName(e.customerId) : ""), "text/calendar;charset=utf-8"); };

/* ================= subcontractors ================= */
VIEWS.subs = () => {
  const yr = new Date().getFullYear(), rows = subYearTotals(S, yr), lim = S.profile.subThresholdCents ?? 200000;
  return `${backBtn("More")}<div class="row between"><h1>Subcontractors</h1><button class="btn hi small" data-go="subEdit">Add</button></div>${errBox()}
  <p class="muted">Track what you pay each one. Recoup flags anyone paid ${usd(lim)} or more this year who has no W-9 on file. The IRS rules on 1099s change, so confirm the threshold with your accountant.</p>
  ${rows.length ? `<ul class="list">${rows.map(({ sub, paid, needsW9 }) => `<li><button class="card link-card" data-go="sub" data-id="${sub.id}"><div class="row between"><strong>${esc(sub.name)}</strong><strong>${usd(paid)}</strong></div>
    <span class="muted">${esc(sub.trade || "Subcontractor")} · ${yr} payments</span><div class="row">${needsW9 ? `<span class="chip late">Needs W-9</span>` : sub.w9 ? `<span class="chip ok">W-9 on file</span>` : ""}${expiryChip(sub.insuranceExpires, "Insurance")}</div></button></li>`).join("")}</ul>
    <button class="btn light block" data-act="csv1099">Download ${yr} payments (CSV)</button>` : `<div class="empty"><p class="muted">No subcontractors yet.</p></div>`}`;
};
PARENT.subs = "more";
function expiryChip(date, label) { const st = expiryState(date, todayStr()); if (!st) return ""; return st.state === "expired" ? `<span class="chip late">${label} expired</span>` : st.state === "soon" ? `<span class="chip est">${label} ends in ${plural(st.days, "day")}</span>` : `<span class="chip ok">${label} ok</span>`; }
VIEWS.subEdit = p => {
  const s = p.id ? S.subs.find(x => x.id === p.id) : null;
  return `${backBtn("Subcontractors")}<h1>${s ? "Edit subcontractor" : "New subcontractor"}</h1>${errBox()}
  <form class="card" data-form="saveSub"><input type="hidden" name="id" value="${s ? s.id : ""}">
    <label>Name<input name="name" value="${esc(s?.name || "")}" required maxlength="120"></label><label>Trade <span class="hint">(optional)</span><input name="trade" value="${esc(s?.trade || "")}" maxlength="80" placeholder="Drywall"></label>
    <div class="grid2"><label>Email<input name="email" type="email" value="${esc(s?.email || "")}"></label><label>Phone<input name="phone" type="tel" value="${esc(s?.phone || "")}"></label></div>
    <label>Insurance certificate expires <span class="hint">(optional)</span><input name="ins" type="date" value="${esc(s?.insuranceExpires || "")}"></label>
    <label class="check"><input type="checkbox" name="w9" ${s?.w9 ? "checked" : ""}> <span>I have their W-9</span></label>
    <label>Notes<textarea name="notes" maxlength="800" style="min-height:70px">${esc(s?.notes || "")}</textarea></label><button class="btn" type="submit">Save</button></form>`;
};
PARENT.subEdit = "more";
forms.saveSub = fd => {
  const id = String(fd.get("id") || ""), name = String(fd.get("name") || "").trim(), ins = String(fd.get("ins") || ""); if (!name) return fail("Enter a name."); if (ins && !isDay(ins)) return fail("Choose a valid date.");
  const f = { name, trade: String(fd.get("trade") || "").trim(), email: String(fd.get("email") || "").trim().toLowerCase(), phone: String(fd.get("phone") || "").trim(), insuranceExpires: ins || null, w9: !!fd.get("w9"), notes: String(fd.get("notes") || "").trim() };
  let s = id ? S.subs.find(x => x.id === id) : null; if (s) Object.assign(s, f); else { s = { id: uid(), createdAt: now(), ...f }; S.subs.push(s); }
  persistCore(); go("sub", { id: s.id }, { replace: true }); toast("Saved");
};
VIEWS.sub = p => {
  const s = S.subs.find(x => x.id === p.id); if (!s) return VIEWS.subs();
  const pays = S.costs.filter(c => c.subId === s.id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `${backBtn("Subcontractors")}<h1>${esc(s.name)}</h1><p class="muted">${esc(s.trade || "")}${s.email ? " · " + esc(s.email) : ""}${s.phone ? " · " + esc(s.phone) : ""}</p>
  <div class="row">${s.w9 ? `<span class="chip ok">W-9 on file</span>` : `<span class="chip">No W-9</span>`}${expiryChip(s.insuranceExpires, "Insurance")}</div>
  <div class="row"><button class="btn small light" data-go="subEdit" data-id="${s.id}">Edit</button><button class="btn small light" data-act="delsub" data-id="${s.id}">Delete</button></div>
  <section class="stack"><h2>Payments</h2>${pays.length ? `<ul class="list">${pays.map(c => `<li class="card row between"><span>${esc(c.description)} <span class="muted">${longDay(c.date || (c.createdAt || "").slice(0, 10))} · ${esc(S.jobs.find(j => j.id === c.jobId)?.title || "")}</span></span><strong>${usd(c.amountCents)}</strong></li>`).join("")}</ul>` : `<p class="muted">None yet. Record a payment as a cost on a job and choose this subcontractor.</p>`}</section>`;
};
PARENT.sub = "more";
acts.delsub = el => { if (!confirmTap(el, "Tap again to delete")) return; S.subs = S.subs.filter(x => x.id !== el.dataset.id); S.costs.forEach(c => { if (c.subId === el.dataset.id) c.subId = null; }); persistCore(); go("subs"); };
acts.csv1099 = () => {
  const yr = new Date().getFullYear(), rows = subYearTotals(S, yr).map(({ sub, paid }) => [sub.name, sub.trade, sub.email, sub.phone, sub.w9 ? "yes" : "no", money2(paid)]);
  download(`subcontractor-payments-${yr}.csv`, toCsv(["Name", "Trade", "Email", "Phone", "W-9 on file", `Paid in ${yr}`], rows));
};

/* ================= licenses, insurance, certificates ================= */
VIEWS.compliance = () => {
  const list = S.compliance.slice().sort((a, b) => (a.expires || "9").localeCompare(b.expires || "9"));
  return `${backBtn("More")}<div class="row between"><h1>Licenses and insurance</h1><button class="btn hi small" data-go="compEdit">Add</button></div>${errBox()}
  <p class="muted">Add each license, insurance policy, bond or certificate with its date. Recoup warns you 30 days before one runs out.</p>
  ${list.length ? `<ul class="list">${list.map(c => `<li><button class="card link-card" data-go="compEdit" data-id="${c.id}"><div class="row between"><strong>${esc(c.name)}</strong>${expiryChip(c.expires, "")}</div><span class="muted">${c.number ? esc(c.number) + " · " : ""}${c.expires ? "Expires " + longDay(c.expires) : "No date"}${c.fileId ? " · certificate saved" : ""}</span></button></li>`).join("")}</ul>` : `<div class="empty"><p class="muted">Nothing saved yet.</p></div>`}`;
};
PARENT.compliance = "more";
VIEWS.compEdit = p => {
  const c = p.id ? S.compliance.find(x => x.id === p.id) : null;
  return `${backBtn("Licenses and insurance")}<h1>${c ? "Edit" : "New"}</h1>${errBox()}
  <form class="card" data-form="saveComp"><input type="hidden" name="id" value="${c ? c.id : ""}">
    <label>Name<input name="name" value="${esc(c?.name || "")}" required maxlength="120" placeholder="General liability insurance"></label>
    <div class="grid2"><label>Number <span class="hint">(optional)</span><input name="number" value="${esc(c?.number || "")}" maxlength="60"></label><label>Expires<input name="expires" type="date" value="${esc(c?.expires || "")}" required></label></div>
    <label>Notes<textarea name="notes" maxlength="600" style="min-height:60px">${esc(c?.notes || "")}</textarea></label>
    <div class="row"><label class="btn light small" style="cursor:pointer">${c?.fileId ? "Replace certificate photo" : "Add certificate photo"}<input id="comp-file" type="file" accept="image/*" hidden></label></div>
    <div id="comp-img">${c?.fileId ? `<p class="muted">Loading certificate…</p>` : ""}</div>
    <button class="btn" type="submit">Save</button>${c ? `<button class="btn light" type="button" data-act="delcomp" data-id="${c.id}">Delete</button>` : ""}</form>`;
};
PARENT.compEdit = "more";
AFTER.compEdit = async p => { const c = p.id && S.compliance.find(x => x.id === p.id); if (!c || !c.fileId) return; const f = await getFile(c.fileId), box = document.getElementById("comp-img"); if (box) box.innerHTML = f ? `<img class="receipt-img" src="${esc(f.img)}" alt="Certificate">` : `<p class="muted">The photo isn't available offline.</p>`; };
forms.saveComp = fd => {
  const id = String(fd.get("id") || ""), name = String(fd.get("name") || "").trim(), exp = String(fd.get("expires") || ""); if (!name) return fail("Name it."); if (!isDay(exp)) return fail("Choose the expiry date.");
  const f = { name, number: String(fd.get("number") || "").trim(), expires: exp, notes: String(fd.get("notes") || "").trim() };
  const c = id ? S.compliance.find(x => x.id === id) : null; if (c) Object.assign(c, f); else S.compliance.push({ id: uid(), fileId: null, ...f });
  persistCore(); go("compliance", {}, { replace: true }); toast("Saved");
};
acts.delcomp = el => { if (!confirmTap(el, "Tap again to delete")) return; const c = S.compliance.find(x => x.id === el.dataset.id); if (c && c.fileId) removeFile(c.fileId); S.compliance = S.compliance.filter(x => x.id !== el.dataset.id); persistCore(); go("compliance", {}, { replace: true }); };
document.addEventListener("change", async e => {
  if (e.target.id !== "comp-file") return; const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const c = S.compliance.find(x => x.id === ui.p.id); if (!c) return toast("Save it first, then add the photo.");
  const img = await shrink(file, [[1200, .6], [900, .5], [700, .45]], 220000); if (!img) return fail("That photo is too detailed to store.");
  try { const fid = c.fileId || uid(); await putFile({ id: fid, jobId: "cmp:" + c.id, kind: "certificate", label: c.name, img, createdAt: now() }); c.fileId = fid; persistCore(); go("compEdit", { id: c.id }, { replace: true }); toast("Photo saved"); } catch { fail("Couldn't save the photo."); }
});

/* ================= leads inbox ================= */
VIEWS.leads = () => {
  const list = S.leads, url = ui.user ? `${location.origin}/request.html?b=${ui.user.uid}` : "";
  return `${backBtn("More")}<h1>Requests</h1>${errBox()}
  <section class="card"><h2>Your request page</h2><p class="muted">Customers can ask for a quote on a page of yours. Share the link on your website, a text or a business card. Requests land here.</p>
    <label class="check"><input type="checkbox" data-act="leadtoggle" ${S.profile.leadForm ? "checked" : ""}> <span>Turn the request page on</span></label>
    ${S.profile.leadForm ? `<p class="msg" style="overflow-wrap:anywhere">${esc(url)}</p><div class="row"><button class="btn small" data-act="copy" data-text="${esc(url)}">Copy link</button></div>` : ""}</section>
  ${list.length ? `<ul class="list">${list.map(l => `<li class="card"><div class="row between"><strong>${esc(l.name)}</strong><span class="chip ${l.status === "new" ? "est" : ""}">${esc(l.status || "new")}</span></div>
    <span class="muted">${esc([l.email, l.phone].filter(Boolean).join(" · "))} · ${longDay((l.createdAt || "").slice(0, 10))}</span><p class="msg">${esc(l.message || "")}</p>
    <div class="row"><button class="btn small hi" data-act="leadcustomer" data-id="${l.id}">Add as customer</button><button class="btn small light" data-act="leadstatus" data-id="${l.id}" data-status="done">Handled</button><button class="btn small light" data-act="leaddel" data-id="${l.id}">Delete</button></div></li>`).join("")}</ul>` : `<div class="empty"><p class="muted">No requests yet.</p></div>`}`;
};
PARENT.leads = "more";
acts.leadtoggle = el => { S.profile.leadForm = el.checked; persistCore(); publishPublic(); go("leads", {}, { replace: true }); };
acts.leadcustomer = async el => {
  const l = S.leads.find(x => x.id === el.dataset.id); if (!l) return;
  let c = S.customers.find(x => l.email && x.email === String(l.email).toLowerCase()); if (!c) { c = { id: uid(), name: String(l.name).slice(0, 120), email: String(l.email || "").toLowerCase().slice(0, 200), phone: String(l.phone || "").slice(0, 40), address: String(l.address || "").slice(0, 200), notes: String(l.message || "").slice(0, 1500), createdAt: now() }; S.customers.push(c); }
  l.status = "done"; persistCore(); try { await updateLead(l); } catch {} go("customer", { id: c.id }); toast("Customer added");
};
acts.leadstatus = async el => { const l = S.leads.find(x => x.id === el.dataset.id); if (l) { l.status = el.dataset.status; try { await updateLead(l); } catch { toast("Couldn't update."); } } };
acts.leaddel = async el => { if (!confirmTap(el, "Tap again")) return; try { await deleteLead(el.dataset.id); } catch { toast("Couldn't delete."); } };
export const newLeads = () => S.leads.filter(l => (l.status || "new") === "new").length;

/* ================= mileage ================= */
VIEWS.mileage = () => {
  const rate = S.profile.mileageRateCents ?? 70, yr = String(new Date().getFullYear()), trips = S.trips.slice().sort((a, b) => b.date.localeCompare(a.date)), miles = trips.filter(t => t.date.startsWith(yr)).reduce((s, t) => s + t.miles, 0), a = S.activeTrip;
  return `${backBtn("More")}<h1>Mileage</h1>${errBox()}
  <section class="card"><div class="row between"><span class="muted">${yr} miles</span><strong>${miles.toFixed(1)}</strong></div><div class="row between"><span class="muted">Estimated deduction at ${rate}¢ a mile</span><strong>${usd(Math.round(miles * rate))}</strong></div>
    <p class="muted">The deduction rate changes each year. Set the current one in Business details and check it with your accountant.</p></section>
  <section class="card"><h2>Track a drive</h2>${a ? `<p>Trip started ${esc(new Date(a.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}.</p><button class="btn hi" data-act="tripstop">Stop and save the trip</button><p class="muted">Straight-line distance between start and stop, so it can read short on winding routes. Check it before you rely on it.</p>`
    : `<button class="btn hi" data-act="tripstart">Start trip from here</button><p class="muted">Uses your phone's location once at the start and once at the end. Nothing is tracked in between.</p>`}</section>
  <form class="card" data-form="addTrip"><h2>Add a trip by hand</h2><div class="grid2"><label>Miles<input name="miles" inputmode="decimal" required placeholder="12.4"></label><label>Date<input name="date" type="date" value="${todayStr()}"></label></div>
    <label>Purpose<input name="purpose" maxlength="120" placeholder="Supply run"></label>${S.jobs.length ? `<label>Job <span class="hint">(optional)</span>${jobSelect("jobId")}</label>` : ""}<button class="btn" type="submit">Save trip</button></form>
  ${trips.length ? `<ul class="list">${trips.slice(0, 30).map(t => `<li class="card row between"><span>${longDay(t.date)} · ${esc(t.purpose || "Trip")}</span><span class="row"><strong>${t.miles.toFixed(1)} mi</strong><button class="back" data-act="deltrip" data-id="${t.id}">Remove</button></span></li>`).join("")}</ul>` : ""}`;
};
PARENT.mileage = "more";
forms.addTrip = fd => {
  const m = parseFloat(String(fd.get("miles") || "").replace(",", ".")), date = String(fd.get("date") || ""); if (!(m > 0 && m < 5000)) return fail("Enter the miles as a number, for example 12.4."); if (!isDay(date)) return fail("Choose a date.");
  S.trips.push({ id: uid(), date, miles: Math.round(m * 10) / 10, purpose: String(fd.get("purpose") || "").trim(), jobId: String(fd.get("jobId") || "") || null }); persistCore(); go("mileage", {}, { replace: true }); toast("Trip saved");
};
acts.deltrip = el => { S.trips = S.trips.filter(t => t.id !== el.dataset.id); persistCore(); go("mileage", {}, { replace: true }); };
const here = () => new Promise((ok, no) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => ok(p.coords), no, { enableHighAccuracy: true, timeout: 15000 }) : no(new Error("none")));
acts.tripstart = async () => { try { const c = await here(); S.activeTrip = { lat: c.latitude, lon: c.longitude, startedAt: now() }; persistCore(); go("mileage", {}, { replace: true }); } catch { fail("Couldn't get your location. Allow location for this site, or add the trip by hand."); } };
acts.tripstop = async () => {
  const a = S.activeTrip; if (!a) return;
  try { const c = await here(), m = Math.round(haversineMiles(a.lat, a.lon, c.latitude, c.longitude) * 10) / 10; S.activeTrip = null;
    if (m < 0.1) { persistCore(); go("mileage", {}, { replace: true }); return toast("That was under a tenth of a mile, so it wasn't saved."); }
    S.trips.push({ id: uid(), date: todayStr(), miles: m, purpose: "Tracked trip", jobId: null }); persistCore(); go("mileage", {}, { replace: true }); toast(`Saved ${m} miles`);
  } catch { fail("Couldn't get your location. Add the miles by hand instead."); }
};

