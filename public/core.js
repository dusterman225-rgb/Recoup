// Shared pieces every screen uses: the data object, the screen registry, rendering, navigation, small helpers.
// No Firebase in here. Saving lives in store.js.
import { freshState, esc, usd, todayStr, parseMoney } from "./lib.js";

export const S = freshState();                       // one business's data. Replaced field by field so every import keeps seeing it.
export const ui = { view: "home", p: {}, stack: [], err: "", loading: true, user: null, authMode: "signin", authEmail: "", setupNeeded: false, busy: false, rw: {}, ex: {}, q: "" };
export const VIEWS = {}, forms = {}, acts = {}, AFTER = {}, PARENT = {};
export const ROOTS = new Set(["home", "quotes", "jobs", "invoices", "receipts", "customers", "more"]);

export function resetState() { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, freshState()); }
export const $ = s => document.querySelector(s);
export const jobBased = () => { const t = S.profile.type; return !t || !["restaurant", "retail"].includes(t); };

/* ---------- toast, errors ---------- */
let toastT;
export function toast(msg) { const t = $("#toast"); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800); }
export const errBox = () => ui.err ? `<p class="err" role="alert">${esc(ui.err)}</p>` : "";
export function fail(m) { ui.err = m; render(); window.scrollTo(0, 0); return false; }

/* ---------- navigation ---------- */
export function go(view, p = {}, { replace = false } = {}) {
  if (ROOTS.has(view)) ui.stack = [];
  else if (!replace) ui.stack.push({ view: ui.view, p: ui.p });
  if (view !== ui.view) ui.q = "";
  ui.view = view; ui.p = p; ui.err = ""; render(); window.scrollTo(0, 0);
}
export function back() {
  const t = ui.stack.pop();
  if (t) { ui.view = t.view; ui.p = t.p; } else { ui.view = "home"; ui.p = {}; }
  ui.err = ""; render(); window.scrollTo(0, 0);
}
export const backBtn = (label = "Back") => `<button class="back" data-back>${esc(label)}</button>`;

function tabs() {
  return jobBased()
    ? [["home", "Home"], ["quotes", "Quotes"], ["jobs", "Jobs"], ["invoices", "Invoices"], ["receipts", "Receipts"], ["more", "More"]]
    : [["home", "Home"], ["invoices", "Invoices"], ["receipts", "Receipts"], ["customers", "Customers"], ["more", "More"]];
}

export function render() {
  const app = $("#app"), nav = $("#nav");
  if (!app) return;
  $("#biz").textContent = S.profile.name || "";
  if (ui.setupNeeded) { app.innerHTML = VIEWS.setup(); nav.hidden = true; return; }
  if (ui.loading) { app.innerHTML = '<p class="muted">Opening your books…</p>'; nav.hidden = true; return; }
  if (!ui.user) { app.innerHTML = VIEWS.auth(); nav.hidden = true; return; }
  if (!S.profile.type && ui.view !== "onboarding") { ui.view = "onboarding"; ui.p = {}; }
  const fn = VIEWS[ui.view] || VIEWS.home;
  app.innerHTML = fn(ui.p);
  nav.hidden = ui.view === "onboarding" && !S.profile.type;
  const cur = PARENT[ui.view] || (ROOTS.has(ui.view) ? ui.view : "more"), badge = S.receipts.filter(r => !r.confirmed).length;
  $("#nav-in").innerHTML = tabs().map(([v, l]) => `<button data-go="${v}" ${cur === v ? 'aria-current="page"' : ""}>${l}${v === "receipts" && badge ? `<span class="badge" aria-label="${badge} to confirm">${badge}</span>` : ""}</button>`).join("");
  if (AFTER[ui.view]) AFTER[ui.view](ui.p);
}
// Re-render unless the owner is in the middle of typing.
export function renderIfIdle() {
  const a = document.activeElement;
  if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) render();
}

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-back]");
  if (b) { e.preventDefault(); back(); return; }
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); const { go: v, ...rest } = g.dataset; go(v, rest); return; }
  const a = e.target.closest("[data-act]");
  if (a && acts[a.dataset.act]) { if (a.type !== "checkbox") e.preventDefault(); acts[a.dataset.act](a, e); }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("form[data-form]"); if (!f) return;
  e.preventDefault(); const h = forms[f.dataset.form];
  if (h) h(new FormData(f), e.submitter, f);
});

/* ---------- small helpers ---------- */
// Second tap within 4 seconds confirms. Used for deletes, since the page cannot show dialogs.
export function confirmTap(el, text = "Tap again to confirm") {
  if (el.dataset.sure === "1") return true;
  el.dataset.sure = "1"; el.dataset.orig = el.textContent; el.textContent = text;
  setTimeout(() => { if (el.isConnected) { el.dataset.sure = ""; el.textContent = el.dataset.orig; } }, 4000);
  return false;
}
export function download(filename, text, type = "text/csv;charset=utf-8") {
  const b = new Blob([text], { type }), a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
export function copyText(t) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Copied"), () => {
    const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied"); } catch { toast("Select the text and copy it."); } ta.remove();
  });
}
export const now = () => new Date().toISOString();
export const custName = id => S.customers.find(c => c.id === id)?.name ?? "No customer";
export function customerSelect(name, required, current, extra = "") {
  const opts = S.customers.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}" ${c.id === current ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  return `<select name="${name}" ${required ? "required" : ""} ${extra}>${required ? `<option value="" disabled ${current ? "" : "selected"}>Choose a customer</option>` : `<option value="">No customer</option>`}${opts}</select>`;
}
export function jobSelect(name, current, onlyOpen = false) {
  const opts = S.jobs.filter(j => !onlyOpen || j.status === "open" || j.id === current).map(j => `<option value="${j.id}" ${j.id === current ? "selected" : ""}>${esc(j.title)}</option>`).join("");
  return `<select name="${name}"><option value="">No job</option>${opts}</select>`;
}
export const needCustomer = what => `<div class="empty"><p>Add a customer before you add ${what}.</p><button class="btn hi" data-go="customers">Add a customer</button></div>`;
export const statusChip = (text, tone = "") => `<span class="chip ${tone}">${esc(text)}</span>`;
export const moneyOrNull = v => { const s = String(v ?? "").trim(); return s ? parseMoney(s) : 0; };

// Shrink a photo to fit comfortably in one saved record. Returns a data URL, or null when it cannot be made small enough.
export async function shrinkImage(file, attempts = [[1100, .6], [900, .5], [700, .45], [500, .4]], maxLen = 200000) {
  const url = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    for (const [max, q] of attempts) {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q); if (out.length < maxLen) return out;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

export { esc, usd, todayStr };

