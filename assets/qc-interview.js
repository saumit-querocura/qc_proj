/* QueroCura clinical interview.
 *
 *   QCInterview.run({ text, apiBase }) -> Promise
 *     resolves { text, summary, emergency, red_flags, answers, helpline }  when finished
 *              { cancelled: true }                                          when the person closes it
 *              null                                                         when no interview is available (old backend, offline, no questions)
 *
 * The questions come from POST /diagnosis/interview-plan (tailored to the symptoms,
 * the person's profile and latest vitals). Answers are folded back into text by
 * POST /diagnosis/interview-compile, so the diagnosis engine reads the extra detail.
 */
(function () {
  "use strict";
  var QI = window.QCInterview = {};
  var API = "https://app.querocura.com/api";
  var root, state;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel) { return root.querySelector(sel); }

  var CSS = '' +
    '.qi-wrap{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px;background:radial-gradient(circle at 50% 30%,#fbfaf6 0%,#f1efe8 70%);overflow:auto;font-family:"Manrope",sans-serif;color:#100e2a}' +
    '.qi-wrap[hidden]{display:none}' +
    '.qi-card{width:min(680px,100%);margin:auto;background:#fff;border:1px solid rgba(16,14,42,.08);border-radius:28px;box-shadow:0 40px 90px -40px rgba(16,14,42,.35);padding:clamp(22px,4vw,40px);position:relative;animation:qiIn .4s cubic-bezier(.22,1,.36,1)}' +
    '@keyframes qiIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}' +
    '.qi-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}' +
    '.qi-stage{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#0e8f83}' +
    '.qi-x{background:none;border:none;font-size:20px;cursor:pointer;color:rgba(16,14,42,.45);border-radius:8px;padding:2px 8px}.qi-x:hover{background:rgba(16,14,42,.06)}' +
    '.qi-bar{height:6px;border-radius:6px;background:rgba(16,14,42,.08);overflow:hidden;margin-bottom:22px}' +
    '.qi-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#0e8f83,#2f8fd1,#7c6fdb);transition:width .4s cubic-bezier(.4,0,.2,1)}' +
    '.qi-count{font-size:12px;font-weight:700;color:rgba(16,14,42,.5);margin-bottom:8px}' +
    '.qi-q{font-family:"Space Grotesk",sans-serif;font-size:clamp(20px,3.2vw,25px);line-height:1.25;font-weight:700;margin:0 0 10px;letter-spacing:-.01em}' +
    '.qi-why{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.5;color:rgba(16,14,42,.62);background:rgba(14,143,131,.07);border:1px solid rgba(14,143,131,.16);border-radius:14px;padding:10px 13px;margin-bottom:18px}' +
    '.qi-opts{display:flex;flex-direction:column;gap:9px}' +
    '.qi-opt{display:flex;align-items:center;gap:12px;text-align:left;width:100%;font:600 14.5px/1.35 "Manrope",sans-serif;color:inherit;background:#fff;border:1.5px solid rgba(16,14,42,.13);border-radius:14px;padding:13px 16px;cursor:pointer;transition:transform .15s,border-color .15s,background .15s,box-shadow .15s}' +
    '.qi-opt:hover{border-color:#0e8f83;transform:translateX(3px)}' +
    '.qi-opt:focus-visible{outline:2.5px solid #0e8f83;outline-offset:2px}' +
    '.qi-opt .qi-mark{flex:0 0 22px;width:22px;height:22px;border-radius:50%;border:2px solid rgba(16,14,42,.25);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;transition:all .15s}' +
    '.qi-opt.multi .qi-mark{border-radius:7px}' +
    '.qi-opt.on{border-color:#0e8f83;background:rgba(14,143,131,.09);box-shadow:0 0 0 3px rgba(14,143,131,.12)}' +
    '.qi-opt.on .qi-mark{background:#0e8f83;border-color:#0e8f83}' +
    '.qi-opt.flag.on{border-color:#d24f28;background:rgba(210,79,40,.09);box-shadow:0 0 0 3px rgba(210,79,40,.13)}.qi-opt.flag.on .qi-mark{background:#d24f28;border-color:#d24f28}' +
    '.qi-scale{display:grid;grid-template-columns:repeat(11,1fr);gap:6px}' +
    '.qi-sc{aspect-ratio:1;border-radius:12px;border:1.5px solid rgba(16,14,42,.13);background:#fff;font:800 14px "Manrope",sans-serif;cursor:pointer;color:inherit;transition:transform .15s,background .15s,border-color .15s}' +
    '.qi-sc:hover{transform:translateY(-3px)}.qi-sc.on{color:#fff;border-color:transparent}' +
    '.qi-scale-legend{display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:rgba(16,14,42,.5);margin-top:8px}' +
    '.qi-text{width:100%;min-height:96px;border-radius:14px;border:1.5px solid rgba(16,14,42,.14);padding:13px 15px;font:500 15px "Manrope",sans-serif;color:inherit;background:#fff;resize:vertical;outline:none}.qi-text:focus{border-color:#0e8f83;box-shadow:0 0 0 3px rgba(14,143,131,.14)}' +
    '.qi-nav{display:flex;align-items:center;gap:10px;margin-top:22px;flex-wrap:wrap}' +
    '.qi-btn{font:800 14px "Manrope",sans-serif;border-radius:999px;padding:12px 24px;cursor:pointer;border:none;background:#0e8f83;color:#fff;transition:transform .15s,box-shadow .15s,background .15s}' +
    '.qi-btn:hover:not(:disabled){background:#0b6f66;transform:translateY(-2px);box-shadow:0 12px 24px -10px rgba(14,143,131,.55)}.qi-btn:disabled{opacity:.45;cursor:default}' +
    '.qi-ghost{background:transparent;color:inherit;border:1.5px solid rgba(16,14,42,.16)}.qi-ghost:hover:not(:disabled){background:rgba(16,14,42,.05);box-shadow:none;transform:none}' +
    '.qi-link{background:none;border:none;font:600 13px "Manrope",sans-serif;color:rgba(16,14,42,.5);text-decoration:underline;cursor:pointer;padding:8px 4px}' +
    '.qi-spacer{flex:1}' +
    '.qi-emerg{border-radius:16px;background:rgba(210,79,40,.1);border:1.5px solid rgba(210,79,40,.4);color:#9a3c1f;padding:14px 16px;margin-bottom:16px;font-size:13.5px;line-height:1.55;animation:qiIn .3s ease}' +
    '.qi-emerg b{display:block;font-size:15px;margin-bottom:4px;color:#b3401f}.qi-emerg a{display:inline-block;margin-top:8px;background:#d24f28;color:#fff;font-weight:800;border-radius:999px;padding:8px 18px;text-decoration:none}' +
    '.qi-help{border-radius:16px;background:rgba(124,111,219,.1);border:1.5px solid rgba(124,111,219,.35);padding:14px 16px;margin-bottom:16px;font-size:13.5px;line-height:1.55}' +
    '.qi-title{font-family:"Space Grotesk",sans-serif;font-size:clamp(22px,3.6vw,28px);margin:0 0 10px;letter-spacing:-.01em}' +
    '.qi-lead{font-size:15px;line-height:1.6;color:rgba(16,14,42,.68);margin:0 0 16px}' +
    '.qi-notes{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:7px}.qi-notes li{font-size:13.5px;line-height:1.5;display:flex;gap:9px}' +
    '.qi-depth{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 6px}' +
    '.qi-dp{flex:1 1 150px;text-align:left;border-radius:14px;border:1.5px solid rgba(16,14,42,.13);background:#fff;padding:11px 14px;cursor:pointer;font-family:inherit;color:inherit;transition:all .15s}' +
    '.qi-dp b{display:block;font-size:14px}.qi-dp span{font-size:12px;color:rgba(16,14,42,.55)}.qi-dp.on{border-color:#0e8f83;background:rgba(14,143,131,.09);box-shadow:0 0 0 3px rgba(14,143,131,.12)}' +
    '.qi-sum{display:flex;flex-direction:column;border:1px solid rgba(16,14,42,.08);border-radius:16px;overflow:hidden;margin-bottom:6px}' +
    '.qi-sum div{display:flex;gap:14px;justify-content:space-between;padding:11px 15px;font-size:13.5px;border-bottom:1px solid rgba(16,14,42,.07)}.qi-sum div:last-child{border-bottom:none}' +
    '.qi-sum span:first-child{color:rgba(16,14,42,.58);flex:1}.qi-sum span:last-child{font-weight:700;text-align:right;flex:1}' +
    '.qi-load{text-align:center;padding:40px 10px;font-weight:700}.qi-spin{width:38px;height:38px;border-radius:50%;border:4px solid rgba(14,143,131,.2);border-top-color:#0e8f83;margin:0 auto 14px;animation:qiSpin 1s linear infinite}@keyframes qiSpin{to{transform:rotate(360deg)}}' +
    '@media (max-width:520px){.qi-scale{grid-template-columns:repeat(6,1fr)}.qi-sc{aspect-ratio:1.4}}' +
    '@media (prefers-reduced-motion:reduce){.qi-card,.qi-emerg{animation:none}.qi-spin{animation-duration:3s}}' +
    'html[data-theme="dark"] .qi-wrap{background:radial-gradient(circle at 50% 30%,#15132b 0%,#0d0c1f 70%);color:#f2f0f8}' +
    'html[data-theme="dark"] .qi-card{background:#18162e;border-color:rgba(255,255,255,.1)}' +
    'html[data-theme="dark"] .qi-bar{background:rgba(255,255,255,.12)}html[data-theme="dark"] .qi-count,html[data-theme="dark"] .qi-lead,html[data-theme="dark"] .qi-scale-legend{color:#a9a6bd}' +
    'html[data-theme="dark"] .qi-why{color:#b7b3cc;background:rgba(126,224,212,.08);border-color:rgba(126,224,212,.2)}html[data-theme="dark"] .qi-stage{color:#7ee0d4}' +
    'html[data-theme="dark"] .qi-opt,html[data-theme="dark"] .qi-sc,html[data-theme="dark"] .qi-dp,html[data-theme="dark"] .qi-text{background:#100e2a;border-color:rgba(255,255,255,.16);color:#f2f0f8}' +
    'html[data-theme="dark"] .qi-opt.on,html[data-theme="dark"] .qi-dp.on{background:rgba(126,224,212,.13);border-color:#7ee0d4}html[data-theme="dark"] .qi-opt.on .qi-mark{background:#7ee0d4;border-color:#7ee0d4;color:#0d0c1f}' +
    'html[data-theme="dark"] .qi-opt.flag.on{background:rgba(210,79,40,.18);border-color:#f0765a}' +
    'html[data-theme="dark"] .qi-btn{background:#7ee0d4;color:#0d0c1f}html[data-theme="dark"] .qi-btn:hover:not(:disabled){background:#61c9bd}' +
    'html[data-theme="dark"] .qi-ghost{background:transparent;color:#f2f0f8;border-color:rgba(255,255,255,.2)}html[data-theme="dark"] .qi-link,html[data-theme="dark"] .qi-x{color:#a9a6bd}' +
    'html[data-theme="dark"] .qi-emerg{background:rgba(210,79,40,.16);color:#f0a488}html[data-theme="dark"] .qi-emerg b{color:#ffb59d}' +
    'html[data-theme="dark"] .qi-sum{border-color:rgba(255,255,255,.1)}html[data-theme="dark"] .qi-sum div{border-bottom-color:rgba(255,255,255,.08)}html[data-theme="dark"] .qi-sum span:first-child,html[data-theme="dark"] .qi-dp span{color:#a9a6bd}';

  function ensureDom() {
    if (root) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement("div");
    root.className = "qi-wrap"; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Symptom interview");
    document.body.appendChild(root);
    document.addEventListener("keydown", function (e) { if (!root.hidden && e.key === "Escape") finish({ cancelled: true }); });
  }

  var done;
  function finish(result) {
    if (!root || root.hidden) return;
    root.hidden = true; document.body.style.overflow = "";
    var d = done; done = null; if (d) d(result);
  }

  function call(path, body) {
    return fetch(API + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || d.ok === false) throw new Error(d.message || "failed"); return d; }); });
  }

  /* ---------------- flow ---------------- */
  QI.run = function (opts) {
    ensureDom();
    API = opts.apiBase || API;
    state = { text: opts.text, detail: "standard", plan: null, flat: [], idx: 0, answers: {}, emergency: false };
    return new Promise(function (resolve) {
      done = resolve;
      root.hidden = false; document.body.style.overflow = "hidden";
      root.innerHTML = '<div class="qi-card"><div class="qi-load"><div class="qi-spin"></div>Thinking about the right questions to ask…</div></div>';
      loadPlan("standard").then(function (plan) {
        if (!plan || !plan.question_count) { finish(null); return; }
        showIntro();
      }).catch(function () { finish(null); });   // older backend / offline: carry on without an interview
    });
  };

  function loadPlan(detail) {
    state.detail = detail;
    return call("/diagnosis/interview-plan", { text: state.text, detail: detail, lang: (window.QCI18n && QCI18n.lang) || "en" }).then(function (plan) {
      state.plan = plan; state.flat = [];
      plan.stages.forEach(function (s) { s.questions.forEach(function (q) { state.flat.push({ stage: s, q: q }); }); });
      state.idx = 0; state.answers = {}; state.emergency = false;
      return plan;
    });
  }

  function card(inner) { root.innerHTML = '<div class="qi-card">' + inner + '</div>'; root.scrollTop = 0; }

  function showIntro() {
    var p = state.plan, mins = Math.max(1, Math.round(p.estimated_seconds / 60));
    var depth = [["quick", "Quick", "about 6 questions"], ["standard", "Standard", "about 12 questions"], ["detailed", "Detailed", "up to 20 questions"]];
    card(
      '<div class="qi-top"><span class="qi-stage">Symptom interview</span><button class="qi-x" id="qi-close" aria-label="Close">✕</button></div>' +
      '<h2 class="qi-title">Let\'s understand your ' + esc(p.title) + ' properly</h2>' +
      '<p class="qi-lead">' + esc(p.intro) + '</p>' +
      (p.personalised && p.personalised.length ? '<ul class="qi-notes">' + p.personalised.map(function (n) { return '<li><span>✨</span><span>' + esc(n) + '</span></li>'; }).join("") + '</ul>' : '') +
      '<div class="qi-depth" role="radiogroup" aria-label="How thorough?">' + depth.map(function (d) {
        return '<button type="button" class="qi-dp' + (state.detail === d[0] ? ' on' : '') + '" role="radio" aria-checked="' + (state.detail === d[0]) + '" data-d="' + d[0] + '"><b>' + d[1] + '</b><span>' + d[2] + '</span></button>';
      }).join("") + '</div>' +
      '<div class="qi-nav"><button class="qi-btn" id="qi-start">Start · ~' + mins + ' min</button><span class="qi-spacer"></span><button class="qi-link" id="qi-skipall">Skip and analyse now</button></div>'
    );
    $("#qi-close").onclick = function () { finish({ cancelled: true }); };
    $("#qi-skipall").onclick = function () { finish(null); };
    $("#qi-start").onclick = function () { state.idx = 0; showQuestion(); };
    $("#qi-start").focus();
    root.querySelectorAll(".qi-dp").forEach(function (b) {
      b.onclick = function () {
        var d = b.getAttribute("data-d"); if (d === state.detail) return;
        card('<div class="qi-load"><div class="qi-spin"></div>Updating the questions…</div>');
        loadPlan(d).then(showIntro).catch(function () { finish(null); });
      };
    });
  }

  function answered(q) {
    var a = state.answers[q.id];
    return !(a === undefined || a === null || a === "" || (Array.isArray(a) && !a.length));
  }

  function showQuestion() {
    if (state.idx >= state.flat.length) { showReview(); return; }
    var item = state.flat[state.idx], q = item.q, total = state.flat.length;
    var pct = Math.round((state.idx / total) * 100);
    var html =
      '<div class="qi-top"><span class="qi-stage">' + esc(item.stage.title) + '</span><button class="qi-x" id="qi-close" aria-label="Close">✕</button></div>' +
      '<div class="qi-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + Math.max(4, pct) + '%"></i></div>' +
      '<div class="qi-count">Question ' + (state.idx + 1) + ' of ' + total + '</div>' +
      '<div id="qi-banners"></div>' +
      '<h2 class="qi-q" id="qi-qtext">' + esc(q.prompt) + '</h2>' +
      '<div class="qi-why"><span>💡</span><span>' + esc(q.why) + '</span></div>';
    if (q.type === "scale") {
      var cols = ["#2f8f5e", "#2f8f5e", "#5aa05a", "#8ab04a", "#b8b83a", "#c98a10", "#c9780f", "#d1620f", "#d24f28", "#c63b24", "#b3182a"];
      html += '<div class="qi-scale" role="radiogroup" aria-labelledby="qi-qtext">' + cols.map(function (c, n) { return '<button type="button" class="qi-sc" role="radio" data-n="' + n + '" style="--c:' + c + '">' + n + '</button>'; }).join("") + '</div>' +
        '<div class="qi-scale-legend"><span>No problem</span><span>Moderate</span><span>Worst imaginable</span></div>';
    } else if (q.type === "text") {
      html += '<textarea class="qi-text" id="qi-text" maxlength="300" placeholder="Optional — type anything else you think is important"></textarea>';
    } else {
      html += '<div class="qi-opts" role="' + (q.type === "multi" ? "group" : "radiogroup") + '" aria-labelledby="qi-qtext">' + q.options.map(function (o, i) {
        return '<button type="button" class="qi-opt ' + (q.type === "multi" ? "multi" : "") + (q.red_flag && o.critical ? " flag" : "") + '" role="' + (q.type === "multi" ? "checkbox" : "radio") + '" aria-checked="false" data-i="' + i + '"><span class="qi-mark">✓</span><span>' + esc(o.label) + '</span></button>';
      }).join("") + '</div>';
    }
    var needsContinue = q.type === "multi" || q.type === "text" || q.type === "scale";
    html += '<div class="qi-nav">' +
      (state.idx > 0 ? '<button class="qi-btn qi-ghost" id="qi-back">← Back</button>' : '') +
      '<span class="qi-spacer"></span><button class="qi-link" id="qi-skipq">' + (q.red_flag ? '' : 'Not sure / skip') + '</button>' +
      (needsContinue ? '<button class="qi-btn" id="qi-next">Continue →</button>' : '') + '</div>';
    card(html);
    $("#qi-close").onclick = function () { finish({ cancelled: true }); };
    if (q.red_flag) $("#qi-skipq").style.display = "none";
    var back = $("#qi-back"); if (back) back.onclick = function () { state.idx--; showQuestion(); };
    $("#qi-skipq").onclick = function () { delete state.answers[q.id]; state.idx++; showQuestion(); };
    var next = $("#qi-next"); if (next) next.onclick = function () { state.idx++; showQuestion(); };

    // wire controls + restore any earlier answer
    var prev = state.answers[q.id];
    if (q.type === "scale") {
      var btns = root.querySelectorAll(".qi-sc");
      function paint(n) { btns.forEach(function (b) { var on = String(b.getAttribute("data-n")) === String(n); b.classList.toggle("on", on); b.setAttribute("aria-checked", on); b.style.background = on ? b.style.getPropertyValue("--c") : ""; }); }
      if (prev !== undefined) paint(prev);
      btns.forEach(function (b) { b.onclick = function () { state.answers[q.id] = parseInt(b.getAttribute("data-n"), 10); paint(state.answers[q.id]); setTimeout(function () { state.idx++; showQuestion(); }, 220); }; });
    } else if (q.type === "text") {
      var ta = $("#qi-text"); if (prev) ta.value = prev;
      ta.oninput = function () { state.answers[q.id] = ta.value; };
      ta.focus();
    } else {
      var opts = root.querySelectorAll(".qi-opt");
      var cur = q.type === "multi" ? (Array.isArray(prev) ? prev.slice() : []) : prev;
      function repaint() {
        opts.forEach(function (b) {
          var v = q.options[+b.getAttribute("data-i")].value;
          var on = q.type === "multi" ? cur.indexOf(v) >= 0 : cur === v;
          b.classList.toggle("on", on); b.setAttribute("aria-checked", on);
        });
        if (q.red_flag) updateBanners(q, q.type === "multi" ? cur : [cur]);
        if (next) next.disabled = false;
      }
      opts.forEach(function (b) {
        b.onclick = function () {
          var o = q.options[+b.getAttribute("data-i")];
          if (q.type === "multi") {
            if (o.value === "none") cur = ["none"];
            else { cur = cur.filter(function (x) { return x !== "none"; }); var k = cur.indexOf(o.value); k >= 0 ? cur.splice(k, 1) : cur.push(o.value); }
            state.answers[q.id] = cur.slice(); repaint();
          } else {
            cur = o.value; state.answers[q.id] = cur; repaint();
            setTimeout(function () { state.idx++; showQuestion(); }, 240);
          }
        };
      });
      if (prev !== undefined) repaint();
      if (opts[0]) opts[0].focus();
    }
  }

  function updateBanners(q, selected) {
    var box = $("#qi-banners"); if (!box) return;
    var crit = q.options.filter(function (o) { return o.critical && selected.indexOf(o.value) >= 0; });
    var html = "";
    if (crit.length) {
      state.emergency = true;
      html += '<div class="qi-emerg" role="alert"><b>🚨 This can be an emergency</b>You selected: ' + esc(crit.map(function (o) { return o.label; }).join("; ")) + '. Please call your local emergency number (112 in India) or go to the nearest emergency department now — don\'t wait for the analysis.<br><a href="tel:112">Call 112</a></div>';
    } else { state.emergency = false; }
    if (selected.indexOf("selfharm") >= 0) {
      html += '<div class="qi-help" role="alert">💜 <b>You matter, and you don\'t have to face this alone.</b> If you\'re thinking about harming yourself, please reach out right now — in India call <b>Tele-MANAS 14416</b> or <b>KIRAN 1800-599-0019</b> (free, 24/7), or your local emergency number.</div>';
    }
    box.innerHTML = html;
  }

  function showReview() {
    card('<div class="qi-load"><div class="qi-spin"></div>Putting your answers together…</div>');
    call("/diagnosis/interview-compile", { text: state.text, detail: state.detail, answers: state.answers, lang: (window.QCI18n && QCI18n.lang) || "en" }).then(function (r) {
      state.result = r; renderReview(r);
    }).catch(function () {
      // compile endpoint unavailable: build the addendum locally from option phrases
      var phrases = [], summary = [], red = [], emergency = false;
      state.flat.forEach(function (it) {
        var q = it.q, a = state.answers[q.id]; if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) return;
        if (q.type === "scale") { phrases.push("Severity: " + a + "/10."); summary.push({ question: "Severity", answer: a + "/10" }); return; }
        if (q.type === "text") { phrases.push(String(a)); summary.push({ question: q.prompt, answer: String(a) }); return; }
        var chosen = Array.isArray(a) ? a : [a], labels = [];
        chosen.forEach(function (v) { var o = q.options.filter(function (x) { return x.value === v; })[0]; if (!o || o.value === "none") return; labels.push(o.label); if (o.phrase) phrases.push(o.phrase); if (q.red_flag) { red.push({ value: o.value, label: o.label, critical: !!o.critical }); if (o.critical) emergency = true; } });
        if (labels.length) summary.push({ question: q.prompt, answer: labels.join("; ") });
      });
      var add = phrases.filter(function (p, i) { return phrases.indexOf(p) === i; }).join(". ");
      var r = { ok: true, addendum: add, summary: summary, red_flags: red, emergency: emergency, text: add ? (state.text.replace(/\s+$/, "") + ". " + add) : state.text, helpline: "" };
      state.result = r; renderReview(r);
    });
  }

  function renderReview(r) {
    var rows = (r.summary || []).map(function (s) { return '<div><span>' + esc(s.question) + '</span><span>' + esc(s.answer) + '</span></div>'; }).join("");
    card(
      '<div class="qi-top"><span class="qi-stage">Almost done</span><button class="qi-x" id="qi-close" aria-label="Close">✕</button></div>' +
      '<div class="qi-bar"><i style="width:100%"></i></div>' +
      (r.emergency ? '<div class="qi-emerg" role="alert"><b>🚨 Please don\'t wait</b>Some of your answers can signal an emergency. Call your local emergency number (112 in India) or go to the nearest emergency department now. You can still see the analysis below.<br><a href="tel:112">Call 112</a></div>' : '') +
      (r.helpline ? '<div class="qi-help" role="alert">💜 ' + esc(r.helpline) + '</div>' : '') +
      '<h2 class="qi-title">Here\'s what I\'ll factor in</h2>' +
      (rows ? '<div class="qi-sum">' + rows + '</div>' : '<p class="qi-lead">You skipped every question, so the analysis will use just what you described.</p>') +
      '<div class="qi-nav"><button class="qi-btn" id="qi-go">Analyse my symptoms →</button><button class="qi-btn qi-ghost" id="qi-edit">← Change an answer</button></div>'
    );
    $("#qi-close").onclick = function () { finish({ cancelled: true }); };
    $("#qi-edit").onclick = function () { state.idx = Math.max(0, state.flat.length - 1); showQuestion(); };
    $("#qi-go").onclick = function () {
      finish({ text: r.text, summary: r.summary || [], emergency: !!r.emergency, red_flags: r.red_flags || [], answers: state.answers, helpline: r.helpline || "", detail: state.detail });
    };
    $("#qi-go").focus();
  }
})();
