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
      return null;
    }
    return (data.ok && data.profile) ? data.profile : null;
  } catch (e) {
    return null;
  }
}

function renderFlags(flags) {
  const box = document.getElementById("qc-flags");
  box.innerHTML = "";
  if (!flags || !flags.length) {
    box.innerHTML = '<div class="empty-note">No flags right now — your latest readings look within range.</div>';
    return;
  }
  flags.forEach(f => {
    const el = document.createElement("div");
    el.className = "flag " + f.level;
    el.innerHTML = '<span class="flag-dot"></span><span>' + f.message + "</span>";
    box.appendChild(el);
  });
}

/* value -> [0,1] fill position within a plausible display range, used only for the ring's visual fill */
const RING_RANGES = {
  temp:    [35, 41],
  pulse:   [40, 160],
  spo2:    [80, 100],
  glucose: [60, 300],
  weight:  [30, 150],
};

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
    if (keywords.some(k => msg.includes(k))) {
      if (f.level === "CRITICAL") return "CRITICAL";
      worst = f.level || worst;
    }
  }
  return worst;
}

function severityColor(sev) {
  return sev === "CRITICAL" ? "#d24f28" : sev === "CAUTION" ? "#c98a10" : "#0e8f83";
}
function severityWord(m, sev) {
  if (m.key === "weight") return sev === "CRITICAL" ? "Sharp change" : sev === "CAUTION" ? "Changing" : "Steady";
  return sev === "CRITICAL" ? "Needs attention" : sev === "CAUTION" ? "Elevated" : "Normal";
}

/* A tile is only ever "Normal" when a real reading backs it up. */
function emptyCardHtml(m) {
  const R = 30, C = 2 * Math.PI * R;
  return '<a class="snap-card empty" href="../vitals/" aria-label="Add a ' + m.label + ' reading">' +
    '<div class="snap-ring-wrap">' +
      '<svg width="74" height="74" viewBox="0 0 74 74"><circle class="snap-ring-bg" cx="37" cy="37" r="' + R + '" stroke-dasharray="4 6"/></svg>' +
      '<div class="snap-ring-inner"><span class="snap-ring-num">' + m.icon + '</span></div>' +
    '</div>' +
    '<div class="sc-label">' + m.label + '</div>' +
    '<div class="sc-status" style="color:rgba(16,14,42,0.5)">No reading yet</div>' +
    '<span class="sc-add">+ Add</span>' +
  '</a>';
}

