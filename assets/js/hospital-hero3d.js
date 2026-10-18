/* QueroCura for Hospitals: the 3D scenes on the landing page.
 *
 * 1. Hero: thousands of points of light that keep re-forming into the shapes of care: a beating heart, a DNA double
 *    helix, the medical cross, a capsule and a connected globe, with an ECG trace sweeping across like a monitor.
 * 2. "Your hospital, alive": a glass digital twin of a hospital.  Floors for OPD and emergency, lab and imaging, wards,
 *    ICU and theatres; rooms light up as they fill, empty and are cleaned; patients flow in through reception, up the
 *    lift and to their room; an ambulance pulls up at emergency; the helipad blinks on the roof.  It is a simulation,
 *    labelled as one.
 *
 * Three.js (r170, MIT) is self-hosted: the page's security policy allows only our own scripts.  Each scene loads only
 * when it comes on screen, pauses when scrolled away or when the tab is hidden, never renders above ~1.75x pixel
 * density, and stays still for people who ask for reduced motion.
 */
const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = Math.min(window.innerWidth, window.innerHeight) < 700;
let threeP = null;
const three = () => (threeP = threeP || import("../vendor/three/three.module.min.js?v=170"));

/* a soft gold light that follows the pointer across the feature cards */
document.querySelectorAll(".bx").forEach((b) => b.addEventListener("pointermove", (e) => {
  const r = b.getBoundingClientRect();
  b.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
  b.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
}, { passive: true }));

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
}

/* start a scene when its mount comes on screen (with a fallback for browsers that report intersections late) */
function whenVisible(mount, fn) {
  if (!mount || !webglOK()) return;
  let started = false;
  const go = () => { if (started) return; started = true; three().then((T) => fn(T, mount)).catch((e) => { if (window.console) console.warn("3D scene off:", e); }); };
  if (!("IntersectionObserver" in window)) return go();
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "250px" });
  io.observe(mount);
  const check = () => { const r = mount.getBoundingClientRect(); if (r.bottom > -200 && r.top < (window.innerHeight || 800) + 200) { io.disconnect(); window.removeEventListener("scroll", check); go(); } };
  setTimeout(check, 1200);
  window.addEventListener("scroll", check, { passive: true });
}

/* run a render loop only while the mount is visible and the tab is in front */
function loop(mount, frame) {
  let visible = true, raf = 0;
  const tick = (now) => { frame(now); if (visible && !document.hidden && !reduce) raf = requestAnimationFrame(tick); };
  const go = () => { cancelAnimationFrame(raf); if (visible && !document.hidden) raf = requestAnimationFrame(tick); };
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; go(); }).observe(mount);
  document.addEventListener("visibilitychange", go);
  if (reduce) frame(performance.now() + 3000); else go();
  return frame;
}

function renderer(THREE, mount, maxDpr) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr || 1.75));
  r.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
  r.setClearColor(0x000000, 0);
  mount.appendChild(r.domElement);
  return r;
}

/* round, soft, twinkling points; colour and size per point */
function pointMaterial(THREE, base, px) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: px }, uBase: { value: base } },
    vertexShader: `
      attribute float aSize; attribute float aSeed; attribute vec3 aColor;
      uniform float uTime; uniform float uPx; uniform float uBase;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vAlpha = 0.7 + 0.3 * sin(uTime * (0.6 + aSeed * 1.6) + aSeed * 40.0);
        vColor = aColor;
        gl_PointSize = aSize * uBase * uPx * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord - 0.5; float d = length(p);
        if (d > 0.5) discard;
        float g = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, (0.35 * g + 0.65 * g * g) * vAlpha);
      }`,
  });
}

const debug = (name, api) => { if (/[?&]qc3d=debug/.test(location.search)) (window.__qc3d = window.__qc3d || {})[name] = api; };

