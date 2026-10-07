var STORAGE_KEY = 'qc-theme';
var root = document.documentElement;
var SUN_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
var MOON_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#eafff5" stroke-width="1.7" stroke-linejoin="round"/></svg>';
function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  var icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.innerHTML = dark ? SUN_ICON : MOON_ICON;
}
window.toggleTheme = function () { applyTheme(root.getAttribute('data-theme') !== 'dark'); };
if (root.getAttribute('data-theme') === 'dark') applyTheme(true);

const API_ROOT = "https://app.querocura.com";
const API_BASE = API_ROOT + "/api";
const CV = API_BASE + "/curavault";
const documentReview = new CuraVaultDocumentReview(CV, (message, kind) => toast(message, kind));
const medicationOverview = new CuraVaultMedicationOverview(CV, document.getElementById("cv-current-medications"), (message, kind) => toast(message, kind));
document.addEventListener("cv-medications-changed", () => medicationOverview.refresh());

function fmt(v) { return (v === null || v === undefined || v === "") ? "—" : v; }
function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts.replace(" ", "T")).toLocaleString(); }
  catch (e) { return ts; }
}
function fmtDateShort(ts) {
  if (!ts) return "—";
  try { return new Date(ts.replace(" ", "T")).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch (e) { return ts; }
}
function fmtMonthYear(ts) {
  if (!ts) return "—";
  try { return new Date(ts.replace(" ", "T")).toLocaleDateString(undefined, { month: "short", year: "numeric" }); }
  catch (e) { return "—"; }
}
function timeAgo(ts) {
  if (!ts) return "—";
  try {
    const then = new Date(ts.replace(" ", "T")).getTime();
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return fmtDateShort(ts);
  } catch (e) { return "—"; }
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function bytesToSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
function formatVaultId(raw) {
  const s = String(raw || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!s) return "—";
  return "CV-" + (s.slice(0, 12).match(/.{1,4}/g) || []).join("-");
}
// ---- CURA ID (for EGD) ----
// Deterministically derived from the patient's stable curasense_id, so the
// same person always gets the same CURA ID without needing a separate
// backend field — a 53-bit string hash (cyrb53) seeds a small, fast PRNG
// (mulberry32) that's walked 16 times over an unambiguous alphanumeric set.
function cyrb53(str, seed) {
  seed = seed || 0;
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function formatCuraId(raw) {
  const seedStr = String(raw || "").trim();
  if (!seedStr) return "—";
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  const rand = mulberry32((cyrb53(seedStr + "::CURA-EGD-v1") >>> 0));
  let out = "";
  for (let i = 0; i < 16; i++) out += CHARS[Math.floor(rand() * CHARS.length)];
  return "CURA-" + out;
}
function triageClass(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("emerg")) return "emergency";
  if (s.includes("urgent")) return "urgent";
  if (s.includes("moderate") || s.includes("monitor")) return "monitor";
  return "routine";
}

// ---- toasts ----
function toast(msg, type) {
  const stack = document.getElementById("qc-toast-stack");
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

async function cvGet(path) {
  // Never throws: a network failure or a non-JSON error page from the
  // server degrades to { ok: false }, which every caller below already
  // knows how to render as an empty/error state, instead of rejecting
  // and taking down whatever Promise.all/allSettled batch it's part of.
  try {
    const res = await fetch(CV + path, { credentials: "include" });
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Couldn't reach CuraVault." };
  }
}
async function cvPost(path, body) {
  const res = await fetch(CV + path, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fireConfetti() {
  const colors = ["#0b6f66", "#12a37e", "#22c55e", "#4ade80"];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = (45 + Math.random() * 10) + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.2) + "s";
    p.style.animationDuration = (1.1 + Math.random() * 0.6) + "s";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}

// ---- tabs ----
document.querySelectorAll(".vtab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".vtab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("show"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.getAttribute("data-tab")).classList.add("show");
  });
});

// ---- count-up ----
function countUp(el, target) {
  target = Number(target) || 0;
  if (target === 0) { el.textContent = "0"; return; }
  const dur = 650, start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- ID card ----
function renderIdCard(patient, userName) {
  const initials = (userName || "").trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
  document.getElementById("idc-avatar").textContent = initials;
  document.getElementById("idc-name").textContent = userName || "—";
  document.getElementById("idc-id").textContent = formatVaultId(patient && patient.curasense_id);
  document.getElementById("idc-since").textContent = fmtMonthYear(patient && patient.created_at);
  document.getElementById("egd-id").textContent = formatCuraId(patient && patient.curasense_id);
}
function copyId(textEl, btn, okMsg) {
  const id = (textEl.textContent || "").trim();
  if (!id || id === "—") { toast("Your ID is still loading — try again in a moment.", "err"); return; }
  QC.copy(id).then(function () {
    toast(okMsg, "ok");
    btn.classList.add("done");
    const prev = btn.innerHTML;
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    setTimeout(function () { btn.classList.remove("done"); btn.innerHTML = prev; }, 1400);
  }, function () {
    // last resort: select the text so Ctrl/Cmd+C works
    try { const r = document.createRange(); r.selectNodeContents(textEl); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) {}
    toast("Couldn't copy automatically — the ID is selected, press Ctrl/Cmd+C.", "err");
  });
}
document.getElementById("idc-copy-btn").addEventListener("click", function () { copyId(document.getElementById("idc-id"), this, "CuraVault ID copied to clipboard."); });
document.getElementById("idc-id").addEventListener("click", function () { copyId(this, document.getElementById("idc-copy-btn"), "CuraVault ID copied to clipboard."); });
document.getElementById("egd-copy-btn").addEventListener("click", function () { copyId(document.getElementById("egd-id"), this, "CURA ID copied to clipboard."); });
document.getElementById("egd-id").addEventListener("click", function () { copyId(this, document.getElementById("egd-copy-btn"), "CURA ID copied to clipboard."); });

// ---- stat strip ----
function renderStats({ recordsCount, symptomCount, pendingConsent, lastAccess }) {
  const box = document.getElementById("qc-stats");
  box.innerHTML =
    '<div class="stat-card"><div class="st-ic">📄</div><div class="st-num" id="st-records">0</div><div class="st-label">Records</div></div>' +
    '<div class="stat-card good"><div class="st-ic">🩺</div><div class="st-num" id="st-symptoms">0</div><div class="st-label">Symptom checks</div></div>' +
    '<div class="stat-card' + (pendingConsent > 0 ? ' warn' : '') + '"><div class="st-ic">🔔</div><div class="st-num" id="st-pending">0</div><div class="st-label">Pending requests</div></div>' +
    '<div class="stat-card"><div class="st-ic">🕒</div><div class="st-num" style="font-size:14.5px;">' + esc(lastAccess) + '</div><div class="st-label">Last accessed</div></div>';
  const badge = document.getElementById("qc-access-badge");
  if (pendingConsent > 0) { badge.style.display = "inline-block"; badge.textContent = pendingConsent; }
  else { badge.style.display = "none"; }
  countUp(document.getElementById("st-records"), recordsCount);
  countUp(document.getElementById("st-symptoms"), symptomCount);
  countUp(document.getElementById("st-pending"), pendingConsent);
}

// ---- recent activity (merged from records / symptom checks / access log) ----
function renderActivity(records, symptoms, logs) {
  const items = [];
  (records || []).slice(0, 5).forEach(r => items.push({
    ts: r.created_at, ic: "📄",
    html: 'Uploaded <b>' + esc(r.title || r.original_filename || "a record") + '</b>',
  }));
  (symptoms || []).slice(0, 5).forEach(s => items.push({
    ts: s.ts, ic: "🩺",
    html: 'Checked symptoms for <b>' + esc(s.condition_name || "a condition") + '</b>',
  }));
  (logs || []).slice(0, 5).forEach(l => items.push({
    ts: l.created_at, ic: "🤝",
    html: '<b>' + esc(l.provider_name || l.accessed_by || "A provider") + '</b> accessed your Vault',
  }));
  items.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  const box = document.getElementById("qc-activity");
  if (!items.length) {
    box.innerHTML = '<div class="empty-note">Nothing yet — upload a record or run a symptom check to get started.</div>';
    return;
  }
  box.innerHTML = items.slice(0, 6).map(it => (
    '<div class="activity-row"><div class="activity-ic">' + it.ic + '</div><div class="activity-text">' + it.html + '</div><div class="activity-time">' + timeAgo(it.ts) + '</div></div>'
  )).join("");
}

// ---- records ----
let lastRecords = [];
async function loadRecords() {
  const data = await cvGet("/records");
  const wrap = document.getElementById("cv-records-wrap");
  if (!data.ok) {
    wrap.innerHTML = '<div class="empty-note">Couldn\'t load your records right now. <a href="#" data-retry="records">Try again</a></div>';
    lastRecords = [];
    return { count: 0, ok: false };
  }
  if (!data.records || !data.records.length) {
    wrap.innerHTML = '<div class="empty-note">No records yet — upload one to get started.</div>';
    lastRecords = [];
    return { count: 0 };
  }
  lastRecords = data.records;
  const rows = data.records.map(r => (
    "<tr>" +
      "<td><div class=\"rec-title\">" + esc(r.title || r.original_filename || "Untitled") + "</div><span class=\"rec-cat\">" + esc((r.category || "other").replace(/_/g, " ")) + "</span></td>" +
      "<td>" + fmtDate(r.record_date || r.created_at) + "</td>" +
      "<td>" + esc(r.original_filename || "—") + "</td>" +
      "<td>" + bytesToSize(r.size_bytes) + "</td>" +
      '<td><button type="button" data-cv-review="' + esc(r.id) + '">Review record</button> <button type="button" data-cv-delete="' + esc(r.id) + '">Delete</button></td>' +
    "</tr>"
  )).join("");
  wrap.innerHTML = "<table><thead><tr><th>Record</th><th>Date</th><th>File</th><th>Size</th><th>Review</th></tr></thead><tbody>" + rows + "</tbody></table>";
  return { count: data.records.length };
}

// drag & drop wiring
const dz = document.getElementById("cv-dropzone");
const dzInput = document.getElementById("cv-rec-file");
const dzFiles = document.getElementById("cv-dz-files");
function refreshDzLabel() {
  const n = dzInput.files.length;
  dzFiles.textContent = n ? (n + " file" + (n > 1 ? "s" : "") + " selected") : "";
  smartIntake();
}

/* ---- Smart intake: before anything is uploaded, work out what each file probably is, fill in the
   category/title (never overwriting what the person typed), and warn about photos that will read
   badly (blurry, dark, washed out, tiny) while a retake is still one tap away. ---- */
const INTAKE_RULES = [
  [/\bmri\b|magnetic|\bmr /i, "scan", "MRI scan report"], [/\bct\b|cect|hrct|tomograph|\bcta\b/i, "scan", "CT scan report"],
  [/x[ _-]?ray|radiograph|\bcxr\b/i, "scan", "X-ray report"], [/usg|ultraso|sonograph|doppler|echo|mammo|dexa|\bpet\b|ecg|ekg/i, "scan", "scan / imaging report"],
  [/\brx\b|prescri|presc\b|medicine|medication/i, "prescription", "prescription"], [/discharge/i, "discharge_summary", "discharge summary"],
  [/vaccin|immuni[sz]/i, "vaccination", "vaccination record"],
  [/cbc|blood|lipid|thyroid|hba1c|\blft\b|\bkft\b|urine|pathol|diagnostic|lab|haemo|hemo|sugar|glucose|report/i, "lab_report", "lab report"],
];
const CAT_LABEL = { lab_report: "Lab report", prescription: "Prescription", scan: "Scan / imaging", discharge_summary: "Discharge summary", vaccination: "Vaccination", other: "Other" };
const CAT_ICON = { lab_report: "🧪", prescription: "💊", scan: "🩻", discharge_summary: "🏥", vaccination: "💉", other: "📄" };
let userSetCategory = false, userSetTitle = false;
document.getElementById("cv-rec-category").addEventListener("change", () => { userSetCategory = true; });
document.getElementById("cv-rec-title").addEventListener("input", () => { userSetTitle = true; });

function guessFile(f) {
  const base = f.name.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();   // "MRI_lumbar-spine" -> "MRI lumbar spine" (underscores defeat \b)
  let hit = INTAKE_RULES.find(r => r[0].test(base));
  const generic = /^(img|dsc|image|scan|photo|screenshot|whatsapp|pxl|doc|document|download|file|\d)/i.test(base);
  const pretty = base.replace(/\b\w/g, c => c.toUpperCase());
  const cat = hit ? hit[1] : "";
  return { cat, kind: hit ? hit[2] : "", title: generic || pretty.length < 3 ? "" : pretty.slice(0, 70) };
}

function imageQuality(file) {
  return new Promise(resolve => {
    if (!/^image\//.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(8, Math.round(img.naturalWidth * scale)), h = Math.max(8, Math.round(img.naturalHeight * scale));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
        let sum = 0;
        for (let i = 0, j = 0; i < px.length; i += 4, j++) { g[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; sum += g[j]; }
        // variance of the Laplacian: low = few sharp edges = blurry
        let m = 0, s2 = 0, n = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const k = y * w + x, l = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - w] - g[k + w];
          n++; const d = l - m; m += d / n; s2 += d * (l - m);
        }
        resolve({ w: img.naturalWidth, h: img.naturalHeight, bright: sum / (w * h), sharp: n > 1 ? s2 / (n - 1) : 0 });
      } catch (e) { resolve(null); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

let intakeSeq = 0;
async function smartIntake() {
  const box = document.getElementById("cv-intake"), files = Array.from(dzInput.files), seq = ++intakeSeq;
  if (!files.length) { box.innerHTML = ""; return; }
  const guesses = files.map(guessFile), first = guesses.find(g => g.cat);
  if (first && !userSetCategory) document.getElementById("cv-rec-category").value = first.cat;
  if (!userSetTitle && files.length === 1 && guesses[0].title) document.getElementById("cv-rec-title").value = guesses[0].title;
  const qualities = await Promise.all(files.map(imageQuality));
  if (seq !== intakeSeq) return;
  const cat = document.getElementById("cv-rec-category").value;
  let html = first ? '<div class="in-detect">Looks like <span class="in-chip">' + CAT_ICON[first.cat] + " " + QC.esc(first.kind) + '</span>. I picked “' + QC.esc(CAT_LABEL[first.cat]) + '” for you; change it if that\'s wrong.</div>' : '';
  html += files.map((f, i) => {
    const q = qualities[i], warns = [];
    if (q) {
      if (q.sharp < 40) warns.push("looks blurry: hold the phone steady and tap to focus before shooting");
      if (q.bright < 70) warns.push("is quite dark: use daylight or turn on a light, avoid shadows");
      else if (q.bright > 225) warns.push("looks washed out: avoid glare from the flash or window");
      if (Math.min(q.w, q.h) < 900) warns.push("is low resolution: move closer so the page fills the frame");
    }
    const kb = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(f.size / 1024)) + " KB";
    return '<div class="in-file' + (warns.length ? " warn" : "") + '"><span class="ic">' + (CAT_ICON[guesses[i].cat || cat] || "📄") + '</span><div class="nm">' + QC.esc(f.name) +
      '<small>' + kb + (q ? " · " + q.w + "×" + q.h : "") + '</small>' + (warns.length ? '<div class="in-warn">⚠ This photo ' + warns.map(QC.esc).join("; and ") + '. A clearer picture reads far more accurately.</div>' : '') + '</div></div>';
  }).join("");
  if (qualities.some(Boolean) || cat === "prescription") {
    html += '<div class="in-tips">📸 For handwriting and scans: lay the page flat, keep the whole page in the frame, and shoot straight-on in daylight. After upload you\'ll check what was read before anything is saved.</div>';
  }
  box.innerHTML = html;
}
dz.addEventListener("click", () => dzInput.click());
dzInput.addEventListener("change", refreshDzLabel);
document.getElementById("cv-camera-button").addEventListener("click", () => document.getElementById("cv-camera-file").click());
document.getElementById("cv-camera-file").addEventListener("change", event => {
  if (event.target.files.length) { dzInput.files = event.target.files; refreshDzLabel(); }
});
["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", e => {
  if (e.dataTransfer.files.length) { dzInput.files = e.dataTransfer.files; refreshDzLabel(); }
});

document.getElementById("cv-upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("cv-upload-btn");

  if (!dzInput.files.length) { toast("Choose at least one file first.", "err"); return; }

  const selected = Array.from(dzInput.files);
  if (selected.length > 10 || selected.some(f => f.size > 15 * 1024 * 1024) || selected.reduce((n, f) => n + f.size, 0) > 30 * 1024 * 1024) {
    toast("Choose up to 10 files, each at most 15 MiB, with a 30 MiB total.", "err"); return;
  }
  btn.disabled = true;
  btn.textContent = "Uploading and reading records…";

  const form = new FormData();
  for (const f of dzInput.files) form.append("files", f);
  form.append("title", document.getElementById("cv-rec-title").value || "");
  form.append("category", document.getElementById("cv-rec-category").value || "other");
  form.append("notes", document.getElementById("cv-rec-notes").value || "");

  try {
    const res = await fetch(CV + "/records/upload", { method: "POST", credentials: "include", body: form });
    const data = await res.json();
    if (!res.ok || !data.saved_count) throw new Error(data.error || data.errors?.[0]?.error || "Couldn't upload that.");
    toast(data.errors?.length ? "Some files were saved; other files failed. " + data.errors.map(x => x.error).join(" ") : "Records stored. Review extracted values and medicines next.", data.errors?.length ? "err" : "ok");
    document.getElementById("cv-upload-form").reset();
    dzFiles.textContent = "";
    userSetCategory = userSetTitle = false;
    document.getElementById("cv-intake").innerHTML = "";
    QC.clearCache();                                       // new records change Insights, so drop the cached copy
    fireConfetti();
    const recResult = await loadRecords();
    renderActivity(lastRecords, lastSymptoms, lastLogs);
    countUp(document.getElementById("st-records"), recResult.count);
    await documentReview.reviewRecords(data.records || []);
  } catch (err) {
    toast(err.message || "Something went wrong.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload";
  }
});

// ---- vault vitals ----
async function loadVaultVitals() {
  const data = await cvGet("/vitals");
  const wrap = document.getElementById("cv-vitals-wrap");
  if (!data.ok || !data.vitals || !data.vitals.length) {
    wrap.innerHTML = '<div class="empty-note">No vitals logged in your Vault yet.</div>';
    return;
  }
  const rows = data.vitals.slice(0, 8).map(v => (
    "<tr>" +
      "<td>" + fmtDate(v.recorded_at) + "</td>" +
      "<td>" + fmt(v.heart_rate) + "</td>" +
      "<td>" + (v.systolic_bp != null && v.diastolic_bp != null ? v.systolic_bp + "/" + v.diastolic_bp : "—") + "</td>" +
      "<td>" + fmt(v.spo2) + "</td>" +
      "<td>" + fmt(v.temperature_c) + "</td>" +
      "<td>" + fmt(v.weight_kg) + "</td>" +
    "</tr>"
  )).join("");
  wrap.innerHTML = "<table><thead><tr><th>When</th><th>HR</th><th>BP</th><th>SpO₂</th><th>Temp</th><th>Weight</th></tr></thead><tbody>" + rows + "</tbody></table>";
}

document.getElementById("cv-vitals-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("cv-vitals-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const val = id => document.getElementById(id).value || null;
  const payload = {
    recorded_at: new Date().toISOString(),
    source: "manual",
    heart_rate: val("cv-v-hr"),
    systolic_bp: val("cv-v-sys"),
    diastolic_bp: val("cv-v-dia"),
    spo2: val("cv-v-spo2"),
    temperature_c: val("cv-v-temp"),
    blood_glucose_mgdl: val("cv-v-glucose"),
    weight_kg: val("cv-v-weight"),
    respiratory_rate: val("cv-v-resp"),
    notes: document.getElementById("cv-v-notes").value || "",
  };

  try {
    const { ok, data } = await cvPost("/vitals", payload);
    if (!ok || !data.ok) throw new Error(data.error || "Couldn't save that reading.");
    toast("Saved to your Vault.", "ok");
    document.getElementById("cv-vitals-form").reset();
    fireConfetti();
    await loadVaultVitals();
  } catch (err) {
    toast(err.message || "Something went wrong.", "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save to Vault";
  }
});

// ---- symptom-check history (pulled from Insights) ----
let lastSymptoms = [];
async function loadSymptomHistory() {
  const wrap = document.getElementById("cv-symptoms-wrap");
  try {
    const res = await fetch(API_BASE + "/insights/dashboard?days=365", { credentials: "include" });
    const data = await res.json();
    const history = (data && data.diagnosis_history) || [];
    lastSymptoms = history;
    if (!history.length) {
      wrap.innerHTML = '<div class="empty-note">No symptom checks yet — run one from the Symptoms tab and it\'ll show up here.</div>';
      return { count: 0 };
    }
    wrap.innerHTML = '<div class="symptom-list">' + history.map(s => {
      const pct = Math.round((Number(s.match_strength) || 0) * 100);
      const tClass = triageClass(s.triage);
      return '<div class="symptom-card">' +
        '<div class="sym-top">' +
          '<div><div class="sym-name">' + esc(s.condition_name || "Unknown") + '</div>' +
          '<div class="sym-meta"><span>' + fmtDate(s.ts) + '</span>' + (s.confidence_band ? '<span>· ' + esc(s.confidence_band) + ' confidence</span>' : '') + '</div></div>' +
          '<span class="pill ' + esc(tClass) + '">' + esc(s.triage || s.risk || "—") + '</span>' +
        '</div>' +
        (pct ? '<div class="sym-bar-wrap"><div class="sym-bar" style="width:' + pct + '%"></div></div>' : '') +
        ((s.signals && s.signals.length) ? '<details class="sym-signals"><summary>' + s.signals.length + ' signal' + (s.signals.length > 1 ? 's' : '') + '</summary>' + s.signals.map(sig => esc(typeof sig === "string" ? sig : (sig.label || sig.name || JSON.stringify(sig)))).join(", ") + '</details>' : '') +
      '</div>';
    }).join("") + '</div>';
    return { count: history.length };
  } catch (e) {
    wrap.innerHTML = '<div class="empty-note">Couldn\'t load your symptom history right now. <a href="#" data-retry="symptoms">Try again</a></div>';
    return { count: 0, ok: false };
  }
}

// ---- consent requests ----
async function loadConsentRequests() {
  const data = await cvGet("/consent/requests");
  const wrap = document.getElementById("cv-consent-wrap");
  if (!data.ok) {
    wrap.innerHTML = '<div class="empty-note">Couldn\'t load access requests right now. <a href="#" data-retry="consent">Try again</a></div>';
    return { pending: 0, ok: false };
  }
  if (!data.requests || !data.requests.length) {
    wrap.innerHTML = '<div class="empty-note">No access requests right now.</div>';
    return { pending: 0 };
  }
  const pending = data.requests.filter(r => r.status === "pending");
  const rows = data.requests.slice(0, 10).map(r => {
    const status = r.status || "pending";
    const cats = (r.requested_categories || []).join(", ") || "full record";
    const actions = status === "pending"
      ? '<div class="row-actions">' +
          '<button class="btn-ghost go" data-decide="approved" data-id="' + esc(r.id) + '">Approve</button>' +
          '<button class="btn-ghost danger" data-decide="denied" data-id="' + esc(r.id) + '">Deny</button>' +
        '</div>'
      : '<span class="pill ' + esc(status) + '">' + esc(status) + '</span>';
    return "<tr>" +
      "<td><div class=\"rec-title\">" + esc(r.provider_name || r.requested_by || "Provider") + "</div><div class=\"empty-note\">" + esc(cats) + "</div></td>" +
      "<td>" + fmtDate(r.created_at) + "</td>" +
      "<td>" + actions + "</td>" +
    "</tr>";
  }).join("");
  wrap.innerHTML = "<table><thead><tr><th>Requested by</th><th>When</th><th>Decision</th></tr></thead><tbody>" + rows + "</tbody></table>";

  wrap.querySelectorAll("[data-decide]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const decision = btn.getAttribute("data-decide");
      const { ok, data } = await cvPost("/consent/decide", {
        request_id: btn.getAttribute("data-id"),
        decision: decision,
      });
      if (ok && data.ok) {
        toast(decision === "approved" ? "Access approved." : "Access denied.", decision === "approved" ? "ok" : "err");
        const consentResult = await loadConsentRequests();
        countUp(document.getElementById("st-pending"), consentResult.pending);
        const badge = document.getElementById("qc-access-badge");
        if (consentResult.pending > 0) { badge.style.display = "inline-block"; badge.textContent = consentResult.pending; }
        else { badge.style.display = "none"; }
      } else {
        toast((data && data.error) || "Couldn't record that decision.", "err");
        btn.disabled = false;
      }
    });
  });

  return { pending: pending.length };
}

// ---- access log ----
let lastLogs = [];
async function loadAccessLogs() {
  const data = await cvGet("/access-logs");
  const wrap = document.getElementById("cv-logs-wrap");
  if (!data.ok) {
    wrap.innerHTML = '<div class="empty-note">Couldn\'t load your access log right now. <a href="#" data-retry="logs">Try again</a></div>';
    lastLogs = [];
    return { lastAccess: "—", ok: false };
  }
  if (!data.logs || !data.logs.length) {
    wrap.innerHTML = '<div class="empty-note">No access recorded yet.</div>';
    lastLogs = [];
    return { lastAccess: "Never" };
  }
  lastLogs = data.logs;
  const rows = data.logs.slice(0, 8).map(l => (
    "<tr>" +
      "<td>" + esc(l.provider_name || l.accessed_by || "Provider") + "</td>" +
      "<td>" + esc(l.reason || l.access_type || "—") + "</td>" +
      "<td>" + fmtDate(l.created_at) + "</td>" +
    "</tr>"
  )).join("");
  wrap.innerHTML = "<table><thead><tr><th>Who</th><th>Reason</th><th>When</th></tr></thead><tbody>" + rows + "</tbody></table>";
  return { lastAccess: fmtDate(data.logs[0].created_at) };
}

// ---- overview refresh ----
// Promise.allSettled (not Promise.all): every one of these already
// degrades to a safe { ok: false } / { count: 0 } shape on its own
// (cvGet never throws, loadSymptomHistory has its own try/catch), but
// allSettled is the belt-and-suspenders here -- if a rendering bug ever
// makes one of them throw, the other four still finish and the page
// still ends up with real content instead of being stuck on skeletons
// forever with a dead Promise.all underneath it.
async function refreshOverview() {
  const settled = await Promise.allSettled([
    cvGet("/status"),
    loadRecords(),
    loadSymptomHistory(),
    loadConsentRequests(),
    loadAccessLogs(),
    medicationOverview.refresh(),
  ]);
  const val = (i, fallback) => (settled[i].status === "fulfilled" ? settled[i].value : fallback);
  const statusData = val(0, { ok: false });
  const recResult = val(1, { count: 0 });
  const symResult = val(2, { count: 0 });
  const consentResult = val(3, { pending: 0 });
  const logResult = val(4, { lastAccess: "—" });

  const patient = (statusData.ok && statusData.patient) || {};
  renderStats({
    recordsCount: recResult.count || 0,
    symptomCount: symResult.count || 0,
    pendingConsent: consentResult.pending || 0,
    lastAccess: logResult.lastAccess || "Never",
  });
  renderActivity(lastRecords, lastSymptoms, lastLogs);

  const failures = settled.filter(s => s.status === "rejected").length +
    [statusData, recResult, symResult, consentResult, logResult].filter(r => r.ok === false).length;
  if (failures > 0) {
    toast(failures === 1 ? "One part of your Vault didn't load — try refreshing." : "Some parts of your Vault didn't load — try refreshing.", "err");
  }

  return patient;
}

document.addEventListener("click", (e) => {
  const retry = e.target.closest("[data-retry]");
  if (!retry) return;
  e.preventDefault();
  const kind = retry.getAttribute("data-retry");
  if (kind === "records") loadRecords();
  else if (kind === "symptoms") loadSymptomHistory();
  else if (kind === "consent") loadConsentRequests();
  else if (kind === "logs") loadAccessLogs();
});

document.getElementById("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../";
});

(async function init() {
  const [meData, profData] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../login/"; return; }
  const user = meData.user;
  if (profData && profData.ok && profData.profile && !profData.profile.wizard_done) {
    window.location.href = "../onboarding/";
    return;
  }
  const name = user.display_name || user.username || user.email || "";
  const initials = name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  document.getElementById("qc-user-dot").textContent = initials;
  document.getElementById("qc-user-name").textContent = name ? name.split(" ")[0] : "";

  // refreshOverview() itself no longer throws (see its own comment), but
  // this is the last line of defense: whatever happens, the ID card gets
  // painted with at least the name/initials we already have, rather than
  // staying on its "?" / "—" placeholders forever.
  let patient = {};
  try {
    patient = await refreshOverview();
  } catch (e) {
    toast("Some parts of your Vault didn't load — try refreshing.", "err");
  }
  renderIdCard(patient, name);

  try { await loadVaultVitals(); } catch (e) {
    document.getElementById("cv-vitals-wrap").innerHTML = '<div class="empty-note">Couldn\'t load your vitals right now.</div>';
  }
})();
