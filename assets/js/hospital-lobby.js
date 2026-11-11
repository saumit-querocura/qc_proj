/* The lobby: the facility's own front door.
 *
 * When someone signs in they arrive here, not in a product.  Their hospital's mark sits in the middle of a moving
 * background painted in the hospital's own colours, with the hour's real numbers drifting past, and the day's
 * greeting underneath.  Touch the mark and the lobby opens into their work.
 *
 * Nothing here is decoration over nothing: every figure that drifts past is a live number this person is allowed to
 * see, and the lobby never delays the work behind it (the portal is already built and waiting).
 *
 * window.QCLobby { maybeShow, show, close }
 */
(function () {
  "use strict";
  var EL = null, RAF = 0, T0 = 0, SHOWN = false, RESOLVE = null, BOARD = null;
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return window.QCHosp ? QCHosp.esc(s) : String(s == null ? "" : s); }
  function calm() {
    try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return true; } catch (e) {}
    var c = window.QCTheme && QCTheme.data();
    return !!(c && c.prefs && c.prefs.reduce_motion);
  }

  /* ------------------------------------------------------------------ what the hour looks like */
  function greet(h) { return h < 5 ? "Still here" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Good evening"; }
  function dur(m) { return m == null ? "–" : m < 60 ? m + " min" : (m / 60).toFixed(1) + " hr"; }

  function cardsFrom(board) {
    if (!board || !board.ok || !board.configured || !board.kpi) return [];
    var k = board.kpi, out = [];
    function add(n, label, hot) { if (n != null && n !== "") out.push({ n: String(n), label: label, hot: !!hot }); }
    add(k.opd_waiting, "waiting in " + term("opd", "OPD"));
    add(k.beds_free, "free " + term("bed", "bed") .toLowerCase() + "s");
    add(k.er_open, "in emergency", k.er_overdue > 0);
    add(k.orders_open, "open orders", k.orders_overdue > 0);
    if (k.occupancy_pct != null) add(k.occupancy_pct + "%", term("bed", "bed").toLowerCase() + "s full", k.occupancy_pct >= 90);
    add(k.inpatients, "inpatients");
    if (k.avg_wait_min != null) out.push({ n: dur(k.avg_wait_min), label: "average wait" });
    add(k.admitted_today, "admitted today");
    return out.filter(function (c) { return !/^0( min)?$/.test(c.n) || /full/.test(c.label); }).slice(0, 7);
  }
  function term(k, d) { return window.QCHosp && QCHosp.term ? QCHosp.term(k, d) : d; }

  /* ------------------------------------------------------------------ building it */
  function build(me) {
    var b = (QCTheme.data().branding) || {}, lob = b.lobby || {}, mark = QCTheme.markUrl("mark");
    var who = ((me.staff || {}).name || "").split(" ").filter(function (w) { return !/^(dr|mr|mrs|ms|sr|prof)\.?$/i.test(w); })[0] || (me.staff || {}).name || "";
    var d = new Date();
    var when = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    var wrap = document.createElement("div");
    wrap.className = "lob lob-" + (lob.style || "aurora") + (calm() ? " lob-calm" : "");
    wrap.id = "lob";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", QCTheme.name());
    wrap.innerHTML =
      '<div class="lob-blobs"><i></i><i></i><i></i><i></i></div>' +
      '<canvas class="lob-cv" aria-hidden="true"></canvas>' +
      '<div class="lob-drift" id="lob-drift" aria-hidden="true"></div>' +
      '<div class="lob-mid">' +
        '<button type="button" class="lob-mark" id="lob-go" aria-describedby="lob-hint">' +
          '<span class="lob-ring" aria-hidden="true"></span><span class="lob-ring r2" aria-hidden="true"></span>' +
          (mark ? '<img src="' + esc(mark) + '" alt="">' : '<span class="lob-ini" aria-hidden="true">' + esc(QCTheme.initials()) + "</span>") +
          '<span class="sr-only">Open ' + esc(QCTheme.name()) + "</span>" +
        "</button>" +
        '<h1 class="lob-name"></h1>' +
        '<p class="lob-tag"></p>' +
        '<p class="lob-hello"></p>' +
        '<p class="lob-hint" id="lob-hint"><span class="lob-dot"></span>Tap the mark to open your day</p>' +
      "</div>" +
      '<div class="lob-foot"><span class="lob-live" id="lob-live"></span></div>';
    $(".lob-name", wrap).textContent = QCTheme.name();
    var tag = lob.motto || b.tagline || "";
    $(".lob-tag", wrap).textContent = tag;
    if (!tag) $(".lob-tag", wrap).hidden = true;
    $(".lob-hello", wrap).textContent = greet(d.getHours()) + (who ? ", " + who : "") + " · " + when;
    return wrap;
  }

  /* drifting live figures, on both sides, well clear of the middle */
  function drift(cards) {
    var box = $("#lob-drift"); if (!box || !cards.length) return;
    box.innerHTML = cards.map(function (c, i) {
      return '<div class="lob-card' + (c.hot ? " hot" : "") + '" style="--i:' + i + '"><b>' + esc(c.n) + "</b><span>" + esc(c.label) + "</span></div>";
    }).join("");
    var kids = box.children, n = kids.length;
    for (var i = 0; i < n; i++) {
      var k = kids[i], right = i % 2 === 1;
      k.style.left = right ? "" : (3 + (i % 3) * 5) + "%";
      k.style.right = right ? (3 + (i % 3) * 5) + "%" : "";
      k._t = (i / n) * 1 + Math.random() * 0.08;
      k._sp = 0.020 + (i % 3) * 0.004;
      k._x = (right ? 1 : -1);
    }
    box.dataset.on = "1";
  }

  /* ------------------------------------------------------------------ the moving background */
  function animate(wrap) {
    var cv = $(".lob-cv", wrap), g = cv.getContext("2d"), blobs = [].slice.call(wrap.querySelectorAll(".lob-blobs i"));
    var b = (QCTheme.data().branding) || {}, style = (b.lobby || {}).style || "aurora";
    var P = QCTheme.lobbyPalette(b.accent || "#0e8f83", b.accent2 || "");
    [["--lb-bg", P.bg], ["--lb-bg2", P.bg2], ["--lb-ink", P.ink], ["--lb-muted", P.muted], ["--lb-card", P.card],
     ["--lb-brand", P.brand], ["--lb-alt", P.alt], ["--lb-deep", P.deep]].forEach(function (kv) { wrap.style.setProperty(kv[0], kv[1]); });
    var W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);
    var pts = [], seed = 1;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    for (var i = 0; i < 70; i++) pts.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 2, s: 0.006 + rnd() * 0.022, p: rnd() * 6.28, a: 0.2 + rnd() * 0.55 });
    function size() {
      W = wrap.clientWidth; H = wrap.clientHeight;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    size();
    window.addEventListener("resize", size);
    wrap._size = size;
    var cols = [P.brand, P.alt, P.alt2, P.deep];

    function frame(now) {
      if (!wrap.isConnected) return;
      var t = (now - T0) / 1000;
      // the four soft washes of colour
      blobs.forEach(function (el, i) {
        var sp = calm() ? 0 : 1;
        var x = Math.sin(t * (0.07 + i * 0.013) + i * 2.1) * 16 * sp, y = Math.cos(t * (0.055 + i * 0.011) + i) * 13 * sp;
        var s = 1 + Math.sin(t * 0.09 + i) * 0.1 * sp;
        el.style.background = cols[i % cols.length];
        el.style.transform = "translate3d(" + x.toFixed(2) + "%," + y.toFixed(2) + "%,0) scale(" + s.toFixed(3) + ")";
      });
      g.clearRect(0, 0, W, H);
      if (!calm()) {
        if (style === "pulse") ecg(g, t, W, H, P);
        if (style === "orbit") orbit(g, t, W, H, P);
        if (style === "aurora") ribbons(g, t, W, H, P);
      }
      // dust, in every style
      g.globalCompositeOperation = "lighter";
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], py = ((p.y - (calm() ? 0 : t * p.s)) % 1 + 1) % 1;
        var px = p.x + (calm() ? 0 : Math.sin(t * 0.25 + p.p) * 0.012);
        g.fillStyle = hexA(i % 3 ? P.brand : P.alt, p.a * (0.35 + 0.35 * Math.sin(t * 1.1 + p.p)));
        g.beginPath(); g.arc(px * W, py * H, p.r, 0, 6.2832); g.fill();
      }
      g.globalCompositeOperation = "source-over";
      // the drifting figures
      var box = $("#lob-drift", wrap);
      if (box && box.dataset.on) {
        for (var j = 0; j < box.children.length; j++) {
          var k = box.children[j];
          k._t = (k._t + (calm() ? 0 : k._sp / 60)) % 1.25;
          var v = k._t, vis = v < 1 ? Math.min(1, Math.min(v, 1 - v) * 6) : 0;
          k.style.transform = "translate3d(" + (k._x * (1 - vis) * 26).toFixed(1) + "px," + ((1 - v) * (H + 120) - 60).toFixed(0) + "px,0)";
          k.style.opacity = (vis * 0.92).toFixed(3);
        }
      }
      RAF = requestAnimationFrame(frame);
    }
    T0 = performance.now();
    RAF = requestAnimationFrame(frame);
  }
  function hexA(hex, a) {
    var c = [1, 3, 5].map(function (i) { return parseInt(String(hex).substr(i, 2), 16) || 0; });
    return "rgba(" + c.join(",") + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
  }

  /* a heartbeat crossing the screen */
  function ecg(g, t, W, H, P) {
    var y0 = H * 0.8, span = W * 1.25, head = ((t * 0.17) % 1) * span - span * 0.12;
    g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round";
    for (var pass = 0; pass < 2; pass++) {
      g.beginPath();
      g.strokeStyle = pass ? hexA(P.brand, 0.92) : hexA(P.brand, 0.2);
      if (pass) { g.shadowColor = hexA(P.brand, 0.9); g.shadowBlur = 16; } else { g.shadowBlur = 0; }
      for (var x = -4; x <= W + 4; x += 3) {
        var d = head - x, v = 0;
        if (pass && (d < 0 || d > span * 0.42)) continue;
        var u = ((x / W) * 7) % 1;
        v = beat(u) * H * 0.16;
        var fade = pass ? Math.max(0, 1 - d / (span * 0.42)) : 1;
        var yy = y0 - v * fade;
        if (x === -4) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    g.shadowBlur = 0;
    // the leading point
    var hx = head % W;
    if (hx >= 0 && hx <= W) {
      var hy = y0 - beat(((hx / W) * 7) % 1) * H * 0.16;
      var rg = g.createRadialGradient(hx, hy, 0, hx, hy, 26);
      rg.addColorStop(0, hexA(P.brand, 0.85)); rg.addColorStop(1, hexA(P.brand, 0));
      g.fillStyle = rg; g.beginPath(); g.arc(hx, hy, 26, 0, 6.2832); g.fill();
    }
  }
  function beat(u) {
    if (u < 0.08) return Math.sin(u / 0.08 * Math.PI) * 0.18;              // P
    if (u < 0.12) return -Math.sin((u - 0.08) / 0.04 * Math.PI) * 0.22;     // Q
    if (u < 0.17) return Math.sin((u - 0.12) / 0.05 * Math.PI) * 1.0;       // R
    if (u < 0.23) return -Math.sin((u - 0.17) / 0.06 * Math.PI) * 0.34;     // S
    if (u < 0.40) return Math.sin((u - 0.30) / 0.10 * Math.PI) * 0.30 * (u > 0.30 ? 1 : 0);  // T
    return 0;
  }
  /* rings with points travelling them */
  function orbit(g, t, W, H, P) {
    var cx = W / 2, cy = H * 0.46, base = Math.min(W, H) * 0.17;
    for (var i = 0; i < 4; i++) {
      var r = base * (1 + i * 0.55);
      g.beginPath(); g.strokeStyle = hexA(i % 2 ? P.alt : P.brand, 0.26 - i * 0.03); g.lineWidth = 1.3;
      g.ellipse(cx, cy, r * 1.35, r, 0, 0, 6.2832); g.stroke();
      for (var k = 0; k < 2 + i; k++) {
        var a = t * (0.22 - i * 0.03) + (k / (2 + i)) * 6.2832 + i;
        var x = cx + Math.cos(a) * r * 1.35, y = cy + Math.sin(a) * r;
        var rg = g.createRadialGradient(x, y, 0, x, y, 16);
        rg.addColorStop(0, hexA(i % 2 ? P.alt : P.brand, 0.9)); rg.addColorStop(1, hexA(P.brand, 0));
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, 16, 0, 6.2832); g.fill();
      }
    }
  }
  /* slow bands of light */
  function ribbons(g, t, W, H, P) {
    g.globalCompositeOperation = "lighter";
    for (var i = 0; i < 3; i++) {
      var col = [P.brand, P.alt, P.alt2][i], y = H * (0.3 + i * 0.2);
      g.beginPath();
      g.moveTo(-40, y);
      for (var x = -40; x <= W + 40; x += 24) {
        g.lineTo(x, y + Math.sin(x / (260 + i * 90) + t * (0.18 + i * 0.05) + i) * (34 + i * 14) + Math.cos(x / 520 - t * 0.1) * 16);
      }
      var lg = g.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(0.5, hexA(col, 0.46)); lg.addColorStop(1, hexA(col, 0));
      g.strokeStyle = lg; g.lineWidth = 34 + i * 14; g.lineCap = "round";
      g.filter = "blur(10px)"; g.stroke(); g.filter = "none";
    }
    g.globalCompositeOperation = "source-over";
  }

  /* ------------------------------------------------------------------ open and close */
  function close(fast) {
    var wrap = EL; if (!wrap) return;
    EL = null;
    wrap.classList.add("lob-out");
    if (wrap._size) window.removeEventListener("resize", wrap._size);
    document.documentElement.classList.remove("lob-open");
    setTimeout(function () {
      cancelAnimationFrame(RAF);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      var r = RESOLVE; RESOLVE = null; if (r) r();
    }, fast ? 60 : 620);
  }

  function show(me) {
    if (EL) return Promise.resolve();
    SHOWN = true;
    try { sessionStorage.setItem("qc-lobby-seen", String(Date.now())); } catch (e) {}
    var wrap = build(me);
    document.body.appendChild(wrap);
    document.documentElement.classList.add("lob-open");
    EL = wrap;
    animate(wrap);
    requestAnimationFrame(function () { wrap.classList.add("lob-in"); });
    var go = $("#lob-go", wrap);
    setTimeout(function () { try { go.focus({ preventScroll: true }); } catch (e) {} }, 60);
    go.addEventListener("click", function (e) {
      var rip = document.createElement("span"); rip.className = "lob-rip"; wrap.appendChild(rip);
      close();
    });
    wrap.addEventListener("click", function (e) { if (!e.target.closest(".lob-mark, .lob-card")) close(); });
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); close(); }
      if (e.key === "Tab") { e.preventDefault(); try { go.focus(); } catch (x) {} }
    });
    // the hour's own numbers, if this person is allowed to see them
    var lob = ((QCTheme.data().branding) || {}).lobby || {};
    var can = (me.perms || []).some(function (p) { return p === "ops" || p === "read" || p === "structure"; });
    if (lob.live !== false && can) {
      (BOARD || (BOARD = QCHosp.api("/hospital/ops/board"))).then(function (r) {
        if (!EL) return;
        var cards = cardsFrom(r);
        drift(cards);
        var live = $("#lob-live", wrap);
        if (live && cards.length) live.textContent = "Live from your hospital, a moment ago";
      }, function () {});
    }
    return new Promise(function (res) { RESOLVE = res; });
  }

  var QUIET_MS = 30 * 60 * 1000;                        // after a reload mid-shift, don't make them tap through again
  function recently() {
    try { return Date.now() - (+sessionStorage.getItem("qc-lobby-seen") || 0) < QUIET_MS; } catch (e) { return false; }
  }
  function maybeShow(me, freshSignIn) {
    var c = window.QCTheme && QCTheme.data();
    if (!c || !me || !me.staff) return Promise.resolve();
    var on = ((c.branding || {}).lobby || {}).on !== false, mine = (c.prefs || {}).lobby !== false;
    if (!on || !mine || SHOWN) return Promise.resolve();
    if (!freshSignIn && recently()) return Promise.resolve();
    return show(me);
  }

  window.QCLobby = { show: show, maybeShow: maybeShow, close: close, seen: function () { return SHOWN; } };
})();
