// Starts the app: loads every screen, then waits for sign-in.
import { S, ui, render, resetState, go } from "./core.js";
import "./kit.js"; import "./ai.js"; import "./docs.js"; import "./jobs.js"; import "./ops.js"; import "./money.js"; import "./queue.js"; import "./home.js";
import { runRecurring } from "./docs.js";
import { fbReady, auth, onAuthStateChanged, loadAll, startListeners, stopListeners, clearFileCache, publishPublic } from "./store.js";

if (!fbReady) { ui.setupNeeded = true; ui.loading = false; render(); }
else {
  render();
  onAuthStateChanged(auth, async u => {
    ui.err = ""; ui.rw = {}; ui.ex = {}; ui.q = ""; ui.stack = [];
    if (!u) { stopListeners(); clearFileCache(); ui.user = null; resetState(); ui.loading = false; ui.view = "home"; ui.p = {}; render(); return; }
    ui.user = { uid: u.uid, email: u.email || "" }; ui.loading = true; render();
    try { await loadAll(); startListeners(); const n = runRecurring(); if (S.profile.type) publishPublic(); if (n) setTimeout(() => import("./core.js").then(m => m.toast(`${n} recurring ${n === 1 ? "invoice was" : "invoices were"} created. Review them in Invoices.`)), 600); }
    catch (e) { ui.err = "Couldn't load your data. Check your connection and reload."; }
    ui.loading = false; ui.view = S.profile.type ? "home" : "onboarding"; ui.p = {}; render();
  });
}
if ("serviceWorker" in navigator) { /* offline shell is handled by Firestore's local cache; no service worker needed */ }

