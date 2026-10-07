var STORAGE_KEY = 'qc-theme';
var root = document.documentElement;
var SUN_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
var MOON_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#100e2a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  var icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.innerHTML = dark ? SUN_ICON : MOON_ICON;
}
window.toggleTheme = function () { applyTheme(root.getAttribute('data-theme') !== 'dark'); };
if (root.getAttribute('data-theme') === 'dark') applyTheme(true);

const API_BASE = "https://app.querocura.com/api";

function fmt(v) { return (v === null || v === undefined || v === "") ? "—" : v; }
function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts.replace(" ", "T")).toLocaleString(); }
  catch (e) { return ts; }
}
function clamp01(n) { return Math.max(0, Math.min(1, n)); }

async function requireSession() {
  const res = await fetch(API_BASE + "/auth/me", { credentials: "include" });
  const data = await res.json();
  if (!data.logged_in) {
    window.location.href = "../login/";
    return null;
  }
  return data.user;
}

async function requireCompletedProfile() {
  try {
    const res = await fetch(API_BASE + "/profile", { credentials: "include" });
    const data = await res.json();
    if (data.ok && data.profile && !data.profile.wizard_done) {
      window.location.href = "../onboarding/";
      return false;
    }
  } catch (e) {}
  return true;
}

const RING_RANGES = { temp: [35, 41], pulse: [40, 160], spo2: [80, 100], glucose: [60, 300], weight: [30, 150] };
const SNAPSHOT_METRICS = [
  { key: "spo2",    icon: "🫁", label: "SpO₂",    unit: "%",     keywords: ["oxygen", "spo"] },
  { key: "pulse",   icon: "💓", label: "Pulse",   unit: "bpm",   keywords: ["pulse"] },
  { key: "temp",    icon: "🌡️", label: "Temp",    unit: "°C",    keywords: ["temperature", "fever"] },
  { key: "bp",      icon: "❤️", label: "BP",      unit: "mmHg",  keywords: ["blood pressure", "bp"] },
  { key: "glucose", icon: "🩸", label: "Glucose", unit: "mg/dL", keywords: ["glucose", "sugar"] },
  { key: "weight",  icon: "⚖️", label: "Weight",  unit: "kg",    keywords: ["weight"] },
];
function flagSeverityFor(keywords, flags) {
  if (!flags || !flags.length) return "";
  let worst = "";
  for (const f of flags) {
    const msg = (f.message || "").toLowerCase();
    if (keywords.some(k => msg.includes(k))) { if (f.level === "CRITICAL") return "CRITICAL"; worst = f.level || worst; }
  }
  return worst;
}
function severityColor(sev) { return sev === "CRITICAL" ? "#d24f28" : sev === "CAUTION" ? "#c98a10" : "#0e8f83"; }
function statusWord(m, sev) {
  if (m.key === "weight") return sev === "CRITICAL" ? "Sharp change" : sev === "CAUTION" ? "Changing" : "Steady";
  return sev === "CRITICAL" ? "Needs attention" : sev === "CAUTION" ? "Elevated" : "Normal";
}
function hasReading(latest, m) {
  if (!latest) return false;
  if (m.key === "bp") return latest.sys_bp != null && latest.dia_bp != null;
  const v = latest[m.key];
  return v !== undefined && v !== null && v !== "";
}

