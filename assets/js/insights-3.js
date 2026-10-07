const API_BASE = "https://app.querocura.com/api";
const STORAGE_KEY = 'qc-theme';
const SUN_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#100e2a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
const MOON_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.4" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';

function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('theme-toggle-icon').innerHTML = dark ? MOON_ICON : SUN_ICON;
}
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  applyTheme(dark);
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
}
applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date((ts || "").replace(" ", "T"));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

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

function sparklinePath(values, w, h, pad) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  return { d, pts };
}

function chartCardHtml(card, history, key) {
  const dir = DIR_META[card.direction] || DIR_META.no_data;
  const val = card.latest !== null && card.latest !== undefined ? card.latest : "—";
  const values = (history || []).map(r => r[key]).filter(v => v !== null && v !== undefined && v !== "").map(Number);

  let chartSvg = '<div class="empty-note" style="font-size:11.5px;">Not enough points to chart yet.</div>';
  const spark = sparklinePath(values, 300, 54, 6);
  if (spark) {
    const last = spark.pts[spark.pts.length - 1];
    const areaD = spark.d + ` L${last[0].toFixed(1)},54 L${spark.pts[0][0].toFixed(1)},54 Z`;
    chartSvg = '<svg viewBox="0 0 300 54" preserveAspectRatio="none">' +
      '<path d="' + areaD + '" fill="' + dir.color + '" opacity="0.10"></path>' +
      '<path d="' + spark.d + '" fill="none" stroke="' + dir.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + dir.color + '"></circle>' +
    '</svg>';
  }

  return '<div class="chart-card">' +
    '<div class="cc-head">' +
      '<span class="cc-title">' + card.title + '</span>' +
      '<span class="cc-dir" style="color:' + dir.color + '">' + dir.arrow + (card.delta !== null && card.delta !== undefined ? ' ' + (card.delta > 0 ? '+' : '') + card.delta : '') + '</span>' +
    '</div>' +
    '<div class="cc-value-row">' +
      '<span class="cc-value">' + val + '</span>' +
      (val !== "—" ? '<span class="cc-unit">' + card.unit + '</span>' : '') +
    '</div>' +
    chartSvg +
    '<div class="cc-stats">' +
      '<span>Min <b>' + (card.min ?? "—") + '</b></span>' +
      '<span>Avg <b>' + (card.avg ?? "—") + '</b></span>' +
      '<span>Max <b>' + (card.max ?? "—") + '</b></span>' +
      '<span>' + (card.count || 0) + ' reading' + (card.count === 1 ? '' : 's') + '</span>' +
    '</div>' +
  '</div>';
}

function renderCharts(vitalsDashboard) {
  const wrap = document.getElementById("qc-chart-wrap");
  if (!vitalsDashboard || !vitalsDashboard.has_data || !vitalsDashboard.cards || !vitalsDashboard.cards.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      '<img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt="">' +
      '<div class="es-title">No vitals yet</div>' +
      '<div class="es-sub">Log a few readings and your trend charts will start filling in here.</div>' +
      '<button type="button" class="es-cta" data-href="../vitals/">Add a reading</button>' +
    '</div>';
    return;
  }
  const history = (vitalsDashboard.analysis && vitalsDashboard.analysis.history) || [];
  wrap.innerHTML = '<div class="chart-grid">' +
    vitalsDashboard.cards
      .filter(c => c.count && c.count > 0)
      .map(c => chartCardHtml(c, history, c.key)).join("") +
  '</div>';
}

function renderRisk(risk) {
  const v = QC.scoreView(risk);
  const fg = document.getElementById("hero-score-fg");
  fg.style.strokeDasharray = v.C;
  fg.style.strokeDashoffset = v.offset;
  fg.setAttribute("stroke", v.color);
  document.getElementById("hero-score-num").textContent = v.num;
  const statusEl = document.getElementById("hero-score-status");
  statusEl.textContent = v.band;
  statusEl.style.color = v.color;
  const conf = document.getElementById("hero-score-conf");
  conf.style.display = v.has ? "" : "none";
  conf.textContent = v.confidence + (risk && risk.window_days ? " · last " + risk.window_days + " days" : "");

  const list = document.getElementById("qc-factor-list");
  const factors = (risk && risk.has_data && risk.factors) || [];
  if (!factors.length) {
    list.innerHTML = risk && risk.has_data ? '<div class="factor-row"><span class="fr-label">Nothing is pulling your score down right now 🎉</span></div>' : '<div class="factor-row"><span class="fr-label">' + QC.esc(v.note) + '</span></div>';
    return;
  }
  list.innerHTML = factors.map(f => (
    '<div class="factor-row">' +
      '<span class="fr-label">' + QC.esc(f.label) + '</span>' +
      '<span class="fr-impact" style="color:' + (f.impact < 0 ? '#d24f28' : '#0e8f83') + '">' + (f.impact > 0 ? '+' : '') + f.impact + '</span>' +
    '</div>'
  )).join("");
}

