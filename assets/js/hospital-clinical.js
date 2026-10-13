/* QueroCura for Hospitals: bedside observations, NEWS2 and the clinical safety net, inside a patient's visit.
 * Used by hospital-ops.js through window.QCClin:
 *   QCClin.section(visit)       observations + "clinical checks" block for the visit modal
 *   QCClin.after(visit)         loads the checks once the block is on screen
 *   QCClin.click(event, visit)  handles clicks inside the block (returns true when it did)
 *   QCClin.badge(news)          small NEWS2 pill for queue cards, beds and lists
 *   QCClin.watch(board)         the "who to see first" list and bed forecast for the command centre
 * Scores are computed on the server; the live preview while typing uses the same NEWS2 chart so the nurse sees the
 * score before saving.
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function can(p) { return H().can(p); }
  function toast(m, k) { H().P.toast(m, k); }
  function clock(ts) { return ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; }
  function ago(ts) { var m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.floor(m / 60) + " h ago" : Math.floor(m / 1440) + " d ago"; }
  var BAND = { low: ["Low", "lo"], low_single: ["Low–medium", "ls"], medium: ["Medium", "md"], high: ["High", "hi"] };
  var AVPU = [["A", "Alert"], ["C", "New confusion"], ["V", "Voice"], ["P", "Pain"], ["U", "Unresponsive"]];

  /* the NEWS2 chart, mirrored from the server for the live preview only */
  function news2(o) {
    var p = {}, s = o.spo2;
    if (o.rr != null) p.rr = o.rr <= 8 ? 3 : o.rr <= 11 ? 1 : o.rr <= 20 ? 0 : o.rr <= 24 ? 2 : 3;
    if (s != null) {
      if (o.scale2) p.spo2 = o.o2 && s >= 93 ? (s <= 94 ? 1 : s <= 96 ? 2 : 3) : (s <= 83 ? 3 : s <= 85 ? 2 : s <= 87 ? 1 : 0);
      else p.spo2 = s <= 91 ? 3 : s <= 93 ? 2 : s <= 95 ? 1 : 0;
    }
    if (s != null || o.o2) p.air = o.o2 ? 2 : 0;
    if (o.sbp != null) p.sbp = o.sbp <= 90 ? 3 : o.sbp <= 100 ? 2 : o.sbp <= 110 ? 1 : o.sbp <= 219 ? 0 : 3;
    if (o.hr != null) p.hr = o.hr <= 40 ? 3 : o.hr <= 50 ? 1 : o.hr <= 90 ? 0 : o.hr <= 110 ? 1 : o.hr <= 130 ? 2 : 3;
    if (o.avpu) p.avpu = o.avpu === "A" ? 0 : 3;
    if (o.temp != null) p.temp = o.temp <= 35 ? 3 : o.temp <= 36 ? 1 : o.temp <= 38 ? 0 : o.temp <= 39 ? 1 : 2;
    var total = 0, single = false, n = 0;
    Object.keys(p).forEach(function (k) { total += p[k]; n++; if (p[k] === 3) single = true; });
    return { score: total, parts: p, measured: n, band: total >= 7 ? "high" : total >= 5 ? "medium" : single ? "low_single" : "low" };
  }

  function badge(n) {
    if (!n || n.news2 == null) return "";
    var b = BAND[n.band] || BAND.low;
    return '<span class="news ' + b[1] + (n.rising ? " up" : "") + '" title="NEWS2 ' + n.news2 + " · " + b[0] + (n.rising ? " · rising" : "") + '">N' + n.news2 + (n.rising ? "↑" : "") + "</span>";
  }

  function trendSvg(series) {
    if (!series || series.length < 2) return "";
    var w = 160, h = 40, mx = Math.max.apply(null, series.map(function (p) { return p[1]; }).concat([7]));
    var X = function (i) { return 4 + i * (w - 8) / (series.length - 1); }, Y = function (v) { return h - 4 - v / mx * (h - 8); };
    return '<svg class="news-trend" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-label="NEWS2 over time">' +
      '<rect x="0" y="' + Y(mx) + '" width="' + w + '" height="' + (Y(7) - Y(mx)) + '" class="z-hi"/><rect x="0" y="' + Y(7) + '" width="' + w + '" height="' + (Y(5) - Y(7)) + '" class="z-md"/>' +
      '<path d="' + series.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ") + '" />' +
      series.map(function (p, i) { return '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.4"/>'; }).join("") + "</svg>";
  }

  function section(x) {
    if (x.obs === undefined && !x.can_record_obs) return "";
    var o = x.obs || {}, L = o.latest, h = '<div class="ops-sec clin"><div class="ops-h">Observations &amp; early warning</div>';
    if (o.caveat) h += '<div class="notice wait">' + esc(o.caveat) + "</div>";
    if (L) {
      var n = L.news2, b = BAND[n.band];
      h += '<div class="news-card ' + b[1] + '"><div class="news-score"><b>' + n.score + '</b><span>NEWS2</span></div><div class="grow"><div class="news-band">' + esc(n.band_label) + " clinical risk" +
        (o.trend && o.trend.deteriorating ? ' <span class="pill bad">rising ↑ ' + o.trend.rise_24h + " in 24 h</span>" : o.trend && o.trend.direction === "down" ? ' <span class="pill ok">improving ↓</span>' : "") + "</div>" +
        '<div class="news-resp">' + esc(n.response) + "</div>" +
        '<div class="mini">' + (n.complete ? "All 7 parameters" : "From " + n.measured + " of 7 parameters: complete the set") + " · " + clock(L.ts) + " by " + esc(L.by || "") +
        " · next set " + (o.overdue ? '<b class="late">overdue</b>' : "due in " + (o.due_in_min < 60 ? o.due_in_min + " min" : Math.round(o.due_in_min / 60) + " h")) + "</div></div>" + trendSvg(o.series) + "</div>";
      var q = L.qsofa;
      h += '<div class="obs-strip">' + [["RR", L.rr, "/min", "rr"], ["SpO₂", L.spo2 != null ? L.spo2 + (L.o2 ? " (O₂)" : "") : null, "%", "spo2"], ["BP", L.sbp != null ? L.sbp + (L.dbp ? "/" + L.dbp : "") : null, "", "sbp"],
        ["HR", L.hr, "/min", "hr"], ["ACVPU", L.avpu, "", "avpu"], ["Temp", L.temp, "°C", "temp"], ["CBG", L.cbg, "mg/dL", null], ["Pain", L.pain, "/10", null]].filter(function (v) { return v[1] != null; }).map(function (v) {
          var pt = v[3] ? n.parts[v[3]] : null;
          return '<span class="obs' + (pt >= 3 ? " p3" : pt === 2 ? " p2" : pt === 1 ? " p1" : "") + '"><small>' + v[0] + "</small><b>" + esc(v[1]) + "</b>" + (v[2] ? "<i>" + v[2] + "</i>" : "") + (pt ? '<em>+' + pt + "</em>" : "") + "</span>";
        }).join("") +
        (q ? '<span class="obs' + (q.positive ? " p3" : "") + '"><small>qSOFA</small><b>' + q.score + "</b>" + (q.measured < 3 ? "<i>of " + q.measured + "</i>" : "") + "</span>" : "") +
        (L.shock_index != null ? '<span class="obs' + (L.shock_index >= 1 ? " p3" : L.shock_index >= 0.9 ? " p2" : "") + '"><small>Shock idx</small><b>' + L.shock_index + "</b></span>" : "") + "</div>";
      if (o.history && o.history.length > 1) h += '<details class="obs-hist"><summary>All observations (' + o.history.length + ")</summary><div class=\"scroll-x\"><table class=\"t\"><thead><tr><th>Time</th><th>NEWS2</th><th>RR</th><th>SpO₂</th><th>BP</th><th>HR</th><th>ACVPU</th><th>Temp</th><th>By</th></tr></thead><tbody>" +
        o.history.map(function (r) { return "<tr><td>" + esc(new Date(r.ts * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + '</td><td><b>' + r.news2.score + "</b></td><td>" + (r.rr == null ? "–" : r.rr) + "</td><td>" + (r.spo2 == null ? "–" : r.spo2 + (r.o2 ? " O₂" : "")) + "</td><td>" + (r.sbp == null ? "–" : r.sbp + "/" + (r.dbp || "–")) + "</td><td>" + (r.hr == null ? "–" : r.hr) + "</td><td>" + (r.avpu || "–") + "</td><td>" + (r.temp == null ? "–" : r.temp) + "</td><td>" + esc(r.by || "") + "</td></tr>"; }).join("") + "</tbody></table></div></details>";
    } else if (x.obs) {
      h += '<div class="mini">No observations on this visit yet.' + (o.overdue ? ' <b class="late">A first set is due.</b>' : "") + "</div>";
    }
    if (x.can_record_obs && x.access_active) h += '<button class="btn btn-sm btn-primary" type="button" data-clin="obs">+ Record observations</button>';
    h += "</div>";
    if (x.obs !== undefined && x.access_active) h += '<div class="ops-sec clin" id="clin-checks"><div class="ops-h">🧠 Clinical checks <span class="mini">safety net for this visit</span></div><div class="empty">Thinking it through…</div></div>';
    return h;
  }

  function after(x) {
    var box = el("clin-checks");
    if (!box) return;
    api("/hospital/ops/encounters/" + encodeURIComponent(x.id) + "/copilot").then(function (r) {
      if (!el("clin-checks")) return;
      if (!r || !r.ok) { box.innerHTML = '<div class="ops-h">🧠 Clinical checks</div><div class="mini">Not available right now.</div>'; return; }
      var ST = { overdue: ["Overdue", "bad"], open: ["To do", "warn"], in_progress: ["In progress", "info"], met: ["Done", "ok"] };
      var h = '<div class="ops-h">🧠 Clinical checks <span class="mini">' + (r.checks.length ? r.checks.length + " for this visit" : "nothing flagged") + "</span></div>";
      if (!r.checks.length) h += '<div class="clin-ok">✓ No time-critical pathway looks incomplete for this visit right now.</div>';
      h += r.checks.map(function (c) {
        var st = ST[c.state] || ST.open;
        return '<div class="clin-c ' + st[1] + (c.priority === "urgent" ? " urgent" : "") + '"><div class="clin-c-h"><b>' + esc(c.title) + '</b><span class="pill ' + st[1] + '">' + st[0] + "</span>" +
          (c.target_min != null && c.elapsed_min != null && c.state !== "met" ? '<span class="mini">' + c.elapsed_min + " min / target " + c.target_min + "</span>" : "") + "</div>" +
          (c.why.length ? '<div class="clin-why">' + c.why.map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("") + "</div>" : "") +
          (c.items.length ? '<div class="clin-items">' + c.items.map(function (i) {
            return '<div class="clin-i ' + i.state + '"><span>' + (i.state === "done" ? "✅" : i.state === "ordered" ? "⏳" : "◻️") + " " + esc(i.label) + "</span>" +
              (i.state === "missing" && can("orders") ? '<button type="button" class="btn btn-sm" data-clin="order" data-kind="' + esc(i.order.kind) + '" data-item="' + esc(i.order.item) + '" data-pr="' + esc(i.order.priority) + '">Order ' + esc(i.order.priority.toUpperCase()) + "</button>" : '<span class="mini">' + (i.state === "done" ? "done" : i.state === "ordered" ? "ordered" : "not ordered") + "</span>") + "</div>";
          }).join("") + "</div>" : "") +
          (c.actions.length ? '<ul class="clin-act">' + c.actions.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
      }).join("");
      if (r.differential && r.differential.length) {
        h += '<details class="clin-dd"' + (r.checks.length ? "" : " open") + '><summary>Differential from the presenting complaint <span class="mini">symptom engine</span></summary>' + r.differential.map(function (d) {
          return '<div class="clin-d"><span class="nm">' + esc(d.name) + (d.urgency === "emergency" || d.urgency === "urgent" ? ' <span class="pill bad">' + esc(d.urgency) + "</span>" : "") + '</span><span class="bar"><i style="width:' + Math.max(4, Math.round(d.p * 100)) + '%"></i></span><span class="mini">' + esc((d.because || []).join(", ")) + "</span></div>";
        }).join("") + '<div class="mini">Ranked from the reason for visit (and temperature, age and sex when shared). A prompt to think wider, not a diagnosis.</div></details>';
      }
      h += '<div class="mini clin-disc">' + esc(r.disclaimer || "") + "</div>";
      box.innerHTML = h;
    });
  }

  function recordForm(x, reopen) {
    var f = '<h2 id="ops-title">Observations · ' + esc(x.patient_name) + '</h2><p class="sub">NEWS2 updates as you type. Leave anything you did not measure empty.</p><form id="ob-form" novalidate>' +
      '<div class="ob-grid">' +
      [["rr", "Resp. rate", "/min", "16"], ["spo2", "SpO₂", "%", "97"], ["sbp", "Systolic BP", "mmHg", "120"], ["dbp", "Diastolic BP", "mmHg", "80"], ["hr", "Heart rate", "/min", "80"], ["temp", "Temperature", "°C", "37.0"], ["cbg", "Capillary glucose", "mg/dL", "110"], ["pain", "Pain", "0–10", "0"]].map(function (v) {
        return '<div class="field"><label for="ob-' + v[0] + '">' + v[1] + ' <span class="mini">' + v[2] + '</span></label><input class="input" id="ob-' + v[0] + '" inputmode="decimal" autocomplete="off" data-ob="' + v[0] + '"></div>';
      }).join("") + "</div>" +
      '<div class="field"><label>Consciousness (ACVPU)</label><div class="seg" id="ob-avpu">' + AVPU.map(function (a) { return '<button type="button" data-v="' + a[0] + '"' + (a[0] === "A" ? ' class="on"' : "") + "><b>" + a[0] + "</b> " + a[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="ob-toggles"><label class="ops-ck"><input type="checkbox" id="ob-o2"><span>On supplemental oxygen</span></label><label class="ops-ck"><input type="checkbox" id="ob-s2"><span>SpO₂ scale 2 (target 88–92%, e.g. hypercapnic respiratory failure, as prescribed)</span></label></div>' +
      '<div class="field"><label for="ob-note">Note (optional)</label><input class="input" id="ob-note" maxlength="300"></div>' +
      '<div class="news-live" id="ob-live"></div>' +
      '<button class="btn btn-primary" type="submit">Save observations</button> <button class="btn btn-ghost" type="button" id="ob-cancel">Back</button><div class="msg" id="ob-msg"></div></form>';
    var b = el("ops-body");
    b.innerHTML = f;
    var avpu = "A";
    function val() {
      var o = { avpu: avpu, o2: el("ob-o2").checked, scale2: el("ob-s2").checked };
      [].forEach.call(document.querySelectorAll("[data-ob]"), function (i) { var v = parseFloat(i.value); if (!isNaN(v)) o[i.getAttribute("data-ob")] = v; });
      return o;
    }
    function live() {
      var n = news2(val()), bnd = BAND[n.band];
      el("ob-live").className = "news-live " + bnd[1];
      el("ob-live").innerHTML = "<b>NEWS2 " + n.score + "</b> · " + bnd[0] + " risk · " + n.measured + " of 7 parameters" + (n.band === "high" ? " · emergency response" : n.band === "medium" ? " · urgent response" : n.band === "low_single" ? " · urgent ward-based response" : "");
    }
    el("ob-avpu").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; avpu = t.getAttribute("data-v"); [].forEach.call(el("ob-avpu").children, function (c) { c.classList.toggle("on", c === t); }); live(); };
    b.oninput = live;
    b.onchange = live;
    live();
    el("ob-rr").focus();
    el("ob-cancel").onclick = reopen;
    el("ob-form").onsubmit = function (e) {
      e.preventDefault();
      var body = val();
      body.note = el("ob-note").value;
      api("/hospital/ops/encounters/" + encodeURIComponent(x.id) + "/obs", { method: "POST", body: body }).then(function (r) {
        if (H().guard(r)) return;
        if (!r.ok) { H().say(el("ob-msg"), r.message, "err"); return; }
        toast(r.message, r.item.news2.score >= 5 ? "err" : "");
        b.oninput = b.onchange = null;
        reopen();
      });
    };
  }

  function click(e, x, reopen) {
    var t = e.target.closest("[data-clin]");
    if (!t) return false;
    var a = t.getAttribute("data-clin");
    if (a === "obs") { recordForm(x, reopen); return true; }
    if (a === "order") {
      t.disabled = true;
      api("/hospital/ops/orders", { method: "POST", body: { encounter_id: x.id, kind: t.getAttribute("data-kind"), item: t.getAttribute("data-item"), priority: t.getAttribute("data-pr") } }).then(function (r) {
        toast(r.message || "", r.ok ? "" : "err");
        if (r.ok) reopen(); else t.disabled = false;
      });
      return true;
    }
    return false;
  }

  function watch(r) {
    var w = r.watch, f = r.forecast, h = "";
    if (w && w.items.length) {
      h += '<div class="ops-watch" id="ops-watch"><div class="ops-h">🚨 See first <span class="mini">NEWS2 5 or more, rising scores, observations due</span></div>' + w.items.map(function (i) {
        var b = BAND[i.band] || null;
        return '<button type="button" class="ow ' + (b ? b[1] : "") + '" data-open-visit="' + esc(i.id) + '"><span class="ow-s">' + (i.news2 == null ? "–" : i.news2) + "</span><span class=\"grow\"><b>" + esc(i.patient_name) + "</b><small>" +
          esc(i.bed ? (i.ward || "") + " · bed " + i.bed : i.token ? "token #" + i.token : i.kind.toUpperCase()) + (i.rising ? " · rising ↑" : "") + (i.obs_overdue ? " · obs due" : "") + (i.minutes_since_obs != null ? " · last set " + (i.minutes_since_obs < 60 ? i.minutes_since_obs + " min" : Math.round(i.minutes_since_obs / 60) + " h") + " ago" : "") + "</small></span>" +
          (i.series && i.series.length > 1 ? '<span class="ow-sp">' + trendSvg(i.series.map(function (v, k) { return [k, v]; })) + "</span>" : "") + "</button>";
      }).join("") + "</div>";
    }
    if (f) h += '<div class="ops-fc' + (f.pressure === "high" ? " hot" : "") + '"><span>🔮</span><div><b>≈ ' + f.expected_free + " beds free in " + f.hours + " h</b><small>" + f.free_now + " free now · " + f.discharges_expected + " discharges planned · " + f.admissions_expected + " admissions expected · beds being cleaned counted in</small></div></div>";
    return h;
  }

  window.QCClin = { section: section, after: after, click: click, badge: badge, watch: watch };
})();
