/* QueroCura for Hospitals: hospital management, part 2.
 * Prescriptions (writing, checking, signing, printing), the pharmacy (dispensing queue, formulary and stock), billing
 * (bills, payments, receipts, day close, price list), the duty roster and reports.  Plugs into window.QCHms.
 * Nothing here suggests a medicine: the prescription checks are allergy and duplication safety nets only.
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function Q() { return window.QCHms; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function can(p) { return H().can(p); }
  function canAny() { for (var i = 0; i < arguments.length; i++) if (can(arguments[i])) return true; return false; }
  function toast(m, k) { H().P.toast(m, k); }
  function say(n, m, k) { H().say(n, m, k); }
  var META = null;
  function meta() { return META ? Promise.resolve(META) : api("/hospital/pharmacy").then(function (r) { if (r && r.ok) META = r; return META || { forms: [], routes: [], freq: {}, timing: {} }; }); }

  /* ================================================================ prescriptions */
  function prescribe(o) {
    o = o || {};
    var p = o.patient, layer = o.layer || 1;
    Promise.all([meta(), api("/hospital/pharmacy/formulary"), api("/hospital/staff/profile")]).then(function (res) {
      var mt = res[0], form = (res[1] && res[1].items) || [], prof = (res[2] && res[2].profile) || {};
      var lines = [blank()];
      function blank() { return { name: "", strength: "", form: "tablet", dose: "1", frequency: "BD", timing: "after_food", days: "", quantity: "", instructions: "", route: "oral" }; }
      var al = p.allergies || [];
      var h = '<h2 id="ops-title">℞ Prescription · ' + esc(p.name) + '</h2><div class="rx-pt"><span>' + esc(p.mrn || "") + (M().sexAge(p) ? " · " + esc(M().sexAge(p)) : "") + "</span>" +
        (al.length ? '<span class="al-lab">Allergies</span>' + al.map(function (a) { return '<span class="al">' + esc(a) + "</span>"; }).join("") : p.nkda ? '<span class="al-ok">No known drug allergies</span>' : '<span class="al-unk">Allergies not recorded: ask before prescribing</span>') + "</div>" +
        (!prof.reg_no ? '<div class="notice wait rx-prof">Printed prescriptions show your medical registration number. <button type="button" class="link" data-prof>Add it now</button></div>' : "") +
        '<form id="rx-form" novalidate><div class="grid2"><div class="field"><label for="rx-c">Complaints</label><input class="input" id="rx-c" maxlength="300" value="' + esc(o.complaints || "") + '"></div><div class="field"><label for="rx-dx">Diagnosis</label><input class="input" id="rx-dx" maxlength="300"></div></div>' +
        '<div class="field"><label for="rx-f">Examination findings</label><input class="input" id="rx-f" maxlength="400"></div>' +
        '<div class="ops-h">Medicines</div><div class="rx-quick" id="rx-quick" aria-label="Quick fill"></div><datalist id="rx-dl">' + form.map(function (f) { return '<option value="' + esc(f.name) + '">' + esc((f.strength || "") + " " + (f.form || "") + (f.stock != null ? " · " + f.stock + " in stock" : "")) + "</option>"; }).join("") + '</datalist><div id="rx-lines"></div>' +
        '<button type="button" class="btn btn-sm" data-addline>+ Add medicine</button><div id="rx-warn"></div>' +
        '<div class="grid2"><div class="field"><label for="rx-inv">Investigations advised</label><input class="input" id="rx-inv" maxlength="300"></div><div class="field"><label for="rx-fu">Follow-up on</label><input class="input" type="date" id="rx-fu" min="' + M().today() + '"></div></div>' +
        '<div class="field"><label for="rx-adv">Advice</label><textarea class="input" id="rx-adv" rows="2" maxlength="1200"></textarea></div>' +
        '<div id="rx-ack"></div><button class="btn btn-primary" type="submit">Sign prescription</button><div class="msg" id="rx-msg" role="status"></div>' +
        '<p class="mini">Signed prescriptions are filed in the hospital record and, if the patient allows it, in their QueroCura app. The checks look for recorded allergies and duplicates; they never choose a medicine.</p></form>';
      var b = M().modal(h, true, layer);
      function lineHtml(l, i) {
        var opt = function (list, v) { return list.map(function (x) { var k = Array.isArray(x) ? x[0] : x, t = Array.isArray(x) ? x[1] : x; return '<option value="' + esc(k) + '"' + (k === v ? " selected" : "") + ">" + esc(t) + "</option>"; }).join(""); };
        return '<div class="rx-line" data-i="' + i + '"><span class="rx-n">' + (i + 1) + '</span><div class="rx-grid">' +
          '<input class="input rx-name" data-f="name" list="rx-dl" placeholder="Medicine" maxlength="120" value="' + esc(l.name) + '" autocomplete="off">' +
          '<input class="input" data-f="strength" placeholder="Strength" maxlength="40" value="' + esc(l.strength) + '">' +
          '<select class="input" data-f="form">' + opt(mt.forms, l.form) + "</select>" +
          '<input class="input" data-f="dose" placeholder="Dose" maxlength="40" value="' + esc(l.dose) + '">' +
          '<select class="input" data-f="frequency">' + opt(Object.keys(mt.freq).map(function (k) { return [k, k + " · " + mt.freq[k]]; }), l.frequency) + "</select>" +
          '<select class="input" data-f="timing">' + opt(Object.keys(mt.timing).map(function (k) { return [k, mt.timing[k] || "Timing…"]; }), l.timing) + "</select>" +
          '<input class="input" data-f="days" inputmode="numeric" placeholder="Days" maxlength="3" value="' + esc(l.days) + '">' +
          '<input class="input" data-f="quantity" inputmode="numeric" placeholder="Qty (auto)" maxlength="4" value="' + esc(l.quantity) + '">' +
          '<input class="input rx-ins" data-f="instructions" placeholder="Instructions" maxlength="200" value="' + esc(l.instructions) + '">' +
          '</div><button type="button" class="btn btn-sm btn-ghost" data-rmline="' + i + '" aria-label="Remove">✕</button></div>';
      }
      function draw() { el("rx-lines").innerHTML = lines.map(lineHtml).join(""); }
      function collect() {
        [].forEach.call(el("rx-lines").querySelectorAll(".rx-line"), function (row) {
          var l = lines[+row.getAttribute("data-i")];
          [].forEach.call(row.querySelectorAll("[data-f]"), function (f) { l[f.getAttribute("data-f")] = f.value; });
        });
        return lines.filter(function (l) { return l.name.trim(); }).map(function (l) {
          var f = form.filter(function (x) { return x.name.toLowerCase() === l.name.trim().toLowerCase() && (!l.strength || (x.strength || "").toLowerCase() === l.strength.toLowerCase()); })[0];
          return { name: l.name, strength: l.strength, form: l.form, dose: l.dose, frequency: l.frequency, timing: l.timing, days: l.days, quantity: l.quantity, instructions: l.instructions, route: l.route, formulary_id: f ? f.id : null };
        });
      }
      draw();
      /* quick fill: repeat the patient's last prescription, or one of my favourites; then the same checks run */
      var FAVS = [], LAST = null;
      function fill(src, favId) {
        lines = (src.items || []).map(function (x) { var l = blank(); Object.keys(l).forEach(function (k) { if (x[k] != null && x[k] !== "") l[k] = String(x[k]); }); return l; });
        if (!lines.length) lines.push(blank());
        draw();
        [["rx-dx", src.diagnosis], ["rx-inv", src.investigations], ["rx-adv", src.advice]].forEach(function (f) { if (f[1] && !el(f[0]).value) el(f[0]).value = f[1]; });
        if (favId) api("/hospital/rx/favourites", { method: "POST", body: { used: favId } });
        check(); toast("Filled in. Check each line before signing.");
      }
      function quick() {
        var q = el("rx-quick"); if (!q) return;
        q.innerHTML = (LAST && LAST.items.length ? '<button type="button" class="rxq rxq-last" data-rxlast title="From ' + esc(LAST.number) + '">↻ Repeat last (' + LAST.items.length + ")</button>" : "") +
          FAVS.slice(0, 8).map(function (f, i) { return '<button type="button" class="rxq" data-rxfav="' + i + '">★ ' + esc(f.name) + "</button>"; }).join("") +
          '<button type="button" class="rxq rxq-save" data-rxsave>☆ Save as favourite</button>';
      }
      Promise.all([api("/hospital/rx/favourites"), api("/hospital/rx/last/" + p.id)]).then(function (rs) { FAVS = (rs[0] && rs[0].items) || []; LAST = rs[1] && rs[1].item; quick(); });
      el("rx-quick").onclick = function (e) {
        var x;
        if (e.target.closest("[data-rxlast]")) return fill(LAST);
        if ((x = e.target.closest("[data-rxfav]"))) { var f = FAVS[+x.getAttribute("data-rxfav")]; return fill(f, f.id); }
        if (e.target.closest("[data-rxsave]")) {
          var items = collect();
          if (!items.length) return toast("Add the medicines first.", "err");
          var name = window.prompt("Name this favourite (e.g. “Viral fever, adult”)", el("rx-dx").value || "");
          if (!name) return;
          api("/hospital/rx/favourites", { method: "POST", body: { name: name, items: items, diagnosis: el("rx-dx").value, investigations: el("rx-inv").value, advice: el("rx-adv").value } }).then(function (r) {
            toast(r.message || (r.ok ? "Saved." : "Couldn't save."), r.ok ? "" : "err");
            if (r.ok) api("/hospital/rx/favourites").then(function (x2) { FAVS = (x2 && x2.items) || []; quick(); });
          });
        }
      };
      var warns = [], t = null;
      function check() {
        var items = collect();
        if (!items.length) { el("rx-warn").innerHTML = ""; return; }
        api("/hospital/rx/check", { method: "POST", body: { patient_id: p.id, items: items } }).then(function (r) {
          if (!r || !r.ok) return;
          warns = r.warnings || [];
          el("rx-warn").innerHTML = warns.map(function (w) { return '<div class="rx-w ' + w.level + '">' + (w.level === "allergy" ? "⛔ " : "⚠ ") + esc(w.text) + "</div>"; }).join("");
          ack();
        });
      }
      function ack() {
        var allergy = warns.some(function (w) { return w.level === "allergy"; });
        el("rx-ack").innerHTML = allergy ? '<div class="field"><label for="rx-why">Reason to prescribe despite the allergy</label><input class="input" id="rx-why" maxlength="300" placeholder="e.g. allergy history is a rash only; discussed with the patient"></div>' :
          warns.length ? '<label class="hp-check"><input type="checkbox" id="rx-okw"> <span>I have reviewed the cautions above</span></label>' : "";
      }
      el("rx-lines").oninput = function (e) { if (e.target.matches("[data-f=name],[data-f=strength],[data-f=frequency],[data-f=days],[data-f=dose],[data-f=form]")) { clearTimeout(t); t = setTimeout(check, 450); } };
      el("rx-lines").onchange = function (e) {
        if (e.target.matches(".rx-name")) {
          var f = form.filter(function (x) { return x.name.toLowerCase() === e.target.value.trim().toLowerCase(); })[0];
          if (f) { var row = e.target.closest(".rx-line"); if (f.strength && !row.querySelector("[data-f=strength]").value) row.querySelector("[data-f=strength]").value = f.strength; if (f.form) row.querySelector("[data-f=form]").value = f.form; }
        }
        clearTimeout(t); t = setTimeout(check, 200);
      };
      b.onclick = function (e) {
        var x;
        if (e.target.closest("[data-addline]")) { collect(); lines.push(blank()); draw(); var n = el("rx-lines").querySelectorAll(".rx-name"); n[n.length - 1].focus(); return; }
        if ((x = e.target.closest("[data-rmline]"))) { collect(); lines.splice(+x.getAttribute("data-rmline"), 1); if (!lines.length) lines.push(blank()); draw(); check(); return; }
        if (e.target.closest("[data-prof]")) return profile(function () { var w = b.querySelector(".rx-prof"); if (w) w.remove(); });
      };
      el("rx-form").onsubmit = function (e) {
        e.preventDefault();
        var items = collect();
        if (!items.length) return say(el("rx-msg"), "Add at least one medicine.", "err");
        var body = { patient_id: p.id, encounter_id: o.encounter_id || null, items: items, complaints: el("rx-c").value, diagnosis: el("rx-dx").value, findings: el("rx-f").value,
          investigations: el("rx-inv").value, follow_up: el("rx-fu").value, advice: el("rx-adv").value,
          acknowledged: !!(el("rx-okw") && el("rx-okw").checked), override_reason: el("rx-why") ? el("rx-why").value : "" };
        api("/hospital/rx", { method: "POST", body: body }).then(function (r) {
          if (H().guard(r)) return;
          if (r.code === "warnings" || r.code === "allergy_warnings") { warns = r.warnings; el("rx-warn").innerHTML = warns.map(function (w) { return '<div class="rx-w ' + w.level + '">' + (w.level === "allergy" ? "⛔ " : "⚠ ") + esc(w.text) + "</div>"; }).join(""); ack(); say(el("rx-msg"), r.message, "err"); return; }
          if (!r.ok) return say(el("rx-msg"), r.message, "err");
          toast(r.message); M().close(layer);
          if (o.after) o.after(r);
          openRx(r.item.id, true);
          if (body.follow_up && canAny("appointments", "rx")) setTimeout(function () { if (window.confirm("Book the follow-up on " + M().day(body.follow_up) + " now?")) Q().book({ patient: p, day: body.follow_up, kind: "follow_up", source: "followup", doctor: H().me().staff.id }); }, 400);
        });
      };
    });
  }

  function profile(done) {
    api("/hospital/staff/profile").then(function (r) {
      var pr = (r && r.profile) || {};
      M().modal('<h2 id="ops-title">Your professional details</h2><p class="sub">Shown on the prescriptions you sign.</p><form id="pf-form" novalidate><div class="grid2">' +
        '<div class="field"><label for="pf-reg">Registration number</label><input class="input" id="pf-reg" maxlength="40" value="' + esc(pr.reg_no) + '"></div>' +
        '<div class="field"><label for="pf-c">Medical council</label><input class="input" id="pf-c" maxlength="80" placeholder="e.g. Maharashtra Medical Council" value="' + esc(pr.council) + '"></div>' +
        '<div class="field"><label for="pf-q">Qualifications</label><input class="input" id="pf-q" maxlength="80" placeholder="e.g. MBBS, MD (Medicine)" value="' + esc(pr.qualification) + '"></div>' +
        '<div class="field"><label for="pf-s">Specialty</label><input class="input" id="pf-s" maxlength="80" value="' + esc(pr.specialty) + '"></div></div>' +
        '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="pf-msg"></div></form>', false, 2);
      el("pf-form").onsubmit = function (e) {
        e.preventDefault();
        api("/hospital/staff/profile", { method: "POST", body: { reg_no: el("pf-reg").value, council: el("pf-c").value, qualification: el("pf-q").value, specialty: el("pf-s").value } }).then(function (x) {
          if (!x.ok) return say(el("pf-msg"), x.message, "err");
          toast("Saved."); M().close(2); if (done) done();
        });
      };
    });
  }

  function rxPrint(x) {
    var pf = x.doctor_profile || {}, pt = x.patient || {};
    return M().letterhead(x.org) + '<div class="ph-doc"><div class="ph-row"><div><b>' + esc(x.doctor) + "</b>" + (pf.qualification ? "<span>" + esc(pf.qualification) + "</span>" : "") + (pf.specialty ? "<span>" + esc(pf.specialty) + "</span>" : "") +
      (pf.reg_no ? "<span>Reg. no. " + esc(pf.reg_no) + (pf.council ? ", " + esc(pf.council) : "") + "</span>" : "") + '</div><div class="ph-r"><b>' + esc(x.number) + "</b><span>" + esc(M().dt(x.created_ts)) + "</span></div></div>" +
      '<div class="ph-pt"><b>' + esc(x.patient_name || "") + "</b><span>MRN " + esc(x.mrn || "") + (M().sexAge(pt) ? " · " + esc(M().sexAge(pt)) : "") + "</span>" +
      '<span>Allergies: ' + esc((x.allergies || []).join(", ") || "none recorded") + "</span></div>" +
      (x.complaints ? "<p><b>Complaints:</b> " + esc(x.complaints) + "</p>" : "") + (x.findings ? "<p><b>Findings:</b> " + esc(x.findings) + "</p>" : "") + (x.diagnosis ? "<p><b>Diagnosis:</b> " + esc(x.diagnosis) + "</p>" : "") +
      '<div class="ph-rx">℞</div><table class="ph-t"><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>How often</th><th>For</th><th>Qty</th></tr></thead><tbody>' +
      x.items.map(function (it, i) {
        return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(it.name) + "</b> " + esc(it.strength || "") + '<div class="ph-s">' + esc(it.form !== "other" ? it.form : "") + (it.route && it.route !== "oral" ? " · " + esc(it.route) : "") + (it.instructions ? " · " + esc(it.instructions) : "") + "</div></td><td>" + esc(it.dose || "") +
          "</td><td>" + esc(it.frequency_text) + (it.timing ? '<div class="ph-s">' + esc(({ before_food: "before food", after_food: "after food", with_food: "with food", empty_stomach: "empty stomach" })[it.timing] || "") + "</div>" : "") + "</td><td>" + (it.days ? it.days + " days" : it.ongoing ? "ongoing" : "") + "</td><td>" + (it.quantity || "") + "</td></tr>";
      }).join("") + "</tbody></table>" + (x.investigations ? "<p><b>Investigations:</b> " + esc(x.investigations) + "</p>" : "") + (x.advice ? "<p><b>Advice:</b> " + esc(x.advice) + "</p>" : "") +
      (x.follow_up ? "<p><b>Follow-up:</b> " + esc(M().day(x.follow_up)) + "</p>" : "") + '<div class="ph-sign"><span>Signed electronically by ' + esc(x.doctor) + "</span></div></div>";
  }

  function openRx(id, justSigned) {
    api("/hospital/rx/" + encodeURIComponent(id)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) return toast(r.message, "err");
      var x = r.item;
      var h = '<div class="rx-view-h"><h2 id="ops-title">' + esc(x.number) + "</h2>" + M().rxPill(x.status) + "</div>" + (justSigned ? '<div class="notice ok">Signed. Print it for the patient or send them to the pharmacy.</div>' : "") +
        (x.warnings && x.warnings.length ? '<div class="rx-wlist">' + x.warnings.map(function (w) { return '<div class="rx-w ' + w.level + '">' + esc(w.text) + "</div>"; }).join("") + (x.override_reason ? '<div class="mini">Signed with the reason: ' + esc(x.override_reason) + "</div>" : "") + "</div>" : "") +
        '<div class="ph-preview">' + rxPrint(x) + "</div>" +
        '<div class="row"><button type="button" class="btn btn-primary" data-print>Print</button>' + (can("dispense") && (x.status === "signed" || x.status === "partly_dispensed") ? '<button type="button" class="btn" data-disp>Dispense</button>' : "") +
        (can("rx") && x.status !== "stopped" ? '<button type="button" class="btn btn-ghost" data-stop>Stop</button>' : "") + "</div>" + (x.stopped_reason ? '<div class="mini">Stopped: ' + esc(x.stopped_reason) + "</div>" : "");
      var b = M().modal(h, true, 2);
      b.onclick = function (e) {
        if (e.target.closest("[data-print]")) return M().print(rxPrint(x));
        if (e.target.closest("[data-disp]")) return dispense(x);
        if (e.target.closest("[data-stop]")) { var why = window.prompt("Why is this prescription being stopped?"); if (!why) return; api("/hospital/rx/" + encodeURIComponent(id) + "/stop", { method: "POST", body: { reason: why } }).then(function (rr) { M().reply(rr, function () { openRx(id); }); }); }
      };
    });
  }

  /* ================================================================ pharmacy */
  var PH = { view: "queue" };
  function loadPharmacy() {
    var box = el("tab-pharmacy");
    box.innerHTML = '<div class="empty">Loading the pharmacy…</div>';
    Promise.all([api("/hospital/pharmacy"), api("/hospital/pharmacy/formulary?all=1")]).then(function (res) {
      var r = res[0], f = res[1];
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
      META = r;
      var al = r.alerts || { low: [], expiring: [] };
      var h = '<div class="hms-head"><div><h2>Pharmacy</h2><p class="sub">Dispense signed prescriptions; stock comes off the batch that expires first, and medicines go onto the patient\'s bill.</p></div>' +
        (can("stock") ? '<button class="btn btn-primary" type="button" data-additem>+ Add a medicine</button>' : "") + "</div>" +
        '<div class="ops-bar"><div class="chips"><button type="button" class="chipbtn' + (PH.view === "queue" ? " on" : "") + '" data-v="queue">To dispense (' + r.queue.length + ')</button><button type="button" class="chipbtn' + (PH.view === "stock" ? " on" : "") + '" data-v="stock">Stock (' + ((f && f.items) || []).length + ")</button></div>" +
        '<div class="ops-bar-r">' + (al.low.length ? '<span class="ops-stat warn"><b>' + al.low.length + "</b> low</span>" : "") + (al.expiring.length ? '<span class="ops-stat warn"><b>' + al.expiring.length + "</b> expiring in 90 days</span>" : "") + "</div></div>";
      if (PH.view === "queue") {
        h += r.queue.length ? '<div class="hms-list">' + r.queue.map(function (x) {
          return '<button type="button" class="hms-row" data-rx="' + esc(x.id) + '"><span class="avatar">℞</span><span class="grow"><b>' + esc(x.patient_name || "") + " · " + esc(x.number) + "</b><small>" + esc(x.n_items + " medicine" + (x.n_items === 1 ? "" : "s")) + " · " + esc(x.doctor || "") + " · " + esc(M().dt(x.created_ts)) + "</small></span>" + M().rxPill(x.status) + "</button>";
        }).join("") + "</div>" : '<div class="card ops-empty"><div class="ops-empty-ic">💊</div><h2>Nothing waiting</h2><p class="sub">Signed prescriptions appear here.</p></div>';
      } else {
        var items = (f && f.items) || [];
        h += items.length ? '<div class="card"><div class="scroll-x"><table class="t"><thead><tr><th>Medicine</th><th>Form</th><th>Price</th><th>In stock</th><th>Next expiry</th><th></th></tr></thead><tbody>' + items.map(function (x) {
          return "<tr" + (x.active ? "" : ' class="muted"') + "><td><b>" + esc(x.name) + "</b> " + esc(x.strength || "") + (x.generic ? '<div class="mini">' + esc(x.generic) + "</div>" : "") + "</td><td>" + esc(x.form || "") + (x.pack ? " · " + esc(x.pack) : "") + "</td><td>" + M().money(x.price) + (x.gst_pct ? ' <span class="mini">+' + x.gst_pct + "%</span>" : "") +
            '</td><td><b class="' + (x.low ? "late" : "") + '">' + x.stock + "</b>" + (x.low ? ' <span class="tag emg">reorder</span>' : "") + "</td><td>" + (x.next_expiry ? '<span class="' + (x.expiring_soon ? "late" : "") + '">' + esc(M().day(x.next_expiry)) + "</span>" : "–") + "</td><td>" +
            (can("stock") ? '<button type="button" class="btn btn-sm" data-recv="' + esc(x.id) + '">Receive</button> <button type="button" class="btn btn-sm btn-ghost" data-adj="' + esc(x.id) + '">Adjust</button> <button type="button" class="btn btn-sm btn-ghost" data-edit=\'' + esc(JSON.stringify(x)) + "'>Edit</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div></div>" : '<div class="card ops-empty"><div class="ops-empty-ic">📦</div><h2>No medicines in the formulary</h2><p class="sub">Add the medicines your pharmacy stocks, with prices, then receive stock in batches with expiry dates.</p></div>';
      }
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-v]"))) { PH.view = t.getAttribute("data-v"); return loadPharmacy(); }
        if ((t = e.target.closest("[data-rx]"))) return api("/hospital/rx/" + encodeURIComponent(t.getAttribute("data-rx"))).then(function (x) { if (x.ok) dispense(x.item); });
        if (e.target.closest("[data-additem]")) return item({});
        if ((t = e.target.closest("[data-edit]"))) return item(JSON.parse(t.getAttribute("data-edit")));
        if ((t = e.target.closest("[data-recv]"))) return receive(t.getAttribute("data-recv"));
        if ((t = e.target.closest("[data-adj]"))) { var d = window.prompt("Add (e.g. 10) or remove (e.g. -3) how many?"); if (!d) return; var why = window.prompt("Reason (damaged, expired, count correction…)"); if (!why) return; api("/hospital/pharmacy/formulary/" + encodeURIComponent(t.getAttribute("data-adj")) + "/stock", { method: "POST", body: { adjust: d, reason: why } }).then(function (x) { M().reply(x, loadPharmacy); }); }
      };
    });
  }
  function item(x) {
    var forms = (META && META.forms) || ["tablet", "capsule", "syrup", "injection", "other"];
    var b = M().modal('<h2 id="ops-title">' + (x.id ? "Edit " + esc(x.name) : "Add a medicine") + '</h2><form id="it-form" novalidate><div class="grid2"><div class="field"><label for="it-n">Name (as on the pack)</label><input class="input" id="it-n" maxlength="120" value="' + esc(x.name || "") + '"></div>' +
      '<div class="field"><label for="it-g">Generic name</label><input class="input" id="it-g" maxlength="120" value="' + esc(x.generic || "") + '"></div></div><div class="grid3">' +
      '<div class="field"><label for="it-s">Strength</label><input class="input" id="it-s" maxlength="40" placeholder="e.g. 500 mg" value="' + esc(x.strength || "") + '"></div>' +
      '<div class="field"><label for="it-f">Form</label><select class="input" id="it-f">' + forms.map(function (f) { return "<option" + (f === x.form ? " selected" : "") + ">" + f + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="it-pk">Pack</label><input class="input" id="it-pk" maxlength="40" placeholder="e.g. strip of 10" value="' + esc(x.pack || "") + '"></div></div><div class="grid3">' +
      '<div class="field"><label for="it-p">Price per unit (₹)</label><input class="input" id="it-p" inputmode="decimal" value="' + esc(x.price != null ? x.price / 100 : "") + '"></div>' +
      '<div class="field"><label for="it-gst">GST %</label><input class="input" id="it-gst" inputmode="decimal" value="' + esc(x.gst_pct || 0) + '"></div>' +
      '<div class="field"><label for="it-r">Reorder at</label><input class="input" id="it-r" inputmode="numeric" value="' + esc(x.reorder_level || 0) + '"></div></div>' +
      (x.id ? '<label class="hp-check"><input type="checkbox" id="it-a"' + (x.active === false ? "" : " checked") + "> <span>In use</span></label>" : "") +
      '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="it-msg"></div></form>');
    el("it-form").onsubmit = function (e) {
      e.preventDefault();
      api("/hospital/pharmacy/formulary", { method: "POST", body: { id: x.id, name: el("it-n").value, generic: el("it-g").value, strength: el("it-s").value, form: el("it-f").value, pack: el("it-pk").value,
        price: el("it-p").value, gst_pct: el("it-gst").value, reorder_level: el("it-r").value, active: el("it-a") ? el("it-a").checked : true } }).then(function (r) {
        if (!r.ok) return say(el("it-msg"), r.message, "err");
        toast("Saved."); M().close(); loadPharmacy();
      });
    };
    void b;
  }
  function receive(id) {
    M().modal('<h2 id="ops-title">Receive stock</h2><form id="rc-form" novalidate><div class="grid3"><div class="field"><label for="rc-q">Quantity (units)</label><input class="input" id="rc-q" inputmode="numeric"></div>' +
      '<div class="field"><label for="rc-b">Batch</label><input class="input" id="rc-b" maxlength="40"></div><div class="field"><label for="rc-e">Expiry</label><input class="input" type="date" id="rc-e" min="' + M().addDays(M().today(), 1) + '"></div></div>' +
      '<div class="field"><label for="rc-s">Supplier / invoice</label><input class="input" id="rc-s" maxlength="80"></div><button class="btn btn-primary" type="submit">Receive</button><div class="msg" id="rc-msg"></div></form>');
    el("rc-form").onsubmit = function (e) {
      e.preventDefault();
      api("/hospital/pharmacy/formulary/" + encodeURIComponent(id) + "/stock", { method: "POST", body: { qty: el("rc-q").value, batch: el("rc-b").value, expiry: el("rc-e").value, supplier: el("rc-s").value } }).then(function (r) {
        if (!r.ok) return say(el("rc-msg"), r.message, "err");
        toast(r.message); M().close(); loadPharmacy();
      });
    };
  }
  function dispense(x) {
    api("/hospital/pharmacy/formulary").then(function (fr) {
      var form = (fr && fr.items) || [];
      function match(it) { return form.filter(function (f) { return f.name.toLowerCase() === it.name.toLowerCase() && (!it.strength || (f.strength || "").toLowerCase() === it.strength.toLowerCase()); })[0] || form.filter(function (f) { return f.id === it.formulary_id; })[0]; }
      var b = M().modal('<h2 id="ops-title">Dispense ' + esc(x.number) + '</h2><div class="rx-pt"><b>' + esc(x.patient_name || "") + "</b><span>" + esc(x.mrn || "") + "</span>" +
        ((x.allergies || []).length ? '<span class="al-lab">Allergies</span>' + x.allergies.map(function (a) { return '<span class="al">' + esc(a) + "</span>"; }).join("") : "") + "</div>" +
        '<div class="scroll-x"><table class="t"><thead><tr><th>Medicine</th><th>How</th><th>Prescribed</th><th>Given</th><th>In stock</th><th>Give now</th></tr></thead><tbody>' + x.items.map(function (it, i) {
          var f = match(it), given = ((x.dispensed || {})[String(i)] || {}).qty || 0, want = Math.max(0, (it.quantity || 1) - given);
          return "<tr><td><b>" + esc(it.name) + "</b> " + esc(it.strength || "") + "</td><td>" + esc((it.dose || "") + " " + it.frequency_text + (it.days ? " × " + it.days + "d" : "")) + "</td><td>" + (it.quantity || "–") + "</td><td>" + given + "</td><td>" + (f ? f.stock : '<span class="mini">not stocked</span>') +
            '</td><td><input class="input sm" data-q="' + i + '" inputmode="numeric" value="' + want + '" style="width:80px"></td></tr>';
        }).join("") + '</tbody></table></div><button class="btn btn-primary" type="button" data-go>Dispense</button><div class="msg" id="dp-msg"></div>', true, 2);
      b.onclick = function (e) {
        if (!e.target.closest("[data-go]")) return;
        var lines = [].map.call(b.querySelectorAll("[data-q]"), function (i) { return { idx: +i.getAttribute("data-q"), qty: +i.value || 0 }; }).filter(function (l) { return l.qty > 0; });
        api("/hospital/rx/" + encodeURIComponent(x.id) + "/dispense", { method: "POST", body: { lines: lines } }).then(function (r) {
          if (!r.ok) return say(el("dp-msg"), r.message, "err");
          toast(r.message); M().close(2); if (el("tab-pharmacy") && !el("tab-pharmacy").hidden) loadPharmacy();
        });
      };
    });
  }

  /* ================================================================ billing */
  var BL = { view: "desk" };
  function loadBilling() {
    var box = el("tab-billing");
    box.innerHTML = '<div class="empty">Loading bills…</div>';
    var q = BL.view === "today" ? "?day=" + M().today() : BL.view === "unpaid" ? "?status=unpaid" : BL.view === "draft" ? "?status=draft" : "";
    if (BL.view === "day") return dayClose(box);
    if (BL.view === "desk") return payDesk(box);
    if (BL.view === "prices") return priceList(box);
    if (BL.view === "gst" && window.QCGst) return window.QCGst.panel(box, head());
    api("/hospital/billing" + q).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
      var h = head() + (r.items.length ? '<div class="hms-list">' + r.items.map(function (x) {
        return '<button type="button" class="hms-row" data-bill="' + esc(x.id) + '"><span class="grow"><b>' + esc(x.patient_name || "Patient") + " · " + esc(x.number || "Draft") + "</b><small>" + esc(x.mrn || "") + " · " + esc(M().dt(x.created_ts)) + (x.payer !== "self" ? " · " + esc(x.payer) + (x.claim_status !== "none" ? " (" + esc(x.claim_status.replace("_", " ")) + ")" : "") : "") + (x.unpriced ? ' · <b class="late">' + x.unpriced + " to price</b>" : "") + '</small></span><b class="amt">' + M().money(x.total) + "</b>" + M().billPill(x) + "</button>";
      }).join("") + "</div>" : '<div class="card ops-empty"><div class="ops-empty-ic">🧾</div><h2>No bills here</h2><p class="sub">Bills start from a visit (the Bill button) or from a patient\'s record.</p></div>');
      box.innerHTML = h;
      wire(box);
    });
  }
  function head() {
    return '<div class="hms-head"><div><h2>Billing</h2><p class="sub">Bills fill themselves from the visit: consultation, tests, bed-days and medicines. Add anything else, take payment, print the receipt.</p></div>' +
      '<button class="btn btn-primary" type="button" data-newbill>+ New bill</button></div><div class="ops-bar"><div class="chips">' +
      [["desk", "Payments desk"], ["today", "Today"], ["draft", "Drafts"], ["unpaid", "Unpaid"], ["all", "All"], ["day", "Day close"]].concat(can("billing_admin") || can("prices") ? [["prices", "Price list"]] : []).concat(window.QCGst && (can("billing_admin") || can("reports") || can("org")) ? [["gst", "GST & accounts"]] : []).map(function (v) { return '<button type="button" class="chipbtn' + (BL.view === v[0] ? " on" : "") + '" data-bv="' + v[0] + '">' + v[1] + "</button>"; }).join("") + "</div></div>";
  }
  function wire(box) {
    box.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-bv]"))) { BL.view = t.getAttribute("data-bv"); return loadBilling(); }
      if ((t = e.target.closest("[data-bill]"))) return openBill(t.getAttribute("data-bill"));
      if (e.target.closest("[data-newbill]")) {
        var b = M().modal('<h2 id="ops-title">New bill</h2><p class="sub">For a visit, open the visit and press Bill. For a counter sale or anything else, choose the patient.</p><div class="field"><label>Patient</label><div id="nb-p"></div></div>');
        Q().picker(el("nb-p"), function (p) { if (p) newBill(p); });
        void b;
      }
      if (e.target.closest("[data-starter]")) api("/hospital/billing/prices", { method: "POST", body: { starter: true } }).then(function (r) { M().reply(r, loadBilling); });
      if (e.target.closest("[data-addprice]")) return priceForm({});
      if ((t = e.target.closest("[data-price]"))) return priceForm(JSON.parse(t.getAttribute("data-price")));
    };
  }
  /* the payments desk: who owes money, visits still to bill, today's takings */
  function payDesk(box) {
    api("/hospital/billing/desk").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = head() + '<div class="notice bad">' + esc(r.message || "Couldn't load the desk.") + "</div>"; return; }
      var t = r.today;
      var h = head() + '<div class="pd-kpis"><div class="pd-k big"><span>Collected today</span><b>' + M().money(t.collected) + "</b><small>" + t.receipts + " receipt" + (t.receipts === 1 ? "" : "s") + "</small></div>" +
        t.by_mode.map(function (m) { return '<div class="pd-k"><span>' + esc(m.label) + "</span><b>" + M().money(m.amount) + "</b></div>"; }).join("") +
        '<div class="pd-k warn"><span>Outstanding</span><b>' + M().money(r.outstanding) + "</b><small>" + r.unpaid.length + " bill" + (r.unpaid.length === 1 ? "" : "s") + "</small></div></div>";
      h += '<div class="pd-grid"><div class="card"><div class="card-h"><h2>Waiting for payment</h2></div>' + (r.unpaid.length ? r.unpaid.map(function (x) {
        return '<div class="pd-row"><button type="button" class="link grow" data-bill="' + esc(x.id) + '"><b>' + esc(x.patient_name || "Patient") + "</b><small>" + esc(x.number || "") + " · " + esc(x.mrn || "") + (x.payer && x.payer !== "self" ? " · " + esc(x.payer) : "") + "</small></button>" +
          '<span class="pd-due">' + M().money(x.due) + '</span><button type="button" class="btn btn-sm btn-primary" data-collect=\'' + esc(JSON.stringify({ id: x.id, due: x.due, name: x.patient_name, number: x.number })) + "'>Collect</button></div>";
      }).join("") : '<div class="mini">Nobody owes anything. 🎉</div>') + "</div>";
      h += '<div class="card"><div class="card-h"><h2>Today\'s visits to bill</h2></div>' + (r.unbilled.length ? r.unbilled.map(function (e) {
        return '<div class="pd-row"><span class="grow"><b>' + esc(e.patient_name || "Patient") + "</b><small>" + esc(e.kind) + (e.doctor ? " · " + esc(e.doctor) : "") + " · " + esc(M().dt(e.created_ts)) + (e.status !== "closed" ? " · in progress" : "") + "</small></span>" +
          '<button type="button" class="btn btn-sm" data-billvisit="' + esc(e.encounter_id) + '">Make bill</button></div>';
      }).join("") : '<div class="mini">Every visit today has a bill.</div>') +
        (r.drafts.length ? '<div class="ops-h" style="margin-top:14px">Drafts</div>' + r.drafts.slice(0, 12).map(function (x) {
          return '<div class="pd-row"><button type="button" class="link grow" data-bill="' + esc(x.id) + '"><b>' + esc(x.patient_name || "Patient") + "</b><small>" + esc(M().dt(x.created_ts)) + (x.unpriced ? " · " + x.unpriced + " item(s) need a price" : "") + "</small></button><span class=\"pd-due\">" + M().money(x.total) + "</span></div>";
        }).join("") : "") + "</div></div>";
      if (r.can_price) h += '<p class="mini">You can change prices under <button type="button" class="link" data-bv="prices">Price list</button>, including a consultation fee for each doctor.</p>';
      box.innerHTML = h;
      wire(box);
      box.addEventListener("click", function (e) {
        var t;
        if ((t = e.target.closest("[data-billvisit]"))) return forVisit(t.getAttribute("data-billvisit"));
        if ((t = e.target.closest("[data-collect]"))) return collect(JSON.parse(t.getAttribute("data-collect")), r.modes);
      });
    });
  }
  function collect(x, modes) {
    var mode = "cash";
    var b = M().modal('<h2 id="ops-title">Collect payment</h2><p class="sub">' + esc(x.name || "") + " · " + esc(x.number || "") + " · due <b>" + M().money(x.due) + "</b></p>" +
      '<div class="field"><label for="cp-a">Amount (₹)</label><input class="input" id="cp-a" type="number" min="1" step="0.01" value="' + (x.due / 100) + '"></div>' +
      '<div class="lbl">Paid by</div><div class="chips" id="cp-m">' + Object.keys(modes).map(function (k) { return '<button type="button" class="chipbtn' + (k === mode ? " on" : "") + '" data-mode="' + k + '">' + esc(modes[k]) + "</button>"; }).join("") + "</div>" +
      '<div class="field" style="margin-top:10px"><label for="cp-r">Reference (UPI or card ref., cheque no.)</label><input class="input" id="cp-r" maxlength="60"></div>' +
      '<button class="btn btn-primary" type="button" data-pay>Record payment</button><div class="msg" id="cp-msg"></div>', false, 2);
    b.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-mode]"))) { mode = t.getAttribute("data-mode"); [].forEach.call(b.querySelectorAll("[data-mode]"), function (c) { c.classList.toggle("on", c === t); }); return; }
      if (!e.target.closest("[data-pay]")) return;
      api("/hospital/billing/" + encodeURIComponent(x.id), { method: "POST", body: { action: "pay", amount: el("cp-a").value, mode: mode, reference: el("cp-r").value } }).then(function (r) {
        if (!r.ok) return H().say(el("cp-msg"), r.message, "err");
        toast(r.message + (r.receipt ? " Receipt " + r.receipt + "." : "")); M().close(2); loadBilling();
      });
    };
  }
  function newBill(p) {
    api("/hospital/billing/standalone", { method: "POST", body: { patient_id: p.id } }).then(function (r) { if (M().reply(r)) { M().close(); renderBill(r.item); } });
  }
  function forVisit(eid) { api("/hospital/billing/encounter/" + encodeURIComponent(eid)).then(function (r) { if (H().guard(r)) return; if (!r.ok) return toast(r.message, "err"); renderBill(r.item); }); }
  function openBill(id) { api("/hospital/billing/" + encodeURIComponent(id)).then(function (r) { if (H().guard(r)) return; if (!r.ok) return toast(r.message, "err"); renderBill(r.item); }); }
  function billPrint(x, receipt) {
    return M().letterhead(x.org) + '<div class="ph-doc"><div class="ph-row"><div><b>' + (x.status === "final" ? "Bill " + esc(x.number) : "Draft bill (not final)") + "</b><span>" + esc(M().dt(x.finalised_ts || x.created_ts)) + '</span></div><div class="ph-r"><b>' + esc(x.patient_name || "") + "</b><span>MRN " + esc(x.mrn || "") + "</span></div></div>" +
      '<table class="ph-t"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead><tbody>' + x.lines.map(function (l) {
        return "<tr><td>" + esc(l.description) + "</td><td>" + l.qty + "</td><td>" + M().money(l.unit_price) + "</td><td>" + (l.gst_pct ? l.gst_pct + "%" : "") + "</td><td>" + M().money(l.amount) + "</td></tr>";
      }).join("") + '</tbody></table><div class="ph-tot"><span>Subtotal</span><b>' + M().money(x.subtotal) + "</b>" + (x.tax ? "<span>GST</span><b>" + M().money(x.tax) + "</b>" : "") + (x.discount ? "<span>Discount</span><b>−" + M().money(x.discount) + "</b>" : "") +
      "<span>Total</span><b>" + M().money(x.total) + "</b><span>Paid</span><b>" + M().money(x.paid) + "</b><span>Due</span><b>" + M().money(x.due) + "</b></div>" +
      (x.payments.length ? '<div class="ph-s">Payments: ' + x.payments.map(function (p) { return esc(p.receipt + " · " + p.mode_label + " " + M().money(p.amount) + " · " + M().dt(p.ts)); }).join("; ") + "</div>" : "") +
      (receipt ? '<div class="ph-sign"><span>Receipt ' + esc(receipt) + "</span></div>" : "") + "</div>";
  }
  function renderBill(x) {
    var draft = x.status === "draft", admin = can("billing_admin");
    var h = '<div class="rx-view-h"><h2 id="ops-title">' + esc(x.number || "Draft bill") + "</h2>" + M().billPill(x) + '</div><div class="mini">' + esc(x.patient_name || "") + " · MRN " + esc(x.mrn || "") + (x.encounter_id ? " · from a visit" : "") + "</div>" +
      (x.unpriced ? '<div class="notice wait">' + x.unpriced + " line" + (x.unpriced > 1 ? "s have" : " has") + " no price in your price list. Set a price to finalise.</div>" : "") +
      '<div class="scroll-x"><table class="t bill-t"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th><th></th></tr></thead><tbody>' + x.lines.map(function (l) {
        return '<tr class="' + (l.unpriced ? "unpriced" : "") + '"><td>' + esc(l.description) + ' <span class="mini">' + esc(l.category) + (l.auto ? " · auto" : "") + "</span></td><td>" + l.qty + "</td><td>" +
          (draft && (l.unpriced || !l.auto || admin) ? '<input class="input sm" data-price-line="' + esc(l.id) + '" inputmode="decimal" value="' + (l.unit_price / 100) + '" style="width:90px">' : M().money(l.unit_price)) + (l.gst_pct ? ' <span class="mini">+' + l.gst_pct + "%</span>" : "") +
          "</td><td>" + M().money(l.amount) + "</td><td>" + (draft && (!l.auto || l.unpriced) ? '<button type="button" class="btn btn-sm btn-ghost" data-rmline="' + esc(l.id) + '" aria-label="Remove">✕</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      (draft ? '<div class="bill-add"><select class="input" id="bl-pr"><option value="">Add from price list…</option></select><span class="mini">or</span><input class="input" id="bl-d" placeholder="Description" maxlength="160"><input class="input sm" id="bl-q" value="1" inputmode="decimal" style="width:60px"><input class="input sm" id="bl-u" placeholder="₹ rate" inputmode="decimal" style="width:90px"><button type="button" class="btn btn-sm" data-add>Add</button></div>' : "") +
      '<div class="bill-tot"><span>Subtotal</span><b>' + M().money(x.subtotal) + "</b>" + (x.tax ? "<span>GST</span><b>" + M().money(x.tax) + "</b>" : "") + (x.discount ? "<span>Discount" + (x.discount_reason ? " · " + esc(x.discount_reason) : "") + "</span><b>−" + M().money(x.discount) + "</b>" : "") +
      '<span class="big">Total</span><b class="big">' + M().money(x.total) + "</b><span>Paid</span><b>" + M().money(x.paid) + '</b><span class="' + (x.due > 0 ? "late" : "") + '">Due</span><b class="' + (x.due > 0 ? "late" : "") + '">' + M().money(x.due) + "</b></div>";
    if (draft) h += '<details class="bill-more"><summary>Payer, discount</summary><div class="grid3"><div class="field"><label for="bl-payer">Payer</label><select class="input" id="bl-payer">' + [["self", "Self-pay"], ["insurance", "Insurance / TPA"], ["scheme", "Government scheme"], ["corporate", "Corporate"]].map(function (p) { return '<option value="' + p[0] + '"' + (x.payer === p[0] ? " selected" : "") + ">" + p[1] + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="bl-pn">Insurer / scheme</label><input class="input" id="bl-pn" maxlength="80" value="' + esc(x.payer_name || "") + '"></div><div class="field"><label for="bl-pol">Policy / card no.</label><input class="input" id="bl-pol" maxlength="60" value="' + esc(x.policy || "") + '"></div></div>' +
      '<div class="grid3"><div class="field"><label for="bl-dis">Discount (₹)</label><input class="input" id="bl-dis" inputmode="decimal" value="' + (x.discount ? x.discount / 100 : "") + '"></div><div class="field" style="grid-column:span 2"><label for="bl-dr">Reason</label><input class="input" id="bl-dr" maxlength="120" value="' + esc(x.discount_reason || "") + '"></div></div>' +
      '<button type="button" class="btn btn-sm" data-upd>Save</button></details>';
    else if (x.payer !== "self") h += '<div class="field"><label for="bl-claim">Claim status (' + esc(x.payer_name || x.payer_label) + ')</label><select class="input" id="bl-claim">' + ["none", "preauth_pending", "preauth_approved", "submitted", "settled", "rejected"].map(function (c) { return '<option value="' + c + '"' + (x.claim_status === c ? " selected" : "") + ">" + c.replace("_", " ") + "</option>"; }).join("") + "</select></div>";
    if (x.status === "final" && x.due > 0) h += '<div class="bill-pay"><input class="input" id="py-a" inputmode="decimal" value="' + (x.due / 100) + '" aria-label="Amount"><select class="input" id="py-m"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="insurance">Insurance</option><option value="scheme">Government scheme</option><option value="other">Other</option></select><input class="input" id="py-r" placeholder="Reference (UPI / card)" maxlength="60"><button type="button" class="btn btn-primary" data-pay>Take payment</button></div>';
    if (x.payments.length) h += '<div class="ops-sec"><div class="ops-h">Payments</div>' + x.payments.map(function (p) { return '<div class="hms-row"><span class="grow"><b>' + M().money(p.amount) + " · " + esc(p.mode_label) + "</b><small>" + esc(p.receipt) + " · " + esc(M().dt(p.ts)) + " · " + esc(p.by || "") + (p.reference ? " · " + esc(p.reference) : "") + '</small></span><button type="button" class="btn btn-sm btn-ghost" data-receipt="' + esc(p.receipt) + '">Receipt</button></div>'; }).join("") + "</div>";
    h += '<div class="row" style="margin-top:12px">' + (draft ? '<button type="button" class="btn btn-primary" data-final>Finalise bill</button>' : "") + '<button type="button" class="btn" data-print>Print</button>' + (x.status === "final" && window.QCGst ? '<button type="button" class="btn" data-gstinv>GST invoice</button>' : "") +
      (admin && x.status === "final" && x.paid > 0 ? '<button type="button" class="btn btn-ghost" data-refund>Refund</button>' : "") + (admin && x.status !== "void" ? '<button type="button" class="btn btn-ghost" data-void>Void</button>' : "") + '</div><div class="msg" id="bl-msg"></div>' + (x.void_reason ? '<div class="mini">Voided: ' + esc(x.void_reason) + "</div>" : "");
    var b = M().modal(h, true, 2);
    if (draft) api("/hospital/billing/prices").then(function (r) { if (r.ok && el("bl-pr")) el("bl-pr").innerHTML = '<option value="">Add from price list…</option>' + r.items.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + " · " + M().money(p.price) + "</option>"; }).join(""); });
    function act(body, after) {
      api("/hospital/billing/" + encodeURIComponent(x.id), { method: "POST", body: body }).then(function (r) {
        if (H().guard(r)) return;
        if (!r.ok) return say(el("bl-msg"), r.message, "err");
        toast(r.message);
        renderBill(r.item);
        if (after) after(r);
        if (el("tab-billing") && !el("tab-billing").hidden) loadBilling();
      });
    }
    b.onchange = function (e) {
      var t;
      if ((t = e.target.closest("[data-price-line]"))) act({ action: "edit_line", line_id: t.getAttribute("data-price-line"), unit_price: t.value });
      if (e.target.id === "bl-pr" && e.target.value) act({ action: "add_line", price_id: e.target.value, qty: 1 });
      if (e.target.id === "bl-claim") act({ action: "update", claim_status: e.target.value });
    };
    b.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-rmline]"))) return act({ action: "edit_line", line_id: t.getAttribute("data-rmline"), remove: true });
      if (e.target.closest("[data-add]")) return act({ action: "add_line", description: el("bl-d").value, qty: el("bl-q").value, unit_price: el("bl-u").value, category: "other" });
      if (e.target.closest("[data-upd]")) return act({ action: "update", payer: el("bl-payer").value, payer_name: el("bl-pn").value, policy: el("bl-pol").value, discount: el("bl-dis").value || 0, discount_reason: el("bl-dr").value });
      if (e.target.closest("[data-final]")) { if (window.confirm("Finalise the bill? It can't be edited afterwards.")) act({ action: "finalise" }); return; }
      if (e.target.closest("[data-pay]")) return act({ action: "pay", amount: el("py-a").value, mode: el("py-m").value, reference: el("py-r").value }, function (r) { if (r.receipt && window.confirm("Print receipt " + r.receipt + "?")) M().print(billPrint(r.item, r.receipt)); });
      if ((t = e.target.closest("[data-receipt]"))) return M().print(billPrint(x, t.getAttribute("data-receipt")));
      if (e.target.closest("[data-print]")) return M().print(billPrint(x));
      if (e.target.closest("[data-gstinv]")) return window.QCGst.printInvoice(x.id);
      if (e.target.closest("[data-refund]")) { var a = window.prompt("Refund how much (₹)?"); if (!a) return; var m = window.prompt("Refund by: cash, upi, card or other", "cash"); if (!m) return; return act({ action: "pay", amount: a, mode: m.trim().toLowerCase(), refund: true }); }
      if (e.target.closest("[data-void]")) { var why = window.prompt("Why void this bill?"); if (why) act({ action: "void", reason: why }); }
    };
  }
  function dayClose(box) {
    api("/hospital/billing/day?day=" + (BL.day || M().today())).then(function (r) {
      if (H().guard(r)) return;
      var h = head() + '<div class="ops-bar"><div class="row"><input class="input" type="date" id="dc-day" value="' + esc(r.day) + '" max="' + M().today() + '"><button type="button" class="btn btn-sm" data-printday>Print</button></div></div>' +
        '<div class="hms-stats big"><span><b>' + M().money(r.collected) + "</b>collected</span><span><b>" + M().money(r.billed) + "</b>billed (" + r.bills_finalised + " bills)</span><span><b>" + M().money(r.refunds) + "</b>refunded</span><span><b>" + M().money(r.outstanding) + "</b>outstanding (all days)</span></div>" +
        '<div class="rec-grid"><section class="card"><div class="ops-h">By payment mode</div>' + (r.by_mode.map(function (m) { return '<div class="kv"><span>' + esc(m.label) + "</span><b>" + M().money(m.amount) + "</b></div>"; }).join("") || '<div class="mini">No payments.</div>') + "</section>" +
        '<section class="card"><div class="ops-h">By cashier</div>' + (r.by_staff.map(function (m) { return '<div class="kv"><span>' + esc(m.name) + "</span><b>" + M().money(m.amount) + "</b></div>"; }).join("") || '<div class="mini">No payments.</div>') + "</section>" +
        '<section class="card"><div class="ops-h">Billed by category</div>' + (r.by_category.map(function (m) { return '<div class="kv"><span>' + esc(m.label) + "</span><b>" + M().money(m.amount) + "</b></div>"; }).join("") || '<div class="mini">No final bills.</div>') + "</section></div>";
      box.innerHTML = h;
      wire(box);
      el("dc-day").onchange = function () { BL.day = this.value; loadBilling(); };
      box.querySelector("[data-printday]").onclick = function () { M().print('<div class="ph-doc"><h2>Day close · ' + esc(M().day(r.day)) + "</h2>" + box.querySelector(".hms-stats").outerHTML + box.querySelector(".rec-grid").outerHTML + "</div>"); };
    });
  }
  function priceList(box) {
    api("/hospital/billing/prices").then(function (r) {
      if (H().guard(r)) return;
      var groups = {};
      r.items.forEach(function (p) { (groups[p.category] = groups[p.category] || []).push(p); });
      var h = head() + '<div class="row" style="margin-bottom:12px"><button type="button" class="btn btn-primary btn-sm" data-addprice>+ Add a price</button>' + (!r.items.length ? '<button type="button" class="btn btn-sm" data-starter>Start from a typical price list</button>' : "") + "</div>" +
        (r.items.length ? Object.keys(groups).map(function (c) {
          return '<section class="card"><div class="ops-h">' + esc(r.categories[c] || c) + "</div>" + groups[c].map(function (p) { return '<button type="button" class="kv btnlike" data-price=\'' + esc(JSON.stringify(p)) + "'><span>" + esc(p.name) + (p.code ? ' <span class="mini">' + esc(p.code) + "</span>" : "") + "</span><b>" + M().money(p.price) + (p.gst_pct ? ' <span class="mini">+' + p.gst_pct + "%</span>" : "") + "</b></button>"; }).join("") + "</section>";
        }).join("") : '<div class="card ops-empty"><div class="ops-empty-ic">🏷️</div><h2>No prices yet</h2><p class="sub">Bills match tests, scans and procedures to this list by name. Start from a typical list and adjust it.</p></div>');
      box.innerHTML = h;
      wire(box);
    });
  }
  function priceForm(p) {
    api("/hospital/billing/prices").then(function (r) {
      var cats = r.categories || {};
      M().modal('<h2 id="ops-title">' + (p.id ? "Edit price" : "Add a price") + '</h2><form id="pr-form" novalidate><div class="grid2"><div class="field"><label for="pr-c">Category</label><select class="input" id="pr-c">' + Object.keys(cats).map(function (k) { return '<option value="' + k + '"' + (p.category === k ? " selected" : "") + ">" + esc(cats[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="pr-n">Name (bills match orders by this name)</label><input class="input" id="pr-n" maxlength="120" value="' + esc(p.name || "") + '"></div></div><div class="grid3"><div class="field"><label for="pr-p">Price (₹)</label><input class="input" id="pr-p" inputmode="decimal" value="' + (p.price != null ? p.price / 100 : "") + '"></div>' +
        '<div class="field"><label for="pr-g">GST %</label><input class="input" id="pr-g" inputmode="decimal" value="' + esc(p.gst_pct || 0) + '"></div><div class="field"><label for="pr-k">Code</label><input class="input" id="pr-k" maxlength="20" value="' + esc(p.code || "") + '"></div></div>' +
        '<div class="field"><label for="pr-w">For beds: ward type</label><select class="input" id="pr-w"><option value="">–</option>' + ["general", "private", "icu", "emergency", "maternity", "paediatric", "daycare"].map(function (w) { return "<option" + (p.ward_kind === w ? " selected" : "") + ">" + w + "</option>"; }).join("") + "</select></div>" +
        '<button class="btn btn-primary" type="submit">Save</button> ' + (p.id ? '<button class="btn btn-ghost" type="button" id="pr-rm">Remove</button>' : "") + '<div class="msg" id="pr-msg"></div></form>');
      function send(remove) {
        api("/hospital/billing/prices", { method: "POST", body: { id: p.id, category: el("pr-c").value, name: el("pr-n").value, price: el("pr-p").value, gst_pct: el("pr-g").value, code: el("pr-k").value, ward_kind: el("pr-w").value, remove: !!remove } }).then(function (x) {
          if (!x.ok) return say(el("pr-msg"), x.message, "err");
          toast(x.message); M().close(); loadBilling();
        });
      }
      el("pr-form").onsubmit = function (e) { e.preventDefault(); send(false); };
      if (el("pr-rm")) el("pr-rm").onclick = function () { send(true); };
    });
  }

  /* ================================================================ duty roster */
  var DT = { start: "" };
  function loadDuty() {
    var box = el("tab-duty");
    box.innerHTML = '<div class="empty">Loading the roster…</div>';
    api("/hospital/duty" + (DT.start ? "?start=" + DT.start : "")).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
      DT.start = r.start;
      var SH = r.shifts, code = { morning: "M", evening: "E", night: "N", day: "D", on_call: "OC", off: "Off", leave: "L" };
      var h = '<div class="hms-head"><div><h2>Duty roster</h2><p class="sub">Who works which shift, and where. ' + (r.can_edit ? "Click a cell to change it." : "") + "</p></div>" + (r.can_edit ? '<button class="btn btn-ghost" type="button" data-copy>Copy last week</button>' : "") + "</div>" +
        (r.now.length ? '<div class="duty-now"><b>On duty now</b>' + r.now.map(function (n) { return '<span class="dn">' + esc(n.name) + ' <small>' + esc(n.shift + (n.where ? " · " + n.where : "")) + "</small></span>"; }).join("") + "</div>" : "") +
        '<div class="ops-bar"><div class="ap-day"><button type="button" class="btn btn-sm btn-ghost" data-w="-7" aria-label="Previous week">‹</button><b class="ap-dname">Week of ' + esc(M().day(r.start)) + '</b><button type="button" class="btn btn-sm btn-ghost" data-w="7" aria-label="Next week">›</button></div>' +
        '<div class="ops-bar-r duty-key">' + ["morning", "evening", "night", "day", "on_call", "off", "leave"].filter(function (k) { return SH[k]; }).map(function (k) { return '<span class="sh sh-' + k + '">' + code[k] + "</span> " + esc(SH[k].label) + (SH[k].from ? ' <span class="mini">' + SH[k].from + "–" + SH[k].to + "</span>" : ""); }).join(" ") + "</div></div>" +
        '<div class="card"><div class="scroll-x"><table class="t duty-t"><thead><tr><th>Staff</th>' + r.days.map(function (d) { return "<th" + (d === M().today() ? ' class="today"' : "") + ">" + esc(M().day(d)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        r.rows.map(function (row) {
          return "<tr><td><b>" + esc(row.name) + '</b><div class="mini">' + esc(row.roles.join(", ")) + "</div></td>" + row.days.map(function (c) {
            return '<td><button type="button" class="sh-cell' + (c.shift ? " sh-" + c.shift : "") + '" data-shift="' + esc(c.shift || "") + '" data-cell="' + esc(row.staff_id) + "|" + c.day + '"' + (r.can_edit ? "" : " disabled") + ' title="' + esc(c.shift ? SH[c.shift].label : "Not set") + '">' + (c.shift ? code[c.shift] : "·") + "</button></td>";
          }).join("") + "</tr>";
        }).join("") + '</tbody><tfoot><tr><td class="mini">Cover (M / E / N)</td>' + r.cover.map(function (c) { return '<td class="mini">' + c.morning + " / " + c.evening + " / " + c.night + "</td>"; }).join("") + "</tr></tfoot></table></div></div>";
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-w]"))) { DT.start = M().addDays(DT.start, +t.getAttribute("data-w")); return loadDuty(); }
        if (e.target.closest("[data-copy]")) return api("/hospital/duty", { method: "POST", body: { copy_previous: true, start: DT.start } }).then(function (x) { M().reply(x, loadDuty); });
        if ((t = e.target.closest("[data-cell]"))) {
          var v = t.getAttribute("data-cell").split("|"), order = ["", "morning", "evening", "night", "day", "on_call", "off", "leave"];
          var cur = t.getAttribute("data-shift") || "", next = order[(order.indexOf(cur) + 1) % order.length];
          api("/hospital/duty", { method: "POST", body: { staff_id: v[0], day: v[1], shift: next } }).then(function (x) {
            if (!x.ok) return toast(x.message, "err");
            t.className = "sh-cell" + (next ? " sh-" + next : ""); t.setAttribute("data-shift", next); t.textContent = next ? code[next] : "·"; t.title = next ? SH[next].label : "Not set";
          });
        }
      };
    });
  }

  /* ================================================================ reports */
  var RP = { range: 7 };
  function loadReports() {
    var box = el("tab-reports");
    var to = M().today(), from = RP.from || M().addDays(to, -(RP.range - 1));
    box.innerHTML = '<div class="empty">Working out the numbers…</div>';
    api("/hospital/reports?from=" + from + "&to=" + (RP.to || to)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
      var s = r.summary, a = r.appointments;
      var max = Math.max.apply(null, r.daily.map(function (d) { return d.opd + d.er; }).concat([1]));
      var h = '<div class="hms-head"><div><h2>Reports</h2><p class="sub">' + esc(M().day(r.from)) + " to " + esc(M().day(r.to)) + '</p></div><div class="row"><button class="btn btn-ghost" type="button" data-csv>Download CSV</button><button class="btn btn-ghost" type="button" data-print>Print</button></div></div>' +
        '<div class="ops-bar"><div class="chips">' + [[1, "Today"], [7, "7 days"], [30, "30 days"], [90, "90 days"]].map(function (x) { return '<button type="button" class="chipbtn' + (!RP.from && RP.range === x[0] ? " on" : "") + '" data-r="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>" +
        '<div class="ops-bar-r"><input class="input" type="date" id="rp-a" value="' + esc(r.from) + '"><span class="mini">to</span><input class="input" type="date" id="rp-b" value="' + esc(r.to) + '" max="' + M().today() + '"></div></div>' +
        '<div id="rp-out"><div class="rep-kpis">' + [["OPD visits", s.opd_visits], ["Emergency", s.emergency_visits], ["New patients", s.registrations], ["Admissions", s.admissions], ["Discharges", s.discharges],
          ["Avg stay", s.avg_length_of_stay_days != null ? s.avg_length_of_stay_days + " d" : "–"], ["Avg wait", s.avg_wait_min != null ? s.avg_wait_min + " min" : "–"], ["Bed occupancy", s.bed_occupancy_pct != null ? s.bed_occupancy_pct + "%" : "–"],
          ["Prescriptions", s.prescriptions], ["Billed", M().money(s.billed)], ["Collected", M().money(s.collected)], ["Appointment no-shows", a.no_show_rate != null ? Math.round(a.no_show_rate * 100) + "%" : "–"]].map(function (k) { return "<div><b>" + esc(k[1]) + "</b><span>" + esc(k[0]) + "</span></div>"; }).join("") + "</div>" +
        '<section class="card"><div class="ops-h">Visits by day <span class="mini">OPD and emergency</span></div><div class="rep-bars">' + r.daily.map(function (d) {
          return '<div class="rb" title="' + esc(M().day(d.day) + ": " + d.opd + " OPD, " + d.er + " emergency, " + d.admissions + " admitted") + '"><i class="o" style="height:' + (100 * d.opd / max) + '%"></i><i class="e" style="height:' + (100 * d.er / max) + '%"></i></div>';
        }).join("") + '</div><div class="rep-x"><span>' + esc(M().day(r.from)) + "</span><span>" + esc(M().day(r.to)) + "</span></div></section>" +
        '<div class="rec-grid">' + [["Busiest doctors", r.by_doctor.map(function (x) { return [x.name, x.visits]; })], ["Most common diagnoses", r.top_diagnoses.map(function (x) { return [x.name, x.count]; })],
          ["Revenue by category", r.revenue_by_category.map(function (x) { return [x.label, M().money(x.amount)]; })], ["Collections by mode", r.collections_by_mode.map(function (x) { return [x.label, M().money(x.amount)]; })],
          ["Appointments", [["Booked", a.booked], ["Attended", a.attended], ["Did not come", a.no_show], ["Cancelled", a.cancelled], ["Extras", a.extras]]],
          ["Outcomes", [["Discharged", s.discharges], ["Left against advice", s.lama], ["Died", s.deaths]]]].map(function (g) {
          return '<section class="card"><div class="ops-h">' + esc(g[0]) + "</div>" + (g[1].length ? g[1].map(function (x) { return '<div class="kv"><span>' + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>"; }).join("") : '<div class="mini">Nothing in this period.</div>') + "</section>";
        }).join("") + "</div></div>";
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-r]"))) { RP.range = +t.getAttribute("data-r"); RP.from = RP.to = ""; return loadReports(); }
        if (e.target.closest("[data-print]")) return M().print('<div class="ph-doc"><h2>Report · ' + esc(M().day(r.from)) + " to " + esc(M().day(r.to)) + "</h2>" + el("rp-out").innerHTML + "</div>");
        if (e.target.closest("[data-csv]")) {
          fetch(H().P.API + "/hospital/reports?format=csv&from=" + r.from + "&to=" + r.to, { credentials: "include" }).then(function (x) { return x.blob(); }).then(function (blob) {
            var a2 = document.createElement("a"); a2.href = URL.createObjectURL(blob); a2.download = "querocura-report-" + r.from + "-to-" + r.to + ".csv"; document.body.appendChild(a2); a2.click(); a2.remove();
          });
        }
      };
      el("rp-a").onchange = el("rp-b").onchange = function () { RP.from = el("rp-a").value; RP.to = el("rp-b").value; loadReports(); };
    });
  }

  /* ================================================================ register */
  function boot() {
    if (!window.QCHms) return setTimeout(boot, 20);
    var Q2 = window.QCHms;
    Q2.prescribe = prescribe; Q2.openRx = openRx; Q2.newBill = newBill; Q2.openBill = openBill; Q2.billForVisit = forVisit; Q2.dispense = dispense; Q2.profile = profile;
    Q2.add("pharmacy", "Pharmacy", function (c) { return c("dispense") || c("stock"); }, "back", loadPharmacy);
    Q2.add("billing", "Billing", function (c) { return c("billing") || c("billing_admin"); }, "back", loadBilling);
    Q2.add("duty", "Duty roster", function () { return true; }, "admin", loadDuty);
    Q2.add("reports", "Reports", function (c) { return c("reports"); }, "admin", loadReports);
  }
  boot();
})();
