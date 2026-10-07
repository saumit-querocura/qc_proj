var STORAGE_KEY = 'qc-theme';
var root = document.documentElement;
var SUN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
var MOON_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#100e2a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  var icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.innerHTML = dark ? SUN_ICON : MOON_ICON;
}
window.toggleTheme = function () { applyTheme(root.getAttribute('data-theme') !== 'dark'); };
if (root.getAttribute('data-theme') === 'dark') applyTheme(true);

function qcToggleEye(btn) {
  const input = btn.closest(".field-inner").querySelector("input");
  input.type = input.type === "password" ? "text" : "password";
  btn.innerHTML = input.type === "password" ? "&#128065;" : "&#128584;";
}

/* ---- Oxygen atom canvas — inspired by the monolith's auth-page orrery,
   recoloured to the QueroCura teal/purple/blue palette. ---- */
function qcAtom(canvasId, factEl) {
  var c = document.getElementById(canvasId);
  if (!c) return;
  var ctx = c.getContext('2d');
  var DPR = window.devicePixelRatio || 1;
  var W, H, cx, cy, sc, t = 0, last = null, stars = null, mx = 0, my = 0;

  var SHELLS = [
    { r: 0.52, tilt: 0.20, twist: 0.10, speed: 0.75, phase: 0.0, col: [14,143,131] },
    { r: 0.52, tilt: 1.55, twist: 0.00, speed: 0.60, phase: 1.1, col: [124,111,219] },
    { r: 0.52, tilt: 0.75, twist: 1.57, speed: 0.90, phase: 2.2, col: [47,143,209] }
  ];

  function resize() {
    var el = c.parentElement, w = el.offsetWidth || 320, h = el.offsetHeight || 280;
    c.width = w * DPR; c.height = h * DPR;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    W = c.width; H = c.height; cx = W * 0.5; cy = H * 0.5; sc = Math.min(W, H) * 0.42;
    stars = null;
  }
  function mkStars() {
    var s = [];
    for (var i = 0; i < 80; i++) s.push({ x: Math.random()*W, y: Math.random()*H, r: .2+Math.random()*.7, a: .1+Math.random()*.35, tw: 4+Math.random()*8, tp: Math.random()*Math.PI*2 });
    return s;
  }
  function proj(a, r, tilt, twist) {
    var R = r * sc, x3 = Math.cos(a)*R, z3 = Math.sin(a)*R;
    var y3 = -z3 * Math.sin(tilt);
    return {
      x: cx + x3*Math.cos(twist) - y3*Math.sin(twist),
      y: cy + x3*Math.sin(twist) + y3*Math.cos(twist),
      d: z3*Math.cos(tilt)/sc
    };
  }

  window.addEventListener('resize', resize);
  c.parentElement.addEventListener('mousemove', function (e) {
    var b = c.parentElement.getBoundingClientRect();
    mx = (e.clientX - b.left)/b.width - .5;
    my = (e.clientY - b.top)/b.height - .5;
  });
  c.parentElement.addEventListener('mouseleave', function () { mx = 0; my = 0; });

  resize();

  function draw(ts) {
    if (last === null) last = ts;
    var dt = Math.min((ts-last)/1000, .05); last = ts; t += dt;
    var PX = mx*.12, PY = my*.09;
    ctx.clearRect(0,0,W,H);

    if (!stars) stars = mkStars();
    stars.forEach(function (s) {
      ctx.globalAlpha = s.a*(.4+.6*(.5+.5*Math.sin(t/s.tw+s.tp)));
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*DPR, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    var bg = ctx.createRadialGradient(cx, cy*.6, 0, cx, cy*.6, sc*1.7);
    bg.addColorStop(0, 'rgba(14,143,131,.16)');
    bg.addColorStop(.55, 'rgba(124,111,219,.06)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);

    var frontQ = [];
    SHELLS.forEach(function (sh) {
      var tilt = sh.tilt+PY, twist = sh.twist+PX;
      var col = sh.col, cs = 'rgba('+col[0]+','+col[1]+','+col[2]+',';
      var SEG = 200, pts = [];
      for (var i = 0; i <= SEG; i++) pts.push(proj(i/SEG*Math.PI*2, sh.r, tilt, twist));
      ctx.save(); ctx.beginPath();
      var inB = false;
      for (var i = 0; i <= SEG; i++) { var p = pts[i]; if (p.d <= 0) { if (!inB) { ctx.moveTo(p.x,p.y); inB = true; } else ctx.lineTo(p.x,p.y); } else inB = false; }
      ctx.strokeStyle = cs+'.16)'; ctx.lineWidth = .6*DPR; ctx.setLineDash([2*DPR,5*DPR]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      frontQ.push({ sh: sh, pts: pts, tilt: tilt, twist: twist, cs: cs });
    });

    var NR = sc*.11;
    var pulse = .82+.18*Math.sin(t*1.2);
    var cg = ctx.createRadialGradient(cx,cy,0,cx,cy,NR*4.2*pulse);
    cg.addColorStop(0,'rgba(14,143,131,.22)'); cg.addColorStop(.35,'rgba(47,143,209,.08)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx,cy,NR*4.2*pulse,0,Math.PI*2); ctx.fill();

    var sg = ctx.createRadialGradient(cx-NR*.3,cy-NR*.3,NR*.06,cx,cy,NR);
    sg.addColorStop(0,'rgba(224,250,244,1)'); sg.addColorStop(.32,'rgba(126,224,212,1)'); sg.addColorStop(.68,'rgba(14,143,131,1)'); sg.addColorStop(1,'rgba(9,60,55,1)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx,cy,NR,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(cx-NR*.3,cy-NR*.3,NR*.28,0,Math.PI*2); ctx.fill();

    frontQ.forEach(function (item) {
      var sh = item.sh, pts = item.pts, cs = item.cs, tilt = item.tilt, twist = item.twist, SEG = 200;
      var angle = sh.phase + t*sh.speed;
      ctx.save(); ctx.beginPath(); var inF = false;
      for (var i = 0; i <= SEG; i++) { var p = pts[i]; if (p.d >= 0) { if (!inF) { ctx.moveTo(p.x,p.y); inF = true; } else ctx.lineTo(p.x,p.y); } else inF = false; }
      ctx.strokeStyle = cs+'.42)'; ctx.lineWidth = .85*DPR; ctx.stroke(); ctx.restore();

      [0, Math.PI].forEach(function (ep) {
        var ea = angle+ep, ept = proj(ea, sh.r, tilt, twist);
        var dA = .3+.7*((ept.d+1)/2);
        var eR = (5.2+0.8*Math.sin(t*3+ep))*DPR;
        var eg = ctx.createRadialGradient(ept.x,ept.y,0,ept.x,ept.y,eR*2.8);
        eg.addColorStop(0,cs+(0.42*dA)+')'); eg.addColorStop(.4,cs+(0.1*dA)+')'); eg.addColorStop(1,cs+'0)');
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ept.x,ept.y,eR*2.8,0,Math.PI*2); ctx.fill();
        var ec = ctx.createRadialGradient(ept.x-eR*.3,ept.y-eR*.3,eR*.05,ept.x,ept.y,eR);
        ec.addColorStop(0,cs+dA+')'); ec.addColorStop(.55,cs+(0.65*dA)+')'); ec.addColorStop(1,cs+(0.2*dA)+')');
        ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(ept.x,ept.y,eR,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,'+(0.5*dA)+')'; ctx.beginPath(); ctx.arc(ept.x-eR*.25,ept.y-eR*.25,eR*.22,0,Math.PI*2); ctx.fill();
      });
    });

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  if (factEl) {
    var FACTS = [
      "Oxygen makes up about 65% of your body's mass.",
      "You breathe roughly 22,000 times a day, on autopilot.",
      "Your lungs hold a surface area the size of a tennis court.",
      "Red blood cells ferry oxygen to every living cell in you."
    ];
    var fi = 0;
    setInterval(function () {
      fi = (fi + 1) % FACTS.length;
      factEl.style.opacity = 0;
      setTimeout(function () { factEl.textContent = FACTS[fi]; factEl.style.opacity = 1; }, 260);
    }, 4200);
  }
}
qcAtom('qc-atom', document.getElementById('qc-fact'));

const API_BASE = "https://app.querocura.com/api/auth";
const form = document.getElementById("qc-login-form");
const errBox = document.getElementById("qc-error");
const btn = document.getElementById("qc-submit-btn");
const btnLabel = btn.querySelector(".btn-label");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.style.display = "none";
  btn.disabled = true;
  btnLabel.textContent = "Signing in…";

  const email = document.getElementById("qc-email").value.trim();
  const password = document.getElementById("qc-password").value;

  try {
    const res = await fetch(API_BASE + "/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Couldn't sign you in. Check your email and password.");
    }

    // Route returning users straight to their dashboard, but send anyone
    // who never finished the profile wizard back to it first.
    btnLabel.textContent = "Just a sec…";
    let goTo = "../dashboard/";
    try {
      const profRes = await fetch(API_BASE.replace("/auth", "") + "/profile", { credentials: "include" });
      const profData = await profRes.json();
      if (profData.ok && profData.profile && !profData.profile.wizard_done) {
        goTo = "../onboarding/";
      }
    } catch (e) {
      // If the profile check fails for any reason, fall back to the
      // dashboard — it does its own wizard_done check on load anyway.
    }
    window.location.href = goTo;
  } catch (err) {
    errBox.textContent = err.message || "Something went wrong. Please try again.";
    errBox.style.display = "block";
    btn.disabled = false;
    btnLabel.textContent = "Sign in";
  }
});