const SEV_COLORS = { emergency: "#b3182a", urgent: "#d24f28", caution: "#c98a10", watch: "#2f8fd1", info: "#6b6885" };
function renderAlerts(alerts) {
  const card = document.getElementById("qc-alerts-card"), box = document.getElementById("qc-alerts-wrap");
  if (!alerts || !alerts.length) { card.style.display = "none"; return; }
  card.style.display = "";
  box.innerHTML = alerts.map(a =>
    '<div class="alert-row" style="--ac:' + (SEV_COLORS[a.severity] || "#6b6885") + '"><div>' +
      '<div class="alert-title">' + QC.esc(a.title) + '</div>' +
      (a.message ? '<div class="alert-msg">' + QC.esc(a.message) + '</div>' : '') +
      (a.href ? '<a class="alert-cta" href="' + QC.esc(a.href) + '">' + QC.esc(a.cta || "Open") + ' →</a>' : '') +
    '</div></div>'
  ).join("");
}

const SOURCE_TEXT = { profile: "From your profile", symptom_check: "From a symptom check", both: "Profile + symptom check" };

/* "Are you feeling better?" — only for conditions a symptom check suggested (profile conditions are
   yours to edit in your profile). Better = leaves Ongoing and the score; Same = ask again in 2 days;
   Worse = nudges a fresh symptom check. */
function checkinHtml(i) {
  if (i.source !== "symptom_check") return "";
  const n = QC.esc(i.name);
  const btn = (ans, label, cls) => '<button type="button" class="ci-btn ' + cls + '" data-ci-name="' + n + '" data-ci-ans="' + ans + '">' + label + '</button>';
  if (i.last_checkin === "worse") {
    return '<div class="ci-box"><b>You said this got worse.</b> A fresh symptom check will look at what has changed. If you have any red-flag signs (trouble breathing, chest pain, confusion, heavy bleeding), please get care today.' +
      '<div class="ci-btns"><a class="ci-btn bad" style="text-decoration:none" href="../symptoms/">Check my symptoms again</a>' + btn("better", "Actually, it's better", "good") + '</div></div>';
  }
  if (i.checkin_due) {
    return '<div class="ci-box"><b>How is this now?</b> You checked this ' + (i.days_open >= 1 ? i.days_open + " day" + (i.days_open === 1 ? "" : "s") + " ago" : "a little while ago") + '. Are you feeling better?' +
      '<div class="ci-btns">' + btn("better", "😊 Yes, it's gone / better", "good") + btn("same", "😐 About the same", "") + btn("worse", "😟 Worse", "bad") + '</div></div>';
  }
  return '<button type="button" class="ci-link" data-ci-name="' + n + '" data-ci-ans="better">Feeling better? Mark as resolved</button>';
}

async function sendCheckin(name, answer, btnEl) {
  const row = btnEl.closest(".cond-main");
  row.querySelectorAll("button").forEach(b => { b.disabled = true; });
  try {
    const res = await fetch(API_BASE + "/insights/ongoing/checkin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, answer }) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.err || "failed");
    if (answer === "worse") QC.toast("Thanks for telling me. Please re-check your symptoms.", "err");
    else if (answer === "same") QC.toast("Noted. I'll ask again in a couple of days. 👍", "ok");
    else {
      QC.toast("Glad you're feeling better! 🎉 Removed from your ongoing conditions.", "ok");
    }
    // everything that depends on this (score, alerts, bell) must reflect the answer
    QC.clearCache();
    await loadInsights(qcDays, true);
    if (QC.refreshAlerts) QC.refreshAlerts({ force: true, toast: false });
  } catch (e) {
    row.querySelectorAll("button").forEach(b => { b.disabled = false; });
    QC.toast("Couldn't save that. Please try again.", "err");
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-ci-ans]");
  if (b) sendCheckin(b.getAttribute("data-ci-name"), b.getAttribute("data-ci-ans"), b);
});

function renderOngoing(og) {
  const wrap = document.getElementById("qc-ongoing-wrap");
  const items = (og && og.items) || [];
  const past = (og && og.past) || [];
  if (!items.length && !past.length && !((og && og.resolved) || []).length) {
    wrap.innerHTML = '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt="">' +
      '<div class="es-title">No ongoing conditions</div>' +
      '<div class="es-sub">Nothing on your profile, and no recent symptom check has suggested one. If something applies to you, add it to your profile.</div>' +
      '<button type="button" class="es-cta" data-href="../profile/">Update profile</button></div>';
    return;
  }
  let html = '';
  if (items.length) {
    html += '<div class="cond-list">' + items.map(i => {
      const icon = i.source === "symptom_check" ? "🔍" : "🩺";
      const flagBadge = i.urgent ? '<span class="badge urgent">Urgent</span>' : i.status === "recurring" ? '<span class="badge recurring">Recurring</span>' : '';
      const meta = [];
      if (i.count) meta.push(i.count + "× in symptom checks");
      if (i.last_seen) meta.push("last " + fmtDate(i.last_seen));
      return '<div class="cond-row"><div class="cond-ic">' + icon + '</div><div class="cond-main">' +
        '<div class="cond-name">' + QC.esc(i.name) + '<span class="badge ' + i.source + '">' + (SOURCE_TEXT[i.source] || "") + '</span>' + flagBadge + '</div>' +
        '<div class="cond-note">' + QC.esc(i.note || "") + '</div>' +
        (meta.length ? '<div class="cond-meta">' + meta.join(" · ") + '</div>' : '') +
        checkinHtml(i) +
      '</div></div>';
    }).join("") + '</div>';
    html += '<div class="btn-row"><a class="btn-soft" href="../profile/">Edit conditions in profile</a><a class="btn-soft" href="../symptoms/">Run a symptom check</a></div>';
  } else {
    html += '<div class="empty-note">No ongoing conditions right now.</div>';
  }
  const cleared = (og && og.resolved) || [];
  if (cleared.length) {
    html += '<div class="ci-cleared">✅ Marked as better: ' + cleared.map(c => QC.esc(c.name)).join(", ") +
      '. ' + (cleared.length === 1 ? "It no longer counts" : "They no longer count") + ' toward your health score. If it comes back, run a new symptom check.</div>';
  }
  if (past.length) {
    html += '<div class="past-line"><b>Past conditions &amp; surgeries:</b> ' + past.map(QC.esc).join(" · ") + ' <span style="opacity:.7">(resolved — they only nudge your score slightly)</span></div>';
  }
  wrap.innerHTML = html;
}

