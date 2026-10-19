/* QueroCura for Hospitals: the thinking behind My day, made visible.
 *
 * 1. "Rest of today": the day played out a few hundred times on the server.  One row per doctor: the likely finish
 *    (bar), the bad-day finish (whisker), when their session ends (dashed line) and how long their patients will wait.
 *    Suggestions underneath were tested in the same simulation; "Move them" applies one through the queue's rules.
 * 2. "How the hospital is connected": appointments, the queue, beds, theatres, orders and billing as a live map.  Each
 *    hand-off glows green when the two sides agree and amber or red when they don't; underneath, what is out of step,
 *    a button that fixes only the safe things, and a log of what the system did on its own.
 * Plugs into hospital.js through window.QCHosp; exposes window.QCMind. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function toast(m, k) { H().P.toast(m, k); }
  function el(id) { return document.getElementById(id); }
  function open(html) { el("mind-body").innerHTML = html; H().P.openModal("mind-modal"); return el("mind-body"); }
  function mins(hm) { if (!hm || hm.indexOf(":") < 0) return 24 * 60; var p = hm.split(":"); return +p[0] * 60 + +p[1]; }
  function hm(m) { m = Math.round(m); return ("0" + Math.floor(m / 60) % 24).slice(-2) + ":" + ("0" + m % 60).slice(-2); }
  var STATE = { ok: ["#12b5a5", "In step"], info: ["#3b82f6", "Worth a look"], warning: ["#e0a52c", "Out of step"], urgent: ["#e2483d", "Needs someone now"] };

  /* ---------------------------------------------------------------- rest of today */
  function simulation() {
    var body = open('<h2 id="ops-title">Rest of today</h2><div class="mind-skel"></div>');
    api("/hospital/simulate").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { body.innerHTML = '<h2>Rest of today</h2><div class="notice bad">' + esc(r.message || "Couldn't run the forecast.") + "</div>"; return; }
      if (!r.summary) { body.innerHTML = '<h2>Rest of today</h2><p class="sub">No doctor has a session left today, so there is nothing to forecast.</p>'; return; }
      var s = r.summary, docs = r.doctors;
      var t0 = mins(r.now), t1 = t0 + 60;
      docs.forEach(function (d) { t1 = Math.max(t1, mins(d.finish_p90)); });
      docs.forEach(function (d) { var se = mins(d.session_end); if (se > t1 && se - t1 <= 120) t1 = se; });   // a far-off session end isn't worth squashing the chart for
      t1 = Math.ceil((t1 + 20) / 30) * 30;
      var W = 720, L = 190, R = 96, row = 46, top = 34, Hh = top + docs.length * row + 12, x = function (m) { return L + (W - L - R) * (m - t0) / Math.max(30, t1 - t0); };
      var svg = '<svg class="mind-chart" viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="Likely finishing time for each doctor"><defs><linearGradient id="mind-g" x1="0" x2="1"><stop offset="0" stop-color="#14c3b2"/><stop offset="1" stop-color="#2b6fe8"/></linearGradient></defs>';
      var step = [30, 60, 120, 180, 240].filter(function (st) { return (W - L - R) * st / Math.max(30, t1 - t0) >= 64; })[0] || 240;
      for (var m = Math.ceil(t0 / step) * step; m <= t1; m += step) svg += '<line x1="' + x(m) + '" x2="' + x(m) + '" y1="' + (top - 10) + '" y2="' + (Hh - 6) + '" class="mc-grid"/><text x="' + x(m) + '" y="' + (top - 16) + '" class="mc-t" text-anchor="middle">' + hm(m) + "</text>";
      svg += '<line x1="' + x(t0) + '" x2="' + x(t0) + '" y1="' + (top - 10) + '" y2="' + (Hh - 6) + '" class="mc-now"/><text x="' + x(t0) + '" y="' + (Hh - 0) + '" class="mc-t mc-now-t" text-anchor="middle">now</text>';
      docs.forEach(function (d, i) {
        var y = top + i * row, f50 = mins(d.finish_p50), f90 = mins(d.finish_p90), se = mins(d.session_end), over = d.overrun >= 0.5;
        svg += '<text x="' + (L - 12) + '" y="' + (y + 18) + '" class="mc-name" text-anchor="end">' + esc(d.name.length > 18 ? d.name.slice(0, 17) + "…" : d.name) + "</text>" +
          '<text x="' + (L - 12) + '" y="' + (y + 33) + '" class="mc-sub" text-anchor="end">' + esc(Math.round(d.patients)) + " to see · " + esc(d.consult_min) + " min each</text>" +
          '<rect x="' + x(t0) + '" y="' + (y + 8) + '" width="' + Math.max(2, x(f50) - x(t0)) + '" height="20" rx="10" fill="url(#mind-g)" class="mc-bar" style="animation-delay:' + (i * 90) + 'ms"/>' +
          '<line x1="' + x(f50) + '" x2="' + x(f90) + '" y1="' + (y + 18) + '" y2="' + (y + 18) + '" class="mc-wh"/><line x1="' + x(f90) + '" x2="' + x(f90) + '" y1="' + (y + 11) + '" y2="' + (y + 25) + '" class="mc-wh"/>' +
          (se <= t1 ? '<line x1="' + x(se) + '" x2="' + x(se) + '" y1="' + (y + 2) + '" y2="' + (y + 34) + '" class="mc-end' + (over ? " over" : "") + '"/>' : "") +
          '<text x="' + (W - R + 10) + '" y="' + (y + 18) + '" class="mc-w' + (d.avg_wait >= 20 ? " hot" : "") + '">' + esc(d.avg_wait) + " min</text>" +
          '<text x="' + (W - R + 10) + '" y="' + (y + 33) + '" class="mc-sub">typical wait</text>';
      });
      svg += "</svg>";
      var sug = r.suggestions.map(function (g, k) {
        return '<div class="mind-sug ' + (g.level === "warning" ? "warn" : "") + '"><div class="grow"><b>' + esc(g.title) + "</b><p>" + esc(g.text) + '</p><small>' + esc(g.basis) + "</small></div>" +
          (g.kind === "move" && H().can("ops") ? '<button type="button" class="btn btn-sm btn-primary" data-mind-move="' + k + '">Move them</button>' : "") + "</div>";
      }).join("");
      body.innerHTML = '<h2 id="ops-title">Rest of today</h2><p class="sub">Played out ' + esc(r.runs) + " times from who is waiting, who is booked and how long each doctor usually takes" +
        (r.no_show_learned ? ", with this hospital's own no-show rate (" + Math.round(100 * r.no_show_rate) + "%)." : ".") + "</p>" +
        '<div class="mind-kpis"><div><b>' + esc(s.finish_p50) + "</b><span>likely finish</span></div><div><b>" + esc(s.finish_p90) + "</b><span>on a bad day</span></div><div><b>" + esc(s.avg_wait) + ' min</b><span>typical wait</span></div><div><b>' +
        Math.round(100 * s.on_time) + "%</b><span>chance all finish on time</span></div></div>" +
        '<div class="mind-chart-wrap">' + svg + '</div><p class="mini mind-legend"><i class="lg-bar"></i>likely finish <i class="lg-wh"></i>bad day (1 in 10) <i class="lg-end"></i>session ends</p>' +
        (sug ? "<h3>What would help</h3>" + sug : '<p class="mini">No change we tried would cut waiting by much. The day looks balanced.</p>');
      body._sugg = r.suggestions;
    });
  }

  function rebalance(b, btn) {
    if (btn) btn.disabled = true;
    return api("/hospital/simulate/apply", { method: "POST", body: b }).then(function (r) {
      toast(r.message || (r.ok ? "Done." : "Couldn't move them."), r.ok ? "ok" : "err");
      if (btn) btn.disabled = false;
      return r;
    });
  }

  /* ---------------------------------------------------------------- how the hospital is connected */
  var POS = { appointments: [90, 186], queue: [270, 186], beds: [480, 62], theatres: [480, 186], orders: [480, 310], billing: [680, 186] };
  function flowSvg(r) {
    var svg = '<svg class="mind-flow" viewBox="0 0 770 392" role="img" aria-label="How the hospital\'s parts hand work to each other">';
    r.links.forEach(function (l, i) {
      var a = POS[l.from], b = POS[l.to]; if (!a || !b) return;
      var mx = (a[0] + b[0]) / 2, c = STATE[l.state] || STATE.ok;
      var d = "M" + a[0] + "," + a[1] + " C" + mx + "," + a[1] + " " + mx + "," + b[1] + " " + b[0] + "," + b[1];
      svg += '<path d="' + d + '" class="mf-base"/><path d="' + d + '" class="mf-flow" stroke="' + c[0] + '" style="animation-delay:-' + (i * 0.37) + 's"><title>' + esc(l.label) + "</title></path>";
    });
    r.nodes.forEach(function (n) {
      var p = POS[n.id]; if (!p) return;
      var c = STATE[n.state] || STATE.ok;
      svg += '<g class="mf-node mf-' + n.state + '" transform="translate(' + p[0] + "," + p[1] + ')"><circle r="38" class="mf-halo" fill="' + c[0] + '"/><circle r="31" class="mf-disc" stroke="' + c[0] + '"/>' +
        '<text y="-2" text-anchor="middle" class="mf-ic">' + n.icon + '</text><text y="17" text-anchor="middle" class="mf-n">' + esc(n.live) + "</text>" +
        '<text y="52" text-anchor="middle" class="mf-name">' + esc(n.name) + '</text><text y="66" text-anchor="middle" class="mf-unit">' + esc(n.unit) + "</text>" +
        (n.issues ? '<g transform="translate(24,-24)"><circle r="11" fill="' + c[0] + '"/><text y="4" text-anchor="middle" class="mf-badge">' + esc(n.issues > 99 ? "99+" : n.issues) + "</text></g>" : "") + "</g>";
    });
    return svg + "</svg>";
  }
  function integrity() {
    var body = open('<h2 id="ops-title">How the hospital is connected</h2><div class="mind-skel"></div>');
    api("/hospital/integrity").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { body.innerHTML = '<h2>How the hospital is connected</h2><div class="notice bad">' + esc(r.message || "Couldn't check.") + "</div>"; return; }
      var f = r.findings, good = !f.length;
      var list = f.map(function (x) {
        var c = STATE[x.severity] || STATE.info;
        return '<div class="mind-find"><span class="mf-dot" style="background:' + c[0] + '"></span><div class="grow"><b>' + esc(x.title) + "</b><p>" + esc(x.detail) + "</p>" +
          '<small>' + (x.safe ? "QueroCura can fix this safely: " + esc(x.fix.toLowerCase()) + "." : "Needs a person, so nothing will be changed.") + "</small></div>" +
          (x.tab ? '<button type="button" class="btn btn-sm" data-mind-tab="' + esc(x.tab) + '">Open</button>' : "") + "</div>";
      }).join("");
      var ev = (r.events || []).slice(0, 8).map(function (e) {
        return '<li><span class="mini">' + esc(H().when(e.ts)) + "</span> " + esc(e.summary) + "</li>";
      }).join("");
      body.innerHTML = '<h2 id="ops-title">How the hospital is connected</h2><p class="sub">Each part hands work to the next. Every few minutes QueroCura checks that both sides of every hand-off agree, and fixes what has one right answer.</p>' +
        '<div class="mind-score ' + (r.score >= 90 ? "good" : r.score >= 70 ? "ok" : "bad") + '"><b>' + esc(r.score) + '</b><span>' + (good ? "Everything is in step." : esc(f.length) + " thing" + (f.length === 1 ? "" : "s") + " out of step") + "</span>" +
        (r.safe ? '<button type="button" class="btn btn-sm btn-primary" id="mind-fix">Fix the safe ones (' + esc(r.safe) + ")</button>" : "") + "</div>" +
        '<div class="mind-flow-wrap">' + flowSvg(r) + "</div>" +
        '<p class="mini mind-legend">' + ["ok", "info", "warning", "urgent"].map(function (k) { return '<i style="background:' + STATE[k][0] + '"></i>' + STATE[k][1]; }).join(" ") + "</p>" +
        (list ? "<h3>Out of step</h3>" + list : "") + (ev ? '<h3>What QueroCura did on its own</h3><ul class="mind-ev">' + ev + "</ul>" : "");
      var fx = el("mind-fix");
      if (fx) fx.onclick = function () {
        fx.disabled = true;
        api("/hospital/integrity/repair", { method: "POST", body: {} }).then(function (x) { toast(x.message || "Done.", x.ok ? "ok" : "err"); integrity(); });
      };
    });
  }

  document.addEventListener("click", function (e) {
    var mv = e.target.closest("[data-mind-move]");
    if (mv) { var g = (el("mind-body")._sugg || [])[+mv.getAttribute("data-mind-move")]; if (g) rebalance(g.apply, mv).then(function (r) { if (r.ok) simulation(); }); return; }
    var tb = e.target.closest("[data-mind-tab]");
    if (tb) { H().P.closeModal("mind-modal"); H().go(tb.getAttribute("data-mind-tab")); }
  });

  window.QCMind = { simulation: simulation, integrity: integrity, rebalance: rebalance };
})();
