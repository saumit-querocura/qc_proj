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



/* sections and cards rise into view as you scroll */
if ("IntersectionObserver" in window && !reduce) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll(".lux .lx-sec h2, .lux .lx-p, .lux .lx-ticks li, .lux .bx, .lux .lx-steps li, .lux .lx-trust > div, .lux .lx-timeline, .lux .lx-twin-stage, .lux .tw-stats > div")
    .forEach((n, i) => { n.classList.add("rv"); n.style.transitionDelay = ((i % 6) * 60) + "ms"; io.observe(n); });
}

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
/* Thousands of points that re-form into the shapes of care.  Each shape has its own life: the heart flashes with
 * each beat, the lungs glow in and out with each breath, the brain's neurons fire.  Nothing follows the cursor.
 * Which shapes, in which order and with which captions comes from the mount's data-set ("hospital" or "patient"). */
const SETS = {
  hospital: [["heart", "Every heartbeat"], ["dna", "Every patient's story"], ["cross", "Every department"], ["brain", "Every decision"],
    ["lungs", "Every breath"], ["capsule", "Every prescription"], ["globe", "One connected hospital"]],
  patient: [["heart", "Your heart: blood pressure and pulse, understood over time"], ["lungs", "Your breathing and oxygen, in clear trends"],
    ["brain", "A symptom check that thinks like a doctor"], ["dna", "Your whole health story, in one place"],
    ["capsule", "Your medicines and reminders, never advice"], ["globe", "Shared with your doctors only when you say yes"]],
};