function renderPlan(plan) {
  const card = document.getElementById("qc-plan-card"), box = document.getElementById("qc-plan-wrap");
  if (!plan || !plan.length) { card.style.display = "none"; return; }
  card.style.display = "";
  box.innerHTML = plan.map(a =>
    '<div class="plan-row"><span class="prio ' + QC.esc(a.priority) + '">' + QC.esc(a.priority) + '</span><div><div class="plan-title">' + QC.esc(a.title) + '</div><div class="plan-detail">' + QC.esc(a.detail || "") + '</div></div></div>'
  ).join("");
}

function renderQuestions(qs) {
  const card = document.getElementById("qc-q-card"), box = document.getElementById("qc-q-wrap");
  if (!qs || !qs.length) { card.style.display = "none"; return; }
  card.style.display = "";
  box.innerHTML = '<ol class="q-list">' + qs.map(q => '<li>' + QC.esc(q) + '</li>').join("") + '</ol>' +
    '<div class="btn-row"><button type="button" class="btn-soft" id="q-copy">📋 Copy questions</button><a class="btn-soft" href="../calendar/?new=1&type=doctor">📅 Schedule the visit</a></div>';
  document.getElementById("q-copy").addEventListener("click", () => {
    QC.copy(qs.map((q, i) => (i + 1) + ". " + q).join("\n")).then(() => QC.toast("Questions copied — paste them into your notes.", "ok"), () => QC.toast("Couldn't copy.", "err"));
  });
}

function renderGaps(gaps) {
  const card = document.getElementById("qc-gaps-card"), box = document.getElementById("qc-gaps-wrap");
  if (!gaps || !gaps.length) { card.style.display = "none"; return; }
  card.style.display = "";
  box.innerHTML = gaps.map(g =>
    '<div class="gap-row"><span style="font-size:20px">' + (g.icon || "💡") + '</span><div class="gap-main"><div class="gap-title">' + QC.esc(g.title) + '</div><div class="gap-detail">' + QC.esc(g.detail || "") + '</div></div>' +
    '<a class="btn-soft" href="' + QC.esc(g.href || "#") + '">' + QC.esc(g.cta || "Open") + '</a></div>'
  ).join("");
}

function renderCorrelations(correlations) {
  const wrap = document.getElementById("qc-insight-wrap");
  if (!correlations || !correlations.length) {
    wrap.innerHTML = '<div class="empty-note">Keep logging vitals and symptom checks — patterns will show up here.</div>';
    return;
  }
  wrap.innerHTML = '<div class="insight-grid">' + correlations.map(c => (
    '<div class="insight-card">' +
      '<span class="ic-emoji">' + (c.icon || '💡') + '</span>' +
      '<div><div class="ic-title">' + c.title + '</div><div class="ic-detail">' + c.detail + '</div></div>' +
    '</div>'
  )).join("") + '</div>';
}

function renderFrequency(freq) {
  const wrap = document.getElementById("qc-freq-wrap");
  if (!freq || !freq.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      '<img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt="">' +
      '<div class="es-title">No symptom checks yet</div>' +
      '<div class="es-sub">Run a symptom check and it\'ll start showing up here so you can spot recurring patterns.</div>' +
      '<button type="button" class="es-cta" data-href="../symptoms/">Check symptoms</button>' +
    '</div>';
    return;
  }
  const max = Math.max(...freq.map(c => c.count));
  wrap.innerHTML = '<div class="freq-list">' + freq.map(c => (
    '<div class="freq-row">' +
      '<span class="fq-name">' + c.name + '</span>' +
      '<div class="fq-bar-wrap"><div class="fq-bar" style="width:' + Math.max(6, (c.count / max) * 100) + '%"></div></div>' +
      '<span class="fq-count">' + c.count + '× · ' + fmtDate(c.last_seen) + '</span>' +
    '</div>'
  )).join("") + '</div>';
}

let qcDays = 30;
const INSIGHT_BOXES = ["qc-chart-wrap", "qc-insight-wrap", "qc-freq-wrap", "qc-ongoing-wrap"];
function paintInsights(data, scoreData) {
  // The score ALWAYS comes from the same 30-day view the Dashboard uses,
  // so the two pages can never disagree whatever range is selected here.
  const base = scoreData && scoreData.ok ? scoreData : data;
  const each = fn => { try { fn(); } catch (e) { /* one broken card must not blank the page */ } };
  each(() => renderRisk(base.risk));
  each(() => renderAlerts(base.alerts));
  each(() => renderOngoing(base.ongoing_conditions));
  each(() => renderCharts(data.vitals));
  each(() => renderCorrelations(data.correlations));
  each(() => renderFrequency(data.condition_frequency));
  each(() => renderPlan(data.action_plan));
  each(() => renderQuestions(data.doctor_questions));
  each(() => renderGaps(data.missing_data));
}
function setFresh(state) {
  const el = document.getElementById("qc-fresh");
  if (!el) return;
  el.className = "qc-fresh" + (state === "done" ? " done" : "");
  el.innerHTML = state === "done" ? '<i></i>Up to date' : '<i></i>Refreshing…';
  el.hidden = false;
  if (state === "done") setTimeout(() => { el.hidden = true; }, 2500);
}

