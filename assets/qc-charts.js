/* QueroCura charts: small, dependency-free SVG charts with a hover/touch read-out.
 *   QCChart.line(el, opts)   time series with the person's usual band, the healthy range, a projection cone,
 *                            a marked step change and unusual readings; redraws itself on resize.
 *   QCChart.spark(values, color, opts) -> SVG string for tiles.
 * opts for line: { series: [[ts, v], …], series2: [[ts, v], …] (optional second line, e.g. diastolic),
 *   band: {lo, hi}, band2: {lo, hi}, pop: [lo, hi], forecast: {days, v, lo, hi}, step: {ts, before, after},
 *   anomalies: ["ts", …], unit, color, color2, label, label2, height, dec }
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var live = [];

  function parse(ts) { var d = new Date(String(ts).replace(" ", "T")); return d.getTime(); }
  function fmtV(v, dec) { return v == null ? "–" : (dec ? (+v).toFixed(dec) : Math.round(v)); }
  function fmtDate(t, withTime) {
    var d = new Date(t);
    var s = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return withTime ? s + ", " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : s;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function hi() { return !!(window.QCI18n && window.QCI18n.lang === "hi"); }
  var HI = { "your usual": "आपका सामान्य", "healthy range": "स्वस्थ सीमा", "if this continues": "अगर ऐसा ही चला", "change": "बदलाव", "unusual for you": "आपके लिए असामान्य",
    "within your usual": "आपके सामान्य के भीतर", "above your usual": "आपके सामान्य से ऊपर", "below your usual": "आपके सामान्य से नीचे", "projection": "अनुमान" };
  function L(s) { return hi() && HI[s] ? HI[s] : s; }

  function draw(el, o) {
    var W = Math.max(260, el.clientWidth || 560), H = o.height || 190;
    var M = { l: 38, r: 14, t: 14, b: 24 };
    var pts = (o.series || []).map(function (p) { return [parse(p[0]), +p[1]]; }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
    var pts2 = (o.series2 || []).map(function (p) { return [parse(p[0]), +p[1]]; }).filter(function (p) { return !isNaN(p[0]) && !isNaN(p[1]); });
    if (!pts.length) { el.innerHTML = ""; return; }
    var t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    var fcT = null;
    if (o.forecast) { fcT = t1 + o.forecast.days * 86400000; }
    var tMax = Math.max(t1, fcT || t1);
    if (tMax === t0) { t0 -= 43200000; tMax += 43200000; }
    var ys = pts.map(function (p) { return p[1]; }).concat(pts2.map(function (p) { return p[1]; }));
    if (o.band) ys.push(o.band.lo, o.band.hi);
    if (o.band2) ys.push(o.band2.lo, o.band2.hi);
    if (o.forecast) ys.push(o.forecast.lo, o.forecast.hi);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var pad = (y1 - y0 || Math.abs(y1) * 0.05 || 1) * 0.14;
    y0 -= pad; y1 += pad;
    var X = function (t) { return M.l + (t - t0) / (tMax - t0) * (W - M.l - M.r); };
    var Y = function (v) { return M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b); };
    var c = o.color || "#0e8f83", c2 = o.color2 || "#7c6fdb";
    var s = '<svg class="qcc-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.label || "chart") + '">';
    // grid and y ticks
    for (var i = 0; i <= 2; i++) {
      var v = y0 + (y1 - y0) * (i / 2), yy = Y(v);
      s += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" class="qcc-grid"/>' +
        '<text x="' + (M.l - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" class="qcc-tick">' + fmtV(v, o.dec) + "</text>";
    }
    // healthy range (dashed), only where it falls inside the view
    if (o.pop) [0, 1].forEach(function (k) {
      var pv = o.pop[k];
      if (pv > y0 && pv < y1) s += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + Y(pv).toFixed(1) + '" y2="' + Y(pv).toFixed(1) + '" class="qcc-pop"/>';
    });
    // the person's usual band
    function band(b, cl) {
      if (!b) return "";
      var top = Y(Math.min(b.hi, y1)), bot = Y(Math.max(b.lo, y0));
      return '<rect x="' + M.l + '" y="' + top.toFixed(1) + '" width="' + (W - M.l - M.r) + '" height="' + Math.max(2, bot - top).toFixed(1) + '" class="' + cl + '" rx="4"/>';
    }
    s += band(o.band2, "qcc-band2") + band(o.band, "qcc-band");

    // step change
    if (o.step) {
      var st = parse(o.step.ts);
      if (st >= t0 && st <= tMax) s += '<line x1="' + X(st).toFixed(1) + '" x2="' + X(st).toFixed(1) + '" y1="' + M.t + '" y2="' + (H - M.b) + '" class="qcc-step"/><text x="' + (X(st) + 4).toFixed(1) + '" y="' + (M.t + 10) + '" class="qcc-steplab">' + esc(L("change")) + "</text>";
    }
    // projection cone
    if (o.forecast && fcT) {
      var lx = X(t1), ly = Y(pts[pts.length - 1][1]);
      s += '<polygon points="' + lx.toFixed(1) + "," + ly.toFixed(1) + " " + X(fcT).toFixed(1) + "," + Y(o.forecast.hi).toFixed(1) + " " + X(fcT).toFixed(1) + "," + Y(o.forecast.lo).toFixed(1) + '" class="qcc-cone" style="fill:' + c + '"/>' +
        '<line x1="' + lx.toFixed(1) + '" y1="' + ly.toFixed(1) + '" x2="' + X(fcT).toFixed(1) + '" y2="' + Y(o.forecast.v).toFixed(1) + '" class="qcc-fc" style="stroke:' + c + '"/>' +
        '<text x="' + (X(fcT) - 2).toFixed(1) + '" y="' + (Y(o.forecast.hi) - 4).toFixed(1) + '" text-anchor="end" class="qcc-steplab">' + esc(L("if this continues")) + "</text>";
    }
    function path(p) { return p.map(function (q, k) { return (k ? "L" : "M") + X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1); }).join(" "); }
    if (pts2.length > 1) s += '<path d="' + path(pts2) + '" class="qcc-line2" style="stroke:' + c2 + '"/>';
    if (pts.length > 1) {
      var area = path(pts) + " L" + X(t1).toFixed(1) + "," + (H - M.b) + " L" + X(pts[0][0]).toFixed(1) + "," + (H - M.b) + " Z";
      s += '<path d="' + area + '" class="qcc-area" style="fill:' + c + '"/><path d="' + path(pts) + '" class="qcc-line" style="stroke:' + c + '"/>';
    }
    var anom = {};
    (o.anomalies || []).forEach(function (a) { anom[parse(a)] = 1; });
    if (pts2.length <= 12) pts2.forEach(function (p) { s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2" style="fill:' + c2 + '" class="qcc-dot2"/>'; });
    pts.forEach(function (p, k) {
      var isA = anom[p[0]];
      if (k === pts.length - 1 || pts.length <= 12) s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="' + (k === pts.length - 1 ? 3.6 : 2.4) + '" style="fill:' + c + '" class="qcc-dot"/>';
      if (isA) s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.6" style="fill:#d24f28"/><circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="6.5" class="qcc-anom"/>';
    });
    // x labels
    var xl = [t0, t0 + (t1 - t0) / 2, t1];
    if (fcT) xl.push(fcT);
    s += xl.map(function (t, k) { return '<text x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? "start" : k === xl.length - 1 ? "end" : "middle") + '" class="qcc-tick">' + esc(fmtDate(t)) + "</text>"; }).join("");
    s += '<line class="qcc-guide" x1="0" x2="0" y1="' + M.t + '" y2="' + (H - M.b) + '" style="display:none"/>';
    s += '<rect class="qcc-hit" x="' + M.l + '" y="0" width="' + (W - M.l - M.r) + '" height="' + H + '"/></svg><div class="qcc-tip" hidden></div>';
    el.innerHTML = s;
    el.classList.add("qcc");
    var svg = el.querySelector("svg"), tip = el.querySelector(".qcc-tip"), guide = el.querySelector(".qcc-guide");
    function near(t) {
      var best = null;
      pts.forEach(function (p) { if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; });
      return best;
    }
    function show(ev) {
      var r = svg.getBoundingClientRect();
      var cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var t = t0 + (cx - M.l) / (W - M.l - M.r) * (tMax - t0);
      var p = near(t);
      if (!p) return;
      var p2 = null;
      pts2.forEach(function (q) { if (q[0] === p[0]) p2 = q; });
      var where = o.band ? (p[1] > o.band.hi ? L("above your usual") : p[1] < o.band.lo ? L("below your usual") : L("within your usual")) : "";
      tip.innerHTML = "<b>" + fmtV(p[1], o.dec) + (p2 ? "/" + fmtV(p2[1], o.dec) : "") + "</b> " + esc(o.unit || "") + "<span>" + esc(fmtDate(p[0], true)) + "</span>" +
        (where ? '<span class="w">' + esc(anom[p[0]] ? L("unusual for you") : where) + "</span>" : "");
      tip.hidden = false;
      var x = X(p[0]);
      guide.setAttribute("x1", x); guide.setAttribute("x2", x); guide.style.display = "";
      var tw = tip.offsetWidth || 120;
      tip.style.left = Math.max(0, Math.min(W - tw, x - tw / 2)) + "px";
      tip.style.top = Math.max(0, Y(p[1]) - 62) + "px";
    }
    function hide() { tip.hidden = true; guide.style.display = "none"; }
    var hit = el.querySelector(".qcc-hit");
    hit.addEventListener("mousemove", show);
    hit.addEventListener("touchstart", show, { passive: true });
    hit.addEventListener("touchmove", show, { passive: true });
    hit.addEventListener("mouseleave", hide);
  }

  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      live = live.filter(function (x) { return document.body.contains(x.el); });
      live.forEach(function (x) { if (x.el.clientWidth && x.el.clientWidth !== x.w) { x.w = x.el.clientWidth; draw(x.el, x.o); } });
    }, 150);
  });

  window.QCChart = {
    line: function (el, o) {
      if (!el) return;
      draw(el, o);
      live = live.filter(function (x) { return x.el !== el && document.body.contains(x.el); });
      live.push({ el: el, o: o, w: el.clientWidth });
    },
    spark: function (values, color, o) {
      o = o || {};
      var w = o.w || 96, h = o.h || 30, v = (values || []).filter(function (x) { return x != null && !isNaN(x); });
      if (v.length < 2) return "";
      var lo = Math.min.apply(null, v.concat(o.band ? [o.band.lo] : [])), hiv = Math.max.apply(null, v.concat(o.band ? [o.band.hi] : []));
      var r = hiv - lo || 1;
      var X = function (i) { return 2 + i * (w - 4) / (v.length - 1); }, Y = function (x) { return 3 + (1 - (x - lo) / r) * (h - 6); };
      var s = '<svg class="qcc-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">';
      if (o.band) s += '<rect x="0" y="' + Y(o.band.hi).toFixed(1) + '" width="' + w + '" height="' + Math.max(1, Y(o.band.lo) - Y(o.band.hi)).toFixed(1) + '" class="qcc-band" rx="3"/>';
      s += '<path d="' + v.map(function (x, i) { return (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(x).toFixed(1); }).join(" ") + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      s += '<circle cx="' + X(v.length - 1).toFixed(1) + '" cy="' + Y(v[v.length - 1]).toFixed(1) + '" r="2.6" fill="' + color + '"/></svg>';
      return s;
    }
  };
})();
