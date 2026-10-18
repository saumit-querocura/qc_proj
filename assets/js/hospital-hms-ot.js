/* QueroCura for Hospitals: hospital management, part 3.
 * Operation theatres (the day's list per theatre, booking with clash checks, the WHO Surgical Safety Checklist inside
 * each case) and discharge summaries.  Registers the Theatres tab through window.QCHms.
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function can(p) { return H().can(p); }
  function toast(m, k) { H().P.toast(m, k); }
  var Q = window.QCHms, M = Q.M;
  var S = { day: M.today(), data: null };
  var START = 8 * 60, SPAN = 12 * 60;

  function hm(s) { var m = /^(\d{2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : 0; }

  /* ---------------------------------------------------------------- the day's list */
  function loadOt() {
    var box = el("tab-ot");
    if (!S.data) box.innerHTML = '<div class="empty">Loading…</div>';
    api("/hospital/ot?day=" + S.day).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="msg err">' + esc(r.message || "Couldn't load the theatre list.") + "</div>"; return; }
      S.data = r;
      var c = r.counts;
      var h = '<div class="ot-head"><div class="ot-day"><button class="btn btn-sm btn-ghost" type="button" data-d="-1" aria-label="Previous day">‹</button><input class="input" type="date" id="ot-date" value="' + S.day + '">' +
        '<button class="btn btn-sm btn-ghost" type="button" data-d="1" aria-label="Next day">›</button>' + (S.day !== M.today() ? '<button class="btn btn-sm btn-ghost" type="button" data-today>Today</button>' : "") + "</div>" +
        '<div class="ot-kpis"><div><b>' + c.total + "</b><span>cases</span></div><div><b>" + c.in_progress + "</b><span>in theatre</span></div><div><b>" + c.done + "</b><span>done</span></div>" + (c.emergency ? '<div class="em"><b>' + c.emergency + "</b><span>emergency</span></div>" : "") + "</div>" +
        '<div class="ot-btns">' + (can("structure") ? '<button class="btn btn-sm btn-ghost" type="button" data-theatres>Theatres</button>' : "") + (can("ot") && r.theatres.length ? '<button class="btn btn-sm btn-primary" type="button" data-book>+ Book a case</button>' : "") + "</div></div>";
      if (!r.theatres.length) {
        h += '<div class="card empty-card"><h2>No operation theatres yet</h2><p class="sub">' + (can("structure") ? "Add your theatres to start booking cases." : "Ask an administrator to add the theatres.") + "</p>" + (can("structure") ? '<button class="btn btn-primary" type="button" data-theatres>Add theatres</button>' : "") + "</div>";
        box.innerHTML = h; wire(box); return;
      }
      // timeline: one lane per theatre, 08:00 to 20:00
      var hours = []; for (var t = START; t <= START + SPAN; t += 120) hours.push(t);
      h += '<div class="card ot-board"><div class="ot-scale"><span></span><div>' + hours.map(function (t) { return '<i style="left:' + (100 * (t - START) / SPAN) + '%">' + String(t / 60).padStart(2, "0") + ":00</i>"; }).join("") + "</div></div>" +
        r.theatres.map(function (th) {
          var u = r.utilisation.filter(function (x) { return x.theatre_id === th.id; })[0] || { pct: 0, cases: 0 };
          var mine = r.cases.filter(function (x) { return x.theatre_id === th.id && x.status !== "cancelled"; });
          return '<div class="ot-lane"><span class="ot-th"><b>' + esc(th.name) + "</b><small>" + u.cases + " · " + u.pct + "%</small></span><div class=\"ot-track\">" + mine.map(function (x) {
            var l = Math.max(0, (x.start_min - START) / SPAN * 100), w = Math.max(1.5, Math.min(100 - l, x.duration / SPAN * 100));
            return '<button type="button" class="ot-blk st-' + x.status + (x.priority === "emergency" ? " em" : "") + '" style="left:' + l + "%;width:" + w + '%" data-case="' + esc(x.id) + '" title="' + esc(x.start + "–" + x.end + " " + x.patient_name) + '"><b>' + esc(x.start) + "</b> " + esc(x.procedure || x.patient_name) + "</button>";
          }).join("") + (S.day === M.today() ? nowLine() : "") + "</div></div>";
        }).join("") + "</div>";
      h += '<div class="ot-list">' + (r.cases.length ? r.cases.map(card).join("") : '<div class="empty">No cases on ' + esc(M.day(S.day)) + ".</div>") + "</div>";
      box.innerHTML = h;
      wire(box);
    });
  }
  function nowLine() { var d = new Date(), m = d.getHours() * 60 + d.getMinutes(); return m >= START && m <= START + SPAN ? '<i class="ot-now" style="left:' + (100 * (m - START) / SPAN) + '%"></i>' : ""; }
  function phaseDots(x) {
    return '<span class="ot-dots">' + ["sign_in", "time_out", "sign_out"].map(function (ph) { var g = x.progress[ph]; return '<i class="' + (g.complete ? "ok" : g.done ? "part" : "") + '" title="' + ph.replace("_", " ") + ": " + g.done + "/" + g.of + '"></i>'; }).join("") + "</span>";
  }
  function card(x) {
    return '<button type="button" class="ot-case st-' + x.status + '" data-case="' + esc(x.id) + '"><span class="ot-time"><b>' + esc(x.start) + "</b><small>" + esc(x.end) + "</small></span>" +
      '<span class="ot-main"><b>' + esc(x.procedure || "Theatre case") + (x.side_label && x.side !== "na" ? " · " + esc(x.side_label) : "") + "</b><small>" + esc(x.patient_name) + " · " + esc(x.mrn) + " · " + esc(x.theatre) + " · " + esc(x.surgeon) + (x.anaesthetist ? " / " + esc(x.anaesthetist) : "") + "</small></span>" +
      phaseDots(x) + (x.priority !== "elective" ? '<span class="pill ' + (x.priority === "emergency" ? "bad" : "wait") + '">' + esc(x.priority_label) + "</span>" : "") + '<span class="pill ' + (x.status === "done" ? "ok" : x.status === "in_progress" ? "wait" : "") + '">' + esc(x.status_label) + "</span></button>";
  }
  function wire(box) {
    box.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-d]"))) { S.day = M.addDays(S.day, +t.getAttribute("data-d")); loadOt(); return; }
      if (e.target.closest("[data-today]")) { S.day = M.today(); loadOt(); return; }
      if (e.target.closest("[data-book]")) return bookOt({});
      if (e.target.closest("[data-theatres]")) return theatres();
      if ((t = e.target.closest("[data-case]"))) return openCase(t.getAttribute("data-case"));
    };
    var d = el("ot-date"); if (d) d.onchange = function () { if (d.value) { S.day = d.value; loadOt(); } };
  }

  /* ---------------------------------------------------------------- theatres */
  function theatres() {
    api("/hospital/ot/theatres").then(function (r) {
      var b = M.modal('<h2 id="ops-title">Operation theatres</h2><div id="th-list">' + (r.items || []).map(function (t) {
        return '<div class="srow' + (t.active ? "" : " off") + '"><div class="grow"><input class="input" data-name="' + esc(t.id) + '" value="' + esc(t.name) + '" maxlength="60"></div><button class="btn btn-sm btn-ghost" type="button" data-save="' + esc(t.id) + '">Save</button><button class="btn btn-sm btn-ghost" type="button" data-toggle="' + esc(t.id) + '" data-on="' + (t.active ? 1 : 0) + '">' + (t.active ? "Close" : "Reopen") + "</button></div>";
      }).join("") + '</div><div class="row" style="margin-top:12px"><input class="input" id="th-new" placeholder="e.g. OT 3, Minor OT, Labour OT" maxlength="60"><button class="btn btn-primary" type="button" data-add>Add</button></div><div class="msg" id="th-msg"></div>');
      b.onclick = function (e) {
        var t, body = null;
        if (e.target.closest("[data-add]")) body = { name: el("th-new").value };
        else if ((t = e.target.closest("[data-save]"))) body = { id: t.getAttribute("data-save"), name: b.querySelector('[data-name="' + t.getAttribute("data-save") + '"]').value };
        else if ((t = e.target.closest("[data-toggle]"))) { var id = t.getAttribute("data-toggle"); body = { id: id, name: b.querySelector('[data-name="' + id + '"]').value, active: t.getAttribute("data-on") !== "1" }; }
        if (!body) return;
        api("/hospital/ot/theatres", { method: "POST", body: body }).then(function (x) { if (x.ok) { theatres(); S.data = null; loadOtIfOpen(); } else H().say(el("th-msg"), x.message, "err"); });
      };
    });
  }
  function loadOtIfOpen() { var s = el("tab-ot"); if (s && !s.hidden) loadOt(); }

  /* ---------------------------------------------------------------- booking */
  function bookOt(o) {
    o = o || {};
    var go = function (d) {
      var layer = o.layer || 1, picked = o.patient || null;
      var team = d.team || [];
      var opt = function (obj, cur) { return Object.keys(obj).map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + esc(obj[k]) + "</option>"; }).join(""); };
      var me = H().me().staff.id;
      var b = M.modal('<h2 id="ops-title">Book a theatre case</h2>' +
        '<div class="field"><label>Patient</label><div id="ob-pk"></div></div>' +
        '<div class="field"><label for="ob-proc">Procedure</label><input class="input" id="ob-proc" maxlength="160" placeholder="e.g. Laparoscopic cholecystectomy"></div>' +
        '<div class="grid2"><div class="field"><label for="ob-side">Side</label><select class="input" id="ob-side">' + opt(d.sides, "na") + '</select></div><div class="field"><label for="ob-an">Anaesthesia</label><select class="input" id="ob-an"><option value="">Not decided</option>' + opt(d.anaesthesia, "") + "</select></div>" +
        '<div class="field"><label for="ob-th">Theatre</label><select class="input" id="ob-th">' + d.theatres.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ob-pr">Priority</label><select class="input" id="ob-pr">' + opt(d.priorities, o.priority || "elective") + "</select></div>" +
        '<div class="field"><label for="ob-day">Day</label><input class="input" type="date" id="ob-day" value="' + esc(o.day || S.day) + '"></div><div class="field"><label for="ob-st">Start</label><input class="input" type="time" id="ob-st" value="' + esc(o.start || "09:00") + '" step="300"></div>' +
        '<div class="field"><label for="ob-dur">Expected duration (minutes)</label><input class="input" type="number" id="ob-dur" min="15" max="720" step="15" value="60"></div>' +
        '<div class="field"><label for="ob-sg">Surgeon</label><select class="input" id="ob-sg">' + team.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === me ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ob-ae">Anaesthetist</label><select class="input" id="ob-ae"><option value="">Not assigned</option>' + team.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>"; }).join("") + "</select></div></div>" +
        '<label class="hp-check" id="ob-ov-w" hidden><input type="checkbox" id="ob-ov"> <span>Emergency: book even if it overlaps another case</span></label>' +
        '<p class="mini">Theatres keep ' + d.turnover + ' minutes between cases for cleaning and setup.</p><button class="btn btn-primary" type="button" id="ob-go">Book</button><div class="msg" id="ob-msg"></div>', false, layer);
      Q.picker(el("ob-pk"), function (p) { picked = p; });
      if (picked) el("ob-pk").pick(picked);
      el("ob-pr").onchange = function () { el("ob-ov-w").hidden = el("ob-pr").value !== "emergency"; };
      el("ob-pr").onchange();
      el("ob-go").onclick = function () {
        if (!picked || !picked.id) return H().say(el("ob-msg"), "Choose a registered patient.", "err");
        var body = { patient_id: picked.id, procedure: el("ob-proc").value, side: el("ob-side").value, anaesthesia: el("ob-an").value, theatre_id: el("ob-th").value, priority: el("ob-pr").value,
          day: el("ob-day").value, start: el("ob-st").value, duration: parseInt(el("ob-dur").value, 10), surgeon_id: el("ob-sg").value, anaesthetist_id: el("ob-ae").value, allow_overlap: el("ob-ov").checked };
        if (o.encounter_id) body.encounter_id = o.encounter_id;
        api("/hospital/ot", { method: "POST", body: body }).then(function (x) {
          if (H().guard(x)) return;
          if (!x.ok) return H().say(el("ob-msg"), x.message, "err");
          toast(x.message); M.close(layer); S.day = body.day; loadOtIfOpen(); if (o.after) o.after();
        });
      };
      void b;
    };
    if (S.data && S.data.day === (o.day || S.day)) go(S.data); else api("/hospital/ot?day=" + (o.day || S.day)).then(function (r) { if (r.ok) { if (!r.theatres.length) return toast("Add an operation theatre first (Theatres tab).", "err"); go(r); } });
  }

  /* ---------------------------------------------------------------- one case: details and the WHO checklist */
  function openCase(id, layer) {
    api("/hospital/ot/" + encodeURIComponent(id)).then(function (r) {
      if (H().guard(r) || !r.ok) return;
      var x = r.item, d = S.data || {}, CL = d.checklist, PH = d.phases;
      var go = function () { renderCase(x, CL, PH, layer || 1); };
      if (CL) go(); else api("/hospital/ot?day=" + x.day).then(function (dd) { S.data = S.data || dd; CL = dd.checklist; PH = dd.phases; go(); });
    });
  }
  function renderCase(x, CL, PH, layer) {
    var run = can("ot_run") && x.status !== "done" && x.status !== "cancelled", clin = x.procedure != null;
    var h = '<div class="ot-c-head"><div><span class="mini">' + esc(x.number) + " · " + esc(x.theatre) + " · " + esc(M.day(x.day)) + " " + esc(x.start) + "–" + esc(x.end) + "</span><h2 id=\"ops-title\">" + esc(clin ? x.procedure : "Theatre case") + (x.side && x.side !== "na" ? ' <span class="tag">' + esc(x.side_label) + "</span>" : "") + "</h2>" +
      '<div class="mini">' + esc(x.patient_name) + " · " + esc(x.mrn) + " · Surgeon " + esc(x.surgeon) + (x.anaesthetist ? " · Anaesthetist " + esc(x.anaesthetist) : "") + (x.anaesthesia_label ? " · " + esc(x.anaesthesia_label) + " anaesthesia" : "") + "</div></div>" +
      '<span class="pill ' + (x.status === "done" ? "ok" : x.status === "in_progress" ? "wait" : x.status === "cancelled" ? "bad" : "") + '">' + esc(x.status_label) + "</span></div>";
    if (clin && x.allergies && x.allergies.length) h += '<div class="notice bad">Recorded allergies: <b>' + x.allergies.map(esc).join(", ") + "</b></div>";
    if (clin) {
      h += '<div class="ot-cl">' + ["sign_in", "time_out", "sign_out"].map(function (ph) {
        var got = (x.checklist || {})[ph] || {}, pr = x.progress[ph], lock = !run || (ph === "sign_out" && x.status !== "in_progress");
        return '<div class="ot-ph' + (pr.complete ? " ok" : "") + '"><div class="ot-ph-h"><b>' + esc(PH[ph]) + "</b><span>" + pr.done + "/" + pr.of + "</span></div>" + CL[ph].map(function (it) {
          if (it.choices) {
            return '<div class="ot-it ch' + (got[it.key] ? " on" : "") + '"><span>' + esc(it.text) + '</span><div class="ot-chs">' + Object.keys(it.choices).map(function (k) {
              return '<button type="button" class="hs-chip sm' + (got[it.key] === k ? " on" : "") + '" data-ph="' + ph + '" data-it="' + it.key + '" data-v="' + k + '"' + (lock ? " disabled" : "") + ">" + esc(it.choices[k]) + "</button>";
            }).join("") + "</div></div>";
          }
          return '<label class="ot-it' + (got[it.key] ? " on" : "") + '"><input type="checkbox" data-ph="' + ph + '" data-it="' + it.key + '"' + (got[it.key] ? " checked" : "") + (lock ? " disabled" : "") + "><span>" + esc(it.text) + "</span></label>";
        }).join("") + "</div>";
      }).join("") + "</div>";
      var ov = x.overrides || {};
      Object.keys(ov).forEach(function (k) { h += '<div class="notice wait">' + (k === "start" ? "Started" : "Closed") + " without the full checklist by " + esc(ov[k].by) + ": " + esc(ov[k].reason) + "</div>"; });
      if (x.note) h += '<div class="ops-sec"><div class="ops-h">Operation note</div><p style="white-space:pre-wrap">' + esc(x.note) + "</p></div>";
      if (x.cancel_reason) h += '<div class="notice bad">Cancelled: ' + esc(x.cancel_reason) + "</div>";
    }
    var acts = [];
    if (x.status === "scheduled" && can("ot_run")) acts.push('<button class="btn btn-primary" type="button" data-start>Start the case</button>');
    if (x.status === "in_progress" && can("ot_run")) acts.push('<button class="btn btn-primary" type="button" data-finish>Finish and close</button>');
    if (x.status === "scheduled" && can("ot")) acts.push('<button class="btn" type="button" data-move>Move</button><button class="btn btn-danger" type="button" data-cancel>Cancel case</button>');
    if (clin) acts.push('<button class="btn btn-ghost" type="button" data-print>Print case sheet</button>');
    acts.push('<button class="btn btn-ghost" type="button" data-rec>Patient record</button>');
    h += '<div class="ot-acts" id="oc-acts">' + acts.join("") + '</div><div id="oc-more"></div><div class="msg" id="oc-msg"></div>';
    var b = M.modal(h, true, layer);
    var reload = function () { openCase(x.id, layer); loadOtIfOpen(); };
    var post = function (body, done) {
      api("/hospital/ot/" + encodeURIComponent(x.id), { method: "POST", body: body }).then(function (r) {
        if (H().guard(r)) return;
        if (!r.ok) { H().say(el("oc-msg"), r.message, "err"); return; }
        if (done) done(r); else reload();
      });
    };
    b.onchange = function (e) { var c = e.target.closest("input[data-ph]"); if (c) post({ action: "check", phase: c.getAttribute("data-ph"), item: c.getAttribute("data-it"), value: c.checked }); };
    b.onclick = function (e) {
      var t;
      if ((t = e.target.closest("button[data-ph]"))) { var on = t.classList.contains("on"); post({ action: "check", phase: t.getAttribute("data-ph"), item: t.getAttribute("data-it"), value: on ? "" : t.getAttribute("data-v") }); return; }
      if (e.target.closest("[data-rec]")) { M.close(layer); return Q.openRecord(x.patient_id); }
      if (e.target.closest("[data-print]")) return printCase(x, CL, PH);
      if (e.target.closest("[data-start]")) {
        var ready = x.progress.sign_in.complete && x.progress.time_out.complete;
        if (ready) return post({ action: "start" }, function (r) { toast(r.message); reload(); });
        el("oc-more").innerHTML = '<div class="notice wait">Sign in and Time out aren\'t complete. The WHO checklist is there to prevent harm; go ahead only if waiting would be worse.</div><div class="field"><label for="oc-why">Reason to start without the full checklist</label><input class="input" id="oc-why" maxlength="240"></div><button class="btn btn-danger" type="button" data-start-anyway>Start anyway</button>';
        return;
      }
      if (e.target.closest("[data-start-anyway]")) return post({ action: "start", override_reason: el("oc-why").value }, function (r) { toast(r.message); reload(); });
      if (e.target.closest("[data-finish]")) {
        el("oc-more").innerHTML = '<div class="field"><label for="oc-note">Operation note (filed in the patient\'s record)</label><textarea class="input" id="oc-note" rows="5" maxlength="4000" placeholder="Findings, procedure, closure, blood loss, specimens, post-op orders"></textarea></div>' +
          (x.progress.sign_out.complete ? "" : '<div class="field"><label for="oc-why2">Sign out isn\'t complete. Reason to close anyway</label><input class="input" id="oc-why2" maxlength="240"></div>') + '<button class="btn btn-primary" type="button" data-finish-go>Close the case</button>';
        return;
      }
      if (e.target.closest("[data-finish-go]")) return post({ action: "finish", note: el("oc-note").value, override_reason: el("oc-why2") ? el("oc-why2").value : "" }, function (r) { toast(r.message); reload(); });
      if (e.target.closest("[data-cancel]")) { el("oc-more").innerHTML = '<div class="field"><label for="oc-cr">Reason for cancelling</label><input class="input" id="oc-cr" maxlength="200"></div><button class="btn btn-danger" type="button" data-cancel-go>Cancel the case</button>'; return; }
      if (e.target.closest("[data-cancel-go]")) return post({ action: "cancel", reason: el("oc-cr").value }, function (r) { toast(r.message); M.close(layer); loadOtIfOpen(); });
      if (e.target.closest("[data-move]")) {
        el("oc-more").innerHTML = '<div class="grid2"><div class="field"><label for="om-d">Day</label><input class="input" type="date" id="om-d" value="' + esc(x.day) + '"></div><div class="field"><label for="om-s">Start</label><input class="input" type="time" id="om-s" value="' + esc(x.start.slice(0, 5)) + '"></div>' +
          '<div class="field"><label for="om-t">Theatre</label><select class="input" id="om-t">' + ((S.data && S.data.theatres) || []).map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === x.theatre_id ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + '</select></div><div class="field"><label for="om-u">Duration (min)</label><input class="input" type="number" id="om-u" value="' + x.duration + '" min="15" max="720" step="15"></div></div><button class="btn btn-primary" type="button" data-move-go>Move the case</button>';
        return;
      }
      if (e.target.closest("[data-move-go]")) return post({ action: "reschedule", day: el("om-d").value, start: el("om-s").value, theatre_id: el("om-t").value, duration: parseInt(el("om-u").value, 10) }, function (r) { toast(r.message); S.day = el("om-d").value; reload(); });
    };
  }
  function printCase(x, CL, PH) {
    var org = H().me().org;
    var h = M.letterhead(org) + '<h1 class="ph-title">Surgical safety checklist · ' + esc(x.number) + "</h1>" +
      '<div class="ph-meta"><div><b>' + esc(x.patient_name) + "</b> · MRN " + esc(x.mrn) + "</div><div>" + esc(x.theatre) + " · " + esc(x.day) + " " + esc(x.start) + "–" + esc(x.end) + "</div></div>" +
      "<p><b>Procedure:</b> " + esc(x.procedure) + (x.side !== "na" ? " (" + esc(x.side_label) + ")" : "") + " · <b>Anaesthesia:</b> " + esc(x.anaesthesia_label || "—") + "<br><b>Surgeon:</b> " + esc(x.surgeon) + " · <b>Anaesthetist:</b> " + esc(x.anaesthetist || "—") + "</p>" +
      (x.allergies && x.allergies.length ? "<p><b>Allergies:</b> " + x.allergies.map(esc).join(", ") + "</p>" : "") +
      ["sign_in", "time_out", "sign_out"].map(function (ph) {
        var got = (x.checklist || {})[ph] || {};
        return "<h3>" + esc(PH[ph]) + '</h3><ul class="ph-ck">' + CL[ph].map(function (it) { var v = got[it.key]; return "<li>" + (v ? "☑" : "☐") + " " + esc(it.text) + (it.choices && v ? " — <b>" + esc(it.choices[v]) + "</b>" : "") + "</li>"; }).join("") + "</ul>";
      }).join("") + '<p class="mini">Based on the WHO Surgical Safety Checklist (2009). Printed from QueroCura.</p>';
    M.print(h);
  }

  /* ---------------------------------------------------------------- discharge summary */
  function discharge(eid, o) {
    o = o || {};
    var layer = o.layer || 1;
    api("/hospital/discharge/" + encodeURIComponent(eid)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { toast(r.message || "Couldn't open the discharge summary.", "err"); return; }
      var d = r.item, b0 = d.body || {}, edit = d.can_sign;
      var ta = function (k, label, rows, ph) { return '<div class="field"><label for="ds-' + k + '">' + label + '</label><textarea class="input" id="ds-' + k + '" rows="' + rows + '" placeholder="' + esc(ph || "") + '"' + (edit ? "" : " readonly") + ">" + esc(b0[k] || "") + "</textarea></div>"; };
      var h = '<div class="ot-c-head"><div><span class="mini">Discharge summary' + (d.signed ? " · signed by " + esc(d.signed_name) + " · version " + d.version : " · draft") + '</span><h2 id="ops-title">' + esc(d.patient.name) + "</h2>" +
        '<div class="mini">MRN ' + esc(d.patient.mrn || "—") + " · " + esc(d.ward) + " " + esc(d.bed) + " · " + esc(d.department) + " · Consultant " + esc(d.consultant || "—") + "<br>Admitted " + esc(d.admitted) + (d.discharged ? " · Discharged " + esc(d.discharged) : " · still admitted") + "</div></div>" +
        '<span class="pill ' + (d.signed ? "ok" : "wait") + '">' + (d.signed ? "Signed" : "Draft") + "</span></div>";
      if (d.allergies.length) h += '<div class="notice bad">Allergies: <b>' + d.allergies.map(esc).join(", ") + "</b></div>";
      h += '<div class="grid2">' + '<div class="field"><label for="ds-diagnosis">Diagnosis</label><input class="input" id="ds-diagnosis" maxlength="300" value="' + esc(b0.diagnosis || "") + '"' + (edit ? "" : " readonly") + "></div>" +
        '<div class="field"><label for="ds-condition">Condition at discharge</label><select class="input" id="ds-condition"' + (edit ? "" : " disabled") + '><option value="">Choose…</option>' + Object.keys(d.conditions).map(function (k) { return '<option value="' + k + '"' + (b0.condition === k ? " selected" : "") + ">" + esc(d.conditions[k]) + "</option>"; }).join("") + "</select></div></div>";
      h += ta("secondary", "Other diagnoses", 2) + ta("presenting", "Presenting complaints", 2) + ta("findings", "Findings on admission", 2) + ta("course", "Course in hospital", 5, "What was done and how the patient responded");
      h += '<div class="ds-auto"><div><div class="ops-h">Operations and procedures</div>' + (d.procedures.length ? "<ul>" + d.procedures.map(function (p) { return "<li>" + esc(p.item) + ' <span class="mini">' + esc(p.date) + "</span></li>"; }).join("") + "</ul>" : '<p class="mini">None recorded.</p>') + "</div>" +
        '<div><div class="ops-h">Investigations</div>' + (d.investigations.length ? "<ul>" + d.investigations.map(function (t) { return "<li><b>" + esc(t.item) + "</b>: " + esc((t.result || "done").slice(0, 200)) + "</li>"; }).join("") + "</ul>" : '<p class="mini">None recorded.</p>') + "</div>" +
        '<div><div class="ops-h">Medicines prescribed during the stay</div>' + (d.medicines.length ? "<ul>" + d.medicines.map(function (m) { return "<li>" + esc([m.name, m.strength, m.dose, m.frequency].filter(Boolean).join(" ")) + (m.days ? " · " + m.days + " days" : m.ongoing ? " · ongoing" : "") + ' <span class="mini">' + esc(m.rx) + "</span></li>"; }).join("") + "</ul>" : '<p class="mini">No signed prescriptions on this stay. Write the discharge prescription with ℞ Prescribe; it appears here.</p>') + "</div></div>";
      h += ta("advice", "Advice", 3, "Diet, activity, wound care, when to return to work") + ta("follow_up", "Follow-up", 1, "e.g. Surgery OPD in 7 days for suture removal") + ta("warning_signs", "When to come back at once", 2);
      var acts = [];
      if (edit) { if (!d.signed) acts.push('<button class="btn" type="button" data-ds-save>Save draft</button>'); acts.push('<button class="btn btn-primary" type="button" data-ds-sign>' + (d.signed ? "Sign the amended version" : "Sign and file") + "</button>"); }
      acts.push('<button class="btn btn-ghost" type="button" data-ds-print>Print</button>');
      h += '<div class="ot-acts">' + acts.join("") + '</div><div class="msg" id="ds-msg"></div>';
      var b = M.modal(h, true, layer);
      var collect = function () { var out = {}; ["diagnosis", "condition", "secondary", "presenting", "findings", "course", "advice", "follow_up", "warning_signs"].forEach(function (k) { out[k] = el("ds-" + k).value; }); return out; };
      b.onclick = function (e) {
        var sign = !!e.target.closest("[data-ds-sign]");
        if (e.target.closest("[data-ds-print]")) { d.body = edit ? collect() : d.body; return printDischarge(d); }
        if (!sign && !e.target.closest("[data-ds-save]")) return;
        var body = collect(); body.sign = sign;
        api("/hospital/discharge/" + encodeURIComponent(eid), { method: "POST", body: body }).then(function (x) {
          if (H().guard(x)) return;
          if (!x.ok) return H().say(el("ds-msg"), x.message, "err");
          toast(x.message);
          if (sign) { M.close(layer); if (o.after) o.after(); } else H().say(el("ds-msg"), x.message, "ok");
        });
      };
    });
  }
  function printDischarge(d) {
    var b = d.body || {}, cond = d.conditions[b.condition] || "";
    var sec = function (label, v) { return v ? "<h3>" + label + '</h3><p style="white-space:pre-wrap">' + esc(v) + "</p>" : ""; };
    var h = M.letterhead(d.org) + '<h1 class="ph-title">Discharge summary</h1>' +
      '<div class="ph-meta"><div><b>' + esc(d.patient.name) + "</b> · MRN " + esc(d.patient.mrn || "—") + (d.patient.age != null ? " · " + d.patient.age + "y" : "") + (d.patient.sex ? " · " + esc(d.patient.sex) : "") + "</div><div>" + esc(d.ward) + " " + esc(d.bed) + " · " + esc(d.department) + "</div></div>" +
      "<p><b>Admitted:</b> " + esc(d.admitted) + " · <b>Discharged:</b> " + esc(d.discharged || "—") + " · <b>Consultant:</b> " + esc(d.consultant || "—") + "</p>" +
      (d.allergies.length ? "<p><b>Allergies:</b> " + d.allergies.map(esc).join(", ") + "</p>" : "") +
      sec("Diagnosis", b.diagnosis) + sec("Other diagnoses", b.secondary) + sec("Presenting complaints", b.presenting) + sec("Findings on admission", b.findings) + sec("Course in hospital", b.course) +
      (d.procedures.length ? "<h3>Operations and procedures</h3><ul>" + d.procedures.map(function (p) { return "<li>" + esc(p.item) + " (" + esc(p.date) + ")</li>"; }).join("") + "</ul>" : "") +
      (d.investigations.length ? "<h3>Investigations</h3><ul>" + d.investigations.map(function (t) { return "<li><b>" + esc(t.item) + ":</b> " + esc(t.result || "done") + "</li>"; }).join("") + "</ul>" : "") +
      (cond ? "<h3>Condition at discharge</h3><p>" + esc(cond) + "</p>" : "") +
      (d.medicines.length ? "<h3>Medicines prescribed</h3><ul>" + d.medicines.map(function (m) { return "<li>" + esc([m.name, m.strength, m.dose, m.frequency].filter(Boolean).join(" ")) + (m.days ? " for " + m.days + " days" : "") + (m.instructions ? ". " + esc(m.instructions) : "") + "</li>"; }).join("") + "</ul>" : "") +
      sec("Advice", b.advice) + sec("Follow-up", b.follow_up) + sec("When to come back at once", b.warning_signs) +
      '<div class="ph-sign">' + (d.signed ? "Signed by " + esc(d.signed_name) : "Draft · not signed") + "</div>";
    M.print(h);
  }

  Q.add("ot", "Theatres", function (c) { return c("ot") || c("ot_run") || c("structure"); }, "flow", function () { S.data = null; loadOt(); });
  Q.discharge = discharge;
  Q.bookOt = bookOt;
  Q.openCase = openCase;
})();
