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
    h += shareCard(d);
    el("out").innerHTML = h;
    wireShare(d);
  }

  /* ---------- send the brief to the doctor ---------- */
  var SECTIONS = [["summary", "Basics, allergies and conditions", true], ["vitals", "Vitals and trends", true], ["labs", "Lab results", true], ["imaging", "Scan reports", false],
    ["medicines", "Current medicines", true], ["symptoms", "Recent symptom checks", true], ["questions", "My questions", true]];

  function hoursOptions(d) {
    var opts = [[24, "1 day"], [48, "2 days"], [72, "3 days"], [168, "7 days"]], pick = 48;
    if (d.visit && d.visit.in_days != null) {
      var need = (d.visit.in_days + 2) * 24;
      pick = opts.reduce(function (b, o) { return o[0] >= need && (b === null || o[0] < b) ? o[0] : b; }, null) || 168;
    }
    return opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === pick ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  }

  function shareCard(d) {
    return '<div class="card no-print" id="share-card"><h2>Send this to your doctor</h2>' +
      '<p class="sub">Make a private link (and QR code) so your doctor can read a one-page brief before you walk in. Only you choose what is in it, it needs a PIN, it stops working on its own, and you can switch it off any time.</p>' +
      '<div class="field"><label for="b-reason">Why are you going? (in your own words)</label><textarea class="input" id="b-reason" rows="2" maxlength="300" placeholder="e.g. Headaches most mornings for two weeks, and my BP readings have been higher"></textarea></div>' +
      '<div class="field"><label>What worries you most? (up to 3)</label>' +
        [1, 2, 3].map(function (i) { return '<input class="input b-concern" maxlength="160" placeholder="' + (i === 1 ? "e.g. Could it be my blood pressure?" : "Another concern (optional)") + '" style="margin-bottom:6px">'; }).join("") + "</div>" +
      '<div class="lbl">Include</div><div class="scopes">' + SECTIONS.map(function (x) { return '<label class="scope' + (x[2] ? " on" : "") + '"><input type="checkbox" data-sec="' + x[0] + '"' + (x[2] ? " checked" : "") + "> <span>" + esc(x[1]) + "</span></label>"; }).join("") + "</div>" +
      '<div class="grid2"><div class="field"><label for="b-hours">Link works for</label><select class="input" id="b-hours">' + hoursOptions(d) + "</select></div></div>" +
      '<div class="row"><button class="btn btn-primary" id="b-make" type="button">Create link and QR code</button></div>' +
      '<div class="msg" id="b-msg" role="status"></div><div id="b-out" hidden></div></div>';
  }

  function wireShare() {
    var card = el("share-card"); if (!card) return;
    card.addEventListener("change", function (e) { var l = e.target.closest && e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); });
    el("b-make").addEventListener("click", function () {
      var btn = this, msg = el("b-msg");
      var scopes = ["brief"].concat(Array.prototype.map.call(card.querySelectorAll("[data-sec]:checked"), function (c) { return c.getAttribute("data-sec"); }));
      var concerns = Array.prototype.map.call(card.querySelectorAll(".b-concern"), function (i) { return i.value.trim(); }).filter(Boolean);
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Making your link...";
      api("/share/create", { method: "POST", body: { hours: +el("b-hours").value, scopes: scopes, label: "Visit prep", max_views: 10, brief: { reason: el("b-reason").value.trim(), concerns: concerns } } }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.className = "msg err"; msg.textContent = r.message || "Couldn't make the link."; return; }
        msg.textContent = ""; showLink(r);
        api("/share/qr", { method: "POST", body: { url: r.url } }).then(function (q) { if (q.ok && el("b-qr")) { el("b-qr").src = q.png; el("b-qr").hidden = false; } });
      });
    });
  }

  function showLink(r) {
    var out = el("b-out"), until = new Date(r.expires_ts * 1000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    out.hidden = false;
    out.innerHTML = '<div class="shared"><div class="qrbox"><img id="b-qr" alt="QR code for your doctor to scan" width="210" height="210" hidden></div><div class="grow">' +
      '<div class="lbl">PIN (tell your doctor separately: say it, or send it in another message)</div><div class="pin">' + esc(r.pin || "") + '</div>' +
      '<div class="lbl" style="margin-top:12px">Link</div><input class="input" id="b-url" readonly value="' + esc(r.url) + '">' +
      '<div class="row" style="margin-top:10px"><button class="btn btn-sm" id="b-copy" type="button">Copy link</button>' +
        (navigator.share ? '<button class="btn btn-sm" id="b-share" type="button">Share...</button>' : "") +
        '<a class="btn btn-sm" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent("My health summary for our visit (private link, works until " + until + "): " + r.url + "\nI will send the PIN separately.") + '">WhatsApp</a></div>' +
      '<p class="hint" style="margin-top:10px">Works until ' + esc(until) + ' · opens up to ' + esc(r.max_views) + ' times.</p>' +
      '<div class="row"><button class="btn btn-sm" id="b-seen" type="button">Has my doctor opened it?</button><button class="btn btn-sm btn-danger" id="b-off" type="button">Turn the link off</button></div>' +
      '<div class="msg" id="b-state" role="status"></div></div></div>';
    el("b-copy").addEventListener("click", function () { QC.copy(r.url).then(function () { P.toast("Link copied. Send the PIN separately.", ""); }, function () { P.toast("Couldn't copy.", "err"); }); });
    var sh = el("b-share");
    if (sh) sh.addEventListener("click", function () { navigator.share({ title: "My health summary", text: "My health summary for our visit. I will send the PIN separately.", url: r.url }).catch(function () {}); });
    el("b-seen").addEventListener("click", function () {
      api("/share/" + r.id + "/log").then(function (l) {
        var m = el("b-state"); m.className = "msg";
        var seen = (l.log || []).filter(function (x) { return x.outcome === "viewed"; });
        m.textContent = seen.length ? "Opened " + seen.length + " time" + (seen.length === 1 ? "" : "s") + ", most recently " + new Date(seen[0].ts * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " (" + seen[0].device + ")." : "Not opened yet.";
      });
    });
    el("b-off").addEventListener("click", function () {
      api("/share/" + r.id + "/revoke", { method: "POST" }).then(function (x) { var m = el("b-state"); m.className = "msg " + (x.ok ? "ok" : "err"); m.textContent = x.ok ? "The link is off. Nobody can open it now." : (x.message || "Couldn't turn it off."); });
    });
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
