// Firebase: sign-in, saved data (works offline, syncs when back online), and the server-written logs.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, features } from "./firebase-config.js";
import { CORE_KEYS, applySent, applyPayments } from "./lib.js";
import { S, ui, toast, render, renderIfIdle } from "./core.js";

// Paid services stay off until they are set up (see README). Missing flags count as off.
export const F = { sendEmail: false, sendSms: false, payments: false, digest: false, priceApi: false, ...features };
export const fbReady = !/^PASTE/.test(firebaseConfig.apiKey || "PASTE");
export let auth = null, fdb = null, fbApp = null;
if (fbReady) {
  fbApp = initializeApp(firebaseConfig); auth = getAuth(fbApp);
  try { fdb = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { fdb = getFirestore(fbApp); }
}
export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail };

const plain = o => JSON.parse(JSON.stringify(o));
const base = () => ["users", ui.user.uid];
const ref = (...p) => doc(fdb, ...base(), ...p);
const col = (...p) => collection(fdb, ...base(), ...p);

/* ---------- loading ---------- */
export async function loadAll() {
  const [core, rcs] = await Promise.all([getDoc(ref("data", "core")), getDocs(col("receipts"))]);
  if (core.exists()) { const v = core.data(); CORE_KEYS.forEach(k => { if (v[k] !== undefined) S[k] = v[k]; }); }
  if (!S.snoozed || typeof S.snoozed !== "object") S.snoozed = {};
  if (!S.reviewAsked || typeof S.reviewAsked !== "object") S.reviewAsked = {};
  S.receipts = []; rcs.forEach(d => S.receipts.push(d.data()));
}

/* ---------- saving ---------- */
let timer = null;
function writeCore() {
  timer = null; if (!ui.user) return;
  const body = {}; CORE_KEYS.forEach(k => body[k] = S[k]);
  setDoc(ref("data", "core"), plain(body)).catch(saveFailed);
}
export function persistCore() { clearTimeout(timer); timer = setTimeout(writeCore, 350); }
export const flush = () => { if (timer) { clearTimeout(timer); writeCore(); } };
addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
export function saveFailed(e) {
  const c = e && e.code;
  toast(c === "resource-exhausted" ? "Storage limit reached. Delete something and try again." : c === "permission-denied" ? "Not allowed to save. Sign out and back in." : "Couldn't save that. It will retry when you're back online.");
}
export function persistReceipt(r) { if (ui.user) setDoc(ref("receipts", r.id), plain(r)).catch(saveFailed); }
export function deleteReceiptDoc(id) { if (ui.user) { deleteDoc(ref("receipts", id)).catch(saveFailed); deleteDoc(ref("files", id)).catch(() => {}); } }

/* ---------- photos and certificates: one record each, loaded when needed ---------- */
const fileCache = new Map();
export async function putFile(f) { fileCache.set(f.id, f); await setDoc(ref("files", f.id), plain(f)); }
export function removeFile(id) { fileCache.delete(id); if (ui.user) deleteDoc(ref("files", id)).catch(saveFailed); }
export async function getFile(id) {
  if (fileCache.has(id)) return fileCache.get(id);
  try { const d = await getDoc(ref("files", id)); if (d.exists()) { fileCache.set(id, d.data()); return d.data(); } } catch (e) { /* offline or missing */ }
  return null;
}
export async function listFiles(jobId) {
  const snap = await getDocs(query(col("files"), where("jobId", "==", jobId)));
  const out = []; snap.forEach(d => { fileCache.set(d.id, d.data()); out.push(d.data()); });
  return out.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}
export const clearFileCache = () => fileCache.clear();

/* ---------- public profile and lead form ---------- */
export function publishPublic() {
  if (!ui.user) return;
  setDoc(ref("public", "profile"), plain({ name: S.profile.name || "", phone: S.profile.phone || "", leadForm: !!S.profile.leadForm })).catch(saveFailed);
}

/* ---------- live logs written by the server ---------- */
let unsubs = [];
export function stopListeners() { unsubs.forEach(u => u()); unsubs = []; S.outbox = []; S.payments = []; S.leads = []; }
export function startListeners() {
  stopListeners();
  const listen = (name, apply) => unsubs.push(onSnapshot(col(name), snap => {
    const items = snap.docs.map(d => d.data()); apply(items); renderIfIdle();
  }, () => {}));
  if (F.sendEmail || F.sendSms) listen("outbox", items => {
    S.outbox = items.sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt))).slice(0, 50);
    if (applySent(S)) persistCore();
  });
  if (F.payments) listen("payments", items => { S.payments = items; if (applyPayments(S)) persistCore(); });
  listen("leads", items => { S.leads = items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); });
}
export async function writeOutbox(docs) {
  await Promise.all(docs.map(d => setDoc(ref("outbox", d.id), plain(d))));
}
export async function updateLead(l) { await setDoc(ref("leads", l.id), plain(l)); }
export async function deleteLead(id) { await deleteDoc(ref("leads", id)); }

/* ---------- Cloud Functions the owner can call (paid plan; off until configured) ---------- */
export async function callFunction(name, data) {
  const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js");
  const res = await httpsCallable(getFunctions(fbApp), name)(data);
  return res.data;
}

