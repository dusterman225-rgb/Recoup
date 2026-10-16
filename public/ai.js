// AI helper: the owner's own Gemini key. It stays in this browser and goes only to Google.
// The AI can read, reword and explain. It never sets a price and never changes an amount, number or date.
import { S, ui, forms, acts, render, toast, fail } from "./core.js";
import { persistReceipt } from "./store.js";
import { computeFindings, factsKept, isDay, parseMoney, itemsFromAi } from "./lib.js";

const AIK = "recoup.ai", DEFAULT_MODEL = "gemini-flash-latest";
export const aiCfg = () => { try { const v = JSON.parse(localStorage.getItem(AIK) || "{}"); return { key: v.key || "", model: v.model || DEFAULT_MODEL }; } catch { return { key: "", model: DEFAULT_MODEL }; } };
export const hasKey = () => !!aiCfg().key;
const saveAi = c => { try { localStorage.setItem(AIK, JSON.stringify(c)); } catch { toast("Couldn't save the key in this browser."); } };
const soft = m => Object.assign(new Error(m), { soft: true });

export async function gemini(parts, json) {
  const { key, model } = aiCfg(); if (!key) throw soft("Add your Gemini key in More first.");
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: json ? { responseMimeType: "application/json", temperature: 0.2 } : { temperature: 0.4 } })
    });
  } catch (e) { throw soft("Couldn't reach Google. Check your connection."); }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    if (res.status === 400 || res.status === 403) throw soft("Google rejected the key or model. Check both in More.");
    if (res.status === 429) throw soft("You've hit your free Gemini limit for now. Try again later.");
    throw soft(d.error?.message || `The AI request failed (${res.status}).`);
  }
  const d = await res.json();
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
}
export function parseJson(t) { try { return JSON.parse(String(t).replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim()); } catch { return null; } }
export const aiError = e => toast(e && e.message ? e.message : "The AI request failed.");

forms.aiKey = fd => {
  const key = String(fd.get("key") || "").trim(), model = String(fd.get("model") || "").trim() || DEFAULT_MODEL, cur = aiCfg();
  if (key && (key.length < 20 || /\s/.test(key))) return fail("That doesn't look like a Gemini key. Copy it again from Google AI Studio.");
  if (!key && !cur.key) return fail("Paste your Gemini key first.");
  saveAi({ key: key || cur.key, model }); render(); toast("AI settings saved");
};
acts.rmkey = () => { saveAi({ key: "", model: aiCfg().model }); render(); toast("Key removed"); };
acts.testkey = async () => { if (ui.busy) return; ui.busy = true; toast("Testing…"); try { await gemini([{ text: "Reply with the single word OK." }], false); toast("Key works"); } catch (e) { aiError(e); } finally { ui.busy = false; } };

// Read a receipt photo into supplier, date, total and line items. Everything it returns is a suggestion the owner checks.
acts.readrc = async el => {
  const r = S.receipts.find(x => x.id === el.dataset.id); if (!r || r.confirmed || ui.busy) return;
  ui.busy = true; toast("Reading the receipt…");
  try {
    const t = await gemini([{ text: 'Read this receipt photo. Return JSON exactly like {"vendor": string or null, "date": "YYYY-MM-DD" or null, "total": number or null, "items": [{"name": string, "qty": number, "unit_price": number}]}. "vendor" is the business name. "total" is the final amount paid, in dollars. Each item is one purchased line with the price for ONE unit in dollars. Use null for anything you cannot read clearly and leave items empty if unreadable. Do not guess.' },
      { inline_data: { mime_type: "image/jpeg", data: r.img.split(",")[1] } }], true);
    const j = parseJson(t); if (!j) throw new Error("The AI's answer wasn't readable. Try again or type it in.");
    const vendor = typeof j.vendor === "string" ? j.vendor.trim().slice(0, 120) : "", date = typeof j.date === "string" && isDay(j.date) ? j.date : null;
    const total = typeof j.total === "number" && isFinite(j.total) && j.total >= 0 ? parseMoney(j.total.toFixed(2)) : null;
    const items = (Array.isArray(j.items) ? j.items : []).slice(0, 40).map(i => {
      const name = String(i && i.name || "").trim().slice(0, 120), up = typeof i.unit_price === "number" && isFinite(i.unit_price) && i.unit_price > 0 ? parseMoney(i.unit_price.toFixed(2)) : null, qty = Number(i.qty) > 0 && Number(i.qty) < 1e5 ? Number(i.qty) : 1;
      return name && up ? { name, qty, unitCents: up } : null;
    }).filter(Boolean);
    if (!vendor && !date && total === null && !items.length) throw new Error("Couldn't read anything from that photo. Type it in instead.");
    if (vendor) r.vendor = vendor; if (date) r.date = date; if (total !== null) r.totalCents = total; if (items.length) r.items = items;
    r.aiFilled = true; persistReceipt(r); render(); toast("Filled in. Check it against the photo.");
  } catch (e) { aiError(e); } finally { ui.busy = false; }
};