function ringCardHtml(m, value, unit, sev) {
  const R = 30, C = 2 * Math.PI * R;
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
      '<svg width="74" height="74" viewBox="0 0 74 74">' +
        '<circle class="snap-ring-bg" cx="37" cy="37" r="' + R + '"/>' +
        '<circle class="snap-ring-fg" cx="37" cy="37" r="' + R + '" stroke="' + color + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '"/>' +
      '</svg>' +
      '<div class="snap-ring-inner">' +
        '<span class="snap-ring-num">' + value + '</span>' +
        (unit ? '<span class="snap-ring-unit">' + unit + '</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="sc-label">' + m.label + '</div>' +
    '<div class="sc-status" style="color:' + color + '"><span class="sc-status-dot" style="background:' + color + '"></span>' + severityWord(m, sev) + '</div>' +
  '</div>';
}

function hasReading(latest, m) {
  if (!latest) return false;
  if (m.key === "bp") return latest.sys_bp != null && latest.dia_bp != null;
  const v = latest[m.key];
  return v !== undefined && v !== null && v !== "";
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

/* ---- Health score: ONE number, from the same source Insights uses ---- */
function updateHeroScore(risk) {
  const v = QC.scoreView(risk);
  const fg = document.getElementById("hero-score-fg");
  fg.style.strokeDasharray = v.C;
  fg.style.strokeDashoffset = v.offset;
  fg.setAttribute("stroke", v.color);
  document.getElementById("hero-score-num").textContent = v.num;
  const statusEl = document.getElementById("hero-score-status");
  statusEl.textContent = v.band;
  statusEl.style.color = v.color;
  document.getElementById("hero-score-conf").textContent = v.confidence;
  document.getElementById("hero-score-note").textContent = v.note;
  updateBuddy(risk && risk.has_data ? risk.score : null);
}

function updateBuddy(score) {
  const mouth = document.getElementById("qc-buddy-mouth");
  if (!mouth) return;
  if (score !== null && score < 50) mouth.setAttribute("d", "M40 58q10 -8 20 0");
  else if (score !== null && score < 70) mouth.setAttribute("d", "M40 55h20");
  else mouth.setAttribute("d", "M40 54q10 8 20 0");
}

function renderWhy(risk) {
  const card = document.getElementById("qc-why-card"), box = document.getElementById("qc-why");
  if (!risk || !risk.has_data) { card.style.display = "none"; return; }
  card.style.display = "";
  const rows = (risk.factors || []).map(f =>
    '<div class="why-row"><span>' + QC.esc(f.label) + '</span><span class="why-impact" style="color:' + (f.impact < 0 ? '#d24f28' : '#0e8f83') + '">' + (f.impact > 0 ? '+' : '') + f.impact + '</span></div>'
  ).join("");
  box.innerHTML = (rows || '<div class="empty-note">Nothing is pulling your score down right now.</div>') +
    '<div class="why-foot">Based on your last ' + (risk.window_days || 30) + ' days. A wellness estimate, not a diagnosis — it starts at 100 and moves with your vitals, symptom checks, conditions and lifestyle.</div>';
}

async function loadScore(force) {
  // Last known score appears at once (this tab only), then the fresh one replaces it.
  const stale = QC.stale("insights-30");
  if (stale && stale.ok !== false && !force) { updateHeroScore(stale.risk); renderWhy(stale.risk); }
  const data = await QC.insights(30, force);
  const risk = data && data.ok ? data.risk : (stale && stale.risk) || null;
  updateHeroScore(risk);
  renderWhy(risk);
  if (data && data.ok) { renderConditionCheckin(data.ongoing_conditions); renderFocus(data.focus); }
  else if (stale && stale.ok !== false) renderFocus(stale.focus);
}

/* Today's focus: the few most useful things to do now, ranked across vitals, symptom check-ins, records and the
   calendar. Today's appointments come first; the rest is computed on the server. */
async function renderFocus(serverItems) {
  const box = document.getElementById("qc-focus");
  let items = (serverItems || []).slice();
  try {
    const up = await QC.cal.upcoming(2);
    const soon = up.filter(u => u.when - Date.now() < 30 * 3600000 && u.when - Date.now() > -3600000).slice(0, 2).map(u => {
      const t = QC.cal.types[u.ev.type] || QC.cal.types.other;
      return { id: "cal-" + u.ev.id, icon: t.icon, tone: "plan", title: u.ev.title, detail: QC.cal.humanWhen(u.when) + (u.ev.location ? " · " + u.ev.location : ""), cta: "Open", href: "../calendar/" };
    });
    items = soon.concat(items);
  } catch (e) {}
  items = items.slice(0, 4);
  if (!items.length) {
    box.hidden = false;
    box.innerHTML = "<div class=\"focus-head\"><b>🎯 Today&rsquo;s focus</b></div><div class=\"focus-done\">✨ You&rsquo;re all caught up. Nothing needs your attention today.</div>";
    return;
  }
  box.hidden = false;
  box.innerHTML = '<div class="focus-head"><b>🎯 Today&rsquo;s focus</b><span>What matters most right now</span></div>' +
    items.map(i => '<a class="focus-row ' + QC.esc(i.tone || "") + '" href="' + QC.esc(i.href || "#") + '"><span class="focus-ic">' + QC.esc(i.icon || "💡") + '</span><span class="focus-main"><span class="focus-title">' + QC.esc(i.title) + '</span>' +
      (i.detail ? '<span class="focus-detail" style="display:block">' + QC.esc(i.detail) + '</span>' : '') + '</span><span class="focus-cta">' + QC.esc(i.cta || "Open") + ' →</span></a>').join("");
}

/* "Are you feeling better?" for conditions a symptom check suggested. Shares the check-in banner;
   a better answer removes it from Ongoing (and the score) for good until a newer check flags it again. */
function renderConditionCheckin(og) {
  const banner = document.getElementById("qc-checkin");
  if (!banner || banner.style.display === "flex") return;
  const item = ((og && og.items) || []).find(i => i.source === "symptom_check" && i.checkin_due);
  if (!item) return;
  const qEl = document.getElementById("qc-checkin-question"), optsEl = document.getElementById("qc-checkin-options");
  qEl.textContent = "Are you feeling better? You checked “" + item.name + "” " + (item.days_open >= 1 ? item.days_open + " day" + (item.days_open === 1 ? "" : "s") + " ago." : "recently.");
  optsEl.innerHTML = "";
  [["better", "😊 Better / gone"], ["same", "😐 About the same"], ["worse", "😟 Worse"]].forEach(([ans, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "checkin-opt-btn"; b.textContent = label;
    b.addEventListener("click", async () => {
      optsEl.querySelectorAll("button").forEach(x => { x.disabled = true; });
      try {
        const res = await fetch(API_BASE + "/insights/ongoing/checkin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.name, answer: ans }) });
        const out = await res.json();
        if (!out.ok) throw new Error(out.err);
        qEl.textContent = ans === "better" ? "Wonderful, glad you're feeling better! 🎉 I've taken it off your ongoing list." :
          ans === "same" ? "Thanks. I'll ask again in a couple of days." : "Sorry to hear that. A fresh symptom check can look at what's changed. If you have trouble breathing, chest pain, confusion or heavy bleeding, please get care today.";
        optsEl.innerHTML = ans === "worse" ? '<a class="checkin-opt-btn" style="text-decoration:none" href="../symptoms/">Check my symptoms again</a>' : "";
        QC.clearCache();
        loadScore(true);
        if (QC.refreshAlerts) QC.refreshAlerts({ force: true, toast: false });
        if (ans !== "worse") setTimeout(() => { banner.style.display = "none"; }, 3200);
      } catch (e) {
        optsEl.querySelectorAll("button").forEach(x => { x.disabled = false; });
        QC.toast("Couldn't save that. Please try again.", "err");
      }
    });
    optsEl.appendChild(b);
  });
  banner.style.display = "flex";
}

const SEV_COLORS = { emergency: "#b3182a", urgent: "#d24f28", caution: "#c98a10", watch: "#2f8fd1", reminder: "#0e8f83", info: "#6b6885" };
function renderAttention(items) {
  const card = document.getElementById("qc-attention-card"), box = document.getElementById("qc-attention");
  const list = (items || []).filter(a => a.kind !== "calendar").slice(0, 4);
  if (!list.length) { card.style.display = "none"; return; }
  card.style.display = "";
  box.innerHTML = list.map(a =>
    '<div class="attn-item" style="--ac:' + (SEV_COLORS[a.severity] || "#6b6885") + '"><div>' +
      '<div class="attn-title">' + QC.esc(a.title) + '</div>' +
      (a.message ? '<div class="attn-msg">' + QC.esc(a.message) + '</div>' : '') +
      (a.href ? '<a class="attn-cta" href="' + QC.esc(a.href) + '">' + QC.esc(a.cta || "Open") + ' →</a>' : '') +
    '</div></div>'
  ).join("");
}

async function loadUpcoming() {
  const box = document.getElementById("qc-upcoming");
  try {
    const list = (await QC.cal.upcoming(45)).slice(0, 4);
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt=""><div class="es-title">Nothing scheduled</div><div class="es-sub">Add doctor visits, tests or procedures and we\'ll remind you before each one.</div><button type="button" class="es-cta" data-href="../calendar/?new=1">Add appointment</button></div>';
      return;
    }
    box.innerHTML = list.map(u => {
      const t = QC.cal.types[u.ev.type] || QC.cal.types.other;
      const days = Math.ceil((u.when - Date.now()) / 86400000);
      const chip = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : "in " + days + " days";
      return '<a class="up-row" href="../calendar/" style="--ac:' + t.color + '">' +
        '<span class="up-ic">' + t.icon + '</span>' +
        '<div class="up-main"><div class="up-title">' + QC.esc(u.ev.title) + '</div><div class="up-when">' + QC.esc(QC.cal.humanWhen(u.when)) + (u.ev.location ? ' · ' + QC.esc(u.ev.location) : '') + '</div></div>' +
        '<span class="up-chip">' + chip + '</span></a>';
    }).join("");
  } catch (e) {
    box.innerHTML = '<div class="empty-note">Couldn\'t load your calendar right now.</div>';
  }
}

function renderProfileCard(profile, user) {
  const name = (profile && profile.display_name) || (user && (user.display_name || user.username || user.email)) || "—";
  document.getElementById("qc-profile-name").textContent = name;
  const initials = name && name !== "—" ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  document.getElementById("qc-profile-avatar").textContent = initials;
  document.getElementById("qc-user-dot").textContent = initials;
  document.getElementById("qc-user-name").textContent = name !== "—" ? name.split(" ")[0] : "";

  if (!profile) {
    document.getElementById("qc-profile-meta").textContent = "Profile details unavailable.";
    return;
  }
  const bits = [];
  if (profile.age) bits.push(profile.age + " y/o");
  if (profile.sex) bits.push(profile.sex);
  if (profile.occupation) bits.push(profile.occupation);
  document.getElementById("qc-profile-meta").textContent = bits.length ? bits.join(" · ") : "No extra details yet.";

  const chipsBox = document.getElementById("qc-profile-chips");
  const allergies = [].concat(profile.med_allergies || [], profile.food_allergies || [], profile.env_allergies || []);
  chipsBox.innerHTML = allergies.length
    ? allergies.slice(0, 6).map(a => '<span class="profile-chip">' + a + '</span>').join("")
    : '<span class="profile-chip">No known allergies logged</span>';
}

/* ---- Insights (backend trend/dashboard engine) ---- */
const LEVEL_META = {
  normal:    { color: "#0e8f83", word: "Normal" },
  watch:     { color: "#2f8fd1", word: "Worth watching" },
  caution:   { color: "#c98a10", word: "Caution" },
  urgent:    { color: "#d24f28", word: "Urgent" },
  emergency: { color: "#b3182a", word: "Emergency" },
};
const DIR_META = {
  rising:  { arrow: "↑", color: "#c98a10" },
  falling: { arrow: "↓", color: "#2f8fd1" },
  stable:  { arrow: "→", color: "#0e8f83" },
  single_reading: { arrow: "•", color: "rgba(16,14,42,0.4)" },
  no_data: { arrow: "—", color: "rgba(16,14,42,0.4)" },
};

function renderTrends(data) {
  const wrap = document.getElementById("qc-trend-wrap");
  if (!data || !data.has_data) {
    wrap.innerHTML = '<div class="empty-note">Not enough readings yet in this window — record a few vitals to see trends.</div>';
    return;
  }
  wrap.innerHTML = '<div class="trend-grid">' + data.cards.map(c => {
    const dir = DIR_META[c.direction] || DIR_META.no_data;
    const val = c.latest !== null && c.latest !== undefined ? c.latest : "—";
    return '<div class="trend-card">' +
      '<div class="tc-title">' + c.title + '</div>' +
      '<div class="tc-value-row">' +
        '<span class="tc-value">' + val + '</span>' +
        (val !== "—" ? '<span class="tc-unit">' + c.unit + '</span>' : '') +
        '<span class="tc-dir" style="color:' + dir.color + '">' + dir.arrow + (c.delta !== null && c.delta !== undefined ? ' ' + (c.delta > 0 ? '+' : '') + c.delta : '') + '</span>' +
      '</div>' +
      '<div class="tc-stats">' +
        '<span>Min <b>' + (c.min ?? "—") + '</b></span>' +
        '<span>Avg <b>' + (c.avg ?? "—") + '</b></span>' +
        '<span>Max <b>' + (c.max ?? "—") + '</b></span>' +
        '<span>' + (c.count || 0) + ' reading' + (c.count === 1 ? '' : 's') + '</span>' +
      '</div>' +
    '</div>';
  }).join("") + '</div>';
}

function renderAnalysis(data) {
  const wrap = document.getElementById("qc-analysis-wrap");
  if (!data || !data.has_data) {
    wrap.innerHTML = '<div class="empty-note">' + (data && data.summary ? data.summary : "Not enough vitals recorded yet for an analysis.") + '</div>';
    return;
  }
  const lvl = LEVEL_META[data.overall_level] || LEVEL_META.normal;
  let html = '<div class="level-banner" style="background:' + lvl.color + '1a; color:' + lvl.color + '">' +
    '<span class="lb-dot" style="background:' + lvl.color + '"></span>' +
    'Overall level: ' + lvl.word +
  '</div>';
  html += '<div class="summary-line" style="font-weight:500;">' + (data.summary || "") + '</div>';
  if (data.flags && data.flags.length) {
    html += data.flags.map(f => {
      const m = LEVEL_META[f.level] || LEVEL_META.normal;
      return '<div class="flag-row-detailed" style="background:' + m.color + '1a; color:' + m.color + '">' +
        '<span class="flag-dot" style="background:' + m.color + '"></span>' +
        '<span>' + f.message + '<span class="frd-meta">' + (f.metric || "") + (f.value !== undefined && f.value !== null ? ": " + f.value : "") + '</span></span>' +
      '</div>';
    }).join("");
  } else {
    html += '<div class="empty-note" style="margin-top:10px;">No alerts from Cura right now — keep logging to help it learn your baseline.</div>';
  }
  wrap.innerHTML = html;
}

let qcInsightsDays = 14;
async function loadInsights(days) {
  qcInsightsDays = days || qcInsightsDays;
  document.getElementById("qc-trend-wrap").innerHTML = '<div class="empty-note">Loading…</div>';
  document.getElementById("qc-analysis-wrap").innerHTML = '<div class="empty-note">Loading…</div>';
  try {
    const res = await fetch(API_BASE + "/vitals/dashboard?days=" + qcInsightsDays, { credentials: "include" });
    const data = await res.json();
    renderTrends(data);
    renderAnalysis(data);
  } catch (e) {
    document.getElementById("qc-trend-wrap").innerHTML = '<div class="empty-note">Couldn\'t load trends right now.</div>';
    document.getElementById("qc-analysis-wrap").innerHTML = '<div class="empty-note">Couldn\'t load analysis right now.</div>';
  }
}

function initDaySelect() {
  const btns = document.querySelectorAll("#qc-day-select .day-btn");
  btns.forEach(b => {
    b.addEventListener("click", () => {
      btns.forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      loadInsights(parseInt(b.getAttribute("data-days"), 10));
    });
  });
}

const QC_TIPS = [
  "Oxygen makes up about 65% of your body's mass.",
  "You breathe roughly 22,000 times a day, on autopilot.",
  "Logging vitals regularly helps QueroCura spot trends early.",
  "Your resting pulse tends to be lowest right after you wake up.",
  "A blood pressure reading is best taken seated, after 5 minutes of rest.",
];
function startTipRotator() {
  const el = document.getElementById("qc-tip");
  if (!el) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % QC_TIPS.length;
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = QC_TIPS[i]; el.style.opacity = 1; }, 260);
  }, 5500);
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

