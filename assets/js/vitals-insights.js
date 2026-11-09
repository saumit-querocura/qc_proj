/* Vitals page: "Your readings, understood".
 * GET /api/vitals/insights?tz=<minutes east of UTC> reads the readings saved here and in CuraVault, and returns
 * attention items (including readings that matter together, like fever with low oxygen), each measure against the usual
 * range and the person's own usual, blood-pressure averages, morning vs evening, weight change, how a fever is going,
 * a rough HbA1c from sugar readings, and which of the last 14 days had a reading.
 * Re-renders after a reading is saved ("qc-vitals-saved", sent by vitals-2.js). */
(function () {
  "use strict";
  var API = "https://app.querocura.com/api";
  var TONE = { urgent: "Needs care now", warn: "Worth acting on", watch: "Keep an eye on", info: "", good: "Looks fine" };
  var ICON = { bp: "❤️", heart_rate: "💓", spo2: "🫁", temperature_c: "🌡️", blood_glucose_mgdl: "🩸", weight_kg: "⚖️", respiratory_rate: "🌬️" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function num(v, key) { if (v == null) return "—"; var whole = key !== "temperature_c" && key !== "weight_kg"; return whole ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1); }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString([], { day: "numeric", month: "short" }); }
  function ago(n) { return n === 0 ? "today" : n === 1 ? "yesterday" : n + " days ago"; }

  /* One measure over time: a 2px line, the usual range as a soft band, the latest point marked, a hover title per point. */
  function spark(points, key, usual, own) {
    var W = 260, H = 64, P = 6;
    var series = key === "bp" ? [points.map(function (p) { return p.systolic; }), points.map(function (p) { return p.diastolic; })] : [points.map(function (p) { return p.value; })];
    var all = [].concat.apply([], series);
    if (usual) { if (key === "bp") all.push(usual.systolic, usual.diastolic); else all.push(usual.low, usual.high); }
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    var n = points.length, x = function (i) { return n === 1 ? W / 2 : P + i * (W - 2 * P) / (n - 1); }, y = function (v) { return H - P - (v - lo) * (H - 2 * P) / (hi - lo); };
    var svg = '<svg class="vi-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Trend of the last ' + n + ' readings">';
    if (usual && key !== "bp") svg += '<rect class="vi-band" x="0" width="' + W + '" y="' + y(usual.high) + '" height="' + Math.max(1, y(usual.low) - y(usual.high)) + '"/>';
    if (usual && key === "bp") svg += '<line class="vi-ref" x1="0" x2="' + W + '" y1="' + y(130) + '" y2="' + y(130) + '"/><line class="vi-ref" x1="0" x2="' + W + '" y1="' + y(80) + '" y2="' + y(80) + '"/>';
    if (own != null) svg += '<line class="vi-own" x1="0" x2="' + W + '" y1="' + y(own) + '" y2="' + y(own) + '"/>';
    series.forEach(function (s, k) {
      svg += '<polyline class="vi-line' + (k ? " alt" : "") + '" points="' + s.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); }).join(" ") + '"/>';
      s.forEach(function (v, i) {
        var p = points[i], label = (key === "bp" ? p.systolic + "/" + p.diastolic : num(v, key)) + " · " + day(p.at);
        svg += '<circle class="vi-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="7"><title>' + esc(label) + "</title></circle>";
      });
      svg += '<circle class="vi-dot' + (k ? " alt" : "") + '" cx="' + x(n - 1).toFixed(1) + '" cy="' + y(s[n - 1]).toFixed(1) + '" r="4"/>';
    });
    return svg + "</svg>";
  }

  function tile(m) {
    var g = m.grade || {}, latest = m.key === "bp" ? m.latest.systolic + "/" + m.latest.diastolic : num(m.latest.value, m.key);
    var pts = (m.points || []).slice(-20);
    var h = '<article class="vi-tile tone-' + esc(g.tone || "info") + '"><div class="vi-top"><span class="vi-ic" aria-hidden="true">' + (ICON[m.key] || "•") + '</span><div class="vi-name">' + esc(m.name) +
      '<small>' + esc(m.count) + " reading" + (m.count === 1 ? "" : "s") + " · last " + esc(ago(m.days_since || 0)) + '</small></div>' +
      (g.label ? '<span class="vi-chip tone-' + esc(g.tone) + '">' + esc(g.label) + "</span>" : "") + "</div>" +
      '<div class="vi-val">' + esc(latest) + "<small>" + esc(m.unit) + "</small></div>";
    if (pts.length >= 2) h += spark(pts, m.key, m.usual, m.key === "bp" ? null : m.own_usual) + (m.key === "bp" ? '<div class="vi-key"><span><i></i>top</span><span><i class="alt"></i>bottom</span><span><i class="ref"></i>130/80</span></div>' : '<div class="vi-key"><span><i class="band"></i>usual range</span>' + (m.own_usual != null ? '<span><i class="own"></i>your usual ' + esc(num(m.own_usual, m.key)) + "</span>" : "") + "</div>");
    var lines = [];
    if (m.key === "bp") {
      if (m.average) lines.push(m.average.sentence);
      if (m.time_of_day) lines.push(m.time_of_day.sentence);
      if (m.in_range) lines.push(m.in_range.text);
      if (!m.average && g.text) lines.push(g.text);
    } else {
      if (m.change && m.change.sentence) lines.push(m.change.sentence);
      else if (m.sentence) lines.push(m.sentence);
      if (m.month) lines.push("Average this month " + num(m.month["this"], m.key) + " " + m.unit + ", last month " + num(m.month.last, m.key) + ".");
      if (g.text && g.tone !== "good" && (m.days_since || 0) <= 3) lines.push(g.text);
    }
    if (m.in_range) h += '<div class="vi-meter" role="img" aria-label="' + esc(m.in_range.percent) + '% of readings under 130/80"><i style="width:' + m.in_range.percent + '%"></i></div>';
    h += lines.length ? '<ul class="vi-lines">' + lines.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "";
    return h + "</article>";
  }

  function render(d) {
    var attn = el("vi-attn"), card = el("vi-card");
    if (!d || d.ok === false) { card.hidden = true; attn.innerHTML = ""; return; }
    attn.innerHTML = (d.attention || []).map(function (a) {
      return '<div class="vi-alert tone-' + esc(a.tone) + '" role="' + (a.tone === "urgent" ? "alert" : "note") + '"><b>' + (a.tone === "urgent" ? "⚠️ " : a.tone === "warn" ? "🟠 " : "🔵 ") + esc(TONE[a.tone] || "Worth a look") + "</b><span>" + esc(a.text) + "</span></div>";
    }).join("");
    card.hidden = false;
    if (!d.has_data) {
      card.innerHTML = '<h2>📈 Your readings, understood</h2><p class="vi-empty">Save a few readings and this fills in: your own usual levels, blood-pressure averages the way clinics read them, how a fever is going, and changes worth telling a doctor about.</p>';
      return;
    }
    var src = d.sources || {}, c = d.consistency || {};
    var h = '<div class="vi-head"><h2>📈 Your readings, understood</h2><span class="vi-src">' + esc(d.summary.readings) + " readings" + (src.curavault ? ", including " + esc(src.curavault) + " from CuraVault" : "") + "</span></div>";
    h += '<div class="vi-days" aria-label="' + esc(c.text) + '">' + (c.days || []).map(function (x) {
      var dt = new Date(x.date + "T12:00:00");
      return '<span class="vi-day' + (x.logged ? " on" : "") + '" title="' + esc(dt.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })) + (x.logged ? " · logged" : " · no reading") + '"><i></i><small>' + esc(dt.toLocaleDateString([], { weekday: "narrow" })) + "</small></span>";
    }).join("") + '<span class="vi-days-text">' + esc(c.text) + "</span></div>";
    if (d.fever) h += '<div class="vi-callout tone-' + esc(d.fever.tone) + '"><b>🌡️ ' + (d.fever.broken ? "Fever coming down" : "Fever: day " + esc(d.fever.days)) + "</b><span>" + esc(d.fever.text) + "</span></div>";
    var ms = (d.measures || []).map(function (m) { if (m.key === "bp" && d.bp_in_range) m.in_range = d.bp_in_range; return m; });
    h += '<div class="vi-grid">' + ms.map(tile).join("") + "</div>";
    if (d.glucose) h += '<div class="vi-callout tone-info"><b>🩸 Your sugar average as an HbA1c: about ' + esc(d.glucose.hba1c) + "%</b><span>" + esc(d.glucose.text) + "</span></div>";
    if ((d.habits || []).length) h += '<div class="vi-habits"><b>For a clearer picture</b><ul>' + d.habits.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    h += '<p class="vi-note">' + esc(d.note || "") + "</p>";
    card.innerHTML = h;
  }

  function load() {
    var tz = -new Date().getTimezoneOffset();
    return fetch(API + "/vitals/insights?tz=" + tz, { credentials: "include" }).then(function (r) { return r.json(); }).then(render).catch(function () { el("vi-card").hidden = true; });
  }
  document.addEventListener("qc-vitals-saved", load);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