/* ================================================================================================ 1. the hero */
whenVisible(document.getElementById("hero3d"), (THREE, mount) => {
  const W = () => mount.clientWidth || 1, H = () => mount.clientHeight || 1;
  const R = renderer(THREE, mount);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
  camera.position.set(0, 0, 8.6);
  const world = new THREE.Group();
  scene.add(world);
  const C = (h) => new THREE.Color(h);
  const GOLD = C("#e3c88f"), TEAL = C("#4fd8c6"), IVORY = C("#f6f1e7"), ROSE = C("#ff6b8a"), CRIMSON = C("#e8395f"), VIOLET = C("#8f86f0"), SKY = C("#6ec3ff");
  const N = small ? 3800 : 7000;
  const rnd = Math.random;

  /* ---- the shapes: each gives N positions and N colours ---- */
  function heart() {
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = rnd() * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const shell = i % 3 !== 0, f = shell ? 0.96 + rnd() * 0.06 : Math.sqrt(rnd());
      const k = 0.135 * f, depth = Math.sqrt(Math.max(0, 1 - f * f)) * 1.15 + (shell ? 0.05 : 0);
      p.set([x * k, y * k + 0.25, (rnd() * 2 - 1) * depth], i * 3);
      const col = CRIMSON.clone().lerp(ROSE, rnd()).lerp(GOLD, shell ? rnd() * 0.25 : 0.05);
      c.set([col.r, col.g, col.b], i * 3);
    }
    return { p, c, beat: 1, spin: 0.35 };
  }
  function helix() {
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3);
    const turns = 2.2, Hh = 4.5, r = 1.0;
    for (let i = 0; i < N; i++) {
      let col;
      if (i % 4 === 0) {                                       // base pairs: the rungs of the ladder
        const yy = Math.round(((rnd() - 0.5) * Hh) / (Hh / 34)) * (Hh / 34), aa = (yy / Hh) * turns * Math.PI * 2, u = rnd();
        p.set([Math.cos(aa) * r * (1 - 2 * u), yy, Math.sin(aa) * r * (1 - 2 * u)], i * 3);
        col = (u < 0.5 ? GOLD : IVORY).clone();
      } else {                                                 // the two strands
        const y = (rnd() - 0.5) * Hh, a = (y / Hh) * turns * Math.PI * 2, s = i % 2 ? 0 : Math.PI;
        p.set([Math.cos(a + s) * r + (rnd() - 0.5) * 0.06, y, Math.sin(a + s) * r + (rnd() - 0.5) * 0.06], i * 3);
        col = (s ? TEAL : VIOLET).clone().lerp(SKY, rnd() * 0.3);
      }
      c.set([col.r, col.g, col.b], i * 3);
    }
    return { p, c, spin: 1.6 };
  }
  function cross() {
    // the medical cross: a plus shape, points mostly on its front and back faces with a little depth between
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), L = 1.75, T = 0.5, Z = 0.32;
    for (let i = 0; i < N; i++) {
      let x, y;
      do {
        if (rnd() < 0.5) { x = (rnd() * 2 - 1) * T; y = (rnd() * 2 - 1) * L; }
        else { x = (rnd() * 2 - 1) * L; y = (rnd() * 2 - 1) * T; if (Math.abs(x) < T) continue; }
        break;
      } while (true);
      const edge = i % 7 === 0;                                // outline points make the edges crisp
      if (edge) { if (Math.abs(x) > T) y = Math.sign(y || 1) * T; else x = Math.sign(x || 1) * T; if (Math.abs(y) > L - 0.02) y = Math.sign(y) * L; }
      const z = i % 3 ? Math.sign(rnd() - 0.5) * Z : (rnd() * 2 - 1) * Z;
      p.set([x, y, z], i * 3);
      const col = (edge ? IVORY : TEAL).clone().lerp(IVORY, rnd() * 0.35);
      c.set([col.r, col.g, col.b], i * 3);
    }
    return { p, c, spin: 0.5 };
  }
  function capsule() {
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), r = 0.95, half = 1.25, a = -0.75;
    for (let i = 0; i < N; i++) {
      const y = (rnd() * 2 - 1) * (half + r), th = rnd() * Math.PI * 2;
      let rr = r;
      if (Math.abs(y) > half) { const d = Math.abs(y) - half; rr = Math.sqrt(Math.max(0, r * r - d * d)); }
      rr *= i % 4 ? 1 : Math.sqrt(rnd());
      const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
      p.set([x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z], i * 3);
      const col = (y > 0 ? GOLD : IVORY).clone().lerp(y > 0 ? ROSE : TEAL, rnd() * 0.15);
      c.set([col.r, col.g, col.b], i * 3);
    }
    return { p, c, spin: 0.8 };
  }
  function globe() {
    const p = new Float32Array(N * 3), c = new Float32Array(N * 3), Rr = 2.35, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i, j = 1 + (rnd() - 0.5) * 0.04;
      p.set([Math.cos(th) * r * Rr * j, y * Rr * j, Math.sin(th) * r * Rr * j], i * 3);
      const col = TEAL.clone().lerp(GOLD, (y + 1) / 2).lerp(IVORY, rnd() * 0.25);
      c.set([col.r, col.g, col.b], i * 3);
    }
    return { p, c, spin: 1 };
  }
  const SHAPES = [
    { label: "Every heartbeat", make: heart }, { label: "Every patient's story", make: helix }, { label: "Every department", make: cross },
    { label: "Every prescription", make: capsule }, { label: "One connected hospital", make: globe },
  ].map((s) => Object.assign(s, s.make()));

  /* ---- morphing points: A -> B with a per-point delay, a swirl in between, and the heart beating ---- */
  const g = new THREE.BufferGeometry();
  const posA = new Float32Array(SHAPES[0].p), posB = new Float32Array(SHAPES[0].p), colA = new Float32Array(SHAPES[0].c), colB = new Float32Array(SHAPES[0].c);
  const size = new Float32Array(N), seed = new Float32Array(N), delay = new Float32Array(N);
  for (let i = 0; i < N; i++) { size[i] = 0.5 + rnd() * 0.9; seed[i] = rnd(); delay[i] = rnd() * 0.35; }
  g.setAttribute("position", new THREE.BufferAttribute(posA, 3)); g.setAttribute("aPosB", new THREE.BufferAttribute(posB, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(colA, 3)); g.setAttribute("aColB", new THREE.BufferAttribute(colB, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); g.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMorph: { value: 1 }, uPx: { value: R.getPixelRatio() }, uBase: { value: small ? 6.5 : 5.6 }, uBeatA: { value: 1 }, uBeatB: { value: 1 }, uPulse: { value: 0 } },
    vertexShader: `
      attribute vec3 aPosB; attribute vec3 aColor; attribute vec3 aColB; attribute float aSize; attribute float aSeed; attribute float aDelay;
      uniform float uTime; uniform float uMorph; uniform float uPx; uniform float uBase; uniform float uBeatA; uniform float uBeatB; uniform float uPulse;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float m = smoothstep(aDelay, aDelay + 0.65, uMorph);
        vec3 p = mix(position, aPosB, m);
        float mid = sin(3.14159 * m);
        p += vec3(sin(aSeed * 31.0 + uTime * 1.3), cos(aSeed * 17.0 + uTime * 1.1), sin(aSeed * 13.0 - uTime)) * 0.55 * mid;
        float beat = (uBeatA * (1.0 - m) + uBeatB * m) * uPulse;
        p *= 1.0 + 0.075 * beat;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tw = 0.72 + 0.28 * sin(uTime * (0.7 + aSeed * 1.8) + aSeed * 40.0);
        vAlpha = tw * (0.3 + 0.7 * smoothstep(-11.5, -6.5, mv.z)) * (1.0 + 0.6 * beat);
        vColor = mix(aColor, aColB, m);
        gl_PointSize = aSize * uBase * uPx * (6.0 / -mv.z) * (1.0 + 0.4 * mid);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float d = length(q);
        if (d > 0.5) discard;
        float k = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, (0.35 * k + 0.65 * k * k) * vAlpha);
      }`,
  });
  world.add(new THREE.Points(g, mat));

  /* gold orbits and distant dust */
  const ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.006, 8, 256), ringMat), ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.004, 8, 256), ringMat.clone());
  ring1.rotation.set(1.2, 0.2, 0.3); ring2.material.opacity = 0.16; ring2.rotation.set(1.75, -0.4, 0);
  const orbits = new THREE.Group(); orbits.add(ring1, ring2); scene.add(orbits);
  const D = small ? 350 : 700, dg = new THREE.BufferGeometry(), dp = new Float32Array(D * 3), dc = new Float32Array(D * 3), ds = new Float32Array(D), dsd = new Float32Array(D);
  for (let i = 0; i < D; i++) {
    const r = 7 + rnd() * 10, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    dp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, -Math.abs(r * Math.sin(ph) * Math.sin(th))], i * 3);
    const col = IVORY.clone().lerp(GOLD, rnd() * 0.5); dc.set([col.r, col.g, col.b], i * 3); ds[i] = 0.6 + rnd(); dsd[i] = rnd();
  }
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3)); dg.setAttribute("aColor", new THREE.BufferAttribute(dc, 3));
  dg.setAttribute("aSize", new THREE.BufferAttribute(ds, 1)); dg.setAttribute("aSeed", new THREE.BufferAttribute(dsd, 1));
  const dustMat = pointMaterial(THREE, 4.2, R.getPixelRatio());
  scene.add(new THREE.Points(dg, dustMat));

  /* ---- the ECG: a monitor trace sweeping across the bottom of the hero ---- */
  const E = 520, eg = new THREE.BufferGeometry(), ep = new Float32Array(E * 3), ec = new Float32Array(E * 3);
  const ecgW = 22, ecgY = -2.75, ecgZ = 0.8;
  for (let i = 0; i < E; i++) ep.set([-ecgW / 2 + (i / (E - 1)) * ecgW, ecgY, ecgZ], i * 3);
  eg.setAttribute("position", new THREE.BufferAttribute(ep, 3)); eg.setAttribute("color", new THREE.BufferAttribute(ec, 3));
  const ecgLine = new THREE.Line(eg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  ecgLine.frustumCulled = false; scene.add(ecgLine);
  const headG = new THREE.BufferGeometry();
  headG.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)); headG.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array([0.55, 1, 0.92]), 3));
  headG.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array([5]), 1)); headG.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array([0.5]), 1));
  const headMat = pointMaterial(THREE, 6, R.getPixelRatio());
  const head = new THREE.Points(headG, headMat); head.frustumCulled = false; scene.add(head);
  const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  const ecg = (u) => 0.12 * gauss(u, 0.18, 0.025) - 0.12 * gauss(u, 0.285, 0.008) + 1.0 * gauss(u, 0.305, 0.009) - 0.28 * gauss(u, 0.325, 0.01) + 0.22 * gauss(u, 0.52, 0.045);
  const BPM = 72, beatsAcross = 4.5;

  /* ---- the shape dock: buttons and a caption ---- */
  const dock = document.getElementById("hero-shapes"), cap = document.getElementById("hero-shape-cap");
  let cur = 0, next = 0, morph = 1, holdUntil = 4, auto = true;
  function setDock() {
    if (dock) [].forEach.call(dock.querySelectorAll("[data-shape]"), (b) => b.classList.toggle("on", +b.getAttribute("data-shape") === next));
    if (cap) cap.textContent = SHAPES[next].label;
  }
  function morphTo(k) {
    if (k === next) return;
    const from = morph < 1 ? next : cur;                       // mid-morph: start again from where we were heading
    posA.set(SHAPES[from].p); colA.set(SHAPES[from].c); cur = from;
    next = k; posB.set(SHAPES[k].p); colB.set(SHAPES[k].c);
    ["position", "aPosB", "aColor", "aColB"].forEach((a) => { g.attributes[a].needsUpdate = true; });
    mat.uniforms.uBeatA.value = SHAPES[cur].beat || 0; mat.uniforms.uBeatB.value = SHAPES[k].beat || 0;
    morph = 0; mat.uniforms.uMorph.value = 0; setDock();
  }
  if (dock) dock.addEventListener("click", (e) => { const b = e.target.closest("[data-shape]"); if (!b) return; auto = false; morphTo(+b.getAttribute("data-shape")); clearTimeout(dock._t); dock._t = setTimeout(() => { auto = true; }, 12000); });
  setDock();

  function place() {
    const wide = W() > 860;
    world.position.set(wide ? 2.75 : 0, wide ? 0.25 : 1.25, 0); orbits.position.copy(world.position);
    world.scale.setScalar(wide ? 1 : 0.72); orbits.scale.copy(world.scale);
    ecgLine.position.y = head.position.y = wide ? 0 : -0.4;
  }
  place();
  let mx = 0, my = 0, tx = 0, ty = 0, scrollK = 0;
  window.addEventListener("pointermove", (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 0.5; ty = (e.clientY / window.innerHeight - 0.5) * 0.3; }, { passive: true });
  window.addEventListener("scroll", () => { scrollK = Math.min(1, window.scrollY / (H() * 0.9)); }, { passive: true });
  window.addEventListener("resize", () => { R.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); place(); });

  const t0 = performance.now();
  let last = t0, spinY = 0;
  const frame = loop(mount, (now) => {
    const t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    mat.uniforms.uTime.value = dustMat.uniforms.uTime.value = headMat.uniforms.uTime.value = t;
    const ph = (t * BPM / 60) % 1;                               // lub-dub at 72 a minute, shared by the heart and the ECG
    mat.uniforms.uPulse.value = Math.exp(-Math.pow((ph - 0.31) / 0.035, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.52) / 0.05, 2));
    if (morph < 1) { morph = Math.min(1, morph + dt / 2.4); mat.uniforms.uMorph.value = morph; if (morph >= 1) { cur = next; holdUntil = t + 5.2; } }
    else if (auto && t > holdUntil && !reduce) morphTo((next + 1) % SHAPES.length);
    spinY += dt * 0.2 * (SHAPES[next].spin || 0.3);
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    world.rotation.y = spinY + mx; world.rotation.x = 0.1 + my;
    ring1.rotation.z = t * 0.05; ring2.rotation.z = -t * 0.035;
    const speed = ecgW * (BPM / 60) / beatsAcross;
    const hx = ((t * speed) % ecgW) - ecgW / 2;
    const headIdx = Math.round(((hx + ecgW / 2) / ecgW) * (E - 1));
    for (let i = 0; i < E; i++) {
      const u = ((i / (E - 1)) * beatsAcross) % 1;
      ep[i * 3 + 1] = ecgY + ecg(u) * 0.75;
      let behind = headIdx - i; if (behind < 0) behind += E;
      const k = behind < 6 ? 0 : Math.pow(Math.max(0, 1 - behind / (E * 0.8)), 2);
      ec[i * 3] = 0.42 * k; ec[i * 3 + 1] = 1.0 * k; ec[i * 3 + 2] = 0.9 * k;
    }
    eg.attributes.position.needsUpdate = eg.attributes.color.needsUpdate = true;
    const hp = headG.attributes.position.array;
    hp[0] = ep[headIdx * 3]; hp[1] = ep[headIdx * 3 + 1]; hp[2] = ecgZ; headG.attributes.position.needsUpdate = true;
    camera.position.z = 8.6 + scrollK * 2.2;
    R.domElement.style.opacity = String(1 - scrollK * 0.7);
    R.render(scene, camera);
  });
  mount.classList.add("on");
  debug("hero", { frame, morphTo, R });
});