function setGreetingChrome() {
  const hr = new Date().getHours();
  const word = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("qc-today").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return word;
}

function initSectionTabs() {
  const tabs = document.querySelectorAll(".section-tab");
  tabs.forEach(t => {
    t.addEventListener("click", () => {
      tabs.forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      document.querySelectorAll(".section-panel").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-panel") === t.getAttribute("data-panel"));
      });
    });
  });
}

async function loadLatest() {
  const [res, hres] = await Promise.all([
    fetch(API_BASE + "/vitals/latest", { credentials: "include" }),
    fetch(API_BASE + "/vitals/history?limit=40", { credentials: "include" }).then(r => r.json()).catch(() => ({ history: [] })),
  ]);
  const data = await res.json();
  const recent = (hres && hres.history) || [];
  const any = data.latest && SNAPSHOT_METRICS.some(m => hasReading(data.latest, m));
  const summary = document.getElementById("qc-latest-summary");
  if (!any) {
    summary.textContent = "No vitals logged yet.";
    document.getElementById("qc-flags").innerHTML =
      '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt="">' +
      '<div class="es-title">Nothing to flag yet</div>' +
      '<div class="es-sub">Once you log a reading, QueroCura checks it and any changes over time — like a sudden drop in weight.</div>' +
      '<button type="button" class="es-cta" data-href="../vitals/">Log your first reading</button></div>';
  } else {
    summary.textContent = data.summary || "";
    renderFlags(data.flags);
  }
  renderSnapshot(data.latest, data.flags, recent);
}

