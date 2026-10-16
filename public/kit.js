// Reusable form parts: the line-item editor used by quotes, invoices, change orders and recurring invoices, and the signature pad.
import { esc, money2, parseMoney, parsePercent, cleanItems, docTotals, usd, norm } from "./lib.js";
import { S, acts, fail } from "./core.js";

/* ---------- line items ---------- */
export function itemRow(it = {}) {
  return `<div class="line" data-line>
    <label>Description<input name="desc" list="catalog-names" value="${esc(it.desc || "")}" maxlength="200" autocomplete="off"></label>
    <div class="line-nums">
      <label>Qty<input name="qty" inputmode="decimal" value="${it.qty != null ? esc(String(it.qty)) : ""}" placeholder="1"></label>
      <label>Price each<input name="price" inputmode="decimal" value="${it.unitCents != null ? money2(it.unitCents) : ""}" placeholder="0.00"></label>
      <label>Tax<select name="tax"><option value="1" ${it.tax === false ? "" : "selected"}>Taxable</option><option value="0" ${it.tax === false ? "selected" : ""}>No tax</option></select></label>
    </div>
    <input type="hidden" name="kind" value="${esc(it.kind || "other")}">
    ${it.fromCatalog === false ? `<p class="muted">The AI left the price blank. Add yours.</p>` : ""}
    <button type="button" class="back" data-act="rmline">Remove this line</button>
  </div>`;
}
export function itemsEditor(items, { taxRate = 0, discountCents = 0 } = {}) {
  const rows = (items && items.length ? items : [{}]).map(itemRow).join("");
  return `<datalist id="catalog-names">${S.catalog.map(c => `<option value="${esc(c.name)}">`).join("")}</datalist>
    <div class="stack" data-items>${rows}</div>
    <button type="button" class="btn light small" data-act="addline" style="align-self:flex-start">Add a line</button>
    <div class="grid2"><label>Tax rate % <input name="taxRate" inputmode="decimal" value="${taxRate ? esc(String(taxRate)) : ""}" placeholder="0"></label>
    <label>Discount $ <input name="discount" inputmode="decimal" value="${discountCents ? money2(discountCents) : ""}" placeholder="0.00"></label></div>
    <p class="totals" data-totals aria-live="polite"></p>`;
}
export function readItems(form) {
  const rows = [...form.querySelectorAll("[data-line]")].map(l => ({
    desc: l.querySelector('[name="desc"]').value, qty: l.querySelector('[name="qty"]').value, price: l.querySelector('[name="price"]').value,
    tax: l.querySelector('[name="tax"]').value !== "0", kind: l.querySelector('[name="kind"]').value
  }));
  return cleanItems(rows);
}
// Items plus tax rate and discount, validated. Returns {error} or {items, taxRate, discountCents}.
export function readDoc(form) {
  const it = readItems(form); if (it.error) return it;
  const taxRate = parsePercent(form.querySelector('[name="taxRate"]').value);
  if (taxRate === null) return { error: "Enter the tax rate as a number from 0 to 100." };
  const dRaw = form.querySelector('[name="discount"]').value.trim(), discountCents = dRaw ? parseMoney(dRaw) : 0;
  if (discountCents === null) return { error: "Enter the discount as a plain number, for example 50.00." };
  return { items: it.items, taxRate, discountCents };
}
export function refreshTotals(form) {
  const out = form.querySelector("[data-totals]"); if (!out) return;
  const rows = [...form.querySelectorAll("[data-line]")].map(l => ({
    qty: parseFloat(l.querySelector('[name="qty"]').value || "1") || 0, unitCents: parseMoney(l.querySelector('[name="price"]').value || "0") || 0, tax: l.querySelector('[name="tax"]').value !== "0"
  }));
  const taxRate = parsePercent(form.querySelector('[name="taxRate"]').value) || 0, disc = parseMoney(form.querySelector('[name="discount"]').value || "0") || 0;
  const t = docTotals(rows, taxRate, disc);
  out.innerHTML = `Subtotal ${usd(t.subtotal)}${t.discount ? ` · Discount -${usd(t.discount)}` : ""}${t.tax ? ` · Tax ${usd(t.tax)}` : ""} · <strong>Total ${usd(t.total)}</strong>`;
}
document.addEventListener("input", e => { const f = e.target.closest("form"); if (f && f.querySelector("[data-items]")) refreshTotals(f); });
document.addEventListener("change", e => {
  const t = e.target;
  if (t.name === "desc") {
    const line = t.closest("[data-line]"), hit = S.catalog.find(c => norm(c.name) === norm(t.value));
    if (hit && line && !line.querySelector('[name="price"]').value) {
      line.querySelector('[name="price"]').value = money2(hit.unitCents); line.querySelector('[name="kind"]').value = hit.kind || "other";
      if (!line.querySelector('[name="qty"]').value) line.querySelector('[name="qty"]').value = "1";
    }
  }
  const f = t.closest && t.closest("form"); if (f && f.querySelector("[data-items]")) refreshTotals(f);
});
acts.addline = el => { const box = el.closest("form").querySelector("[data-items]"); box.insertAdjacentHTML("beforeend", itemRow({})); box.lastElementChild.querySelector("input").focus(); };
acts.rmline = el => {
  const box = el.closest("[data-items]"), line = el.closest("[data-line]");
  if (box.querySelectorAll("[data-line]").length > 1) line.remove(); else line.querySelectorAll("input:not([type=hidden])").forEach(i => i.value = "");
  refreshTotals(el.closest("form") || box.closest("form"));
};
export const afterEditor = () => document.querySelectorAll("form").forEach(f => { if (f.querySelector("[data-items]")) refreshTotals(f); });

/* ---------- signature pad ---------- */
export const signaturePad = () => `<div class="sigpad"><canvas id="sig" width="600" height="220" aria-label="Signature area"></canvas></div>
  <div class="row"><button type="button" class="btn light small" data-act="sigclear">Clear</button></div>`;
export function initSignature() {
  const c = document.getElementById("sig"); if (!c) return;
  const ctx = c.getContext("2d"); let drawing = false, drawn = false, last = null;
  ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener("pointerdown", e => { drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
  c.addEventListener("pointermove", e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; drawn = true; e.preventDefault(); });
  const end = () => { drawing = false; };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  c._clear = () => { ctx.clearRect(0, 0, c.width, c.height); drawn = false; };
  c._drawn = () => drawn;
}
acts.sigclear = () => { const c = document.getElementById("sig"); if (c && c._clear) c._clear(); };
// Returns a small PNG data URL, or null if nothing was drawn.
export function signatureImage() {
  const c = document.getElementById("sig"); if (!c || !c._drawn || !c._drawn()) return null;
  const small = document.createElement("canvas"); small.width = 400; small.height = Math.round(400 * c.height / c.width);
  const x = small.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, small.width, small.height); x.drawImage(c, 0, 0, small.width, small.height);
  return small.toDataURL("image/png");
}

/* ---------- small shared bits ---------- */
export const bar = (pct, over = false) => `<div class="bar ${over ? "over" : ""}" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
export const noteFail = msg => fail(msg);

