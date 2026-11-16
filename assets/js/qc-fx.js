/* The moving parts of the public pages, shared by the generated landing pages and the hand-built ones.

   - the aurora: a WebGL fragment shader behind the top of the page (CSS gradients stay if WebGL is not there)
   - things arriving as you scroll to them (.rv, and anything listed in <body data-fx-reveal="selector, selector">)
   - a reading-progress line, a shadow under the nav once you have scrolled, a soft light that follows the pointer
     across cards (.glow), and the hero picture leaning toward the pointer (.viz)

   Nothing here is needed to read the page. Every effect stands down for prefers-reduced-motion, the shader stops
   when its tab is hidden or it has scrolled out of view, and it renders at a reduced resolution on purpose. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var calm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var fine = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  function dark() {
    var t = root.getAttribute("data-theme");
    if (t) return t === "dark";
    if (root.classList.contains("dark")) return true;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  // ---------------------------------------------------------------- aurora
  var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FRAG = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform vec2 r;uniform float t;uniform float d;uniform vec2 m;",
    "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    // gradient noise: value noise leaves flat, faceted patches at this scale; this stays silky
    "vec2 g(vec2 p){float a=6.2831853*h(p);return vec2(cos(a),sin(a));}",
    "float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*f*(f*(f*6.-15.)+10.);",
    "return .5+.7*mix(mix(dot(g(i),f),dot(g(i+vec2(1.,0.)),f-vec2(1.,0.)),u.x),",
    "mix(dot(g(i+vec2(0.,1.)),f-vec2(0.,1.)),dot(g(i+vec2(1.,1.)),f-vec2(1.,1.)),u.x),u.y);}",
    "float f(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n(p);p=mat2(.8,.6,-.6,.8)*p*2.03+vec2(1.7,9.2);a*=.5;}return s;}",
    "void main(){",
    "vec2 u=gl_FragCoord.xy/r;vec2 q=vec2(u.x*r.x/r.y,u.y)*1.35;",
    "q+=(m-.5)*.18;",
    "vec2 w=vec2(f(q+vec2(0.,t*.05)),f(q+vec2(5.2,-t*.04)));",
    "float a=f(q*1.1+w*1.9+vec2(t*.03,0.));",
    "float b=f(q*.8-w*1.4+vec2(-t*.02,3.1));",
    "vec3 teal=vec3(.055,.56,.51),vio=vec3(.49,.43,.86),blu=vec3(.18,.56,.82);",
    "vec3 c=mix(teal,blu,smoothstep(.36,.6,b));c=mix(c,vio,smoothstep(.4,.62,a*b*2.1));",
    // curtains of light: bright along the ridges of the warped field
    "float k=smoothstep(.34,.7,a)*.85+pow(smoothstep(.56,.84,a+b*.35),2.)*.5;",
    "k*=smoothstep(-.1,.55,u.y)*.9+.1;",
    "float al=k*mix(.36,.5,d);",
    "c=mix(c,c*1.5+.08,d);",
    "gl_FragColor=vec4(c*al,al);}"
  ].join("\n");

  function aurora(host) {
    var cv = doc.createElement("canvas");
    var gl = null;
    try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) return;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    var pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, "r"), uT = gl.getUniformLocation(pr, "t"), uD = gl.getUniformLocation(pr, "d"), uM = gl.getUniformLocation(pr, "m");
    host.appendChild(cv);

    var mx = .5, my = .5, tx = .5, ty = .5, seen = true, raf = 0, last = 0, t0 = performance.now(), lost = false;
    function size() {
      // a soft field does not need every pixel: about a third of them is indistinguishable and far cheaper
      var s = Math.min(1, 640 / Math.max(1, host.clientWidth));
      var w = Math.max(2, Math.round(host.clientWidth * s)), h = Math.max(2, Math.round(host.clientHeight * s));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    }
    function draw(now) {
      mx += (tx - mx) * .04; my += (ty - my) * .04;
      gl.uniform2f(uR, cv.width, cv.height);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform1f(uD, dark() ? 1 : 0);
      gl.uniform2f(uM, mx, 1 - my);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(now) {
      raf = 0;
      if (!seen || doc.hidden || lost) return;
      if (now - last > 32) { last = now; draw(now); }      // ~30 frames a second is plenty for something this slow
      raf = requestAnimationFrame(loop);
    }
    function wake() { if (!raf && !calm) raf = requestAnimationFrame(loop); }
    size(); draw(performance.now() + 9000);
    host.classList.add("live");
    window.addEventListener("resize", function () { size(); if (calm) draw(performance.now()); }, { passive: true });
    doc.addEventListener("visibilitychange", wake);
    doc.addEventListener("qc:theme", function () { if (calm) draw(performance.now()); });
    cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; host.classList.remove("live"); });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; wake(); }).observe(host);
    if (fine) window.addEventListener("pointermove", function (e) { tx = e.clientX / window.innerWidth; ty = e.clientY / window.innerHeight; }, { passive: true });
    wake();
  }

  // ---------------------------------------------------------------- arriving on scroll
  function reveals() {
    var extra = doc.body.getAttribute("data-fx-reveal");
    if (extra) { try { doc.querySelectorAll(extra).forEach(function (el) { el.classList.add("rv"); }); } catch (e) { /* bad selector: skip */ } }
    var els = [].slice.call(doc.querySelectorAll(".rv"));
    if (!els.length) return;
    if (calm || !("IntersectionObserver" in window)) return;      // without html.fx nothing is ever hidden
    // what is already on screen stays exactly as it is; only what is still below gets to arrive
    var vh = window.innerHeight;
    els = els.filter(function (el) { if (el.getBoundingClientRect().top < vh * .92) { el.classList.add("in"); return false; } return true; });
    root.classList.add("fx");
    // children of one grid arrive one after another
    var counts = new Map();
    els.forEach(function (el) { var p = el.parentNode, i = counts.get(p) || 0; el.style.setProperty("--i", Math.min(i, 8)); counts.set(p, i + 1); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .06 });
    els.forEach(function (el) { io.observe(el); });
  }

  // ---------------------------------------------------------------- progress line and nav shadow
  function scrolling() {
    var bar = doc.querySelector(".progress"), nav = doc.querySelector(".nav"), toc = [].slice.call(doc.querySelectorAll(".toc a"));
    var marks = toc.map(function (a) { return doc.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))); });
    var tick = false;
    function run() {
      tick = false;
      var y = window.scrollY, max = root.scrollHeight - window.innerHeight;
      if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
      if (nav) nav.classList.toggle("stuck", y > 12);
      if (toc.length) {
        var on = -1;
        for (var i = 0; i < marks.length; i++) if (marks[i] && marks[i].getBoundingClientRect().top < 160) on = i;
        toc.forEach(function (a, i) { a.classList.toggle("on", i === on); });
      }
    }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(run); } }, { passive: true });
    run();
  }

  // ---------------------------------------------------------------- pointer light on cards, lean on the hero picture
  function pointer() {
    if (!fine || calm) return;
    doc.addEventListener("pointermove", function (e) {
      var c = e.target.closest ? e.target.closest(".glow") : null;
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
    var viz = doc.querySelector(".viz"), tilt = viz && viz.querySelector(".viz-tilt");
    if (!tilt) return;
    var hero = viz.closest(".hero") || viz;
    hero.addEventListener("pointermove", function (e) {
      var r = viz.getBoundingClientRect();
      var px = (e.clientX - (r.left + r.width / 2)) / r.width, py = (e.clientY - (r.top + r.height / 2)) / r.height;
      tilt.style.setProperty("--ry", (-9 + Math.max(-1, Math.min(1, px)) * 9).toFixed(2) + "deg");
      tilt.style.setProperty("--rx", (5 - Math.max(-1, Math.min(1, py)) * 7).toFixed(2) + "deg");
    }, { passive: true });
    hero.addEventListener("pointerleave", function () { tilt.style.removeProperty("--ry"); tilt.style.removeProperty("--rx"); });
  }

  function start() {
    var host = doc.querySelector(".aurora");
    if (host) aurora(host);
    reveals(); scrolling(); pointer();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
