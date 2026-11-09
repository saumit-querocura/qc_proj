/* Insights: "Connections across your health".
 * GET /api/insights/connections finds what only shows up when readings, medicines, doses and symptom checks are read
 * together: a reading that moved after a medicine started (in the direction that medicine is known to move it), readings
 * after missed doses against readings after days with every dose taken, and readings on the days of a recurring symptom
 * check.  Each card shows the two numbers being compared, with how many readings sit behind each.  Not proof of cause. */
(function () {
  "use strict";
  var API = "https://app.querocura.com/api";
  var UNIT = { systolic_bp: "mmHg", heart_rate: "bpm", blood_glucose_mgdl: "mg/dL", weight_kg: "kg", temperature_c: "°C" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function pair(c) {
    var e = c.evidence || {}, u = UNIT[e.metric] || "";
    var rows = c.kind === "med_timing" ? [["Before", e.before, e.n_before], ["Since", e.after, e.n_after]]
      : c.kind === "missed_doses" ? [["After a missed dose", e.after_missed, e.n_missed], ["After every dose taken", e.after_taken, e.n_taken]]
      : [["On those days", e.on], ["Other days", e.off]];
    var max = Math.max.apply(null, rows.map(function (r) { return +r[1] || 0; })), min = Math.min.apply(null, rows.map(function (r) { return +r[1] || 0; }));
    var lo = min - (max - min) * 1.5 - 1;                      // a common baseline so the gap reads at a glance
    return '<div class="cx-bars" role="img" aria-label="' + esc(rows.map(function (r) { return r[0] + " " + r[1] + " " + u; }).join(", ")) + '">' + rows.map(function (r, i) {
      return '<div class="cx-bar"><span class="cx-lbl">' + esc(r[0]) + (r[2] ? " <small>(" + r[2] + ")</small>" : "") + '</span><span class="cx-track"><i class="' + (i ? "b" : "a") + '" style="width:' + Math.max(8, Math.round(100 * (r[1] - lo) / (max - lo))) + '%"></i></span><b>' + esc(r[1]) + " <small>" + esc(u) + "</small></b></div>";
    }).join("") + "</div>";
  }

  function render(d) {
    var box = document.getElementById("qc-connections");
    if (!box) return;
    var cs = (d && d.connections) || [];
    box.innerHTML = '<h2>🔗 Connections across your health</h2><p class="cx-sub">What only shows up when your readings, medicines, doses and symptom checks are read together.</p>' +
      (cs.length ? cs.map(function (c) {
        return '<article class="cx tone-' + esc(c.tone) + '"><div class="cx-top"><span class="cx-ic" aria-hidden="true">' + esc(c.icon) + '</span><b>' + esc(c.title) + '</b><span class="cx-kind">' +
          ({ med_timing: "Medicine & readings", missed_doses: "Doses & readings", symptom_days: "Symptoms & readings" }[c.kind] || "") + "</span></div>" + pair(c) + "<p>" + esc(c.text) + "</p></article>";
      }).join("") : '<div class="cx-empty">Nothing lines up yet. Cura keeps checking whether a reading moves after a medicine starts, after missed doses, and on the days you check a symptom, and will show it here when it does.</div>') +
      '<p class="cx-note">' + esc((d && d.note) || "") + "</p>";
    box.hidden = false;
  }

  function mount() {
    var intel = document.getElementById("intel");
    if (!intel || document.getElementById("qc-connections")) return;
    var sec = document.createElement("section");
    sec.className = "card cx-card"; sec.id = "qc-connections"; sec.hidden = true; sec.setAttribute("aria-live", "polite");
    intel.parentNode.insertBefore(sec, intel.nextSibling);
    var jump = document.querySelector("nav.jump a[href='#numbers']");
    if (jump && !document.querySelector("nav.jump a[href='#qc-connections']")) {
      var a = document.createElement("a"); a.href = "#qc-connections"; a.textContent = "Connections";
      jump.parentNode.insertBefore(a, jump);
    }
    fetch(API + "/insights/connections?tz=" + (-new Date().getTimezoneOffset()), { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.ok !== false) render(d); }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