// Reword a drafted message. If the AI changes any amount, number or date, the original is kept.
acts.rewrite = async el => {
  const f = computeFindings(S).find(x => x.id === el.dataset.id); if (!f || !f.followUp || ui.busy) return;
  ui.busy = true; toast("Rewording…");
  try {
    const o = f.followUp;
    const t = await gemini([{ text: `Rewrite this business message so it sounds natural, warm and professional, in plain language, with the same level of firmness. Keep every dollar amount, invoice number, date and number of days exactly as written. Do not add facts, promises, fees or threats. Keep the sign-off and any web links. Return JSON like {"subject": string, "body": string}.\n\nSubject: ${o.subject}\n\nBody:\n${o.body}` }], true);
    const j = parseJson(t); if (!j || typeof j.subject !== "string" || typeof j.body !== "string") throw new Error("The AI's answer wasn't readable. Try again.");
    if (!factsKept(o.body, j.body) || /https?:\/\/\S+/.test(o.body) && !(o.body.match(/https?:\/\/\S+/g) || []).every(u => j.body.includes(u))) { toast("The AI changed a fact, so your original message is kept."); return; }
    ui.rw[f.id] = { to: o.to, phone: o.phone, subject: j.subject.slice(0, 200), body: j.body.slice(0, 3000) }; render(); toast("Reworded. Read it before you send.");
  } catch (e) { aiError(e); } finally { ui.busy = false; }
};

acts.explain = async el => {
  const f = computeFindings(S).find(x => x.id === el.dataset.id); if (!f || ui.busy) return;
  ui.busy = true; toast("Thinking…");
  try {
    const t = await gemini([{ text: `Explain in 2 or 3 short, plain sentences why this item was flagged for a small business owner and what they could do. Use only the facts below. Do not invent causes. If you mention a reason, say it is only a possibility.\n\nFlag: ${f.title}\n${f.evidence.map(([l, x]) => `- (${l}) ${x}`).join("\n")}\nSuggestion: ${f.suggestion}` }], false);
    ui.ex[f.id] = t.trim().slice(0, 800); render();
  } catch (e) { aiError(e); } finally { ui.busy = false; }
};

// Draft quote lines from a description. Quantities and wording come from the AI. Prices come only from the owner's price book.
acts.aidraft = async el => {
  if (ui.busy) return; const form = el.closest("form"), desc = form.querySelector('[name="aidesc"]').value.trim();
  if (desc.length < 8) return toast("Describe the job in a sentence or two first.");
  ui.busy = true; toast("Drafting…");
  try {
    const known = S.catalog.slice(0, 80).map(c => c.name).join("; ");
    const t = await gemini([{ text: `A small-business owner describes a job. List the lines a quote would need. Return JSON like {"items":[{"desc": string, "qty": number}]}. Do NOT include prices. When one of the owner's known items fits, use its exact name.\nKnown items: ${known || "(none)"}\nJob: ${desc}` }], true);
    const j = parseJson(t); const items = itemsFromAi(j && j.items, S.catalog);
    if (!items.length) throw new Error("The AI didn't return any lines. Try describing the job differently.");
    const { itemRow } = await import("./kit.js");
    const box = form.querySelector("[data-items]"); const empty = [...box.querySelectorAll("[data-line]")].every(l => !l.querySelector('[name="desc"]').value.trim());
    if (empty) box.innerHTML = ""; box.insertAdjacentHTML("beforeend", items.map(itemRow).join(""));
    box.closest("form").dispatchEvent(new Event("input", { bubbles: true })); toast("Lines added. Add prices where they're blank.");
  } catch (e) { aiError(e); } finally { ui.busy = false; }
};

