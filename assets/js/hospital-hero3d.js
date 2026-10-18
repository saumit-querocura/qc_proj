/* QueroCura for Hospitals: the 3D "constellation of care" behind the landing hero.
 * A slowly turning sphere of light; bright nodes are departments, and small pulses travel between them like patients
 * moving through the hospital.  Three.js is self-hosted (the page's security policy allows only our own scripts) and
 * loaded only when the hero is on screen, WebGL works and the visitor hasn't asked for reduced motion.
 * Pauses when scrolled away or when the tab is hidden; never more than ~1.75x pixel density.
 */
const mount = document.getElementById("hero3d");

/* a soft gold light that follows the pointer across the feature cards */
document.querySelectorAll(".bx").forEach((b) => b.addEventListener("pointermove", (e) => {
  const r = b.getBoundingClientRect();
  b.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
  b.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
}, { passive: true }));
const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

if (mount && webglOK()) {
  let started = false;
  const start = () => { if (started) return; started = true; return load(); };
  const load = () => import("../vendor/three/three.module.min.js?v=170").then(build).catch((e) => { if (window.console) console.warn("3D hero off:", e); });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: "200px" });
    io.observe(mount);
    // some browsers (and background tabs) don't report intersections promptly: start anyway if the hero is in view
    setTimeout(() => { const r = mount.getBoundingClientRect(); if (r.bottom > 0 && r.top < (window.innerHeight || 800)) { io.disconnect(); start(); } }, 1200);
  } else start();
}

