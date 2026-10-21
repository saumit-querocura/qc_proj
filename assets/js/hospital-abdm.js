/* ABDM in the portal: verify or create a patient's ABHA at the desk, and the facility's ABDM setup.
 * The Aadhaar number and OTPs are sent once to our server (which encrypts them for ABDM) and are cleared from the
 * screen straight away; nothing here stores them.  Plugs into hospital.js through window.QCHosp; exposes window.QCAbha. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function M() { return window.QCHms.M; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  function say(n, m, k) { H().say(n, m, k); }
  var LAYER = 2, CFG = null, P = null, AFTER = null, TXN = "";

  function cfg() { return api("/hospital/abdm").then(function (r) { CFG = r && r.ok ? r : null; return CFG; }); }
  function box(html) { return M().modal('<h2 id="ops-title">ABHA · ' + esc(P.name) + "</h2>" + html, false, LAYER); }

  function open(p, after) {
    P = p; AFTER = after; TXN = "";
    cfg().then(function (c) {
      if (!c) return toast("Couldn't reach ABDM settings.", "err");
      if (!c.enabled || !c.platform.configured) {
        box('<div class="notice wait">' + (!c.platform.configured ? "ABDM isn’t switched on for QueroCura’s servers yet." : "Your facility hasn’t turned on ABDM yet.") + "</div>" +
          (H().can("org") && c.platform.configured ? '<button type="button" class="btn btn-primary" id="ab-go-set">Set up ABDM</button>' : '<p class="sub">Ask your administrator to turn it on in ABDM setup.</p>'));
        var g = el("ab-go-set"); if (g) g.onclick = function () { M().close(LAYER); settings(); };
        return;
      }
      start();
    });
  }

  function start() {
    var b = box((P.abha_verified ? '<div class="ab-ok">✓ ABHA verified: <b>' + esc(P.abha_address || P.abha || "") + "</b></div>" : "") +
      '<div class="seg ab-seg" role="tablist"><button type="button" class="on" data-ab-tab="have">Has an ABHA</button><button type="button" data-ab-tab="new">Create an ABHA</button></div>' +
      '<form id="ab-have" novalidate><p class="sub">ABDM sends the patient an OTP. Find their ABHA by:</p>' +
      '<div class="ab-methods"><label><input type="radio" name="ab-m" value="abha-number" checked> ABHA number</label><label><input type="radio" name="ab-m" value="mobile"> Mobile number</label><label><input type="radio" name="ab-m" value="aadhaar"> Aadhaar</label></div>' +
      '<div class="field"><label for="ab-v" id="ab-v-l">ABHA number (14 digits)</label><input class="input" id="ab-v" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="20" placeholder="91-1234-5678-9012"></div>' +
      '<button class="btn btn-primary" type="submit">Send OTP</button><div class="msg" id="ab-msg" role="status"></div></form>' +
      '<form id="ab-new" novalidate hidden><p class="sub">Read this to the patient and ask for their agreement:</p><blockquote class="ab-consent">' + esc(CFG.consent_text) + "</blockquote>" +
      '<label class="hp-check"><input type="checkbox" id="ab-agree"> <span>The patient agrees</span></label>' +
      '<div class="field"><label for="ab-aad">Aadhaar number</label><input class="input" id="ab-aad" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="14" placeholder="12 digits"></div>' +
      '<button class="btn btn-primary" type="submit">Send OTP to the Aadhaar mobile</button><div class="msg" id="ab-msg2" role="status"></div>' +
      '<p class="mini">The Aadhaar number is encrypted for ABDM and never stored by QueroCura.</p></form>');
    var labels = { "abha-number": ["ABHA number (14 digits)", "91-1234-5678-9012", 20], mobile: ["Mobile number linked with the ABHA", "10 digits", 14], aadhaar: ["Aadhaar number", "12 digits", 14] };
    b.onchange = function (e) {
      if (e.target.name === "ab-m") { var l = labels[e.target.value]; el("ab-v-l").textContent = l[0]; el("ab-v").placeholder = l[1]; el("ab-v").maxLength = l[2]; el("ab-v").value = ""; el("ab-v").focus(); }
    };
    b.onclick = function (e) {
      var t = e.target.closest("[data-ab-tab]"); if (!t) return;
      [].forEach.call(b.querySelectorAll("[data-ab-tab]"), function (x) { x.classList.toggle("on", x === t); });
      el("ab-have").hidden = t.getAttribute("data-ab-tab") !== "have"; el("ab-new").hidden = t.getAttribute("data-ab-tab") !== "new";
    };
    el("ab-have").onsubmit = function (e) {
      e.preventDefault();
      var m = (b.querySelector("[name=ab-m]:checked") || {}).value, v = el("ab-v").value, btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true; say(el("ab-msg"), "Asking ABDM…");
      api("/hospital/abdm/verify/start", { method: "POST", body: { patient_id: P.id, method: m, value: v } }).then(function (r) {
        btn.disabled = false;
        if (m === "aadhaar") el("ab-v").value = "";
        if (!r.ok) return say(el("ab-msg"), r.message, "err");
        TXN = r.txn; otpStep("verify", r.message);
      });
    };
    el("ab-new").onsubmit = function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button[type=submit]");
      if (!el("ab-agree").checked) return say(el("ab-msg2"), "Read the consent to the patient and tick that they agree.", "err");
      btn.disabled = true; say(el("ab-msg2"), "Asking ABDM…");
      var a = el("ab-aad").value; el("ab-aad").value = "";
      api("/hospital/abdm/enrol/start", { method: "POST", body: { patient_id: P.id, aadhaar: a, consent: true } }).then(function (r) {
        btn.disabled = false; a = "";
        if (!r.ok) return say(el("ab-msg2"), r.message, "err");
        TXN = r.txn; otpStep("enrol", r.message);
      });
    };
  }

  function otpStep(kind, sent) {
    box('<p class="sub">' + esc(sent || "OTP sent.") + "</p><form id=\"ab-otp\" novalidate>" +
      '<div class="field"><label for="ab-o">OTP</label><input class="input ab-otp" id="ab-o" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 digits"></div>' +
      (kind === "enrol" ? '<div class="field"><label for="ab-mob">Patient’s mobile for their ABHA</label><input class="input" id="ab-mob" type="tel" maxlength="14" value="' + esc(P.phone || "") + '"></div>' : "") +
      '<button class="btn btn-primary" type="submit">' + (kind === "enrol" ? "Create ABHA" : "Verify") + '</button> <button type="button" class="btn btn-ghost" id="ab-back">Start again</button><div class="msg" id="ab-msg" role="status"></div></form>');
    el("ab-o").focus();
    el("ab-back").onclick = start;
    el("ab-otp").onsubmit = function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button[type=submit]"), otp = el("ab-o").value;
      el("ab-o").value = ""; btn.disabled = true; say(el("ab-msg"), "Checking with ABDM…");
      var req = kind === "enrol" ? api("/hospital/abdm/enrol/finish", { method: "POST", body: { txn: TXN, otp: otp, mobile: el("ab-mob").value } })
        : api("/hospital/abdm/verify/finish", { method: "POST", body: { txn: TXN, otp: otp } });
      req.then(function (r) {
        btn.disabled = false;
        if (!r.ok) return say(el("ab-msg"), r.message, "err");
        if (r.choose) return chooseStep(r.choose);
        if (kind === "enrol") return r.linked ? done(r.profile, r.message) : profileStep(r.profile, r.match);
        profileStep(r.profile, r.match);
      });
    };
  }

  function chooseStep(list) {
    box('<p class="sub">Several ABHAs use this number. Which is ' + esc(P.name.split(" ")[0]) + '’s?</p><div class="ab-list">' + list.map(function (a) {
      return '<button type="button" class="ab-acc" data-ab-pick="' + esc(a.abha_number) + '"><b>' + esc(a.name) + "</b><small>" + esc(a.abha_address || "") + " · " + esc(a.abha_number) + "</small></button>";
    }).join("") + '</div><div class="msg" id="ab-msg" role="status"></div>').onclick = function (e) {
      var t = e.target.closest("[data-ab-pick]"); if (!t) return;
      api("/hospital/abdm/verify/choose", { method: "POST", body: { txn: TXN, abha_number: t.getAttribute("data-ab-pick") } }).then(function (r) {
        if (!r.ok) return say(el("ab-msg"), r.message, "err");
        profileStep(r.profile, r.match);
      });
    };
  }

  function card(pr) {
    return '<div class="ab-card"><div class="ab-flag" aria-hidden="true">🪪</div><div class="grow"><small>Ayushman Bharat Health Account</small><b>' + esc(pr.name) + "</b>" +
      '<span class="ab-num">' + esc(pr.abha_number) + "</span><span>" + esc(pr.abha_address) + "</span><small>" + esc([pr.gender, pr.year_of_birth ? "born " + pr.year_of_birth : "", pr.mobile].filter(Boolean).join(" · ")) +
      (pr.kyc ? " · KYC verified" : "") + "</small></div></div>";
  }

  function profileStep(pr, match) {
    var b = box(card(pr) + (match.ok ? '<p class="ab-good">✓ Name, sex and year of birth match this patient’s record.</p>' :
      '<div class="notice wait">' + match.problems.map(esc).join("<br>") + "</div>" + (match.blocking ? "" : '<div class="field"><label for="ab-why">Checked the patient’s identity? Say how, to link anyway</label><input class="input" id="ab-why" maxlength="200" placeholder="e.g. saw her Aadhaar card; age on our record was a guess"></div>')) +
      (match.blocking ? "" : '<button type="button" class="btn btn-primary" id="ab-link">Link this ABHA to ' + esc(P.name) + "</button>") + ' <button type="button" class="btn btn-ghost" id="ab-back">Start again</button><div class="msg" id="ab-msg" role="status"></div>');
    el("ab-back").onclick = start;
    var l = el("ab-link");
    if (l) l.onclick = function () {
      l.disabled = true;
      api("/hospital/abdm/link", { method: "POST", body: { txn: TXN, reason: el("ab-why") ? el("ab-why").value : "" } }).then(function (r) {
        l.disabled = false;
        if (!r.ok) return say(el("ab-msg"), r.message, "err");
        done(pr, r.message);
      });
    };
    void b;
  }

  function done(pr, msg) {
    box('<div class="ab-ok">✓ ' + esc(msg) + "</div>" + card(pr) + '<div class="ab-cardimg" id="ab-img"><span class="mini">Fetching the ABHA card…</span></div>' +
      '<div class="row"><a class="btn" id="ab-dl" hidden download="abha-card.png">Download ABHA card</a> <button type="button" class="btn btn-primary" id="ab-close">Done</button></div>');
    el("ab-close").onclick = function () { M().close(LAYER); if (AFTER) AFTER(); };
    fetch(H().P.API + "/hospital/abdm/card/" + encodeURIComponent(TXN), { credentials: "include" }).then(function (x) { return x.ok ? x.blob() : null; }).then(function (blob) {
      var w = el("ab-img"); if (!w) return;
      if (!blob) { w.innerHTML = '<span class="mini">The ABHA card isn’t available right now. The patient can download it from the ABHA app.</span>'; return; }
      var u = URL.createObjectURL(blob); w.innerHTML = '<img alt="ABHA card" src="' + u + '">'; var d = el("ab-dl"); d.href = u; d.hidden = false;
    }).catch(function () {});
    toast(msg);
  }

  /* ---------------------------------------------------------------- the facility's ABDM setup (admin) */
  function settings() {
    cfg().then(function (c) {
      if (!c) return;
      var pf = c.platform;
      var b = M().modal('<h2 id="ops-title">ABDM · Ayushman Bharat Digital Mission</h2><p class="sub">Verify and create patients’ ABHAs at the desk, and let patients check in by scanning your ABDM QR (Scan &amp; Share).</p>' +
        '<div class="ab-plat ' + (pf.configured ? "ok" : "no") + '">' + (pf.configured ? "✓ QueroCura is connected to ABDM (" + esc(pf.env) + ")" : "QueroCura’s ABDM connection isn’t set up on the server yet.") + "</div>" +
        '<form id="ab-set" novalidate><label class="hp-check"><input type="checkbox" id="as-on"' + (c.enabled ? " checked" : "") + '> <span><b>Use ABDM at this facility</b></span></label>' +
        '<div class="field"><label for="as-hip">HFR facility id</label><input class="input" id="as-hip" maxlength="40" value="' + esc(c.hip_id) + '" placeholder="e.g. IN2710000001"><span class="hint">Your facility’s id in the Health Facility Registry (facility.abdm.gov.in).</span></div>' +
        '<button class="btn btn-primary" type="submit">Save</button> <button type="button" class="btn" id="as-check">Check the connection</button><div class="msg" id="as-msg" role="status"></div><div id="as-res"></div></form>' +
        '<details class="ab-steps"><summary>How to go live</summary><ol><li>Register your facility in the Health Facility Registry and note its HFR id.</li><li>In the HFR portal, link your facility to QueroCura as its software (bridge).</li><li>Enter the HFR id here and turn ABDM on.</li><li>Print your facility’s Scan &amp; Share QR from the HFR portal for reception.</li></ol></details>' +
        (c.activity && c.activity.length ? '<h3>Recent ABDM messages</h3><ul class="mind-ev">' + c.activity.map(function (a) { return "<li><span class=\"mini\">" + esc(H().when(a.ts)) + "</span> " + esc((a.direction === "in" ? "From ABDM: " : "To ABDM: ") + a.kind + " · " + a.status + (a.detail ? " · " + a.detail : "")) + "</li>"; }).join("") + "</ul>" : ""), true, 1);
      el("ab-set").onsubmit = function (e) {
        e.preventDefault();
        api("/hospital/abdm", { method: "POST", body: { enabled: el("as-on").checked, hip_id: el("as-hip").value.trim() } }).then(function (r) { say(el("as-msg"), r.message, r.ok ? "ok" : "err"); });
      };
      el("as-check").onclick = function () {
        say(el("as-msg"), "Checking with ABDM…");
        api("/hospital/abdm/check").then(function (r) {
          say(el("as-msg"), "");
          el("as-res").innerHTML = '<ul class="ab-check"><li class="' + (r.session ? "ok" : "no") + '">' + (r.session ? "✓ Signed in to ABDM" : "✗ Can’t sign in to ABDM") + "</li>" +
            (r.facility_listed === null ? "" : '<li class="' + (r.facility_listed ? "ok" : "no") + '">' + (r.facility_listed ? "✓ Your facility is linked to QueroCura’s bridge" : "✗ Your facility isn’t linked to QueroCura’s bridge yet") + "</li>") +
            (r.problems || []).map(function (p) { return '<li class="no">' + esc(p) + "</li>"; }).join("") + "</ul>";
        });
      };
      void b;
    });
  }

  window.QCAbha = { open: open, settings: settings };
})();
