/* QueroCura for Hospitals: hospital management, part 1.
 * The patient register and the patient record (EMR), appointments and doctors' schedules, plus the shared pieces the
 * other management screens use (a patient picker, money formatting, printing, a second modal layer).
 * Registers its tabs through window.QCHms; hospital-hms-desk.js adds prescriptions, pharmacy, billing, duty and reports.
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function can(p) { return H().can(p); }
  function canAny() { for (var i = 0; i < arguments.length; i++) if (can(arguments[i])) return true; return false; }
  function toast(m, k) { H().P.toast(m, k); }
  function say(n, m, k) { H().say(n, m, k); }

  /* ---------------------------------------------------------------- shared */
  var M = {};
  M.money = function (paise) { return (paise == null ? "–" : "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })); };
  M.day = function (iso) { var d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }); };
  M.date = function (ts) { return ts ? new Date(ts * 1000).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : ""; };
  M.dt = function (ts) { return ts ? new Date(ts * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""; };
  M.iso = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  M.today = function () { return M.iso(new Date()); };
  M.addDays = function (iso, n) { var d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return M.iso(d); };
  M.sexAge = function (p) { return [p.age != null ? p.age + "y" : "", p.sex && p.sex !== "unknown" ? p.sex.charAt(0).toUpperCase() : ""].filter(Boolean).join(" · "); };
  M.reply = function (r, after) { if (H().guard(r)) return false; toast(r.message || (r.ok ? "Done." : "That didn't work."), r.ok ? "" : "err"); if (r.ok && after) after(r); return r.ok; };
  /* a second modal layer, so a booking or a prescription can open over the patient's record */
  M.modal = function (html, wide, layer) {
    var id = layer === 2 ? "hms-modal2" : "hms-modal";
    el(id).querySelector(".modal").classList.toggle("hms-wide", !!wide);
    el(id + "-body").innerHTML = html;
    H().P.openModal(id);
    return el(id + "-body");
  };
  M.close = function (layer) { H().P.closeModal(layer === 2 ? "hms-modal2" : "hms-modal"); };
  M.isOpen = function (layer) { var m = el(layer === 2 ? "hms-modal2" : "hms-modal"); return m && m.classList.contains("open"); };
  /* print one document (prescription, bill, receipt) on its own page */
  M.print = function (html) {
    var box = el("hms-print");
    box.innerHTML = html;
    document.body.classList.add("hms-printing");
    setTimeout(function () { window.print(); setTimeout(function () { document.body.classList.remove("hms-printing"); box.innerHTML = ""; }, 400); }, 60);
  };
  M.letterhead = function (org) {
    return '<div class="ph-head"><div><b>' + esc(org.name || "") + "</b><span>" + esc([org.city, org.state].filter(Boolean).join(", ")) + (org.phone ? " · " + esc(org.phone) : "") +
      (org.registration_no ? " · Reg. " + esc(org.registration_no) : "") + '</span></div><div class="ph-logo">QueroCura</div></div>';
  };
  /* find a registered patient as you type; onPick(patient) */
  M.picker = function (box, onPick, placeholder) {
    box.innerHTML = '<div class="pk"><input class="input" type="search" autocomplete="off" placeholder="' + esc(placeholder || "Search name, MRN or phone…") + '"><div class="pk-list" hidden></div><div class="pk-chosen" hidden></div></div>';
    var inp = box.querySelector("input"), list = box.querySelector(".pk-list"), chosen = box.querySelector(".pk-chosen"), t = null, seq = 0;
    function run() {
      var q = inp.value.trim(), my = ++seq;
      api("/hospital/patients?q=" + encodeURIComponent(q)).then(function (r) {
        if (my !== seq || !r || !r.ok) return;
        list.hidden = false;
        list.innerHTML = r.items.length ? r.items.slice(0, 8).map(function (p) {
          return '<button type="button" class="pk-i" data-id="' + esc(p.id) + '"><b>' + esc(p.name) + "</b><span>" + esc(p.mrn) + (M.sexAge(p) ? " · " + esc(M.sexAge(p)) : "") + (p.phone_last4 ? " · ••" + esc(p.phone_last4) : "") + (p.app_linked ? " · app" : "") + "</span></button>";
        }).join("") : '<div class="pk-none">No match. ' + (can("patients") ? '<button type="button" class="link" data-reg>Register a new patient</button>' : "") + "</div>";
        list._items = r.items;
      });
    }
    inp.oninput = function () { clearTimeout(t); t = setTimeout(run, 180); };
    inp.onfocus = function () { if (!list._items) run(); else list.hidden = false; };
    list.onclick = function (e) {
      if (e.target.closest("[data-reg]")) { register({ name: inp.value }, function (p) { pick(p); }, 2); return; }
      var b = e.target.closest("[data-id]"); if (!b) return;
      pick(list._items.filter(function (p) { return p.id === b.getAttribute("data-id"); })[0]);
    };
    function pick(p) {
      list.hidden = true; inp.hidden = true; chosen.hidden = false;
      chosen.innerHTML = '<span class="avatar sm">' + esc(H().initials(p.name)) + "</span><b>" + esc(p.name) + "</b><span class=\"mini\">" + esc(p.mrn) + (M.sexAge(p) ? " · " + esc(M.sexAge(p)) : "") + '</span><button type="button" class="link" data-change>Change</button>';
      chosen.querySelector("[data-change]").onclick = function () { chosen.hidden = true; inp.hidden = false; inp.value = ""; inp.focus(); onPick(null); };
      onPick(p);
    }
    box.pick = pick;
    return box;
  };

  /* ---------------------------------------------------------------- patients tab */
  var S = { q: "", pat: null, recTab: "overview", apDay: M.today(), apDoc: localStorage.getItem("qc-hms-doc") || "", timer: null };

  function loadPatients() {
    var box = el("tab-patients");
    box.innerHTML = '<div class="hms-head"><div><h2>Patients</h2><p class="sub">Everyone your hospital looks after, with or without the QueroCura app. Each has a medical record number (MRN) and one record that every department adds to.</p></div>' +
      (can("patients") ? '<button class="btn btn-primary" type="button" data-reg>+ Register patient</button>' : "") + "</div>" +
      '<div class="hms-search"><input class="input" id="pt-q" type="search" placeholder="Search by name, MRN, mobile number or its last 4 digits" value="' + esc(S.q) + '" autocomplete="off"></div><div id="pt-list"><div class="empty">Loading…</div></div>';
    var t = null;
    el("pt-q").oninput = function () { clearTimeout(t); S.q = this.value; t = setTimeout(list, 200); };
    box.onclick = function (e) {
      var b;
      if (e.target.closest("[data-reg]")) return register({ name: S.q && !/\d/.test(S.q) ? S.q : "" }, function (p) { openRecord(p.id); });
      if ((b = e.target.closest("[data-checkin]"))) { e.stopPropagation(); return window.QCOps && window.QCOps.checkIn(b.getAttribute("data-checkin")); }
      if ((b = e.target.closest("[data-book]"))) { e.stopPropagation(); return book({ patient: JSON.parse(b.getAttribute("data-book")) }); }
      if ((b = e.target.closest("[data-open]"))) openRecord(b.getAttribute("data-open"));
    };
    list();
  }
  function list() {
    api("/hospital/patients?q=" + encodeURIComponent(S.q)).then(function (r) {
      var box = el("pt-list"); if (!box) return;
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
      if (!r.items.length) { box.innerHTML = '<div class="card ops-empty"><div class="ops-empty-ic">🗂️</div><h2>' + (S.q ? "No one matches" : "No patients yet") + '</h2><p class="sub">' + (S.q ? "Check the spelling, or search by MRN or mobile number." : "Register your first patient, or connect someone who uses the QueroCura app.") + "</p>" + (can("patients") ? '<button class="btn btn-primary" type="button" data-reg>Register a patient</button>' : "") + "</div>"; return; }
      box.innerHTML = '<div class="hms-list">' + r.items.map(function (p) {
        return '<div class="hms-row" data-open="' + esc(p.id) + '" tabindex="0" role="button"><span class="avatar">' + esc(H().initials(p.name)) + '</span><span class="grow"><b>' + esc(p.name) + "</b>" +
          '<small>' + esc(p.mrn) + (M.sexAge(p) ? " · " + esc(M.sexAge(p)) : "") + (p.phone_last4 ? " · ••" + esc(p.phone_last4) : "") + (p.last_visit_ts ? " · last visit " + esc(M.date(p.last_visit_ts)) : "") + "</small></span>" +
          (p.allergies && p.allergies.length ? '<span class="tag emg" title="Allergies">⚠ ' + esc(p.allergies.slice(0, 2).join(", ")) + "</span>" : "") +
          (p.app_linked ? '<span class="tag app">QueroCura app</span>' : "") +
          (can("ops") ? '<button type="button" class="btn btn-sm" data-checkin="' + esc(p.id) + '">Check in</button>' : "") +
          (can("appointments") ? '<button type="button" class="btn btn-sm btn-ghost" data-book=\'' + esc(JSON.stringify({ id: p.id, name: p.name, mrn: p.mrn, age: p.age, sex: p.sex })) + '\'>Book</button>' : "") + "</div>";
      }).join("") + "</div>";
    });
  }

  /* register (or edit) a patient; done(patient) */
  function register(pre, done, layer) {
    pre = pre || {};
    var edit = !!pre.id;
    var b = M.modal('<h2 id="ops-title">' + (edit ? "Edit details · " + esc(pre.name) : "Register a patient") + '</h2>' + (edit ? "" : '<p class="sub">Only the name is required. A mobile number helps find the person again and spots duplicates.</p>') +
      '<form id="rg-form" novalidate><div class="grid2"><div class="field"><label for="rg-name">Full name</label><input class="input" id="rg-name" maxlength="120" value="' + esc(pre.name || "") + '" autocomplete="off"></div>' +
      '<div class="field"><label>Sex</label><div class="seg" id="rg-sex">' + [["female", "Female"], ["male", "Male"], ["other", "Other"]].map(function (x) { return '<button type="button" data-v="' + x[0] + '"' + (pre.sex === x[0] ? ' class="on"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div></div></div>" +
      '<div class="grid3"><div class="field"><label for="rg-dob">Date of birth</label><input class="input" id="rg-dob" type="date" max="' + M.today() + '" value="' + esc(pre.dob || "") + '"></div>' +
      '<div class="field"><label for="rg-age">or age (years)</label><input class="input" id="rg-age" inputmode="numeric" maxlength="3" value="' + esc(!pre.dob && pre.age != null ? pre.age : "") + '"></div>' +
      '<div class="field"><label for="rg-bg">Blood group</label><select class="input" id="rg-bg"><option value="">Not known</option>' + ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(function (g) { return "<option" + (pre.blood_group === g ? " selected" : "") + ">" + g + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="grid2"><div class="field"><label for="rg-ph">Mobile</label><input class="input" id="rg-ph" inputmode="tel" maxlength="16" placeholder="10-digit mobile" value="' + esc(pre.phone || "") + '"></div>' +
      '<div class="field"><label for="rg-abha">ABHA number or address (optional)</label><input class="input" id="rg-abha" maxlength="40" placeholder="14 digits or name@abdm" value="' + esc(pre.abha || "") + '"></div></div>' +
      '<div class="field"><label for="rg-addr">Address</label><input class="input" id="rg-addr" maxlength="300" value="' + esc(pre.address || "") + '"></div>' +
      '<div class="grid3"><div class="field"><label for="rg-en">Emergency contact</label><input class="input" id="rg-en" maxlength="80" placeholder="Name" value="' + esc((pre.emergency || {}).name || "") + '"></div>' +
      '<div class="field"><label for="rg-er">Relation</label><input class="input" id="rg-er" maxlength="40" value="' + esc((pre.emergency || {}).relation || "") + '"></div>' +
      '<div class="field"><label for="rg-ep">Their mobile</label><input class="input" id="rg-ep" inputmode="tel" maxlength="16" value="' + esc((pre.emergency || {}).phone || "") + '"></div></div>' +
      (!edit ? '<div class="field"><label for="rg-al">Allergies (comma-separated)</label><input class="input" id="rg-al" maxlength="300" placeholder="e.g. Penicillin, Peanuts"><label class="hp-check" style="margin-top:6px"><input type="checkbox" id="rg-nkda"> <span>No known drug allergies</span></label></div>' : "") +
      '<div id="rg-dups"></div><button class="btn btn-primary" type="submit">' + (edit ? "Save" : "Register") + '</button><div class="msg" id="rg-msg" role="status"></div></form>', false, layer);
    var sex = pre.sex || "";
    el("rg-sex").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; sex = t.getAttribute("data-v"); [].forEach.call(el("rg-sex").children, function (c) { c.classList.toggle("on", c === t); }); };
    function body(confirm) {
      var d = { name: el("rg-name").value, sex: sex || "unknown", phone: el("rg-ph").value, abha: el("rg-abha").value, blood_group: el("rg-bg").value, address: el("rg-addr").value,
        emergency: { name: el("rg-en").value, relation: el("rg-er").value, phone: el("rg-ep").value } };
      if (el("rg-dob").value) d.dob = el("rg-dob").value; else if (el("rg-age").value) d.age = el("rg-age").value;
      if (!edit) { d.allergies = el("rg-al").value; d.nkda = el("rg-nkda").checked; }
      if (confirm) d.confirm_new = true;
      return d;
    }
    function send(confirm) {
      api(edit ? "/hospital/patients/" + encodeURIComponent(pre.id) : "/hospital/patients", { method: "POST", body: body(confirm) }).then(function (r) {
        if (H().guard(r)) return;
        if (r.code === "possible_duplicates") {
          el("rg-dups").innerHTML = '<div class="notice wait"><b>This may be someone already registered.</b><div class="hms-list" style="margin-top:8px">' + r.duplicates.map(function (p) {
            return '<div class="hms-row"><span class="grow"><b>' + esc(p.name) + "</b><small>" + esc(p.mrn) + (M.sexAge(p) ? " · " + esc(M.sexAge(p)) : "") + (p.phone_last4 ? " · ••" + esc(p.phone_last4) : "") + '</small></span><button type="button" class="btn btn-sm btn-primary" data-use="' + esc(p.id) + '">Use this record</button></div>';
          }).join("") + '</div><button type="button" class="btn btn-sm" data-new style="margin-top:8px">It\'s someone else: register anyway</button></div>';
          el("rg-dups").onclick = function (e) {
            var u = e.target.closest("[data-use]");
            if (u) { M.close(layer); var p = r.duplicates.filter(function (x) { return x.id === u.getAttribute("data-use"); })[0]; if (done) done(p); return; }
            if (e.target.closest("[data-new]")) send(true);
          };
          return;
        }
        if (!r.ok) { say(el("rg-msg"), r.message, "err"); return; }
        toast(r.message);
        M.close(layer);
        if (done) done(r.item || pre);
        if (el("pt-list")) list();
      });
    }
    el("rg-form").onsubmit = function (e) { e.preventDefault(); send(false); };
    setTimeout(function () { el("rg-name").focus(); }, 60);
  }

  /* ---------------------------------------------------------------- the patient record */
  function openRecord(pid, tab) {
    S.pat = pid; if (tab) S.recTab = tab;
    api("/hospital/patients/" + encodeURIComponent(pid)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { toast(r.message, "err"); return; }
      renderRecord(r);
    });
  }
  function renderRecord(r) {
    var p = r.patient, open = (r.visits || []).filter(function (v) { return v.status !== "closed"; })[0];
    var tabs = [["overview", "Overview"], ["visits", "Visits (" + (r.visits || []).length + ")"]];
    if (r.prescriptions) tabs.push(["rx", "Prescriptions (" + r.prescriptions.length + ")"]);
    if (r.orders) tabs.push(["results", "Tests & results (" + r.orders.length + ")"]);
    if (r.observations && r.observations.length) tabs.push(["obs", "Observations"]);
    if (r.documents) tabs.push(["docs", "Documents (" + r.documents.length + ")"]);
    if (r.appointments) tabs.push(["appts", "Appointments (" + r.appointments.length + ")"]);
    if (r.bills) tabs.push(["bills", "Bills (" + r.bills.length + ")"]);
    if (!tabs.some(function (t) { return t[0] === S.recTab; })) S.recTab = "overview";
    var h = '<div class="rec-head"><span class="avatar lg">' + esc(H().initials(p.name)) + '</span><div class="grow"><h2 id="ops-title">' + esc(p.name) + '</h2><div class="rec-meta"><span class="mrn">MRN ' + esc(p.mrn) + "</span>" +
      [M.sexAge(p), p.blood_group ? "Blood " + p.blood_group : "", p.phone ? "📞 " + p.phone : "", p.abha ? "ABHA " + p.abha : ""].filter(Boolean).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join("") + "</div>" +
      (p.app_linked ? '<div class="mini">Connected through the QueroCura app' + (p.app_access_active ? "" : " (sharing has ended)") + "</div>" : "") + "</div></div>";
    if (p.allergies !== undefined) {
      h += '<div class="rec-alerts">' + (p.allergies.length ? '<span class="al-lab">Allergies</span>' + p.allergies.map(function (a) { return '<span class="al">' + esc(a) + "</span>"; }).join("") :
        p.nkda ? '<span class="al-ok">No known drug allergies</span>' : '<span class="al-unk">Allergies not recorded</span>') +
        (p.alerts || []).map(function (a) { return '<span class="al warn">' + esc(a) + "</span>"; }).join("") + "</div>";
    }
    var acts = [];
    if (open) acts.push(['<button class="btn btn-sm btn-primary" type="button" data-visit="' + esc(open.id) + '">Open current visit</button>']);
    else if (can("ops")) acts.push(['<button class="btn btn-sm btn-primary" type="button" data-checkin>Check in</button>']);
    if (canAny("appointments") || can("rx")) acts.push(['<button class="btn btn-sm" type="button" data-book>Book appointment</button>']);
    if (can("rx")) acts.push(['<button class="btn btn-sm" type="button" data-rx>℞ Prescribe</button>']);
    if (canAny("billing", "billing_admin")) acts.push(['<button class="btn btn-sm" type="button" data-bill>New bill</button>']);
    if (can("patients")) acts.push(['<button class="btn btn-sm btn-ghost" type="button" data-edit>Edit details</button>']);
    if (p.app_access_active && can("read")) acts.push(['<button class="btn btn-sm btn-ghost" type="button" data-shared>Shared from their app</button>']);
    h += '<div class="rec-acts">' + acts.join("") + "</div>";
    h += '<div class="rec-tabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" data-rtab="' + t[0] + '" class="' + (t[0] === S.recTab ? "on" : "") + '">' + t[1] + "</button>"; }).join("") + '</div><div id="rec-body">' + recTab(r) + "</div>";
    var b = M.modal(h, true);
    b.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-rtab]"))) { S.recTab = t.getAttribute("data-rtab"); [].forEach.call(b.querySelectorAll("[data-rtab]"), function (x) { x.classList.toggle("on", x === t); }); el("rec-body").innerHTML = recTab(r); return; }
      if ((t = e.target.closest("[data-visit]"))) { M.close(); return window.QCOps && window.QCOps.openVisit(t.getAttribute("data-visit")); }
      if (e.target.closest("[data-checkin]")) { M.close(); return window.QCOps && window.QCOps.checkIn(p.id); }
      if (e.target.closest("[data-book]")) return book({ patient: p, layer: 2, after: function () { openRecord(p.id); } });
      if (e.target.closest("[data-rx]")) return window.QCHms.prescribe({ patient: p, encounter_id: open && open.id, layer: 2, after: function () { openRecord(p.id, "rx"); } });
      if (e.target.closest("[data-bill]")) return window.QCHms.newBill(p);
      if (e.target.closest("[data-edit]")) return register(p, function () { openRecord(p.id); }, 2);
      if (e.target.closest("[data-shared]")) { M.close(); return H().openChart(p.app_grant_id); }
      if ((t = e.target.closest("[data-rxopen]"))) return window.QCHms.openRx(t.getAttribute("data-rxopen"));
      if ((t = e.target.closest("[data-billopen]"))) return window.QCHms.openBill(t.getAttribute("data-billopen"));
      if (e.target.closest("[data-clin-edit]")) return clinEdit(p);
      if ((t = e.target.closest("[data-doc]"))) { var d = el("doc-" + t.getAttribute("data-doc")); if (d) d.hidden = !d.hidden; }
    };
  }
  var KIND = { opd: "OPD", er: "Emergency", ipd: "Admission", daycare: "Day care" };
  function recTab(r) {
    var p = r.patient, t = S.recTab;
    if (t === "overview") {
      var probs = (p.problems || []).filter(function (x) { return x.status !== "resolved"; });
      var meds = [];
      (r.prescriptions || []).forEach(function (x) { if (x.status !== "stopped" && Date.now() / 1000 - x.created_ts < 60 * 86400) meds.push(x); });
      var next = (r.appointments || []).filter(function (a) { return (a.status === "booked" || a.status === "confirmed") && a.day >= M.today(); }).slice(-1)[0];
      return '<div class="rec-grid">' +
        (p.problems !== undefined ? '<section><div class="ops-h">Problems ' + (can("write") || can("write_basic") ? '<button type="button" class="link" data-clin-edit>Edit</button>' : "") + "</div>" + (probs.length ? '<ul class="rec-ul">' + probs.map(function (x) { return "<li>" + esc(x.name) + (x.since ? ' <span class="mini">since ' + esc(x.since) + "</span>" : "") + "</li>"; }).join("") + "</ul>" : '<div class="mini">None recorded.</div>') + "</section>" : "") +
        (r.prescriptions ? '<section><div class="ops-h">Recent prescriptions</div>' + (meds.length ? meds.slice(0, 4).map(function (x) { return '<button type="button" class="rec-line" data-rxopen="' + esc(x.id) + '"><b>' + esc(x.number) + "</b><span>" + esc(x.diagnosis || x.n_items + " medicines") + " · " + esc(M.date(x.created_ts)) + "</span></button>"; }).join("") : '<div class="mini">None in the last 60 days.</div>') + "</section>" : "") +
        '<section><div class="ops-h">Visits</div>' + ((r.visits || []).slice(0, 4).map(function (v) { return '<div class="rec-line static"><b>' + esc(KIND[v.kind] || v.kind) + " · " + esc(v.dept || "") + "</b><span>" + esc(M.date(v.created_ts)) + (v.doctor ? " · " + esc(v.doctor) : "") + (v.status !== "closed" ? " · <b>now</b>" : "") + "</span></div>"; }).join("") || '<div class="mini">No visits yet.</div>') + "</section>" +
        (r.appointments ? '<section><div class="ops-h">Next appointment</div>' + (next ? '<div class="rec-line static"><b>' + esc(M.day(next.day)) + " · " + esc(next.start) + "</b><span>" + esc(next.doctor || "") + (next.dept ? " · " + esc(next.dept) : "") + "</span></div>" : '<div class="mini">None booked.</div>') + "</section>" : "") +
        (p.notes ? '<section class="span2"><div class="ops-h">Notes</div><div class="rec-note">' + esc(p.notes) + "</div></section>" : "") + "</div>";
    }
    if (t === "visits") return table(["When", "Visit", "Department", "Doctor", "Status"], (r.visits || []).map(function (v) { return [M.dt(v.created_ts), (KIND[v.kind] || v.kind) + (v.reason ? '<div class="mini">' + esc(v.reason) + "</div>" : ""), esc(v.dept || ""), esc(v.doctor || ""), esc(v.status === "closed" ? (v.outcome || "closed") : v.status)]; }), true);
    if (t === "rx") return (r.prescriptions || []).length ? '<div class="hms-list">' + r.prescriptions.map(function (x) {
      return '<button type="button" class="hms-row" data-rxopen="' + esc(x.id) + '"><span class="grow"><b>' + esc(x.number) + " · " + esc(x.diagnosis || x.n_items + " medicine" + (x.n_items === 1 ? "" : "s")) + "</b><small>" + esc(M.dt(x.created_ts)) + " · " + esc(x.doctor || "") + "</small></span>" + rxPill(x.status) + "</button>";
    }).join("") + "</div>" : '<div class="empty">No prescriptions.</div>';
    if (t === "results") return table(["Ordered", "Test", "Status", "Result"], (r.orders || []).map(function (o) { return [M.dt(o.created_ts), esc(o.item || o.kind), esc(o.status.replace("_", " ")), o.result ? '<div class="pre">' + esc(o.result) + "</div>" : "–"]; }));
    if (t === "obs") return table(["Time", "NEWS2", "RR", "SpO₂", "BP", "HR", "Temp", "By"], (r.observations || []).map(function (o) { return [M.dt(o.ts), "<b>" + o.news2.score + "</b>", o.rr == null ? "–" : o.rr, o.spo2 == null ? "–" : o.spo2, o.sbp == null ? "–" : o.sbp + "/" + (o.dbp || "–"), o.hr == null ? "–" : o.hr, o.temp == null ? "–" : o.temp, esc(o.by || "")]; }), true);
    if (t === "docs") return (r.documents || []).length ? '<div class="hms-list">' + r.documents.map(function (d, i) {
      return '<div class="hms-row col" data-doc="' + i + '" role="button" tabindex="0"><span class="grow"><b>' + esc(d.title || d.kind_label) + "</b><small>" + esc(d.kind_label) + " · " + esc(M.dt(d.ts)) + (d.by ? " · " + esc(d.by) : "") + '</small></span><div class="pre" id="doc-' + i + '" hidden>' + esc(d.text) + "</div></div>";
    }).join("") + "</div>" : '<div class="empty">No documents.</div>';
    if (t === "appts") return table(["Date", "Time", "Doctor", "Type", "Status"], (r.appointments || []).map(function (a) { return [esc(M.day(a.day)), esc(a.start), esc(a.doctor || ""), esc(a.kind_label || ""), apPill(a.status)]; }));
    if (t === "bills") return (r.bills || []).length ? '<div class="hms-list">' + r.bills.map(function (x) {
      return '<button type="button" class="hms-row" data-billopen="' + esc(x.id) + '"><span class="grow"><b>' + esc(x.number || "Draft bill") + " · " + M.money(x.total) + "</b><small>" + esc(M.dt(x.created_ts)) + (x.due > 0 && x.status === "final" ? " · " + M.money(x.due) + " due" : "") + "</small></span>" + billPill(x) + "</button>";
    }).join("") + "</div>" : '<div class="empty">No bills.</div>';
    return "";
  }
  function table(head, rows, raw) {
    if (!rows.length) return '<div class="empty">Nothing yet.</div>';
    return '<div class="scroll-x"><table class="t"><thead><tr>' + head.map(function (x) { return "<th>" + esc(x) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function rxPill(s) { var m = { signed: ["To dispense", "wait"], partly_dispensed: ["Partly given", "wait"], dispensed: ["Dispensed", "ok"], stopped: ["Stopped", ""] }[s] || [s, ""]; return '<span class="pill ' + m[1] + '">' + esc(m[0]) + "</span>"; }
  function apPill(s) { var m = { booked: ["Booked", ""], confirmed: ["Confirmed", "ok"], arrived: ["Arrived", "ok"], completed: ["Seen", "ok"], no_show: ["Did not come", "bad"], cancelled: ["Cancelled", ""] }[s] || [s, ""]; return '<span class="pill ' + m[1] + '">' + esc(m[0]) + "</span>"; }
  function billPill(x) { return x.status === "void" ? '<span class="pill">Void</span>' : x.status === "draft" ? '<span class="pill wait">Draft</span>' : x.due > 0 ? '<span class="pill bad">' + M.money(x.due) + " due</span>" : '<span class="pill ok">Paid</span>'; }
  M.rxPill = rxPill; M.apPill = apPill; M.billPill = billPill; M.table = table;

  function clinEdit(p) {
    var probs = (p.problems || []).map(function (x) { return x.name + (x.status === "resolved" ? " (resolved)" : ""); }).join("\n");
    var b = M.modal('<h2 id="ops-title">Allergies, problems and alerts · ' + esc(p.name) + '</h2><form id="ce-form" novalidate>' +
      '<div class="field"><label for="ce-al">Allergies (comma-separated)</label><input class="input" id="ce-al" maxlength="400" value="' + esc((p.allergies || []).join(", ")) + '"><label class="hp-check" style="margin-top:6px"><input type="checkbox" id="ce-nkda"' + (p.nkda ? " checked" : "") + '> <span>No known drug allergies</span></label></div>' +
      '<div class="field"><label for="ce-pr">Problems, one per line (add "(resolved)" to close one)</label><textarea class="input" id="ce-pr" rows="5" maxlength="2000">' + esc(probs) + "</textarea></div>" +
      '<div class="field"><label for="ce-alr">Alerts for the team (comma-separated)</label><input class="input" id="ce-alr" maxlength="400" placeholder="e.g. Hard of hearing, Fall risk, Needs interpreter (Tamil)" value="' + esc((p.alerts || []).join(", ")) + '"></div>' +
      '<div class="field"><label for="ce-n">Notes</label><textarea class="input" id="ce-n" rows="3" maxlength="2000">' + esc(p.notes || "") + "</textarea></div>" +
      '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="ce-msg"></div></form>', false, 2);
    el("ce-form").onsubmit = function (e) {
      e.preventDefault();
      var problems = el("ce-pr").value.split("\n").map(function (l) { l = l.trim(); if (!l) return null; var res = /\(resolved\)\s*$/i.test(l); return { name: l.replace(/\(resolved\)\s*$/i, "").trim(), status: res ? "resolved" : "active" }; }).filter(Boolean);
      api("/hospital/patients/" + encodeURIComponent(p.id), { method: "POST", body: { allergies: el("ce-al").value, nkda: el("ce-nkda").checked, problems: problems, alerts: el("ce-alr").value, notes: el("ce-n").value } }).then(function (r) {
        if (!r.ok) return say(el("ce-msg"), r.message, "err");
        toast("Saved."); M.close(2); openRecord(p.id);
      });
    };
    void b;
  }

  /* ---------------------------------------------------------------- appointments */
  var DOCS = [];
  function loadAppointments(quiet) {
    var box = el("tab-appointments");
    if (!quiet) box.innerHTML = '<div class="empty">Loading appointments…</div>';
    var q = "/hospital/appointments?day=" + S.apDay + (S.apDoc ? "&doctor=" + encodeURIComponent(S.apDoc) : "");
    api(q).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
      DOCS = r.doctors;
      if (S.apDoc && !DOCS.some(function (d) { return d.id === S.apDoc; })) S.apDoc = "";
      var st = r.stats, isToday = S.apDay === M.today();
      var h = '<div class="hms-head"><div><h2>Appointments</h2><p class="sub">Book into doctors\' sessions. Marking someone arrived opens their OPD visit and token.</p></div><div class="row">' +
        (canAny("schedules") || can("rx") ? '<button class="btn btn-ghost" type="button" data-sched>Doctor schedules</button>' : "") + (canAny("appointments") ? '<button class="btn btn-primary" type="button" data-new>+ Book</button>' : "") + "</div></div>" +
        '<div class="ops-bar"><div class="ap-day"><button type="button" class="btn btn-sm btn-ghost" data-d="-1" aria-label="Previous day">‹</button><input class="input" type="date" id="ap-date" value="' + S.apDay + '"><button type="button" class="btn btn-sm btn-ghost" data-d="1" aria-label="Next day">›</button>' +
        (isToday ? "" : '<button type="button" class="link" data-d="0">Today</button>') + '<b class="ap-dname">' + esc(M.day(S.apDay)) + "</b></div>" +
        '<div class="ops-bar-r"><select class="input" id="ap-doc"><option value="">All doctors</option>' + DOCS.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === S.apDoc ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("") + "</select></div></div>" +
        '<div class="hms-stats"><span><b>' + st.total + "</b>booked</span><span><b>" + st.waiting_to_arrive + "</b>yet to arrive</span><span><b>" + st.arrived + "</b>arrived</span><span><b>" + st.completed + "</b>seen</span><span><b>" + st.no_show + "</b>did not come</span></div>";
      if (S.apDoc && r.slots) {
        var sl = r.slots.slots;
        h += '<div class="card ap-slots"><div class="ops-h">Sessions</div>' + (sl.length ? '<div class="slots">' + sl.map(function (s) {
          return '<button type="button" class="slot' + (s.free ? " free" : s.past ? " past" : " full") + '" data-slot="' + s.start + '"' + (s.free && canAny("appointments") ? "" : " disabled") + ">" + s.start + (s.capacity > 1 ? '<small>' + s.booked + "/" + s.capacity + "</small>" : "") + "</button>";
        }).join("") + "</div>" : '<div class="mini">' + esc(r.slots.note || "No sessions.") + "</div>") + "</div>";
      }
      var items = r.items.filter(function (a) { return a.status !== "cancelled"; });
      h += items.length ? '<div class="ap-list">' + items.map(apRow).join("") + "</div>" : '<div class="card ops-empty"><div class="ops-empty-ic">📅</div><h2>No appointments</h2><p class="sub">' + (S.apDoc ? "Pick a free slot above to book one." : "Choose a doctor to see their sessions and free slots.") + "</p></div>";
      var canc = r.items.filter(function (a) { return a.status === "cancelled"; });
      if (canc.length) h += '<details class="ops-done"><summary>Cancelled (' + canc.length + ")</summary>" + canc.map(apRow).join("") + "</details>";
      box.innerHTML = h;
      el("ap-date").onchange = function () { if (this.value) { S.apDay = this.value; loadAppointments(); } };
      el("ap-doc").onchange = function () { S.apDoc = this.value; try { localStorage.setItem("qc-hms-doc", S.apDoc); } catch (x) {} loadAppointments(); };
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-d]"))) { var n = +t.getAttribute("data-d"); S.apDay = n === 0 ? M.today() : M.addDays(S.apDay, n); return loadAppointments(); }
        if (e.target.closest("[data-new]")) return book({});
        if (e.target.closest("[data-sched]")) return schedules(S.apDoc);
        if ((t = e.target.closest("[data-slot]"))) return book({ doctor: S.apDoc, day: S.apDay, start: t.getAttribute("data-slot") });
        if ((t = e.target.closest("[data-apact]"))) { e.stopPropagation(); return apAct(t.getAttribute("data-id"), t.getAttribute("data-apact")); }
        if ((t = e.target.closest("[data-pat]"))) return openRecord(t.getAttribute("data-pat"));
      };
    });
    if (!quiet) { clearInterval(S.timer); S.timer = setInterval(function () { if (!document.hidden && !M.isOpen() && !M.isOpen(2) && el("ap-date")) loadAppointments(true); }, 45000); }
  }
  function apRow(a) {
    var acts = [];
    var live = a.status === "booked" || a.status === "confirmed";
    if (live && a.day === M.today() && canAny("appointments", "ops")) acts.push(["arrive", "Arrived", "btn-primary"]);
    if (live && canAny("appointments")) acts.push(["reschedule", "Move", ""], ["no_show", "Didn't come", "btn-ghost"], ["cancel", "Cancel", "btn-ghost"]);
    if (a.status === "arrived" && a.encounter_id) acts.push(["visit", "Open visit", ""]);
    return '<div class="ap-row ' + esc(a.status) + '"><div class="ap-time"><b>' + esc(a.start) + "</b><span>" + esc(a.end) + "</span></div>" +
      '<div class="grow"><button type="button" class="link ap-name" data-pat="' + esc(a.patient_id) + '">' + esc(a.patient_name || "") + '</button><span class="mini"> ' + esc(a.mrn || "") + "</span>" + (a.extra ? ' <span class="tag">extra</span>' : "") +
      '<div class="mini">' + esc(a.kind_label || "") + (!S.apDoc && a.doctor ? " · " + esc(a.doctor) : "") + (a.dept ? " · " + esc(a.dept) : "") + (a.reason ? " · " + esc(a.reason) : "") + "</div></div>" + apPill(a.status) +
      (acts.length ? '<div class="ap-acts">' + acts.map(function (x) { return '<button type="button" class="btn btn-sm ' + x[2] + '" data-apact="' + x[0] + '" data-id="' + esc(a.id) + '"' + (x[0] === "visit" ? ' data-enc="' + esc(a.encounter_id) + '"' : "") + ">" + x[1] + "</button>"; }).join("") + "</div>" : "") + "</div>";
  }
  function apAct(id, act) {
    if (act === "visit") { var b = document.querySelector('[data-apact="visit"][data-id="' + id + '"]'); return window.QCOps && window.QCOps.openVisit(b.getAttribute("data-enc")); }
    if (act === "reschedule") return book({ reschedule: id, doctor: S.apDoc });
    var body = { action: act };
    if (act === "cancel") { var why = window.prompt("Reason for cancelling (optional)"); if (why === null) return; body.reason = why; }
    if (act === "no_show" && !window.confirm("Mark as did not come?")) return;
    api("/hospital/appointments/" + encodeURIComponent(id), { method: "POST", body: body }).then(function (r) { M.reply(r, function () { loadAppointments(true); }); });
  }

  /* book (or move) an appointment: patient, doctor, day, a free slot */
  function book(o) {
    o = o || {};
    var layer = o.layer || 1;
    var b = M.modal('<h2 id="ops-title">' + (o.reschedule ? "Move the appointment" : "Book an appointment") + '</h2><form id="bk-form" novalidate>' +
      (o.reschedule ? "" : '<div class="field"><label>Patient</label><div id="bk-p"></div></div>') +
      '<div class="grid2"><div class="field"><label for="bk-doc">Doctor</label><select class="input" id="bk-doc"><option value="">Choose…</option></select></div><div class="field"><label for="bk-day">Date</label><input class="input" type="date" id="bk-day" min="' + M.today() + '" value="' + esc(o.day || M.today()) + '"></div></div>' +
      '<div class="field"><label>Time</label><div id="bk-slots" class="slots"><span class="mini">Choose a doctor.</span></div><label class="hp-check" style="margin-top:8px"><input type="checkbox" id="bk-extra"> <span>Add as an extra at</span> <input class="input sm" type="time" id="bk-time" step="300" style="width:auto;display:inline-block;margin-left:6px"></label></div>' +
      (o.reschedule ? "" : '<div class="grid2"><div class="field"><label for="bk-kind">Type</label><select class="input" id="bk-kind"><option value="new">New consultation</option><option value="follow_up"' + (o.kind === "follow_up" ? " selected" : "") + '>Follow-up</option><option value="procedure">Procedure</option><option value="review">Report review</option><option value="tele">Teleconsultation</option></select></div>' +
        '<div class="field"><label for="bk-r">Reason</label><input class="input" id="bk-r" maxlength="300" value="' + esc(o.reason || "") + '"></div></div>') +
      '<button class="btn btn-primary" type="submit">' + (o.reschedule ? "Move it" : "Book") + '</button><div class="msg" id="bk-msg" role="status"></div></form>', false, layer);
    var patient = o.patient || null, start = o.start || "";
    if (!o.reschedule) {
      M.picker(el("bk-p"), function (p) { patient = p; });
      if (patient) el("bk-p").pick(patient);
    }
    function fillDocs(list) {
      el("bk-doc").innerHTML = '<option value="">Choose…</option>' + list.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === (o.doctor || (can("rx") && !canAny("appointments") ? H().me().staff.id : "")) ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("");
      slots();
    }
    if (DOCS.length) fillDocs(DOCS); else api("/hospital/appointments?day=" + M.today()).then(function (r) { if (r.ok) { DOCS = r.doctors; fillDocs(DOCS); } });
    function slots() {
      var doc = el("bk-doc").value, day = el("bk-day").value, box = el("bk-slots");
      if (!doc || !day) { box.innerHTML = '<span class="mini">Choose a doctor and a date.</span>'; return; }
      box.innerHTML = '<span class="mini">Loading…</span>';
      api("/hospital/appointments/slots?doctor=" + encodeURIComponent(doc) + "&day=" + day).then(function (r) {
        if (!r.ok) { box.innerHTML = '<span class="mini">' + esc(r.message) + "</span>"; return; }
        var free = r.slots.filter(function (s) { return !s.past; });
        box.innerHTML = free.length ? free.map(function (s) { return '<button type="button" class="slot' + (s.free ? " free" : " full") + (s.start === start ? " on" : "") + '" data-s="' + s.start + '"' + (s.free ? "" : " disabled") + ">" + s.start + "</button>"; }).join("") :
          '<span class="mini">' + esc(r.note || "No free slots that day.") + "</span>";
        if (r.next_free) box.innerHTML += ' <button type="button" class="link" data-next="' + r.next_free.day + "|" + r.next_free.start + '">Next free: ' + esc(M.day(r.next_free.day)) + " " + esc(r.next_free.start) + "</button>";
      });
    }
    el("bk-doc").onchange = slots; el("bk-day").onchange = slots;
    el("bk-slots").onclick = function (e) {
      var n = e.target.closest("[data-next]");
      if (n) { var v = n.getAttribute("data-next").split("|"); el("bk-day").value = v[0]; start = v[1]; slots(); return; }
      var t = e.target.closest("[data-s]"); if (!t) return;
      start = t.getAttribute("data-s"); el("bk-extra").checked = false;
      [].forEach.call(el("bk-slots").querySelectorAll("[data-s]"), function (x) { x.classList.toggle("on", x === t); });
    };
    el("bk-form").onsubmit = function (e) {
      e.preventDefault();
      var extra = el("bk-extra").checked, time = extra ? el("bk-time").value : start;
      if (!o.reschedule && !patient) return say(el("bk-msg"), "Choose the patient.", "err");
      if (!time) return say(el("bk-msg"), "Choose a time.", "err");
      var body = { staff_id: el("bk-doc").value, day: el("bk-day").value, start: time, extra: extra };
      var url = "/hospital/appointments";
      if (o.reschedule) { url += "/" + encodeURIComponent(o.reschedule); body.action = "reschedule"; }
      else { body.patient_id = patient.id; body.kind = el("bk-kind").value; body.reason = el("bk-r").value; body.source = o.source || "desk"; }
      api(url, { method: "POST", body: body }).then(function (r) {
        if (H().guard(r)) return;
        if (!r.ok) return say(el("bk-msg"), r.message, "err");
        toast(r.message); M.close(layer);
        if (o.after) o.after(r);
        if (el("tab-appointments") && !el("tab-appointments").hidden) { S.apDay = body.day; loadAppointments(true); }
      });
    };
    void b;
  }

  /* doctors' weekly sessions and leave */
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function schedules(docId) {
    var docs = DOCS.length ? DOCS : [];
    var mine = can("rx") && !can("schedules") ? H().me().staff.id : "";
    docId = mine || docId || (docs[0] || {}).id || "";
    var depts = ((H().opts && H().opts()) || {}).departments || null;
    var b = M.modal('<h2 id="ops-title">Doctor schedules</h2><p class="sub">Weekly sessions decide which slots can be booked. Leave blocks dates.</p>' +
      '<div class="field"><label for="sc-doc">Doctor</label><select class="input" id="sc-doc"' + (mine ? " disabled" : "") + ">" + docs.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === docId ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("") + '</select></div><div id="sc-body"><div class="empty">Loading…</div></div>', true);
    void depts;
    function load() {
      var id = el("sc-doc").value;
      Promise.all([api("/hospital/schedules/" + encodeURIComponent(id)), api("/hospital/ops/structure")]).then(function (res) {
        var r = res[0], st = res[1];
        if (!r.ok) { el("sc-body").innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
        var ds = ((st && st.departments) || []).filter(function (d) { return d.active && (d.kind === "clinical" || d.kind === "emergency" || d.kind === "diagnostic"); });
        var blocks = r.blocks.slice();
        function row(bk, i) {
          return '<div class="sc-row" data-i="' + i + '"><select class="input" data-f="weekday">' + DAYS.map(function (d, k) { return '<option value="' + k + '"' + (bk.weekday === k ? " selected" : "") + ">" + d + "</option>"; }).join("") + "</select>" +
            '<input class="input" type="time" data-f="start" value="' + esc(bk.start) + '"><input class="input" type="time" data-f="end" value="' + esc(bk.end) + '">' +
            '<select class="input" data-f="slot_min">' + [5, 10, 15, 20, 30, 45, 60].map(function (m) { return '<option value="' + m + '"' + (bk.slot_min === m ? " selected" : "") + ">" + m + " min</option>"; }).join("") + "</select>" +
            '<select class="input" data-f="per_slot">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (bk.per_slot === n ? " selected" : "") + ">" + n + " per slot</option>"; }).join("") + "</select>" +
            '<select class="input" data-f="dept_id"><option value="">Department…</option>' + ds.map(function (d) { return '<option value="' + esc(d.id) + '"' + (bk.dept_id === d.id ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("") + "</select>" +
            '<input class="input" data-f="room" placeholder="Room" maxlength="30" value="' + esc(bk.room || "") + '"><button type="button" class="btn btn-sm btn-ghost" data-rm="' + i + '" aria-label="Remove session">✕</button></div>';
        }
        function draw() {
          el("sc-body").innerHTML = '<div class="ops-h">Weekly sessions</div><div id="sc-rows">' + (blocks.length ? blocks.map(row).join("") : '<div class="mini">No sessions yet.</div>') + "</div>" +
            '<div class="row"><button type="button" class="btn btn-sm" data-add>+ Add a session</button><button type="button" class="btn btn-sm btn-ghost" data-weekdays>Mon–Sat, 9–1</button></div>' +
            '<button type="button" class="btn btn-primary" data-save style="margin-top:12px">Save sessions</button><div class="msg" id="sc-msg"></div>' +
            '<div class="ops-sec"><div class="ops-h">Leave</div>' + (r.leaves.length ? r.leaves.map(function (l) { return '<div class="hms-row"><span class="grow"><b>' + esc(M.day(l.from)) + (l.to !== l.from ? " – " + esc(M.day(l.to)) : "") + "</b><small>" + esc(l.reason || "") + '</small></span><button type="button" class="btn btn-sm btn-ghost" data-unleave="' + esc(l.id) + '">Remove</button></div>'; }).join("") : '<div class="mini">No leave booked.</div>') +
            '<div class="row" style="margin-top:8px"><input class="input" type="date" id="lv-a" min="' + M.today() + '"><input class="input" type="date" id="lv-b" min="' + M.today() + '"><input class="input" id="lv-r" placeholder="Reason" maxlength="120"><button type="button" class="btn btn-sm" data-leave>Add leave</button></div></div>';
        }
        function collect() {
          [].forEach.call(el("sc-rows").querySelectorAll(".sc-row"), function (rw) {
            var bk = blocks[+rw.getAttribute("data-i")];
            [].forEach.call(rw.querySelectorAll("[data-f]"), function (f) { var k = f.getAttribute("data-f"); bk[k] = ["weekday", "slot_min", "per_slot"].indexOf(k) >= 0 ? +f.value : f.value; });
          });
        }
        draw();
        el("sc-body").onclick = function (e) {
          var t;
          if (e.target.closest("[data-add]")) { collect(); var last = blocks[blocks.length - 1]; blocks.push({ weekday: last ? Math.min(6, last.weekday + 1) : 0, start: last ? last.start : "09:00", end: last ? last.end : "13:00", slot_min: last ? last.slot_min : 15, per_slot: 1, dept_id: last ? last.dept_id : "", room: last ? last.room : "" }); draw(); return; }
          if (e.target.closest("[data-weekdays]")) { collect(); for (var k = 0; k < 6; k++) if (!blocks.some(function (x) { return x.weekday === k; })) blocks.push({ weekday: k, start: "09:00", end: "13:00", slot_min: 15, per_slot: 1, dept_id: (ds[0] || {}).id || "", room: "" }); blocks.sort(function (a, c) { return a.weekday - c.weekday || (a.start < c.start ? -1 : 1); }); draw(); return; }
          if ((t = e.target.closest("[data-rm]"))) { collect(); blocks.splice(+t.getAttribute("data-rm"), 1); draw(); return; }
          if (e.target.closest("[data-save]")) { collect(); api("/hospital/schedules/" + encodeURIComponent(id), { method: "POST", body: { blocks: blocks } }).then(function (x) { if (x.ok) { toast(x.message); if (el("tab-appointments")) loadAppointments(true); } else say(el("sc-msg"), x.message, "err"); }); return; }
          if (e.target.closest("[data-leave]")) { api("/hospital/schedules/" + encodeURIComponent(id) + "/leave", { method: "POST", body: { from: el("lv-a").value, to: el("lv-b").value || el("lv-a").value, reason: el("lv-r").value } }).then(function (x) { M.reply(x, load); }); return; }
          if ((t = e.target.closest("[data-unleave]"))) api("/hospital/schedules/" + encodeURIComponent(id) + "/leave", { method: "POST", body: { remove: t.getAttribute("data-unleave") } }).then(function (x) { M.reply(x, load); });
        };
      });
    }
    el("sc-doc").onchange = load;
    if (docId) load(); else el("sc-body").innerHTML = '<div class="empty">Add a doctor to your team first.</div>';
    void b;
  }

  /* ---------------------------------------------------------------- registration with hospital.js */
  var EXTRA = {};
  window.QCHms = {
    M: M, register: register, openRecord: openRecord, book: book, picker: M.picker,
    add: function (key, label, test, group, loader) { EXTRA[key] = { label: label, test: test, group: group, loader: loader }; },
    tabs: function (canFn) {
      var c = function () { for (var i = 0; i < arguments.length; i++) if (canFn(arguments[i])) return true; return false; };
      var t = [["patients", "Patients", c("patients", "patients_view", "read"), "front"], ["appointments", "Appointments", c("appointments", "schedules") || canFn("rx"), "front"]];
      Object.keys(EXTRA).forEach(function (k) { t.push([k, EXTRA[k].label, EXTRA[k].test(canFn), EXTRA[k].group]); });
      return t;
    },
    loaders: function () {
      var l = { patients: loadPatients, appointments: function () { loadAppointments(); } };
      Object.keys(EXTRA).forEach(function (k) { l[k] = EXTRA[k].loader; });
      return l;
    },
    leave: function () { clearInterval(S.timer); },
  };
})();