function ringCardHtml(m, value, unit, sev) {
  const R = 25, C = 2 * Math.PI * R;
  let pct;
  if (m.key === "bp") {
    pct = sev === "CRITICAL" ? 0.92 : sev === "CAUTION" ? 0.66 : 0.5;
  } else {
    const range = RING_RANGES[m.key];
    pct = range ? clamp01((parseFloat(value) - range[0]) / (range[1] - range[0])) : 0.5;
    if (pct < 0.12) pct = 0.12;
  }
  const color = severityColor(sev);
  const off = C - pct * C;
  return '<div class="snap-card">' +
    '<div class="snap-ring-wrap">' +
      '<svg width="62" height="62" viewBox="0 0 62 62">' +
        '<circle class="snap-ring-bg" cx="31" cy="31" r="' + R + '"/>' +
        '<circle class="snap-ring-fg" cx="31" cy="31" r="' + R + '" stroke="' + color + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"/>' +
      '</svg>' +
      '<div class="snap-ring-inner"><span class="snap-ring-num">' + value + '</span>' + (unit ? '<span class="snap-ring-unit">' + unit + '</span>' : '') + '</div>' +
    '</div>' +
    '<div class="sc-label">' + m.label + '</div>' +
    '<div class="sc-status" style="color:' + color + '"><span class="sc-dot" style="background:' + color + '"></span>' + statusWord(m, sev) + '</div>' +
  '</div>';
}
function emptyCardHtml(m) {
  return '<a class="snap-card empty" href="#v-' + (m.key === "bp" ? "sys" : m.key) + '" data-focus="v-' + (m.key === "bp" ? "sys" : m.key) + '" data-h-click="focusField">' +
    '<div class="snap-ring-wrap"><svg width="62" height="62" viewBox="0 0 62 62"><circle class="snap-ring-bg" cx="31" cy="31" r="25" stroke-dasharray="4 5"/></svg>' +
    '<div class="snap-ring-inner"><span class="snap-ring-num">' + m.icon + '</span></div></div>' +
    '<div class="sc-label">' + m.label + '</div>' +
    '<div class="sc-status" style="color:rgba(16,14,42,0.5)">No reading yet</div></a>';
}


/* A tile shows the most recent reading of THAT metric, even if the newest saved
   row only had other values. Older values are labelled by age and never get a
   "Normal" badge, because the live flags only cover the newest row. */
function agoText(ts) {
  const d = new Date(String(ts || "").replace(" ", "T"));
  if (isNaN(d.getTime())) return "earlier";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  return Math.floor(days / 30) + "mo ago";
}
function carriedFromHistory(history, m) {
  for (const row of (history || [])) if (hasReading(row, m)) return row;
  return null;
}
function carriedCardHtml(m, value, unit, ts) {
  const R = 30, C = 2 * Math.PI * R, range = RING_RANGES[m.key];
  const pct = m.key === "bp" ? 0.5 : Math.max(0.12, range ? clamp01((parseFloat(value) - range[0]) / (range[1] - range[0])) : 0.5);
  const grey = "rgba(16,14,42,0.35)";
  return '<div class="snap-card" title="Last logged ' + agoText(ts) + '">' +
    '<div class="snap-ring-wrap"><svg width="74" height="74" viewBox="0 0 74 74"><circle class="snap-ring-bg" cx="37" cy="37" r="' + R + '"/>' +
    '<circle class="snap-ring-fg" cx="37" cy="37" r="' + R + '" stroke="' + grey + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C - pct * C) + '"/></svg>' +
    '<div class="snap-ring-inner"><span class="snap-ring-num">' + value + '</span>' + (unit ? '<span class="snap-ring-unit">' + unit + '</span>' : '') + '</div></div>' +
    '<div class="sc-label">' + m.label + '</div>' +
    '<div class="sc-status" style="color:rgba(16,14,42,0.5)">Last logged ' + agoText(ts) + '</div></div>';
}

function renderSnapshot(latest, flags, history) {
  const box = document.getElementById("qc-snapshot");
  latest = latest || {};
  box.innerHTML = SNAPSHOT_METRICS.map(m => {
    if (!hasReading(latest, m)) {
      const old = carriedFromHistory(history, m);
      if (!old) return emptyCardHtml(m);
      return carriedCardHtml(m, m.key === "bp" ? (old.sys_bp + "/" + old.dia_bp) : old[m.key], m.unit, old.ts);
    }
    const value = m.key === "bp" ? (latest.sys_bp + "/" + latest.dia_bp) : latest[m.key];
    return ringCardHtml(m, value, m.unit, flagSeverityFor(m.keywords, flags));
  }).join("");
}

/* ---- Smart input checks: catch typos and unit mix-ups before they pollute your trends ---- */
const LIMITS = {
  temp:    { min: 30,  max: 45,  label: "Temperature" },
  sys_bp:  { min: 50,  max: 260, label: "Systolic BP" },
  dia_bp:  { min: 30,  max: 160, label: "Diastolic BP" },
  pulse:   { min: 20,  max: 250, label: "Pulse" },
  spo2:    { min: 50,  max: 100, label: "SpO₂" },
  glucose: { min: 20,  max: 700, label: "Glucose" },
  weight:  { min: 2,   max: 400, label: "Weight" },
};
const FIELD_IDS = { temp: "v-temp", sys_bp: "v-sys", dia_bp: "v-dia", pulse: "v-pulse", spo2: "v-spo2", glucose: "v-glucose", weight: "v-weight" };
let qcLastReadings = []; // newest first, from /vitals/history