function heroScene(THREE, mount) {
  const W = () => mount.clientWidth || 1, H = () => mount.clientHeight || 1;
  const R = renderer(THREE, mount);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
  camera.position.set(0, 0, 8.6);
  const world = new THREE.Group();
  scene.add(world);
  const C = (h) => new THREE.Color(h);
  const GOLD = C("#e3c88f"), TEAL = C("#4fd8c6"), IVORY = C("#f6f1e7"), ROSE = C("#ff6b8a"), CRIMSON = C("#e8395f"), VIOLET = C("#8f86f0"), SKY = C("#6ec3ff"), PINK = C("#ff9ec4");
  const N = small ? 3800 : 7000;
  const rnd = Math.random;
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return u / 2 - 1; };

  /* ---- shapes: each gives N positions, N colours and a "life" (1 heartbeat, 2 breath, 3 neurons, 0 none) ---- */
  const MAKE = {
    heart() {
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
      return { p, c, life: 1, sway: 1 };
    },
    dna() {
      const p = new Float32Array(N * 3), c = new Float32Array(N * 3), turns = 2.2, Hh = 4.5, r = 1.0;
      for (let i = 0; i < N; i++) {
        let col;
        if (i % 4 === 0) {
          const yy = Math.round(((rnd() - 0.5) * Hh) / (Hh / 30)) * (Hh / 30), aa = (yy / Hh) * turns * Math.PI * 2, u = rnd();
          p.set([Math.cos(aa) * r * (1 - 2 * u), yy, Math.sin(aa) * r * (1 - 2 * u)], i * 3);
          col = (u < 0.5 ? GOLD : IVORY).clone();
        } else {
          const y = (rnd() - 0.5) * Hh, a = (y / Hh) * turns * Math.PI * 2, s = i % 2 ? 0 : Math.PI;
          p.set([Math.cos(a + s) * r + (rnd() - 0.5) * 0.06, y, Math.sin(a + s) * r + (rnd() - 0.5) * 0.06], i * 3);
          col = (s ? TEAL : VIOLET).clone().lerp(SKY, rnd() * 0.3);
        }
        c.set([col.r, col.g, col.b], i * 3);
      }
      return { p, c, life: 3, spin: 1.6 };
    },
    cross() {
      const p = new Float32Array(N * 3), c = new Float32Array(N * 3), L = 1.75, T = 0.5, Z = 0.32;
      for (let i = 0; i < N; i++) {
        let x, y;
        for (;;) {
          if (rnd() < 0.5) { x = (rnd() * 2 - 1) * T; y = (rnd() * 2 - 1) * L; break; }
          x = (rnd() * 2 - 1) * L; y = (rnd() * 2 - 1) * T; if (Math.abs(x) >= T) break;
        }
        const edge = i % 7 === 0;
        if (edge) { if (Math.abs(x) > T) y = Math.sign(y || 1) * T; else x = Math.sign(x || 1) * T; }
        p.set([x, y, i % 3 ? Math.sign(rnd() - 0.5) * Z : (rnd() * 2 - 1) * Z], i * 3);
        const col = (edge ? IVORY : TEAL).clone().lerp(IVORY, rnd() * 0.35);
        c.set([col.r, col.g, col.b], i * 3);
      }
      return { p, c, life: 0, sway: 1 };
    },
    brain() {
      // two folded hemispheres, the cerebellum behind and below, and the brainstem
      const p = new Float32Array(N * 3), c = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const part = rnd();
        let x, y, z, col;
        if (part < 0.86) {
          const side = i % 2 ? 1 : -1, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
          let ux = Math.sin(ph) * Math.cos(th), uy = Math.cos(ph), uz = Math.sin(ph) * Math.sin(th);
          if (ux * side < 0) ux *= 0.35;                       // flatter where the hemispheres meet
          const fold = 1 + 0.11 * Math.sin(9 * th + 5 * uy) * Math.sin(7 * ph + 3 * uz) + 0.04 * Math.sin(17 * th * ph);
          const shell = i % 5 ? 1 : 0.6 + 0.4 * rnd();
          x = side * 0.62 + ux * 0.95 * fold * shell; y = uy * 1.05 * fold * shell + 0.2; z = uz * 1.45 * fold * shell;
          if (y < -0.55) y = -0.55 + (y + 0.55) * 0.3;
          col = VIOLET.clone().lerp(PINK, (uy + 1) / 2 * 0.7).lerp(IVORY, rnd() * 0.2);
        } else if (part < 0.95) {
          const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
          x = Math.sin(ph) * Math.cos(th) * 0.85; y = -0.75 + Math.cos(ph) * 0.38; z = -0.95 + Math.sin(ph) * Math.sin(th) * 0.55;
          col = PINK.clone().lerp(VIOLET, rnd() * 0.4);
        } else {
          const t = rnd();
          x = (rnd() - 0.5) * 0.3; y = -0.6 - t * 1.25; z = -0.35 - t * 0.25 + (rnd() - 0.5) * 0.3;
          col = TEAL.clone().lerp(IVORY, rnd() * 0.4);
        }
        p.set([x, y, z], i * 3); c.set([col.r, col.g, col.b], i * 3);
      }
      return { p, c, life: 3, sway: 1, face: Math.PI / 2 - 0.35 };
    },
    lungs() {
      // two lobes, the trachea and a branching bronchial tree
      const p = new Float32Array(N * 3), c = new Float32Array(N * 3);
      const branches = [];
      const grow = (x, y, z, dx, dy, dz, len, depth) => {
        const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
        branches.push([x, y, z, ex, ey, ez, depth]);
        if (depth < 4) {
          const spread = 0.55;
          grow(ex, ey, ez, dx + spread * (rnd() + 0.3) * Math.sign(dx || 1), dy - 0.2, dz + (rnd() - 0.5) * 0.6, len * 0.68, depth + 1);
          grow(ex, ey, ez, dx * 0.3 - spread * 0.4 * Math.sign(dx || 1), dy - 0.6, dz + (rnd() - 0.5) * 0.6, len * 0.66, depth + 1);
        }
      };
      grow(0, 0.95, 0, -0.55, -0.85, 0, 0.75, 1);
      grow(0, 0.95, 0, 0.55, -0.85, 0, 0.75, 1);
      for (let i = 0; i < N; i++) {
        const part = rnd();
        let x, y, z, col;
        if (part < 0.74) {
          const side = i % 2 ? 1 : -1, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), shell = i % 4 ? 1 : Math.cbrt(rnd());
          let ux = Math.sin(ph) * Math.cos(th), uy = Math.cos(ph), uz = Math.sin(ph) * Math.sin(th);
          if (ux * side < 0) ux *= 0.45;                        // the inner side is flatter, where the heart sits
          const taper = uy > 0 ? 1 - uy * 0.35 : 1;               // narrower at the top
          x = side * 1.05 + ux * 0.82 * taper * shell; y = -0.25 + uy * 1.45 * shell; z = uz * 0.72 * taper * shell;
          col = ROSE.clone().lerp(PINK, rnd() * 0.6).lerp(IVORY, rnd() * 0.15);
        } else if (part < 0.8) {
          const t = rnd();
          x = gauss() * 0.06; y = 0.95 + t * 1.25; z = gauss() * 0.06;
          col = IVORY.clone().lerp(TEAL, rnd() * 0.4);
        } else {
          const b = branches[Math.floor(rnd() * branches.length)], t = rnd(), w = 0.07 / b[6];
          x = b[0] + (b[3] - b[0]) * t + gauss() * w; y = b[1] + (b[4] - b[1]) * t + gauss() * w; z = b[2] + (b[5] - b[2]) * t + gauss() * w;
          col = IVORY.clone().lerp(TEAL, b[6] / 5);
        }
        p.set([x, y, z], i * 3); c.set([col.r, col.g, col.b], i * 3);
      }
      return { p, c, life: 2, sway: 1 };
    },
    capsule() {
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
      return { p, c, life: 0, spin: 0.8 };
    },
    globe() {
      const p = new Float32Array(N * 3), c = new Float32Array(N * 3), Rr = 2.35, ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i, j = 1 + (rnd() - 0.5) * 0.04;
        p.set([Math.cos(th) * r * Rr * j, y * Rr * j, Math.sin(th) * r * Rr * j], i * 3);
        const col = TEAL.clone().lerp(GOLD, (y + 1) / 2).lerp(IVORY, rnd() * 0.25);
        c.set([col.r, col.g, col.b], i * 3);
      }
      return { p, c, life: 3, spin: 1 };
    },
  };
  const set = SETS[mount.dataset.set] || SETS.hospital;
  const SHAPES = set.map(([key, label]) => Object.assign({ key, label }, MAKE[key]()));

  /* ---- morphing points ---- */
  const g = new THREE.BufferGeometry();
  const posA = new Float32Array(SHAPES[0].p), posB = new Float32Array(SHAPES[0].p), colA = new Float32Array(SHAPES[0].c), colB = new Float32Array(SHAPES[0].c);
  const size = new Float32Array(N), seed = new Float32Array(N), delay = new Float32Array(N);
  for (let i = 0; i < N; i++) { size[i] = 0.5 + rnd() * 0.9; seed[i] = rnd(); delay[i] = rnd() * 0.35; }
  g.setAttribute("position", new THREE.BufferAttribute(posA, 3)); g.setAttribute("aPosB", new THREE.BufferAttribute(posB, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(colA, 3)); g.setAttribute("aColB", new THREE.BufferAttribute(colB, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); g.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uMorph: { value: 1 }, uPx: { value: R.getPixelRatio() }, uBase: { value: small ? 6.5 : 5.6 },
      uLifeA: { value: SHAPES[0].life }, uLifeB: { value: SHAPES[0].life }, uPulse: { value: 0 }, uBreath: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aPosB; attribute vec3 aColor; attribute vec3 aColB; attribute float aSize; attribute float aSeed; attribute float aDelay;
      uniform float uTime; uniform float uMorph; uniform float uPx; uniform float uBase; uniform float uLifeA; uniform float uLifeB;
      uniform float uPulse; uniform float uBreath;
      varying vec3 vColor; varying float vAlpha;
      float life(float mode, vec3 p) {
        if (mode < 0.5) return 0.0;
        if (mode < 1.5) return uPulse * (0.6 + 0.4 * sin(p.y * 2.0 - uTime * 6.0));                     // a beat sweeping through
        if (mode < 2.5) return uBreath * smoothstep(-1.8, 1.2, p.y + 1.2 * uBreath - 0.6) * 0.9;         // light filling the lungs
        return pow(max(0.0, sin(uTime * (2.0 + aSeed * 5.0) + aSeed * 90.0)), 24.0) * 2.2;            // neurons firing
      }
      void main() {
        float m = smoothstep(aDelay, aDelay + 0.65, uMorph);
        vec3 p = mix(position, aPosB, m);
        float mid = sin(3.14159 * m);
        p += vec3(sin(aSeed * 31.0 + uTime * 1.3), cos(aSeed * 17.0 + uTime * 1.1), sin(aSeed * 13.0 - uTime)) * 0.55 * mid;
        float glow = life(uLifeA, p) * (1.0 - m) + life(uLifeB, p) * m;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tw = 0.72 + 0.28 * sin(uTime * (0.7 + aSeed * 1.8) + aSeed * 40.0);
        vAlpha = tw * (0.3 + 0.7 * smoothstep(-11.5, -6.5, mv.z)) * (1.0 + glow);
        vColor = mix(mix(aColor, aColB, m), vec3(1.0, 0.93, 0.78), clamp(glow * 0.25, 0.0, 0.6));
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
  const D = small ? 350 : 700, dg = new THREE.BufferGeometry(), dp = new Float32Array(D * 3), dc = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) {
    const r = 7 + rnd() * 10, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    dp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, -Math.abs(r * Math.sin(ph) * Math.sin(th))], i * 3);
    const col = IVORY.clone().lerp(GOLD, rnd() * 0.5); dc.set([col.r, col.g, col.b], i * 3);
  }
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3)); dg.setAttribute("aColor", new THREE.BufferAttribute(dc, 3));
  dg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(D).map(() => 0.6 + rnd()), 1)); dg.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(D).map(() => rnd()), 1));
  const dustMat = pointMaterial(THREE, 4.2, R.getPixelRatio());
  scene.add(new THREE.Points(dg, dustMat));

  /* ---- the ECG ---- */
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
  const gs = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  const ecg = (u) => 0.12 * gs(u, 0.18, 0.025) - 0.12 * gs(u, 0.285, 0.008) + 1.0 * gs(u, 0.305, 0.009) - 0.28 * gs(u, 0.325, 0.01) + 0.22 * gs(u, 0.52, 0.045);
  const BPM = 72, beatsAcross = 4.5;

  /* ---- dock and caption ---- */
  const root = mount.closest("section") || document;
  const dock = root.querySelector("[data-shapes]"), cap = root.querySelector("[data-shape-cap]");
  let cur = 0, next = 0, morph = 1, holdUntil = 4, auto = true;
  function setDock() {
    if (dock) [].forEach.call(dock.querySelectorAll("[data-shape]"), (b) => b.classList.toggle("on", +b.getAttribute("data-shape") === next));
    if (cap) { cap.classList.remove("swap"); void cap.offsetWidth; cap.classList.add("swap"); cap.textContent = SHAPES[next].label; }
  }
  function morphTo(k) {
    if (k === next || !SHAPES[k]) return;
    const from = morph < 1 ? next : cur;
    posA.set(SHAPES[from].p); colA.set(SHAPES[from].c); cur = from;
    next = k; posB.set(SHAPES[k].p); colB.set(SHAPES[k].c);
    ["position", "aPosB", "aColor", "aColB"].forEach((a) => { g.attributes[a].needsUpdate = true; });
    mat.uniforms.uLifeA.value = SHAPES[cur].life; mat.uniforms.uLifeB.value = SHAPES[k].life;
    morph = 0; mat.uniforms.uMorph.value = 0; setDock();
  }
  if (dock) dock.addEventListener("click", (e) => { const b = e.target.closest("[data-shape]"); if (!b) return; auto = false; morphTo(+b.getAttribute("data-shape")); clearTimeout(dock._t); dock._t = setTimeout(() => { auto = true; }, 12000); });
  setDock();

  function place() {
    const wide = W() > 860, side = mount.dataset.side || "right";
    const x = !wide || side === "centre" ? 0 : side === "left" ? -2.75 : 2.75;
    world.position.set(x, wide ? 0.25 : 1.25, side === "centre" && wide ? -1.2 : 0); orbits.position.copy(world.position);
    world.scale.setScalar(wide ? 1 : 0.72); orbits.scale.copy(world.scale);
    ecgLine.position.y = head.position.y = wide ? 0 : -0.4;
  }
  place();
  let scrollK = 0;
  window.addEventListener("scroll", () => { const r = mount.getBoundingClientRect(); scrollK = Math.min(1, Math.max(0, -r.top / (H() * 0.9))); }, { passive: true });
  window.addEventListener("resize", () => { R.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); place(); });

  const t0 = performance.now();
  let last = t0, spinY = 0;
  const frame = loop(mount, (now) => {
    const t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    mat.uniforms.uTime.value = dustMat.uniforms.uTime.value = headMat.uniforms.uTime.value = t;
    const ph = (t * BPM / 60) % 1;
    mat.uniforms.uPulse.value = Math.exp(-Math.pow((ph - 0.31) / 0.035, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.52) / 0.05, 2));
    mat.uniforms.uBreath.value = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 4.2);          // about 14 breaths a minute
    if (morph < 1) { morph = Math.min(1, morph + dt / 2.4); mat.uniforms.uMorph.value = morph; if (morph >= 1) { cur = next; holdUntil = t + 5.5; } }
    else if (auto && t > holdUntil && !reduce) morphTo((next + 1) % SHAPES.length);
    // flat shapes (heart, cross, brain, lungs) sway to face you; round ones spin
    spinY += dt * 0.2 * (SHAPES[next].spin || 0);
    const swayTo = SHAPES[next].sway ? (SHAPES[next].face || 0) + Math.sin(t * 0.32) * 0.55 : spinY;
    if (SHAPES[next].sway) { const k = Math.round((spinY - swayTo) / (Math.PI * 2)); spinY += (swayTo + k * Math.PI * 2 - spinY) * Math.min(1, dt * 1.6); }
    world.rotation.y = spinY; world.rotation.x = 0.1;
    ring1.rotation.z = t * 0.05; ring2.rotation.z = -t * 0.035;
    const speed = ecgW * (BPM / 60) / beatsAcross;
    const headIdx = Math.round(((((t * speed) % ecgW)) / ecgW) * (E - 1));
    for (let i = 0; i < E; i++) {
      ep[i * 3 + 1] = ecgY + ecg(((i / (E - 1)) * beatsAcross) % 1) * 0.75;
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
  return { frame, morphTo, R };
}
document.querySelectorAll("[data-qc3d-hero], #hero3d").forEach((m) => whenVisible(m, (THREE, mount) => debug("hero", heroScene(THREE, mount))));

