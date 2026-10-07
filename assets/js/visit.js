(function () {
  "use strict";
  var P = QCPage, esc = P.esc, api = P.api, DATA = null;
  function el(id) { return document.getElementById(id); }

  function fmtWhen(s) {
    if (!s) return "";
    var d = new Date(String(s).replace(" ", "T"));
    return isNaN(d) ? s : d.toLocaleString([], { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  }
  function fmtDay(s) {
    var d = new Date(s + "T00:00:00");
    return isNaN(d) ? s : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  }
  function inWords(n) { return n === 0 ? "today" : n === 1 ? "tomorrow" : "in " + n + " days"; }

  function render(d) {
    var v = d.visit, since = d.since_last_visit || {}, h = "";
    h += '<div class="hero">' + (v
      ? '<h2>' + esc(v.title) + '</h2><div><span class="when">' + esc(fmtWhen(v.when)) + '</span>' + (v.in_days != null ? " (" + inWords(v.in_days) + ")" : "") + '</div>' +
        (v.location ? '<div class="hint">📍 ' + esc(v.location) + '</div>' : "") + (v.notes ? '<div class="hint">' + esc(v.notes) + '</div>' : "")
      : '<h2>No visit scheduled yet</h2><div class="hint">You can still use this page. <a href="../calendar/?new=1&type=doctor">Add your next appointment</a> and it will show up here.</div>');
    var chips = [];
    if (since.date) chips.push("Last doctor visit: " + fmtDay(since.date) + " (" + since.days + " days ago)");
    (d.about_you.conditions || []).forEach(function (c) { chips.push(c); });
    h += '<div class="chips">' + chips.map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") +
      (d.about_you.allergies || []).map(function (a) { return '<span class="chip warn">Allergy: ' + esc(a) + "</span>"; }).join("") + "</div></div>";

    if ((d.alerts || []).length) {
      h += '<div class="card"><h2>Worth mentioning first</h2>' + d.alerts.map(function (a) { return '<p><b>' + esc(a.title) + '</b><br><span class="hint">' + esc(a.message || "") + "</span></p>"; }).join("") + "</div>";
    }

    h += '<div class="card"><h2>Your readings' + (since.date ? " since your last visit" : "") + "</h2>";
    if (d.readings.length) {
      h += '<table class="rd"><thead><tr><th>Reading</th><th>Latest</th><th>Range</th><th>Average</th><th>Trend</th></tr></thead><tbody>' +
        d.readings.map(function (r) {
          return "<tr><td>" + esc(r.label) + (r.flag ? ' <span class="flag">⚠ flagged</span>' : "") + '</td><td class="num">' + esc(r.latest) + " " + esc(r.unit) + "</td><td>" + esc(r.min) + " to " + esc(r.max) +
            "</td><td>" + esc(r.average) + "</td><td>" + esc(r.direction) + " (" + esc(r.count) + ")</td></tr>";
        }).join("") + "</tbody></table>";
    } else {
      h += '<p class="hint">No readings logged in this period. <a href="../vitals/">Log your blood pressure, sugar or weight</a> so your doctor sees more than one day.</p>';
    }
    h += "</div>";

    h += '<div class="card"><h2>Symptom checks</h2>';
    h += d.symptom_checks.length
      ? d.symptom_checks.map(function (c) { return "<p>" + esc(fmtDay(c.date)) + ": closest match <b>" + esc(c.result) + "</b>" + (c.urgency ? " · " + esc(c.urgency) : "") + "</p>"; }).join("") +
        '<p class="note">These are AI pattern matches from what you typed, not diagnoses. Describe the symptoms themselves to your doctor.</p>'
      : '<p class="hint">None in this period.</p>';
    h += "</div>";

    var rec = d.records || {};
    if (rec.headline || (rec.flagged_labs || []).length || (rec.scans || []).length) {
      h += '<div class="card"><h2>Documents to bring up</h2>' + (rec.headline ? "<p>" + esc(rec.headline) + "</p>" : "") +
        ((rec.flagged_labs || []).length ? "<p><b>Lab values outside the usual range:</b> " + rec.flagged_labs.map(esc).join(", ") + "</p>" : "") +
        ((rec.scans || []).length ? "<p><b>Scan reports:</b> " + rec.scans.map(esc).join(", ") + "</p>" : "") + "</div>";
    }

    h += '<div class="card"><h2>Questions to ask</h2><p class="sub">Write the answers in the space below each one.</p>';
    d.question_groups.forEach(function (g) {
      h += '<div class="qg"><h3>' + esc(g.icon || "") + " " + esc(g.title) + "</h3><ol>" + g.questions.map(function (q) { return "<li>" + esc(q) + '<span class="space"></span></li>'; }).join("") + "</ol></div>";
    });
    h += "</div>";

    h += '<div class="card"><h2>Bring with you</h2><ul class="ck">' + d.checklist.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>";
    h += '<p class="note">' + esc(d.note) + " Prepared " + esc(d.generated) + ".</p>";
    el("out").innerHTML = h;
  }

  function asText(d) {
    var L = ["VISIT PREP (" + d.generated + ")"];
    if (d.visit) L.push(d.visit.title + ", " + fmtWhen(d.visit.when) + (d.visit.location ? ", " + d.visit.location : ""));
    if (d.about_you.conditions.length) L.push("Conditions: " + d.about_you.conditions.join(", "));
    if (d.about_you.allergies.length) L.push("Allergies: " + d.about_you.allergies.join(", "));
    if (d.readings.length) { L.push("", "READINGS"); d.readings.forEach(function (r) { L.push("- " + r.label + ": latest " + r.latest + " " + r.unit + ", range " + r.min + " to " + r.max + ", " + r.direction); }); }
    if (d.symptom_checks.length) { L.push("", "SYMPTOM CHECKS (AI pattern matches, not diagnoses)"); d.symptom_checks.forEach(function (c) { L.push("- " + c.date + ": " + c.result); }); }
    L.push("", "QUESTIONS"); var i = 0;
    d.question_groups.forEach(function (g) { g.questions.forEach(function (q) { L.push(++i + ". " + q); }); });
    return L.join("\n");
  }

  el("print").addEventListener("click", function () { window.print(); });
  el("copy").addEventListener("click", function () {
    if (!DATA) return;
    QC.copy(asText(DATA)).then(function () { P.toast("Copied. Paste it into a message or your notes.", ""); }, function () { P.toast("Couldn't copy.", "err"); });
  });

  P.init().then(function (me) {
    if (!me || !me.logged_in) return;
    var ev = new URLSearchParams(location.search).get("event");
    api("/insights/visit-prep" + (ev ? "?event=" + encodeURIComponent(ev) : "")).then(function (d) {
      if (!d.ok) { el("out").innerHTML = '<div class="card"><p class="msg err">' + esc(d.err || d.message || "Couldn't build your page.") + "</p></div>"; return; }
      DATA = d; render(d);
    });
  });
})();
