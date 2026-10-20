/* QueroCura for Doctors: sign up as a solo practice, ask to join a clinic with its code, or sign in.
 * A successful sign-in goes straight to the portal (the same staff sign-in hospitals use). */
(function () {
  "use strict";
  var P = window.QCPage;
  P.init({ requireLogin: false });
  function el(id) { return document.getElementById(id); }
  function say(node, text, kind) { node.className = "msg" + (kind ? " " + kind : ""); node.textContent = text || ""; }
  function v(id) { return (el(id).value || "").trim(); }

  /* tabs and the buttons that open them */
  var FORMS = { solo: "dr-solo", join: "dr-join", signin: "dr-signin" };
  function tab(which, focus) {
    Object.keys(FORMS).forEach(function (k) { el(FORMS[k]).hidden = k !== which; });
    [].forEach.call(document.querySelectorAll("[data-dr-tab]"), function (b) { var on = b.getAttribute("data-dr-tab") === which; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    if (focus) { var f = el(FORMS[which]).querySelector("input:not([type=checkbox]), select"); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (x) {} }, 300); }
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-dr-tab]"); if (t) { tab(t.getAttribute("data-dr-tab"), true); return; }
    var g = e.target.closest("[data-dr-go]"); if (g) { e.preventDefault(); tab(g.getAttribute("data-dr-go"), true); el("start").scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  var hash = (location.hash || "").replace("#", "");
  if (hash === "signin" || hash === "join") { tab(hash); setTimeout(function () { el("start").scrollIntoView(); }, 50); }

  /* councils */
  P.api("/hospital/doctor/options").then(function (r) {
    var list = (r && r.councils) || ["National Medical Commission (NMC)", "Other"];
    [].forEach.call(document.querySelectorAll("[data-councils]"), function (s) {
      s.innerHTML = '<option value="">Choose your council</option>' + list.map(function (c) { return "<option>" + P.esc(c) + "</option>"; }).join("");
    });
  });

  function pwOk(msg, a, b) {
    if (v(a).length < 8) { say(msg, "Please use at least 8 characters for the password.", "err"); return false; }
    if (el(a).value !== el(b).value) { say(msg, "The two passwords don't match.", "err"); return false; }
    return true;
  }
  function goSignin(email, text) {
    tab("signin"); el("dn-email").value = email; say(el("dn-msg"), text, "ok"); el("dn-pw").focus();
  }

  /* solo practice */
  el("dr-solo").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = el("ds-msg"), btn = e.target.querySelector("button[type=submit]");
    var body = { name: v("ds-name"), email: v("ds-email"), council: el("ds-council").value, reg_no: v("ds-reg"), qualification: v("ds-qual"), specialty: v("ds-spec"),
      practice_name: v("ds-practice"), phone: v("ds-phone"), city: v("ds-city"), state: v("ds-state"), password: el("ds-pw").value,
      declare: el("ds-declare").checked, accept_terms: el("ds-terms").checked, website_url: el("ds-site").value };
    if (body.name.length < 3) return say(msg, "Please enter your full name.", "err");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return say(msg, "Please enter a valid e-mail.", "err");
    if (!body.council) return say(msg, "Please choose your medical council.", "err");
    if (body.reg_no.length < 3) return say(msg, "Please enter your registration number.", "err");
    if (!pwOk(msg, "ds-pw", "ds-pw2")) return;
    if (!body.declare || !body.accept_terms) return say(msg, "Please tick both confirmations.", "err");
    btn.disabled = true; say(msg, "Creating your practice…");
    P.api("/hospital/doctor/register", { method: "POST", body: body }).then(function (r) {
      btn.disabled = false;
      if (!r || !r.ok) return say(msg, (r && r.message) || "Something went wrong. Please try again.", "err");
      P.confetti(["🩺", "✨", "💚"], 18);
      goSignin(body.email, r.message);
    });
  });

  /* joining a clinic: check the code as it's typed */
  var codeOk = false, lastCode = "";
  function cleanCode(s) { return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
  el("dj-code").addEventListener("input", function () {
    var c = cleanCode(this.value), box = el("dj-org");
    this.value = c.length > 4 ? c.slice(0, 4) + " " + c.slice(4) : c;
    if (c.length < 8) { codeOk = false; box.hidden = true; return; }
    if (c === lastCode) return;
    lastCode = c;
    P.api("/hospital/doctor/join/preview", { method: "POST", body: { code: c } }).then(function (r) {
      box.hidden = false;
      codeOk = !!(r && r.ok);
      box.className = "dj-org " + (codeOk ? "ok" : "bad");
      box.innerHTML = codeOk ? '<span aria-hidden="true">🏥</span><div><b>' + P.esc(r.org.name) + "</b><small>" + P.esc([r.org.org_type, r.org.city].filter(Boolean).join(" · ")) + "</small></div>"
        : P.esc((r && r.message) || "We couldn't find that code.");
    });
  });
  el("dr-join").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = el("dj-msg"), btn = e.target.querySelector("button[type=submit]");
    var body = { code: cleanCode(el("dj-code").value), name: v("dj-name"), email: v("dj-email"), council: el("dj-council").value, reg_no: v("dj-reg"),
      qualification: v("dj-qual"), specialty: v("dj-spec"), note: v("dj-note"), password: el("dj-pw").value,
      declare: el("dj-declare").checked, accept_terms: el("dj-terms").checked, website_url: el("dj-site").value };
    if (body.code.length !== 8 || !codeOk) return say(msg, "Enter your clinic's 8-character code first.", "err");
    if (body.name.length < 3) return say(msg, "Please enter your full name.", "err");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return say(msg, "Please enter a valid e-mail.", "err");
    if (!body.council || body.reg_no.length < 3) return say(msg, "Please add your council and registration number.", "err");
    if (!pwOk(msg, "dj-pw", "dj-pw2")) return;
    if (!body.declare || !body.accept_terms) return say(msg, "Please tick both confirmations.", "err");
    btn.disabled = true; say(msg, "Sending your request…");
    P.api("/hospital/doctor/join", { method: "POST", body: body }).then(function (r) {
      btn.disabled = false;
      if (!r || !r.ok) return say(msg, (r && r.message) || "Something went wrong. Please try again.", "err");
      e.target.reset(); el("dj-org").hidden = true; codeOk = false; lastCode = "";
      say(msg, r.message, "ok");
    });
  });

  /* sign in */
  el("dr-signin").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = el("dn-msg"), btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; say(msg, "");
    P.api("/hospital/login", { method: "POST", body: { email: v("dn-email"), password: el("dn-pw").value, code: v("dn-code") } }).then(function (r) {
      btn.disabled = false;
      if (r && r.ok) { say(msg, "Signed in. Opening your practice…", "ok"); location.href = "../hospital/"; return; }
      if (r && r.mfa_required) { el("dn-code-wrap").hidden = false; el("dn-code").focus(); }
      say(msg, (r && r.message) || "That didn't work.", r && r.pending ? "" : "err");
    });
  });
})();