/* ================================================================================================ 2. the digital twin */
whenVisible(document.getElementById("twin3d"), (THREE, mount) => {
  const W = () => mount.clientWidth || 1, H = () => mount.clientHeight || 1;
  const R = renderer(THREE, mount, 1.5);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0a1f, 26, 46);
  const camera = new THREE.PerspectiveCamera(36, W() / H(), 0.1, 100);
  const C = (h) => new THREE.Color(h);
  const BOOKED = C("#ffc94d"), GOLD = C("#e3c88f"), TEAL = C("#4fd8c6"), AMBER = C("#f2a65a"), SLATE = C("#2b2a52"), RED = C("#ff5c7a"), BLUE = C("#5aa8ff"), IVORY = C("#f6f1e7"), VIOLET = C("#8f86f0");
  const rnd = Math.random;
  scene.add(new THREE.AmbientLight(0x9a96c8, 0.9));
  const key = new THREE.DirectionalLight(0xfff1d6, 1.2); key.position.set(6, 10, 7); scene.add(key);
  const rim = new THREE.PointLight(0x4fd8c6, 18, 30); rim.position.set(-7, 4, -5); scene.add(rim);

  const hospital = new THREE.Group();
  scene.add(hospital);
  const FW = 7.2, FD = 4.2, FH = 1.05, FLOORS = 5;
  const FLOOR_NAMES = ["OPD · Emergency", "Lab · Imaging", "Wards", "ICU", "Theatres"];
  const floorY = (f) => f * FH;

  /* the grounds: a soft disc, gold rings and the road to the ambulance bay */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 96), new THREE.MeshBasicMaterial({ color: 0x141236 }));   // opaque, so it draws before the glowing rooms
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const polar = new THREE.PolarGridHelper(10.5, 24, 6, 96, 0x4a4380, 0x2c2a58);
  polar.material.transparent = true; polar.material.opacity = 0.35; polar.position.y = -0.01; polar.renderOrder = -1; scene.add(polar);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.3), new THREE.MeshBasicMaterial({ color: 0x1d1b48 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, FD / 2 + 2.4); scene.add(road);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xe3c88f, transparent: true, opacity: 0.5 });
  for (let i = -10; i <= 10; i += 1.2) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), dashMat); d.rotation.x = -Math.PI / 2; d.position.set(i, 0.005, FD / 2 + 2.4); d.renderOrder = -1; scene.add(d); }

  /* floors: glass slabs with gold edges, a glass shell, gold columns and the lift core */
  for (let f = 0; f <= FLOORS; f++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.06, FD), new THREE.MeshStandardMaterial({ color: 0x9fe8df, transparent: true, opacity: f === 0 ? 0.28 : 0.12, roughness: 0.15, metalness: 0.3, depthWrite: false }));
    slab.position.y = floorY(f); slab.renderOrder = -1; hospital.add(slab);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: f === FLOORS ? 0.7 : 0.38 }));
    edge.position.copy(slab.position); hospital.add(edge);
  }
  const shell = new THREE.Mesh(new THREE.BoxGeometry(FW, FH * FLOORS, FD), new THREE.MeshStandardMaterial({ color: 0x8fd9ff, transparent: true, opacity: 0.045, roughness: 0.05, metalness: 0.6, depthWrite: false }));
  shell.position.y = FH * FLOORS / 2; hospital.add(shell);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.06, FH * FLOORS, 0.06), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 }));
    col.position.set(sx * FW / 2, FH * FLOORS / 2, sz * FD / 2); hospital.add(col);
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, FH * FLOORS + 0.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  core.position.set(0, FH * FLOORS / 2, 0); hospital.add(core);

  /* rooms: one instanced mesh, coloured by state */
  const COLS = 8, roomW = 0.62, roomD = 0.78, roomH = 0.42;
  const rooms = [];
  for (let f = 0; f < FLOORS; f++) for (let row = 0; row < 2; row++) for (let col = 0; col < COLS; col++) {
    const x = -FW / 2 + 0.55 + col * ((FW - 1.1) / (COLS - 1));
    if (Math.abs(x) < 0.45) continue;
    const z = row === 0 ? -FD / 2 + 0.7 : FD / 2 - 0.7;
    rooms.push({ f, x, z, state: rnd() < (f === 3 ? 0.75 : 0.55) ? "occupied" : rnd() < 0.15 ? "cleaning" : "free" });
  }
  const M4 = new THREE.Matrix4();
  const roomMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(roomW, roomH, roomD), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), rooms.length);
  rooms.forEach((r, i) => { M4.makeTranslation(r.x, floorY(r.f) + roomH / 2 + 0.04, r.z); roomMesh.setMatrixAt(i, M4); });
  const stateColor = (r) => r.state === "occupied" ? (r.f === 3 ? RED : r.f === 4 ? VIOLET : TEAL) : r.state === "cleaning" ? AMBER : r.state === "booked" ? BOOKED : SLATE;
  const paintRooms = () => { rooms.forEach((r, i) => roomMesh.setColorAt(i, stateColor(r))); roomMesh.instanceColor.needsUpdate = true; };
  paintRooms();
  hospital.add(roomMesh);

  /* the roof: a helipad with blinking lights and a glowing red cross */
  const roofY = floorY(FLOORS) + 0.04;
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.95, 64), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(1.8, roofY, 0); hospital.add(pad);
  const hMat = new THREE.MeshBasicMaterial({ color: IVORY });
  [[-0.22, 0.08, 0.7], [0.22, 0.08, 0.7], [0, 0.44, 0.08]].forEach(([x, w, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), hMat); b.position.set(1.8 + x, roofY + 0.01, 0); hospital.add(b); });
  const beacons = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), new THREE.MeshBasicMaterial({ color: RED }));
    b.position.set(1.8 + Math.cos(a) * 1.08, roofY + 0.04, Math.sin(a) * 1.08); hospital.add(b); beacons.push(b);
  }
  const crossMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
  [[0.5, 0.16], [0.16, 0.5]].forEach(([w, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), crossMat); b.position.set(-1.9, roofY + 0.03, 0); hospital.add(b); });

  /* people: glowing points that walk in, take the lift and go to a room */
  const P = small ? 45 : 80;
  const pg = new THREE.BufferGeometry(), pp = new Float32Array(P * 3), pc = new Float32Array(P * 3), ps = new Float32Array(P).fill(3.2), psd = new Float32Array(P).map(() => rnd());
  pg.setAttribute("position", new THREE.BufferAttribute(pp, 3)); pg.setAttribute("aColor", new THREE.BufferAttribute(pc, 3));
  pg.setAttribute("aSize", new THREE.BufferAttribute(ps, 1)); pg.setAttribute("aSeed", new THREE.BufferAttribute(psd, 1));
  const peopleMat = pointMaterial(THREE, 5.5, R.getPixelRatio());
  const people = new THREE.Points(pg, peopleMat); people.frustumCulled = false; hospital.add(people);
  const entrance = new THREE.Vector3(0, 0.12, FD / 2 + 0.9);
  const walkers = [];
  function newWalk(w) {
    const free = rooms.filter((r) => r.state === "free");
    const target = free.length ? free[Math.floor(rnd() * free.length)] : rooms[Math.floor(rnd() * rooms.length)];
    const y = floorY(target.f) + 0.12;
    w.curve = new THREE.CatmullRomCurve3([entrance.clone().add(new THREE.Vector3((rnd() - 0.5) * 2.5, 0, 1.2 + rnd())), entrance.clone(), new THREE.Vector3(0, 0.12, 0.5),
      new THREE.Vector3(0, y, 0.45), new THREE.Vector3(target.x * 0.5, y, target.z > 0 ? 0.6 : -0.6), new THREE.Vector3(target.x, y, target.z * 0.85)], false, "centripetal");
    w.u = 0; w.speed = 0.035 + rnd() * 0.04; w.target = target; w.col = target.f === 0 ? GOLD : target.f === 3 ? RED : TEAL;
    w.books = target.state === "free" && rnd() < 0.3;           // most people are visitors; some are being admitted
    if (w.books) target.state = "booked";
  }
  for (let i = 0; i < P; i++) { const w = {}; newWalk(w); w.u = rnd(); walkers.push(w); }
  paintRooms();

  /* the ambulance: lights flashing red and blue, along the road to emergency */
  const amb = new THREE.Group();
  const ambBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.4 }));
  ambBody.position.y = 0.17; amb.add(ambBody);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.05, 0.31), new THREE.MeshBasicMaterial({ color: RED })); stripe.position.y = 0.2; amb.add(stripe);
  const sirenR = new THREE.PointLight(0xff3355, 6, 3.5), sirenB = new THREE.PointLight(0x3b82ff, 6, 3.5);
  sirenR.position.set(-0.1, 0.45, 0); sirenB.position.set(0.1, 0.45, 0); amb.add(sirenR, sirenB);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: RED })); lamp.position.y = 0.35; amb.add(lamp);
  scene.add(amb);
  const ambPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-11, 0, FD / 2 + 2.55), new THREE.Vector3(-4, 0, FD / 2 + 2.55), new THREE.Vector3(-1.6, 0, FD / 2 + 2.2),
    new THREE.Vector3(-1.2, 0, FD / 2 + 1.25), new THREE.Vector3(-0.9, 0, FD / 2 + 0.95)]);

  /* floor labels over the canvas, and live counters beside it */
  const labelBox = document.getElementById("twin-labels");
  const labels = labelBox ? FLOOR_NAMES.map((n, f) => {
    const d = document.createElement("span"); d.className = "tw-label"; d.textContent = n; labelBox.appendChild(d);
    return { el: d, pos: new THREE.Vector3(FW / 2 + 0.2, floorY(f) + 0.45, FD / 2) };
  }) : [];
  const stat = (id) => document.getElementById(id);
  const stats = { occ: stat("tw-occ"), move: stat("tw-move"), clean: stat("tw-clean"), amb: stat("tw-amb") };

  /* camera: a slow orbit you can drag */
  let yaw = -0.6, pitch = 0.42, dragging = false, lx = 0, ly = 0, idle = 3;
  const dist = small ? 17.5 : 15.5;
  mount.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; try { mount.setPointerCapture(e.pointerId); } catch (x) {} });
  mount.addEventListener("pointermove", (e) => { if (!dragging) return; yaw -= (e.clientX - lx) * 0.006; pitch = Math.max(0.12, Math.min(1.0, pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; idle = 0; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((k) => mount.addEventListener(k, () => { dragging = false; }));
  window.addEventListener("resize", () => { R.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });

  const t0 = performance.now(), v = new THREE.Vector3();
  let last = t0, ambU = -0.3, nextFlip = 0;
  const frame = loop(mount, (now) => {
    const t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    peopleMat.uniforms.uTime.value = t;
    idle += dt;
    if (!dragging && idle > 2) yaw += dt * 0.07;
    const cy = FH * FLOORS * 0.42;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, cy + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, cy, 0);
    let repaint = false;
    for (let i = 0; i < P; i++) {
      const w = walkers[i];
      w.u += dt * w.speed;
      if (w.u >= 1) { if (w.books && w.target.state === "booked") w.target.state = "occupied"; newWalk(w); repaint = true; }
      w.curve.getPointAt(Math.min(1, w.u), v);
      pp[i * 3] = v.x; pp[i * 3 + 1] = v.y; pp[i * 3 + 2] = v.z;
      pc[i * 3] = w.col.r; pc[i * 3 + 1] = w.col.g; pc[i * 3 + 2] = w.col.b;
    }
    pg.attributes.position.needsUpdate = pg.attributes.aColor.needsUpdate = true;
    if (t > nextFlip) {                                            // rooms empty, get cleaned and come free again
      nextFlip = t + 0.6;
      const occ = rooms.filter((r) => r.state === "occupied"), cl = rooms.filter((r) => r.state === "cleaning");
      if (occ.length > rooms.length * 0.5) occ[Math.floor(rnd() * occ.length)].state = "cleaning";
      if (cl.length) cl[Math.floor(rnd() * cl.length)].state = "free";
      repaint = true;
      const occN = rooms.filter((r) => r.state === "occupied").length;
      if (stats.occ) stats.occ.textContent = Math.round(100 * occN / rooms.length) + "%";
      if (stats.move) stats.move.textContent = String(walkers.filter((w) => w.u < 1).length);
      if (stats.clean) stats.clean.textContent = String(rooms.filter((r) => r.state === "cleaning").length);
    }
    if (repaint) paintRooms();
    ambU += dt * 0.09;
    if (ambU > 1.35) ambU = -0.4;
    const au = Math.max(0, Math.min(1, ambU));
    ambPath.getPointAt(au, v); amb.position.copy(v);
    ambPath.getTangentAt(Math.min(0.999, au + 0.001), v); amb.rotation.y = Math.atan2(-v.z, v.x);
    const flash = Math.floor(t * 6) % 2;
    sirenR.intensity = flash ? 7 : 0.5; sirenB.intensity = flash ? 0.5 : 7; lamp.material.color.copy(flash ? RED : BLUE);
    amb.visible = ambU > -0.05;
    if (stats.amb) stats.amb.textContent = ambU > 0 && ambU < 1 ? "Arriving" : ambU >= 1 ? "At the ER" : "On call";
    beacons.forEach((b, i) => { b.material.color.copy(Math.floor(t * 2 + i / 2) % 2 ? RED : IVORY); });
    core.material.opacity = 0.12 + 0.06 * Math.sin(t * 2);
    R.render(scene, camera);
    labels.forEach((l) => {
      v.copy(l.pos).project(camera);
      l.el.style.transform = "translate(" + ((v.x * 0.5 + 0.5) * W()).toFixed(1) + "px," + ((-v.y * 0.5 + 0.5) * H()).toFixed(1) + "px)";
      l.el.style.opacity = v.z < 1 ? "1" : "0";
    });
  });
  mount.classList.add("on");
  debug("twin", { frame, R });
});
