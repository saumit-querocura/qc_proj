(function () {
  "use strict";
  var P = QCPage, esc = P.esc;
  var MEMO = {}, MEMO_MS = 4000;
  function api(path, opts) {
    var m = ((opts && opts.method) || "GET").toUpperCase();
    if (m !== "GET") { MEMO = {}; return P.api(path, opts); }
    var hit = MEMO[path], now = Date.now();
    if (hit && now - hit.t < MEMO_MS) return hit.p.then(function (r) { return JSON.parse(JSON.stringify(r)); });
    var p = P.api(path, opts).then(function (r) { if (!r || !r.ok) delete MEMO[path]; return r; });
    MEMO[path] = { t: now, p: p };
    if (Object.keys(MEMO).length > 120) MEMO = {};
    return p.then(function (r) { return JSON.parse(JSON.stringify(r)); });
  }
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

  var OPTS = null, ME = null, PERMS = [], IDLE_MS = 20 * 60 * 1000, lastActive = Date.now(), tabNow = "overview", FILTER = "active", ROSTER = [], SIGNALS = {}, QUERY = "", SORT = "attention";
  function can(p) { return PERMS.indexOf(p) >= 0; }

  /* ===================================================== public side ===================================================== */
  function loadOptions() {
    return api("/hospital/options").then(function (d) {
      if (!d.ok) return; OPTS = d;
      el("a-type").innerHTML = d.org_types.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
      showSetupPlan();
    });
  }
  // Answers from the setup questions (hospital/setup/) travel with the application.
  function setupAnswers() { try { var a = JSON.parse(sessionStorage.getItem("qc_setup") || "null"); return a && a.facility ? a : null; } catch (e) { return null; } }
  function showSetupPlan() {
    var a = setupAnswers(), box = el("apply-plan");
    if (!box) return;
    if (!a) { box.innerHTML = '<a class="apply-plan none" href="setup/"><b>New here?</b> Answer a few questions first and we’ll plan your setup: modules, departments, wards and beds. <span>Plan my setup →</span></a>'; return; }
    api("/hospital/setup/plan", { method: "POST", body: { answers: a } }).then(function (r) {
      if (!r.ok) return;
      var p = r.plan;
      if (OPTS && OPTS.org_types.indexOf(p.org_type) >= 0) el("a-type").value = p.org_type;
      box.innerHTML = '<div class="apply-plan"><span class="ap-ic">✓</span><div><b>Your plan comes with this application</b><span>' + esc(p.summary) + '</span></div><a href="setup/">Review</a></div>';
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
    if (setupAnswers()) body.setup = setupAnswers();
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
      try { sessionStorage.removeItem("qc_setup"); } catch (x) {}
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
      el("who").textContent = r.staff.name + " · " + r.staff.roles.map(function (k) { return (r.role_labels || {})[k] || k; }).join(", ");
      if (location.hash === "#setup") { tabNow = "setup"; try { history.replaceState(null, "", location.pathname); } catch (e) {} }
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
  function closeAll() { P.closeModal("chart-modal"); P.closeModal("record-modal"); el("chart-body").innerHTML = ""; closeCmdk(); }

  // Any API reply that says the session ended sends us back to sign-in.
  function guard(r) {
    if (r && (r.status === 401) && ME) { closeAll(); goPublic(r.message || "Please sign in again."); return true; }
    if (r && r.status === 403 && r.code === "mfa_setup") { render(); return true; }
    return false;
  }

  // [icon, plain name, what it is for, group in the More menu]
  var TAB_INFO = {
    overview: ["🏠", "My day", "Your list for today, most important first, and what the hospital expects in the next few hours.", ""],
    patients: ["🗂️", "Patients", "Find or register a patient. Each has one record: visits, prescriptions, results, scans and bills.", "Patients and visits"],
    appointments: ["📅", "Appointments", "Every doctor's day side by side. Book into a free slot; mark people arrived when they come in.", "Patients and visits"],
    queue: ["🎟️", "Queue", "Who is waiting, in token order, and who is with a doctor. Emergency patients by triage level.", "Patients and visits"],
    beds: ["🛏️", "Beds", "Every ward and bed: free, occupied, being cleaned. Admit, move and discharge from here.", "Patients and visits"],
    orders: ["🧪", "Tests and tasks", "Lab tests, scans, nursing tasks and consults sent between departments, by due time.", "Patients and visits"],
    handover: ["🤝", "Handover", "Short notes from one shift to the next, acknowledged so nothing is missed.", "Patients and visits"],
    imaging: ["🩻", "Scans", "Upload scans, review AI-assisted drafts and sign reports.", "Patients and visits"],
    insights: ["📈", "Insights", "How your practice is doing: busy days and hours, real consultation times, no-shows, common reasons for visits and who is due a follow-up.", "Patients and visits"],
    ot: ["🔪", "Theatres", "Today's operation list and the surgical safety checklist for each case.", "Patients and visits"],
    connect: ["📲", "Connect app users", "Link patients who use the QueroCura app, with their consent.", "Patients and visits"],
    pharmacy: ["💊", "Pharmacy", "Prescriptions waiting to be dispensed, and medicine stock.", "Pharmacy and billing"],
    billing: ["🧾", "Billing", "Who owes what, visits still to bill, and today's takings. Collect payments here.", "Pharmacy and billing"],
    duty: ["👥", "Duty roster", "Who works which shift, and where.", "Running the hospital"],
    reports: ["📊", "Reports", "Patients seen, admissions, collections and common diagnoses, for any dates.", "Running the hospital"],
    setup: ["⚙️", "Setup", "Departments, wards, beds and theatres, your setup plan and which modules are on.", "Running the hospital"],
    team: ["🔐", "Team and roles", "Invite people and decide what each role can do.", "Running the hospital"],
    activity: ["📜", "Activity log", "Every sign-in, record viewed and change, in a log nobody can edit.", "Running the hospital"],
    security: ["🛡️", "My security", "Your password, two-step sign-in and signed-in devices.", "You"],
  };
  var GROUPS = ["Patients and visits", "Pharmacy and billing", "Running the hospital", "You"];

  function render() {
    var org = ME.org, staff = ME.staff;
    show(el("workspace"), false); show(el("mfa-setup"), false);
    var banner = el("banner"); banner.innerHTML = "";
    if (ME.mfa_setup_needed) { renderMfaSetup(); return; }
    show(el("workspace"), true);
    el("org-name").textContent = org.name;
    var tag = document.querySelector(".hp-top .hp-tag"); if (tag) tag.textContent = org.practice === "solo" ? "for Doctors" : "for Hospitals";
    el("org-meta").textContent = [org.org_type, org.city, org.state].filter(Boolean).join(" · ") + (org.registration_no ? " · Reg. " + org.registration_no : "");
    el("org-status").innerHTML = org.status === "active" ? '<span class="pill ok">✓ Verified by QueroCura</span>' : org.status === "pending" ? '<span class="pill wait">⏳ Verification pending</span>' : '<span class="pill bad">' + esc(org.status) + '</span>';
    if (org.status === "pending") banner.innerHTML = '<div class="notice wait">Thanks for applying. Our team is verifying <b>' + esc(org.name) + '</b> (registration ' + esc(org.registration_no || "") + '). You can set up your team and security now. Patient connections switch on as soon as you\'re approved, and we\'ll e-mail you.</div>';
    if (org.status === "rejected" || org.status === "suspended") banner.innerHTML = '<div class="notice bad">This organisation isn\'t active. ' + esc(org.review_note || "Please contact QueroCura support.") + '</div>';
    // The hospital's working tabs (queue, beds, orders, handover, setup) come from hospital-ops.js, in the order a shift uses them.
    // Management tabs (patients, appointments, pharmacy, billing, duty, reports) come from hospital-hms*.js.
    var OPS = window.QCOps ? window.QCOps.tabs(can) : [];
    var HMS = window.QCHms ? window.QCHms.tabs(can) : [];
    var DOC = window.QCDoc ? window.QCDoc.tabs(can) : [];
    var grp = function (list, g) { return list.filter(function (t) { return t[3] === g; }); };
    var tabs = [["overview", "My day", true]].concat(HMS.length ? grp(HMS, "front") : [["patients", "Patients", can("roster")]]).concat(grp(OPS, "flow")).concat(grp(HMS, "flow")).concat(DOC).concat(grp(HMS, "back"))
      .concat([["connect", "Connect", can("request")]])
      .concat(grp(HMS, "admin")).concat(grp(OPS, "admin"))
      .concat([["team", "Team", can("team")], ["activity", "Activity log", can("audit")], ["security", "My security", true]]).filter(function (t) { return t[2]; });
    // modules the organisation switched off in Setup stay out of the menu (Setup can switch them back on)
    var MODS = ME.modules;
    if (MODS) tabs = tabs.filter(function (t) { return MODS[t[0]] !== false; });
    if (!tabs.some(function (t) { return t[0] === tabNow; })) tabNow = tabs[0][0];
    // a short menu: My day and the few screens this person's role uses; everything else under More
    var keys = ["overview"].concat(ME.nav || []).filter(function (k, i, a) { return a.indexOf(k) === i && tabs.some(function (t) { return t[0] === k; }); });
    if (keys.length < 3) keys = tabs.slice(0, 6).map(function (t) { return t[0]; });
    var primary = keys.map(function (k) { return tabs.filter(function (t) { return t[0] === k; })[0]; });
    var rest = tabs.filter(function (t) { return keys.indexOf(t[0]) < 0; });
    TABS_ALL = tabs; TABS_REST = rest;
    if (!tabs.some(function (t) { return t[0] === tabNow; })) tabNow = "overview";
    drawTabs(primary);
    switchTab(tabNow);
  }
  var TABS_ALL = [], TABS_REST = [], TABS_PRIMARY = [];
  function tabName(t) { return (TAB_INFO[t[0]] || [])[1] || t[1]; }
  function drawTabs(primary) {
    if (primary) TABS_PRIMARY = primary;
    var extra = TABS_PRIMARY.some(function (t) { return t[0] === tabNow; }) ? null : TABS_ALL.filter(function (t) { return t[0] === tabNow; })[0];
    var bar = TABS_PRIMARY.concat(extra ? [extra] : []);
    el("tabs").innerHTML = bar.map(function (t) {
      var i = TAB_INFO[t[0]] || [];
      return '<button type="button" role="tab" data-tab="' + t[0] + '" class="' + (t[0] === tabNow ? "on" : "") + '"><span class="tb-ic" aria-hidden="true">' + (i[0] || "") + "</span>" + esc(tabName(t)) + "</button>";
    }).join("") + (TABS_REST.length ? '<button type="button" class="tb-more" data-more aria-haspopup="true" aria-expanded="false">More <span aria-hidden="true">▾</span></button><div class="tb-menu" id="tb-menu" hidden></div>' : "");
  }
  function openMore(btn) {
    var m = el("tb-menu"); if (!m) return;
    if (!m.hidden) { m.hidden = true; btn.setAttribute("aria-expanded", "false"); return; }
    m.innerHTML = GROUPS.map(function (g) {
      var items = TABS_REST.filter(function (t) { return ((TAB_INFO[t[0]] || [])[3] || "Running the hospital") === g; });
      if (!items.length) return "";
      return '<div class="tbm-g"><div class="tbm-h">' + esc(g) + "</div>" + items.map(function (t) {
        var i = TAB_INFO[t[0]] || ["", t[1], ""];
        return '<button type="button" class="tbm-i" data-tab="' + t[0] + '"><span class="tb-ic" aria-hidden="true">' + i[0] + "</span><span><b>" + esc(tabName(t)) + "</b><small>" + esc(i[2]) + "</small></span></button>";
      }).join("") + "</div>";
    }).join("");
    m.hidden = false; btn.setAttribute("aria-expanded", "true");
  }
  document.addEventListener("click", function (e) { var m = el("tb-menu"); if (m && !m.hidden && !e.target.closest("#tb-menu,[data-more]")) { m.hidden = true; } });
  el("tabs").addEventListener("click", function (e) {
    var mo = e.target.closest("[data-more]"); if (mo) return openMore(mo);
    var b = e.target.closest("[data-tab]"); if (b) goTab(b.getAttribute("data-tab"));
  });
  function goTab(t) { tabNow = t; drawTabs(); switchTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function switchTab(t) {
    var own = { overview: loadOverview, patients: loadPatients, connect: renderConnect, team: loadTeam, activity: loadActivity, security: renderSecurity };
    var ops = window.QCOps ? window.QCOps.loaders() : {};
    if (window.QCHms) { delete own.patients; var hm = window.QCHms.loaders(); Object.keys(hm).forEach(function (k) { ops[k] = hm[k]; }); window.QCHms.leave(); }
    if (window.QCDoc) { var dl = window.QCDoc.loaders(); Object.keys(dl).forEach(function (k) { ops[k] = dl[k]; }); }
    [].forEach.call(document.querySelectorAll("#workspace > section.tab"), function (sec) { show(sec, sec.id === "tab-" + t); });
    if (window.QCOps) window.QCOps.leave();
    show(el("tab-board"), t === "overview" && ME.org.practice !== "solo" && (can("ops") || can("structure") || can("reports") || can("orders")));
    about(t);
    (own[t] || ops[t] || loadOverview)();
  }

  /* one plain sentence about what this screen is for (until the person hides it) */
  function about(t) {
    var box = el("tab-about"); if (!box) return;
    var i = TAB_INFO[t], hidden = false;
    try { hidden = localStorage.getItem("qc-about-" + t) === "1"; } catch (x) {}
    if (!i || hidden || t === "overview") { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="ab-ic" aria-hidden="true">' + i[0] + '</span><span class="grow"><b>' + esc(i[1]) + ".</b> " + esc(i[2]) + '</span><button type="button" class="ab-x" aria-label="Hide this explanation" data-hide="' + t + '">Got it</button>';
  }
  document.addEventListener("click", function (e) { var h = e.target.closest("[data-hide]"); if (!h) return; try { localStorage.setItem("qc-about-" + h.getAttribute("data-hide"), "1"); } catch (x) {} el("tab-about").hidden = true; });

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

  /* ---------- overview ---------- */
  var SEV_LABEL = { emergency: "Emergency", urgent: "Urgent", warning: "Check" };
  function sevPill(sev) { return sev ? '<span class="sev sev-' + esc(sev) + '">' + esc(SEV_LABEL[sev] || sev) + "</span>" : ""; }
  var LVL = { urgent: ["Now", "md-urgent"], soon: ["Soon", "md-soon"], todo: ["Today", "md-todo"] };
  function loadOverview() {
    if (window.QCOps && ME.org.practice !== "solo" && (can("ops") || can("structure") || can("reports") || can("orders"))) window.QCOps.board(el("tab-board"));
    var box = el("tab-overview");
    box.innerHTML = '<div class="md"><div class="md-skel"></div><div class="md-skel"></div><div class="md-skel"></div></div><div id="ov-classic"></div>';
    api("/hospital/my-day").then(function (d) {
      if (guard(d)) return;
      if (!d.ok) return;
      var h = '<div class="md"><div class="md-hello"><div><h2>' + esc(d.greeting) + '</h2><p class="md-sum' + (d.urgent ? " hot" : "") + '">' + esc(d.summary) + "</p></div>" +
        '<div class="md-tools">' + (window.QCAbha && can("org") ? '<button type="button" class="btn btn-sm md-tool" data-abdm-set><span aria-hidden="true">🪪</span> ABDM</button>' : "") + (window.QCDoc && can("org") ? '<button type="button" class="btn btn-sm md-tool" data-doc-booking><span aria-hidden="true">📲</span> Online booking</button>' : "") + (window.QCDoc && can("rx") ? '<button type="button" class="btn btn-sm md-tool" data-doc-hours><span aria-hidden="true">🗓️</span> My hours</button>' : "") + (window.QCMind && (can("appointments") || can("ops") || can("schedules") || can("reports")) ? '<button type="button" class="btn btn-sm md-tool" data-ins-open="simulation"><span aria-hidden="true">🔮</span> Rest of today</button>' : "") +
        (window.QCMind && (can("structure") || can("reports")) && (ME.org || {}).practice !== "solo" ? '<button type="button" class="btn btn-sm md-tool" data-ins-open="integrity"><span aria-hidden="true">🧭</span> How it’s connected</button>' : "") +
        '<button type="button" class="btn btn-sm cmdk-hint" data-cmdk>Search <kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl") + "</kbd><kbd>K</kbd></button></div></div>";
      h += '<div class="md-grid"><section class="md-next"><h3>Next up</h3>' + (d.tasks.length ? '<ol class="md-list">' + d.tasks.map(function (t) {
        var l = LVL[t.level] || LVL.todo;
        return '<li class="md-task ' + l[1] + '"><span class="md-lvl">' + l[0] + '</span><div class="grow"><b>' + esc(t.title) + "</b><small>" + esc(t.why) + '</small></div><button type="button" class="btn btn-sm' + (t.level === "urgent" ? " btn-primary" : "") + '" data-task="' + esc(t.id) + '">' + esc(t.button || "Open") + "</button></li>";
      }).join("") + "</ol>" + (d.more_tasks ? '<p class="mini md-more">' + d.more_tasks + " more after these. They'll move up as you finish.</p>" : "") :
        '<div class="md-clear"><span aria-hidden="true">✓</span><b>All clear.</b><small>Nothing needs you right now. New work appears here as it comes in.</small></div>') + "</section>";
      h += '<section class="md-ahead"><h3>Heads up</h3>' + (d.insights.length ? d.insights.map(function (i, k) {
        return '<div class="md-in ' + (i.level === "warning" ? "warn" : "") + '"><b>' + esc(i.title) + "</b><p>" + esc(i.text) + '</p><div class="md-in-f"><button type="button" class="link" data-why="' + k + '">Why?</button>' +
          (i.action && i.action.tab ? '<button type="button" class="link" data-goto="' + esc(i.action.tab) + '">Open →</button>' : "") +
          (i.action && i.action.open && window.QCMind ? '<button type="button" class="link" data-ins-open="' + esc(i.action.open) + '">See it →</button>' : "") +
          (i.do && window.QCMind ? '<button type="button" class="btn btn-sm btn-primary md-do" data-ins-do="' + k + '">' + esc(i.do.label) + "</button>" : "") + '</div><p class="md-why" id="md-why-' + k + '" hidden>' + esc(i.basis || "") + "</p></div>";
      }).join("") : '<p class="mini">Nothing to flag. Forecasts appear here once there is enough history.</p>') + "</section></div>";
      if (d.partial) h += '<p class="mini">Some parts of the hospital couldn\'t be checked just now; this list may be incomplete.</p>';
      h += "</div>";
      var classic = el("ov-classic"); box.innerHTML = h; box.appendChild(classic);
      box._tasks = d.tasks; box._ins = d.insights;
      if (window.QCDoc) window.QCDoc.starter(box);
    });
    loadClassic();
  }
  function doTask(t) {
    var a = t.action || {};
    if (a.open === "visit" && window.QCOps) return window.QCOps.openVisit(a.id);
    if (a.open === "ot" && window.QCHms && window.QCHms.openCase) return window.QCHms.openCase(a.id);
    if (a.tab) goTab(a.tab);
  }
  function loadClassic() {
    var box = el("ov-classic");
    if (!can("request") && !can("roster")) return;
    box.innerHTML = '<details class="md-classic"><summary>Patients connected through the QueroCura app</summary><div id="ov-classic-in"><div class="kpis">' + new Array(6).join('<div class="kpi skel"></div>') + "</div></div></details>";
    box = el("ov-classic-in");
    api("/hospital/dashboard").then(function (r) {
      if (guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message || "Couldn't load the overview.") + "</div>"; return; }
      var d = r.data || {}, k = d.kpis || {}, active = ME.org.status === "active";
      var hour = new Date().getHours(), hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      var h = ""; void hello;
      if (active) {
        var tiles = [["connected", "Connected patients", "👥", "patients"], ["waiting", "Waiting for patient", "⏳", "patients"], ["expiring", "Access ends in 72 h", "⌛", "patients"],
          ["charts_7d", "Charts opened (7 days)", "📂", "activity"], ["records_7d", "Records added (7 days)", "📝", "activity"], ["emergency_30d", "Emergency access (30 days)", "🚨", "activity"]];
        h += '<div class="kpis">' + tiles.map(function (t) {
          var v = k[t[0]] == null ? "–" : k[t[0]];
          return '<button type="button" class="kpi' + (t[0] === "emergency_30d" && v > 0 ? " kpi-alert" : "") + '" data-goto="' + t[3] + '"><span class="kpi-ic">' + t[2] + '</span><b>' + esc(v) + "</b><span>" + esc(t[1]) + "</span></button>";
        }).join("") + "</div>";
        if (k.team) h += '<div class="mfa-meter"><span>Two-step sign-in on for <b>' + esc(k.mfa_on) + " of " + esc(k.team) + "</b> team members</span><i><u style=\"width:" + Math.round(100 * (k.mfa_on || 0) / k.team) + '%"></u></i></div>';
      }
      h += '<div class="ov-grid"><div class="card"><div class="card-h"><h2>Needs attention</h2><span class="mini">From what each patient shares with you</span></div>' +
        ((d.attention || []).length ? d.attention.map(function (a) {
          return '<button type="button" class="att" data-chart="' + esc(a.id) + '"><div class="avatar sm">' + esc(initials(a.patient_name)) + '</div><div class="grow"><b>' + esc(a.patient_name || "Patient") + "</b>" + (a.reference ? ' <span class="mini">· ' + esc(a.reference) + "</span>" : "") +
            a.alerts.map(function (x) { return '<small>' + sevPill(x.severity) + " " + esc(x.text) + "</small>"; }).join("") + '</div><span class="go">Open chart →</span></button>';
        }).join("") : '<div class="empty calm">✓ Nothing flagged in your patients\' shared readings or recent checks.</div>') + "</div>" +
        '<div class="card"><div class="card-h"><h2>Access ending soon</h2></div>' + ((d.expiring || []).length ? d.expiring.map(function (x) {
          return '<div class="exp"><div class="avatar sm">' + esc(initials(x.patient_name)) + '</div><div class="grow"><b>' + esc(x.patient_name || "Patient") + "</b><small>" + esc(left(x.expires_ts)) + (x.via === "emergency" ? " · emergency" : "") + "</small></div></div>";
        }).join("") + '<p class="mini" style="margin:10px 0 0">Ask the patient to extend from their app if you still need access.</p>' : '<div class="empty calm">No access ends in the next 3 days.</div>') + "</div>" +
        '<div class="card span2"><div class="card-h"><h2>Recent activity</h2><button type="button" class="btn btn-sm btn-ghost" data-goto="activity">Full log →</button></div>' +
        ((d.recent || []).length ? '<div class="feed">' + d.recent.map(function (e) { return '<div class="' + (e.emergency ? "emg" : "") + '"><time>' + esc(when(e.ts)) + "</time><span><b>" + esc(e.staff_name || "Someone") + "</b> " + esc(NICE[e.action] || e.action.replace(/_/g, " ")) + "</span></div>"; }).join("") + "</div>" : '<div class="empty">Nothing yet.</div>') + "</div></div>";
      if (active && can("request")) h += '<div class="quick"><button type="button" class="btn btn-primary" data-goto="connect">+ Connect a patient</button>' + (can("team") ? '<button type="button" class="btn" data-goto="team">Invite a colleague</button>' : "") + "</div>";
      box.innerHTML = h;
    });
  }
  el("tab-overview").addEventListener("click", function (e) {
    var tk = e.target.closest("[data-task]"); if (tk) { var bx = el("tab-overview"), t = (bx._tasks || []).filter(function (x) { return x.id === tk.getAttribute("data-task"); })[0]; if (t) doTask(t); return; }
    if (e.target.closest("[data-abdm-set]") && window.QCAbha) { window.QCAbha.settings(); return; }
    var io = e.target.closest("[data-ins-open]"); if (io && window.QCMind) { var w = io.getAttribute("data-ins-open"); if (window.QCMind[w]) window.QCMind[w](); return; }
    var idn = e.target.closest("[data-ins-do]"); if (idn && window.QCMind) { var ins = (el("tab-overview")._ins || [])[+idn.getAttribute("data-ins-do")]; if (ins && ins.do) window.QCMind.rebalance(ins.do.body, idn).then(function (r) { if (r.ok) loadOverview(); }); return; }
    var wy = e.target.closest("[data-why]"); if (wy) { var p = el("md-why-" + wy.getAttribute("data-why")); if (p) p.hidden = !p.hidden; return; }
    var g = e.target.closest("[data-goto]"); if (g) { goTab(g.getAttribute("data-goto")); return; }
    var c = e.target.closest("[data-chart]"); if (c) { openChart(c.getAttribute("data-chart")); return; }
    if (e.target.closest("[data-cmdk]")) openCmdk();
  });

  /* ---------- patients ---------- */
  function stateOf(i) { return i.kind === "request" ? "waiting" : i.state; }
  function loadPatients() {
    var box = el("tab-patients");
    box.innerHTML = '<div class="empty">Loading…</div>';
    api("/hospital/roster").then(function (r) {
      if (guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message || "Couldn't load.") + "</div>"; return; }
      ROSTER = r.items; drawRoster();
      if (can("read") && ROSTER.some(function (i) { return stateOf(i) === "active"; })) {
        api("/hospital/roster/signals").then(function (s) { if (s && s.ok) { SIGNALS = s.signals || {}; drawRoster(); } });
      }
    });
  }
  var SEV_RANK = { emergency: 0, urgent: 1, warning: 2 };
  function drawRoster() {
    var box = el("tab-patients"), keepFocus = document.activeElement && document.activeElement.id === "pt-q";
    var counts = { active: 0, waiting: 0, ended: 0 };
    ROSTER.forEach(function (i) { var s = stateOf(i); counts[s === "active" ? "active" : s === "waiting" ? "waiting" : "ended"]++; });
    var q = QUERY.trim().toLowerCase();
    var rows = ROSTER.filter(function (i) { var s = stateOf(i); return FILTER === "ended" ? (s === "expired" || s === "revoked") : s === FILTER; })
      .filter(function (i) { return !q || ((i.patient_name || "") + " " + (i.reference || "") + " " + (i.purpose || "")).toLowerCase().indexOf(q) >= 0; });
    rows.sort(function (a, b) {
      if (SORT === "expiring") return (a.expires_ts || 9e12) - (b.expires_ts || 9e12);
      if (SORT === "name") return (a.patient_name || "").localeCompare(b.patient_name || "");
      if (SORT === "recent") return (b.created_ts || 0) - (a.created_ts || 0);
      var sa = SIGNALS[a.id] && SIGNALS[a.id].top, sb = SIGNALS[b.id] && SIGNALS[b.id].top;
      return ((sa ? SEV_RANK[sa] : 9) - (sb ? SEV_RANK[sb] : 9)) || ((a.expires_ts || 9e12) - (b.expires_ts || 9e12));
    });
    var html = '<div class="filters">' + [["active", "Connected"], ["waiting", "Waiting for patient"], ["ended", "Ended"]].map(function (f) { return '<button type="button" class="chipbtn' + (FILTER === f[0] ? " on" : "") + '" data-filter="' + f[0] + '">' + f[1] + " (" + counts[f[0]] + ")</button>"; }).join("") +
      '<span class="grow"></span>' + (can("request") ? '<button class="btn btn-sm btn-primary" type="button" data-goto="connect">+ Connect a patient</button>' : "") + "</div>" +
      '<div class="pt-tools"><div class="search"><span aria-hidden="true">🔎</span><input id="pt-q" type="search" placeholder="Search by name, MRN or purpose  ( / )" value="' + esc(QUERY) + '" aria-label="Search patients"></div>' +
      '<label class="mini">Sort <select id="pt-sort" class="input input-sm">' + [["attention", "Needs attention first"], ["expiring", "Access ending first"], ["recent", "Newest first"], ["name", "Name"]].map(function (o) { return '<option value="' + o[0] + '"' + (SORT === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label></div>";
    if (!rows.length) html += '<div class="card"><div class="empty">' + (q ? "No one matches “" + esc(QUERY) + "”." : FILTER === "active" ? "No connected patients yet. Use <b>Connect</b> to enter a patient's code or send them a request." : FILTER === "waiting" ? "No requests are waiting." : "Nothing here.") + "</div></div>";
    html += rows.map(function (i) {
      var s = stateOf(i), live = s === "active", sig = SIGNALS[i.id];
      var tags = (i.scopes || []).map(function (x) { return '<span class="tag">' + esc((OPTS && OPTS.scopes[x]) || x) + "</span>"; }).join("");
      if (i.via === "emergency") tags = '<span class="tag emg">EMERGENCY ACCESS</span>' + tags;
      if (i.can_write) tags += '<span class="tag teal">can add records</span>';
      var soon = live && i.expires_ts && i.expires_ts - Date.now() / 1000 < 72 * 3600;
      var alerts = sig && sig.alerts && sig.alerts.length ? '<div class="pt-alerts">' + sig.alerts.map(function (a) { return "<span>" + sevPill(a.severity) + " " + esc(a.text) + "</span>"; }).join("") + "</div>" : "";
      var allergy = sig && sig.med_allergies ? '<span class="tag allergy">⚠ ' + esc(sig.med_allergies) + " medicine allerg" + (sig.med_allergies === 1 ? "y" : "ies") + "</span>" : "";
      return '<div class="pt' + (sig && sig.top ? " pt-" + esc(sig.top) : "") + '"><div class="avatar">' + esc(initials(i.patient_name)) + '</div><div class="grow"><h3>' + esc(i.patient_name || "Patient") + (i.reference ? ' <span class="mini">· ' + esc(i.reference) + "</span>" : "") + "</h3>" +
        "<small>" + esc(i.purpose || "") + "</small><small" + (soon ? ' class="soon"' : "") + ">" + (s === "waiting" ? "Requested " + esc(when(i.created_ts)) : live ? esc(left(i.expires_ts)) + " · " + esc(i.via === "code" ? "connected with patient's code" : i.via === "request" ? "approved by patient" : "emergency") : s === "revoked" ? "Turned off by the patient " + esc(when(i.revoked_ts)) : "Ended " + esc(when(i.expires_ts))) + "</small>" +
        alerts + '<div class="tagrow">' + allergy + tags + "</div></div>" +
        '<div class="row-actions">' + (live && can("read") ? '<button class="btn btn-sm btn-primary" data-chart="' + esc(i.id) + '" type="button">Open chart</button>' : "") +
        (live && i.can_write && (can("write") || can("write_basic")) ? '<button class="btn btn-sm" data-add="' + esc(i.id) + '" data-name="' + esc(i.patient_name || "") + '" type="button">Add record</button>' : "") +
        (live && can("ops") && window.QCOps ? '<button class="btn btn-sm" data-checkin="' + esc(i.id) + '" type="button">Check in</button>' : "") + "</div></div>";
    }).join("");
    box.innerHTML = html;
    var qi = el("pt-q");
    qi.addEventListener("input", function () { QUERY = qi.value; drawRoster(); });
    el("pt-sort").addEventListener("change", function () { SORT = this.value; drawRoster(); });
    if (keepFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  }
  el("tab-patients").addEventListener("click", function (e) {
    var f = e.target.closest("[data-filter]"); if (f) { FILTER = f.getAttribute("data-filter"); drawRoster(); return; }
    var g = e.target.closest("[data-goto]"); if (g) { tabNow = g.getAttribute("data-goto"); render(); return; }
    var c = e.target.closest("[data-chart]"); if (c) { openChart(c.getAttribute("data-chart")); return; }
    var ci = e.target.closest("[data-checkin]"); if (ci && window.QCOps) { window.QCOps.checkIn(ci.getAttribute("data-checkin")); return; }
    var a = e.target.closest("[data-add]"); if (a) openRecord(a.getAttribute("data-add"), a.getAttribute("data-name"));
  });

  /* ---------- chart ---------- */
  function list(arr, empty) { return arr && arr.length ? arr.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join(" ") : '<span class="mini">' + (empty || "None recorded") + "</span>"; }
  // A small, honest trend line: real readings only, oldest on the left, the latest value and its date labelled.
  function trend(history, key, label, unit, lo, hi, key2) {
    var pts = (history || []).filter(function (v) { return v[key] != null && v[key] !== ""; }).slice(0, 30).reverse();
    if (pts.length < 2) return "";
    var vals = pts.map(function (v) { return +v[key]; }).concat(key2 ? pts.map(function (v) { return +v[key2] || +v[key]; }) : []);
    var mn = Math.min.apply(null, vals.concat(lo != null ? [lo] : [])), mx = Math.max.apply(null, vals.concat(hi != null ? [hi] : []));
    if (mx === mn) { mx += 1; mn -= 1; }
    var W = 260, H = 70, pad = 6;
    function x(i) { return pad + i * (W - 2 * pad) / (pts.length - 1); }
    function y(v) { return H - pad - (v - mn) * (H - 2 * pad) / (mx - mn); }
    function line(k, cls) { return '<polyline class="' + cls + '" points="' + pts.map(function (v, i) { return x(i).toFixed(1) + "," + y(+v[k]).toFixed(1); }).join(" ") + '"/>'; }
    var band = lo != null && hi != null ? '<rect class="band" x="0" width="' + W + '" y="' + y(hi).toFixed(1) + '" height="' + Math.max(1, y(lo) - y(hi)).toFixed(1) + '"/>' : "";
    var last = pts[pts.length - 1], out = last[key] != null && ((hi != null && +last[key] > hi) || (lo != null && +last[key] < lo));
    return '<div class="trend' + (out ? " out" : "") + '"><div class="trend-h"><span>' + esc(label) + '</span><b>' + esc(last[key]) + (key2 ? "/" + esc(last[key2]) : "") + " <small>" + esc(unit) + '</small></b></div><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + ' trend">' + band + line(key, "l1") + (key2 ? line(key2, "l2") : "") +
      '<circle cx="' + x(pts.length - 1).toFixed(1) + '" cy="' + y(+last[key]).toFixed(1) + '" r="3.2"/></svg><div class="trend-f"><span>' + esc(String(pts[0].ts || "").slice(0, 10)) + "</span><span>" + esc(String(last.ts || "").slice(0, 10)) + "</span></div></div>";
  }
  var KIND_ICON = { symptoms: "🩺", record: "📝", vitals: "❤️", labs: "🧪", imaging: "🩻" };
  function openChart(grantId) {
    var body = el("chart-body"); body.innerHTML = '<div class="empty">Opening chart…</div>'; P.openModal("chart-modal");
    api("/hospital/grants/" + encodeURIComponent(grantId) + "/chart").then(function (r) {
      if (guard(r)) return;
      if (!r.ok) { body.innerHTML = "<h2>Can't open this chart</h2><div class=\"msg err\">" + esc(r.message || "Access ended.") + "</div>"; return; }
      var d = r.data, p = d.patient || {}, g = d.grant || {}, sn = d.snapshot || {}, h = "";
      h += '<div class="ch-head"><div class="avatar" style="width:54px;height:54px;font-size:18px">' + esc(initials(p.name)) + '</div><div class="grow"><h2 id="chart-title">' + esc(p.name || "Patient") + '</h2><div class="hint">' + [p.age ? p.age + " yrs" : "", p.sex && p.sex !== "unknown" ? p.sex : "", p.blood_type && p.blood_type !== "unknown" ? "Blood " + p.blood_type : ""].filter(Boolean).map(esc).join(" · ") + "</div></div>" +
        '<div class="row-actions no-print"><button class="btn btn-sm" id="print-chart" type="button">🖨 Print</button>' + (g.can_write && (can("write") || can("write_basic")) ? '<button class="btn btn-sm btn-primary" id="chart-add" type="button">+ Add a record</button>' : "") + "</div></div>";
      // what could hurt the patient goes first, in red, before anything else
      if (d.summary) h += sn.allergies && sn.allergies.length ? '<div class="allergy-bar">⚠ <b>Medicine allergies:</b> ' + sn.allergies.map(esc).join(", ") + (sn.other_allergies && sn.other_allergies.length ? ' <span class="mini">· also ' + sn.other_allergies.map(esc).join(", ") + "</span>" : "") + "</div>" : '<div class="allergy-bar none">No medicine allergies recorded by the patient.</div>';
      var alerts = [];
      if (sn.pregnant) alerts.push('<span class="sev sev-urgent">Pregnant</span>');
      (sn.urgent_checks || []).forEach(function (x) { alerts.push(sevPill(x.triage === "Emergency" ? "emergency" : "urgent") + " Symptom check " + esc(String(x.ts || "").slice(0, 10)) + ": " + esc(x.condition || "")); });
      (sn.vitals_flags || []).forEach(function (f) { alerts.push(sevPill("warning") + " " + esc(f.title || f.message)); });
      if ((sn.abnormal_labs || []).length) alerts.push(sevPill("warning") + " " + sn.abnormal_labs.length + " lab result" + (sn.abnormal_labs.length > 1 ? "s" : "") + " outside range: " + sn.abnormal_labs.slice(0, 4).map(function (m) { return esc(m.name) + " " + esc(m.value == null ? "" : m.value) + " " + esc(m.unit || ""); }).join(", "));
      if (alerts.length) h += '<div class="ch-alerts">' + alerts.map(function (a) { return "<div>" + a + "</div>"; }).join("") + "</div>";
      h += '<div class="notice wait no-print" style="margin:10px 0">Shared by the patient · ' + esc(left(g.expires_ts)) + " · this view is recorded in the audit log." + (g.via === "emergency" ? " <b>Emergency access.</b>" : "") + "</div>";
      var tabs = [["snap", "Snapshot"], ["timeline", "Timeline"]];
      if (d.vitals) tabs.push(["vitals", "Vitals"]);
      if (d.labs || d.imaging) tabs.push(["results", "Results"]);
      tabs.push(["team", "Team records" + (d.records && d.records.length ? " (" + d.records.length + ")" : "")]);
      h += '<div class="ch-tabs no-print" role="tablist">' + tabs.map(function (t, i) { return '<button type="button" role="tab" data-ctab="' + t[0] + '" class="' + (i ? "" : "on") + '">' + t[1] + "</button>"; }).join("") + "</div>";
      // snapshot
      var snap = "";
      if (d.summary) {
        var s = d.summary;
        snap += '<div class="ch-box"><h4>Conditions</h4>' + list(s.conditions) + (s.past_conditions && s.past_conditions.length ? '<div style="margin-top:8px"><b class="mini">Past</b><br>' + list(s.past_conditions) + "</div>" : "") + (s.family_history && s.family_history.length ? '<div style="margin-top:8px"><b class="mini">Family history</b><br>' + list(s.family_history) + "</div>" : "") +
          '<div class="mini" style="margin-top:8px">' + ["Smoking: " + (s.smoking || "not stated"), "Alcohol: " + (s.alcohol || "not stated"), "Exercise: " + (s.exercise || "not stated")].map(esc).join(" · ") + "</div></div>";
      }
      if (d.medicines) snap += '<div class="ch-box"><h4>Current medicines</h4>' + (d.medicines.length ? '<div class="scroll-x"><table class="t"><thead><tr><th>Medicine</th><th>Dose</th><th>Schedule</th></tr></thead><tbody>' + d.medicines.map(function (m) { return "<tr><td>" + esc(m.name) + "</td><td>" + esc(m.dose || "") + "</td><td>" + esc(m.schedule || "") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<span class="mini">None on file</span>') + "</div>";
      if (d.vitals) {
        var L = d.vitals.latest || {}, names = [["sys_bp", "Systolic", "mmHg"], ["dia_bp", "Diastolic", "mmHg"], ["pulse", "Pulse", "bpm"], ["spo2", "SpO₂", "%"], ["temp", "Temp", "°"], ["glucose", "Glucose", "mg/dL"], ["weight", "Weight", "kg"]];
        snap += '<div class="ch-box"><h4>Latest vitals' + (L.ts ? " · " + esc(L.ts) : "") + '</h4><div class="vit">' + (names.filter(function (n) { return L[n[0]] != null; }).map(function (n) { return "<div><b>" + esc(L[n[0]]) + "</b><span>" + n[1] + " " + n[2] + "</span></div>"; }).join("") || '<span class="mini">No readings shared yet</span>') + "</div></div>";
      }
      if (d.symptoms) snap += '<div class="ch-box"><h4>Recent symptom checks</h4>' + (d.symptoms.length ? d.symptoms.slice(0, 6).map(function (x) { return "<div class=\"tl-row\"><span>" + esc(String(x.ts || "").slice(0, 16)) + "</span><span>" + esc(x.condition || "") + (x.triage ? ' <span class="chip">' + esc(x.triage) + "</span>" : "") + "</span></div>"; }).join("") : '<span class="mini">None</span>') + '<p class="mini" style="margin:8px 0 0">Automated pattern matches from what the patient typed, not diagnoses.</p></div>';
      // timeline
      var tl = (d.timeline || []).length ? '<div class="timeline">' + d.timeline.map(function (t) { return '<div class="tl tl-' + esc(t.kind) + '"><span class="tl-dot">' + (KIND_ICON[t.kind] || "•") + '</span><div><time>' + esc(String(t.ts).slice(0, 16)) + "</time><b>" + esc(t.title) + "</b>" + (t.detail ? "<span>" + esc(t.detail) + "</span>" : "") + "</div></div>"; }).join("") + "</div>" : '<div class="empty">Nothing dated has been shared yet.</div>';
      // vitals trends
      var vh = d.vitals ? d.vitals.history || [] : [];
      var vt = d.vitals ? '<div class="trends">' + [trend(vh, "sys_bp", "Blood pressure", "mmHg", 90, 140, "dia_bp"), trend(vh, "pulse", "Pulse", "bpm", 50, 100), trend(vh, "spo2", "SpO₂", "%", 94, 100), trend(vh, "glucose", "Glucose", "mg/dL", 70, 140), trend(vh, "temp", "Temperature", "°", null, null), trend(vh, "weight", "Weight", "kg", null, null)].join("") + "</div>" +
        ((d.vitals.flags || []).map(function (f) { return '<div class="flag"><b>' + esc(f.title) + "</b> " + esc(f.message) + "</div>"; }).join("")) +
        (vh.length > 1 ? '<details class="raw"><summary>All readings (' + vh.length + ')</summary><div class="scroll-x"><table class="t"><thead><tr><th>When</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Glucose</th><th>Temp</th><th>Weight</th></tr></thead><tbody>' + vh.map(function (v) { return "<tr><td>" + esc(v.ts) + "</td><td>" + (v.sys_bp ? esc(v.sys_bp + "/" + v.dia_bp) : "–") + "</td><td>" + esc(v.pulse || "–") + "</td><td>" + esc(v.spo2 || "–") + "</td><td>" + esc(v.glucose || "–") + "</td><td>" + esc(v.temp || "–") + "</td><td>" + esc(v.weight || "–") + "</td></tr>"; }).join("") + "</tbody></table></div></details>" : "") : "";
      if (d.vitals && vt.indexOf("<svg") < 0) vt = '<div class="empty">Trends appear once the patient has shared two or more readings.</div>' + vt;
      // results
      var res = "";
      if (d.labs) res += '<div class="ch-box"><h4>Lab results (confirmed by the patient)</h4>' + (d.labs.headline ? '<p style="margin:0 0 8px;font-weight:700">' + esc(d.labs.headline) + "</p>" : "") + ((d.labs.panels || []).length ? d.labs.panels.map(function (pn) { return '<div style="margin-bottom:10px"><b>' + esc(pn.name) + '</b><div class="scroll-x"><table class="t"><tbody>' + pn.markers.map(function (m) { var bad = /high|low|abnormal|critical/i.test(m.status || ""); return "<tr" + (bad ? ' class="lab-out"' : "") + "><td>" + esc(m.name) + "</td><td><b>" + esc(m.value == null ? "" : m.value) + "</b> " + esc(m.unit || "") + "</td><td>" + esc(m.range || "") + "</td><td>" + esc(m.status || "") + "</td><td>" + esc(m.trend || "") + "</td><td>" + esc(m.date || "") + "</td></tr>"; }).join("") + "</tbody></table></div></div>"; }).join("") : '<span class="mini">No confirmed results</span>') + "</div>";
      if (d.imaging) res += '<div class="ch-box"><h4>Scan reports</h4>' + (d.imaging.length ? d.imaging.map(function (x) { return "<p style='margin:0 0 8px'><b>" + esc(x.modality || "Scan") + "</b> " + esc(x.date || "") + "<br>" + esc(x.summary || x.overall || "") + "</p>"; }).join("") : '<span class="mini">None on file</span>') + "</div>";
      // team records
      var tr = d.records && d.records.length ? d.records.map(function (x) { return '<div class="ch-box rec"><div class="rec-h"><b>' + esc(x.title) + '</b> <span class="chip">' + esc((OPTS && OPTS.record_kinds[x.kind]) || x.kind) + '</span><span class="mini">' + esc(x.by || "") + " · " + esc(when(x.ts)) + '</span></div><div class="rec-b">' + esc(x.text) + "</div></div>"; }).join("") : '<div class="empty">Your team hasn\'t added anything yet.</div>';
      h += '<div class="ch-pane" data-cpane="snap">' + (snap || '<div class="empty">The patient hasn\'t shared a summary.</div>') + '</div><div class="ch-pane" data-cpane="timeline" hidden>' + tl + '</div>' +
        (d.vitals ? '<div class="ch-pane" data-cpane="vitals" hidden>' + vt + "</div>" : "") + (d.labs || d.imaging ? '<div class="ch-pane" data-cpane="results" hidden>' + res + "</div>" : "") + '<div class="ch-pane" data-cpane="team" hidden>' + tr + "</div>";
      h += '<p class="mini" style="margin-top:14px">' + esc(d.disclaimer || "") + "</p>";
      body.innerHTML = h;
      body.querySelector(".ch-tabs") && body.querySelector(".ch-tabs").addEventListener("click", function (e) {
        var b = e.target.closest("[data-ctab]"); if (!b) return;
        [].forEach.call(this.children, function (c) { c.classList.toggle("on", c === b); });
        [].forEach.call(body.querySelectorAll("[data-cpane]"), function (p) { p.hidden = p.getAttribute("data-cpane") !== b.getAttribute("data-ctab"); });
      });
      var pr = el("print-chart"); if (pr) pr.addEventListener("click", function () { [].forEach.call(body.querySelectorAll("[data-cpane]"), function (p) { p.hidden = false; }); window.print(); });
      var ad = el("chart-add"); if (ad) ad.addEventListener("click", function () { P.closeModal("chart-modal"); openRecord(grantId, p.name); });
    });
  }

  // Note templates: headings a clinician fills in.  They are only text; nothing is decided for the clinician.
  var TEMPLATES = {
    note: "Subjective:\n\nObjective:\n\nAssessment:\n\nPlan:\n",
    visit: "Reason for visit:\n\nFindings:\n\nAssessment:\n\nPlan and follow-up:\n",
    prescription: "Prescribed by:\n\nMedicines (name, strength, dose, how often, for how long):\n1.\n\nInstructions:\n",
    lab: "Test:\nResult:\nReference range:\nComment:\n",
    referral: "Referred to (speciality / doctor):\nUrgency:\nReason for referral:\nRelevant history and findings:\nQuestions for the specialist:\n",
    discharge: "Admitted:\nDischarged:\nDiagnosis at discharge:\nCourse in hospital:\nMedicines on discharge:\nFollow-up (when and with whom):\nWarning signs to return for:\n"
  };
  function openRecord(grantId, name) {
    var ORDER = ["note", "visit", "prescription", "lab", "vital", "referral", "discharge"];
    var kinds = can("write") ? ORDER.filter(function (k) { return OPTS.record_kinds[k]; }).concat(Object.keys(OPTS.record_kinds).filter(function (k) { return ORDER.indexOf(k) < 0; })) : ["note", "vital"];
    el("record-body").innerHTML = "<h2>Add to " + esc(name || "the patient") + "'s record</h2><p class=\"sub\">The patient sees this in their app. It is encrypted and recorded in the audit log.</p>" +
      '<form id="rec-form" novalidate><div class="field"><label for="rec-kind">What are you adding?</label><div class="kind-pick" id="rec-kinds">' + kinds.map(function (k, i) { return '<button type="button" data-kind="' + k + '" class="' + (i ? "" : "on") + '">' + esc(OPTS.record_kinds[k]) + "</button>"; }).join("") + '</div><input type="hidden" id="rec-kind" value="' + kinds[0] + '"></div>' +
      '<div class="field"><label for="rec-title">Title</label><input class="input" id="rec-title" maxlength="120" placeholder="e.g. OPD visit"></div>' +
      '<div id="rec-vitals" hidden><div class="grid2">' + [["sys_bp", "Systolic (mmHg)"], ["dia_bp", "Diastolic (mmHg)"], ["pulse", "Pulse (bpm)"], ["spo2", "SpO₂ (%)"], ["temp", "Temperature"], ["glucose", "Glucose (mg/dL)"], ["weight", "Weight (kg)"]].map(function (v) { return '<div class="field"><label>' + v[1] + '</label><input class="input" data-vital="' + v[0] + '" inputmode="decimal"></div>'; }).join("") + "</div></div>" +
      '<div class="field"><label for="rec-text">Details <button type="button" class="link-btn" id="rec-tpl">Use the template</button></label><textarea class="input mono" id="rec-text" rows="9" maxlength="6000"></textarea><div class="mini" id="rec-count">0 / 6000</div></div><button class="btn btn-primary" type="submit">Save to record</button><div class="msg" id="rec-msg" role="status"></div></form>';
    P.openModal("record-modal");
    var kind = el("rec-kind"), text = el("rec-text");
    function setKind(k) {
      kind.value = k;
      [].forEach.call(el("rec-kinds").children, function (b) { b.classList.toggle("on", b.getAttribute("data-kind") === k); });
      show(el("rec-vitals"), k === "vital"); show(el("rec-tpl"), !!TEMPLATES[k]);
      if (!text.value.trim() && TEMPLATES[k]) text.value = TEMPLATES[k];
    }
    el("rec-kinds").addEventListener("click", function (e) {
      var b = e.target.closest("[data-kind]"); if (!b) return;
      var k = b.getAttribute("data-kind");
      if (Object.keys(TEMPLATES).some(function (t) { return text.value === TEMPLATES[t]; })) text.value = "";
      setKind(k);
    });
    el("rec-tpl").addEventListener("click", function () { if (!text.value.trim() || window.confirm("Replace what you've written with the template?")) text.value = TEMPLATES[kind.value] || ""; text.focus(); });
    text.addEventListener("input", function () { el("rec-count").textContent = text.value.length + " / 6000"; });
    setKind(kinds[0]);
    el("rec-form").addEventListener("submit", function (e) {
      e.preventDefault(); var msg = el("rec-msg"), vitals = {};
      [].forEach.call(document.querySelectorAll("[data-vital]"), function (i) { if (i.value.trim() !== "") vitals[i.getAttribute("data-vital")] = parseFloat(i.value); });
      var body = text.value === TEMPLATES[kind.value] ? "" : text.value;
      api("/hospital/grants/" + encodeURIComponent(grantId) + "/records", { method: "POST", body: { kind: kind.value, title: el("rec-title").value, text: body, vitals: kind.value === "vital" ? vitals : undefined } }).then(function (r) {
        if (guard(r)) return;
        if (r.ok) { P.toast(r.message); P.closeModal("record-modal"); } else say(msg, r.message || "Couldn't save.", "err");
      });
    });
  }

  /* ---------- command palette (Ctrl/⌘ K) and "/" to search ---------- */
  var CMD_SEL = 0, CMD_ITEMS = [];
  function openCmdk() {
    if (!ME || ME.mfa_setup_needed) return;
    show(el("cmdk"), true); var i = el("cmdk-in"); i.value = ""; drawCmdk(); i.focus();
    if (!ROSTER.length && can("roster")) api("/hospital/roster").then(function (r) { if (r && r.ok) { ROSTER = r.items; drawCmdk(); } });
  }
  function closeCmdk() { show(el("cmdk"), false); }
  function drawCmdk() {
    var q = el("cmdk-in").value.trim().toLowerCase();
    var pages = [["overview", "Overview", "🏠"], ["patients", "Patients", "👥"], ["connect", "Connect a patient", "🔗"], ["team", "Team", "🧑‍⚕️"], ["activity", "Activity log", "📜"], ["security", "My security", "🔐"]]
      .filter(function (p) { return (p[0] !== "team" || can("team")) && (p[0] !== "activity" || can("audit")) && (p[0] !== "connect" || can("request")) && (p[0] !== "patients" || can("roster")); });
    var people = ROSTER.filter(function (r) { return stateOf(r) === "active"; }).map(function (r) { return { kind: "patient", id: r.id, label: r.patient_name || "Patient", hint: (r.reference ? r.reference + " · " : "") + left(r.expires_ts) }; });
    CMD_ITEMS = people.concat(pages.map(function (p) { return { kind: "page", id: p[0], label: p[1], hint: "Go to", icon: p[2] }; }))
      .filter(function (it) { return !q || (it.label + " " + (it.hint || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
    CMD_SEL = Math.min(CMD_SEL, Math.max(0, CMD_ITEMS.length - 1));
    el("cmdk-list").innerHTML = CMD_ITEMS.length ? CMD_ITEMS.map(function (it, i) { return '<button type="button" role="option" class="' + (i === CMD_SEL ? "on" : "") + '" data-i="' + i + '"><span class="ci">' + (it.kind === "patient" ? '<span class="avatar sm">' + esc(initials(it.label)) + "</span>" : it.icon) + "</span><b>" + esc(it.label) + '</b><span class="mini">' + esc(it.hint || "") + "</span></button>"; }).join("") : '<div class="empty">No match.</div>';
  }
  function runCmd(it) {
    if (!it) return; closeCmdk();
    if (it.kind === "patient") { if (can("read")) openChart(it.id); else { tabNow = "patients"; render(); } }
    else { tabNow = it.id; render(); }
  }
  el("cmdk-in").addEventListener("input", function () { CMD_SEL = 0; drawCmdk(); });
  el("cmdk-in").addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); CMD_SEL = Math.min(CMD_ITEMS.length - 1, CMD_SEL + 1); drawCmdk(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); CMD_SEL = Math.max(0, CMD_SEL - 1); drawCmdk(); }
    else if (e.key === "Enter") { e.preventDefault(); runCmd(CMD_ITEMS[CMD_SEL]); }
  });
  el("cmdk-list").addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) runCmd(CMD_ITEMS[+b.getAttribute("data-i")]); });
  el("cmdk").addEventListener("click", function (e) { if (e.target === el("cmdk")) closeCmdk(); });
  document.addEventListener("keydown", function (e) {
    if (!ME) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); if (el("cmdk").hidden) openCmdk(); else closeCmdk(); return; }
    if (e.key === "Escape" && !el("cmdk").hidden) { closeCmdk(); return; }
    var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
    if (e.key === "/" && !typing && tabNow === "patients" && el("pt-q")) { e.preventDefault(); el("pt-q").focus(); }
  });

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
    var A = window.QCAccess;
    Promise.all([api("/hospital/team"), A ? A.load() : Promise.resolve(null)]).then(function (rs) {
      var r = rs[0], RB = rs[1];
      if (guard(r)) return;
      var roleDesc = r.roles || {};
      var lab = function (k) { return A ? A.label(k) : k; };
      var h = '<div class="three"><div class="card" style="grid-column:1/-1"><h2>Your team</h2><p class="sub">Give each person the smallest role that lets them do their job.</p><div class="scroll-x"><table class="t"><thead><tr><th>Person</th><th>Roles</th><th>Status</th><th></th></tr></thead><tbody>' +
        (r.team || []).map(function (t) {
          return '<tr><td><b>' + esc(t.name) + '</b><br><span class="mini">' + esc(t.email) + '</span></td><td>' + t.roles.map(function (x) { return '<span class="tag teal">' + esc(lab(x)) + "</span>"; }).join(" ") + '</td><td>' + esc(t.status) + (t.mfa ? ' <span class="tag">2-step on</span>' : "") + '</td><td><div class="row-actions">' +
            '<button class="btn btn-sm" data-roles="' + esc(t.id) + '" data-name="' + esc(t.name) + '" data-cur="' + esc(t.roles.join(",")) + '" type="button">Change roles</button>' +
            (t.status === "disabled" ? '<button class="btn btn-sm" data-enable="' + esc(t.id) + '" type="button">Re-enable</button>' : '<button class="btn btn-sm btn-danger" data-disable="' + esc(t.id) + '" type="button">Disable</button>') +
            (t.mfa ? '<button class="btn btn-sm btn-ghost" data-mfareset="' + esc(t.id) + '" type="button">Reset 2-step</button>' : "") + '</div></td></tr>';
        }).join("") + '</tbody></table></div></div>' +
        '<div class="card"><h2>Invite someone</h2><form id="inv-form" novalidate><div class="field"><label for="v-name">Name</label><input class="input" id="v-name" maxlength="120"></div><div class="field"><label for="v-email">Work e-mail</label><input class="input" id="v-email" type="email"></div>' +
        '<div class="lbl">Roles</div>' + (A && RB ? A.roleChecks(["nurse"]) : Object.keys(roleDesc).map(function (k) { return '<label class="scope"><input type="checkbox" data-role="' + k + '"' + (k === "nurse" ? " checked" : "") + '><span>' + esc(k) + '<br><span class="mini">' + esc(roleDesc[k]) + '</span></span></label>'; }).join("")) +
        '<div style="margin-top:12px"><button class="btn btn-primary" type="submit">Send invitation</button></div><div class="msg" id="v-msg" role="status"></div></form></div>' +
        '<div class="card"><h2>Organisation details</h2><form id="org-form" novalidate><div class="field"><label>Phone</label><input class="input" id="o-phone" value="' + esc(ME.org.phone || "") + '"></div><div class="field"><label>City</label><input class="input" id="o-city" value="' + esc(ME.org.city || "") + '"></div><div class="field"><label>State</label><input class="input" id="o-state" value="' + esc(ME.org.state || "") + '"></div><div class="field"><label>Website</label><input class="input" id="o-web" value="' + esc(ME.org.website || "") + '"></div><div class="field"><label>ABDM facility ID</label><input class="input" id="o-abdm" value="' + esc(ME.org.abdm_facility_id || "") + '"></div><button class="btn" type="submit">Save</button><div class="msg" id="o-msg"></div></form></div></div>';
      if (A && RB && RB.catalog) h = h.replace('<div class="card"><h2>Invite someone</h2>', '<div class="card ra-card" style="grid-column:1/-1"><div class="card-h"><h2>Roles and permissions</h2><button class="btn btn-sm btn-primary" type="button" data-rbac>Edit what roles can do</button></div><p class="sub">Change what a role can do, or make your own roles such as "Senior receptionist". It applies to everyone with that role straight away.</p><div class="ra-sum">' +
        RB.roles.map(function (x) { return '<button type="button" class="ra-chip" data-rbac="' + esc(x.key) + '"><b>' + esc(x.label) + "</b><span>" + x.perms.length + " permissions · " + x.people + (x.people === 1 ? " person" : " people") + (x.builtin ? (x.changed ? " · changed" : "") : " · custom") + "</span></button>"; }).join("") + '</div></div><div class="card"><h2>Invite someone</h2>');
      box.innerHTML = h;
      if (window.QCDoc) window.QCDoc.teamExtras(box);
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
    else if ((t = e.target.closest("[data-rbac]")) && window.QCAccess) window.QCAccess.editor(t.getAttribute("data-rbac") || "");
    else if ((t = e.target.closest("[data-roles]")) && window.QCAccess) window.QCAccess.rolePicker(t.getAttribute("data-roles"), t.getAttribute("data-name") || "", t.getAttribute("data-cur").split(","), loadTeam);
    else if ((t = e.target.closest("[data-roles]"))) {
      var cur = t.getAttribute("data-cur").split(","), all = Object.keys((OPTS && OPTS.roles) || { admin: 1, doctor: 1, nurse: 1, frontdesk: 1, lab: 1, manager: 1 }), pick = window.prompt("Roles (comma separated): " + all.join(", "), cur.join(", "));
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

  /* ---------- what hospital-ops.js uses ---------- */
  window.QCHosp = {
    P: P, api: api, esc: esc, el: el, show: show, say: say, when: when, left: left, initials: initials, can: can, guard: guard,
    me: function () { return ME; }, opts: function () { return OPTS; }, roster: function () { return ROSTER; },
    loadRoster: function () { return api("/hospital/roster").then(function (r) { if (r && r.ok) ROSTER = r.items; return ROSTER; }); },
    openChart: openChart, openRecord: openRecord, go: function (t) { tabNow = t; render(); },
  };

  /* ---------- boot ---------- */
  P.init({ requireLogin: false });
  loadOptions().then(function () {
    readFragment();
    window.addEventListener("hashchange", readFragment);
    api("/hospital/me").then(function (r) { if (r.ok) enterPortal(); });
  });
})();
