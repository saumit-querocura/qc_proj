(function () {
  "use strict";
  var P = QCPage, esc = P.esc, api = P.api;
  function el(id) { return document.getElementById(id); }
  var DATA = null;

  function when(ts) { return new Date(ts * 1000).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  function left(ts) {
    var s = ts - Date.now() / 1000; if (s <= 0) return "ended";
    var h = Math.floor(s / 3600), d = Math.floor(h / 24);
    return d >= 2 ? "ends in " + d + " days" : h >= 1 ? "ends in " + h + " h" : "ends in " + Math.max(1, Math.floor(s / 60)) + " min";
  }
  function scopeBoxes(scopes, chosen, name) {
    return Object.keys(scopes).map(function (k) {
      var on = !chosen || chosen.indexOf(k) >= 0, avail = !chosen || chosen.indexOf(k) >= 0;
      return '<label class="scope' + (on ? " on" : "") + (avail ? "" : " off") + '"><input type="checkbox" data-scope="' + k + '" name="' + name + '"' + (on ? " checked" : "") + (avail ? "" : " disabled") + '><span>' + esc(scopes[k]) + '</span></label>';
    }).join("");
  }
  function profileOptions(profiles) {
    return profiles.map(function (p) { return '<option value="' + esc(p.member_id) + '">' + esc(p.member_id === "me" ? "Me (current profile)" : p.nickname) + '</option>'; }).join("");
  }

  function renderWaiting() {
    var box = el("waiting");
    if (!DATA.requests.length) { box.innerHTML = ""; return; }
    box.innerHTML = DATA.requests.map(function (r) {
      var maxDays = Math.max(1, Math.min(r.days, DATA.max_days));
      var dayOpts = [1, 3, 7, 14, 30, 90].filter(function (d) { return d <= maxDays; });
      if (dayOpts.indexOf(maxDays) < 0) dayOpts.push(maxDays);
      return '<div class="req" data-req="' + esc(r.id) + '">' +
        '<h3>' + esc(r.org_name) + ' <span class="' + (r.verified ? "org-ok" : "org-no") + '">' + (r.verified ? "✓ verified by QueroCura" : "not verified") + '</span></h3>' +
        '<div class="hint">' + esc(r.org_type || "") + (r.city ? " · " + esc(r.city) : "") + ' · asked by ' + esc(r.staff_name) + ' · ' + esc(when(r.created_ts)) + '</div>' +
        '<div class="why">“' + esc(r.purpose) + '”</div>' +
        '<div class="lbl" style="margin-top:10px">They asked to see (untick anything you want to keep private)</div>' +
        '<div class="scopes">' + scopeBoxes(DATA.scopes, r.scopes, "rs-" + r.id) + '</div>' +
        '<div class="grid2">' +
          '<div class="field"><label>Whose information</label><select class="input" data-f="profile">' + profileOptions(DATA.profiles) + '</select></div>' +
          '<div class="field"><label>Keep access for</label><select class="input" data-f="days">' + dayOpts.map(function (d) { return '<option value="' + d + '"' + (d === maxDays ? " selected" : "") + '>' + d + (d === 1 ? " day" : " days") + '</option>'; }).join("") + '</select></div>' +
        '</div>' +
        (r.want_write ? '<label class="scope"><input type="checkbox" data-f="write"><span>Also let them add notes, prescriptions and results to my record</span></label>' : '') +
        '<div class="row" style="margin-top:12px"><button class="btn btn-primary" data-decide="1">Approve</button><button class="btn" data-decide="0">Decline</button></div>' +
        '<div class="msg" role="status"></div></div>';
    }).join("");
  }

  function renderConnected() {
    var box = el("connected");
    if (!DATA.grants.length) { box.innerHTML = '<div class="empty">No hospital is connected. When one asks, you\'ll see the request at the top of this page.</div>'; return; }
    box.innerHTML = DATA.grants.map(function (g) {
      var live = g.state === "active";
      return '<div class="conn"><span class="state ' + (g.emergency ? "emergency" : g.state) + '">' + (g.emergency ? "emergency" : g.state) + '</span>' +
        '<div class="grow"><b>' + esc(g.org_name) + '</b> · ' + esc(g.patient_name || "") +
        '<small>' + g.scopes.map(function (s) { return esc((DATA.scopes[s] || s)); }).join(" · ") + (g.can_write ? " · can add records" : "") + '</small>' +
        '<small>' + esc(g.purpose || "") + ' · ' + (live ? esc(left(g.expires_ts)) : (g.state === "revoked" ? "turned off " + esc(when(g.revoked_ts)) : "ended " + esc(when(g.expires_ts)))) + '</small></div>' +
        (live ? '<button class="btn btn-sm btn-danger" data-revoke="' + esc(g.id) + '">Turn off</button>' : '') + '</div>';
    }).join("");
  }

  function renderRecords() {
    var box = el("records");
    if (!DATA.records.length) { box.innerHTML = '<div class="empty">Nothing yet.</div>'; return; }
    box.innerHTML = DATA.records.map(function (r) {
      return '<div class="rec"><b>' + esc(r.title || r.kind) + '</b> <span class="chip">' + esc(r.kind) + '</span><div class="hint">' + esc(r.org) + ' · ' + esc(r.by || "") + ' · ' + esc(when(r.ts)) + '</div>' +
        (r.text ? '<pre>' + esc(r.text) + '</pre>' : '') + '</div>';
    }).join("");
  }

  var ACTIONS = { request_approved: "approved a request from", request_declined: "declined a request from", access_requested: "asked for access", access_revoked: "turned off access for",
    chart_viewed: "viewed your information", record_added: "added a record", connected_by_code: "connected using your code", connect_code_made: "made a connect code",
    emergency_access_opened: "opened EMERGENCY access", emergency_pref_changed: "changed the emergency-access setting",
    checked_in: "checked you in", called_in: "called you in", consultation_started: "started your consultation", visit_finished: "finished your visit", marked_not_here: "marked you as not here",
    admitted: "admitted you", transferred: "moved you to another bed", discharge_planned: "planned your discharge", discharged: "discharged you", visit_closed: "closed your visit",
    order_placed: "ordered a test or task", order_completed: "completed a test or task", order_cancelled: "cancelled an order", handover_written: "wrote a shift handover about you", visit_viewed: "looked at your visit",
    imaging_study_added: "added a scan to your visit", imaging_study_viewed: "looked at your scan", imaging_ai_requested: "asked an AI to prepare a draft read of your scan",
    imaging_ai_draft_ready: "received an AI draft of your scan (not shown to you until a doctor signs)", imaging_report_signed: "signed your scan report", imaging_addendum: "added a note to your scan report",
    imaging_ai_preference: "changed AI help with your scans" };
  YOU.imaging_ai_preference = 1;
  var YOU = { request_approved: 1, request_declined: 1, access_revoked: 1, connect_code_made: 1, emergency_pref_changed: 1 };
  function renderLog(entries) {
    var box = el("log");
    if (!entries.length) { box.innerHTML = '<div class="empty">No activity yet.</div>'; return; }
    box.innerHTML = entries.slice(0, 60).map(function (e) {
      var phrase = ACTIONS[e.action] || e.action.replace(/_/g, " ");
      var who = YOU[e.action] ? "You " + esc(phrase) + (e.org_name && e.action !== "connect_code_made" && e.action !== "emergency_pref_changed" ? " " + esc(e.org_name) : "")
        : esc(e.org_name || "A hospital") + (e.staff_name ? " (" + esc(e.staff_name) + ")" : "") + " " + esc(phrase);
      var d = e.detail ? ' <span class="hint">· ' + esc(e.detail.replace(/,/g, ", ")) + '</span>' : "";
      return '<div class="act' + (e.emergency ? " emg" : "") + '"><time>' + esc(when(e.ts)) + '</time><span>' + who + d + '</span></div>';
    }).join("");
  }

  /* ---- live hospital visit: where you are in the queue, or which bed you are in ---- */
  var VHI = { "Your visit": "आपकी विज़िट", "Your token": "आपका टोकन", "You're next": "अगली बारी आपकी है", "%n ahead of you": "आपसे पहले %n लोग", "Please go in now": "कृपया अभी अंदर जाएँ", "With the doctor": "डॉक्टर के साथ",
    "Admitted": "भर्ती", "Going home soon": "जल्द घर जाना है", "Finished": "पूरा हुआ", "bed": "बेड", "Updates by itself": "अपने-आप अपडेट होता है", "Room": "कमरा" };
  function V(x) { return (window.QCI18n && QCI18n.lang === "hi" && VHI[x]) || x; }
  var visitTimer = null;
  function renderVisits(list) {
    var box = el("visits"); if (!box) return;
    var open = (list || []).filter(function (v) { return v.status !== "closed"; });
    clearInterval(visitTimer);
    if (!open.length) { box.innerHTML = ""; return; }
    box.innerHTML = open.map(function (v) {
      var big = "", line = "";
      if (v.status === "waiting") { big = v.token ? "#" + v.token : ""; line = v.ahead === 0 ? V("You're next") : V("%n ahead of you").replace("%n", v.ahead); }
      else if (v.status === "called") { big = v.token ? "#" + v.token : ""; line = V("Please go in now") + (v.room ? " · " + v.room : ""); }
      else if (v.status === "in_consult") { line = V("With the doctor"); }
      else if (v.status === "admitted" || v.status === "discharge_planned") { big = v.bed || ""; line = (v.status === "admitted" ? V("Admitted") : V("Going home soon")) + (v.ward ? " · " + v.ward : ""); }
      return '<div class="visit-card' + (v.status === "called" ? " called" : "") + '"><div class="visit-l"><span class="visit-k">🏥 ' + esc(V("Your visit")) + " · " + esc(v.org) + '</span><b>' + esc(v.dept || v.kind || "") + "</b>" +
        '<span class="visit-s">' + esc(line) + (v.room && v.status === "waiting" ? " · " + esc(V("Room")) + " " + esc(v.room) : "") + '</span><span class="visit-u">' + esc(V("Updates by itself")) + "</span></div>" +
        (big ? '<div class="visit-big"><small>' + esc(v.status === "admitted" || v.status === "discharge_planned" ? V("bed") : V("Your token")) + "</small>" + esc(big) + "</div>" : "") + "</div>";
    }).join("");
    visitTimer = setInterval(function () { if (!document.hidden) api("/care/visits").then(function (r) { if (r && r.ok) renderVisits(r.visits); }); }, 20000);
  }

  function load() {
    return api("/care/overview").then(function (d) {
      if (!d.ok) return;
      DATA = d;
      renderVisits(d.visits);
      renderWaiting(); renderConnected(); renderRecords();
      el("emergency").checked = !!d.emergency_opt_in;
      if (el("ai-imaging")) el("ai-imaging").checked = d.ai_imaging_allowed !== false;
      el("code-profile").innerHTML = profileOptions(d.profiles);
      el("code-scopes").innerHTML = scopeBoxes(d.scopes, ["summary", "vitals", "medicines", "labs"], "cs");
      return api("/care/log");
    }).then(function (l) { if (l && l.ok) renderLog(l.entries); });
  }

  document.addEventListener("change", function (e) {
    var l = e.target.closest && e.target.closest(".scope"); if (l && !l.classList.contains("off")) l.classList.toggle("on", e.target.checked);
  });

  el("waiting").addEventListener("click", function (e) {
    var b = e.target.closest("[data-decide]"); if (!b) return;
    var card = b.closest("[data-req]"), msg = card.querySelector(".msg"), approve = b.getAttribute("data-decide") === "1";
    var scopes = [].slice.call(card.querySelectorAll("[data-scope]:checked")).map(function (c) { return c.getAttribute("data-scope"); });
    if (approve && !scopes.length) { msg.className = "msg err"; msg.textContent = "Tick at least one thing to share, or decline."; return; }
    card.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
    api("/care/requests/" + encodeURIComponent(card.getAttribute("data-req")) + "/decide", { method: "POST", body: {
      approve: approve, scopes: scopes, days: +card.querySelector('[data-f="days"]').value, profile: card.querySelector('[data-f="profile"]').value,
      allow_write: !!(card.querySelector('[data-f="write"]') || {}).checked } }).then(function (r) {
      if (r.ok) { P.toast(r.message || "Done"); load(); }
      else { msg.className = "msg err"; msg.textContent = r.message || "Something went wrong."; card.querySelectorAll("button").forEach(function (x) { x.disabled = false; }); }
    });
  });

  el("connected").addEventListener("click", function (e) {
    var b = e.target.closest("[data-revoke]"); if (!b) return;
    b.disabled = true;
    api("/care/grants/" + encodeURIComponent(b.getAttribute("data-revoke")) + "/revoke", { method: "POST" }).then(function (r) {
      P.toast(r.message || "Done", r.ok ? "" : "err"); load();
    });
  });

  el("make-code").addEventListener("click", function () {
    var btn = this, msg = el("code-msg");
    var scopes = [].slice.call(el("code-scopes").querySelectorAll("[data-scope]:checked")).map(function (c) { return c.getAttribute("data-scope"); });
    if (!scopes.length) { msg.className = "msg err"; msg.textContent = "Tick at least one thing to share."; return; }
    btn.disabled = true; msg.className = "msg"; msg.textContent = "";
    api("/care/connect-code", { method: "POST", body: { profile: el("code-profile").value, scopes: scopes, days: +el("code-days").value, allow_write: el("code-write").checked } }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) { msg.className = "msg err"; msg.textContent = r.message || "Couldn't make a code."; return; }
      el("code-text").textContent = r.code; el("code-out").hidden = false;
      load();
    });
  });
  el("code-write").addEventListener("change", function () { this.closest(".scope").classList.toggle("on", this.checked); });

  el("emergency").addEventListener("change", function () {
    var on = this.checked, msg = el("em-msg"), box = this;
    api("/care/emergency", { method: "POST", body: { enabled: on } }).then(function (r) {
      if (r.ok) { msg.className = "msg ok"; msg.textContent = on ? "Emergency access is on." : "Emergency access is off."; load(); }
      else { box.checked = !on; msg.className = "msg err"; msg.textContent = r.message || "Couldn't change that."; }
    });
  });

  el("ai-imaging").addEventListener("change", function () {
    var on = this.checked, msg = el("ai-msg"), box = this;
    api("/care/ai-imaging", { method: "POST", body: { allowed: on } }).then(function (r) {
      if (r.ok) { msg.className = "msg ok"; msg.textContent = on ? "Hospitals may use AI to help read your scans." : "Hospitals will read your scans without AI."; load(); }
      else { box.checked = !on; msg.className = "msg err"; msg.textContent = r.message || "Couldn't change that."; }
    });
  });

  P.init().then(function (me) { if (me && me.logged_in) load(); });
})();
