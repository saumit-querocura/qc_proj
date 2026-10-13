/* QueroCura personal health intelligence (front end).
 * Reads /insights/intelligence (personal baselines, robust trends, step changes, unusual readings, patterns) and draws
 * the pieces Dashboard and Insights share:
 *   QCIntel.get(days, force)            -> Promise<data> (cached for this tab, like QC.insights)
 *   QCIntel.read(el, data, opts)        "Cura's read": the headline and the findings, each with its evidence
 *   QCIntel.metrics(el, data, opts)     one card per measurement with the interactive chart (needs qc-charts.js)
 *   QCIntel.derived(el, data)           BP category from the recent average, MAP, pulse pressure
 *   QCIntel.quality(el, data)           how much data sits behind all of this, and how to sharpen it
 *   QCIntel.tile(data, key)             {usual, spark, status} for a vitals tile
 */
(function () {
  "use strict";
  var API = "https://app.querocura.com/api";
  var SWR = "qc-swr:";
  var mem = {};
  function hi() { return !!(window.QCI18n && window.QCI18n.lang === "hi"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var COLOR = { sys_bp: "#e2654a", dia_bp: "#f0a07a", pulse: "#d6457a", spo2: "#2f8fd1", temp: "#d9961c", glucose: "#7c6fdb", weight: "#0e8f83" };
  var ICON = { sys_bp: "❤️", dia_bp: "❤️", pulse: "💓", spo2: "🫁", temp: "🌡️", glucose: "🩸", weight: "⚖️" };
  var KIND_IC = { unusual: "🎯", trend: "📈", step: "⚡", usual_out: "📏", tod: "🕐", variability: "〰️", correlation: "🔗", symptom_link: "🤒", steady: "✅" };
  var SEV = { caution: "Worth acting on", watch: "Worth watching", info: "Good to know", good: "Looking good" };

  function key(days) { return "intel-" + days + "-" + (hi() ? "hi" : "en"); }
  function sget(k) { try { var v = JSON.parse(sessionStorage.getItem(SWR + k)); if (v && Date.now() - v.t < 600000) return v.d; } catch (e) {} return null; }
  function sset(k, d) { try { sessionStorage.setItem(SWR + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }

  function get(days, force) {
    days = days || 30;
    var k = key(days);
    if (!force && mem[k] && Date.now() - mem[k].t < 20000) return mem[k].p;
    var p = fetch(API + "/insights/intelligence?days=" + days + "&lang=" + (hi() ? "hi" : "en"), { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) sset(k, d); return d; }, function () { return null; });
    mem[k] = { t: Date.now(), p: p };
    return p;
  }

  function nice(ts, time) {
    var d = new Date(String(ts).replace(" ", "T"));
    if (isNaN(d)) return ts;
    var s = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return time && String(ts).length > 10 ? s + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : s;
  }

  function conf(c) {
    var n = c === "high" ? 3 : c === "moderate" ? 2 : 1;
    return '<span class="qi-conf" title="' + esc(c === "high" ? "High confidence" : c === "moderate" ? "Moderate confidence" : "Low confidence") + '">' +
      [1, 2, 3].map(function (i) { return "<i" + (i <= n ? ' class="on"' : "") + "></i>"; }).join("") + "</span>";
  }

  function finding(x, i, o) {
    return '<div class="qi-f sev-' + esc(x.severity) + '"><div class="qi-f-ic">' + (KIND_IC[x.kind] || "💡") + '</div><div class="qi-f-b"><div class="qi-f-t"><b>' + esc(x.title) + "</b>" + conf(x.confidence) + "</div>" +
      (o.compact ? '<details class="qi-f-more"' + (i === 0 ? " open" : "") + "><summary>" + esc(SEV[x.severity] || "") + "</summary>" : '<div class="qi-f-sev">' + esc(SEV[x.severity] || "") + "</div>") +
      '<div class="qi-f-d">' + esc(x.detail) + "</div>" +
      ((x.evidence || []).length ? '<div class="qi-ev">' + x.evidence.map(function (e) { return "<span>" + esc(e) + "</span>"; }).join("") + "</div>" : "") +
      (o.compact ? "</details>" : "") + "</div></div>";
  }

  function read(el, d, o) {
    if (!el) return;
    o = o || {};
    if (!d || !d.ok) { el.innerHTML = '<div class="qi-empty">Couldn\'t load Cura\'s read right now.</div>'; return; }
    var f = (d.findings || []).filter(function (x) { return !o.kinds || o.kinds.indexOf(x.kind) >= 0; });
    var limit = o.limit || f.length;
    if (o.bare) {
      el.innerHTML = f.length ? '<div class="qi-read"><div class="qi-findings">' + f.slice(0, limit).map(function (x) { return finding(x, 1, o); }).join("") + "</div></div>" : "";
      return;
    }
    var lv = d.level || "none";
    var h = '<div class="qi-read qi-' + esc(lv) + '"><div class="qi-read-h"><span class="qi-brain" aria-hidden="true"><i></i><i></i><i></i></span><div class="qi-read-t"><div class="qi-eyebrow">Cura\'s read · last ' + d.days + ' days</div>' +
      '<div class="qi-headline">' + esc(d.headline) + "</div></div>" +
      (o.methods !== false ? '<button type="button" class="qi-how" aria-expanded="false">How Cura works this out</button>' : "") + "</div>";
    if (o.methods !== false) h += '<div class="qi-methods" hidden><p>Cura compares each reading with <b>your own normal</b>, not just textbook ranges. Your usual range is the middle of your past readings (median and spread, so one odd reading can\'t distort it).</p>' +
      "<ul><li><b>Trends</b> use the Theil–Sen slope (the median of every pair of readings, so one outlier can't fake a trend) and the Mann–Kendall test for how likely the pattern is to be chance. A trend is only reported when it is both clear and big enough to matter.</li>" +
      "<li><b>Step changes</b> are reported only when a sudden shift explains your readings much better than a gradual drift.</li>" +
      "<li><b>Unusual readings</b> are at least three typical spreads away from your usual.</li>" +
      "<li><b>Patterns</b> (time of day, signals that move together, readings around your symptom checks) need enough readings on each side.</li></ul>" +
      "<p>It is a careful summary of your own numbers, not a diagnosis. Safety alerts based on standard ranges still apply on their own.</p></div>";
    if (!f.length) h += '<div class="qi-empty">' + (d.has_data ? "Nothing stands out yet. Keep logging and Cura will spot trends as they form." : "No readings in this window yet.") + "</div>";
    h += '<div class="qi-findings">' + f.slice(0, limit).map(function (x, i) { return finding(x, i, o); }).join("") + "</div>";
    if (f.length > limit && o.more) h += '<a class="qi-more" href="' + esc(o.more) + '">See all ' + f.length + " findings →</a>";
    h += "</div>";
    el.innerHTML = h;
    var how = el.querySelector(".qi-how");
    if (how) how.onclick = function () { var m = el.querySelector(".qi-methods"); m.hidden = !m.hidden; how.setAttribute("aria-expanded", String(!m.hidden)); };
  }

  function statusChip(m) {
    var map = { usual: ["Usual for you", "ok"], above_usual: ["Above your usual", "warn"], below_usual: ["Below your usual", "warn"], unusual_high: ["Unusual for you", "bad"], unusual_low: ["Unusual for you", "bad"] };
    var s = map[m.status] || map.usual;
    if (m.baseline.learning) s = ["Learning your normal", "learn"];
    return '<span class="qi-chip ' + s[1] + '">' + esc(s[0]) + "</span>";
  }

  function trendChip(m) {
    var t = m.trend;
    if (!t) return "";
    if (t.confidence === "none") return '<span class="qi-stat"><small>Trend</small><b>→ steady</b></span>';
    var arrow = t.direction === "rising" ? "↗" : "↘";
    return '<span class="qi-stat' + (t.confidence === "clear" ? " strong" : "") + '"><small>Trend · ' + (t.confidence === "clear" ? "clear" : "possible") + '</small><b>' + arrow + " " + (t.slope_week > 0 ? "+" : "") + t.slope_week + " " + esc(m.unit) + "/wk</b><em>" + (t.p < 0.001 ? "p < 0.001" : "p = " + t.p) + "</em></span>";
  }

  function metricCard(d, k) {
    var m = d.metrics[k];
    var bp = k === "sys_bp" && d.metrics.dia_bp;
    var b = m.baseline;
    var lab = bp ? (hi() ? "रक्तचाप" : "Blood pressure") : m.label;
    var latest = bp ? m.latest.v + "/" + (d.metrics.dia_bp.latest.v) : m.latest.v;
    var usual = bp ? b.lo + "–" + b.hi + " / " + d.metrics.dia_bp.baseline.lo + "–" + d.metrics.dia_bp.baseline.hi : b.lo + "–" + b.hi;
    var h = '<div class="qi-m" data-k="' + esc(k) + '"><div class="qi-m-h"><span class="qi-m-ic" style="--c:' + COLOR[k] + '">' + ICON[k] + "</span><b>" + esc(lab) + "</b>" + statusChip(m) + "</div>" +
      '<div class="qi-m-v"><span class="big">' + esc(latest) + '</span><span class="u">' + esc(m.unit) + '</span><span class="qi-m-when">' + esc(nice(m.latest.ts, true)) + "</span></div>" +
      '<div class="qi-m-usual">Your usual: <b>' + esc(usual) + " " + esc(m.unit) + "</b> · " + m.n + " reading" + (m.n === 1 ? "" : "s") + (b.learning ? " · still learning" : "") + "</div>" +
      '<div class="qi-chart"></div><div class="qi-stats">' + trendChip(m);
    if (m.step) h += '<span class="qi-stat strong"><small>Changed ' + esc(nice(m.step.ts)) + "</small><b>" + m.step.before + " → " + m.step.after + "</b></span>";
    if (m.variability) h += '<span class="qi-stat' + (m.variability.high ? " strong" : "") + '"><small>Varies</small><b>± ' + m.variability.sd + "</b></span>";
    if (m.tod && m.tod.meaningful) h += '<span class="qi-stat strong"><small>Higher in the</small><b>' + esc(m.tod.high) + " (+" + m.tod.diff + ")</b></span>";
    if (m.in_range_pct != null && !b.learning) h += '<span class="qi-stat"><small>In your usual</small><b>' + m.in_range_pct + "%</b></span>";
    if (m.anomalies && m.anomalies.length) h += '<span class="qi-stat strong"><small>Unusual</small><b>' + m.anomalies.length + "</b></span>";
    h += "</div>";
    if (m.forecast) h += '<div class="qi-fc">↗ If this trend continues: about <b>' + m.forecast.v + " " + esc(m.unit) + "</b> in a week (likely " + m.forecast.lo + "–" + m.forecast.hi + ")" +
      (m.forecast.cross ? ", reaching " + m.forecast.cross.thr + " in about " + m.forecast.cross.days + " days" : "") + ".</div>";
    return h + "</div>";
  }

  function metrics(el, d, o) {
    if (!el) return;
    o = o || {};
    if (!d || !d.ok) { el.innerHTML = '<div class="qi-empty">Couldn\'t load your trends right now.</div>'; return; }
    var keys = (d.order || []).filter(function (k) { return k !== "dia_bp" || !d.metrics.sys_bp; });
    if (!keys.length) {
      el.innerHTML = '<div class="qi-empty-state"><div class="ic">📈</div><b>No readings in this window yet</b><span>Log a few vitals and Cura will learn your normal and chart how you are moving against it.</span><a class="qi-btn" href="../vitals/">Add a reading</a></div>';
      return;
    }
    el.innerHTML = '<div class="qi-mgrid">' + keys.map(function (k) { return metricCard(d, k); }).join("") + "</div>";
    [].forEach.call(el.querySelectorAll(".qi-m"), function (card) {
      var k = card.getAttribute("data-k"), m = d.metrics[k], dia = k === "sys_bp" ? d.metrics.dia_bp : null;
      window.QCChart && QCChart.line(card.querySelector(".qi-chart"), {
        series: m.series, series2: dia ? dia.series : null, band: m.baseline.learning ? null : { lo: m.baseline.lo, hi: m.baseline.hi },
        band2: dia && !dia.baseline.learning ? { lo: dia.baseline.lo, hi: dia.baseline.hi } : null, pop: m.pop, forecast: m.forecast, step: m.step,
        anomalies: (m.anomalies || []).map(function (a) { return a.ts; }), unit: m.unit, color: COLOR[k], color2: COLOR.dia_bp, label: m.label, height: o.height || 180, dec: k === "temp" || k === "weight" ? 1 : 0
      });
    });
  }

  function derived(el, d) {
    if (!el) return;
    var x = (d && d.derived) || {};
    var parts = [];
    if (x.bp_category) {
      var order = ["normal", "elevated", "stage1", "stage2"], i = order.indexOf(x.bp_category.key);
      parts.push('<div class="qi-d qi-bpcat"><small>Blood pressure category</small><b class="c-' + esc(x.bp_category.key) + '">' + esc(x.bp_category.label) + "</b>" +
        '<div class="qi-scale">' + order.map(function (k, j) { return '<i class="s' + j + (j === i ? " on" : "") + '"></i>'; }).join("") + "</div>" +
        "<span>" + esc(x.bp_category.note) + " (" + esc(x.bp_category.standard) + ")</span></div>");
    }
    if (x.map) parts.push('<div class="qi-d"><small>Mean arterial pressure</small><b>' + x.map.v + " <em>" + esc(x.map.unit) + "</em></b><span>" + esc(x.map.note) + "</span></div>");
    if (x.pulse_pressure) parts.push('<div class="qi-d' + (x.pulse_pressure.wide ? " warn" : "") + '"><small>Pulse pressure</small><b>' + x.pulse_pressure.v + " <em>" + esc(x.pulse_pressure.unit) + "</em></b><span>" + esc(x.pulse_pressure.note) + "</span></div>");
    el.innerHTML = parts.length ? '<div class="qi-dgrid">' + parts.join("") + "</div>" : '<div class="qi-empty">Log blood pressure (both numbers) a couple of times to see your category, mean arterial pressure and pulse pressure.</div>';
  }

  function quality(el, d) {
    if (!el || !d || !d.quality) return;
    var q = d.quality, days = q.window_days, set = {};
    (q.calendar || []).forEach(function (x) { set[x] = 1; });
    var cells = [];
    for (var i = days - 1; i >= 0; i--) {
      var dt = new Date(Date.now() - i * 86400000);
      var k = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
      cells.push('<i class="' + (set[k] ? "on" : "") + '" title="' + esc(dt.toLocaleDateString()) + '"></i>');
    }
    el.innerHTML = '<div class="qi-q"><div class="qi-q-stats"><span><b>' + q.readings + "</b>readings</span><span><b>" + q.days_logged + "/" + days + "</b>days logged</span><span><b>" + q.streak + "</b>day streak</span><span><b>" + esc(q.regularity_label) + "</b>how often</span></div>" +
      '<div class="qi-cal' + (days > 45 ? " dense" : "") + '" aria-label="Days with a reading">' + cells.join("") + "</div>" +
      (q.tips.length ? '<ul class="qi-tips">' + q.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
  }

  function tile(d, k) {
    var m = d && d.metrics && d.metrics[k];
    if (!m) return null;
    var vals = (m.series || []).map(function (p) { return p[1]; });
    return {
      usual: m.baseline.learning ? null : m.baseline.lo + "–" + m.baseline.hi,
      status: m.status, learning: m.baseline.learning,
      spark: window.QCChart ? QCChart.spark(vals.slice(-14), COLOR[k], { band: m.baseline.learning ? null : { lo: m.baseline.lo, hi: m.baseline.hi } }) : "",
      trend: m.trend && m.trend.confidence !== "none" ? m.trend : null
    };
  }

  window.QCIntel = { get: get, read: read, metrics: metrics, derived: derived, quality: quality, tile: tile, stale: function (days) { return sget(key(days || 30)); }, COLOR: COLOR };
})();
