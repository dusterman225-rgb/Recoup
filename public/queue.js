// Ready to send: reminders and follow-ups the owner approves in one tap. Nothing leaves without that tap.
import { S, ui, VIEWS, forms, acts, PARENT, go, backBtn, errBox, fail, toast, now, copyText, render, esc, usd } from "./core.js";
import { persistCore, F, writeOutbox } from "./store.js";
import { todayStr, addDays, longDay, plural, uid, queueItems, computeFindings } from "./lib.js";
import { phoneE164 } from "./jobs.js";

export const queueCount = () => queueItems(S).length;
const customerOf = f => {
  if (f.kind === "invoice") return S.customers.find(c => c.id === S.invoices.find(i => i.id === f.refId)?.customerId);
  if (f.kind === "quote") return S.customers.find(c => c.id === S.quotes.find(i => i.id === f.refId)?.customerId);
  if (f.kind === "review") return S.customers.find(c => c.id === S.invoices.find(i => i.id === f.refId)?.customerId);
  if (f.kind === "visit") return S.customers.find(c => c.id === S.events.find(i => i.id === f.refId)?.customerId);
};
// What this item can be sent as right now.
function channels(f) {
  const c = customerOf(f), out = [], fu = f.followUp;
  if (F.sendEmail && fu.to) out.push("email");
  if (F.sendSms && c && c.smsOk && phoneE164(fu.phone)) out.push("sms");
  return out;
}
const kindWord = k => ({ invoice: "Invoice reminder", quote: "Quote follow-up", review: "Review request", visit: "Visit reminder" }[k] || "Message");

function card(f) {
  const fu = ui.rw[f.id] || f.followUp, id = esc(f.id), ch = channels(f), can = ch.length > 0, c = customerOf(f);
  const why = !fu.to && !(c && c.phone) ? `<p class="ev"><span class="chip late">No contact</span><span>Add an email or phone number to this customer to send it.</span></p>` : "";
  return `<li class="card ticket ${f.kind === "invoice" ? "late" : ""}" data-fid="${id}">
    <div class="row between"><label style="flex-direction:row;align-items:center;gap:10px;font-weight:600"><input type="checkbox" name="pick" value="${id}" ${can ? "checked" : "disabled"} style="width:auto;min-height:0"><span>${esc(f.title)}</span></label>${f.amountCents ? `<strong class="mark">${usd(f.amountCents)}</strong>` : `<span class="chip">${kindWord(f.kind)}</span>`}</div>
    ${why}${fu.to ? `<p class="muted">To: ${esc(fu.to)}</p>` : ""}
    ${ch.length > 1 ? `<label>Send as<select name="channel:${id}">${ch.map(x => `<option value="${x}">${x === "sms" ? "Text message" : "Email"}</option>`).join("")}</select></label>` : ch.length === 1 ? `<input type="hidden" name="channel:${id}" value="${ch[0]}">` : ""}
    <label>Subject <span class="hint">(email only)</span><input name="subject:${id}" value="${esc(fu.subject)}" maxlength="200"></label>
    <label>Message<textarea name="body:${id}" maxlength="3000">${esc(fu.body)}</textarea></label>
    <div class="row">${can ? "" : `<button class="btn small" type="button" data-act="copyq">Copy message</button>${fu.to ? `<a class="btn small light" style="text-decoration:none" href="mailto:${esc(fu.to)}?subject=${encodeURIComponent(fu.subject)}&body=${encodeURIComponent(fu.body)}">Open in email</a>` : ""}${c && c.phone ? `<a class="btn small light" style="text-decoration:none" href="sms:${esc(c.phone.replace(/[^\d+]/g, ""))}?&body=${encodeURIComponent(fu.body)}">Open in texts</a>` : ""}<button class="btn small light" type="button" data-act="sentmanual" data-id="${id}">I sent it</button>`}
    <button class="btn small light" type="button" data-act="snooze" data-id="${id}">Not for 3 days</button></div></li>`;
}
VIEWS.queue = () => {
  const items = queueItems(S), can = F.sendEmail || F.sendSms, log = S.outbox.slice(0, 12), sendable = items.filter(f => channels(f).length).length;
  return `${backBtn("Home")}<h1>Ready to send</h1>${errBox()}
  <p class="muted">${items.length ? (can ? "Read each message, change anything you like, and untick any you want to hold back. Nothing goes out until you tap the button." : "Sending from Recoup isn't turned on yet. Copy a message or open it in your email or texts, send it yourself, then tap I sent it so the follow-up clock restarts.") : "Nothing is waiting. Messages show up here when an invoice goes past due, a quote goes quiet, a job is paid or a visit is tomorrow."}</p>
  ${items.length ? `<form data-form="sendQueue" class="stack" style="gap:12px"><ul class="list">${items.map(card).join("")}</ul>
    ${can ? `<button class="btn hi block" type="submit" id="send-all">Approve and send ${sendable}</button><p class="muted">Emails go out with your business name and replies come to ${esc(ui.user?.email || "you")}. Text messages need the customer's consent, saved on their page. Laws on collection reminders and texting vary, so check yours.</p>` : ""}</form>` : ""}
  ${log.length ? `<section class="stack"><h2>Recent</h2><ul class="list">${log.map(o => `<li class="card"><div class="row between"><strong>${esc(o.subject || (o.channel === "sms" ? "Text message" : "Message"))}</strong><span class="chip ${o.status === "sent" ? "ok" : o.status === "failed" ? "late" : "est"}">${o.status === "approved" ? "sending" : o.status}</span></div><span class="muted">${o.channel === "sms" ? "Text to" : "To"} ${esc(o.to)} · ${longDay((o.sentAt || o.approvedAt || "").slice(0, 10))}</span>${o.status === "failed" ? `<p class="ev"><span class="chip late">Not sent</span><span>${esc(o.error || "It could not be sent.")}</span></p>` : ""}</li>`).join("")}</ul></section>` : ""}`;
};
PARENT.queue = "home";