function setHint(id, text, kind) {
  const el = document.getElementById("h-" + id.replace(/^v-/, ""));
  if (!el) return;
  el.textContent = text || "";
  el.className = "hint" + (kind ? " " + kind : "");
}

function checkField(key, soft) {
  const input = document.getElementById(FIELD_IDS[key]);
  const raw = input.value.trim();
  input.classList.remove("bad");
  setHint(FIELD_IDS[key], "");
  if (raw === "") return { ok: true, empty: true };
  const n = parseFloat(raw);
  const L = LIMITS[key];
  if (isNaN(n)) return { ok: false, msg: L.label + " must be a number." };
  if (key === "temp" && n >= 90 && n <= 110) {
    const c = ((n - 32) * 5 / 9).toFixed(1);
    setHint(FIELD_IDS[key], "That looks like °F — about " + c + " °C. Enter °C.", "warn");
    input.classList.add("bad");
    return { ok: false, msg: "Temperature looks like °F (" + n + "°F ≈ " + c + "°C). Please enter °C." };
  }
  if (n < L.min || n > L.max) {
    input.classList.add("bad");
    setHint(FIELD_IDS[key], "Expected " + L.min + "–" + L.max, "warn");
    return { ok: false, msg: L.label + " of " + n + " doesn't look right (expected " + L.min + "–" + L.max + ")." };
  }
  return { ok: true, value: n };
}

function weightHint() {
  const raw = document.getElementById("v-weight").value.trim();
  const prev = qcLastReadings.find(r => r.weight != null);
  if (raw === "") { setHint("v-weight", prev ? "Last: " + prev.weight + " kg" : ""); return; }
  const n = parseFloat(raw);
  if (isNaN(n) || !prev) return;
  const pct = (n - prev.weight) / prev.weight * 100;
  const days = Math.max(0, Math.round((Date.now() - new Date(String(prev.ts).replace(" ", "T")).getTime()) / 86400000));
  const when = days === 0 ? "earlier today" : days + " day" + (days > 1 ? "s" : "") + " ago";
  if (Math.abs(pct) >= 25 && days <= 2) setHint("v-weight", "That's a " + Math.abs(pct).toFixed(0) + "% jump — kg, not lb?", "warn");
  else if (pct <= -3) setHint("v-weight", "▼ " + Math.abs(pct).toFixed(1) + "% vs " + prev.weight + " kg " + when + " — we'll flag it.", "warn");
  else if (pct >= 3.5) setHint("v-weight", "▲ " + pct.toFixed(1) + "% vs " + prev.weight + " kg " + when + ".", "info");
  else setHint("v-weight", "Steady (" + (pct >= 0 ? "+" : "") + pct.toFixed(1) + "% vs " + prev.weight + " kg " + when + ")", "");
}

function bpHint() {
  const s = parseFloat(document.getElementById("v-sys").value), d = parseFloat(document.getElementById("v-dia").value);
  if (!isNaN(s) && !isNaN(d) && s <= d) setHint("v-dia", "Systolic (top) should be higher than diastolic.", "warn");
  else setHint("v-dia", "");
}

async function loadLatest() {
  const res = await fetch(API_BASE + "/vitals/latest", { credentials: "include" });
  const data = await res.json();
  renderSnapshot(data.latest, data.flags, qcLastReadings);
}

async function loadHistory() {
  const res = await fetch(API_BASE + "/vitals/history?limit=40", { credentials: "include" });
  const data = await res.json();
  const wrap = document.getElementById("qc-history-wrap");
  qcLastReadings = data.history || [];
  weightHint();
  if (!data.history || !data.history.length) {
    wrap.innerHTML = '<div class="empty-note">No readings yet — the one you save above will show up here.</div>';
    return;
  }
  let rows = data.history.slice(0, 6).reverse().map(r => (
    "<tr>" +
      "<td>" + fmtDate(r.ts) + "</td>" +
      "<td>" + fmt(r.temp) + "</td>" +
      "<td>" + (r.sys_bp != null && r.dia_bp != null ? r.sys_bp + "/" + r.dia_bp : "—") + "</td>" +
      "<td>" + fmt(r.pulse) + "</td>" +
      "<td>" + fmt(r.spo2) + "</td>" +
      "<td>" + fmt(r.glucose) + "</td>" +
      "<td>" + fmt(r.weight) + "</td>" +
    "</tr>"
  )).join("");
  wrap.innerHTML =
    "<table><thead><tr>" +
      "<th>When</th><th>Temp</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Glucose</th><th>Weight</th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table>";
}

