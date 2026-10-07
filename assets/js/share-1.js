(function () {
  var API = (window.QC_API_BASE || "https://app.querocura.com/api");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  var token = (location.hash || "").replace(/^#/, "");
  var busy = false;

  if (!/^[a-f0-9]{10}\.[A-Za-z0-9_-]{40,}$/.test(token)) {
    $("gate-text").textContent = "This link looks incomplete. Please open the full link you were sent.";
    return;
  }

  function post(pin) {
    return fetch(API + "/share/view", { method: "POST", headers: { "Content-Type": "application/json" }, referrerPolicy: "no-referrer", cache: "no-store", body: JSON.stringify({ token: token, pin: pin || undefined }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; }); })
      .catch(function () { return { ok: false, message: "We couldn't reach QueroCura. Check your connection." }; });
  }

  function buildPin() {
    var box = $("pin-boxes"); box.innerHTML = "";
    for (var i = 0; i < 6; i++) {
      var inp = document.createElement("input"); inp.inputMode = "numeric"; inp.maxLength = 1; inp.autocomplete = "off"; inp.setAttribute("aria-label", "PIN digit " + (i + 1)); box.appendChild(inp);
    }
    var ins = box.querySelectorAll("input");
    ins.forEach(function (inp, i) {
      inp.addEventListener("input", function () { inp.value = inp.value.replace(/\D/g, ""); if (inp.value.length > 1) { var rest = inp.value.split(""); inp.value = rest.shift(); for (var k = 1; k <= rest.length && ins[i + k]; k++) ins[i + k].value = rest[k - 1]; var last = Math.min(5, i + rest.length); ins[last].focus(); if (pinValue().length === 6) go(); return; } if (inp.value && ins[i + 1]) ins[i + 1].focus(); if (i === 5 && inp.value) go(); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Backspace" && !inp.value && ins[i - 1]) ins[i - 1].focus(); });
      inp.addEventListener("paste", function (e) { var t = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6); if (t) { e.preventDefault(); t.split("").forEach(function (c, k) { ins[k].value = c; }); (ins[Math.min(t.length, 5)]).focus(); if (t.length === 6) go(); } });
    });
    ins[0].focus();
  }
  function pinValue() { return Array.prototype.map.call($("pin-boxes").querySelectorAll("input"), function (i) { return i.value; }).join(""); }

  function go() {
    var pin = pinValue(); if (pin.length !== 6 || busy) return;
    busy = true; $("gate-err").textContent = "";
    post(pin).then(function (d) { busy = false; handle(d, true); });
  }
  $("pin-go").addEventListener("click", go);

  function handle(d, afterPin) {
    if (d.ok) { render(d); return; }
    if (d.need_pin) {
      $("gate-text").textContent = "This summary is protected.";
      $("pin-area").style.display = "";
      if (!$("pin-boxes").children.length) buildPin(); else { Array.prototype.forEach.call($("pin-boxes").querySelectorAll("input"), function (i) { i.value = ""; }); $("pin-boxes").querySelector("input").focus(); }
      if (afterPin) $("gate-err").textContent = d.message || "That PIN isn't right.";
      return;
    }
    $("pin-area").style.display = "none";
    $("gate-text").textContent = "";
    $("gate-err").textContent = d.message || "This link isn't available.";
  }

  /* ---------- rendering ---------- */
  function fmtDate(s) { if (!s) return ""; var d = new Date(String(s).replace(" ", "T")); return isNaN(d) ? esc(String(s).slice(0, 10)) : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }); }
  function list(a) { return a && a.length ? a.map(esc).join(", ") : "None recorded"; }
  function spark(vals, color) {
    vals = vals.filter(function (v) { return v != null; }); if (vals.length < 2) return "";
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), w = 300, h = 60, pad = 6, rng = (max - min) || 1;
    var pts = vals.map(function (v, i) { return (pad + i * (w - 2 * pad) / (vals.length - 1)).toFixed(1) + "," + (h - pad - (v - min) / rng * (h - 2 * pad)).toFixed(1); }).join(" ");
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="' + pts + '"/></svg>';
  }

  function briefCard(b) {
    if (!b) return "";
    var h = '<div class="card brief"><h2>📝 Pre-visit brief</h2>';
    var ap = b.appointment;
    if (ap) h += '<p class="hint" style="margin:0 0 8px">' + esc(ap.title || "Visit") + (ap.when ? " · " + esc(fmtDate(ap.when)) : "") + (ap.location ? " · " + esc(ap.location) : "") + '</p>';
    h += '<div class="panel-name">Reason for visit (patient\'s words)</div><p class="reason">' + (b.reason ? esc(b.reason) : '<span class="hint">Not stated</span>') + '</p>';
    if (b.concerns && b.concerns.length) h += '<div class="panel-name">What worries the patient most</div><ol class="q">' + b.concerns.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ol>";
    var sl = b.since_last_visit || {};
    h += '<div class="panel-name">What has changed' + (sl.date ? " since the last logged visit (" + esc(fmtDate(sl.date)) + ")" : " in the last 90 days") + '</div>';
    h += b.changes && b.changes.length ? '<ul class="q">' + b.changes.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : '<p class="hint">Nothing notable logged in this period.</p>';
    if (b.symptom_checks && b.symptom_checks.length) {
      h += '<div class="panel-name">Symptom checks the patient ran</div><ul class="q">' + b.symptom_checks.map(function (c) { return "<li>" + esc(fmtDate(c.date)) + ": closest pattern <b>" + esc(c.result) + "</b>" + (c.urgency ? " (" + esc(c.urgency) + ")" : "") + "</li>"; }).join("") + "</ul>";
    }
    if (b.flagged_labs && b.flagged_labs.length) h += '<div class="panel-name">Lab values outside the usual range</div><p>' + b.flagged_labs.map(esc).join(", ") + "</p>";
    h += '<p class="hint" style="margin-bottom:0">' + esc(b.note || "") + "</p></div>";
    return h;
  }

  function render(resp) {
    var d = resp.data, p = d.patient || {}, s = d.summary, out = [];
    var exp = new Date(resp.expires_ts * 1000);
    out.push('<div class="banner no-print"><span>Read-only summary shared by the patient · link expires ' + esc(exp.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + '</span><span>' + resp.views_left + ' view' + (resp.views_left === 1 ? "" : "s") + ' left</span></div>');
    out.push('<div class="card"><div class="head"><div><h1>' + esc(p.name || "Patient") + '</h1><div class="meta">' + [p.age != null ? p.age + " years" : "", p.sex && p.sex !== "unknown" ? esc(p.sex) : "", p.blood_type && p.blood_type !== "unknown" ? "Blood group " + esc(p.blood_type) : ""].filter(Boolean).join(" · ") + ' · prepared ' + esc(fmtDate(d.generated_at)) + '</div></div><span style="flex:1"></span><button class="btn ghost no-print" id="print-btn">🖨️ Print / save PDF</button></div>');
    if (s) {
      out.push('<div class="chips">' + (s.medicine_allergies.length ? s.medicine_allergies.map(function (a) { return '<span class="chip red">Allergy: ' + esc(a) + '</span>'; }).join("") : "") +
        (s.conditions.length ? s.conditions.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join("") : '<span class="chip">No ongoing conditions listed</span>') + (s.pregnant ? '<span class="chip amber">Pregnant</span>' : "") + '</div>');
      var more = [];
      if (s.past_conditions.length) more.push("Past conditions: " + list(s.past_conditions));
      if (s.other_allergies.length) more.push("Other allergies: " + list(s.other_allergies));
      if (s.family_history.length) more.push("Family history: " + list(s.family_history));
      var life = [s.smoking, s.alcohol, s.exercise].some(function (x) { return x && x !== "unknown"; });
      if (life) more.push("Smoking: " + esc(s.smoking || "unknown") + " · Alcohol: " + esc(s.alcohol || "unknown") + " · Exercise: " + esc(s.exercise || "unknown"));
      if (more.length) out.push('<p class="hint" style="margin:12px 0 0">' + more.join("<br>") + '</p>');
    }
    out.push('</div>');

    if (d.brief) out.push(briefCard(d.brief));
    if (d.ongoing && d.ongoing.length) out.push('<div class="card"><h2>🔁 Ongoing concerns</h2><div class="chips" style="margin-top:0">' + d.ongoing.map(function (o) { return '<span class="chip amber">' + esc(o.name) + (o.days_open != null ? " · " + o.days_open + " days" : "") + '</span>'; }).join("") + '</div></div>');

    if (d.vitals) {
      var v = d.vitals, l = v.latest || {}, h = (v.history || []).slice().reverse();
      var tiles = [];
      if (l.sys_bp != null && l.dia_bp != null) tiles.push(["Blood pressure", l.sys_bp + "/" + l.dia_bp, "mmHg"]);
      if (l.pulse != null) tiles.push(["Pulse", l.pulse, "bpm"]); if (l.spo2 != null) tiles.push(["SpO₂", l.spo2, "%"]);
      if (l.temp != null) tiles.push(["Temperature", l.temp, "°C"]); if (l.glucose != null) tiles.push(["Glucose", l.glucose, "mg/dL"]); if (l.weight != null) tiles.push(["Weight", l.weight, "kg"]);
      out.push('<div class="card"><h2>❤️ Vitals</h2>' + (tiles.length ? '<div class="tiles">' + tiles.map(function (t) { return '<div class="tile"><span>' + esc(t[0]) + '</span><b>' + esc(t[1]) + ' <small style="font-size:12px;font-weight:700">' + esc(t[2]) + '</small></b></div>'; }).join("") + '</div>' : '<p class="hint">No readings logged.</p>') +
        (v.flags && v.flags.length ? '<div class="chips" style="margin:0 0 10px">' + v.flags.map(function (f) { return '<span class="chip amber">' + esc(f.title || f.message) + '</span>'; }).join("") + '</div>' : "") +
        (h.length > 2 ? '<div class="hint">Systolic trend (' + h.length + ' readings)</div>' + spark(h.map(function (r) { return r.sys_bp; }), "#d24f28") + '<div class="hint">Pulse trend</div>' + spark(h.map(function (r) { return r.pulse; }), "#0e8f83") : "") +
        (h.length ? '<details style="margin-top:8px"><summary class="hint" style="cursor:pointer;font-weight:800">All readings</summary><table><thead><tr><th>Date</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Temp</th><th>Glucose</th><th>Weight</th></tr></thead><tbody>' +
          h.slice().reverse().map(function (r) { return '<tr><td>' + esc(fmtDate(r.ts)) + '</td><td>' + (r.sys_bp != null ? r.sys_bp + "/" + r.dia_bp : "–") + '</td><td>' + (r.pulse != null ? r.pulse : "–") + '</td><td>' + (r.spo2 != null ? r.spo2 : "–") + '</td><td>' + (r.temp != null ? r.temp : "–") + '</td><td>' + (r.glucose != null ? r.glucose : "–") + '</td><td>' + (r.weight != null ? r.weight : "–") + '</td></tr>'; }).join("") + '</tbody></table></details>' : "") + '</div>');
    }

    if (d.labs) {
      var lb = d.labs, body = "";
      (lb.panels || []).forEach(function (pn) {
        if (!pn.markers || !pn.markers.length) return;
        body += '<div class="panel-name">' + esc(pn.name) + '</div><table><thead><tr><th>Test</th><th>Result</th><th>Reference</th><th>Status</th><th>Date</th></tr></thead><tbody>' +
          pn.markers.map(function (m) { return '<tr><td>' + esc(m.name) + '</td><td><b>' + esc(m.value) + '</b> ' + esc(m.unit || "") + (m.trend ? '<div class="hint">' + esc(m.trend) + '</div>' : "") + '</td><td>' + esc(m.range || "") + '</td><td><span class="st ' + esc(m.status || "") + '">' + esc(m.status || "") + '</span></td><td>' + esc(fmtDate(m.date)) + '</td></tr>'; }).join("") + '</tbody></table>';
      });
      out.push('<div class="card"><h2>🧪 Lab results</h2>' + (lb.headline ? '<p style="margin:0 0 6px;font-weight:700">' + esc(lb.headline) + '</p>' : "") + (body || '<p class="hint">No confirmed lab results.</p>') +
        (lb.patterns && lb.patterns.length ? '<div class="panel-name">Patterns noticed</div><ul class="q">' + lb.patterns.map(function (x) { return '<li><b>' + esc(x.title) + '</b> ' + esc(x.summary || "") + '</li>'; }).join("") + '</ul>' : "") + '<p class="hint" style="margin-top:10px">' + esc(lb.note) + '</p></div>');
    }
    if (d.imaging) out.push('<div class="card"><h2>🩻 Scan reports</h2>' + (d.imaging.length ? '<ul class="q">' + d.imaging.map(function (r) { return '<li><b>' + esc(r.modality || "Scan") + '</b> ' + esc(fmtDate(r.date)) + ' — ' + esc(r.summary || "") + '</li>'; }).join("") + '</ul>' : '<p class="hint">No scan reports.</p>') + '</div>');
    if (d.medicines) out.push('<div class="card"><h2>💊 Current medicines</h2>' + (d.medicines.length ? '<table><thead><tr><th>Medicine</th><th>Dose</th><th>Schedule</th></tr></thead><tbody>' + d.medicines.map(function (m) { return '<tr><td><b>' + esc(m.name) + '</b></td><td>' + esc(m.dose || "") + '</td><td>' + esc(m.schedule || "") + '</td></tr>'; }).join("") + '</tbody></table>' : '<p class="hint">No active prescriptions on file.</p>') + '</div>');
    if (d.symptoms) out.push('<div class="card"><h2>🔍 Recent symptom checks</h2>' + (d.symptoms.length ? '<ul class="q">' + d.symptoms.map(function (x) { return '<li>' + esc(fmtDate(x.ts)) + ' — possible: ' + esc(x.condition) + '</li>'; }).join("") + '</ul><p class="hint">Self-reported, not diagnoses.</p>' : '<p class="hint">None in the last 60 days.</p>') + '</div>');
    if (d.questions && d.questions.length) out.push('<div class="card"><h2>❓ Questions the patient may want to ask</h2><ul class="q">' + d.questions.map(function (q) { return '<li>' + esc(typeof q === "string" ? q : (q.question || q.text || "")) + '</li>'; }).join("") + '</ul></div>');
    out.push('<p class="foot">' + esc(d.disclaimer) + '<br>Generated by QueroCura (querocura.com). This page is only available through a private link and will stop working when it expires or is turned off by the patient. Please don\'t forward it.</p>');

    $("gate").style.display = "none";
    var r = $("report"); r.innerHTML = out.join(""); r.style.display = "";
    var pb = $("print-btn"); if (pb) pb.addEventListener("click", function () { window.print(); });
    document.title = "Health summary — " + (p.name || "Patient");
  }

  post().then(function (d) { handle(d, false); });
})();