document.addEventListener("change", e => {
  if (e.target.name !== "pick") return; const b = document.getElementById("send-all"); if (!b) return;
  const n = document.querySelectorAll('input[name="pick"]:checked').length; b.disabled = n === 0; b.textContent = n ? `Approve and send ${n}` : "Tick a message to send";
});

forms.sendQueue = async fd => {
  if (!(F.sendEmail || F.sendSms) || ui.busy) return;
  const picks = fd.getAll("pick"); if (!picks.length) return fail("Tick at least one message.");
  const all = computeFindings(S), docs = [];
  for (const id of picks) {
    const f = all.find(x => x.id === id); if (!f || !f.followUp) continue;
    const ch = String(fd.get("channel:" + id) || ""); if (!channels(f).includes(ch)) continue;
    const subject = String(fd.get("subject:" + id) || "").trim(), body = String(fd.get("body:" + id) || "").trim();
    if (!body || (ch === "email" && !subject)) return fail("Every message needs some text, and emails need a subject.");
    const to = ch === "sms" ? phoneE164(f.followUp.phone) : f.followUp.to;
    docs.push({ id: uid(), status: "approved", channel: ch, kind: f.kind, refId: f.refId, to, subject: ch === "sms" ? "" : subject.slice(0, 200), body: body.slice(0, ch === "sms" ? 480 : 3000), replyTo: ui.user.email, fromName: S.profile.name || "Your business", approvedAt: now() });
  }
  if (!docs.length) return fail("None of those can be sent. Check that each customer has an email address, or a phone number with texting allowed.");
  ui.busy = true;
  try { await writeOutbox(docs); docs.forEach(d => S.outbox.unshift(d)); render(); toast(`${docs.length} approved. Sending now.`); }
  catch (e) { toast("Couldn't send. Check your connection and try again."); } finally { ui.busy = false; }
};

acts.copy = el => copyText(el.dataset.text);
acts.copyq = el => { const c = el.closest("li"); copyText(c.querySelector('input[name^="subject:"]').value + "\n\n" + c.querySelector("textarea").value); };
// The owner sent it themselves. Restart the clock the same way a confirmed send does.
acts.sentmanual = el => {
  const f = computeFindings(S).find(x => x.id === el.dataset.id); if (!f) return; const t = todayStr();
  if (f.kind === "invoice") { const i = S.invoices.find(x => x.id === f.refId); if (i) i.lastReminderAt = t; }
  if (f.kind === "quote") { const q = S.quotes.find(x => x.id === f.refId); if (q) q.lastContactAt = t; }
  if (f.kind === "review") S.reviewAsked[f.refId] = t;
  if (f.kind === "visit") { const e = S.events.find(x => x.id === f.refId); if (e) e.remindedAt = t; }
  persistCore(); render(); toast("Logged. The clock restarts.");
};
acts.snooze = el => { S.snoozed[el.dataset.id] = addDays(todayStr(), 3); persistCore(); render(); toast("Hidden for 3 days"); };