function fireConfetti() {
  const colors = ["#0e8f83", "#7c6fdb", "#2f8fd1", "#e0a52c"];
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

document.getElementById("qc-vitals-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("qc-save-btn");
  const msg = document.getElementById("qc-save-msg");
  const alertsBox = document.getElementById("qc-result-alerts");
  msg.className = "save-msg"; msg.textContent = ""; alertsBox.innerHTML = "";

  // 1) validate everything first
  const problems = [];
  let filled = 0;
  Object.keys(FIELD_IDS).forEach(k => {
    const r = checkField(k);
    if (!r.ok) problems.push(r.msg); else if (!r.empty) filled++;
  });
  const sys = document.getElementById("v-sys").value.trim(), dia = document.getElementById("v-dia").value.trim();
  if ((sys && !dia) || (!sys && dia)) problems.push("Blood pressure needs both numbers (top and bottom).");
  if (sys && dia && parseFloat(sys) <= parseFloat(dia)) problems.push("Systolic (top) BP should be higher than diastolic (bottom).");
  if (!filled && !problems.length) problems.push("Enter at least one reading to save.");
  if (problems.length) { msg.classList.add("err"); msg.textContent = problems[0]; return; }

  btn.disabled = true;
  btn.textContent = "Saving…";

  const payload = {};
  payload.temp = document.getElementById("v-temp").value || null;
  payload.sys_bp = sys || null;
  payload.dia_bp = dia || null;
  payload.pulse = document.getElementById("v-pulse").value || null;
  payload.spo2 = document.getElementById("v-spo2").value || null;
  payload.glucose = document.getElementById("v-glucose").value || null;
  payload.weight = document.getElementById("v-weight").value || null;
  payload.notes = document.getElementById("v-notes").value || "";

  try {
    const res = await fetch(API_BASE + "/vitals", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || "Couldn't save that reading.");

    msg.classList.add("ok");
    msg.textContent = "Saved.";
    document.getElementById("qc-vitals-form").reset();
    Object.keys(FIELD_IDS).forEach(k => setHint(FIELD_IDS[k], ""));

    // 2) tell them straight away what the reading means -- including change over time
    const flags = (data.flags || []);
    if (flags.length) {
      const colors = { CRITICAL: "#d24f28", CAUTION: "#c98a10" };
      alertsBox.innerHTML = flags.map(f =>
        '<div class="result-alert" style="--ac:' + (colors[f.level] || "#c98a10") + '"><div><b>' + (f.code && f.code.indexOf("WEIGHT") === 0 ? "⚖️ Weight alert" : f.level === "CRITICAL" ? "⚠️ Needs attention" : "🟠 Worth a closer look") + '</b><span>' + QC.esc(f.message) + '</span></div></div>'
      ).join("");
      if (flags.some(f => f.level === "CRITICAL")) QC.toast("⚠️ One of those readings needs attention.", "err", 5000);
    } else {
      alertsBox.innerHTML = '<div class="result-ok">✅ All within range, and no worrying changes compared with your recent readings.</div>';
      fireConfetti();
    }
    await loadHistory();
    await loadLatest();
    if (window.QC && QC.refreshAlerts) QC.refreshAlerts({ force: true, toast: false });
  } catch (err) {
    msg.classList.add("err");
    msg.textContent = err.message || "Something went wrong.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Save reading";
  }
});

Object.keys(FIELD_IDS).forEach(k => {
  document.getElementById(FIELD_IDS[k]).addEventListener("blur", () => { checkField(k); if (k === "weight") weightHint(); });
});
document.getElementById("v-weight").addEventListener("input", weightHint);
document.getElementById("v-sys").addEventListener("input", bpHint);
document.getElementById("v-dia").addEventListener("input", bpHint);

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
  await loadHistory();
  await loadLatest();
})();


(window.QCH = window.QCH || {});
QCH.focusField = function () { var el = document.getElementById(this.dataset.focus); if (el) el.focus(); };
