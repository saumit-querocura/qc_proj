/* QueroCura for Doctors, inside the portal.
 *
 * 1. Insights: what the doctor's own visits say about their practice: visits a week, the busiest days and hours (a heat
 *    map), real consultation length against the slot length, waits, no-shows, the commonest reasons for visits, who is
 *    past their follow-up date, and suggestions with the reason for each.
 * 2. My hours: a doctor's week in one form (which days, a morning and an optional evening session, slot length) and
 *    days off, so a doctor working alone can start taking bookings in a minute.
 * 3. Getting started (solo practice): a three-step checklist on My day until it is done.
 * 4. Doctors joining: the clinic's join code and the requests waiting for approval, on the Team page.
 * Plugs into hospital.js through window.QCHosp; exposes window.QCDoc. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function can(p) { return H().can(p); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  function me() { return H().me() || {}; }
  function solo() { return ((me().org || {}).practice) === "solo"; }
  function modal(html) { el("doc-body").innerHTML = html; H().P.openModal("doc-modal"); return el("doc-body"); }
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /* ---------------------------------------------------------------- insights */
  var scope = "me";
  function bars(per) {
    var max = Math.max.apply(null, per.concat([1])), W = 520, Hh = 150, bw = W / per.length;
    return '<svg class="pi-bars" viewBox="0 0 ' + W + " " + (Hh + 22) + '" role="img" aria-label="Visits each week for the last 12 weeks">' +
      '<defs><linearGradient id="pi-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#14c3b2"/><stop offset="1" stop-color="#2b6fe8"/></linearGradient></defs>' +
      per.map(function (v, i) {
        var h = Math.max(2, (Hh - 18) * v / max), x = i * bw + 6;
        return '<rect x="' + x + '" y="' + (Hh - h) + '" width="' + (bw - 12) + '" height="' + h + '" rx="6" fill="url(#pi-g)" class="pi-bar" style="animation-delay:' + i * 40 + 'ms"><title>' + v + " visits</title></rect>" +
          (v ? '<text x="' + (x + (bw - 12) / 2) + '" y="' + (Hh - h - 6) + '" text-anchor="middle" class="pi-v">' + v + "</text>" : "") +
          '<text x="' + (x + (bw - 12) / 2) + '" y="' + (Hh + 16) + '" text-anchor="middle" class="pi-x">' + (i === per.length - 1 ? "this wk" : (per.length - 1 - i) + "w") + "</text>";
      }).join("") + "</svg>";
  }
  function heat(grid) {
    var hours = [];
    for (var h = 0; h < 24; h++) if (grid.some(function (r) { return r[h]; })) hours.push(h);
    if (!hours.length) return "";
    var lo = Math.max(0, Math.min(8, hours[0] - 1)), hi = Math.min(23, Math.max(20, hours[hours.length - 1] + 1)), max = 1;   // at least the working day
    grid.forEach(function (r) { r.forEach(function (v) { max = Math.max(max, v); }); });
    var cols = hi - lo + 1, cw = Math.min(34, 560 / cols), W = 46 + cols * cw, Hh = 7 * 26 + 24;
    var s = '<svg class="pi-heat" viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="When patients come, by day and hour">';
    for (var hh = lo; hh <= hi; hh++) if ((hh - lo) % 2 === 0) s += '<text x="' + (46 + (hh - lo) * cw + cw / 2) + '" y="12" text-anchor="middle" class="pi-x">' + hh + "</text>";
    grid.forEach(function (r, d) {
      s += '<text x="38" y="' + (24 + d * 26 + 17) + '" text-anchor="end" class="pi-x">' + DAYS[d] + "</text>";
      for (var h2 = lo; h2 <= hi; h2++) {
        var v = r[h2], a = v ? 0.15 + 0.85 * v / max : 0.05;
        s += '<rect x="' + (46 + (h2 - lo) * cw + 1) + '" y="' + (24 + d * 26) + '" width="' + (cw - 2) + '" height="24" rx="5" fill="' + (v ? "rgba(43,111,232," + a.toFixed(2) + ")" : "rgba(127,127,127,.08)") + '"><title>' + DAYS[d] + " " + h2 + ":00 · " + v + " visits</title></rect>";
      }
    });
    return s + "</svg>";
  }
  function loadInsights() {
    var box = el("tab-insights");
    box.innerHTML = '<div class="pi"><div class="mind-skel"></div></div>';
    api("/hospital/practice/insights?scope=" + scope).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message || "Couldn't load insights.") + "</div>"; return; }
      var whole = !solo() && (can("reports") || can("team"));
      var h = '<div class="pi"><div class="pi-head"><div><h2>' + (r.scope === "all" ? "Your practice" : "Your practice, in numbers") + '</h2><p class="sub">The last ' + r.weeks + " weeks" + (r.scope === "all" ? ", every doctor." : ", your own patients.") + " Every suggestion says why.</p></div>" +
        (whole ? '<div class="seg" role="group" aria-label="Whose numbers"><button type="button" data-pi-scope="me" class="' + (r.scope === "me" ? "on" : "") + '">Mine</button><button type="button" data-pi-scope="all" class="' + (r.scope === "all" ? "on" : "") + '">Everyone</button></div>' : "") +
        '<button type="button" class="btn btn-sm" data-doc-hours>🗓️ My hours</button></div>';
      if (r.empty) h += '<div class="md-clear"><span aria-hidden="true">📈</span><b>Nothing to show yet.</b><small>' + esc(r.empty) + "</small></div>";
      if (r.cards.length) h += '<div class="pi-cards">' + r.cards.map(function (c) { return '<div class="pi-card ' + esc(c.tone || "") + '"><span>' + esc(c.k) + "</span><b>" + esc(c.v) + "</b><small>" + esc(c.s || "") + "</small></div>"; }).join("") + "</div>";
      if (r.suggestions.length) h += '<h3>What would help</h3><div class="pi-sug">' + r.suggestions.map(function (s, i) {
        return '<div class="mind-sug ' + (s.level === "warning" ? "warn" : "") + '"><div class="grow"><b>' + esc(s.title) + "</b><p>" + esc(s.text) + '</p><button type="button" class="link" data-pi-why="' + i + '">Why?</button><p class="md-why" id="pi-why-' + i + '" hidden>' + esc(s.basis) + "</p></div>" +
          (s.action && s.action.tab ? '<button type="button" class="btn btn-sm" data-goto="' + esc(s.action.tab) + '">Open</button>' : "") + "</div>";
      }).join("") + "</div>";
      if (r.visits) {
        h += '<div class="pi-grid"><div class="card"><h3>Visits a week</h3>' + bars(r.per_week) + '</div><div class="card"><h3>When patients come</h3>' + heat(r.heat) + '<p class="mini">Darker is busier. Use it to place your sessions where the patients are.</p></div></div>';
        h += '<div class="pi-grid"><div class="card"><h3>Commonest reasons for visits</h3>' + (r.reasons.length ? '<ul class="pi-rs">' + r.reasons.map(function (x) {
          return '<li><span>' + esc(x.label) + '</span><i><u style="width:' + Math.max(4, x.share) + '%"></u></i><b>' + x.n + "</b></li>";
        }).join("") + "</ul>" : '<p class="mini">Write the reason when checking patients in, and the common ones show up here.</p>') + "</div>" +
          '<div class="card"><h3>Past their follow-up date</h3>' + (r.follow_ups.length ? '<ul class="pi-fu">' + r.follow_ups.map(function (f) {
            return '<li><div class="grow"><b>' + esc(f.name) + '</b><small>' + esc(f.mrn || "") + " · follow-up was due " + esc(f.due) + '</small></div><button type="button" class="btn btn-sm" data-goto="appointments">Book</button></li>';
          }).join("") + "</ul>" : '<p class="mini">Nobody is overdue. Patients appear here when a follow-up date on their prescription passes with no visit or booking since.</p>') + "</div></div>";
      }
      h += '<p class="mini pi-note">Insights describe how the practice runs. They are not clinical advice.</p></div>';
      box.innerHTML = h;
    });
  }
  document.addEventListener("click", function (e) {
    var s = e.target.closest("[data-pi-scope]"); if (s) { scope = s.getAttribute("data-pi-scope"); loadInsights(); return; }
    var w = e.target.closest("[data-pi-why]"); if (w) { var p = el("pi-why-" + w.getAttribute("data-pi-why")); if (p) p.hidden = !p.hidden; return; }
    if (e.target.closest("[data-doc-hours]")) { myHours(); return; }
    if (e.target.closest("[data-doc-booking]")) { booking(); return; }
    var gt = e.target.closest("#tab-insights [data-goto], #doc-body [data-goto]"); if (gt) { H().P.closeModal("doc-modal"); H().go(gt.getAttribute("data-goto")); return; }
    var j = e.target.closest("[data-join-decide]"); if (j) { decide(j); return; }
    if (e.target.closest("[data-join-renew]")) { renew(); return; }
    if (e.target.closest("[data-join-copy]")) { var c = el("join-code-v"); if (c && navigator.clipboard) navigator.clipboard.writeText(c.textContent.replace(/\s/g, "")).then(function () { toast("Code copied."); }); }
  });

  /* ---------------------------------------------------------------- my hours */
  function guess(blocks) {
    var g = { days: [0, 1, 2, 3, 4, 5], m1: "09:00", m2: "13:00", e1: "17:00", e2: "20:00", evening: false, slot: 15 };
    if (!blocks.length) return g;
    var am = blocks.filter(function (b) { return b.start < "14:00"; }), pm = blocks.filter(function (b) { return b.start >= "14:00"; });
    g.days = blocks.map(function (b) { return b.weekday; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
    if (am[0]) { g.m1 = am[0].start; g.m2 = am[0].end; }
    if (pm[0]) { g.evening = true; g.e1 = pm[0].start; g.e2 = pm[0].end; if (!am[0]) { g.m1 = ""; } }
    g.slot = blocks[0].slot_min;
    return g;
  }
  function myHours() {
    var id = (me().staff || {}).id;
    var body = modal('<h2 id="doc-title">My hours</h2><div class="mind-skel" style="height:180px"></div>');
    api("/hospital/schedules/" + id).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { body.innerHTML = '<h2>My hours</h2><div class="notice bad">' + esc(r.message || "Couldn't load your schedule.") + "</div>"; return; }
      var g = guess(r.blocks || []);
      body.innerHTML = '<h2 id="doc-title">My hours</h2><p class="sub">The days and times you see patients. Bookings go into these slots, and My day plans around them.</p>' +
        '<form id="hrs-form" novalidate><div class="lbl">Days</div><div class="hrs-days">' + DAYS.map(function (d, i) { return '<label class="hrs-day"><input type="checkbox" value="' + i + '"' + (g.days.indexOf(i) >= 0 ? " checked" : "") + "><span>" + d + "</span></label>"; }).join("") + "</div>" +
        '<div class="hrs-row"><label class="hp-check"><input type="checkbox" id="hrs-am"' + (g.m1 ? " checked" : "") + '> <span>Morning</span></label><input class="input" type="time" id="hrs-m1" value="' + esc(g.m1 || "09:00") + '"><span>to</span><input class="input" type="time" id="hrs-m2" value="' + esc(g.m2) + '"></div>' +
        '<div class="hrs-row"><label class="hp-check"><input type="checkbox" id="hrs-pm"' + (g.evening ? " checked" : "") + '> <span>Evening</span></label><input class="input" type="time" id="hrs-e1" value="' + esc(g.e1) + '"><span>to</span><input class="input" type="time" id="hrs-e2" value="' + esc(g.e2) + '"></div>' +
        '<div class="hrs-row"><label for="hrs-slot">Each appointment</label><select class="input" id="hrs-slot">' + [5, 10, 15, 20, 30, 45, 60].map(function (m) { return '<option value="' + m + '"' + (m === g.slot ? " selected" : "") + ">" + m + " min</option>"; }).join("") + "</select></div>" +
        '<p class="mini" id="hrs-sum"></p><div class="row"><button class="btn btn-primary" type="submit">Save my hours</button></div><div class="msg" id="hrs-msg" role="status"></div></form>' +
        '<hr class="hp-hr"><h3>Days off</h3><div id="hrs-leave">' + ((r.leaves || []).length ? '<ul class="hrs-lv">' + r.leaves.map(function (l) { return '<li>' + esc(l.from) + (l.to !== l.from ? " to " + esc(l.to) : "") + (l.reason ? " · " + esc(l.reason) : "") + ' <button type="button" class="link" data-lv-rm="' + esc(l.id) + '">Remove</button></li>'; }).join("") + "</ul>" : '<p class="mini">None planned.</p>') + "</div>" +
        '<form id="lv-form" class="hrs-row" novalidate><input class="input" type="date" id="lv-from" aria-label="From"><span>to</span><input class="input" type="date" id="lv-to" aria-label="To"><input class="input" id="lv-why" placeholder="Reason (optional)" maxlength="80"><button class="btn" type="submit">Add days off</button></form><div class="msg" id="lv-msg" role="status"></div>';
      var form = el("hrs-form");
      var read = function () {
        var days = [].map.call(form.querySelectorAll(".hrs-days input:checked"), function (c) { return +c.value; }), slot = +el("hrs-slot").value, blocks = [];
        days.forEach(function (d) {
          if (el("hrs-am").checked) blocks.push({ weekday: d, start: el("hrs-m1").value, end: el("hrs-m2").value, slot_min: slot, per_slot: 1 });
          if (el("hrs-pm").checked) blocks.push({ weekday: d, start: el("hrs-e1").value, end: el("hrs-e2").value, slot_min: slot, per_slot: 1 });
        });
        return blocks;
      };
      var mins = function (t) { var p = (t || "0:0").split(":"); return +p[0] * 60 + +p[1]; };
      var summary = function () {
        var b = read(), slots = b.reduce(function (n, x) { return n + Math.max(0, Math.floor((mins(x.end) - mins(x.start)) / x.slot_min)); }, 0);
        el("hrs-sum").textContent = b.length ? b.length + " session" + (b.length === 1 ? "" : "s") + " a week, about " + slots + " appointments." : "No sessions: patients can't book you yet.";
      };
      form.addEventListener("input", summary); form.addEventListener("change", summary); summary();
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var b = read(), msg = el("hrs-msg");
        if (el("hrs-am").checked && el("hrs-pm").checked && mins(el("hrs-e1").value) < mins(el("hrs-m2").value)) return H().say(msg, "The evening session starts before the morning one ends.", "err");
        api("/hospital/schedules/" + id, { method: "POST", body: { blocks: b } }).then(function (x) { H().say(msg, x.message || (x.ok ? "Saved." : "Couldn't save."), x.ok ? "ok" : "err"); if (x.ok) toast(x.message); });
      });
      el("lv-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var f = el("lv-from").value, t = el("lv-to").value || f;
        if (!f) return H().say(el("lv-msg"), "Choose the first day off.", "err");
        api("/hospital/schedules/" + id + "/leave", { method: "POST", body: { from: f, to: t, reason: el("lv-why").value.trim() } }).then(function (x) {
          H().say(el("lv-msg"), (x.message || "") + (x.clashes ? " " + x.clashes + " booked patient" + (x.clashes === 1 ? " needs" : "s need") + " moving." : ""), x.ok ? "ok" : "err");
          if (x.ok) setTimeout(myHours, 900);
        });
      });
      body.addEventListener("click", function (e) {
        var rm = e.target.closest("[data-lv-rm]");
        if (rm) api("/hospital/schedules/" + id + "/leave", { method: "POST", body: { remove: rm.getAttribute("data-lv-rm") } }).then(function (x) { toast(x.message || "Removed.", x.ok ? "" : "err"); myHours(); });
      });
    });
  }

  /* ---------------------------------------------------------------- getting started (solo) */
  function starter(box) {
    if (!solo() || !box) return;
    var id = (me().staff || {}).id, done = {};
    try { done = JSON.parse(localStorage.getItem("qc-solo-start") || "{}"); } catch (x) {}
    if (done.hidden) return;
    Promise.all([api("/hospital/schedules/" + id), api("/hospital/patients?q="), can("prices") || can("billing_admin") ? api("/hospital/billing/prices") : Promise.resolve({})]).then(function (rs) {
      var steps = [
        ["🗓️", "Set your hours", "Which days and times you see patients.", (rs[0].blocks || []).length > 0, "data-doc-hours"],
        ["🧾", "Set your fees", "Consultation and follow-up fees for bills.", (rs[2].items || []).length > 0, 'data-goto="billing"'],
        ["🗂️", "Add your first patient", "Register them, then book or start a visit.", (rs[1].items || []).length > 0, 'data-goto="patients"'],
      ];
      if (steps.every(function (s) { return s[3]; })) return;
      var n = steps.filter(function (s) { return s[3]; }).length;
      var div = document.createElement("div");
      div.className = "solo-start";
      div.innerHTML = '<div class="ss-h"><div><b>Getting your practice ready</b><small>' + n + " of 3 done</small></div><i><u style=\"width:" + Math.round(100 * n / 3) + '%"></u></i><button type="button" class="link" data-ss-hide>Hide</button></div><div class="ss-steps">' +
        steps.map(function (s) { return '<button type="button" class="ss-step' + (s[3] ? " done" : "") + '" ' + s[4] + '><span aria-hidden="true">' + (s[3] ? "✓" : s[0]) + "</span><b>" + esc(s[1]) + "</b><small>" + esc(s[2]) + "</small></button>"; }).join("") + "</div>";
      box.insertBefore(div, box.firstChild);
      div.querySelector("[data-ss-hide]").onclick = function () { try { localStorage.setItem("qc-solo-start", JSON.stringify({ hidden: 1 })); } catch (x) {} div.remove(); };
    });
  }

  /* ---------------------------------------------------------------- doctors joining a clinic (Team page) */
  function exportCard(box) {
    if (!box || !can("org")) return;
    var card = document.createElement("div");
    card.className = "card ex-card";
    card.innerHTML = '<h2>Your data</h2><p class="sub">Download everything your organisation holds on QueroCura: every table as JSON and CSV, each patient’s record as FHIR, and a checksummed manifest. Passwords and sign-in secrets are never included.</p>' +
      '<form id="ex-f" novalidate><div class="field"><label for="ex-pw">Your password, to confirm</label><input class="input" id="ex-pw" type="password" autocomplete="current-password"></div>' +
      '<label class="hp-check"><input type="checkbox" id="ex-fhir" checked> <span>Include FHIR records for each patient (slower)</span></label>' +
      '<button class="btn" type="submit">Download all data</button><div class="msg" id="ex-msg" role="status"></div><p class="mini">The file contains every patient’s information. Keep it encrypted and delete copies you don’t need.</p></form>';
    var three = box.querySelector(".three"); (three || box).appendChild(card);
    el("ex-f").onsubmit = function (e) {
      e.preventDefault();
      var msg = el("ex-msg"), btn = e.target.querySelector("button");
      btn.disabled = true; H().say(msg, "Preparing your export…");
      fetch(H().P.API + "/hospital/export", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: el("ex-pw").value, fhir: el("ex-fhir").checked }) }).then(function (x) {
        el("ex-pw").value = ""; btn.disabled = false;
        if (!x.ok) return x.json().then(function (j) { H().say(msg, (j && j.message) || "Couldn’t export.", "err"); });
        return x.blob().then(function (b) {
          var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "querocura-export.zip"; document.body.appendChild(a); a.click(); a.remove();
          H().say(msg, "Downloaded. Store it safely.", "ok");
        });
      });
    };
  }

  function teamExtras(box) {
    exportCard(box);
    if (!box || !can("team") || solo()) return;
    api("/hospital/team/join").then(function (r) {
      if (!r.ok) return;
      var card = document.createElement("div");
      card.className = "card join-card";
      var c = r.code || "";
      card.innerHTML = '<div class="card-h"><h2>Doctors joining</h2></div><p class="sub">A doctor who works here can ask to join from <b>querocura.com/doctor</b> with this code. You approve each request; nobody joins without it.</p>' +
        '<div class="join-code"><b id="join-code-v">' + esc(c.slice(0, 4) + " " + c.slice(4)) + '</b><button type="button" class="btn btn-sm" data-join-copy>Copy</button><button type="button" class="btn btn-sm btn-ghost" data-join-renew>Make a new code</button></div>' +
        (r.requests.length ? "<h3>Waiting for you (" + r.requests.length + ")</h3>" + r.requests.map(function (q) {
          return '<div class="join-req"><div class="avatar sm">' + esc(H().initials(q.name)) + '</div><div class="grow"><b>' + esc(q.name) + "</b><small>" + esc(q.email) + "</small><small>" + esc([q.qualification, q.specialty].filter(Boolean).join(" · ")) + "</small>" +
            '<small class="jr-reg">Registration ' + esc(q.reg_no || "–") + " · " + esc(q.council || "") + "</small>" + (q.note ? '<p class="mini">“' + esc(q.note) + "”</p>" : "") + "</div>" +
            '<div class="row-actions"><button type="button" class="btn btn-sm btn-primary" data-join-decide="approve" data-sid="' + esc(q.staff_id) + '">Approve</button><button type="button" class="btn btn-sm btn-danger" data-join-decide="reject" data-sid="' + esc(q.staff_id) + '">Decline</button></div></div>';
        }).join("") + '<p class="mini">Check the registration number with the council before approving.</p>' : '<p class="mini">No requests waiting.</p>');
      var first = box.querySelector(".three");
      if (first) first.insertBefore(card, first.children[1] || null); else box.appendChild(card);
    });
  }
  function decide(btn) {
    var d = btn.getAttribute("data-join-decide");
    if (d === "reject" && !window.confirm("Decline this request? Their account is removed.")) return;
    btn.disabled = true;
    api("/hospital/team/join/" + btn.getAttribute("data-sid"), { method: "POST", body: { decision: d } }).then(function (r) { toast(r.message || "Done.", r.ok ? "" : "err"); H().go("team"); });
  }
  function renew() {
    if (!window.confirm("Make a new code? The old one stops working straight away.")) return;
    api("/hospital/team/join/code", { method: "POST", body: {} }).then(function (r) { toast(r.message || "Done.", r.ok ? "" : "err"); H().go("team"); });
  }

  /* ---------------------------------------------------------------- online booking and self check-in (admin) */
  function booking() {
    var body = modal('<h2 id="doc-title">Online booking &amp; check-in</h2><div class="mind-skel" style="height:200px"></div>');
    api("/hospital/booking").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { body.innerHTML = '<h2>Online booking</h2><div class="notice bad">' + esc(r.message || "Couldn't load.") + "</div>"; return; }
      var site = location.origin, link = site + "/book/?c=" + r.slug, cin = site + "/checkin/?k=" + (r.checkin_key || "");
      var verified = (me().org || {}).status === "active";
      body.innerHTML = '<h2 id="doc-title">Online booking &amp; check-in</h2><p class="sub">Patients book real free slots from the QueroCura app, see when they’re likely to be seen, get told if you’re running late, and check themselves in by QR.</p>' +
        (verified ? "" : '<div class="notice wait">This switches on once your organisation is verified.</div>') +
        '<form id="bk-set" novalidate><label class="hp-check"><input type="checkbox" id="bs-on"' + (r.enabled ? " checked" : "") + (verified ? "" : " disabled") + '> <span><b>Take bookings online</b></span></label>' +
        '<div class="bs-link"><span>Your booking link</span><div class="row"><input class="input" id="bs-slug" value="' + esc(r.slug) + '" maxlength="40" aria-label="Link name"><button type="button" class="btn btn-sm" data-copy="' + esc(link) + '">Copy link</button></div><small>' + esc(link) + "</small></div>" +
        '<div class="lbl">Doctors who take online bookings</div><div class="bs-docs">' + r.doctors.map(function (d) { return '<label class="hp-check"><input type="checkbox" data-bdoc="' + esc(d.id) + '"' + (d.online ? " checked" : "") + "> <span>" + esc(d.name) + "</span></label>"; }).join("") + "</div>" +
        '<div class="hrs-row"><label for="bs-days">Book up to</label><select class="input" id="bs-days">' + [3, 7, 14, 21, 30, 60].map(function (n) { return '<option value="' + n + '"' + (n === r.days_ahead ? " selected" : "") + ">" + n + " days ahead</option>"; }).join("") + "</select></div>" +
        '<label class="hp-check"><input type="checkbox" id="bs-walk"' + (r.walkins ? " checked" : "") + '> <span>Let walk-ins join the queue from their phone</span></label>' +
        '<div class="field"><label for="bs-note">A note patients see</label><input class="input" id="bs-note" maxlength="300" value="' + esc(r.note) + '" placeholder="e.g. Please bring your old reports"></div>' +
        '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="bs-msg" role="status"></div></form>' +
        (r.checkin_key ? '<hr class="hp-hr"><h3>Check-in poster</h3><p class="sub">Print it for reception. Patients scan it, tap “I’m here” and see their place in the queue.</p><div class="bs-qr"><img id="bs-qr" alt="Check-in QR code" width="180" height="180"><div><button type="button" class="btn btn-sm btn-primary" id="bs-print">Print poster</button> <button type="button" class="btn btn-sm btn-ghost" id="bs-new">Make a new code</button><p class="mini">A new code stops the old poster working.</p></div></div>' : "");
      fetch(H().P.API + "/hospital/booking/qr.svg?for=checkin", { credentials: "include" }).then(function (x) { return x.ok ? x.blob() : null; }).then(function (b) { var i = el("bs-qr"); if (b && i) i.src = URL.createObjectURL(b); }).catch(function () {});
      el("bk-set").onsubmit = function (e) {
        e.preventDefault();
        var docs = [].map.call(body.querySelectorAll("[data-bdoc]:checked"), function (c) { return c.getAttribute("data-bdoc"); });
        api("/hospital/booking", { method: "POST", body: { enabled: el("bs-on").checked, slug: el("bs-slug").value.trim(), doctors: docs, days_ahead: +el("bs-days").value, walkins: el("bs-walk").checked, note: el("bs-note").value } }).then(function (x) {
          H().say(el("bs-msg"), x.message || (x.ok ? "Saved." : "Couldn't save."), x.ok ? "ok" : "err"); if (x.ok) toast("Saved.");
        });
      };
      body.onclick = function (e) {
        var c = e.target.closest("[data-copy]"); if (c && navigator.clipboard) { navigator.clipboard.writeText(c.getAttribute("data-copy")).then(function () { toast("Link copied."); }); return; }
        if (e.target.id === "bs-new") { if (!window.confirm("Make a new check-in code? Reprint the poster afterwards.")) return; api("/hospital/booking", { method: "POST", body: { new_checkin_code: true } }).then(function () { booking(); }); return; }
        if (e.target.id === "bs-print") {
          var src = el("bs-qr").src, w = window.open("", "_blank", "noopener=no,width=620,height=820");
          if (!w) return toast("Allow pop-ups to print the poster.", "err");
          w.document.write('<!doctype html><title>Check in</title><body style="font-family:Arial,sans-serif;text-align:center;padding:40px"><h1 style="font-size:40px;margin:0">' + esc((me().org || {}).name || "") + '</h1><p style="font-size:24px">Arrived? Check in with your phone</p><img src="' + src + '" style="width:340px;height:340px"><p style="font-size:20px">1. Scan with your camera &nbsp; 2. Tap “I’m here” &nbsp; 3. Take a seat</p><p style="color:#666">Your place in the queue shows on your phone. No phone? Please see the desk.</p><p style="color:#0e8f83;font-weight:bold">QueroCura</p></body>');
          w.document.close(); setTimeout(function () { w.print(); }, 500);
        }
      };
    });
  }

  window.QCDoc = {
    booking: booking,
    tabs: function (canFn) { return [["insights", "Insights", canFn("rx") || canFn("reports") || canFn("team"), "flow"]]; },
    loaders: function () { return { insights: loadInsights }; },
    myHours: myHours, starter: starter, teamExtras: teamExtras,
  };
})();