function build(THREE) {
  const W = () => mount.clientWidth || 1, H = () => mount.clientHeight || 1;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(W(), H());
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
  camera.position.set(0, 0, 8.2);
  const world = new THREE.Group();
  scene.add(world);
  const GOLD = new THREE.Color("#e3c88f"), TEAL = new THREE.Color("#4fd8c6"), IVORY = new THREE.Color("#f6f1e7"), VIOLET = new THREE.Color("#8f86f0");

  /* a round, soft point sprite shader with gentle twinkle */
  const pointMat = (base) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uBase: { value: base } },
    vertexShader: `
      attribute float aSize; attribute float aSeed; attribute vec3 aColor;
      uniform float uTime; uniform float uPx; uniform float uBase;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 1.6) + aSeed * 40.0);
        vAlpha = tw * (0.25 + 0.75 * smoothstep(-10.5, -6.0, mv.z));
        vColor = aColor;
        gl_PointSize = aSize * uBase * uPx * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5; float d = length(p);
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, (0.35 * glow + 0.65 * glow * glow) * vAlpha);
      }`,
  });

  /* the sphere: points on a Fibonacci lattice, gold at the top fading to teal below */
  const R = 2.35, N = 2400;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
    const jitter = 1 + (Math.random() - 0.5) * 0.035;
    pos[i * 3] = Math.cos(th) * r * R * jitter; pos[i * 3 + 1] = y * R * jitter; pos[i * 3 + 2] = Math.sin(th) * r * R * jitter;
    const c = TEAL.clone().lerp(GOLD, (y + 1) / 2).lerp(IVORY, Math.random() * 0.25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = 0.55 + Math.random() * 0.9; seed[i] = Math.random();
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sg.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  sg.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  sg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const sphereMat = pointMat(6.5);
  world.add(new THREE.Points(sg, sphereMat));

  /* departments: brighter nodes on the surface */
  const nodes = [];
  const NODES = 9;
  for (let i = 0; i < NODES; i++) {
    const u = (i + 0.5) / NODES, phi = Math.acos(1 - 2 * u), th = i * 2.399963 + 0.7;
    nodes.push(new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)).multiplyScalar(R * 1.01));
  }
  const ng = new THREE.BufferGeometry().setFromPoints(nodes);
  const nc = new Float32Array(NODES * 3), ns = new Float32Array(NODES), nsd = new Float32Array(NODES);
  nodes.forEach((_, i) => { const c = i % 3 === 0 ? TEAL : i % 3 === 1 ? GOLD : VIOLET; nc[i * 3] = c.r; nc[i * 3 + 1] = c.g; nc[i * 3 + 2] = c.b; ns[i] = 5.5; nsd[i] = Math.random(); });
  ng.setAttribute("aColor", new THREE.BufferAttribute(nc, 3));
  ng.setAttribute("aSize", new THREE.BufferAttribute(ns, 1));
  ng.setAttribute("aSeed", new THREE.BufferAttribute(nsd, 1));
  const nodeMat = pointMat(7.5);
  world.add(new THREE.Points(ng, nodeMat));

  /* arcs between departments, lifted off the surface, with pulses travelling along them */
  const arcs = [];
  const pairs = [[0, 3], [1, 4], [2, 6], [3, 7], [4, 8], [5, 1], [6, 0], [7, 2], [8, 5], [0, 4], [2, 8]];
  pairs.forEach(([a, b], k) => {
    const A = nodes[a], B = nodes[b];
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const lift = 1 + A.distanceTo(B) / (R * 2.2);
    const curve = new THREE.QuadraticBezierCurve3(A, mid.normalize().multiplyScalar(R * lift), B);
    const pts = curve.getPoints(64);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const c = k % 2 ? GOLD : TEAL;
    const m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    world.add(new THREE.Line(g, m));
    arcs.push({ curve, speed: 0.06 + Math.random() * 0.08, offset: Math.random(), color: c });
  });
  const P = arcs.length * 2;
  const pp = new Float32Array(P * 3), pc = new Float32Array(P * 3), ps = new Float32Array(P), psd = new Float32Array(P);
  for (let i = 0; i < P; i++) { const c = arcs[i % arcs.length].color; pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b; ps[i] = 3.2; psd[i] = Math.random(); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  pg.setAttribute("aColor", new THREE.BufferAttribute(pc, 3));
  pg.setAttribute("aSize", new THREE.BufferAttribute(ps, 1));
  pg.setAttribute("aSeed", new THREE.BufferAttribute(psd, 1));
  const pulseMat = pointMat(7.5);
  world.add(new THREE.Points(pg, pulseMat));

  /* two fine gold orbits */
  const ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(R * 1.32, 0.006, 8, 256), ringMat);
  ring1.rotation.set(1.2, 0.2, 0.3);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R * 1.5, 0.004, 8, 256), ringMat.clone());
  ring2.material.opacity = 0.18; ring2.rotation.set(1.75, -0.4, 0);
  scene.add(ring1, ring2);

  /* distant dust */
  const D = 700, dp = new Float32Array(D * 3), dc = new Float32Array(D * 3), ds = new Float32Array(D), dsd = new Float32Array(D);
  for (let i = 0; i < D; i++) {
    const r = 6 + Math.random() * 10, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    dp[i * 3] = r * Math.sin(ph) * Math.cos(th); dp[i * 3 + 1] = r * Math.cos(ph) * 0.6; dp[i * 3 + 2] = -Math.abs(r * Math.sin(ph) * Math.sin(th));
    const c = IVORY.clone().lerp(GOLD, Math.random() * 0.5); dc[i * 3] = c.r; dc[i * 3 + 1] = c.g; dc[i * 3 + 2] = c.b; ds[i] = 0.6 + Math.random(); dsd[i] = Math.random();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  dg.setAttribute("aColor", new THREE.BufferAttribute(dc, 3));
  dg.setAttribute("aSize", new THREE.BufferAttribute(ds, 1));
  dg.setAttribute("aSeed", new THREE.BufferAttribute(dsd, 1));
  const dustMat = pointMat(4.2);
  scene.add(new THREE.Points(dg, dustMat));

  /* placement: sphere sits to the right on wide screens, centred and smaller on phones */
  function place() {
    const wide = W() > 860;
    world.position.set(wide ? 2.3 : 0, wide ? 0 : 1.1, 0);
    world.scale.setScalar(wide ? 1 : 0.78);
    ring1.position.copy(world.position); ring2.position.copy(world.position);
    ring1.scale.copy(world.scale); ring2.scale.copy(world.scale);
  }
  place();

  let mx = 0, my = 0, tx = 0, ty = 0, scrollK = 0;
  window.addEventListener("pointermove", (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 0.5; ty = (e.clientY / window.innerHeight - 0.5) * 0.3; }, { passive: true });
  window.addEventListener("scroll", () => { scrollK = Math.min(1, window.scrollY / (H() * 0.9)); }, { passive: true });
  window.addEventListener("resize", () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); place(); });

  const mats = [sphereMat, nodeMat, pulseMat, dustMat];
  const tmp = new THREE.Vector3();
  let visible = true, raf = 0, t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    mats.forEach((m) => { m.uniforms.uTime.value = t; });
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    world.rotation.y = t * 0.06 + mx;
    world.rotation.x = 0.18 + my;
    ring1.rotation.z = t * 0.05; ring2.rotation.z = -t * 0.035;
    for (let i = 0; i < P; i++) {
      const a = arcs[i % arcs.length];
      const u = ((t * a.speed) + a.offset + (i >= arcs.length ? 0.5 : 0)) % 1;
      a.curve.getPoint(u, tmp);
      pp[i * 3] = tmp.x; pp[i * 3 + 1] = tmp.y; pp[i * 3 + 2] = tmp.z;
    }
    pg.attributes.position.needsUpdate = true;
    camera.position.z = 8.2 + scrollK * 2.2;
    renderer.domElement.style.opacity = String(1 - scrollK * 0.7);
    renderer.render(scene, camera);
    if (visible && !reduce) raf = requestAnimationFrame(frame);
  }
  if (reduce) { frame(performance.now() + 4000); return; }
  raf = requestAnimationFrame(frame);
  const go = () => { cancelAnimationFrame(raf); if (visible && !document.hidden) raf = requestAnimationFrame(frame); };
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; go(); }).observe(mount);
  document.addEventListener("visibilitychange", go);
  mount.classList.add("on");
}