async function loadHistory() {
  const res = await fetch(API_BASE + "/vitals/history?limit=10", { credentials: "include" });
  const data = await res.json();
  const wrap = document.getElementById("qc-history-wrap");

  if (!data.history || !data.history.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      '<img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt="">' +
      '<div class="es-title">No readings yet</div>' +
      '<div class="es-sub">Record your first vitals and QueroCura will start tracking trends for you.</div>' +
      '<button type="button" class="es-cta" data-href="../vitals/">Add a reading</button>' +
    '</div>';
    return;
  }

  let rows = data.history.map(r => (
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

document.getElementById("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../";
});

/* ---- "How are you feeling now?" check-in banner ---- */
/* Shown only from time to time (at most once every CHECKIN_INTERVAL_MS),
   not on every single page load -- qc-checkin-last-shown (localStorage,
   persists across visits) is the gate. Answering a task resolves it
   server-side, so once someone says they're okay it naturally stays quiet
   until a genuinely new check-in gets scheduled (after a later symptom
   check) -- nothing extra to track for that on the frontend. */
const CHECKIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CHECKIN_LAST_SHOWN_KEY = "qc-checkin-last-shown";
let qcCheckinItemId = null;

function checkinDue() {
  try {
    const last = parseInt(localStorage.getItem(CHECKIN_LAST_SHOWN_KEY) || "0", 10);
    return !last || (Date.now() - last) >= CHECKIN_INTERVAL_MS;
  } catch (e) {
    return true;
  }
}

function markCheckinShown() {
  try { localStorage.setItem(CHECKIN_LAST_SHOWN_KEY, String(Date.now())); } catch (e) {}
}

async function loadCheckin() {
  if (!checkinDue()) return;
  try {
    const res = await fetch(API_BASE + "/smart-followups/due", { credentials: "include" });
    const data = await res.json();
    if (!data.ok || !data.items || !data.items.length) return;
    if (document.getElementById("qc-checkin").style.display === "flex") return;   // a condition check-in is already showing
    renderCheckin(data.items[0]);
    markCheckinShown();
  } catch (e) {}
}

function renderCheckin(item) {
  qcCheckinItemId = item.id;
  const banner = document.getElementById("qc-checkin");
  const qEl = document.getElementById("qc-checkin-question");
  const optsEl = document.getElementById("qc-checkin-options");

  const anchorName = item.anchor_condition_name;
  qEl.textContent = item.question
    ? (item.question + (anchorName ? " (about your " + anchorName.toLowerCase() + " check)" : ""))
    : "How are you feeling now compared with your last check?";

  const options = (item.options && item.options.length) ? item.options : ["Better", "Same", "Worse", "New symptom appeared"];
  optsEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "checkin-opt-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => answerCheckin(item.id, opt));
    optsEl.appendChild(btn);
  });

  banner.style.display = "flex";
}

