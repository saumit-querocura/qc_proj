/* QueroCura home page: theme, navigation, the live hero demo, the "how a check works" stepper and the small motion details.
   Everything degrades to a static, readable page without JavaScript, and motion stops for people who ask for less of it. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var calm = root.classList.contains("calm");
  var hi = (window.QCI18n && QCI18n.lang === "hi");
  var t = function (s) { return (window.QCI18n && QCI18n.t) ? QCI18n.t(s) : s; };

  /* ---------- theme ---------- */
  var themeBtn = $("#theme-btn");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") !== "dark";
    root.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("qc-theme", dark ? "dark" : "light"); } catch (e) {}
  });

  /* ---------- nav: solid on scroll, mobile sheet, active section ---------- */
  var nav = $("#nav"), mnav = $("#mnav"), burger = $("#burger");
  function openMenu(open) {
    if (!mnav) return;
    mnav.classList.toggle("open", open);
    document.body.style.overflow = open ? "hidden" : "";
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var f = $("a", mnav); if (f) f.focus(); } else if (burger) burger.focus();
  }
  if (burger) burger.addEventListener("click", function () { openMenu(true); });
  if ($("#mnav-close")) $("#mnav-close").addEventListener("click", function () { openMenu(false); });
  $$("#mnav a").forEach(function (a) { a.addEventListener("click", function () { if (mnav.classList.contains("open")) { mnav.classList.remove("open"); document.body.style.overflow = ""; } }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && mnav && mnav.classList.contains("open")) openMenu(false); });

  var bar = $("#progress"), toTop = $("#to-top"), ticking = false;
  function onScroll() {
    var y = window.scrollY || root.scrollTop, h = root.scrollHeight - window.innerHeight;
    if (nav) nav.classList.toggle("scrolled", y > 8);
    if (bar) bar.style.transform = "scaleX(" + (h > 0 ? Math.min(1, y / h) : 0) + ")";
    if (toTop) toTop.classList.toggle("show", y > 900);
    ticking = false;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" }); });

  var links = $$(".nav-links a[href^='#']");
  if ("IntersectionObserver" in window && links.length) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var secIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var a = byId[e.target.id];
        if (a && e.isIntersecting) { links.forEach(function (l) { l.classList.remove("on"); }); a.classList.add("on"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) secIO.observe(s); });
  }

  /* ---------- already signed in? offer the dashboard instead ---------- */
  fetch("https://app.querocura.com/api/auth/me", { credentials: "include" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.logged_in) return;
      ["#nav-signin", "#m-signin", "#final-signin"].forEach(function (s) { var el = $(s); if (el) el.style.display = "none"; });
      ["#nav-cta", "#m-cta", "#hero-cta", "#final-cta"].forEach(function (s) {
        var el = $(s); if (!el) return;
        el.href = "dashboard/";
        el.textContent = t("Go to your dashboard");
        if (s !== "#nav-cta" && s !== "#m-cta") { var a = document.createElement("span"); a.className = "arr"; a.textContent = " →"; el.appendChild(a); }
      });
    })
    .catch(function () {});

  /* ---------- e-mail: the Gmail app on phones, Gmail compose in a tab on desktop ---------- */
  $$(".mail-link").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var to = "saumit@querocura.com,udantika@querocura.com", sub = "Hi QueroCura";
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) location.href = "mailto:" + to + "?subject=" + encodeURIComponent(sub);
      else window.open("https://mail.google.com/mail/?view=cm&fs=1&to=" + to + "&su=" + encodeURIComponent(sub), "_blank", "noopener");
    });
  });

  /* ---------- reveal on scroll, and things that start when seen ---------- */
  var onSeen = function (el, fn, threshold) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); fn(); } }); }, { threshold: threshold || 0.2 });
    io.observe(el);
  };
  if ("IntersectionObserver" in window) {
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("vis"); rio.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -50px 0px" });
    $$(".reveal").forEach(function (el) { rio.observe(el); });
  } else $$(".reveal").forEach(function (el) { el.classList.add("vis"); });

  /* count-up numbers */
  $$("[data-count]").forEach(function (el) {
    var end = +el.getAttribute("data-count"), suf = el.getAttribute("data-suffix") || "";
    if (calm) return;
    el.textContent = "0" + suf;
    onSeen(el, function () {
      var t0 = performance.now(), dur = 1200;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
        el.textContent = v + suf;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, 0.6);
  });

  /* the fingerprint draws itself when the emergency section comes into view */
  onSeen($("#scanner"), function () { $("#scanner").classList.add("go"); }, 0.4);

  /* insight bars grow in */
  var bars = $("#bars");
  if (bars && !calm) {
    var hs = $$("i", bars).map(function (i) { var h = i.style.getPropertyValue("--h"); i.style.setProperty("--h", "6%"); return h; });
    onSeen(bars, function () { $$("i", bars).forEach(function (i, k) { setTimeout(function () { i.style.setProperty("--h", hs[k]); }, k * 70); }); }, 0.5);
  }

  /* (no cursor effects in the hero: it stays still and calm) */

  /* health score ring */
  var arc = $("#ring-arc"), num = $("#score-num");
  function score(target) {
    if (!arc || !num) return;
    var C = 157, t0 = performance.now(), dur = calm ? 1 : 1600;
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3), v = Math.round(target * e);
      num.textContent = v; arc.setAttribute("stroke-dashoffset", String(C - C * (target / 100) * e));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  setTimeout(function () { score(86); }, calm ? 0 : 500);

  /* a QR-looking pattern (decoration only: the real one is made in the app) */
  function qr(svg, seed) {
    if (!svg) return;
    var n = 21, out = "", s = seed;
    var rnd = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    var finder = function (x, y) { return '<rect x="' + x + '" y="' + y + '" width="7" height="7" fill="#100e2a"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#fff"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" fill="#100e2a"/>'; };
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var inF = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      if (!inF && rnd() > 0.52) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#100e2a"/>';
    }
    svg.innerHTML = out + finder(0, 0) + finder(14, 0) + finder(0, 14);
  }
  qr($("#qr-small"), 7); qr($("#qr-big"), 19);

  /* ---------- the phone: a symptom check that plays itself ---------- */
  var chat = $("#chat"), chips = $("#chips");
  var SCRIPT = [
    { me: "I've had a fever and body ache for 3 days" },
    { cura: "I'm sorry you're feeling unwell. Is there any pain behind your eyes, or in your joints?", opts: ["Behind my eyes", "Joints", "Both", "Neither"], pick: 0 },
    { me: "Behind my eyes" },
    { cura: "Any rash, or bleeding from your gums or nose?", opts: ["Rash", "Bleeding", "Neither"], pick: 2 },
    { me: "Neither" },
    { result: true }
  ];
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(node) {
    chat.appendChild(node);
    while (chat.children.length > 6) chat.removeChild(chat.firstChild);
    requestAnimationFrame(function () { requestAnimationFrame(function () { node.classList.add("in"); }); });
  }
  function resultCard() {
    var c = el("div", "msg cura result");
    var top = el("div", "res-top"); top.appendChild(el("b", "", t("Closest match"))); top.appendChild(el("span", "res-tag", t("SEE A DOCTOR IN 24 H")));
    c.appendChild(top);
    c.appendChild(el("div", "res-name", t("Dengue-like viral fever")));
    var b = el("div", "res-bar"), i = el("i"); b.appendChild(i); c.appendChild(b);
    c.appendChild(el("div", "res-line", "💧 " + t("Fluids in small, frequent sips")));
    c.appendChild(el("div", "res-line", "⚠️ " + t("Go now if bleeding or a rash appears")));
    setTimeout(function () { i.style.width = "78%"; }, 400);
    return c;
  }
  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function play() {
    if (!chat) return;
    chat.innerHTML = ""; chips.innerHTML = "";
    if (calm) {
      SCRIPT.forEach(function (s) {
        if (s.me) add(el("div", "msg me", t(s.me)));
        else if (s.cura) add(el("div", "msg cura", t(s.cura)));
        else add(resultCard());
      });
      return;
    }
    var at = 400;
    SCRIPT.forEach(function (s) {
      if (s.me) {
        later(function () { chips.innerHTML = ""; add(el("div", "msg me", t(s.me))); }, at);
        at += 1100;
      } else if (s.cura || s.result) {
        var typing;
        later(function () { typing = el("div", "msg cura typing"); typing.innerHTML = "<i></i><i></i><i></i>"; add(typing); }, at);
        at += 1100;
        later(function () {
          if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
          add(s.result ? resultCard() : el("div", "msg cura", t(s.cura)));
        }, at);
        at += 700;
        if (s.opts) {
          later(function () {
            chips.innerHTML = "";
            s.opts.forEach(function (o, k) { var c = el("span", "chip", t(o)); chips.appendChild(c); setTimeout(function () { c.classList.add("in"); }, 80 * k); });
          }, at);
          at += 1300;
          later(function () { var c = chips.children[s.pick]; if (c) c.classList.add("pick"); }, at);
          at += 600;
        }
      }
    });
    later(play, at + 5200);
  }
  var heroVisible = true;
  if ("IntersectionObserver" in window && hero) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !heroVisible) { heroVisible = true; play(); }
        else if (!e.isIntersecting && heroVisible) { heroVisible = false; timers.forEach(clearTimeout); timers = []; }
      });
    }, { threshold: 0.05 }).observe(hero);
  }
  play();

  /* ---------- how a check works: tabs that advance on their own ---------- */
  var steps = $$(".step"), panes = $$(".pane"), cur = 0, auto = null, typedTimer = null;
  function typeIt() {
    var out = $("#typed"); if (!out) return;
    var sentence = t("I've had a fever for three days, my whole body aches and there's a headache behind my eyes. It's monsoon here.");
    clearInterval(typedTimer);
    if (calm) { out.textContent = sentence; return; }
    var i = 0; out.textContent = "";
    typedTimer = setInterval(function () { i += 2; out.textContent = sentence.slice(0, i); if (i >= sentence.length) clearInterval(typedTimer); }, 28);
  }
  function show(n, user) {
    cur = n;
    steps.forEach(function (s, k) {
      var on = k === n;
      s.classList.toggle("on", on); s.setAttribute("aria-selected", on ? "true" : "false"); s.tabIndex = on ? 0 : -1;
      var p = $(".prog", s); if (p) { p.style.animation = "none"; void p.offsetWidth; p.style.animation = ""; }
    });
    panes.forEach(function (p, k) { p.classList.toggle("on", k === n); });
    if (n === 0) typeIt();
    clearTimeout(auto);
    if (!calm && !user) auto = setTimeout(function () { show((cur + 1) % steps.length); }, 6000);
  }
  steps.forEach(function (s, k) {
    s.addEventListener("click", function () { show(k, true); });
    s.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); show((k + 1) % steps.length, true); steps[cur].focus(); }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); show((k + steps.length - 1) % steps.length, true); steps[cur].focus(); }
    });
  });
  if (steps.length) onSeen($(".how"), function () { show(0); }, 0.3);


  /* ---------- the language card switches between English and Hindi ---------- */
  var LINES = [
    ["How long have you had the fever?", "आपको बुखार कब से है?"],
    ["Your blood pressure has been steady this week.", "इस हफ़्ते आपका ब्लड प्रेशर स्थिर रहा।"],
    ["See a doctor within 24 hours.", "24 घंटे के भीतर डॉक्टर को दिखाएँ।"],
    ["Your next visit is on Thursday at 10:30.", "आपकी अगली मुलाक़ात गुरुवार 10:30 बजे है।"]
  ];
  var line = $("#lang-line"), ten = $("#lt-en"), thi = $("#lt-hi"), li = 0, lh = hi ? 1 : 0;
  function langTick() {
    if (!line) return;
    line.classList.add("fade");
    setTimeout(function () {
      lh = 1 - lh; if (lh === (hi ? 1 : 0)) li = (li + 1) % LINES.length;
      line.textContent = LINES[li][lh];
      ten.classList.toggle("on", lh === 0); thi.classList.toggle("on", lh === 1);
      line.classList.remove("fade");
    }, 350);
  }
  if (line) {
    line.textContent = LINES[0][lh]; ten.classList.toggle("on", lh === 0); thi.classList.toggle("on", lh === 1);
    if (!calm) setInterval(langTick, 2600);
    thi.style.cursor = ten.style.cursor = "pointer";
    thi.addEventListener("click", function () { if (window.QCI18n) QCI18n.set("hi"); });
    ten.addEventListener("click", function () { if (window.QCI18n) QCI18n.set("en"); });
  }

  /* ---------- seamless marquee: repeat the items once ---------- */
  var mq = $("#mq");
  if (mq) mq.innerHTML += mq.innerHTML;

  /* ---------- only one FAQ open at a time ---------- */
  var faqs = $$(".faq details");
  faqs.forEach(function (d) { d.addEventListener("toggle", function () { if (d.open) faqs.forEach(function (o) { if (o !== d) o.open = false; }); }); });
})();
