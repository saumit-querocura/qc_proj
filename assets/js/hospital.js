(function () {
  "use strict";
  var P = QCPage, esc = P.esc, api = P.api;
  function el(id) { return document.getElementById(id); }
  function show(node, on) { if (node) node.hidden = !on; }
  function say(node, text, kind) { node.className = "msg" + (kind ? " " + kind : ""); node.textContent = text || ""; }
  function when(ts) { return ts ? new Date(ts * 1000).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function left(ts) {
    var s = ts - Date.now() / 1000; if (s <= 0) return "ended";
    var h = Math.floor(s / 3600), d = Math.floor(h / 24);
    return d >= 2 ? "ends in " + d + " days" : h >= 1 ? "ends in " + h + " h" : "ends in " + Math.max(1, Math.floor(s / 60)) + " min";
  }
  function initials(name) { return (name || "?").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join(""); }

  var OPTS = null, ME = null, PERMS = [], IDLE_MS = 20 * 60 * 1000, lastActive = Date.now(), tabNow = "patients", FILTER = "active", ROSTER = [];
  function can(p) { return PERMS.indexOf(p) >= 0; }

  /* ===================================================== public side ===================================================== */
  function loadOptions() {
    return api("/hospital/options").then(function (d) {
      if (!d.ok) return; OPTS = d;
      el("a-type").innerHTML = d.org_types.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
    });
  }

  el("apply-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = el("apply-msg"), btn = el("apply-go");
    var body = {
      org_name: el("a-org").value.trim(), org_type: el("a-type").value, registration_no: el("a-reg").value.trim(), abdm_facility_id: el("a-abdm").value.trim(),
      city: el("a-city").value.trim(), state: el("a-state").value.trim(), phone: el("a-phone").value.trim(), website: el("a-web").value.trim(),
      admin_name: el("a-name").value.trim(), email: el("a-email").value.trim(), password: el("a-pw").value, is_clinician: el("a-clin").checked,
      accept_terms: el("a-terms").checked, website_url: el("a-site").value
    };
    if (body.org_name.length < 3 || body.admin_name.length < 2) return say(msg, "Please add the organisation's name and your name.", "err");
    if (body.registration_no.length < 3) return say(msg, "A registration or licence number is needed so we can verify you.", "err");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return say(msg, "Please enter a valid work e-mail.", "err");
    if (body.password.length < 8) return say(msg, "Please use at least 8 characters for the password.", "err");
    if (body.password !== el("a-pw2").value) return say(msg, "The two passwords don't match.", "err");
    if (!body.accept_terms) return say(msg, "Please tick the confirmation at the bottom.", "err");
    btn.disabled = true; say(msg, "Sending your application…");
    api("/hospital/register", { method: "POST", body: body }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return say(msg, r.message || "Something went wrong. Please try again.", "err");
      say(msg, r.message, "ok"); P.confetti(["🏥", "✨", "💚", "🩺"], 22);
      el("s-email").value = body.email; el("s-pw").focus();
      el("signin").scrollIntoView({ behavior: "smooth" });
    });
  });

  var pendingCode = false;
  el("signin-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = el("signin-msg"), btn = el("signin-go");
    btn.disabled = true; say(msg, "");
    api("/hospital/login", { method: "POST", body: { email: el("s-email").value.trim(), password: el("s-pw").value, code: el("s-code").value.trim() } }).then(function (r) {
      btn.disabled = false;
      if (r.ok) { el("s-pw").value = ""; el("s-code").value = ""; return enterPortal(); }
      if (r.mfa_required) { show(el("s-code-wrap"), true); el("s-code").focus(); pendingCode = true; }
      say(msg, r.message || "That didn't work.", "err");
    });
  });

  function swapForm(which) {
    ["signin-form", "forgot-form", "invite-form", "reset-form"].forEach(function (id) { show(el(id), id === which); });
    var titles = { "signin-form": ["Hospital sign in", "For approved and pending organisations."], "forgot-form": ["Reset your password", "We'll e-mail you a one-time link."],
      "invite-form": ["Join your team", "Create a password to accept the invitation."], "reset-form": ["Choose a new password", "This signs you out everywhere else."] };
    el("signin-title").textContent = titles[which][0]; el("signin-sub").textContent = titles[which][1];
  }
  el("forgot-link").addEventListener("click", function (e) { e.preventDefault(); swapForm("forgot-form"); el("f-email").value = el("s-email").value; el("f-email").focus(); });
  el("forgot-back").addEventListener("click", function () { swapForm("signin-form"); });
  el("forgot-form").addEventListener("submit", function (e) {
    e.preventDefault(); var msg = el("forgot-msg");
    api("/hospital/forgot", { method: "POST", body: { email: el("f-email").value.trim() } }).then(function (r) {
      say(msg, r.message || "If that e-mail has an account, a link is on its way.", "ok");
      if (r.dev_link) { var a = document.createElement("a"); a.href = "#reset=" + r.dev_link.split("#reset=")[1]; a.textContent = " Development: open the link"; msg.appendChild(a); a.addEventListener("click", function () { setTimeout(readFragment, 0); }); }
    });
  });

  var TOKEN = "";
  function readFragment() {
    var h = (location.hash || "").replace(/^#/, "");
    var m = /^(invite|reset)=([\w\-]{20,200})$/.exec(h);
    if (!m) return;
    TOKEN = m[2];
    try { history.replaceState(null, "", location.pathname + "#signin"); } catch (e) {}
    if (m[1] === "invite") {
      api("/hospital/invite/preview", { method: "POST", body: { token: TOKEN } }).then(function (r) {
        if (!r.ok || !r.invite) { swapForm("signin-form"); say(el("signin-msg"), "This invitation has expired or was already used. Ask your administrator for a new one.", "err"); return; }
        el("invite-who").innerHTML = "<b>" + esc(r.invite.name) + "</b>, you've been invited to <b>" + esc(r.invite.org) + "</b> as " + esc(r.invite.roles.join(", ")) + ".";
        swapForm("invite-form");
      });
    } else swapForm("reset-form");
    el("signin").scrollIntoView();
  }
  el("invite-form").addEventListener("submit", function (e) {
    e.preventDefault(); var msg = el("invite-msg");
    api("/hospital/invite/accept", { method: "POST", body: { token: TOKEN, password: el("i-pw").value } }).then(function (r) {
      if (r.ok) { swapForm("signin-form"); say(el("signin-msg"), r.message, "ok"); el("s-pw").focus(); } else say(msg, r.message || "That didn't work.", "err");
    });
  });
  el("reset-form").addEventListener("submit", function (e) {
    e.preventDefault(); var msg = el("reset-msg");
    api("/hospital/reset", { method: "POST", body: { token: TOKEN, password: el("r-pw").value } }).then(function (r) {
      if (r.ok) { swapForm("signin-form"); say(el("signin-msg"), r.message, "ok"); } else say(msg, r.message || "That didn't work.", "err");
    });
  });

  /* ===================================================== signed in ===================================================== */
  function enterPortal() {
    return api("/hospital/me").then(function (r) {
      if (!r.ok) { goPublic(); return; }
      ME = r; PERMS = r.perms || []; IDLE_MS = (r.idle_seconds || 1200) * 1000; lastActive = Date.now();
      show(el("public"), false); show(el("portal"), true); show(el("pub-nav"), false); show(el("app-nav"), true);
      el("who").textContent = r.staff.name + " · " + r.staff.roles.join(", ");
      render();
    });
  }
  function goPublic(message) {
    ME = null; PERMS = [];
    show(el("public"), true); show(el("portal"), false); show(el("pub-nav"), true); show(el("app-nav"), false);
    if (message) { say(el("signin-msg"), message, "err"); }
  }

  el("signout").addEventListener("click", function () {
    api("/hospital/logout", { method: "POST" }).then(function () { goPublic(); location.hash = "#signin"; });
  });

  // 20 idle minutes: sign out. (The server enforces this too; this keeps the screen honest.)
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(function (t) { document.addEventListener(t, function () { lastActive = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (!ME) return;
    var rem = IDLE_MS - (Date.now() - lastActive);
    if (rem <= 0) { api("/hospital/logout", { method: "POST" }); closeAll(); goPublic("You were signed out after 20 minutes of inactivity."); return; }
    el("idle").textContent = rem < 5 * 60 * 1000 ? "Signing out in " + Math.floor(rem / 60000) + ":" + ("0" + Math.floor(rem / 1000 % 60)).slice(-2) : "";
  }, 1000);
  function closeAll() { P.closeModal("chart-modal"); P.closeModal("record-modal"); el("chart-body").innerHTML = ""; }

  // Any API reply that says the session ended sends us back to sign-in.
  function guard(r) {
    if (r && (r.status === 401) && ME) { closeAll(); goPublic(r.message || "Please sign in again."); return true; }
    if (r && r.status === 403 && r.code === "mfa_setup") { render(); return true; }
    return false;
  }

  function render() {
    var org = ME.org, staff = ME.staff;
    show(el("workspace"), false); show(el("mfa-setup"), false);
    var banner = el("banner"); banner.innerHTML = "";
    if (ME.mfa_setup_needed) { renderMfaSetup(); return; }
    show(el("workspace"), true);
    el("org-name").textContent = org.name;
    el("org-meta").textContent = [org.org_type, org.city, org.state].filter(Boolean).join(" · ") + (org.registration_no ? " · Reg. " + org.registration_no : "");
    el("org-status").innerHTML = org.status === "active" ? '<span class="pill ok">✓ Verified by QueroCura</span>' : org.status === "pending" ? '<span class="pill wait">⏳ Verification pending</span>' : '<span class="pill bad">' + esc(org.status) + '</span>';
    if (org.status === "pending") banner.innerHTML = '<div class="notice wait">Thanks for applying. Our team is verifying <b>' + esc(org.name) + '</b> (registration ' + esc(org.registration_no || "") + '). You can set up your team and security now. Patient connections switch on as soon as you\'re approved, and we\'ll e-mail you.</div>';
    if (org.status === "rejected" || org.status === "suspended") banner.innerHTML = '<div class="notice bad">This organisation isn\'t active. ' + esc(org.review_note || "Please contact QueroCura support.") + '</div>';
    var tabs = [["patients", "Patients", can("roster")], ["connect", "Connect", can("request")], ["team", "Team", can("team")], ["activity", "Activity log", can("audit")], ["security", "My security", true]].filter(function (t) { return t[2]; });
    if (!tabs.some(function (t) { return t[0] === tabNow; })) tabNow = tabs[0][0];
    el("tabs").innerHTML = tabs.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" class="' + (t[0] === tabNow ? "on" : "") + '">' + t[1] + '</button>'; }).join("");
    switchTab(tabNow);
  }
  el("tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) { tabNow = b.getAttribute("data-tab"); [].forEach.call(el("tabs").children, function (c) { c.classList.toggle("on", c === b); }); switchTab(tabNow); } });
  function switchTab(t) {
    ["patients", "connect", "team", "activity", "security"].forEach(function (x) { show(el("tab-" + x), x === t); });
    ({ patients: loadPatients, connect: renderConnect, team: loadTeam, activity: loadActivity, security: renderSecurity })[t]();
  }

  /* ---------- MFA setup (required before any patient data) ---------- */
  function renderMfaSetup() {
    var box = el("mfa-setup"); show(box, true);
    box.innerHTML = '<div class="card" style="max-width:640px;margin:20px auto"><h2>One more step: turn on two-step sign-in</h2><p class="sub">Patient information needs more than a password. Use any authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password).</p><div id="mfa-box"><div class="empty">Loading…</div></div></div>';
    api("/hospital/mfa/start", { method: "POST" }).then(function (r) {
      var b = el("mfa-box");
      if (!r.ok) { b.innerHTML = '<div class="msg err">' + esc(r.message || "Couldn't start setup.") + '</div>'; return; }
      b.innerHTML = '<div class="row" style="align-items:flex-start;gap:20px"><div class="qr" id="qr"></div><div style="flex:1 1 240px"><p class="hint" style="margin-top:0">Scan the picture, or type this key into your app:</p><div class="secret">' + esc(r.secret.replace(/(.{4})/g, "$1 ").trim()) + '</div>' +
        '<form id="mfa-form"><div class="field"><label for="mfa-code">Then enter the 6-digit code it shows</label><input class="input" id="mfa-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div><button class="btn btn-primary" type="submit">Turn on</button><div class="msg" id="mfa-msg" role="status"></div></form></div></div>';
      fetch(P.API + "/hospital/mfa/qr.svg", { credentials: "include" }).then(function (x) { return x.ok ? x.blob() : null; }).then(function (blob) {
        if (!blob) return; var img = new Image(); img.alt = "Authenticator QR code"; img.src = URL.createObjectURL(blob); el("qr").appendChild(img);
      }).catch(function () {});
      el("mfa-form").addEventListener("submit", function (e) {
        e.preventDefault(); var msg = el("mfa-msg");
        api("/hospital/mfa/confirm", { method: "POST", body: { code: el("mfa-code").value.trim() } }).then(function (c) {
          if (!c.ok) return say(msg, c.message || "That code didn't match.", "err");
          b.innerHTML = '<h3>Save your recovery codes</h3><p class="sub">If you lose your phone, each of these works once. Keep them somewhere safe (not on the same phone). They won\'t be shown again.</p><div class="codes">' +
            c.recovery_codes.map(function (x) { return "<code>" + esc(x) + "</code>"; }).join("") + '</div><div class="row"><button class="btn" id="print-codes" type="button">Print</button><button class="btn btn-primary" id="mfa-done" type="button">I\'ve saved them, continue</button></div>';
          el("print-codes").addEventListener("click", function () { window.print(); });
          el("mfa-done").addEventListener("click", function () { enterPortal(); });
        });
      });
    });
  }

  /* ---------- patients ---------- */
  function stateOf(i) { return i.kind === "request" ? "waiting" : i.state; }
  function loadPatients() {
    var box = el("tab-patients");
    box.innerHTML = '<div class="empty">Loading…</div>';
    api("/hospital/roster").then(function (r) {
      if (guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message || "Couldn't load.") + '</div>'; return; }
      ROSTER = r.items; drawRoster();
    });
  }
  function drawRoster() {
    var box = el("tab-patients");
    var counts = { active: 0, waiting: 0, ended: 0 };
    ROSTER.forEach(function (i) { var s = stateOf(i); counts[s === "active" ? "active" : s === "waiting" ? "waiting" : "ended"]++; });
    var rows = ROSTER.filter(function (i) { var s = stateOf(i); return FILTER === "ended" ? (s === "expired" || s === "revoked") : s === FILTER; });
    var html = '<div class="filters">' + [["active", "Connected"], ["waiting", "Waiting for patient"], ["ended", "Ended"]].map(function (f) { return '<button type="button" class="chipbtn' + (FILTER === f[0] ? " on" : "") + '" data-filter="' + f[0] + '">' + f[1] + " (" + counts[f[0]] + ")</button>"; }).join("") +
      '<span class="grow"></span>' + (can("request") ? '<button class="btn btn-sm btn-primary" type="button" data-goto="connect">+ Connect a patient</button>' : "") + '</div>';
    if (!rows.length) html += '<div class="card"><div class="empty">' + (FILTER === "active" ? "No connected patients yet. Use <b>Connect</b> to enter a patient's code or send them a request." : FILTER === "waiting" ? "No requests are waiting." : "Nothing here.") + '</div></div>';
    html += rows.map(function (i) {
      var s = stateOf(i), live = s === "active";
      var tags = (i.scopes || []).map(function (x) { return '<span class="tag">' + esc((OPTS && OPTS.scopes[x]) || x) + '</span>'; }).join("");
      if (i.via === "emergency") tags = '<span class="tag emg">EMERGENCY ACCESS</span>' + tags;
      if (i.can_write) tags += '<span class="tag teal">can add records</span>';
      return '<div class="pt"><div class="avatar">' + esc(initials(i.patient_name)) + '</div><div class="grow"><h3>' + esc(i.patient_name || "Patient") + (i.reference ? ' <span class="mini">· ' + esc(i.reference) + '</span>' : "") + '</h3>' +
        '<small>' + esc(i.purpose || "") + '</small><small>' + (s === "waiting" ? "Requested " + esc(when(i.created_ts)) : live ? esc(left(i.expires_ts)) + " · " + esc(i.via === "code" ? "connected with patient's code" : i.via === "request" ? "approved by patient" : "emergency") : s === "revoked" ? "Turned off by the patient " + esc(when(i.revoked_ts)) : "Ended " + esc(when(i.expires_ts))) + '</small><div class="tagrow">' + tags + '</div></div>' +
        '<div class="row-actions">' + (live && can("read") ? '<button class="btn btn-sm btn-primary" data-chart="' + esc(i.id) + '" type="button">Open chart</button>' : "") +
        (live && i.can_write && (can("write") || can("write_basic")) ? '<button class="btn btn-sm" data-add="' + esc(i.id) + '" data-name="' + esc(i.patient_name || "") + '" type="button">Add record</button>' : "") + '</div></div>';
    }).join("");
    box.innerHTML = html;
  }
  el("tab-patients").addEventListener("click", function (e) {
    var f = e.target.closest("[data-filter]"); if (f) { FILTER = f.getAttribute("data-filter"); drawRoster(); return; }
    var g = e.target.closest("[data-goto]"); if (g) { tabNow = g.getAttribute("data-goto"); render(); return; }
    var c = e.target.closest("[data-chart]"); if (c) { openChart(c.getAttribute("data-chart")); return; }
    var a = e.target.closest("[data-add]"); if (a) openRecord(a.getAttribute("data-add"), a.getAttribute("data-name"));
  });

  /* ---------- chart ---------- */
  function list(arr, empty) { return arr && arr.length ? arr.map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join(" ") : '<span class="mini">' + (empty || "None recorded") + '</span>'; }
  function openChart(grantId) {
    var body = el("chart-body"); body.innerHTML = '<div class="empty">Opening chart…</div>'; P.openModal("chart-modal");
    api("/hospital/grants/" + encodeURIComponent(grantId) + "/chart").then(function (r) {
      if (guard(r)) return;
      if (!r.ok) { body.innerHTML = '<h2>Can\'t open this chart</h2><div class="msg err">' + esc(r.message || "Access ended.") + '</div>'; return; }
      var d = r.data, p = d.patient || {}, g = d.grant || {}, h = "";
      h += '<div class="ch-head"><div class="avatar" style="width:54px;height:54px;font-size:18px">' + esc(initials(p.name)) + '</div><div><h2 id="chart-title">' + esc(p.name || "Patient") + '</h2><div class="hint">' + [p.age ? p.age + " yrs" : "", p.sex && p.sex !== "unknown" ? p.sex : "", p.blood_type && p.blood_type !== "unknown" ? "Blood " + p.blood_type : ""].filter(Boolean).map(esc).join(" · ") + '</div></div></div>';
      h += '<div class="notice wait no-print" style="margin-bottom:12px">Shared by the patient · ' + esc(left(g.expires_ts)) + ' · this view is recorded in the audit log.' + (g.via === "emergency" ? ' <b>Emergency access.</b>' : "") + '</div>';
      if (d.summary) {
        var s = d.summary;
        h += '<div class="ch-box"><h4>Allergies &amp; conditions</h4><div style="margin-bottom:8px"><b class="mini">Medicine allergies</b><br>' + list(s.medicine_allergies, "None recorded") + '</div><div style="margin-bottom:8px"><b class="mini">Other allergies</b><br>' + list(s.other_allergies) + '</div><div style="margin-bottom:8px"><b class="mini">Conditions</b><br>' + list(s.conditions) + '</div>' +
          (s.past_conditions && s.past_conditions.length ? '<div style="margin-bottom:8px"><b class="mini">Past conditions</b><br>' + list(s.past_conditions) + '</div>' : "") +
          (s.family_history && s.family_history.length ? '<div><b class="mini">Family history</b><br>' + list(s.family_history) + '</div>' : "") + (s.pregnant ? '<div style="margin-top:8px"><span class="tag emg">Pregnant</span></div>' : "") + '</div>';
      }
      if (d.medicines) h += '<div class="ch-box"><h4>Current medicines</h4>' + (d.medicines.length ? '<div class="scroll-x"><table class="t"><thead><tr><th>Medicine</th><th>Dose</th><th>Schedule</th></tr></thead><tbody>' + d.medicines.map(function (m) { return "<tr><td>" + esc(m.name) + "</td><td>" + esc(m.dose || "") + "</td><td>" + esc(m.schedule || "") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<span class="mini">None on file</span>') + '</div>';
      if (d.vitals) {
        var L = d.vitals.latest || {}, names = [["sys_bp", "Systolic", "mmHg"], ["dia_bp", "Diastolic", "mmHg"], ["pulse", "Pulse", "bpm"], ["spo2", "SpO₂", "%"], ["temp", "Temp", "°"], ["glucose", "Glucose", "mg/dL"], ["weight", "Weight", "kg"]];
        h += '<div class="ch-box"><h4>Latest vitals' + (L.ts ? " · " + esc(L.ts) : "") + '</h4><div class="vit">' + names.filter(function (n) { return L[n[0]] != null; }).map(function (n) { return "<div><b>" + esc(L[n[0]]) + "</b><span>" + n[1] + " " + n[2] + "</span></div>"; }).join("") + '</div>' +
          (d.vitals.flags || []).map(function (f) { return '<div class="flag"><b>' + esc(f.title) + "</b> " + esc(f.message) + "</div>"; }).join("") +
          ((d.vitals.history || []).length > 1 ? '<div class="scroll-x" style="margin-top:10px"><table class="t"><thead><tr><th>When</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Glucose</th><th>Weight</th></tr></thead><tbody>' + d.vitals.history.slice(0, 10).map(function (v) { return "<tr><td>" + esc(v.ts) + "</td><td>" + (v.sys_bp ? esc(v.sys_bp + "/" + v.dia_bp) : "–") + "</td><td>" + esc(v.pulse || "–") + "</td><td>" + esc(v.spo2 || "–") + "</td><td>" + esc(v.glucose || "–") + "</td><td>" + esc(v.weight || "–") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") + '</div>';
      }
      if (d.labs) h += '<div class="ch-box"><h4>Lab results (confirmed by the patient)</h4>' + (d.labs.headline ? '<p style="margin:0 0 8px;font-weight:700">' + esc(d.labs.headline) + '</p>' : "") + ((d.labs.panels || []).length ? d.labs.panels.map(function (pn) { return '<div style="margin-bottom:10px"><b>' + esc(pn.name) + '</b><div class="scroll-x"><table class="t"><tbody>' + pn.markers.map(function (m) { return "<tr><td>" + esc(m.name) + "</td><td><b>" + esc(m.value == null ? "" : m.value) + "</b> " + esc(m.unit || "") + "</td><td>" + esc(m.range || "") + "</td><td>" + esc(m.status || "") + "</td><td>" + esc(m.date || "") + "</td></tr>"; }).join("") + "</tbody></table></div></div>"; }).join("") : '<span class="mini">No confirmed results</span>') + '</div>';
      if (d.imaging) h += '<div class="ch-box"><h4>Scan reports</h4>' + (d.imaging.length ? d.imaging.map(function (x) { return "<p style='margin:0 0 8px'><b>" + esc(x.modality || "Scan") + "</b> " + esc(x.date || "") + "<br>" + esc(x.summary || x.overall || "") + "</p>"; }).join("") : '<span class="mini">None on file</span>') + '</div>';
      if (d.symptoms) h += '<div class="ch-box"><h4>Recent symptom checks</h4>' + (d.symptoms.length ? d.symptoms.map(function (x) { return "<div>" + esc(x.ts) + " · " + esc(x.condition || "") + (x.triage ? ' <span class="chip">' + esc(x.triage) + "</span>" : "") + "</div>"; }).join("") : '<span class="mini">None</span>') + '</div>';
      if (d.records && d.records.length) h += '<div class="ch-box"><h4>Added by your team</h4>' + d.records.map(function (x) { return '<div style="margin-bottom:10px"><b>' + esc(x.title) + '</b> <span class="chip">' + esc(x.kind) + '</span> <span class="mini">' + esc(x.by || "") + " · " + esc(when(x.ts)) + '</span><div style="white-space:pre-wrap;margin-top:4px">' + esc(x.text) + "</div></div>"; }).join("") + '</div>';
      h += '<p class="mini">' + esc(d.disclaimer || "") + '</p><div class="row no-print"><button class="btn" id="print-chart" type="button">Print</button>' + (g.can_write && (can("write") || can("write_basic")) ? '<button class="btn btn-primary" id="chart-add" type="button">Add a record</button>' : "") + '</div>';
      body.innerHTML = h;
      var pr = el("print-chart"); if (pr) pr.addEventListener("click", function () { window.print(); });
      var ad = el("chart-add"); if (ad) ad.addEventListener("click", function () { P.closeModal("chart-modal"); openRecord(grantId, p.name); });
    });
  }

  function openRecord(grantId, name) {
    var kinds = can("write") ? Object.keys(OPTS.record_kinds) : ["note", "vital"];
    el("record-body").innerHTML = '<h2>Add to ' + esc(name || "the patient") + '\'s record</h2><p class="sub">The patient sees this in their app. It is encrypted and recorded in the audit log.</p>' +
      '<form id="rec-form" novalidate><div class="field"><label for="rec-kind">What are you adding?</label><select class="input" id="rec-kind">' + kinds.map(function (k) { return '<option value="' + k + '">' + esc(OPTS.record_kinds[k]) + "</option>"; }).join("") + '</select></div>' +
      '<div class="field"><label for="rec-title">Title</label><input class="input" id="rec-title" maxlength="120" placeholder="e.g. OPD visit"></div>' +
      '<div id="rec-vitals" hidden><div class="grid2">' + [["sys_bp", "Systolic (mmHg)"], ["dia_bp", "Diastolic (mmHg)"], ["pulse", "Pulse (bpm)"], ["spo2", "SpO₂ (%)"], ["temp", "Temperature"], ["glucose", "Glucose (mg/dL)"], ["weight", "Weight (kg)"]].map(function (v) { return '<div class="field"><label>' + v[1] + '</label><input class="input" data-vital="' + v[0] + '" inputmode="decimal"></div>'; }).join("") + '</div></div>' +
      '<div class="field"><label for="rec-text">Details</label><textarea class="input" id="rec-text" rows="5" maxlength="6000"></textarea></div><button class="btn btn-primary" type="submit">Save to record</button><div class="msg" id="rec-msg" role="status"></div></form>';
    P.openModal("record-modal");
    var kind = el("rec-kind"); kind.addEventListener("change", function () { show(el("rec-vitals"), kind.value === "vital"); }); show(el("rec-vitals"), kind.value === "vital");
    el("rec-form").addEventListener("submit", function (e) {
      e.preventDefault(); var msg = el("rec-msg"), vitals = {};
      [].forEach.call(document.querySelectorAll("[data-vital]"), function (i) { if (i.value.trim() !== "") vitals[i.getAttribute("data-vital")] = parseFloat(i.value); });
      api("/hospital/grants/" + encodeURIComponent(grantId) + "/records", { method: "POST", body: { kind: kind.value, title: el("rec-title").value, text: el("rec-text").value, vitals: kind.value === "vital" ? vitals : undefined } }).then(function (r) {
        if (guard(r)) return;
        if (r.ok) { P.toast(r.message); P.closeModal("record-modal"); } else say(msg, r.message || "Couldn't save.", "err");
      });
    });
  }

  /* ---------- connect ---------- */
  function scopeBoxes(prefix, checked) {
    return Object.keys(OPTS.scopes).map(function (k) { var on = checked.indexOf(k) >= 0; return '<label class="scope' + (on ? " on" : "") + '"><input type="checkbox" data-scope="' + k + '"' + (on ? " checked" : "") + '><span>' + esc(OPTS.scopes[k]) + "</span></label>"; }).join("");
  }
  function renderConnect() {
    var box = el("tab-connect"), active = ME.org.status === "active";
    var h = '';
    if (!active) h += '<div class="notice wait">Patient connections unlock once QueroCura has verified your organisation.</div>';
    h += '<div class="three"><div class="card"><h2>The patient gave you a code</h2><p class="sub">Patients make a one-time code in their app (Care teams). Type it here to connect straight away.</p>' +
      '<form id="code-form" novalidate><div class="field"><label for="c-code">Patient code</label><input class="input" id="c-code" maxlength="12" autocomplete="off" placeholder="ABCD-2345" style="font:800 20px \'Space Grotesk\',sans-serif;letter-spacing:.12em;text-transform:uppercase"></div>' +
      '<div class="field"><label for="c-ref">Your reference (MRN, optional)</label><input class="input" id="c-ref" maxlength="80"></div><button class="btn btn-primary" type="submit"' + (active ? "" : " disabled") + '>Connect</button><div class="msg" id="c-msg" role="status"></div></form></div>' +
      '<div class="card"><h2>Send an access request</h2><p class="sub">The patient sees it under Care teams and decides. They can narrow what you see.</p>' +
      '<form id="req-form" novalidate><div class="field"><label for="q-email">Patient\'s QueroCura e-mail</label><input class="input" id="q-email" type="email" autocomplete="off"></div>' +
      '<div class="lbl">What do you need?</div><div class="scopes" id="q-scopes">' + scopeBoxes("q", ["summary", "vitals", "medicines"]) + '</div>' +
      '<div class="field"><label for="q-purpose">Why? (the patient reads this)</label><input class="input" id="q-purpose" maxlength="200" placeholder="e.g. Pre-surgery assessment on 12 Oct"></div>' +
      '<div class="grid2"><div class="field"><label for="q-days">For how long</label><select class="input" id="q-days"><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></div>' +
      '<div class="field"><label for="q-ref">Your reference (optional)</label><input class="input" id="q-ref" maxlength="80"></div></div>' +
      '<label class="scope"><input type="checkbox" id="q-write"><span>Also ask to add notes, prescriptions and results to their record</span></label>' +
      '<div style="margin-top:12px"><button class="btn btn-primary" type="submit"' + (active ? "" : " disabled") + '>Send request</button></div><div class="msg" id="q-msg" role="status"></div></form></div>';
    if (can("emergency")) h += '<div class="card emg-card"><h2>Emergency access</h2><p class="sub">For a patient who can\'t consent right now and who has turned emergency access on. You get 2 hours of read-only essentials (allergies, conditions, medicines). The patient is told immediately and your reason is shown to them. Misuse is reviewed.</p>' +
      '<form id="emg-form" novalidate><div class="field"><label for="e-email">Patient\'s QueroCura e-mail</label><input class="input" id="e-email" type="email" autocomplete="off"></div><div class="field"><label for="e-why">What is the emergency? (min 20 characters)</label><textarea class="input" id="e-why" rows="3" maxlength="400"></textarea></div>' +
      '<button class="btn btn-danger" type="submit"' + (active ? "" : " disabled") + '>Open emergency access</button><div class="msg" id="e-msg" role="status"></div></form></div>';
    h += '</div>';
    box.innerHTML = h;
    el("q-scopes").addEventListener("change", function (e) { var l = e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); });

    el("code-form").addEventListener("submit", function (e) {
      e.preventDefault(); var msg = el("c-msg");
      api("/hospital/connect", { method: "POST", body: { code: el("c-code").value, reference: el("c-ref").value } }).then(function (r) {
        if (guard(r)) return;
        if (r.ok) { say(msg, r.message, "ok"); P.confetti(["💚", "🏥", "✨"], 18); el("c-code").value = ""; FILTER = "active"; tabNow = "patients"; setTimeout(render, 700); } else say(msg, r.message || "That code didn't work.", "err");
      });
    });
    el("req-form").addEventListener("submit", function (e) {
      e.preventDefault(); var msg = el("q-msg");
      var scopes = [].map.call(el("q-scopes").querySelectorAll("[data-scope]:checked"), function (c) { return c.getAttribute("data-scope"); });
      api("/hospital/requests", { method: "POST", body: { email: el("q-email").value.trim(), scopes: scopes, purpose: el("q-purpose").value.trim(), days: +el("q-days").value, want_write: el("q-write").checked, reference: el("q-ref").value } }).then(function (r) {
        if (guard(r)) return;
        say(msg, r.message, r.ok ? "ok" : "err"); if (r.ok) { el("q-email").value = ""; el("q-purpose").value = ""; }
      });
    });
    var ef = el("emg-form");
    if (ef) ef.addEventListener("submit", function (e) {
      e.preventDefault(); var msg = el("e-msg");
      if (!window.confirm("This opens a patient's essentials without their prior approval. It is logged and the patient is notified. Continue?")) return;
      api("/hospital/emergency", { method: "POST", body: { email: el("e-email").value.trim(), justification: el("e-why").value.trim() } }).then(function (r) {
        if (guard(r)) return;
        say(msg, r.message, r.ok ? "ok" : "err");
        if (r.ok) { el("e-why").value = ""; FILTER = "active"; tabNow = "patients"; setTimeout(render, 700); }
      });
    });
  }

  /* ---------- team ---------- */
  function loadTeam() {
    var box = el("tab-team"); box.innerHTML = '<div class="empty">Loading…</div>';
    api("/hospital/team").then(function (r) {
      if (guard(r)) return;
      var roleDesc = r.roles || {};
      var h = '<div class="three"><div class="card" style="grid-column:1/-1"><h2>Your team</h2><p class="sub">Give each person the smallest role that lets them do their job.</p><div class="scroll-x"><table class="t"><thead><tr><th>Person</th><th>Roles</th><th>Status</th><th></th></tr></thead><tbody>' +
        (r.team || []).map(function (t) {
          return '<tr><td><b>' + esc(t.name) + '</b><br><span class="mini">' + esc(t.email) + '</span></td><td>' + t.roles.map(function (x) { return '<span class="tag teal">' + esc(x) + "</span>"; }).join(" ") + '</td><td>' + esc(t.status) + (t.mfa ? ' <span class="tag">2-step on</span>' : "") + '</td><td><div class="row-actions">' +
            '<button class="btn btn-sm" data-roles="' + esc(t.id) + '" data-cur="' + esc(t.roles.join(",")) + '" type="button">Change roles</button>' +
            (t.status === "disabled" ? '<button class="btn btn-sm" data-enable="' + esc(t.id) + '" type="button">Re-enable</button>' : '<button class="btn btn-sm btn-danger" data-disable="' + esc(t.id) + '" type="button">Disable</button>') +
            (t.mfa ? '<button class="btn btn-sm btn-ghost" data-mfareset="' + esc(t.id) + '" type="button">Reset 2-step</button>' : "") + '</div></td></tr>';
        }).join("") + '</tbody></table></div></div>' +
        '<div class="card"><h2>Invite someone</h2><form id="inv-form" novalidate><div class="field"><label for="v-name">Name</label><input class="input" id="v-name" maxlength="120"></div><div class="field"><label for="v-email">Work e-mail</label><input class="input" id="v-email" type="email"></div>' +
        '<div class="lbl">Roles</div>' + Object.keys(roleDesc).map(function (k) { return '<label class="scope"><input type="checkbox" data-role="' + k + '"' + (k === "nurse" ? " checked" : "") + '><span>' + esc(k) + '<br><span class="mini">' + esc(roleDesc[k]) + '</span></span></label>'; }).join("") +
        '<div style="margin-top:12px"><button class="btn btn-primary" type="submit">Send invitation</button></div><div class="msg" id="v-msg" role="status"></div></form></div>' +
        '<div class="card"><h2>Organisation details</h2><form id="org-form" novalidate><div class="field"><label>Phone</label><input class="input" id="o-phone" value="' + esc(ME.org.phone || "") + '"></div><div class="field"><label>City</label><input class="input" id="o-city" value="' + esc(ME.org.city || "") + '"></div><div class="field"><label>State</label><input class="input" id="o-state" value="' + esc(ME.org.state || "") + '"></div><div class="field"><label>Website</label><input class="input" id="o-web" value="' + esc(ME.org.website || "") + '"></div><div class="field"><label>ABDM facility ID</label><input class="input" id="o-abdm" value="' + esc(ME.org.abdm_facility_id || "") + '"></div><button class="btn" type="submit">Save</button><div class="msg" id="o-msg"></div></form></div></div>';
      box.innerHTML = h;
      box.querySelectorAll(".scope").forEach(function (l) { var i = l.querySelector("input"); l.classList.toggle("on", i && i.checked); });
      box.addEventListener("change", function (e) { var l = e.target.closest && e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); });
      el("inv-form").addEventListener("submit", function (e) {
        e.preventDefault(); var msg = el("v-msg");
        var roles = [].map.call(box.querySelectorAll("[data-role]:checked"), function (c) { return c.getAttribute("data-role"); });
        api("/hospital/team/invite", { method: "POST", body: { name: el("v-name").value.trim(), email: el("v-email").value.trim(), roles: roles } }).then(function (x) {
          if (guard(x)) return;
          say(msg, x.message, x.ok ? "ok" : "err");
          if (x.dev_link) { var a = document.createElement("div"); a.className = "dev-note"; a.textContent = "Development: " + x.dev_link; msg.appendChild(a); }
          if (x.ok) loadTeamLater();
        });
      });
      el("org-form").addEventListener("submit", function (e) {
        e.preventDefault();
        api("/hospital/org", { method: "POST", body: { phone: el("o-phone").value, city: el("o-city").value, state: el("o-state").value, website: el("o-web").value, abdm_facility_id: el("o-abdm").value } }).then(function (x) { say(el("o-msg"), x.message || "Saved.", x.ok ? "ok" : "err"); });
      });
    });
  }
  function loadTeamLater() { setTimeout(loadTeam, 600); }
  el("tab-team").addEventListener("click", function (e) {
    var t;
    if ((t = e.target.closest("[data-disable]"))) { if (!window.confirm("Disable this person? They're signed out straight away.")) return; api("/hospital/team/" + t.getAttribute("data-disable"), { method: "POST", body: { disabled: true } }).then(function (r) { P.toast(r.message, r.ok ? "" : "err"); loadTeam(); }); }
    else if ((t = e.target.closest("[data-enable]"))) api("/hospital/team/" + t.getAttribute("data-enable"), { method: "POST", body: { disabled: false } }).then(function (r) { P.toast(r.message, r.ok ? "" : "err"); loadTeam(); });
    else if ((t = e.target.closest("[data-mfareset]"))) { if (!window.confirm("They'll have to set up their authenticator again. Continue?")) return; api("/hospital/mfa/reset", { method: "POST", body: { staff_id: t.getAttribute("data-mfareset") } }).then(function (r) { P.toast(r.message, r.ok ? "" : "err"); loadTeam(); }); }
    else if ((t = e.target.closest("[data-roles]"))) {
      var cur = t.getAttribute("data-cur").split(","), all = ["admin", "doctor", "nurse", "frontdesk"], pick = window.prompt("Roles (comma separated): " + all.join(", "), cur.join(", "));
      if (pick === null) return;
      api("/hospital/team/" + t.getAttribute("data-roles"), { method: "POST", body: { roles: pick.split(",").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean) } }).then(function (r) { P.toast(r.message, r.ok ? "" : "err"); loadTeam(); });
    }
  });

  /* ---------- activity ---------- */
  var NICE = { login: "signed in", logout: "signed out", chart_viewed: "viewed a patient chart", record_added: "added a record", access_requested: "sent an access request", connected_by_code: "connected a patient by code", emergency_access_opened: "OPENED EMERGENCY ACCESS", staff_invited: "invited a team member", staff_updated: "changed a team member", mfa_enabled: "turned on 2-step sign-in", mfa_reset: "reset someone's 2-step sign-in", password_changed: "changed their password", org_registered: "applied to join", org_active: "organisation approved", org_updated: "updated organisation details", signed_out_everywhere: "signed out everywhere", recovery_code_used: "used a recovery code" };
  function loadActivity() {
    var box = el("tab-activity"); box.innerHTML = '<div class="empty">Loading…</div>';
    api("/hospital/audit").then(function (r) {
      if (guard(r)) return;
      box.innerHTML = '<div class="card"><h2>Activity log</h2><p class="sub">Every sign-in, chart view and change at your organisation. Entries are chained so they can\'t be quietly edited. Patients see their own part of this.</p><div class="scroll-x"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>' +
        ((r.entries || []).map(function (e) { return '<tr' + (e.emergency ? ' style="color:var(--danger);font-weight:700"' : "") + '><td>' + esc(when(e.ts)) + '</td><td>' + esc(e.staff_name || "—") + '</td><td>' + esc(NICE[e.action] || e.action.replace(/_/g, " ")) + '</td><td class="mini">' + esc(e.detail || "") + '</td></tr>'; }).join("") || '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>') + '</tbody></table></div></div>';
    });
  }

  /* ---------- my security ---------- */
  function renderSecurity() {
    var s = ME.staff, box = el("tab-security");
    box.innerHTML = '<div class="three"><div class="card"><h2>Two-step sign-in</h2><p class="sub">' + (s.mfa ? "On. You use an authenticator app when you sign in." : "Off.") + ' If you lose your phone, ask an administrator to reset it, or use a recovery code.</p></div>' +
      '<div class="card"><h2>Change password</h2><form id="pw-form" novalidate><div class="field"><label>Current password</label><input class="input" id="p-cur" type="password" autocomplete="current-password"></div><div class="field"><label>New password</label><input class="input" id="p-new" type="password" autocomplete="new-password"></div><button class="btn btn-primary" type="submit">Change password</button><div class="msg" id="p-msg" role="status"></div></form></div>' +
      '<div class="card"><h2>Sign out everywhere</h2><p class="sub">Ends every session on every device, including this one.</p><button class="btn btn-danger" id="out-all" type="button">Sign out everywhere</button></div></div>';
    el("pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      api("/hospital/password", { method: "POST", body: { current: el("p-cur").value, "new": el("p-new").value } }).then(function (r) { say(el("p-msg"), r.message, r.ok ? "ok" : "err"); if (r.ok) { el("p-cur").value = ""; el("p-new").value = ""; } });
    });
    el("out-all").addEventListener("click", function () { api("/hospital/signout-all", { method: "POST" }).then(function () { goPublic("Signed out everywhere. Please sign in again."); }); });
  }

  /* ---------- boot ---------- */
  P.init({ requireLogin: false });
  loadOptions().then(function () {
    readFragment();
    window.addEventListener("hashchange", readFragment);
    api("/hospital/me").then(function (r) { if (r.ok) enterPortal(); });
  });
})();
