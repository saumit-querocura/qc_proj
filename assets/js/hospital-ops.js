/* QueroCura for Hospitals: how the hospital runs.
 * Command centre, OPD and emergency queue, bed board, orders and tasks, shift handover, and setup (departments, wards,
 * beds, waiting-room screens). Plugs into hospital.js through window.QCHosp; registers its tabs through window.QCOps.
 * Everything clinical comes from the server already filtered for the signed-in person's role.
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
  function mins(ts) { return Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); }
  function dur(m) { if (m == null) return "–"; if (m < 60) return m + " min"; var h = Math.floor(m / 60); return h + " h " + (m % 60 ? (m % 60) + " min" : ""); }
  function clock(ts) { return ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""; }
  function ago(ts) { var m = mins(ts); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.floor(m / 60) + " h ago" : Math.floor(m / 1440) + " d ago"; }
  function reply(r, after) {
    if (H().guard(r)) return false;
    toast(r.message || (r.ok ? "Done." : "That didn't work."), r.ok ? "" : "err");
    if (r.ok && after) after(r);
    return r.ok;
  }

  var S = { structure: null, dept: localStorage.getItem("qc-hp-dept") || "", orderScope: "", orderStatus: "open", ward: "", bedView: "grid", timer: null, ticker: null, tab: "" };

  function loadStructure(force) {
    if (S.structure && !force) return Promise.resolve(S.structure);
    return api("/hospital/ops/structure").then(function (r) { if (r && r.ok) S.structure = r; return S.structure; });
  }
  function depts(kinds) { return ((S.structure && S.structure.departments) || []).filter(function (d) { return d.active && (!kinds || kinds.indexOf(d.kind) >= 0); }); }
  function doctors() { return ((S.structure && S.structure.team) || []).filter(function (t) { return t.roles.indexOf("doctor") >= 0 && t.status === "active"; }); }
  function deptName(id) { var d = ((S.structure && S.structure.departments) || []).filter(function (x) { return x.id === id; })[0]; return d ? d.name : ""; }

  function modal(html) { el("ops-body").innerHTML = html; H().P.openModal("ops-modal"); return el("ops-body"); }
  function closeModal() { H().P.closeModal("ops-modal"); }
  function modalOpen() { var m = el("ops-modal"); return m && m.classList.contains("open"); }

  // live refresh while a working tab is on screen; wait times tick every 30 s
  function live(fn, every) {
    clearInterval(S.timer); S.timer = setInterval(function () { if (!document.hidden && !modalOpen()) fn(true); }, every || 30000);
    clearInterval(S.ticker); S.ticker = setInterval(tick, 30000);
  }
  function tick() { [].forEach.call(document.querySelectorAll("[data-since]"), function (n) { n.textContent = dur(mins(+n.getAttribute("data-since"))); }); }

  function unconfigured(box, what) {
    box.innerHTML = '<div class="card ops-empty"><div class="ops-empty-ic">🏥</div><h2>Set up your hospital first</h2><p class="sub">' + esc(what) + " needs departments" + (what === "The bed board" ? " and wards" : "") + ". " +
      (can("structure") ? "It takes one click to start from a template, and you can rename everything afterwards." : "Ask an administrator to set up departments and wards.") + "</p>" +
      (can("structure") ? '<button class="btn btn-primary" type="button" data-goto="setup">Open setup →</button>' : "") + "</div>";
    box.onclick = function (e) { if (e.target.closest("[data-goto]")) H().go("setup"); };
  }

  /* =========================================================== command centre (on Today) */
  function board(box) {
    if (!box) return;
    if (!canAny("ops", "read", "structure")) { box.innerHTML = ""; return; }
    api("/hospital/ops/board").then(function (r) {
      if (!r || !r.ok) { box.innerHTML = ""; return; }
      if (!r.configured) {
        box.innerHTML = can("structure") ? '<div class="ops-callout"><span>🏗️</span><div><b>Run your whole hospital here.</b> Add departments, wards and beds to switch on the OPD queue, the bed board, orders between departments and shift handover.</div><button class="btn btn-primary btn-sm" type="button" data-goto="setup">Set up in one click →</button></div>' : "";
        box.onclick = function (e) { if (e.target.closest("[data-goto]")) H().go("setup"); };
        return;
      }
      var k = r.kpi, occ = k.occupancy_pct || 0;
      var ring = '<div class="ops-ring" style="--p:' + occ + ";--c:" + (occ >= 90 ? "var(--danger)" : occ >= 75 ? "var(--warn)" : "var(--teal)") + '"><span><b>' + (k.occupancy_pct == null ? "–" : occ + "%") + "</b><small>beds full</small></span></div>";
      var tiles = [
        ["🛏️", k.beds_free, "free beds", k.beds_cleaning ? k.beds_cleaning + " being cleaned" : "", "beds"],
        ["🧑‍⚕️", k.inpatients, "inpatients", k.discharge_planned ? k.discharge_planned + " going home" : "", "beds"],
        ["⏳", k.opd_waiting, "waiting in OPD", "avg wait " + dur(k.avg_wait_min), "queue"],
        ["🚑", k.er_open, "in emergency", k.er_overdue ? k.er_overdue + " past target" : "all within target", "queue", k.er_overdue > 0],
        ["🧪", k.orders_open, "open orders", k.orders_overdue ? k.orders_overdue + " overdue" : (k.orders_stat ? k.orders_stat + " STAT" : "none overdue"), "orders", k.orders_overdue > 0],
        ["🔁", k.admitted_today + " / " + k.discharged_today, "admitted / discharged today", "", "beds"],
      ];
      var h = '<div class="ops-cc"><div class="ops-cc-head"><div><span class="ops-live"></span><b>Command centre</b><span class="mini"> · updated ' + clock(Date.now() / 1000) + "</span></div>" +
        (r.alerts.length ? '<div class="ops-alerts">' + r.alerts.map(function (a) { return '<button type="button" class="ops-alert ' + a.level + '" data-goto="' + a.goto + '">' + esc(a.text) + " →</button>"; }).join("") + "</div>" : '<span class="ops-allgood">✓ Nothing needs attention right now</span>') + "</div>" +
        '<div class="ops-cc-grid">' + ring + '<div class="ops-tiles">' + tiles.map(function (t) {
          return '<button type="button" class="ops-tile' + (t[5] ? " hot" : "") + '" data-goto="' + t[4] + '"><span class="ic">' + t[0] + "</span><b>" + esc(t[1] == null ? "–" : t[1]) + "</b><span>" + esc(t[2]) + "</span>" + (t[3] ? "<small>" + esc(t[3]) + "</small>" : "") + "</button>";
        }).join("") + "</div></div>";
      // department load and ward occupancy side by side
      var dl = r.departments.filter(function (d) { return d.kind === "clinical" || d.kind === "emergency"; });
      var maxW = Math.max.apply(null, dl.map(function (d) { return d.waiting + d.in_consult; }).concat([1]));
      h += '<div class="ops-cc-cols"><div><div class="ops-h">Departments now</div>' + (dl.length ? dl.map(function (d) {
        return '<div class="ops-dl"><span class="nm">' + esc(d.name) + (d.now_serving ? ' <span class="tok">#' + d.now_serving + "</span>" : "") + '</span><span class="bars"><i class="w" style="width:' + (100 * d.waiting / maxW) + '%"></i><i class="c" style="width:' + (100 * d.in_consult / maxW) + '%"></i></span><span class="num">' + d.waiting + " waiting · " + d.seen_today + " seen" + (d.avg_wait_min != null ? " · " + dur(d.avg_wait_min) : "") + "</span></div>";
      }).join("") : '<div class="mini">No clinical departments.</div>') + "</div>" +
        '<div><div class="ops-h">Wards</div>' + (r.wards.length ? r.wards.map(function (w) {
          return '<div class="ops-dl"><span class="nm">' + esc(w.name) + '</span><span class="bars"><i class="o' + (w.pct >= 90 ? " hot" : "") + '" style="width:' + w.pct + '%"></i></span><span class="num">' + w.occupied + "/" + w.total + (w.cleaning ? " · " + w.cleaning + " cleaning" : "") + "</span></div>";
        }).join("") : '<div class="mini">No wards yet.</div>') + "</div>" +
        '<div><div class="ops-h">Arrivals today</div>' + spark(r.arrivals_by_hour) + "</div></div>" + (window.QCClin ? QCClin.watch(r) : "") + "</div>";
      box.innerHTML = h;
      box.onclick = function (e) {
        var v = e.target.closest("[data-open-visit]");
        if (v) return openVisit(v.getAttribute("data-open-visit"));
        var g = e.target.closest("[data-goto]");
        if (!g) return;
        if (g.getAttribute("data-goto") === "watch") { var w = el("ops-watch"); if (w) w.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
        H().go(g.getAttribute("data-goto"));
      };
    });
  }
  function spark(hours) {
    var mx = Math.max.apply(null, hours.concat([1])), now = new Date().getHours();
    return '<div class="ops-spark" role="img" aria-label="Arrivals by hour">' + hours.map(function (n, i) { return '<i title="' + i + ':00 · ' + n + '" class="' + (i === now ? "now" : i > now ? "fut" : "") + '" style="height:' + Math.max(4, 100 * n / mx) + '%"></i>'; }).join("") + '</div><div class="ops-spark-x"><span>12 am</span><span>6</span><span>12 pm</span><span>6</span><span>11</span></div>';
  }

  /* =========================================================== the queue: OPD and emergency */
  var STATUS = { waiting: "Waiting", called: "Called in", in_consult: "In consultation", admitted: "Admitted", discharge_planned: "Going home", closed: "Finished" };
  function loadQueue(quiet) {
    var box = el("tab-queue");
    if (!quiet) box.innerHTML = '<div class="empty">Loading the queue…</div>';
    loadStructure().then(function (st) {
      if (!st || !depts(["clinical", "emergency"]).length) return unconfigured(box, "The queue");
      if (S.dept && !depts().some(function (d) { return d.id === S.dept; })) S.dept = "";
      if (!S.dept && !quiet && st.my_departments && st.my_departments.length && !S.deptChosen) S.dept = st.my_departments.filter(function (d) { return depts(["clinical", "emergency"]).some(function (x) { return x.id === d; }); })[0] || "";
      api("/hospital/ops/queue" + (S.dept ? "?dept=" + encodeURIComponent(S.dept) : "")).then(function (r) {
        if (H().guard(r)) return;
        if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
        drawQueue(box, r);
      });
    });
    if (!quiet) live(loadQueue, 20000);
  }
  function drawQueue(box, r) {
    var cols = [["waiting", "Waiting", "⏳"], ["called", "Called in", "📣"], ["in_consult", "In consultation", "🩺"]];
    var ds = depts(["clinical", "emergency"]);
    var dSel = ds.filter(function (d) { return d.id === S.dept; })[0];
    var h = '<div class="ops-bar"><div class="chips">' + '<button type="button" class="chipbtn' + (!S.dept ? " on" : "") + '" data-dept="">All departments</button>' +
      ds.map(function (d) { return '<button type="button" class="chipbtn' + (S.dept === d.id ? " on" : "") + (d.kind === "emergency" ? " er" : "") + '" data-dept="' + esc(d.id) + '">' + (d.kind === "emergency" ? "🚑 " : "") + esc(d.name) + "</button>"; }).join("") + "</div>" +
      '<div class="ops-bar-r"><span class="ops-stat"><b>' + r.open.filter(function (x) { return x.status === "waiting"; }).length + "</b> waiting</span><span class=\"ops-stat\"><b>" + dur(r.avg_wait_min) + "</b> avg wait</span><span class=\"ops-stat\"><b>" + r.seen_today + "</b> seen today</span>" +
      (can("ops") ? '<button class="btn btn-primary btn-sm" type="button" data-checkin>+ Check in a patient</button>' : "") + "</div></div>";
    if (dSel && dSel.kind === "emergency") h += '<div class="ops-triage-key">' + [1, 2, 3, 4, 5].map(function (n) { var t = S.structure.triage[n]; return '<span class="tri t' + n + '">' + n + " · " + esc(t[0]) + " · " + (t[2] ? "see within " + t[2] + " min" : "immediately") + "</span>"; }).join("") + "</div>";
    h += '<div class="ops-kanban">' + cols.map(function (c) {
      var items = r.open.filter(function (x) { return x.status === c[0]; });
      return '<div class="ops-col"><div class="ops-col-h">' + c[2] + " " + c[1] + ' <span class="n">' + items.length + "</span></div>" + (items.length ? items.map(card).join("") : '<div class="ops-none">' + (c[0] === "waiting" ? "No one waiting 🎉" : "—") + "</div>") + "</div>";
    }).join("") + "</div>";
    if (r.done.length) h += '<details class="ops-done"><summary>Finished today (' + r.done.length + ")</summary>" + r.done.map(function (x) {
      return '<div class="ops-done-row" data-open="' + esc(x.id) + '"><span class="tokn">' + (x.token ? "#" + x.token : "") + "</span><b>" + esc(x.patient_name) + '</b><span class="mini">' + esc(x.dept || "") + " · " + esc(({ home: "went home", referred: "referred", admitted: "admitted", no_show: "not here", left: "left", closed: "closed" })[x.outcome] || x.outcome || "") + " · " + clock(x.ended_ts) + "</span></div>";
    }).join("") + "</details>";
    box.innerHTML = h;
    wireQueue(box);
  }
  function card(x) {
    var tri = x.triage ? '<span class="tri t' + x.triage + '" title="' + esc(x.triage_label) + '">' + x.triage + "</span>" : "";
    var pr = x.priority !== "routine" ? '<span class="pri ' + x.priority + '">' + esc(x.priority) + "</span>" : "";
    var acts = [];
    if (x.status === "waiting") { if (canAny("ops", "read")) acts.push(["call", "Call in"]); if (can("read")) acts.push(["start", "Start"]); }
    if (x.status === "called" && can("read")) acts.push(["start", "Start consult"]);
    if (x.status === "in_consult" && can("read")) acts.push(["done", "Finish"]);
    if (x.status !== "waiting" && can("orders")) acts.push(["admit", "Admit"]);
    return '<div class="ops-card' + (x.overdue ? " overdue" : "") + (x.kind === "er" ? " er t" + (x.triage || 3) : "") + '" data-open="' + esc(x.id) + '">' +
      '<div class="ops-card-t"><span class="tokn">' + (x.token ? "#" + x.token : "") + "</span>" + tri + "<b>" + esc(x.patient_name) + "</b>" + pr + (window.QCClin ? QCClin.badge(x.news2) : "") + "</div>" +
      '<div class="ops-card-m">' + (x.dept && !S.dept ? esc(x.dept) + " · " : "") + (x.doctor ? "Dr " + esc(x.doctor.replace(/^dr\.?\s+/i, "")) + " · " : "") +
      (x.status === "waiting" ? '⏱ <span data-since="' + x.created_ts + '">' + dur(mins(x.created_ts)) + "</span>" + (x.position ? " · " + ordinal(x.position) + " in line" : "") + (x.eta_min != null ? ' · <span title="' + esc(x.eta_basis || "") + '">≈ ' + dur(x.eta_min) + " to go</span>" : "") : "since " + clock(x.called_ts || x.started_ts)) +
      (x.overdue ? ' · <b class="late">past ' + x.target_min + " min target</b>" : "") + "</div>" +
      (x.reason ? '<div class="ops-card-r">' + esc(x.reason) + "</div>" : "") +
      (!x.access_active ? '<div class="ops-card-warn">Shared access has ended</div>' : "") +
      (acts.length ? '<div class="ops-card-a">' + acts.map(function (a) { return '<button type="button" class="btn btn-sm' + (a[0] === "start" || a[0] === "call" ? " btn-primary" : "") + '" data-act="' + a[0] + '" data-id="' + esc(x.id) + '">' + a[1] + "</button>"; }).join("") + "</div>" : "") + "</div>";
  }
  function ordinal(n) { return n + (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"); }
  function wireQueue(box) {
    box.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-dept]"))) { S.dept = t.getAttribute("data-dept"); S.deptChosen = true; try { localStorage.setItem("qc-hp-dept", S.dept); } catch (x) {} loadQueue(); return; }
      if (e.target.closest("[data-checkin]")) { checkIn(); return; }
      if ((t = e.target.closest("[data-act]"))) { e.stopPropagation(); step(t.getAttribute("data-id"), t.getAttribute("data-act")); return; }
      if ((t = e.target.closest("[data-open]"))) openVisit(t.getAttribute("data-open"));
    };
  }
  function step(id, act, extra) {
    if (act === "admit") return admit(id);
    if (act === "done") return finish(id);
    api("/hospital/ops/encounters/" + encodeURIComponent(id), { method: "POST", body: Object.assign({ action: act }, extra || {}) }).then(function (r) { reply(r, refresh); });
  }
  function refresh() {
    if (S.tab === "queue") loadQueue(true); else if (S.tab === "beds") loadBeds(true); else if (S.tab === "orders") loadOrders(true);
    if (S.openVisit && modalOpen()) openVisit(S.openVisit);
  }
  function finish(id) {
    var b = modal('<h2 id="ops-title">Finish the visit</h2><p class="sub">How did the visit end?</p><div class="ops-choices">' +
      [["home", "🏠", "Going home", "Seen and sent home"], ["referred", "↗️", "Referred", "Sent to another hospital or specialist"], ["left", "🚶", "Left", "Left before the visit was finished"]].map(function (o) {
        return '<button type="button" class="ops-choice" data-out="' + o[0] + '"><span>' + o[1] + "</span><b>" + o[2] + "</b><small>" + o[3] + "</small></button>";
      }).join("") + "</div>" + (can("orders") ? '<p class="mini" style="margin-top:12px">Needs a bed? Use <b>Admit</b> instead.</p>' : ""));
    b.onclick = function (e) { var t = e.target.closest("[data-out]"); if (t) { closeModal(); step(id, "done", { outcome: t.getAttribute("data-out") }); } };
  }

  /* check-in: pick a connected patient, department, doctor, priority / triage */
  function checkIn(preGrant) {
    Promise.all([loadStructure(), H().loadRoster()]).then(function (res) {
      var roster = (res[1] || []).filter(function (x) { return x.kind === "grant" && x.state === "active"; });
      if (!depts(["clinical", "emergency"]).length) { toast("Add departments in Setup first.", "err"); return; }
      var hms = !!window.QCHms;
      if (!hms && !roster.length) { modal('<h2 id="ops-title">Check in a patient</h2><div class="empty">No connected patients. Connect one first: they show you a code from their QueroCura app.</div><button class="btn btn-primary" type="button" id="ci-connect">Go to Connect →</button>'); el("ci-connect").onclick = function () { closeModal(); H().go("connect"); }; return; }
      var ds = depts(["clinical", "emergency"]);
      var b = modal('<h2 id="ops-title">Check in a patient</h2><p class="sub">They get a token and appear in the department\'s queue and on the waiting-room screen (number only).</p><form id="ci-form" novalidate>' +
        (hms ? '<div class="field"><label>Patient</label><div id="ci-pk"></div></div>' :
        '<div class="field"><label for="ci-p">Patient</label><select class="input" id="ci-p">' + roster.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === preGrant ? " selected" : "") + ">" + esc(g.patient_name) + (g.reference ? " · " + esc(g.reference) : "") + "</option>"; }).join("") + "</select></div>") +
        '<div class="field"><label>Visit type</label><div class="seg" id="ci-kind"><button type="button" data-v="opd" class="on">OPD</button><button type="button" data-v="er">🚑 Emergency</button></div></div>' +
        '<div class="grid2"><div class="field"><label for="ci-d">Department</label><select class="input" id="ci-d">' + ds.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === S.dept ? " selected" : "") + ">" + esc(d.name) + (d.room ? " · " + esc(d.room) : "") + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ci-doc">Doctor (optional)</label><select class="input" id="ci-doc"><option value="">Whoever is free</option>' + doctors().map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + "</option>"; }).join("") + "</select></div></div>" +
        '<div class="field" id="ci-pr-wrap"><label>Priority</label><div class="seg" id="ci-pr"><button type="button" data-v="routine" class="on">Routine</button><button type="button" data-v="urgent">Urgent</button><button type="button" data-v="emergency">Emergency</button></div></div>' +
        '<div class="field" id="ci-tri-wrap" hidden><label>Triage</label><div class="tri-pick" id="ci-tri">' + [1, 2, 3, 4, 5].map(function (n) { var t = S.structure.triage[n]; return '<button type="button" class="tri t' + n + (n === 3 ? " on" : "") + '" data-v="' + n + '"><b>' + n + "</b>" + esc(t[0]) + "</button>"; }).join("") + "</div></div>" +
        '<div class="field"><label for="ci-r">Reason for visit' + (can("read") ? "" : " (you won't see it again; clinicians will)") + '</label><input class="input" id="ci-r" maxlength="600" placeholder="e.g. fever for 3 days"></div>' +
        '<button class="btn btn-primary" type="submit">Check in and issue token</button><div class="msg" id="ci-msg" role="status"></div></form>');
      var kind = "opd", pr = "routine", tri = 3, picked = null;
      if (hms) {
        window.QCHms.picker(el("ci-pk"), function (p) { picked = p; });
        if (preGrant && /^pat_/.test(preGrant)) api("/hospital/patients/" + encodeURIComponent(preGrant)).then(function (r) { if (r.ok) el("ci-pk").pick(r.patient); });
        else if (preGrant) { var g0 = roster.filter(function (g) { return g.id === preGrant; })[0]; if (g0) el("ci-pk").pick({ id: "", grant_id: g0.id, name: g0.patient_name, mrn: g0.reference || "" }); }
      }
      function seg(id, cb) { el(id).onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; [].forEach.call(el(id).children, function (c) { c.classList.toggle("on", c === t); }); cb(t.getAttribute("data-v")); }; }
      seg("ci-kind", function (v) {
        kind = v; H().show(el("ci-tri-wrap"), v === "er"); H().show(el("ci-pr-wrap"), v !== "er");
        var er = depts(["emergency"])[0]; if (v === "er" && er) el("ci-d").value = er.id;
      });
      seg("ci-pr", function (v) { pr = v; });
      el("ci-tri").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; [].forEach.call(el("ci-tri").children, function (c) { c.classList.toggle("on", c === t); }); tri = +t.getAttribute("data-v"); };
      el("ci-form").onsubmit = function (e) {
        e.preventDefault();
        var body = { kind: kind, dept_id: el("ci-d").value, doctor_id: el("ci-doc").value, priority: kind === "er" ? "emergency" : pr, reason: el("ci-r").value };
        if (hms) { if (!picked) { H().say(el("ci-msg"), "Choose the patient.", "err"); return; } if (picked.id) body.patient_id = picked.id; else body.grant_id = picked.grant_id; }
        else body.grant_id = el("ci-p").value;
        if (kind === "er") body.triage = tri;
        api("/hospital/ops/encounters", { method: "POST", body: body }).then(function (r) {
          if (H().guard(r)) return;
          if (!r.ok) { H().say(el("ci-msg"), r.message, "err"); return; }
          b.innerHTML = '<div class="ops-token-big"><small>Token</small><b>' + (r.item.token || "–") + "</b><span>" + esc(deptName(body.dept_id)) + '</span></div><p class="sub" style="text-align:center">Tell the patient their number. They can also follow their place in the queue in their QueroCura app.</p><div style="text-align:center"><button class="btn btn-primary" type="button" id="ci-done">Done</button> <button class="btn" type="button" id="ci-more">Check in another</button></div>';
          el("ci-done").onclick = function () { closeModal(); if (S.tab === "queue") loadQueue(true); };
          el("ci-more").onclick = function () { checkIn(); };
        });
      };
    });
  }

  /* =========================================================== one visit, in full */
  function openVisit(id) {
    S.openVisit = id;
    api("/hospital/ops/encounters/" + encodeURIComponent(id)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { toast(r.message, "err"); return; }
      var x = r.item, acts = [];
      var open = x.status !== "closed";
      if (x.status === "waiting" && canAny("ops", "read")) acts.push(["call", "Call in", "btn-primary"], ["no_show", "Not here", ""]);
      if ((x.status === "waiting" || x.status === "called") && can("read")) acts.push(["start", "Start consultation", "btn-primary"]);
      if (["waiting", "called", "in_consult"].indexOf(x.status) >= 0 && can("read")) acts.push(["done", "Finish visit", ""]);
      if (["waiting", "called", "in_consult"].indexOf(x.status) >= 0 && can("orders")) acts.push(["admit", "Admit", ""]);
      if ((x.status === "admitted" || x.status === "discharge_planned") && canAny("ops", "read")) acts.push(["transfer", "Move bed", ""]);
      if (x.status === "admitted" && can("orders")) acts.push(["plan_discharge", "Plan discharge", "btn-primary"]);
      if (x.status === "discharge_planned" && can("orders")) acts.push(["discharge", "Discharge", "btn-primary"]);
      if (open && !x.access_active && canAny("ops", "orders")) acts.push(["close", "Close visit (access ended)", "btn-danger"]);
      var steps = [["Arrived", x.created_ts], ["Called in", x.called_ts], ["Consultation", x.started_ts], ["Admitted", x.admitted_ts], ["Discharge planned", x.planned_ts], [x.status === "closed" ? "Finished" : "", x.ended_ts]].filter(function (s) { return s[1] && s[0]; });
      var h = '<div class="ops-v-head"><div class="avatar">' + esc(H().initials(x.patient_name)) + '</div><div class="grow"><h2 id="ops-title">' + esc(x.patient_name) + '</h2><div class="mini">' + esc(x.kind_label) + " · " + esc(x.dept || "") +
        (x.token ? " · token #" + x.token : "") + (x.bed ? " · " + esc(x.ward) + ", bed " + esc(x.bed) : "") + (x.doctor ? " · " + esc(x.doctor) : "") + (x.reference ? " · " + esc(x.reference) : "") + "</div></div>" +
        '<span class="pill ' + (x.status === "closed" ? "" : "ok") + '">' + esc(STATUS[x.status] || x.status) + "</span></div>";
      if (!x.access_active && open) h += '<div class="notice bad">The patient\'s shared access has ended. Nothing new can be ordered or read until they reconnect. You can still move or free the bed.</div>';
      if (x.triage) h += '<div class="ops-tri-line"><span class="tri t' + x.triage + '">' + x.triage + "</span> " + esc(x.triage_label) + (x.target_min != null ? " · see within " + (x.target_min || 0) + " min" : "") + "</div>";
      if (x.reason) h += '<div class="ops-reason"><span class="mini">Reason for visit</span><div>' + esc(x.reason) + "</div></div>";
      h += '<div class="ops-steps">' + steps.map(function (s) { return '<div><i></i><b>' + esc(s[0]) + "</b><span>" + clock(s[1]) + "</span></div>"; }).join("") + (x.los_days != null ? '<div class="los"><b>' + x.los_days + " days</b><span>in hospital</span></div>" : "") + "</div>";
      if (acts.length) h += '<div class="ops-v-acts">' + acts.map(function (a) { return '<button type="button" class="btn btn-sm ' + a[2] + '" data-vact="' + a[0] + '">' + a[1] + "</button>"; }).join("") +
        (can("read") && x.access_active ? '<button type="button" class="btn btn-sm btn-ghost" data-chart="' + esc(x.grant_id) + '">Open chart</button>' : "") + "</div>";
      if (window.QCHms && x.patient_id) {
        var mg = [];
        mg.push('<button type="button" class="btn btn-sm btn-ghost" data-hms="record">🗂️ Patient record' + (x.mrn ? " · " + esc(x.mrn) : "") + "</button>");
        if (can("rx") && open && x.access_active) mg.push('<button type="button" class="btn btn-sm" data-hms="rx">℞ Prescribe</button>');
        if (can("billing") || can("billing_admin")) mg.push('<button type="button" class="btn btn-sm" data-hms="bill">🧾 Bill</button>');
        if (can("appointments") || can("rx")) mg.push('<button type="button" class="btn btn-sm" data-hms="followup">📅 Book follow-up</button>');
        if ((x.kind === "ipd" || x.kind === "daycare") && (can("orders") || can("read")) && window.QCHms.discharge) mg.push('<button type="button" class="btn btn-sm" data-dsum>📝 Discharge summary</button>');
        h += '<div class="ops-v-acts hms-acts">' + mg.join("") + "</div>";
        if (x.prescriptions && x.prescriptions.length) h += '<div class="ops-sec"><div class="ops-h">Prescriptions</div>' + x.prescriptions.map(function (p) { return '<button type="button" class="rec-line" data-hmsrx="' + esc(p.id) + '"><b>' + esc(p.number) + "</b><span>" + esc((p.diagnosis || p.n_items + " medicines") + " · " + p.doctor) + "</span></button>"; }).join("") + "</div>";
      }
      if (window.QCClin) h += QCClin.section(x);
      // discharge checklist
      if (x.status === "admitted" || x.status === "discharge_planned") {
        var ck = (S.structure && S.structure.checklist) || {};
        h += '<div class="ops-sec"><div class="ops-h">Discharge checklist</div>' + (S.structure.checklist_order || Object.keys(ck)).map(function (k) {
          return '<label class="ops-ck' + (x.checklist[k] ? " on" : "") + '"><input type="checkbox" data-ck="' + k + '"' + (x.checklist[k] ? " checked" : "") + (can("read") ? "" : " disabled") + "><span>" + esc(ck[k]) + "</span></label>";
        }).join("") + (x.access_active && (can("write")) ? '<button class="btn btn-sm btn-ghost" type="button" data-dsum style="margin-top:6px">Write the discharge summary →</button>' : "") + "</div>";
      }
      // orders
      h += '<div class="ops-sec"><div class="ops-h">Orders and tasks <span class="mini">' + x.orders.length + "</span></div>" + (x.orders.length ? x.orders.map(orderRow).join("") : '<div class="mini">Nothing ordered yet.</div>') +
        (open && x.access_active && canAny("orders", "write_basic") ? '<button class="btn btn-sm" type="button" data-neworder>+ New order</button>' : "") +
        (x.access_active && can("imaging") && window.QCImaging ? ' <button class="btn btn-sm" type="button" data-newstudy>🩻 + Imaging study</button>' : "") + "</div>";
      if (x.handover && x.handover.length) h += '<div class="ops-sec"><div class="ops-h">Handover notes</div>' + x.handover.map(handoverCard).join("") + "</div>";
      if (x.earlier && x.earlier.length) h += '<div class="mini" style="margin-top:12px">Came in through: ' + x.earlier.map(function (e) { return esc(e.kind.toUpperCase() + " · " + (e.dept || "") + " · " + new Date(e.created_ts * 1000).toLocaleDateString()); }).join(" → ") + "</div>";
      var b = modal(h);
      if (window.QCClin) QCClin.after(x);
      b.onclick = function (e) {
        var t;
        if (window.QCClin && QCClin.click(e, x, function () { openVisit(x.id); })) return;
        if ((t = e.target.closest("[data-hmsrx]"))) return window.QCHms.openRx(t.getAttribute("data-hmsrx"));
        if ((t = e.target.closest("[data-hms]"))) {
          var w = t.getAttribute("data-hms"), Q = window.QCHms;
          if (w === "record") { closeModal(); return Q.openRecord(x.patient_id); }
          if (w === "bill") return Q.billForVisit(x.id);
          var pp = { id: x.patient_id, name: x.patient_name, mrn: x.mrn };
          if (w === "followup") return Q.book({ patient: pp, kind: "follow_up", source: "followup", doctor: x.doctor_id, layer: 2 });
          if (w === "rx") return api("/hospital/patients/" + encodeURIComponent(x.patient_id)).then(function (r) { if (r.ok) Q.prescribe({ patient: r.patient, encounter_id: x.id, complaints: x.reason || "", layer: 2, after: function () { openVisit(x.id); } }); });
        }
        if ((t = e.target.closest("[data-vact]"))) {
          var a = t.getAttribute("data-vact");
          if (a === "admit") return admit(x.id);
          if (a === "transfer") return pickBed(x, "transfer");
          if (a === "done") return finish(x.id);
          if (a === "discharge") return discharge(x);
          if (a === "no_show" && !window.confirm("Mark " + x.patient_name + " as not here?")) return;
          step(x.id, a);
          return;
        }
        if ((t = e.target.closest("[data-chart]"))) { closeModal(); H().openChart(t.getAttribute("data-chart")); return; }
        if (e.target.closest("[data-neworder]")) return newOrder(x);
        if (e.target.closest("[data-newstudy]")) return window.QCImaging.newStudy({ grant_id: x.grant_id, encounter_id: x.id, indication: x.reason || "" });
        if (e.target.closest("[data-dsum]") && window.QCHms && window.QCHms.discharge) return window.QCHms.discharge(x.id, { layer: 2, after: function () { openVisit(x.id); } });
        if (e.target.closest("[data-dsum]")) { closeModal(); H().openRecord(x.grant_id, x.patient_name); setTimeout(function () { var k = document.querySelector('[data-kind="discharge"]'); if (k) k.click(); }, 50); return; }
        if ((t = e.target.closest("[data-oact]"))) return orderStep(t.getAttribute("data-id"), t.getAttribute("data-oact"));
      };
      b.onchange = function (e) {
        var c = e.target.closest("[data-ck]"); if (!c) return;
        api("/hospital/ops/encounters/" + encodeURIComponent(x.id), { method: "POST", body: { action: "checklist", item: c.getAttribute("data-ck"), done: c.checked } }).then(function (r) { if (!r.ok) { toast(r.message, "err"); c.checked = !c.checked; } c.closest(".ops-ck").classList.toggle("on", c.checked); });
      };
    });
  }
  function discharge(x) {
    var missing = Object.keys(x.checklist).filter(function (k) { return !x.checklist[k]; });
    var b = modal('<h2 id="ops-title">Discharge ' + esc(x.patient_name) + '</h2><p class="sub">The bed is marked for cleaning straight away.</p>' +
      '<div class="ops-choices">' + [["home", "🏠", "Home"], ["referred", "↗️", "Referred"], ["lama", "✍️", "Left against advice"], ["deceased", "🕊️", "Died"]].map(function (o) { return '<button type="button" class="ops-choice' + (o[0] === "home" ? " on" : "") + '" data-out="' + o[0] + '"><span>' + o[1] + "</span><b>" + o[2] + "</b></button>"; }).join("") + "</div>" +
      (missing.length ? '<div class="notice wait" style="margin-top:14px">Checklist not finished: ' + missing.map(function (k) { return esc(S.structure.checklist[k]); }).join("; ") + '.</div><div class="field"><label for="dc-why">Reason to discharge anyway</label><input class="input" id="dc-why" maxlength="200"></div>' : "") +
      '<button class="btn btn-primary" type="button" id="dc-go">Discharge</button><div class="msg" id="dc-msg"></div>');
    var out = "home";
    b.onclick = function (e) {
      var t = e.target.closest("[data-out]");
      if (t) { out = t.getAttribute("data-out"); [].forEach.call(b.querySelectorAll("[data-out]"), function (c) { c.classList.toggle("on", c === t); }); return; }
      if (e.target.id === "dc-go") api("/hospital/ops/encounters/" + encodeURIComponent(x.id), { method: "POST", body: { action: "discharge", outcome: out, override_reason: el("dc-why") ? el("dc-why").value : "" } }).then(function (r) {
        if (r.ok) { closeModal(); toast(r.message); S.openVisit = null; refresh(); } else H().say(el("dc-msg"), r.message, "err");
      });
    };
  }

  /* admitting and moving: a bed picker that suggests the best free bed */
  function admit(id) {
    api("/hospital/ops/encounters/" + encodeURIComponent(id)).then(function (r) { if (r.ok) pickBed(r.item, "admit"); else toast(r.message, "err"); });
  }
  function pickBed(x, action) {
    var want = x.triage && x.triage <= 2 ? "icu" : "";
    api("/hospital/ops/beds/suggest?dept=" + encodeURIComponent(x.dept_id || "") + "&kind=" + want + "&enc=" + encodeURIComponent(x.id)).then(function (r) {
      if (!r.ok) { toast(r.message, "err"); return; }
      var beds = r.beds.filter(function (b) { return b.id !== x.bed_id; });
      var byWard = {};
      beds.forEach(function (b) { (byWard[b.ward] = byWard[b.ward] || []).push(b); });
      var best = beds[0];
      var b = modal('<h2 id="ops-title">' + (action === "admit" ? "Admit " : "Move ") + esc(x.patient_name) + "</h2>" +
        (best ? '<div class="ops-suggest"><span>✨ Suggested</span><b>' + esc(best.ward) + " · bed " + esc(best.label) + '</b><button class="btn btn-primary btn-sm" type="button" data-bed="' + esc(best.id) + '">Use this bed</button></div>' : '<div class="notice bad">No free beds. Free a bed (mark one clean) or add beds in Setup.</div>') +
        Object.keys(byWard).map(function (w) { return '<div class="ops-h" style="margin-top:14px">' + esc(w) + '</div><div class="bed-pick">' + byWard[w].map(function (bd) { return '<button type="button" class="bedbtn ' + bd.status + (bd.unsuited ? " unsuited" : "") + '" data-bed="' + esc(bd.id) + '"' + (bd.unsuited ? ' title="Usually not for this patient"' : "") + ">" + esc(bd.label) + "</button>"; }).join("") + "</div>"; }).join("") +
        '<div class="msg" id="bp-msg"></div>');
      b.onclick = function (e) {
        var t = e.target.closest("[data-bed]"); if (!t) return;
        api("/hospital/ops/encounters/" + encodeURIComponent(x.id), { method: "POST", body: { action: action, bed_id: t.getAttribute("data-bed") } }).then(function (res) {
          if (res.ok) { toast(res.message); if (res.item) { S.openVisit = res.item.id; openVisit(res.item.id); } refresh(); } else H().say(el("bp-msg"), res.message, "err");
        });
      };
    });
  }

  /* =========================================================== bed board */
  function loadBeds(quiet) {
    var box = el("tab-beds");
    if (!quiet) box.innerHTML = '<div class="empty">Loading beds…</div>';
    Promise.all([loadStructure(true), api("/hospital/ops/inpatients")]).then(function (res) {
      var st = res[0], ip = res[1];
      if (!st || !st.wards.length) return unconfigured(box, "The bed board");
      if (H().guard(ip)) return;
      var byEnc = {};
      (ip.items || []).forEach(function (p) { byEnc[p.id] = p; });
      var wards = st.wards.filter(function (w) { return w.active; });
      var tot = 0, occ = 0, free = 0, cleaning = 0;
      wards.forEach(function (w) { w.beds.forEach(function (b) { if (b.status !== "blocked") tot++; if (b.status === "occupied") occ++; if (b.status === "free") free++; if (b.status === "cleaning") cleaning++; }); });
      var h = '<div class="ops-bar"><div class="chips"><button type="button" class="chipbtn' + (S.bedView === "grid" ? " on" : "") + '" data-view="grid">🛏️ Bed board</button><button type="button" class="chipbtn' + (S.bedView === "list" ? " on" : "") + '" data-view="list">📋 Inpatient list (' + (ip.items || []).length + ")</button></div>" +
        '<div class="ops-bar-r"><span class="ops-stat"><b>' + occ + "/" + tot + "</b> occupied</span><span class=\"ops-stat\"><b>" + free + "</b> free</span>" + (cleaning ? '<span class="ops-stat warn"><b>' + cleaning + "</b> to clean</span>" : "") +
        (can("ops") ? '<button class="btn btn-primary btn-sm" type="button" data-direct>+ Admit directly</button>' : "") + "</div></div>" +
        '<div class="bed-legend"><span class="free">Free</span><span class="occupied">Occupied</span><span class="cleaning">Cleaning</span><span class="reserved">Reserved</span><span class="blocked">Blocked</span><span class="gohome">Going home</span></div>';
      if (S.bedView === "list") {
        h += '<div class="card"><div class="scroll-x"><table class="t"><thead><tr><th>Patient</th><th>Where</th><th>NEWS2</th><th>Days</th><th>Doctor</th><th>Open orders</th><th>Status</th></tr></thead><tbody>' +
          ((ip.items || []).map(function (p) {
            return '<tr class="clickrow" data-open="' + esc(p.id) + '"><td><b>' + esc(p.patient_name) + "</b>" + (p.access_active ? "" : ' <span class="tag emg">access ended</span>') + '</td><td>' + esc(p.ward || "") + " · " + esc(p.bed || "") + "</td><td>" + (window.QCClin && p.news2 ? QCClin.badge(p.news2) : "–") + "</td><td>" + (p.los_days != null ? p.los_days : "") + "</td><td>" + esc(p.doctor || "–") + "</td><td>" + (p.open_orders || "–") + "</td><td>" + esc(STATUS[p.status] || p.status) + "</td></tr>";
          }).join("") || '<tr><td colspan="7" class="empty">No inpatients.</td></tr>') + "</tbody></table></div></div>";
      } else {
        h += '<div class="wards">' + wards.map(function (w) {
          var t = w.beds.filter(function (b) { return b.status !== "blocked"; }).length, o = w.beds.filter(function (b) { return b.status === "occupied"; }).length;
          return '<div class="ward"><div class="ward-h"><b>' + esc(w.name) + '</b><span class="mini">' + esc((st.ward_kinds || {})[w.kind] || w.kind) + '</span><span class="ward-occ"><i style="width:' + (t ? 100 * o / t : 0) + '%"></i></span><span class="mini">' + o + "/" + t + '</span></div><div class="bedgrid">' +
            w.beds.map(function (b) {
              var p = b.encounter_id ? byEnc[b.encounter_id] : null;
              var cls = b.status + (p && p.status === "discharge_planned" ? " gohome" : "") + (p && !p.access_active ? " noaccess" : "");
              return '<button type="button" class="bed ' + cls + '" data-bed="' + esc(b.id) + '" data-enc="' + esc(b.encounter_id || "") + '" title="' + esc(b.label + (p ? " · " + p.patient_name : " · " + b.status) + (b.note ? " · " + b.note : "")) + '"><span class="bl">' + esc(b.label) + "</span>" +
                (p ? '<span class="bi">' + esc(H().initials(p.patient_name)) + '</span><span class="bd">' + (p.los_days != null ? Math.floor(p.los_days) + "d" : "") + (p.open_orders ? " · " + p.open_orders + "🧪" : "") + "</span>" + (window.QCClin ? QCClin.badge(p.news2) : "") : b.status === "cleaning" ? '<span class="bi">🧽</span>' : b.status === "reserved" ? '<span class="bi">R</span>' : b.status === "blocked" ? '<span class="bi">⛔</span>' : "") + "</button>";
            }).join("") + "</div></div>";
        }).join("") + "</div>";
      }
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-view]"))) { S.bedView = t.getAttribute("data-view"); loadBeds(true); return; }
        if (e.target.closest("[data-direct]")) return directAdmit();
        if ((t = e.target.closest("[data-open]"))) return openVisit(t.getAttribute("data-open"));
        if ((t = e.target.closest("[data-bed]"))) {
          var enc = t.getAttribute("data-enc");
          if (enc) return openVisit(enc);
          bedMenu(t.getAttribute("data-bed"), st);
        }
      };
    });
    if (!quiet) live(loadBeds, 30000);
  }
  function bedMenu(bedId, st) {
    var bed = null, ward = null;
    st.wards.forEach(function (w) { w.beds.forEach(function (b) { if (b.id === bedId) { bed = b; ward = w; } }); });
    if (!bed) return;
    var opts = [];
    if (bed.status === "cleaning") opts.push(["free", "✨ Cleaned and ready", "btn-primary"]);
    if (bed.status === "free") { if (can("ops")) opts.push(["admit", "Admit a patient here", "btn-primary"]); opts.push(["reserved", "Reserve", ""], ["blocked", "Block (repair, isolation…)", ""]); }
    if (bed.status === "reserved" || bed.status === "blocked") opts.push(["free", "Make available", "btn-primary"]);
    if (can("structure") && bed.status !== "occupied") opts.push(["remove", "Remove this bed", "btn-danger"]);
    var b = modal('<h2 id="ops-title">' + esc(ward.name) + " · bed " + esc(bed.label) + '</h2><p class="sub">Now: <b>' + esc(bed.status) + "</b>" + (bed.note ? " · " + esc(bed.note) : "") + " · since " + esc(H().when(bed.updated_ts)) + "</p>" +
      '<div class="field" id="bm-note-wrap"><label for="bm-note">Note (optional)</label><input class="input" id="bm-note" maxlength="80" placeholder="e.g. AC repair, isolation"></div>' +
      '<div class="ops-v-acts">' + opts.map(function (o) { return '<button type="button" class="btn ' + o[2] + '" data-bs="' + o[0] + '">' + o[1] + "</button>"; }).join("") + "</div>");
    b.onclick = function (e) {
      var t = e.target.closest("[data-bs]"); if (!t) return;
      var v = t.getAttribute("data-bs");
      if (v === "admit") return directAdmit(bed.id);
      if (v === "remove" && !window.confirm("Remove bed " + bed.label + "?")) return;
      api("/hospital/ops/beds/" + encodeURIComponent(bed.id), { method: "POST", body: v === "remove" ? { remove: true } : { status: v, note: el("bm-note").value } }).then(function (r) { if (reply(r)) { closeModal(); loadBeds(true); } });
    };
  }
  function directAdmit(bedId) {
    Promise.all([loadStructure(), H().loadRoster(), api("/hospital/ops/beds/suggest")]).then(function (res) {
      var roster = (res[1] || []).filter(function (x) { return x.kind === "grant" && x.state === "active"; });
      if (!roster.length) { toast("No connected patients. Connect the patient first.", "err"); return; }
      var beds = (res[2] && res[2].beds) || [];
      var b = modal('<h2 id="ops-title">Admit a patient</h2><p class="sub">For planned admissions and day care. OPD and emergency patients are admitted from their visit.</p><form id="da-form" novalidate>' +
        '<div class="field"><label for="da-p">Patient</label><select class="input" id="da-p">' + roster.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.patient_name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="grid2"><div class="field"><label for="da-d">Department</label><select class="input" id="da-d">' + depts(["clinical", "emergency"]).map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="da-b">Bed</label><select class="input" id="da-b">' + beds.map(function (bd) { return '<option value="' + esc(bd.id) + '"' + (bd.id === bedId ? " selected" : "") + ">" + esc(bd.ward + " · " + bd.label) + "</option>"; }).join("") + "</select></div></div>" +
        '<div class="field"><label>Type</label><div class="seg" id="da-k"><button type="button" class="on" data-v="ipd">Admission</button><button type="button" data-v="daycare">Day care</button></div></div>' +
        '<div class="field"><label for="da-r">Reason</label><input class="input" id="da-r" maxlength="600"></div><button class="btn btn-primary" type="submit">Admit</button><div class="msg" id="da-msg"></div></form>');
      var kind = "ipd";
      el("da-k").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; kind = t.getAttribute("data-v"); [].forEach.call(el("da-k").children, function (c) { c.classList.toggle("on", c === t); }); };
      el("da-form").onsubmit = function (e) {
        e.preventDefault();
        api("/hospital/ops/encounters", { method: "POST", body: { grant_id: el("da-p").value, kind: kind, dept_id: el("da-d").value, bed_id: el("da-b").value, reason: el("da-r").value } }).then(function (r) {
          if (r.ok) { toast(r.message); openVisit(r.item.id); refresh(); } else H().say(el("da-msg"), r.message, "err");
        });
      };
      void b;
    });
  }

  /* =========================================================== orders and tasks */
  var KIND_IC = { lab: "🧪", imaging: "🩻", nursing: "💉", consult: "🗣️", procedure: "🔧" };
  var QUICK = {
    lab: ["CBC", "CBC with platelets", "Blood sugar (random)", "HbA1c", "LFT", "KFT / RFT", "Electrolytes", "Lipid profile", "Thyroid profile", "Urine routine", "Dengue NS1 / IgM", "Malaria antigen", "Widal", "CRP", "Blood culture"],
    imaging: ["Chest X-ray", "X-ray (specify part)", "Ultrasound abdomen", "ECG", "Echo", "CT head", "CT abdomen", "MRI (specify)"],
    nursing: ["Vitals every 4 h", "Vitals every hour", "Strict input/output chart", "Wound dressing", "Fall-risk precautions", "Blood sugar charting", "Prepare for procedure", "Physiotherapy referral"],
    consult: ["Cardiology", "Surgery", "Neurology", "Paediatrics", "Obstetrics & Gynaecology", "Orthopaedics", "Psychiatry", "Dietician"],
    procedure: ["IV line", "Catheterisation", "Suturing", "Nebulisation", "Plaster / splint"],
  };
  function orderRow(o) {
    ORDERS[o.id] = o;
    var due = o.due_ts && o.status !== "done" && o.status !== "cancelled" ? (o.overdue ? '<b class="late">overdue by ' + ago(o.due_ts).replace(" ago", "") + "</b>" : dueIn(o.due_ts)) : "";
    var acts = [];
    if (o.status === "ordered" && can("fulfil")) acts.push(["accept", "Accept"]);
    if ((o.status === "ordered" || o.status === "accepted") && can("fulfil")) acts.push(["start", "Start"]);
    if (["ordered", "accepted", "in_progress"].indexOf(o.status) >= 0 && (can("fulfil") || (can("orders") && (o.kind === "consult" || o.kind === "procedure")))) acts.push(["done", o.kind === "lab" || o.kind === "imaging" ? "Enter result" : "Mark done"]);
    if (o.kind === "imaging" && ["ordered", "accepted", "in_progress"].indexOf(o.status) >= 0 && can("imaging") && window.QCImaging && o.grant_id) acts.unshift(["images", "🩻 Attach images"]);
    if (["ordered", "accepted", "in_progress"].indexOf(o.status) >= 0 && can("orders")) acts.push(["cancel", "Cancel"]);
    return '<div class="ord ' + o.status + (o.overdue ? " overdue" : "") + " p-" + o.priority + '"><span class="ord-ic">' + (KIND_IC[o.kind] || "•") + '</span><div class="grow"><div class="ord-t"><b>' + esc(o.item == null ? o.kind_label : o.item) + "</b>" +
      (o.priority !== "routine" ? '<span class="pri ' + (o.priority === "stat" ? "emergency" : "urgent") + '">' + esc(o.priority.toUpperCase()) + "</span>" : "") + '<span class="ord-st">' + esc(o.status.replace("_", " ")) + "</span></div>" +
      '<div class="mini">' + (o.patient_name ? esc(o.patient_name) + (o.bed ? " · bed " + esc(o.bed) : o.token ? " · #" + o.token : "") + " · " : "") + esc(o.dept || o.kind_label) + " · by " + esc(o.ordered_by || "") + (o.assigned ? " · " + esc(o.assigned) : "") + (due ? " · " + due : "") + "</div>" +
      (o.notes ? '<div class="ord-n">' + esc(o.notes) + "</div>" : "") + (o.result ? '<div class="ord-res"><span>Result</span>' + esc(o.result) + "</div>" : "") + "</div>" +
      (acts.length ? '<div class="ord-a">' + acts.map(function (a) { return '<button type="button" class="btn btn-sm' + (a[0] === "done" ? " btn-primary" : a[0] === "cancel" ? " btn-ghost" : "") + '" data-oact="' + a[0] + '" data-id="' + esc(o.id) + '">' + a[1] + "</button>"; }).join("") + "</div>" : "") + "</div>";
  }
  function dueIn(ts) {
    var m = Math.round((ts - Date.now() / 1000) / 60);
    return m < 60 ? "due in " + Math.max(1, m) + " min" : m < 18 * 60 ? "due " + clock(ts) : "due " + new Date(ts * 1000).toLocaleDateString([], { day: "numeric", month: "short" }) + " " + clock(ts);
  }
  var ORDERS = {};
  function orderStep(id, act) {
    if (act === "images") { var o = ORDERS[id] || {}; closeModal(); window.QCImaging.newStudy({ grant_id: o.grant_id, order_id: id, encounter_id: o.encounter_id, indication: o.item || "", modality: /ct/i.test(o.item || "") ? "ct" : /mri/i.test(o.item || "") ? "mri" : /ultra|usg|sono/i.test(o.item || "") ? "us" : /x-?ray/i.test(o.item || "") ? "xray" : "" }); return; }
    if (act === "done" && (ORDERS[id] || {}).kind === "lab" && window.QCLab && !orderStep._free) {
      return window.QCLab.enter(id, refresh, function () { orderStep._free = true; orderStep(id, "done"); orderStep._free = false; });
    }
    if (act === "done") {
      var b = modal('<h2 id="ops-title">Complete the order</h2><div class="field"><label for="od-r">Result, report or note</label><textarea class="input" id="od-r" rows="6" maxlength="4000" placeholder="e.g. Hb 11.2 g/dL, WBC 4,200, platelets 92,000"></textarea><div class="mini">Lab and imaging results are added to the patient\'s own record when they allowed records to be added.</div></div><button class="btn btn-primary" type="button" id="od-go">Complete</button><div class="msg" id="od-msg"></div>');
      el("od-r").focus();
      el("od-go").onclick = function () { api("/hospital/ops/orders/" + encodeURIComponent(id), { method: "POST", body: { action: "done", result: el("od-r").value } }).then(function (r) { if (r.ok) { toast(r.message); closeModal(); refresh(); } else H().say(el("od-msg"), r.message, "err"); }); };
      void b; return;
    }
    if (act === "cancel") { var why = window.prompt("Why cancel this order?"); if (why === null) return; return api("/hospital/ops/orders/" + encodeURIComponent(id), { method: "POST", body: { action: "cancel", reason: why } }).then(function (r) { reply(r, refresh); }); }
    api("/hospital/ops/orders/" + encodeURIComponent(id), { method: "POST", body: { action: act } }).then(function (r) { reply(r, refresh); });
  }
  function newOrder(x) {
    var kinds = can("orders") ? Object.keys(S.structure.order_kinds) : ["nursing"];
    var b = modal('<h2 id="ops-title">New order for ' + esc(x.patient_name) + '</h2><form id="no-form" novalidate><div class="field"><label>Kind</label><div class="seg" id="no-k">' + kinds.map(function (k, i) { return '<button type="button" data-v="' + k + '"' + (i ? "" : ' class="on"') + ">" + (KIND_IC[k] || "") + " " + esc(S.structure.order_kinds[k]) + "</button>"; }).join("") + "</div></div>" +
      '<div class="field"><label for="no-i">What is needed</label><input class="input" id="no-i" maxlength="160" list="no-list" autocomplete="off"><datalist id="no-list"></datalist><div class="quick" id="no-q"></div></div>' +
      '<div class="grid2"><div class="field"><label>Priority</label><div class="seg" id="no-p"><button type="button" data-v="routine" class="on">Routine</button><button type="button" data-v="urgent">Urgent (2 h)</button><button type="button" data-v="stat">STAT (30 min)</button></div></div>' +
      '<div class="field"><label for="no-d">Send to</label><select class="input" id="no-d"><option value="">Choose automatically</option>' + depts().map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field"><label for="no-n">Notes</label><input class="input" id="no-n" maxlength="600"></div><button class="btn btn-primary" type="submit">Place order</button><div class="msg" id="no-msg"></div></form>');
    var kind = kinds[0], pr = "routine";
    function quick() { var q = QUICK[kind] || []; el("no-list").innerHTML = q.map(function (v) { return "<option value=\"" + esc(v) + "\">"; }).join(""); el("no-q").innerHTML = q.slice(0, 8).map(function (v) { return '<button type="button" class="qchip">' + esc(v) + "</button>"; }).join(""); }
    quick();
    el("no-q").onclick = function (e) { var t = e.target.closest(".qchip"); if (t) { el("no-i").value = t.textContent; el("no-i").focus(); } };
    el("no-k").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; kind = t.getAttribute("data-v"); [].forEach.call(el("no-k").children, function (c) { c.classList.toggle("on", c === t); }); quick(); };
    el("no-p").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; pr = t.getAttribute("data-v"); [].forEach.call(el("no-p").children, function (c) { c.classList.toggle("on", c === t); }); };
    el("no-form").onsubmit = function (e) {
      e.preventDefault();
      api("/hospital/ops/orders", { method: "POST", body: { encounter_id: x.id, kind: kind, item: el("no-i").value, priority: pr, dept_id: el("no-d").value, notes: el("no-n").value } }).then(function (r) {
        if (r.ok) { toast(r.message); openVisit(x.id); } else H().say(el("no-msg"), r.message, "err");
      });
    };
    void b;
  }
  function loadOrders(quiet) {
    var box = el("tab-orders");
    if (!S.orderScope) S.orderScope = can("orders") ? "mine" : "dept";
    if (!quiet) box.innerHTML = '<div class="empty">Loading orders…</div>';
    loadStructure().then(function () {
      api("/hospital/ops/orders?scope=" + S.orderScope + "&status=" + S.orderStatus).then(function (r) {
        if (H().guard(r)) return;
        if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message) + "</div>"; return; }
        var items = r.items, over = items.filter(function (o) { return o.overdue; }).length;
        var groups = {};
        items.forEach(function (o) { var k = S.orderStatus === "open" ? o.kind : "all"; (groups[k] = groups[k] || []).push(o); });
        var h = '<div class="ops-bar"><div class="chips">' + [["mine", can("orders") ? "Ordered by me / mine" : "Assigned to me"], ["dept", "My department"], ["all", "Everything"]].map(function (s) { return '<button type="button" class="chipbtn' + (S.orderScope === s[0] ? " on" : "") + '" data-scope="' + s[0] + '">' + s[1] + "</button>"; }).join("") +
          '<span class="sep"></span>' + [["open", "Open"], ["done", "Finished (3 days)"]].map(function (s) { return '<button type="button" class="chipbtn' + (S.orderStatus === s[0] ? " on" : "") + '" data-status="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>" +
          '<div class="ops-bar-r"><span class="ops-stat"><b>' + items.length + "</b> " + (S.orderStatus === "open" ? "open" : "finished") + "</span>" + (over ? '<span class="ops-stat warn"><b>' + over + "</b> overdue</span>" : "") + (window.QCLab && (can("structure") || can("org")) ? '<button type="button" class="btn btn-sm btn-ghost" data-labset>🧪 Lab settings</button>' : "") + "</div></div>";
        if (!r.can_view_items) h += '<div class="notice wait">Your role sees that orders exist, not what they are.</div>';
        h += items.length ? Object.keys(groups).map(function (k) { return (k !== "all" ? '<div class="ops-h" style="margin:16px 0 8px">' + (KIND_IC[k] || "") + " " + esc((S.structure.order_kinds || {})[k] || k) + " · " + groups[k].length + "</div>" : "") + '<div class="ords">' + groups[k].map(orderRow).join("") + "</div>"; }).join("") :
          '<div class="card ops-empty"><div class="ops-empty-ic">✅</div><h2>' + (S.orderStatus === "open" ? "All clear" : "Nothing finished recently") + '</h2><p class="sub">' + (S.orderStatus === "open" ? "No open orders here. New ones appear automatically." : "") + "</p></div>";
        box.innerHTML = h;
        box.onclick = function (e) {
          if (e.target.closest("[data-labset]")) return window.QCLab.settings();
          var t;
          if ((t = e.target.closest("[data-scope]"))) { S.orderScope = t.getAttribute("data-scope"); loadOrders(); return; }
          if ((t = e.target.closest("[data-status]"))) { S.orderStatus = t.getAttribute("data-status"); loadOrders(); return; }
          if ((t = e.target.closest("[data-oact]"))) orderStep(t.getAttribute("data-id"), t.getAttribute("data-oact"));
        };
      });
    });
    if (!quiet) live(loadOrders, 30000);
  }

  /* =========================================================== shift handover (SBAR) */
  var SB = [["situation", "Situation", "What is going on now"], ["background", "Background", "Relevant history, what has been done"], ["assessment", "Assessment", "What you think is happening"], ["recommendation", "Recommendation", "What the next shift should do, and when"]];
  function handoverCard(hd) {
    return '<div class="hand' + (hd.ack_ts ? "" : " unack") + '"><div class="hand-h"><b>' + esc(hd.patient_name ? hd.patient_name + (hd.bed ? " · bed " + hd.bed : "") : "Ward handover") + '</b><span class="mini">' + esc(hd.author) + " · " + esc(ago(hd.created_ts)) + "</span>" +
      (hd.ack_ts ? '<span class="tag teal">✓ ' + esc(hd.ack_by) + "</span>" : '<button type="button" class="btn btn-sm" data-ack="' + esc(hd.id) + '">Acknowledge</button>') + '</div><div class="sbar">' +
      SB.filter(function (s) { return hd[s[0]]; }).map(function (s) { return '<div><i>' + s[1].charAt(0) + "</i><span>" + esc(hd[s[0]]) + "</span></div>"; }).join("") + "</div></div>";
  }
  function loadHandover(quiet) {
    var box = el("tab-handover");
    if (!quiet) box.innerHTML = '<div class="empty">Loading…</div>';
    Promise.all([loadStructure(), api("/hospital/ops/handover" + (S.ward ? "?ward=" + encodeURIComponent(S.ward) : "")), api("/hospital/ops/inpatients")]).then(function (res) {
      var st = res[0], r = res[1], ip = res[2];
      if (H().guard(r)) return;
      if (!st || !st.wards.length) return unconfigured(box, "Handover");
      var pts = (ip.items || []).filter(function (p) { return p.access_active && (!S.ward || p.ward_id === S.ward); });
      var items = r.items || [];
      var h = '<div class="ops-bar"><div class="chips"><button type="button" class="chipbtn' + (!S.ward ? " on" : "") + '" data-ward="">All wards</button>' + st.wards.filter(function (w) { return w.active; }).map(function (w) { return '<button type="button" class="chipbtn' + (S.ward === w.id ? " on" : "") + '" data-ward="' + esc(w.id) + '">' + esc(w.name) + "</button>"; }).join("") + "</div>" +
        '<div class="ops-bar-r"><span class="ops-stat' + (items.some(function (x) { return !x.ack_ts; }) ? " warn" : "") + '"><b>' + items.filter(function (x) { return !x.ack_ts; }).length + "</b> to acknowledge</span></div></div>";
      h += '<div class="hand-grid">';
      if (can("handover")) h += '<div class="card"><h2>Write a handover</h2><p class="sub">SBAR keeps it short and complete. The next shift acknowledges it.</p><form id="ho-form" novalidate><div class="field"><label for="ho-p">About</label><select class="input" id="ho-p"><option value="">The whole ward' + (S.ward ? "" : " (choose a ward above)") + "</option>" +
        pts.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.patient_name + " · " + (p.ward || "") + " " + (p.bed || "")) + "</option>"; }).join("") + "</select></div>" +
        SB.map(function (s) { return '<div class="field"><label for="ho-' + s[0] + '"><b class="sbl">' + s[1].charAt(0) + "</b> " + s[1] + '</label><textarea class="input" id="ho-' + s[0] + '" rows="2" maxlength="1200" placeholder="' + esc(s[2]) + '"></textarea></div>'; }).join("") +
        '<button class="btn btn-primary" type="submit">Save handover</button><div class="msg" id="ho-msg"></div></form></div>';
      h += '<div><div class="ops-h">Last 36 hours</div>' + (items.length ? items.map(handoverCard).join("") : '<div class="card ops-empty"><div class="ops-empty-ic">🤝</div><h2>No handovers yet</h2></div>') + "</div></div>";
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-ward]"))) { S.ward = t.getAttribute("data-ward"); loadHandover(); return; }
        if ((t = e.target.closest("[data-ack]"))) api("/hospital/ops/handover/" + encodeURIComponent(t.getAttribute("data-ack")) + "/ack", { method: "POST" }).then(function (x) { reply(x, function () { loadHandover(true); }); });
      };
      var f = el("ho-form");
      if (f) f.onsubmit = function (e) {
        e.preventDefault();
        var body = { ward_id: S.ward, encounter_id: el("ho-p").value };
        SB.forEach(function (s) { body[s[0]] = el("ho-" + s[0]).value; });
        if (!body.encounter_id && !body.ward_id) { H().say(el("ho-msg"), "Choose a ward above, or a patient.", "err"); return; }
        api("/hospital/ops/handover", { method: "POST", body: body }).then(function (x) { if (x.ok) { toast(x.message); loadHandover(true); } else H().say(el("ho-msg"), x.message, "err"); });
      };
    });
  }

  /* =========================================================== setup: departments, wards, beds, screens */
  function loadSetup() {
    var box = el("tab-setup");
    box.innerHTML = '<div class="empty">Loading…</div>';
    loadStructure(true).then(function (st) {
      if (!st) return;
      var team = st.team || [];
      var h = window.QCPlan ? '<div id="plan-card"></div>' : "";
      if (!st.departments.length) {
        h += '<div class="card ops-start"><h2>Start from a template</h2><p class="sub">Creates typical departments, wards and numbered beds. Rename, remove or add anything afterwards.</p><div class="ops-choices">' +
          [["hospital", "🏥", "Multi-speciality hospital", "8 departments · 6 wards · 46 beds"], ["nursing_home", "🏨", "Nursing home", "3 departments · 3 wards · 17 beds"], ["clinic", "🩺", "Clinic", "3 departments · day care · 4 beds"]].map(function (t) {
            return '<button type="button" class="ops-choice" data-starter="' + t[0] + '"><span>' + t[1] + "</span><b>" + t[2] + "</b><small>" + t[3] + "</small></button>";
          }).join("") + '</div><p class="mini" style="margin-top:12px">Or add departments one by one below.</p></div>';
      }
      h += '<div class="setup-grid"><div class="card"><div class="card-h"><h2>Departments</h2><button class="btn btn-sm" type="button" data-newdept>+ Add</button></div>' +
        (st.departments.length ? st.departments.map(function (d) {
          return '<div class="srow' + (d.active ? "" : " off") + '"><div class="grow"><b>' + esc(d.name) + '</b> <span class="tag">' + esc(st.dept_kinds[d.kind] || d.kind) + "</span>" + (d.room ? ' <span class="mini">· ' + esc(d.room) + "</span>" : "") +
            '<div class="mini">' + (d.staff_ids.length ? d.staff_ids.map(function (id) { var t = team.filter(function (x) { return x.id === id; })[0]; return t ? esc(t.name) : ""; }).filter(Boolean).join(", ") : "No one assigned") + '</div></div><button class="btn btn-sm btn-ghost" type="button" data-editdept="' + esc(d.id) + '">Edit</button></div>';
        }).join("") : '<div class="mini">No departments yet.</div>') + "</div>";
      h += '<div class="card"><div class="card-h"><h2>Wards and beds</h2><button class="btn btn-sm" type="button" data-newward' + (st.departments.length ? "" : " disabled") + ">+ Add ward</button></div>" +
        (st.wards.length ? st.wards.map(function (w) {
          var occ = w.beds.filter(function (b) { return b.status === "occupied"; }).length;
          return '<div class="srow' + (w.active ? "" : " off") + '"><div class="grow"><b>' + esc(w.name) + '</b> <span class="tag">' + esc(st.ward_kinds[w.kind] || w.kind) + '</span><div class="mini">' + w.beds.length + " beds · " + occ + " occupied" + (w.dept_id ? " · " + esc(deptName(w.dept_id)) : "") + '</div></div><button class="btn btn-sm btn-ghost" type="button" data-addbeds="' + esc(w.id) + '">+ Beds</button><button class="btn btn-sm btn-ghost" type="button" data-editward="' + esc(w.id) + '">Edit</button></div>';
        }).join("") : '<div class="mini">No wards yet.</div>') + "</div>";
      h += '<div class="card"><div class="card-h"><h2>Waiting-room screens</h2><button class="btn btn-sm" type="button" data-newscreen' + (st.departments.length ? "" : " disabled") + '>+ New screen</button></div><p class="sub">Open the link on a TV in the waiting area. It shows token numbers only, never names, and you can switch a screen off at any time.</p>' +
        (st.displays.length ? st.displays.map(function (d) { return '<div class="srow"><div class="grow"><b>' + esc(d.label) + '</b><div class="mini">' + d.dept_ids.map(deptName).filter(Boolean).map(esc).join(", ") + " · since " + esc(H().when(d.created_ts)) + '</div></div><button class="btn btn-sm btn-danger" type="button" data-revoke="' + esc(d.id) + '">Switch off</button></div>'; }).join("") : '<div class="mini">No screens yet.</div>') + "</div>";
      h += '<div class="card"><h2>Who does what</h2><p class="sub">Roles decide what each person can see and do. Change them in <b>Team</b>.</p><div class="roles-tbl">' +
        [["Admin", "Team, departments, wards, screens, the activity log"], ["Doctor", "Charts, orders, admit, discharge, handover"], ["Nurse", "Charts, vitals and notes, nursing tasks, handover"], ["Front desk", "Connect and check in patients, the queue and beds. No clinical data"], ["Lab / radiology", "Test orders for their department, results. No charts"], ["Operations manager", "Command centre, beds, queues, setup. No clinical data"]].map(function (r) { return "<div><b>" + r[0] + "</b><span>" + r[1] + "</span></div>"; }).join("") + "</div></div></div>";
      box.innerHTML = h;
      if (window.QCPlan) window.QCPlan.render(el("plan-card"), st, loadSetup);
      box.onclick = function (e) {
        var t;
        if (e.target.closest("#plan-card")) return;
        if ((t = e.target.closest("[data-starter]"))) { if (!window.confirm("Create the " + t.querySelector("b").textContent + " template?")) return; api("/hospital/ops/starter", { method: "POST", body: { template: t.getAttribute("data-starter") } }).then(function (r) { reply(r, function () { loadSetup(); }); }); return; }
        if (e.target.closest("[data-newdept]")) return editDept(null, st);
        if ((t = e.target.closest("[data-editdept]"))) return editDept(st.departments.filter(function (d) { return d.id === t.getAttribute("data-editdept"); })[0], st);
        if (e.target.closest("[data-newward]")) return editWard(null, st);
        if ((t = e.target.closest("[data-editward]"))) return editWard(st.wards.filter(function (w) { return w.id === t.getAttribute("data-editward"); })[0], st);
        if ((t = e.target.closest("[data-addbeds]"))) { var n = window.prompt("How many beds to add?", "4"); if (!n) return; var pre = window.prompt("Label prefix (optional, e.g. A for A1, A2…)", "") || ""; api("/hospital/ops/wards/" + encodeURIComponent(t.getAttribute("data-addbeds")) + "/beds", { method: "POST", body: { count: parseInt(n, 10), prefix: pre } }).then(function (r) { reply(r, function () { loadSetup(); }); }); return; }
        if (e.target.closest("[data-newscreen]")) return newScreen(st);
        if ((t = e.target.closest("[data-revoke]"))) { if (!window.confirm("Switch this screen off? Its link stops working at once.")) return; api("/hospital/ops/displays/" + encodeURIComponent(t.getAttribute("data-revoke")) + "/revoke", { method: "POST" }).then(function () { loadSetup(); }); }
      };
    });
  }
  function editDept(d, st) {
    var team = (st.team || []).filter(function (t) { return t.status !== "disabled"; });
    var b = modal('<h2 id="ops-title">' + (d ? "Edit department" : "New department") + '</h2><form id="dp-form" novalidate><div class="grid2"><div class="field"><label for="dp-n">Name</label><input class="input" id="dp-n" maxlength="80" value="' + esc(d ? d.name : "") + '"></div>' +
      '<div class="field"><label for="dp-k">Kind</label><select class="input" id="dp-k">' + Object.keys(st.dept_kinds).map(function (k) { return '<option value="' + k + '"' + (d && d.kind === k ? " selected" : "") + ">" + esc(st.dept_kinds[k]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="dp-r">Room / counter</label><input class="input" id="dp-r" maxlength="40" value="' + esc(d ? d.room || "" : "") + '" placeholder="Shown on the waiting-room screen"></div><div class="field"><label for="dp-c">Short code</label><input class="input" id="dp-c" maxlength="8" value="' + esc(d ? d.code || "" : "") + '"></div></div>' +
      (d ? '<div class="lbl">People in this department</div><div class="member-pick">' + team.map(function (t) { return '<label class="scope' + (d.staff_ids.indexOf(t.id) >= 0 ? " on" : "") + '"><input type="checkbox" data-m="' + esc(t.id) + '"' + (d.staff_ids.indexOf(t.id) >= 0 ? " checked" : "") + "><span>" + esc(t.name) + '<br><span class="mini">' + esc(t.roles.join(", ")) + "</span></span></label>"; }).join("") + "</div>" +
        '<label class="hp-check"><input type="checkbox" id="dp-a"' + (d.active ? " checked" : "") + "> <span>Active</span></label>" : "") +
      '<button class="btn btn-primary" type="submit">Save</button><div class="msg" id="dp-msg"></div></form>');
    b.onchange = function (e) { var l = e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); };
    el("dp-form").onsubmit = function (e) {
      e.preventDefault();
      var body = { id: d ? d.id : "", name: el("dp-n").value, kind: el("dp-k").value, room: el("dp-r").value, code: el("dp-c").value };
      if (d) body.active = el("dp-a").checked;
      api("/hospital/ops/departments", { method: "POST", body: body }).then(function (r) {
        if (!r.ok) return H().say(el("dp-msg"), r.message, "err");
        if (!d) { toast("Department added."); closeModal(); loadSetup(); return; }
        var ids = [].map.call(b.querySelectorAll("[data-m]:checked"), function (c) { return c.getAttribute("data-m"); });
        api("/hospital/ops/departments/" + encodeURIComponent(d.id) + "/members", { method: "POST", body: { staff_ids: ids } }).then(function () { toast("Saved."); closeModal(); loadSetup(); });
      });
    };
  }
  function editWard(w, st) {
    modal('<h2 id="ops-title">' + (w ? "Edit ward" : "New ward") + '</h2><form id="wd-form" novalidate><div class="grid2"><div class="field"><label for="wd-n">Name</label><input class="input" id="wd-n" maxlength="80" value="' + esc(w ? w.name : "") + '"></div>' +
      '<div class="field"><label for="wd-k">Kind</label><select class="input" id="wd-k">' + Object.keys(st.ward_kinds).map(function (k) { return '<option value="' + k + '"' + (w && w.kind === k ? " selected" : "") + ">" + esc(st.ward_kinds[k]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="wd-d">Department</label><select class="input" id="wd-d"><option value="">None</option>' + st.departments.map(function (d) { return '<option value="' + esc(d.id) + '"' + (w && w.dept_id === d.id ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("") + "</select></div>" +
      (w ? '<div class="field"><label>&nbsp;</label><label class="hp-check"><input type="checkbox" id="wd-a"' + (w.active ? " checked" : "") + "> <span>Active</span></label></div>" : '<div class="field"><label for="wd-b">Beds to create</label><input class="input" id="wd-b" type="number" min="0" max="120" value="8"></div><div class="field"><label for="wd-p">Bed label prefix</label><input class="input" id="wd-p" maxlength="6" placeholder="e.g. A"></div>') +
      '</div><button class="btn btn-primary" type="submit">Save</button><div class="msg" id="wd-msg"></div></form>');
    el("wd-form").onsubmit = function (e) {
      e.preventDefault();
      var body = { id: w ? w.id : "", name: el("wd-n").value, kind: el("wd-k").value, dept_id: el("wd-d").value };
      if (w) body.active = el("wd-a").checked; else { body.beds = parseInt(el("wd-b").value, 10) || 0; body.prefix = el("wd-p").value; }
      api("/hospital/ops/wards", { method: "POST", body: body }).then(function (r) { if (r.ok) { toast("Saved."); closeModal(); loadSetup(); } else H().say(el("wd-msg"), r.message, "err"); });
    };
  }
  function newScreen(st) {
    var b = modal('<h2 id="ops-title">New waiting-room screen</h2><form id="sc-form" novalidate><div class="field"><label for="sc-l">Name</label><input class="input" id="sc-l" maxlength="60" value="Waiting room"></div><div class="lbl">Departments to show</div><div class="member-pick">' +
      depts(["clinical", "emergency", "diagnostic"]).map(function (d) { return '<label class="scope"><input type="checkbox" data-sd="' + esc(d.id) + '"><span>' + esc(d.name) + "</span></label>"; }).join("") + '</div><button class="btn btn-primary" type="submit">Create link</button><div class="msg" id="sc-msg"></div></form>');
    b.onchange = function (e) { var l = e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); };
    el("sc-form").onsubmit = function (e) {
      e.preventDefault();
      var ids = [].map.call(b.querySelectorAll("[data-sd]:checked"), function (c) { return c.getAttribute("data-sd"); });
      api("/hospital/ops/displays", { method: "POST", body: { label: el("sc-l").value, dept_ids: ids } }).then(function (r) {
        if (!r.ok) return H().say(el("sc-msg"), r.message, "err");
        var link = location.origin + location.pathname.replace(/hospital\/?(index\.html)?$/, "") + "hospital/display/#" + r.item.token;
        b.innerHTML = '<h2 id="ops-title">Screen ready</h2><p class="sub">Open this link on the waiting-room TV. Keep it private: anyone with it sees the token numbers. This is the only time it is shown.</p><div class="secret" style="word-break:break-all">' + esc(link) + '</div><div class="row" style="margin-top:12px"><button class="btn btn-primary" type="button" id="sc-copy">Copy link</button><a class="btn" target="_blank" rel="noopener" href="' + esc(link) + '">Open it</a></div>';
        el("sc-copy").onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast("Copied."); }, function () {}); };
        loadSetup();
      });
    };
  }

  /* =========================================================== registration with hospital.js */
  window.QCOps = {
    tabs: function (canFn) {
      var c = function () { for (var i = 0; i < arguments.length; i++) if (canFn(arguments[i])) return true; return false; };
      return [
        ["queue", "Queue", c("ops", "read"), "flow"],
        ["beds", "Beds", c("ops", "read", "structure"), "flow"],
        ["orders", "Orders", c("ops", "read", "orders", "fulfil"), "flow"],
        ["handover", "Handover", c("handover"), "flow"],
        ["imaging", "Imaging", c("imaging", "read"), "flow"],
        ["setup", "Setup", c("structure"), "admin"],
      ];
    },
    loaders: function () { return { queue: function () { S.tab = "queue"; loadQueue(); }, beds: function () { S.tab = "beds"; loadBeds(); }, orders: function () { S.tab = "orders"; loadOrders(); }, handover: function () { S.tab = "handover"; loadHandover(); }, imaging: function () { S.tab = "imaging"; if (window.QCImaging) window.QCImaging.load(); }, setup: function () { S.tab = "setup"; loadSetup(); } }; },
    leave: function () { clearInterval(S.timer); clearInterval(S.ticker); S.tab = ""; if (window.QCImaging) window.QCImaging.leave(); },
    board: function (box) { board(box); },
    openVisit: function (id) { openVisit(id); },
    checkIn: function (grantId) { checkIn(grantId); },
  };
})();
