/* QueroCura for Hospitals: the setup questions (hospital/setup/).
 * One question at a time; the server's plan engine turns the answers into modules, departments, wards and beds, roles
 * and a go-live checklist.  A new organisation carries the answers into its application; a signed-in administrator
 * saves them to the organisation and applies the plan from the portal's Setup tab.
 */
(function () {
  "use strict";
  var P = QCPage, esc = P.esc, api = P.api;
  function el(id) { return document.getElementById(id); }
  var KEY = "qc_setup";
  var Q = [], A = {}, at = 0, trail = [], STAFF = null, liveT = null, liveSeq = 0;

  /* ------------------------------------------------------------ the hospital in 3D */
  function with3d(fn) { if (window.QC3D) fn(window.QC3D); else window.addEventListener("qc3d-ready", function () { fn(window.QC3D); }, { once: true }); }
  /* the building the answers describe: reception and OPD on the ground, diagnostics, wards, ICU and theatres above */
  function planToTwin(p) {
    var floors = [], deps = p.departments || [], kinds = {};
    deps.forEach(function (d) { kinds[d.kind] = (kinds[d.kind] || 0) + 1; });
    var er = deps.some(function (d) { return d.kind === "emergency"; });
    var clinical = deps.filter(function (d) { return d.kind === "clinical"; }).length;
    floors.push({ name: p.tier === "diagnostic" ? "Collection" : "Reception · OPD" + (er ? " · ER" : ""), kind: er ? "er" : "opd", rooms: Math.max(2, Math.min(18, clinical * 2 + (er ? 4 : 0))) });
    var diag = deps.filter(function (d) { return d.kind === "diagnostic"; }).length;
    if (diag) floors.push({ name: deps.filter(function (d) { return d.kind === "diagnostic"; }).map(function (d) { return d.name.replace("Laboratory", "Lab").replace("Radiology", "Imaging"); }).slice(0, 2).join(" · "), kind: "lab", rooms: Math.min(12, 4 + diag * 3) });
    var groups = { ward: 0, maternity: 0, daycare: 0, icu: 0 };
    (p.wards || []).forEach(function (w) {
      var k = w.kind === "icu" ? "icu" : w.kind === "maternity" ? "maternity" : w.kind === "daycare" ? "daycare" : w.kind === "emergency" ? null : "ward";
      if (k) groups[k] += w.beds;
    });
    var wardFloors = Math.min(4, Math.ceil(groups.ward / 18));
    for (var i = 0; i < wardFloors; i++) floors.push({ name: wardFloors > 1 ? "Wards " + String.fromCharCode(65 + i) : "Wards", kind: "ward", rooms: Math.max(2, Math.min(18, Math.ceil(groups.ward / wardFloors))) });
    if (groups.maternity) floors.push({ name: "Maternity", kind: "maternity", rooms: Math.max(2, Math.min(14, groups.maternity)) });
    if (groups.daycare) floors.push({ name: "Day care", kind: "daycare", rooms: Math.max(2, Math.min(12, groups.daycare)) });
    if (groups.icu) floors.push({ name: "ICU", kind: "icu", rooms: Math.max(2, Math.min(16, groups.icu)) });
    if (p.theatres) floors.push({ name: p.theatres === 1 ? "Theatre" : p.theatres + " theatres", kind: "ot", rooms: Math.max(2, Math.min(12, p.theatres * 2)) });
    return { floors: floors.slice(0, 10), helipad: p.tier === "hospital" || p.tier === "enterprise", ambulance: er };
  }
  var LIVE3D = null, LIVE_CFG = { floors: [{ name: "Reception", kind: "opd", rooms: 4 }], helipad: false, ambulance: false };
  function live3d(cfg) {
    if (cfg) LIVE_CFG = cfg;
    if (LIVE3D) { LIVE3D.update(LIVE_CFG); return; }
    if (live3d.pending) return;
    live3d.pending = true;
    with3d(function (Q) { Q.twin(el("hs-twin"), LIVE_CFG, { compact: true }).then(function (api) { LIVE3D = api; api.update(LIVE_CFG); }); });
  }

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function keep() { try { sessionStorage.setItem(KEY, JSON.stringify(A)); } catch (e) {} }
  function screen(id) { ["hs-intro", "hs-ask", "hs-plan"].forEach(function (s) { el(s).hidden = s !== id; }); window.scrollTo(0, 0); }

  function visible(q) {
    if (!q.show) return true;
    return Object.keys(q.show).every(function (k) {
      var v = A[k], want = q.show[k];
      return Array.isArray(v) ? v.some(function (x) { return want.indexOf(x) >= 0; }) : want.indexOf(v) >= 0;
    });
  }
  function shown() { return Q.filter(visible); }

  /* ------------------------------------------------------------ asking */
  function ask() {
    var list = shown(), q = Q[at];
    var pos = list.indexOf(q);
    el("hs-bar").style.width = Math.round(100 * pos / list.length) + "%";
    el("hs-step").textContent = "Question " + (pos + 1) + " of " + list.length;
    el("hs-title").textContent = q.title;
    el("hs-help").textContent = q.help || "";
    el("hs-help").hidden = !q.help;
    el("hs-back").style.visibility = trail.length ? "visible" : "hidden";
    el("hs-skip").hidden = q.id === "facility";
    var b = el("hs-body"), v = A[q.id];
    if (q.type === "single") {
      b.innerHTML = '<div class="hs-opts' + (q.options.length > 4 ? " many" : "") + '" role="radiogroup">' + q.options.map(function (o, i) {
        return '<button type="button" role="radio" aria-checked="' + (v === o.v) + '" class="hs-opt' + (v === o.v ? " on" : "") + '" data-v="' + esc(o.v) + '">' +
          (o.icon ? '<span class="hs-ic">' + o.icon + "</span>" : "") + "<b>" + esc(o.label) + '</b><kbd>' + (i + 1) + "</kbd></button>";
      }).join("") + "</div>";
      el("hs-next").hidden = !v;
    } else if (q.type === "multi") {
      var cur = Array.isArray(v) ? v : [];
      b.innerHTML = '<div class="hs-chips">' + q.options.map(function (o) {
        var on = cur.indexOf(o.v) >= 0;
        return '<button type="button" aria-pressed="' + on + '" class="hs-chip' + (on ? " on" : "") + '" data-v="' + esc(o.v) + '"><i aria-hidden="true">' + (on ? "✓" : "+") + "</i>" + esc(o.label) + "</button>";
      }).join("") + "</div>" + (q.max ? '<p class="mini hs-max" id="hs-max">Pick up to ' + q.max + ".</p>" : "");
      el("hs-next").hidden = false;
    } else {
      b.innerHTML = '<div class="hs-num"><input class="input" id="hs-n" type="number" inputmode="numeric" min="' + q.min + '" max="' + q.max + '" value="' + (v != null ? esc(v) : "") + '" placeholder="Type a number">' +
        '<div class="hs-presets">' + q.presets.map(function (n) { return '<button type="button" class="hs-chip sm' + (v === n ? " on" : "") + '" data-n="' + n + '">' + n + "</button>"; }).join("") + "</div></div>";
      el("hs-next").hidden = false;
      setTimeout(function () { var i = el("hs-n"); if (i) i.focus(); }, 30);
    }
    el("hs-title").focus({ preventScroll: true });
  }

  function next() {
    var q = Q[at];
    if (q.type === "number") {
      var raw = el("hs-n").value.trim();
      if (raw !== "") {
        var n = parseInt(raw, 10);
        if (isNaN(n) || n < q.min || n > q.max) { P.toast("Enter a number between " + q.min + " and " + q.max + ".", "err"); return; }
        A[q.id] = n;
      } else if (q.id !== "facility") delete A[q.id];
    }
    if (q.type === "single" && !A[q.id] && q.id === "facility") return;
    keep(); live();
    trail.push(at);
    for (var i = at + 1; i < Q.length; i++) if (visible(Q[i])) { at = i; ask(); return; }
    finish();
  }
  function back() { if (!trail.length) { screen("hs-intro"); return; } at = trail.pop(); ask(); }

  el("hs-body").addEventListener("click", function (e) {
    var q = Q[at], t;
    if ((t = e.target.closest(".hs-opt"))) {
      A[q.id] = t.getAttribute("data-v");
      [].forEach.call(el("hs-body").querySelectorAll(".hs-opt"), function (x) { x.classList.toggle("on", x === t); x.setAttribute("aria-checked", x === t); });
      setTimeout(next, 170);
      return;
    }
    if ((t = e.target.closest("[data-n]"))) { el("hs-n").value = t.getAttribute("data-n"); next(); return; }
    if ((t = e.target.closest(".hs-chip"))) {
      var v = t.getAttribute("data-v"), cur = Array.isArray(A[q.id]) ? A[q.id].slice() : [], i = cur.indexOf(v);
      if (i >= 0) cur.splice(i, 1);
      else {
        if (q.max && cur.length >= q.max) { var m = el("hs-max"); if (m) { m.classList.remove("shake"); void m.offsetWidth; m.classList.add("shake"); } return; }
        if (v === "none") cur = []; else cur = cur.filter(function (x) { return x !== "none"; });
        cur.push(v);
      }
      A[q.id] = cur;
      [].forEach.call(el("hs-body").querySelectorAll(".hs-chip"), function (x) { var on = cur.indexOf(x.getAttribute("data-v")) >= 0; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); x.querySelector("i").textContent = on ? "✓" : "+"; });
      keep(); live();
    }
  });
  el("hs-next").addEventListener("click", next);
  el("hs-back").addEventListener("click", back);
  el("hs-skip").addEventListener("click", function () { var q = Q[at]; if (q.type !== "number") delete A[q.id]; else el("hs-n").value = ""; next(); });
  document.addEventListener("keydown", function (e) {
    if (el("hs-ask").hidden) return;
    var q = Q[at];
    if (e.key === "Enter" && !(e.target.closest && e.target.closest(".hs-opt,.hs-chip"))) { e.preventDefault(); if (q.type !== "single" || A[q.id]) next(); return; }
    if (q.type === "single" && /^[1-9]$/.test(e.key) && e.target.tagName !== "INPUT") { var b = el("hs-body").querySelectorAll(".hs-opt")[+e.key - 1]; if (b) b.click(); }
    if (e.key === "Escape") back();
  });

  /* ------------------------------------------------------------ the live preview */
  function live() {
    clearTimeout(liveT);
    liveT = setTimeout(function () {
      if (!A.facility) return;
      var my = ++liveSeq;
      api("/hospital/setup/plan", { method: "POST", body: { answers: A } }).then(function (r) {
        if (my !== liveSeq || !r.ok) return;
        var p = r.plan, on = p.modules.filter(function (m) { return m.on; });
        live3d(planToTwin(p));
        el("hs-live").innerHTML = '<div class="hs-live-tier">' + esc(p.tier_label) + '</div><p class="mini">' + esc(p.summary) + "</p>" +
          '<div class="hs-live-n"><div><b>' + on.length + "</b><span>modules</span></div><div><b>" + p.departments.length + "</b><span>departments</span></div><div><b>" + p.beds + "</b><span>beds</span></div></div>" +
          '<div class="hs-live-mods">' + on.map(function (m) { return "<span>" + esc(m.label) + "</span>"; }).join("") + "</div>";
      });
    }, 220);
  }

  /* ------------------------------------------------------------ the plan */
  function finish() {
    el("hs-plan").innerHTML = '<div class="hs-wrap"><div class="empty">Putting your plan together…</div></div>';
    screen("hs-plan");
    api("/hospital/setup/plan", { method: "POST", body: { answers: A } }).then(function (r) {
      if (!r.ok) { el("hs-plan").innerHTML = '<div class="hs-wrap"><div class="msg err">' + esc(r.message || "Couldn't make the plan. Please try again.") + '</div><button class="btn" type="button" data-again>Back to the questions</button></div>'; return; }
      renderPlan(r.plan);
    });
  }

  function renderPlan(p) {
    var on = p.modules.filter(function (m) { return m.on; }), off = p.modules.filter(function (m) { return !m.on; });
    var maxBeds = Math.max.apply(null, p.wards.map(function (w) { return w.beds; }).concat([1]));
    var admin = STAFF && STAFF.perms.indexOf("org") >= 0;
    var h = '<div class="hs-wrap">';
    h += '<div class="hs-hero"><span class="hp-eyebrow">Your QueroCura plan</span><h1>' + esc(p.tier_label) + '</h1><p class="lead">' + esc(p.summary) + "</p>" +
      '<div class="hs-facts"><div><b>' + on.length + "</b><span>of " + p.modules.length + " modules on</span></div>" +
      "<div><b>" + p.departments.length + "</b><span>departments</span></div>" + (p.beds ? "<div><b>" + p.beds + "</b><span>beds in " + p.wards.length + " wards</span></div>" : "") +
      (p.theatres ? "<div><b>" + p.theatres + "</b><span>operation theatre" + (p.theatres === 1 ? "" : "s") + "</span></div>" : "") +
      "<div><b>" + esc(p.golive) + "</b><span>to go live</span></div></div>" + actions(admin, true) + "</div>";
    h += '<section class="hs-sec hs-3d"><div class="hs-3d-copy"><span class="hp-kicker">Your hospital, in 3D</span><h2>Built from your answers.</h2><p class="sub">Each floor is a part of the plan: reception and OPD on the ground, then diagnostics, wards, ICU and theatres. Rooms fill, empty and are cleaned as the day goes on. Drag to look around.</p>' +
      '<div class="tw-stats"><div><b id="pt-occ">–</b><span>beds occupied</span></div><div><b id="pt-move">–</b><span>people on the move</span></div><div><b id="pt-clean">–</b><span>rooms being cleaned</span></div><div><b id="pt-amb">–</b><span>ambulance</span></div></div>' +
      '<p class="mini">A simulation of your plan, for illustration.</p></div><div class="lx-twin-stage"><div class="tw-3d" id="plan-twin" role="img" aria-label="A 3D model of your planned hospital"></div><div class="tw-labels" id="plan-twin-labels" aria-hidden="true"></div></div></section>';
    if (p.highlights.length) {
      h += '<section class="hs-sec"><h2>Put first</h2><p class="sub">What you said you most want to fix, and where it’s handled.</p><div class="hs-hl">' + p.highlights.map(function (x, i) {
        return '<div class="hs-hl-i"><i>' + (i + 1) + "</i><div><b>" + esc(x.priority) + '</b><span class="tag">' + esc(x.module_label) + "</span><p>" + esc(x.text) + "</p></div></div>";
      }).join("") + "</div></section>";
    }
    h += '<section class="hs-sec"><h2>Modules</h2><p class="sub">Switched on to start with. Your administrator can turn any of them on or off later.</p><div class="hs-mods">' +
      on.concat(off).map(function (m) {
        return '<div class="hs-mod' + (m.on ? " on" : "") + '"><div class="hs-mod-h"><b>' + esc(m.label) + '</b><span class="pill ' + (m.on ? "ok" : "") + '">' + (m.on ? (m.essential ? "Always on" : "On") : "Off for now") + "</span></div>" +
          '<p class="mini">' + esc(m.what) + "</p><p>" + esc(m.why) + "</p></div>";
      }).join("") + "</div></section>";
    h += '<section class="hs-sec hs-two"><div><h2>Departments</h2><p class="sub">Each has its own queue and team.</p><div class="hs-depts">' + p.departments.map(function (d) {
      return '<div class="hs-dept"><span class="hs-code">' + esc(d.code) + "</span><div><b>" + esc(d.name) + '</b><span class="mini">' + esc(d.room) + " · " + esc(d.why) + "</span></div></div>";
    }).join("") + "</div></div>";
    h += "<div><h2>Wards and beds</h2>" + (p.wards.length ? '<p class="sub">Numbered beds, ready for the live bed board.</p><div class="hs-wards">' + p.wards.map(function (w) {
      return '<div class="hs-ward"><div class="hs-ward-h"><b>' + esc(w.name) + '</b><span class="mini">' + esc(w.kind_label) + (w.dept ? " · " + esc(w.dept) : "") + "</span><em>" + w.beds + '</em></div><div class="hs-bar"><i style="width:' + Math.max(4, Math.round(100 * w.beds / maxBeds)) + '%"></i></div></div>';
    }).join("") + "</div>" : '<p class="sub">No beds. If you add some later, the bed board switches on.</p>') + "</div></section>";
    h += '<section class="hs-sec hs-two"><div><h2>Who to invite</h2><div class="hs-roles">' + p.roles.map(function (r) { return '<div><b>' + esc(r.label) + "</b><span>" + esc(r.who) + "</span></div>"; }).join("") +
      '</div><p class="mini">Each person signs in with their own account and an authenticator app, and sees only what their role needs.</p></div>';
    h += '<div><h2>Go-live checklist</h2><ol class="hs-steps">' + p.checklist.map(function (s) { return "<li><b>" + esc(s.title) + "</b><span>" + esc(s.detail) + "</span></li>"; }).join("") + "</ol></div></section>";
    if (p.notes.length) h += '<section class="hs-sec"><h2>Good to know</h2><ul class="hs-notes">' + p.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul></section>";
    h += '<section class="hs-sec hs-end"><h2>' + (admin ? "Save this plan to " + esc(STAFF.org.name) : "Ready when you are") + "</h2><p class=\"sub\">" +
      (admin ? "Then apply it from the Setup tab: we create the departments, wards and beds and switch on these modules. Nothing you've already set up is changed." :
        "Apply with this plan and it comes with your application. Once you're in, one click creates the departments, wards and beds and switches on these modules. We verify every organisation before it can reach a patient.") +
      "</p>" + actions(admin, false) + "</section></div>";
    el("hs-plan").innerHTML = h;
    var cfg = planToTwin(p);
    with3d(function (Q) {
      var s = function (id) { return el(id); };
      if (window.__planTwin) { try { window.__planTwin.R.dispose(); window.__planTwin.R.forceContextLoss(); } catch (x) {} window.__planTwin = null; }
      Q.twin(el("plan-twin"), cfg, { labels: el("plan-twin-labels"), stats: { occ: s("pt-occ"), move: s("pt-move"), clean: s("pt-clean"), amb: s("pt-amb") } }).then(function (api) { window.__planTwin = api; });
    });
    countUp(el("hs-plan").querySelectorAll(".hs-facts b"));
    reveal(el("hs-plan").querySelectorAll(".hs-sec"));
    if (P.confetti && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) P.confetti(["🏥", "✨", "💛", "🩺"], 26);
  }
  /* numbers count up; sections rise into view as you scroll */
  function countUp(nodes) {
    [].forEach.call(nodes, function (b) {
      var m = /^(\d+)(.*)$/.exec(b.textContent.trim()); if (!m) return;
      var end = +m[1], rest = m[2], t0 = performance.now();
      (function step(now) { var k = Math.min(1, (now - t0) / 1100), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(end * e) + rest; if (k < 1) requestAnimationFrame(step); })(t0);
    });
  }
  function reveal(nodes) {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: 0.12 });
    [].forEach.call(nodes, function (n) { n.classList.add("rv"); io.observe(n); });
  }

  function actions(admin, top) {
    return '<div class="hp-cta hs-acts">' + (admin ? '<button class="btn btn-primary" type="button" data-save>Save to my organisation →</button>' :
      '<a class="btn btn-primary" href="../#apply" data-apply>Apply with this plan →</a>') +
      '<button class="btn hp-ghost" type="button" data-again>Change answers</button>' + (top ? "" : '<button class="btn hp-ghost" type="button" data-print>Print the plan</button>') + "</div>";
  }

  el("hs-plan").addEventListener("click", function (e) {
    if (e.target.closest("[data-again]")) { trail = []; at = 0; screen("hs-ask"); ask(); return; }
    if (e.target.closest("[data-print]")) { window.print(); return; }
    if (e.target.closest("[data-apply]")) { keep(); return; }
    var s = e.target.closest("[data-save]");
    if (s) {
      s.disabled = true;
      api("/hospital/setup", { method: "POST", body: { answers: A } }).then(function (r) {
        s.disabled = false;
        if (!r.ok) { P.toast(r.message || "Couldn't save.", "err"); return; }
        try { sessionStorage.removeItem(KEY); } catch (x) {}
        location.href = "../#setup";
      });
    }
  });

  /* ------------------------------------------------------------ start */
  el("hs-start").addEventListener("click", function () { trail = []; at = 0; screen("hs-ask"); ask(); live(); live3d(); });
  P.init({ requireLogin: false });
  A = load();
  Promise.all([api("/hospital/setup/questions"), api("/hospital/me")]).then(function (rs) {
    var qs = rs[0], me = rs[1];
    if (!qs.ok) { el("hs-start").disabled = true; el("hs-start").insertAdjacentHTML("afterend", '<div class="msg err">' + esc(qs.message || "Couldn't load the questions.") + "</div>"); return; }
    Q = qs.questions;
    if (me.ok && !me.mfa_setup_needed) {
      STAFF = me;
      el("hs-signin").textContent = "Back to the portal"; el("hs-signin").setAttribute("href", "../");
      if (me.perms.indexOf("org") >= 0) {
        api("/hospital/setup").then(function (s) {
          if (s.ok && s.answers && Object.keys(s.answers).length && !Object.keys(A).length) A = s.answers;
          if (/[?&]edit=1/.test(location.search)) { trail = []; at = 0; screen("hs-ask"); ask(); live(); }
        });
      }
    }
  });
})();
