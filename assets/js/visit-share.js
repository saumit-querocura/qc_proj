/* Share with my doctor: the visit summary as a private link with a QR code and a 6-digit PIN.
 * The doctor scans or opens the link, types the PIN, and reads the same summary, built fresh from the latest answers.
 * The link stops on its own, opens a limited number of times, can be switched off, and shows when it was opened. */
(function () {
  "use strict";
  var P = window.QCPage, esc = P.esc, api = P.api;
  var V = null, LINK = null, POLL = null, LOCK = null, BOX = null, PICK = { hours: null, views: 5 };
  var EXTRAS = [
    ["summary", "🛡️", "Allergies and conditions", true],
    ["medicines", "💊", "Medicines", true],
    ["vitals", "❤️", "Home readings", true],
    ["labs", "🧪", "Lab results", true],
    ["imaging", "🩻", "Scan reports", false],
    ["symptoms", "🔍", "Symptom checks", true]
  ];
  var ON = {};
  EXTRAS.forEach(function (x) { ON[x[0]] = x[3]; });
  function el(id) { return document.getElementById(id); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function reduced() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function when(ts, opts) { return new Date(ts * 1000).toLocaleString([], opts || { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  function visitWhen(s) { var d = new Date(String(s || "").replace(" ", "T")); return isNaN(d) ? "" : d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  function spaced(pin) { pin = String(pin || ""); return pin.slice(0, 3) + " " + pin.slice(3); }

  /* what the doctor will see, counted from the summary on screen */
  function counts(s) {
    var c = s.checks_grouped || {}, n = 0;
    (c.groups || []).forEach(function (g) { n += g.checks || 1; });
    return {
      summary: (s.allergies || []).length + (s.conditions || []).length ? [(s.allergies || []).length ? plural(s.allergies.length, "allergy", "allergies") : "", (s.conditions || []).length ? plural(s.conditions.length, "condition") : ""].filter(Boolean).join(", ") : "Age, sex, any allergies",
      medicines: (s.medicines || []).length ? plural(s.medicines.length, "medicine") + ((s.adherence || {}).has_data ? ", doses taken" : "") : "None added yet",
      vitals: (s.readings || []).length ? plural(s.readings.length, "reading type") + ", with trends" : "None logged yet",
      labs: (s.flagged_labs || []).length ? plural(s.flagged_labs.length, "value") + " outside the usual range, plus all results" : "Confirmed results from CuraVault",
      imaging: (s.scans || []).length ? plural(s.scans.length, "report") : "Reports from CuraVault",
      symptoms: n ? plural(n, "recent check") : (s.symptom_checks || []).length ? plural(s.symptom_checks.length, "check") : "None recently"
    };
  }
  function always(s) {
    var q = (s.questions || []).length, st = (s.story || []).length, so = (s.stands_out || []).length;
    return [
      ["👀", "At a glance", "a two-line summary"],
      so ? ["⚠️", "Worth their attention", plural(so, "point")] : null,
      st ? ["💬", "Your story, in your words", plural(st, "short paragraph")] : null,
      ["📝", "What you want to cover", "your reason, worries and hopes"],
      q ? ["❓", "Your questions", plural(q, "question")] : null
    ].filter(Boolean);
  }
  function hourChoices() {
    var v = V.prep() && V.prep().visit, out = [], now = Date.now();
    if (v && v.when) {
      var t = new Date(String(v.when).replace(" ", "T")).getTime();
      if (!isNaN(t)) {
        var h = Math.ceil((t - now) / 3600000) + 24;                     // through the visit day, and a little after
        if (h > 0 && h <= 168) out.push([Math.max(6, h), "Until the day after my visit", true]);
      }
    }
    out.push([24, "1 day", !out.length], [72, "3 days", false], [168, "7 days", false]);
    return out;
  }

  /* ---------------- set-up ---------------- */
  function setup(s) {
    var c = counts(s), hc = hourChoices();
    if (PICK.hours == null) PICK.hours = hc.filter(function (x) { return x[2]; })[0][0];
    var thin = !s.concern && !(s.story || []).length;
    return '<section class="vs" id="vs-card" aria-labelledby="vs-h">' +
      '<div class="vs-top"><div class="vs-badge" aria-hidden="true">📲</div><div><h2 id="vs-h">Share with my doctor</h2>' +
      '<p class="vs-lead">Your doctor can read this whole summary on their phone or computer, before you go in or while you sit together. They don’t need an app or an account.</p></div></div>' +
      '<ol class="vs-steps" aria-label="How it works"><li><b>1</b><span>You make a private link here</span></li><li><b>2</b><span>Your doctor scans the QR code, or you send the link</span></li><li><b>3</b><span>You tell them a 6-digit PIN, and it opens</span></li></ol>' +
      (thin ? '<div class="vs-tip">🌱 Your own words aren’t in yet. <button type="button" class="linkish" data-go="prep">Answer a few questions</button> first so your doctor hears it from you. You can also share now: anything you add later shows up on the same link.</div>' : "") +
      '<div class="vs-lbl">Always included</div><div class="vs-always">' + always(s).map(function (x) { return '<div class="vs-in"><span aria-hidden="true">' + x[0] + "</span><div><b>" + esc(x[1]) + "</b><small>" + esc(x[2]) + "</small></div></div>"; }).join("") + "</div>" +
      '<div class="vs-lbl">Also include <small>Tap to leave anything out</small></div><div class="vs-extras">' +
      EXTRAS.map(function (x) { return '<label class="vs-x' + (ON[x[0]] ? " on" : "") + '"><input type="checkbox" data-x="' + x[0] + '"' + (ON[x[0]] ? " checked" : "") + '><span class="vs-xi" aria-hidden="true">' + x[1] + '</span><span><b>' + esc(x[2]) + "</b><small>" + esc(c[x[0]]) + "</small></span></label>"; }).join("") + "</div>" +
      '<div class="vs-two"><div><div class="vs-lbl" id="vs-hl">How long should it work?</div><div class="vs-seg" role="radiogroup" aria-labelledby="vs-hl">' +
      hc.map(function (x) { return '<button type="button" role="radio" data-h="' + x[0] + '" aria-checked="' + (x[0] === PICK.hours) + '"' + (x[0] === PICK.hours ? ' class="on"' : "") + ">" + esc(x[1]) + "</button>"; }).join("") + "</div></div>" +
      '<div><div class="vs-lbl" id="vs-vl">Who will open it?</div><div class="vs-seg" role="radiogroup" aria-labelledby="vs-vl">' +
      [[5, "Just my doctor"], [15, "My doctor and their team"]].map(function (x) { return '<button type="button" role="radio" data-v="' + x[0] + '" aria-checked="' + (x[0] === PICK.views) + '"' + (x[0] === PICK.views ? ' class="on"' : "") + ">" + esc(x[1]) + "</button>"; }).join("") +
      '</div><p class="vs-fine" id="vs-vh">' + viewsHint() + "</p></div></div>" +
      '<ul class="vs-safe"><li>🔑 <span>Opens only with a PIN that you give out</span></li><li>⏳ <span>Stops working by itself</span></li><li>✋ <span>You can switch it off at any time</span></li><li>👀 <span>You can see when it was opened</span></li></ul>' +
      '<div class="vs-go"><button class="btn btn-primary vs-make" id="vs-make" type="button">Create my doctor’s link</button><span class="msg" id="vs-msg" role="status"></span></div>' +
      '<div id="vs-old"></div></section>';
  }
  function viewsHint() { return PICK.views === 5 ? "It can be opened up to 5 times, so your doctor can look again during the visit." : "It can be opened up to 15 times, for a nurse or another doctor too."; }

  function wireSetup() {
    var card = el("vs-card"); if (!card) return;
    card.addEventListener("change", function (e) {
      var k = e.target.getAttribute && e.target.getAttribute("data-x"); if (!k) return;
      ON[k] = e.target.checked; e.target.closest(".vs-x").classList.toggle("on", e.target.checked);
    });
    card.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".vs-seg button"); if (!b) return;
      var seg = b.parentNode;
      Array.prototype.forEach.call(seg.children, function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
      if (b.hasAttribute("data-h")) PICK.hours = +b.getAttribute("data-h");
      if (b.hasAttribute("data-v")) { PICK.views = +b.getAttribute("data-v"); el("vs-vh").textContent = viewsHint(); }
    });
    el("vs-make").addEventListener("click", create);
    loadOld();
  }

  function loadOld() {
    var ev = V.event(); if (!ev) return;
    api("/share/list").then(function (d) {
      var box = el("vs-old"); if (!box || !d || !d.ok) return;
      var mine = (d.links || []).filter(function (l) { return l.state === "active" && l.event === ev; });
      if (!mine.length) return;
      box.innerHTML = '<div class="vs-oldc"><div class="vs-lbl">Already shared for this visit</div>' + mine.map(function (l) {
        return '<div class="vs-oldr"><span>🔗 Works until ' + esc(when(l.expires_ts)) + " · " + (l.views ? "opened " + plural(l.views, "time") : "not opened yet") + '</span><button type="button" class="btn btn-sm" data-off="' + esc(l.id) + '">Turn it off</button></div>';
      }).join("") + '<p class="vs-fine">The PIN is only shown once, when a link is made. If you’ve lost it, make a new link and turn the old one off.</p></div>';
      box.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-off]"); if (!b) return;
        b.disabled = true;
        api("/share/" + b.getAttribute("data-off") + "/revoke", { method: "POST" }).then(function (x) {
          if (x && x.ok) { b.parentNode.querySelector("span").textContent = "🔒 Turned off. Nobody can open it now."; b.remove(); } else { b.disabled = false; P.toast((x && x.message) || "Couldn't turn it off.", "err"); }
        });
      });
    });
  }

  function create() {
    var btn = el("vs-make"), msg = el("vs-msg"), v = V.prep() && V.prep().visit;
    var scopes = ["visit"].concat(EXTRAS.filter(function (x) { return ON[x[0]]; }).map(function (x) { return x[0]; }));
    btn.disabled = true; msg.className = "msg"; msg.textContent = "Making your private link…";
    V.flush().then(function () {
      return api("/share/create", { method: "POST", body: { scopes: scopes, hours: PICK.hours, max_views: PICK.views, label: ("Visit: " + (v && v.title || "doctor")).slice(0, 40), brief: { event: V.event() || "" } } });
    }).then(function (r) {
      btn.disabled = false;
      if (!r || !r.ok) { msg.className = "msg err"; msg.textContent = (r && r.message) || "Couldn't make the link just now. Please try again."; return; }
      LINK = r; LINK.scopes = scopes; LINK.qr = null; LINK.seen = null;
      draw();
      api("/share/qr", { method: "POST", body: { url: r.url } }).then(function (x) {
        if (x && x.ok && LINK === r) { LINK.qr = x.png; Array.prototype.forEach.call(document.querySelectorAll(".vs-qr img"), function (i) { i.src = x.png; i.hidden = false; }); var w = el("vs-qrwait"); if (w) w.remove(); }
        else { var w2 = el("vs-qrwait"); if (w2) w2.textContent = "The QR code didn’t load. The link and PIN still work."; }
      });
      startPoll();
      var c = el("vs-card"); if (c) window.scrollTo({ top: Math.max(0, c.getBoundingClientRect().top + window.scrollY - 84), behavior: reduced() ? "auto" : "smooth" });
    });
  }

  /* ---------------- the link is ready ---------------- */
  function messages() {
    var v = V.prep() && V.prep().visit, s = V.summary() || {}, name = ((s.patient || {}).name || "").split(" ")[0];
    var visit = v ? " for my visit" + (v.when ? " on " + visitWhen(v.when) : "") : "";
    var until = when(LINK.expires_ts);
    return {
      link: "Hello Doctor, here is my visit summary" + visit + ", made with QueroCura. Please open this private link: " + LINK.url + "\nI’ll give you the 6-digit PIN separately. The link works until " + until + "." + (name ? "\n– " + name : ""),
      pin: "The PIN for my visit summary is " + spaced(LINK.pin) + ".",
      subject: "My visit summary" + visit
    };
  }
  function ready() {
    var m = messages(), until = when(LINK.expires_ts), ex = EXTRAS.filter(function (x) { return ON[x[0]]; }).map(function (x) { return x[2].toLowerCase(); });
    return '<section class="vs vs-done" id="vs-card" aria-labelledby="vs-h">' +
      '<div class="vs-top"><div class="vs-badge ok" aria-hidden="true">✅</div><div><h2 id="vs-h">Your doctor’s link is ready</h2>' +
      '<p class="vs-lead">Works until <b>' + esc(until) + "</b> · opens up to " + esc(LINK.max_views) + " times · includes your summary" + (ex.length ? ", " + esc(ex.join(", ")) : "") + ".</p></div></div>" +
      '<div class="vs-share"><div class="vs-qr"><div class="vs-qrin"><img alt="QR code that opens your visit summary" width="220" height="220"' + (LINK.qr ? ' src="' + LINK.qr + '"' : " hidden") + ">" + (LINK.qr ? "" : '<span id="vs-qrwait">Making the QR code…</span>') + "</div>" +
      '<button type="button" class="btn btn-sm" id="vs-full">⛶ Show it full screen</button></div>' +
      '<div class="vs-how2">' +
      '<div class="vs-st"><b class="n">1</b><div><b>In the room</b><p>Let your doctor scan the QR code with their phone camera. To show it big, tap “Show it full screen”.</p></div></div>' +
      '<div class="vs-st"><b class="n">2</b><div><b>Tell them this PIN</b><div class="vs-pin" aria-label="PIN ' + esc(String(LINK.pin).split("").join(" ")) + '">' + String(LINK.pin).split("").map(function (d, i) { return (i === 3 ? '<i aria-hidden="true"></i>' : "") + '<span aria-hidden="true">' + esc(d) + "</span>"; }).join("") + '</div>' +
      '<p>Say it out loud, or send it in a different message from the link. Then a forwarded link alone can’t open your summary.</p><button type="button" class="btn btn-sm" id="vs-cpin">Copy PIN</button></div></div>' +
      '<div class="vs-st"><b class="n">3</b><div><b>Or send it before your visit</b><p>So your doctor can read it ahead of time.</p><div class="vs-send">' +
      '<a class="btn btn-sm vs-wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(m.link) + '">WhatsApp</a>' +
      '<a class="btn btn-sm" href="sms:?&amp;body=' + encodeURIComponent(m.link) + '">Text message</a>' +
      '<a class="btn btn-sm" href="mailto:?subject=' + encodeURIComponent(m.subject) + "&amp;body=" + encodeURIComponent(m.link) + '">Email</a>' +
      '<button type="button" class="btn btn-sm" id="vs-clink">Copy link</button>' +
      (navigator.share ? '<button type="button" class="btn btn-sm" id="vs-native">More…</button>' : "") + "</div></div></div>" +
      "</div></div>" +
      '<div class="vs-live" id="vs-live" role="status" aria-live="polite"><span class="vs-dot"></span><span>Not opened yet. This updates by itself.</span></div>' +
      '<p class="vs-fine">Changed your answers? You don’t need a new link. Your doctor always sees the latest version of your summary.</p>' +
      '<div class="vs-go"><button type="button" class="btn btn-sm" id="vs-again">Make a new link</button><button type="button" class="btn btn-sm btn-danger" id="vs-off">Turn this link off</button></div></section>';
  }

  function wireReady() {
    var m = messages();
    el("vs-full").addEventListener("click", full);
    el("vs-cpin").addEventListener("click", function () { QC.copy(m.pin).then(function () { P.toast("PIN copied. Send it in a separate message from the link.", ""); }, function () { P.toast("Couldn't copy.", "err"); }); });
    el("vs-clink").addEventListener("click", function () { QC.copy(m.link).then(function () { P.toast("Link copied, with a short note. Send the PIN separately.", ""); }, function () { P.toast("Couldn't copy.", "err"); }); });
    var n = el("vs-native"); if (n) n.addEventListener("click", function () { navigator.share({ title: m.subject, text: m.link.replace(LINK.url, "").replace(/\s+\n/, "\n"), url: LINK.url }).catch(function () {}); });
    el("vs-off").addEventListener("click", function () {
      if (!window.confirm("Turn this link off? Your doctor won't be able to open it any more.")) return;
      off(function () { P.toast("The link is off. Nobody can open it now.", ""); });
    });
    el("vs-again").addEventListener("click", function () {
      if (!window.confirm("Make a new link? This one will be turned off, so the old PIN stops working.")) return;
      off(function () { P.toast("Old link turned off. Choose what to include and make a new one.", ""); });
    });
    showSeen();
  }
  function off(done) {
    api("/share/" + LINK.id + "/revoke", { method: "POST" }).then(function (x) {
      if (!(x && x.ok) && !(x && x.status === 404)) { P.toast((x && x.message) || "Couldn't turn it off.", "err"); return; }
      stopPoll(); LINK = null; draw(); done();
    });
  }

  /* ---------------- has my doctor opened it? ---------------- */
  function startPoll() { stopPoll(); POLL = setInterval(check, 20000); }
  function stopPoll() { if (POLL) clearInterval(POLL); POLL = null; }
  function check() {
    if (!LINK || document.visibilityState !== "visible") return;
    api("/share/" + LINK.id + "/log").then(function (l) {
      if (!LINK || !l || !l.ok) return;
      var seen = (l.log || []).filter(function (x) { return x.outcome === "viewed"; }), wrong = (l.log || []).filter(function (x) { return x.outcome === "wrong PIN"; });
      var before = LINK.seen ? LINK.seen.n : 0;
      LINK.seen = { n: seen.length, last: seen[0], wrong: wrong.length };
      showSeen();
      if (seen.length > before) { P.toast("👀 Your doctor just opened your summary.", "ok"); if (el("vs-fs")) closeFull(); }
      if (Date.now() / 1000 > LINK.expires_ts || seen.length >= LINK.max_views) stopPoll();
    });
  }
  function showSeen() {
    var box = el("vs-live"); if (!box || !LINK) return;
    var s = LINK.seen;
    if (!s || !s.n) {
      box.className = "vs-live";
      box.innerHTML = '<span class="vs-dot"></span><span>Not opened yet. This updates by itself.' + (s && s.wrong ? " Someone typed a wrong PIN " + plural(s.wrong, "time") + ". After 5 wrong tries the link pauses for 15 minutes." : "") + "</span>";
      return;
    }
    var left = Math.max(0, LINK.max_views - s.n);
    box.className = "vs-live seen";
    box.innerHTML = '<span class="vs-dot"></span><span><b>Opened ' + plural(s.n, "time") + "</b>, most recently " + esc(when(s.last.ts, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + " on " + esc(s.last.device) + ". " + (left ? plural(left, "more open", "more opens") + " left." : "It can’t be opened again.") + "</span>";
  }

  /* ---------------- full screen, to hold up in the room ---------------- */
  function full() {
    if (!LINK) return;
    var s = V.summary() || {}, name = (s.patient || {}).name || "";
    var d = document.createElement("div");
    d.id = "vs-fs"; d.className = "vs-fs"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "QR code and PIN for your doctor");
    d.innerHTML = '<div class="vs-fsin"><div class="vs-fst">Scan to open ' + (name ? esc(name.split(" ")[0]) + "’s" : "my") + ' visit summary</div>' +
      '<img alt="QR code that opens the visit summary"' + (LINK.qr ? ' src="' + LINK.qr + '"' : "") + '>' +
      '<div class="vs-fsl">Then enter this PIN</div><div class="vs-fsp">' + esc(spaced(LINK.pin)) + "</div>" +
      '<div class="vs-fsn">Point your phone camera at the code. No app needed.</div>' +
      '<button type="button" class="btn" id="vs-fsx">Close</button></div>';
    document.body.appendChild(d);
    document.body.style.overflow = "hidden";
    el("vs-fsx").focus();
    el("vs-fsx").addEventListener("click", closeFull);
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") closeFull(); if (e.key === "Tab") { e.preventDefault(); el("vs-fsx").focus(); } });
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { LOCK = l; }).catch(function () {}); } catch (e) {}
    POLL && check();
  }
  function closeFull() {
    var d = el("vs-fs"); if (d) d.remove();
    document.body.style.overflow = "";
    try { if (LOCK) LOCK.release(); } catch (e) {}
    LOCK = null;
    var b = el("vs-full"); if (b) b.focus();
  }

  function draw() {
    if (!BOX) return;
    var s = V.summary();
    if (!s) { BOX.innerHTML = ""; return; }
    BOX.innerHTML = LINK ? ready() : setup(s);
    if (LINK) wireReady(); else wireSetup();
  }

  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && LINK) check(); });

  window.QCVisitShare = {
    init: function (api_) { V = api_; },
    render: function (box) { BOX = box; draw(); },
    focus: function () {
      var c = el("vs-card"); if (!c) return;
      window.scrollTo({ top: Math.max(0, c.getBoundingClientRect().top + window.scrollY - 84), behavior: reduced() ? "auto" : "smooth" });
      c.classList.remove("vs-ping"); void c.offsetWidth; c.classList.add("vs-ping");
    }
  };
})();