async function answerCheckin(taskId, optionText) {
  const banner = document.getElementById("qc-checkin");
  banner.querySelectorAll(".checkin-opt-btn").forEach(b => { b.disabled = true; });

  try {
    await fetch(API_BASE + "/smart-followups/answer", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, answer_text: optionText, answer_payload: { option: optionText } }),
    });
  } catch (e) {}

  document.getElementById("qc-checkin-question").textContent = "Thanks — that helps keep your health score accurate. 💛";
  document.getElementById("qc-checkin-options").innerHTML = "";
  setTimeout(() => { banner.style.display = "none"; }, 2200);
}

document.getElementById("qc-checkin-dismiss").addEventListener("click", () => {
  // "Not now" just re-arms the regular interval rather than answering the
  // task -- markCheckinShown() was already called when it appeared, so
  // this doesn't change *when* it can show again, it just closes it now.
  document.getElementById("qc-checkin").style.display = "none";
});

(async function init() {
  // The score doesn't need to wait for sign-in/profile checks: start it now (a signed-out visitor
  // simply gets nothing back and is redirected below).
  const scoreLoad = loadScore();
  // Auth check and profile check both just need the session cookie — fire
  // them together instead of waiting on one before starting the other.
  const [meData, profResult] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../login/"; return; }
  const user = meData.user;
  if (!profResult) return;
  if (profResult.ok && profResult.profile && !profResult.profile.wizard_done) {
    window.location.href = "../onboarding/";
    return;
  }
  const profile = (profResult.ok && profResult.profile) ? profResult.profile : null;

  const name = (profile && profile.display_name) || user.display_name || user.username || user.email || "";
  const firstName = name ? name.split(" ")[0] : "";
  const greetWord = setGreetingChrome();
  document.getElementById("qc-greeting").innerHTML = firstName
    ? (greetWord + ", <span class='name'>" + firstName + "</span> 👋")
    : (greetWord + " 👋");
  document.getElementById("qc-greeting-sub").textContent = "Here's where things stand today.";
  renderProfileCard(profile, user);
  initSectionTabs();
  initDaySelect();
  startTipRotator();
  // These four don't depend on each other — load them together.
  await Promise.all([loadLatest(), loadHistory(), loadInsights(14), loadCheckin(), scoreLoad, loadUpcoming()]);
  QC.refreshAlerts({ toast: true }).then(renderAttention);
  setTimeout(() => { if (window.QCPush) QCPush.maybePrompt(); }, 5000);
})();