/* ================================================================================================ 2. the digital twin */
/* A glass hospital built from a description: floors (name, kind, rooms), whether there is a helipad and an ambulance.
 * The landing page shows a typical hospital; the setup page builds the visitor's own hospital from their answers and
 * rebuilds it, floor by floor, as they change them. */
const KIND = {
  opd: { col: "#4fd8c6" }, er: { col: "#ff7a59" }, lab: { col: "#6ec3ff" }, ward: { col: "#4fd8c6" }, icu: { col: "#ff5c7a" },
  ot: { col: "#8f86f0" }, maternity: { col: "#ff9ec4" }, daycare: { col: "#e3c88f" }, clinic: { col: "#4fd8c6" },
};
const DEFAULT_TWIN = {
  floors: [{ name: "OPD · Emergency", kind: "opd", rooms: 14 }, { name: "Lab · Imaging", kind: "lab", rooms: 12 }, { name: "Wards", kind: "ward", rooms: 14 },
    { name: "ICU", kind: "icu", rooms: 12 }, { name: "Theatres", kind: "ot", rooms: 8 }],
  helipad: true, ambulance: true,
};

function makeTwin(THREE, mount, first, opts) {
  opts = opts || {};
  const W = () => mount.clientWidth || 1, H = () => mount.clientHeight || 1;
  const R = renderer(THREE, mount, 1.5);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0a1f, 30, 60);
  const camera = new THREE.PerspectiveCamera(36, W() / H(), 0.1, 200);
  const C = (h) => new THREE.Color(h);
  const BOOKED = C("#ffc94d"), GOLD = C("#e3c88f"), AMBER = C("#f2a65a"), SLATE = C("#2b2a52"), RED = C("#ff5c7a"), BLUE = C("#5aa8ff"), IVORY = C("#f6f1e7"), TEAL = C("#4fd8c6");
  const rnd = Math.random;
  scene.add(new THREE.AmbientLight(0x9a96c8, 0.9));
  const key = new THREE.DirectionalLight(0xfff1d6, 1.2); key.position.set(6, 12, 7); scene.add(key);
  const rim = new THREE.PointLight(0x4fd8c6, 18, 40); rim.position.set(-8, 5, -6); scene.add(rim);

  /* the grounds (drawn first: opaque, so the glowing rooms always show over them) */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 96), new THREE.MeshBasicMaterial({ color: 0x141236 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const polar = new THREE.PolarGridHelper(15, 24, 7, 96, 0x4a4380, 0x2c2a58);
  polar.material.transparent = true; polar.material.opacity = 0.35; polar.position.y = -0.01; polar.renderOrder = -1; scene.add(polar);

  const people = { mat: pointMaterial(THREE, opts.compact ? 6.5 : 5.5, R.getPixelRatio()) };
  const labelBox = opts.labels || null;
  let B = null;                                                  // the current building and everything that moves in it

  function dispose(o) {
    o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) [].concat(x.material).forEach((m) => { if (m !== people.mat) m.dispose(); }); });
  }

  function build(cfg) {
    if (B) { scene.remove(B.root); dispose(B.root); B.labels.forEach((l) => l.el.remove()); }
    const floors = (cfg.floors || []).slice(0, 10);
    const maxRooms = Math.max(2, ...floors.map((f) => f.rooms || 2));
    const cols = Math.ceil(maxRooms / 2);
    const FW = Math.max(4.2, Math.min(11, cols * 0.86 + 1.4)), FD = 4.2, FH = 1.05, NF = Math.max(1, floors.length);
    const fy = (f) => f * FH;
    const root = new THREE.Group(), hospital = new THREE.Group();
    root.add(hospital); scene.add(root);
    // the road and the ambulance bay in front
    const road = new THREE.Mesh(new THREE.PlaneGeometry(34, 1.3), new THREE.MeshBasicMaterial({ color: 0x1d1b48 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, FD / 2 + 2.4); root.add(road);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xe3c88f, transparent: true, opacity: 0.5 });
    for (let i = -16; i <= 16; i += 1.2) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), dashMat); d.rotation.x = -Math.PI / 2; d.position.set(i, 0.005, FD / 2 + 2.4); d.renderOrder = -1; root.add(d); }
    // floors, shell, columns, lift core
    for (let f = 0; f <= NF; f++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.06, FD), new THREE.MeshStandardMaterial({ color: 0x9fe8df, transparent: true, opacity: f === 0 ? 0.28 : 0.12, roughness: 0.15, metalness: 0.3, depthWrite: false }));
      slab.position.y = fy(f); slab.renderOrder = -1; hospital.add(slab);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: f === NF ? 0.7 : 0.38 }));
      edge.position.copy(slab.position); hospital.add(edge);
    }
    const shell = new THREE.Mesh(new THREE.BoxGeometry(FW, FH * NF, FD), new THREE.MeshStandardMaterial({ color: 0x8fd9ff, transparent: true, opacity: 0.045, roughness: 0.05, metalness: 0.6, depthWrite: false }));
    shell.position.y = FH * NF / 2; hospital.add(shell);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.06, FH * NF, 0.06), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55 }));
      col.position.set(sx * FW / 2, FH * NF / 2, sz * FD / 2); hospital.add(col);
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, FH * NF + 0.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    core.position.set(0, FH * NF / 2, 0); hospital.add(core);
    // rooms: two rows per floor, a gap in the middle for the lift
    const rooms = [];
    floors.forEach((fl, f) => {
      const n = Math.max(1, Math.min(fl.rooms || 2, 22)), perRow = Math.ceil(n / 2), slots = perRow + 1;
      const xs = [];
      for (let k = 0; k < slots; k++) xs.push(-FW / 2 + 0.55 + k * ((FW - 1.1) / Math.max(1, slots - 1)));
      xs.sort((a, b) => Math.abs(a) - Math.abs(b)); xs.shift(); xs.sort((a, b) => a - b);          // the slot nearest the lift stays empty
      for (let k = 0; k < n; k++) {
        const x = xs[Math.floor(k / 2) % xs.length], z = k % 2 ? FD / 2 - 0.7 : -FD / 2 + 0.7;
        rooms.push({ f, x, z, kind: fl.kind, state: rnd() < (fl.kind === "icu" ? 0.72 : 0.55) ? "occupied" : rnd() < 0.15 ? "cleaning" : "free" });
      }
    });
    const roomW = Math.min(0.62, (FW - 1.1) / Math.max(2, cols + 1) * 0.82), roomD = 0.78, roomH = 0.42;
    const roomMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(roomW, roomH, roomD), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), Math.max(1, rooms.length));
    const M4 = new THREE.Matrix4();
    rooms.forEach((r, i) => { M4.makeTranslation(r.x, fy(r.f) + roomH / 2 + 0.04, r.z); roomMesh.setMatrixAt(i, M4); });
    const kindCol = {}; Object.keys(KIND).forEach((k) => { kindCol[k] = C(KIND[k].col); });
    const stateColor = (r) => r.state === "occupied" ? (kindCol[r.kind] || TEAL) : r.state === "cleaning" ? AMBER : r.state === "booked" ? BOOKED : SLATE;
    const paint = () => { rooms.forEach((r, i) => roomMesh.setColorAt(i, stateColor(r))); if (roomMesh.instanceColor) roomMesh.instanceColor.needsUpdate = true; };
    paint();
    if (rooms.length) hospital.add(roomMesh);
    // the roof: a glowing red cross, and a helipad with blinking lights on big hospitals
    const roofY = fy(NF) + 0.04;
    const crossMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    [[0.5, 0.16], [0.16, 0.5]].forEach(([w, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), crossMat); b.position.set(cfg.helipad ? -FW / 4 : 0, roofY + 0.03, 0); hospital.add(b); });
    const beacons = [];
    if (cfg.helipad) {
      const px = FW / 4;
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.95, 64), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(px, roofY, 0); hospital.add(pad);
      const hMat = new THREE.MeshBasicMaterial({ color: IVORY });
      [[-0.22, 0.08, 0.7], [0.22, 0.08, 0.7], [0, 0.44, 0.08]].forEach(([x, w, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), hMat); b.position.set(px + x, roofY + 0.01, 0); hospital.add(b); });
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), new THREE.MeshBasicMaterial({ color: RED }));
        b.position.set(px + Math.cos(a) * 1.08, roofY + 0.04, Math.sin(a) * 1.08); hospital.add(b); beacons.push(b);
      }
    }
    // people walking in, up the lift and to a room
    const P = Math.max(8, Math.min(opts.compact ? 36 : 80, rooms.length * 2));
    const pg = new THREE.BufferGeometry(), pp = new Float32Array(P * 3), pc = new Float32Array(P * 3);
    pg.setAttribute("position", new THREE.BufferAttribute(pp, 3)); pg.setAttribute("aColor", new THREE.BufferAttribute(pc, 3));
    pg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(P).fill(3.2), 1)); pg.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(P).map(() => rnd()), 1));
    const dots = new THREE.Points(pg, people.mat); dots.frustumCulled = false; hospital.add(dots);
    const entrance = new THREE.Vector3(0, 0.12, FD / 2 + 0.9);
    const walkers = [];
    const newWalk = (w) => {
      const free = rooms.filter((r) => r.state === "free");
      const target = free.length ? free[Math.floor(rnd() * free.length)] : rooms[Math.floor(rnd() * rooms.length)];
      if (!target) return;
      const y = fy(target.f) + 0.12;
      w.curve = new THREE.CatmullRomCurve3([entrance.clone().add(new THREE.Vector3((rnd() - 0.5) * 2.5, 0, 1.2 + rnd())), entrance.clone(), new THREE.Vector3(0, 0.12, 0.5),
        new THREE.Vector3(0, y, 0.45), new THREE.Vector3(target.x * 0.5, y, target.z > 0 ? 0.6 : -0.6), new THREE.Vector3(target.x, y, target.z * 0.85)], false, "centripetal");
      w.u = 0; w.speed = 0.035 + rnd() * 0.04; w.target = target; w.col = kindCol[target.kind] || TEAL;
      w.books = target.state === "free" && rnd() < 0.3;
      if (w.books) target.state = "booked";
    };
    if (rooms.length) for (let i = 0; i < P; i++) { const w = {}; newWalk(w); w.u = rnd(); walkers.push(w); }
    // the ambulance
    let amb = null;
    if (cfg.ambulance) {
      amb = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.4 })); body.position.y = 0.17; amb.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.05, 0.31), new THREE.MeshBasicMaterial({ color: RED })); stripe.position.y = 0.2; amb.add(stripe);
      amb.userData.sR = new THREE.PointLight(0xff3355, 6, 3.5); amb.userData.sB = new THREE.PointLight(0x3b82ff, 6, 3.5);
      amb.userData.sR.position.set(-0.1, 0.45, 0); amb.userData.sB.position.set(0.1, 0.45, 0); amb.add(amb.userData.sR, amb.userData.sB);
      amb.userData.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: RED })); amb.userData.lamp.position.y = 0.35; amb.add(amb.userData.lamp);
      amb.userData.path = new THREE.CatmullRomCurve3([new THREE.Vector3(-16, 0, FD / 2 + 2.55), new THREE.Vector3(-4, 0, FD / 2 + 2.55), new THREE.Vector3(-1.6, 0, FD / 2 + 2.2),
        new THREE.Vector3(-1.2, 0, FD / 2 + 1.25), new THREE.Vector3(-0.9, 0, FD / 2 + 0.95)]);
      root.add(amb);
    }
    // labels for each floor
    const labels = labelBox ? floors.map((fl, f) => {
      const d = document.createElement("span"); d.className = "tw-label"; d.textContent = fl.name; labelBox.appendChild(d);
      return { el: d, pos: new THREE.Vector3(FW / 2 + 0.2, fy(f) + 0.45, FD / 2) };
    }) : [];
    const height = FH * NF;
    B = { root, hospital, rooms, roomMesh, paint, walkers, newWalk, pg, pp, pc, P, amb, ambU: -0.3, beacons, core, labels, height, FW, grow: 0, cfg };
    hospital.scale.y = 0.001;
  }

  let target = first || DEFAULT_TWIN;
  build(target);

  /* camera: a slow orbit you can drag */
  let yaw = -0.6, pitch = 0.42, dragging = false, lx = 0, ly = 0, idle = 3, dist = 15, cy = 2;
  mount.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; try { mount.setPointerCapture(e.pointerId); } catch (x) {} });
  mount.addEventListener("pointermove", (e) => { if (!dragging) return; yaw -= (e.clientX - lx) * 0.006; pitch = Math.max(0.12, Math.min(1.0, pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; idle = 0; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((k) => mount.addEventListener(k, () => { dragging = false; }));
  window.addEventListener("resize", () => { R.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });

  const t0 = performance.now(), v = new THREE.Vector3();
  let last = t0, nextFlip = 0;
  const stats = opts.stats || {};
  const frame = loop(mount, (now) => {
    const t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    people.mat.uniforms.uTime.value = t;
    idle += dt;
    if (!dragging && idle > 2) yaw += dt * (opts.compact ? 0.18 : 0.07);
    // the building rises when it is (re)built
    if (B.grow < 1) { B.grow = Math.min(1, B.grow + dt / 1.1); const k = B.grow, e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); B.hospital.scale.y = Math.max(0.001, reduce ? 1 : e); }
    const aspect = W() / H();
    const wantDist = Math.max(9, B.FW * 1.55 / Math.min(1.2, aspect) + 3, B.height * 2.55 + 5) * (opts.compact ? 1.08 : 1);
    dist += (wantDist - dist) * Math.min(1, dt * 3); cy += (B.height * 0.48 - cy) * Math.min(1, dt * 3);
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, cy + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(0, cy, 0);
    let repaint = false;
    for (let i = 0; i < B.walkers.length; i++) {
      const w = B.walkers[i];
      w.u += dt * w.speed;
      if (w.u >= 1) { if (w.books && w.target.state === "booked") w.target.state = "occupied"; B.newWalk(w); repaint = true; }
      w.curve.getPointAt(Math.min(1, w.u), v);
      B.pp[i * 3] = v.x; B.pp[i * 3 + 1] = v.y; B.pp[i * 3 + 2] = v.z;
      B.pc[i * 3] = w.col.r; B.pc[i * 3 + 1] = w.col.g; B.pc[i * 3 + 2] = w.col.b;
    }
    B.pg.attributes.position.needsUpdate = B.pg.attributes.aColor.needsUpdate = true;
    if (t > nextFlip && B.rooms.length) {
      nextFlip = t + 0.6;
      const occ = B.rooms.filter((r) => r.state === "occupied"), cl = B.rooms.filter((r) => r.state === "cleaning");
      if (occ.length > B.rooms.length * 0.5) occ[Math.floor(rnd() * occ.length)].state = "cleaning";
      if (cl.length) cl[Math.floor(rnd() * cl.length)].state = "free";
      repaint = true;
      if (stats.occ) stats.occ.textContent = Math.round(100 * B.rooms.filter((r) => r.state === "occupied").length / B.rooms.length) + "%";
      if (stats.move) stats.move.textContent = String(B.walkers.length);
      if (stats.clean) stats.clean.textContent = String(B.rooms.filter((r) => r.state === "cleaning").length);
    }
    if (repaint) B.paint();
    if (B.amb) {
      B.ambU += dt * 0.09; if (B.ambU > 1.35) B.ambU = -0.4;
      const au = Math.max(0, Math.min(1, B.ambU)), u = B.amb.userData;
      u.path.getPointAt(au, v); B.amb.position.copy(v);
      u.path.getTangentAt(Math.min(0.999, au + 0.001), v); B.amb.rotation.y = Math.atan2(-v.z, v.x);
      const flash = Math.floor(t * 6) % 2;
      u.sR.intensity = flash ? 7 : 0.5; u.sB.intensity = flash ? 0.5 : 7; u.lamp.material.color.copy(flash ? RED : BLUE);
      B.amb.visible = B.ambU > -0.05;
      if (stats.amb) stats.amb.textContent = B.ambU > 0 && B.ambU < 1 ? "Arriving" : B.ambU >= 1 ? "At the ER" : "On call";
    } else if (stats.amb) stats.amb.textContent = "–";
    B.beacons.forEach((b, i) => { b.material.color.copy(Math.floor(t * 2 + i / 2) % 2 ? RED : IVORY); });
    B.core.material.opacity = 0.12 + 0.06 * Math.sin(t * 2);
    R.render(scene, camera);
    B.labels.forEach((l) => {
      v.copy(l.pos); v.y *= B.hospital.scale.y; v.project(camera);
      let lx2 = (v.x * 0.5 + 0.5) * W();
      if (lx2 + (l.w || (l.w = l.el.offsetWidth)) > W() - 8) lx2 = Math.max(8, W() - 8 - l.w);      // keep long names inside the frame
      l.el.style.transform = "translate(" + lx2.toFixed(1) + "px," + ((-v.y * 0.5 + 0.5) * H()).toFixed(1) + "px)";
      l.el.style.opacity = v.z < 1 && B.grow > 0.6 ? "1" : "0";
    });
  });
  mount.classList.add("on");
  const api = {
    frame, R,
    update(cfg) { const key = JSON.stringify(cfg); if (key === JSON.stringify(target)) return; target = cfg; build(cfg); },
  };
  return api;
}

/* the landing page's typical hospital */
whenVisible(document.getElementById("twin3d"), (THREE, mount) => {
  const s = (id) => document.getElementById(id);
  const api = makeTwin(THREE, mount, DEFAULT_TWIN, { labels: s("twin-labels"), stats: { occ: s("tw-occ"), move: s("tw-move"), clean: s("tw-clean"), amb: s("tw-amb") } });
  debug("twin", api);
});

/* for other pages: build a hospital in a mount from a description, now or when it comes on screen */
window.QC3D = {
  twin(mount, cfg, opts) {
    return new Promise((resolve) => whenVisible(mount, (THREE) => { const api = makeTwin(THREE, mount, cfg, opts); debug("twin", api); resolve(api); }));
  },
};
window.dispatchEvent(new Event("qc3d-ready"));