let insightsSeq = 0;
async function loadInsights(days, force) {
  qcDays = days || qcDays;
  const seq = ++insightsSeq;                  // ignore an answer that a newer day-range click has overtaken
  // Paint the last known answer instantly (this tab only), then refresh quietly.
  const staleD = QC.stale("insights-" + qcDays), staleS = QC.stale("insights-30");
  const hadStale = !!(staleD && staleS && staleD.ok !== false);
  if (hadStale) { paintInsights(staleD, staleS); setFresh("busy"); }
  else INSIGHT_BOXES.forEach(id => { document.getElementById(id).innerHTML = QC.skeleton(3, 46); });
  try {
    const [data, scoreData] = await Promise.all([QC.insights(qcDays, force), QC.insights(30, force)]);
    if (seq !== insightsSeq) return;
    if (!data || data.ok === false) throw new Error("load failed");
    paintInsights(data, scoreData);
    setFresh("done");
  } catch (e) {
    if (seq !== insightsSeq || hadStale) { setFresh("done"); return; }
    INSIGHT_BOXES.forEach(id => {
      document.getElementById(id).innerHTML = '<div class="empty-note">Couldn\'t load this right now. <button type="button" class="btn-soft" data-act="reload-insights">Try again</button></div>';
    });
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

/* ================= CuraVault records intelligence ================= */
let qcRecords = null, recTab = "labs", recFlagged = false;
const ST_COLOR = { normal: "#0e8f83", borderline: "#c98a10", abnormal: "#d24f28", critical: "#b3182a" };
const CAT_COLOR = { urgent: "#b3182a", attention: "#d24f28", incidental: "#2f8fd1", normal: "#0e8f83", minor: "#2f8fd1", unclear: "#6b6885" };
const SEV_COLOR = { urgent: "#b3182a", attention: "#d24f28", watch: "#c98a10", info: "#2f8fd1" };
const MOD_ICON = { "MRI": "🧲", "CT": "🩻", "PET-CT": "☢️", "X-ray": "🦴", "Ultrasound": "🔊", "Mammography": "🎗️", "DEXA": "🦴", "Echocardiogram": "🫀" };
const OVERALL_WORD = { normal: "Normal", minor: "Minor findings", attention: "Review with doctor", urgent: "Needs prompt review", unclear: "Unclear" };

function statusWord(m) {
  if (m.status === "normal") return "Normal";
  const d = m.direction === "low" ? "low" : "high";
  return (m.status === "borderline" ? "Borderline " : m.status === "critical" ? "Critical " : "") + d;
}
function shortDate(d) { return d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : ""; }
function esc(s) { return QC.esc(s); }

function spark(values, color) {
  const sp = sparklinePath(values, 100, 34, 4);
  if (!sp) return values.length ? '<svg viewBox="0 0 100 34" width="100" height="34"><circle cx="50" cy="17" r="4" fill="' + color + '"/></svg>' : "";
  const last = sp.pts[sp.pts.length - 1];
  return '<svg viewBox="0 0 100 34" width="100" height="34"><path d="' + sp.d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + color + '"/></svg>';
}

function bigChart(m) {
  const pts = m.history.filter(h => h.value != null);
  const W = 560, H = 170, L = 44, R = 38, T = 16, B = 30;
  const lo = m.range.lo, hi = m.range.hi;
  const vals = pts.map(p => p.value).concat([lo, hi].filter(v => v != null));
  let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  const pad = (max - min || 1) * 0.18; min -= pad; max += pad;
  const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const x = i => pts.length === 1 ? (L + (W - L - R) / 2) : L + i * ((W - L - R) / (pts.length - 1));
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:640px;height:auto;display:block" role="img" aria-label="' + esc(m.name) + ' over time">';
  if (lo != null || hi != null) {
    const top = hi != null ? y(hi) : T, bot = lo != null ? y(lo) : H - B;
    svg += '<rect x="' + L + '" y="' + top.toFixed(1) + '" width="' + (W - L - R) + '" height="' + Math.max(2, bot - top).toFixed(1) + '" fill="#0e8f83" opacity="0.13" rx="4"/>';
    if (hi != null) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(hi).toFixed(1) + '" y2="' + y(hi).toFixed(1) + '" stroke="#0e8f83" stroke-dasharray="4 4" opacity="0.6"/><text x="' + (L - 6) + '" y="' + (y(hi) + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="currentColor" opacity="0.6">' + hi + '</text>';
    if (lo != null) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(lo).toFixed(1) + '" y2="' + y(lo).toFixed(1) + '" stroke="#0e8f83" stroke-dasharray="4 4" opacity="0.6"/><text x="' + (L - 6) + '" y="' + (y(lo) + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="currentColor" opacity="0.6">' + lo + '</text>';
  }
  if (pts.length > 1) svg += '<polyline fill="none" stroke="' + (ST_COLOR[m.status] || "#0e8f83") + '" stroke-width="2.4" stroke-linejoin="round" points="' + pts.map((p, i) => x(i).toFixed(1) + "," + y(p.value).toFixed(1)).join(" ") + '"/>';
  pts.forEach((p, i) => {
    const inR = (lo == null || p.value >= lo) && (hi == null || p.value <= hi);
    svg += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="5" fill="' + (inR ? "#0e8f83" : "#d24f28") + '" stroke="#fff" stroke-width="2"/>' +
      '<text x="' + x(i).toFixed(1) + '" y="' + (y(p.value) - 11).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">' + p.value + '</text>' +
      '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.55">' + esc(shortDate(p.date)) + '</text>';
  });
  return svg + '</svg>';
}

function labRowHtml(m) {
  const c = ST_COLOR[m.status] || ST_COLOR.normal;
  const vals = m.history.map(h => h.value);
  const trendCls = m.trend.direction === "improving" ? "improving" : m.trend.direction === "worsening" ? "worsening" : "";
  const arrow = m.trend.direction === "improving" ? "↘ " : m.trend.direction === "worsening" ? "↗ " : m.trend.direction === "new" ? "" : "→ ";
  return '<div class="lab-row" data-lab="' + esc(m.id) + '" tabindex="0" role="button" aria-expanded="false" style="--c:' + c + '">' +
    '<div><div class="lab-name">' + esc(m.name) + ' <span class="st" style="--c:' + c + '">' + statusWord(m) + '</span></div>' +
      '<div class="lab-val"><b>' + esc(m.latest.value) + '</b>' + esc(m.unit) + '<span class="lab-date">' + esc(shortDate(m.latest.date)) + '</span></div></div>' +
    '<div class="lab-viz"><div class="rbar"><i style="left:' + (m.position * 100).toFixed(1) + '%"></i></div><div class="rlabel">' + (m.range.label ? "Normal: " + esc(m.range.label) + (m.range.source === "report" ? " · from your lab report" : "") : "") + '</div></div>' +
    '<div class="lab-spark">' + spark(vals, c) + '</div>' +
    '<div class="lab-trend ' + trendCls + '">' + arrow + esc(String(m.trend.label).replace(/\d{4}-\d{2}-\d{2}/g, d => shortDate(d))) + '</div></div>' +
    '<div class="lab-detail" id="labd-' + esc(m.id) + '" hidden><p>' + esc(m.explanation) + '</p>' + bigChart(m) +
      '<div class="hist">' + m.history.map(h => '<span>' + esc(shortDate(h.date) || "undated") + ': ' + esc(h.value) + ' ' + esc(m.unit) + '</span>').join("") + '</div></div>';
}

function renderLabs(L) {
  if (!L || !L.has_data) {
    return '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt=""><div class="es-title">No confirmed lab results yet</div><div class="es-sub">Upload a blood report to CuraVault, check the values QueroCura read, and confirm them — then they appear here with ranges, trends and patterns.</div><button type="button" class="es-cta" data-href="../curavault/">Open CuraVault</button></div>';
  }
  const S = L.summary;
  let html = '<div class="sum-strip"><span class="sum-note">' + esc(S.headline) + '</span>' +
    ['critical', 'abnormal', 'borderline', 'normal'].filter(k => S[k]).map(k => '<span class="sum-chip" style="--c:' + ST_COLOR[k] + '">' + S[k] + ' ' + k + '</span>').join("") +
    '<label class="toggle-row"><input type="checkbox" id="rec-flagged"' + (recFlagged ? " checked" : "") + '> Only show what needs attention</label></div>';
  (L.patterns || []).forEach(p => {
    const c = SEV_COLOR[p.severity] || "#6b6885";
    html += '<div class="pat" style="--c:' + c + '"><h3>' + esc(p.title) + '</h3><p>' + esc(p.summary) + '</p>' +
      '<div class="ev-chips">' + (p.evidence || []).map(e => '<span class="ev-chip" style="--c:' + (ST_COLOR[e.status] || "#0e8f83") + '">' + esc(e.name) + ' ' + esc(e.value) + ' ' + esc(e.unit) + '</span>').join("") + '</div>' +
      ((p.next_steps || []).length ? '<details><summary>What could help</summary><ul>' + p.next_steps.map(t => '<li>' + esc(t) + '</li>').join("") + '</ul></details>' : '') + '</div>';
  });
  if ((L.derived || []).length) {
    html += '<div class="derived">' + L.derived.map(d => '<div class="dv"><small>' + esc(d.label) + '</small><b>' + esc(d.value) + ' <span style="display:inline;font:600 12px Manrope;opacity:.6">' + esc(d.unit) + '</span></b><span>' + esc(d.note) + '</span></div>').join("") + '</div>';
  }
  (L.panels || []).forEach(p => {
    const items = recFlagged ? p.markers.filter(m => m.status !== "normal") : p.markers;
    if (!items.length) return;
    html += '<div class="panel-h">' + esc(p.title) + (p.flagged ? '<span class="flag">' + p.flagged + ' to review</span>' : '') + '</div>' + items.map(labRowHtml).join("");
  });
  html += '<div class="limit">Reference ranges are standard adult ranges (or the range printed on your own report where available). Normal ranges vary between labs — your doctor interprets results in context. This is not a diagnosis.</div>';
  return html;
}

function followUpHtml(r) {
  return (r.follow_up_due || []).concat((r.follow_up || []).filter(f => !(r.follow_up_due || []).some(d => d.text === f.text))).slice(0, 3).map(f => {
    const kind = { repeat_imaging: "Repeat imaging", further_imaging: "Further imaging", biopsy_or_tissue: "Further tests", specialist: "Specialist review", clinical_correlation: "Clinical correlation", review: "Review" }[f.kind] || "Follow-up";
    const due = f.due_date ? (f.overdue ? '<b style="color:#d24f28">Was due ' + esc(shortDate(f.due_date)) + '</b>' : 'Due by <b>' + esc(shortDate(f.due_date)) + '</b>') : "";
    const link = f.suggest_date ? '<a class="es-cta" style="text-decoration:none;display:inline-block" href="../calendar/?new=1&type=followup&date=' + esc(f.suggest_date) + '&title=' + encodeURIComponent(kind + ": " + r.title) + '">📅 Add to calendar</a>' : '';
    return '<div class="fu' + (f.overdue ? " overdue" : "") + '"><span><b>' + kind + '</b> — ' + esc(f.text) + ' ' + due + '</span>' + link + '</div>';
  }).join("");
}

const LV_COLOR = { normal: "#0e8f83", info: "#2f8fd1", attention: "#d24f28", urgent: "#b3182a" };

function changeHtml(ch) {
  if (!ch) return "";
  const sizes = (ch.sizes || []).map(s => '<span class="chg-chip" style="--c:' + (s.direction === "larger" ? "#d24f28" : "#0e8f83") + '">' + esc(s.label) + ': ' + s.from_mm + ' → ' + s.to_mm + ' mm (' + (s.percent > 0 ? "+" : "") + s.percent + '%)</span>').join("");
  const chips = (ch.new || []).map(l => '<span class="chg-chip" style="--c:#d24f28">new: ' + esc(l) + '</span>').join("") +
    (ch.no_longer_mentioned || []).map(l => '<span class="chg-chip" style="--c:#0e8f83">no longer mentioned: ' + esc(l) + '</span>').join("");
  return '<div class="chg"><b>↔ Compared with ' + esc(shortDate(ch.since)) + '</b><span>' + esc(ch.headline || "") + '</span>' +
    ((sizes || chips) ? '<div class="chg-chips">' + sizes + chips + '</div>' : '') + '<small>' + esc(ch.note) + '</small></div>';
}

function rxHtml(rx) {
  if (!rx) return "";
  const head = [rx.prescriber ? "Dr. " + esc(rx.prescriber) : "", rx.date ? esc(rx.date) : "", rx.reason ? "for " + esc(rx.reason) : ""].filter(Boolean).join(" · ");
  const rows = (rx.medicines || []).map(m => {
    const bits = [m.strength, m.how_often, m.meal, m.duration_days ? m.duration_days + " day" + (m.duration_days === 1 ? "" : "s") : ""].filter(Boolean).map(esc).join(" · ");
    return '<div class="rx-line' + (m.check ? " check" : "") + '"><b>' + esc(m.name || "(unclear)") + '</b><span>' + (bits || "details not clear") + '</span>' +
      (m.check ? '<em>' + (m.missing && m.missing.length ? "couldn't read: " + esc(m.missing.join(", ")) : "low reading confidence") + ' — check against the original</em>' : '') + '</div>';
  }).join("");
  if (!head && !rows) return "";
  return '<div class="rx-card">' + (head ? '<div class="rx-head">' + head + '</div>' : '') + rows +
    (rx.follow_up ? '<div class="rx-fu">📅 ' + esc(rx.follow_up) + '</div>' : '') +
    '<small>' + (rx.confirmed ? "Confirmed by you in CuraVault." : "As read by QueroCura — confirm in CuraVault before it's used for reminders.") + '</small></div>';
}

function renderImaging(I) {
  if (!I || !I.reports.length) {
    return '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt=""><div class="es-title">No imaging reports yet</div><div class="es-sub">Upload an MRI, CT, X-ray or ultrasound <b>report</b> to CuraVault under “Scan / imaging”. QueroCura reads the written report and explains it in plain language.</div><button type="button" class="es-cta" data-href="../curavault/">Open CuraVault</button></div>';
  }
  const sm = I.summary;
  let html = '<div class="sum-strip"><span class="sum-note">' + sm.total + ' report' + (sm.total === 1 ? "" : "s") + '</span>' +
    (sm.attention ? '<span class="sum-chip" style="--c:#d24f28">' + sm.attention + ' with findings to review</span>' : '') + (sm.normal ? '<span class="sum-chip" style="--c:#0e8f83">' + sm.normal + ' normal</span>' : '') +
    (sm.followups_due ? '<span class="sum-chip" style="--c:#2f8fd1">' + sm.followups_due + ' follow-up due</span>' : '') + '</div>';
  I.reports.forEach(r => {
    const c = CAT_COLOR[r.overall] || "#6b6885";
    html += '<div class="img-card"><div class="img-head"><div class="img-ic">' + (MOD_ICON[r.modality] || "🩻") + '</div><div style="flex:1;min-width:0"><div class="img-title">' + esc(r.title) + '</div>' +
      '<div class="img-meta">' + esc((r.modality || "Imaging") + (r.regions.length ? " · " + r.regions.slice(0, 2).join(", ") : "") + (r.study_date ? " · " + shortDate(r.study_date) : "")) + '</div></div>' +
      '<span class="st" style="--c:' + c + '">' + (OVERALL_WORD[r.overall] || r.overall) + '</span></div>' +
      '<p class="img-sum">' + esc(r.summary) + '</p>' +
      (r.impression_text ? '<p class="img-sum" style="font-size:13px;opacity:.8"><b>Radiologist\'s impression:</b> ' + esc(r.impression_text.slice(0, 380)) + '</p>' : '') +
      changeHtml(r.change) +
      (r.scores || []).map(s => '<div class="find"><span class="st" style="--c:' + (LV_COLOR[s.level] || "#6b6885") + '">' + esc(s.system) + '</span><div><b>' + esc(s.label) + '</b><span class="ex">' + esc(s.meaning) + '</span></div></div>').join("") +
      r.key_findings.map(f => {
        const fc = CAT_COLOR[f.category] || "#6b6885";
        const bits = [f.uncertain ? "possible" : "", f.side || "", f.level || "", (f.measurements[0] && f.measurements[0].text) || ""].filter(Boolean);
        return '<div class="find"><span class="st" style="--c:' + fc + '">' + (f.category === "incidental" ? "minor" : f.category) + '</span><div><b>' + esc(f.label) + (bits.length ? ' <span style="font-weight:600;opacity:.6">· ' + esc(bits.join(" · ")) + '</span>' : '') + '</b><span class="ex">' + esc(f.explanation) + '</span></div></div>';
      }).join("") + followUpHtml(r) +
      '<div class="limit">' + (r.reading && r.reading.kind ? ({ handwriting: "✍ Read from handwriting", scanned: "📷 Read from a scan/photo", digital_pdf: "📄 Read from a digital PDF", text: "📄 Read from text" })[r.reading.kind] + (r.reading.confidence != null ? " · reading confidence " + Math.round(r.reading.confidence * 100) + "%" : "") + " · " : "") + (r.reviewed ? "reviewed" : "auto-read, please verify against the original") + ' · <a href="../curavault/">Open in CuraVault</a></div></div>';
  });
  html += '<div class="limit">' + esc(I.note || "") + ' Only your doctor can interpret findings in the context of your symptoms and history.</div>';
  return html;
}

function renderMeds(M) {
  let html = "";
  (M.safety || []).forEach(sf => {
    const c = SEV_COLOR[sf.severity] || "#c98a10";
    html += '<div class="pat" style="--c:' + c + '"><h3>' + (sf.severity === "urgent" ? "⚠️ " : "") + esc(sf.title) + '</h3><p>' + esc(sf.message) + '</p></div>';
  });
  if (!(M.active || []).length) {
    return html + '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt=""><div class="es-title">No active medicines on file</div><div class="es-sub">Upload a prescription (typed or handwritten) to CuraVault, confirm what was read, and your medicine list and reminders appear here.</div><button type="button" class="es-cta" data-href="../curavault/">Open CuraVault</button></div>';
  }
  html += (M.active || []).map(m => '<div class="med-row"><div class="mi">💊</div><div style="flex:1;min-width:0"><b>' + esc(m.name) + '</b>' + (m.dose ? ' <span style="opacity:.6">· ' + esc(m.dose) + '</span>' : '') + '<small>' + esc(m.schedule || "") + '</small></div></div>').join("");
  html += '<div class="limit">These come from prescriptions you confirmed in CuraVault. QueroCura never recommends or changes medicines — it only checks your list against your recorded allergies and for duplicates. Always follow your prescriber\'s and pharmacist\'s advice.</div>';
  return html;
}

function renderDocs(D, coverage) {
  let html = "";
  if (!D.total) return '<div class="empty-state"><img src="../assets/6abe27005847b6683a14deef5164e1c7.png" alt=""><div class="es-title">Your vault is empty</div><div class="es-sub">Add reports, prescriptions and scans to CuraVault and QueroCura will read them for you.</div><button type="button" class="es-cta" data-href="../curavault/">Open CuraVault</button></div>';
  const max = Math.max.apply(null, Object.values(D.by_category));
  html += '<div class="cat-bars">' + Object.keys(D.by_category).map(k => '<div class="cat-bar"><span>' + esc(k.replace(/_/g, " ")) + '</span><i style="width:' + Math.max(8, D.by_category[k] / max * 220) + 'px"></i><span style="width:auto;text-transform:none">' + D.by_category[k] + '</span></div>').join("") + '</div>';
  const STATE = { confirmed: ["Confirmed", "#0e8f83"], needs_review: ["Needs your review", "#c98a10"], read: ["Read by QueroCura", "#2f8fd1"], reading: ["Reading…", "#2f8fd1"], failed: ["Couldn't read", "#d24f28"], not_read: ["Not read yet", "#6b6885"] };
  const KIND = { handwriting: "✍ Handwriting", scanned: "📷 Scan/photo", digital_pdf: "📄 Digital PDF", text: "📄 Text" };
  html += D.items.map(i => {
    const st = STATE[i.state] || STATE.not_read;
    const conf = i.reading.confidence;
    return '<div class="doc-row"><div><b>' + esc(i.title) + '</b><br><small>' + esc((i.category || "").replace(/_/g, " ")) + (i.date ? " · " + esc(shortDate(i.date)) : "") +
      (i.found.markers ? " · " + i.found.markers + " markers found" : "") + (i.found.medicines ? " · " + i.found.medicines + " medicines found" : "") + (i.unreadable ? " · text hard to read" : "") + '</small></div>' +
      '<div class="doc-tags"><span class="st" style="--c:' + st[1] + '">' + st[0] + '</span>' +
      (i.reading.kind ? '<span class="st" style="--c:#6b6885">' + KIND[i.reading.kind] + (conf != null ? '<span class="conf-bar" style="--c:' + (conf < 0.75 ? "#c98a10" : "#0e8f83") + '"><i style="width:' + Math.round(conf * 100) + '%"></i></span>' : "") + '</span>' : '') +
      (i.state === "needs_review" ? '<a class="es-cta" style="text-decoration:none" href="../curavault/">Review</a>' : '') + '</div>' +
      (i.prescription ? '<div class="doc-extra">' + rxHtml(i.prescription) + '</div>' : '') +
      (i.tip ? '<div class="doc-extra"><div class="tip-box">📸 ' + esc(i.tip) + '</div></div>' : '') + '</div>';
  }).join("");
  return html;
}

function renderRecords() {
  const box = document.getElementById("rec-body");
  const R = qcRecords;
  if (!R || R.ok === false) { box.innerHTML = '<div class="empty-note">Couldn\'t load your CuraVault insights right now.</div>'; return; }
  document.getElementById("rec-sub").textContent = R.headline || "Lab reports, prescriptions and scans — read, checked against reference ranges and visualised.";
  let html = "";
  const pend = (R.labs && R.labs.pending_review) || 0;
  if (pend) html += '<div class="rec-banner"><span>📝 <b>' + pend + ' value' + (pend === 1 ? "" : "s") + '</b> QueroCura read from your documents ' + (pend === 1 ? "is" : "are") + ' waiting for your review. Only confirmed values are used here.</span><a href="../curavault/">Review now →</a></div>';
  const steps = (R.coverage || []).slice(0, 3);
  if (steps.length) html += '<div class="next-steps">' + steps.map(g => '<div class="ns ' + (g.priority === "high" ? "high" : "") + '"><span class="ns-ic">' + (g.icon || "💡") + '</span><div><b>' + esc(g.title) + '</b><span>' + esc(g.detail) + '</span><a href="' + esc(g.href) + '">' + esc(g.cta) + ' →</a></div></div>').join("") + '</div>';
  const tabs = [["labs", "🧪 Labs", R.labs.summary.total], ["imaging", "🩻 Imaging", R.imaging.summary.total], ["meds", "💊 Medicines", R.medicines.active.length], ["docs", "📄 Documents", R.documents.total]];
  html += '<div class="rec-tabs" role="tablist">' + tabs.map(t => '<button type="button" class="rec-tab' + (recTab === t[0] ? " on" : "") + '" role="tab" data-t="' + t[0] + '">' + t[1] + ' <span class="cnt">' + t[2] + '</span></button>').join("") + '</div>';
  html += recTab === "labs" ? renderLabs(R.labs) : recTab === "imaging" ? renderImaging(R.imaging) : recTab === "meds" ? renderMeds(R.medicines) : renderDocs(R.documents, R.coverage);
  box.innerHTML = html;
  box.querySelectorAll(".rec-tab").forEach(b => b.addEventListener("click", () => { recTab = b.getAttribute("data-t"); renderRecords(); }));
  const flag = document.getElementById("rec-flagged"); if (flag) flag.addEventListener("change", () => { recFlagged = flag.checked; renderRecords(); });
  box.querySelectorAll(".lab-row").forEach(row => {
    const toggle = () => { const d = document.getElementById("labd-" + row.getAttribute("data-lab")); const open = d.hidden; d.hidden = !open; row.classList.toggle("open", open); row.setAttribute("aria-expanded", open); };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
}

async function loadRecords(force) {
  const stale = QC.stale("records");
  const box = document.getElementById("rec-body");
  if (stale && stale.ok !== false) { qcRecords = stale; renderRecords(); }
  else box.innerHTML = QC.skeleton(3, 52);
  const fresh = await QC.records(force);
  if (fresh && fresh.ok !== false) { qcRecords = fresh; renderRecords(); }
  else if (!stale) { qcRecords = null; renderRecords(); }
}

function setTodayChrome() {
  document.getElementById("qc-today").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

document.getElementById("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../";
});

(async function init() {
  // Start loading the page's data immediately; the sign-in check below runs alongside it
  // (an expired session gets a 401 and the redirect below fires), so nothing waits in line.
  setTodayChrome();
  initDaySelect();
  loadInsights(qcDays);
  loadRecords();
  const [meData, profResult] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../login/"; return; }
  const user = meData.user;
  if (profResult && profResult.ok && profResult.profile && !profResult.profile.wizard_done) {
    window.location.href = "../onboarding/";
    return;
  }
  const profile = (profResult && profResult.ok && profResult.profile) ? profResult.profile : null;
  const name = (profile && profile.display_name) || user.display_name || user.username || user.email || "";
  const initials = name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  document.getElementById("qc-user-dot").textContent = initials;
  document.getElementById("qc-user-name").textContent = name ? name.split(" ")[0] : "";
})();


document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('[data-act="reload-insights"]')) loadInsights(qcDays, true);
});
