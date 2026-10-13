/* QueroCura reasoning interview.
 *
 *   QCReason.run({ text, apiBase }) -> Promise
 *     resolves { text, original_text, reasoning, transcript, summary, emergency, helpline, reasoned: true }  when finished
 *              { cancelled: true }                                                                     when closed
 *              { thin: true, text }                                                                    when no symptom was recognised
 *
 * Every answer goes to POST /diagnosis/reason with the whole story so far. The server re-reads everything through the
 * same engine that writes the final result and sends back the live differential, the evidence, the urgency and the one
 * question that would change the picture most. This page only shows that reasoning as it happens; it decides nothing.
 */
(function () {
  "use strict";
  var QR = window.QCReason = {};
  var API = "https://app.querocura.com/api";
  var root, st, done;

  /* ---------- language ---------- */
  var HI = {
    "Thinking it through with you": "आपके साथ सोचते हुए",
    "Close": "बंद करें",
    "Reading what you wrote…": "आपने जो लिखा, उसे पढ़ रहे हैं…",
    "Weighing your answer…": "आपके जवाब को तौल रहे हैं…",
    "Why I'm asking": "मैं यह क्यों पूछ रहा हूँ",
    "Yes": "हाँ", "No": "नहीं", "Not sure": "पता नहीं",
    "Continue": "आगे बढ़ें",
    "Back": "पीछे",
    "Finish now": "अभी पूरा करें",
    "Question %n": "सवाल %n",
    "usually %a–%b questions": "आमतौर पर %a–%b सवाल",
    "What I'm considering": "मैं किन बातों पर विचार कर रहा हूँ",
    "Fits because": "इसलिए मेल खाता है",
    "Argues against": "इसके ख़िलाफ़",
    "can be serious": "गंभीर हो सकता है",
    "What I've understood": "मैंने क्या समझा",
    "Nothing yet": "अभी कुछ नहीं",
    "about %d days": "लगभग %d दिन",
    "under a day": "एक दिन से कम",
    "How urgent": "कितना ज़रूरी",
    "Home care": "घर पर देखभाल",
    "Doctor soon": "जल्द डॉक्टर",
    "Today": "आज ही",
    "Emergency": "आपातकाल",
    "Show my reasoning": "मेरी सोच दिखाएँ",
    "Hide": "छिपाएँ",
    "This can be an emergency": "यह आपातकाल हो सकता है",
    "Please call 112 (or your local emergency number) or go to the nearest emergency department now. Don't wait for the rest of the check.":
      "कृपया अभी 112 (या अपना स्थानीय आपातकालीन नंबर) पर कॉल करें या नज़दीकी इमरजेंसी विभाग जाएँ। बाक़ी जाँच के लिए इंतज़ार न करें।",
    "Call 112": "112 पर कॉल करें",
    "Please get emergency help now": "कृपया अभी आपातकालीन मदद लें",
    "Why: ": "कारण: ",
    "While you wait for help": "मदद आने तक",
    "Stay with someone, don't drive yourself, and keep your phone with you.": "किसी के साथ रहें, ख़ुद गाड़ी न चलाएँ, और फ़ोन पास रखें।",
    "Don't eat or drink anything until a doctor has seen you.": "डॉक्टर के देखने तक कुछ न खाएँ-पिएँ।",
    "Tell them: ": "उन्हें बताएँ: ",
    "See the full reasoning": "पूरी सोच देखें",
    "Here's my thinking": "यह रही मेरी सोच",
    "Leading explanation": "सबसे संभावित कारण",
    "I asked %n questions and stopped because %r.": "मैंने %n सवाल पूछे और रुक गया क्योंकि %r।",
    "one explanation now clearly leads": "अब एक कारण साफ़ तौर पर आगे है",
    "no further question would change the picture": "कोई और सवाल तस्वीर नहीं बदलता",
    "that's as many questions as this check allows": "इस जाँच में इतने ही सवाल होते हैं",
    "you asked me to finish": "आपने पूरा करने को कहा",
    "See my full results →": "मेरे पूरे नतीजे देखें →",
    "Change an answer": "कोई जवाब बदलें",
    "Tell me a little more": "थोड़ा और बताइए",
    "I couldn't pick out a symptom from that yet. What do you feel, where, and since when?": "अभी मैं इसमें से कोई लक्षण नहीं पहचान पाया। आपको क्या महसूस हो रहा है, कहाँ, और कब से?",
    "e.g. fever since yesterday with a sore throat": "जैसे: कल से बुखार और गले में ख़राश",
    "Try again": "फिर से कोशिश करें",
    "Analyse anyway": "फिर भी जाँचें",
    "We couldn't reach QueroCura. Check your connection and try again. If you feel very unwell, don't wait: seek care now.":
      "QueroCura से जुड़ नहीं पाए। अपना कनेक्शन जाँचें और फिर कोशिश करें। अगर आप बहुत बीमार महसूस कर रहे हैं, तो इंतज़ार न करें: अभी इलाज लें।",
    "Pattern estimates from what you've said, not a diagnosis.": "आपकी बताई बातों पर आधारित अनुमान, निदान नहीं।",
    "Keys: Y yes · N no · U not sure · ← back": "कुंजियाँ: Y हाँ · N नहीं · U पता नहीं · ← पीछे",
    "selected": "चुना गया",
  };
  function hi() { return !!(window.QCI18n && window.QCI18n.lang === "hi"); }
  function L(s) { return hi() && HI[s] ? HI[s] : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- styles ---------- */
  var CSS = '' +
    '.qr{position:fixed;inset:0;z-index:1000;overflow:auto;font-family:"Manrope",sans-serif;color:#100e2a;background:radial-gradient(1200px 600px at 15% -10%,rgba(14,143,131,.12),transparent 60%),radial-gradient(900px 500px at 110% 10%,rgba(124,111,219,.12),transparent 60%),#f6f5f1}' +
    '.qr[hidden]{display:none}' +
    '.qr-top{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:14px clamp(16px,3vw,28px);background:rgba(246,245,241,.86);backdrop-filter:blur(10px);border-bottom:1px solid rgba(16,14,42,.07)}' +
    '.qr-brand{display:flex;align-items:center;gap:10px;font:800 14px "Space Grotesk",sans-serif}' +
    '.qr-orb{width:26px;height:26px;border-radius:50%;background:conic-gradient(from 0deg,#0e8f83,#2f8fd1,#7c6fdb,#0e8f83);animation:qrSpin 4s linear infinite;box-shadow:0 0 0 4px rgba(14,143,131,.12)}' +
    '.qr.busy .qr-orb{animation-duration:.9s}' +
    '@keyframes qrSpin{to{transform:rotate(360deg)}}' +
    '.qr-step{margin-left:auto;font-size:12px;font-weight:800;color:rgba(16,14,42,.55)}' +
    '.qr-x{border:0;background:none;font-size:20px;cursor:pointer;color:rgba(16,14,42,.5);border-radius:10px;padding:4px 10px}.qr-x:hover{background:rgba(16,14,42,.06)}' +
    '.qr-grid{max-width:1120px;margin:0 auto;padding:clamp(16px,3vw,32px);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:22px;align-items:start}' +
    '@media (max-width:860px){.qr-grid{grid-template-columns:1fr;gap:14px}}' +
    '.qr-card{background:#fff;border:1px solid rgba(16,14,42,.08);border-radius:26px;padding:clamp(20px,3.5vw,34px);box-shadow:0 30px 70px -40px rgba(16,14,42,.35);position:relative;overflow:hidden}' +
    '.qr-insight{display:flex;gap:10px;align-items:center;font-size:13.5px;font-weight:700;color:#0b6f66;background:rgba(14,143,131,.08);border:1px solid rgba(14,143,131,.18);border-radius:14px;padding:9px 13px;margin-bottom:16px;animation:qrIn .45s cubic-bezier(.22,1,.36,1)}' +
    '.qr-q{font:700 clamp(21px,3.2vw,27px)/1.25 "Space Grotesk",sans-serif;letter-spacing:-.015em;margin:0 0 12px;animation:qrIn .45s cubic-bezier(.22,1,.36,1)}' +
    '@keyframes qrIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.qr-why{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.5;color:rgba(16,14,42,.64);margin-bottom:20px}.qr-why b{color:#7c6fdb;font-weight:800;white-space:nowrap}' +
    '.qr-yn{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}' +
    '.qr-btn{position:relative;font:800 16px "Manrope",sans-serif;border-radius:18px;padding:18px 12px;cursor:pointer;border:1.5px solid rgba(16,14,42,.12);background:#fff;color:inherit;transition:transform .15s,border-color .15s,background .15s,box-shadow .15s}' +
    '.qr-btn:hover{transform:translateY(-3px);border-color:#0e8f83;box-shadow:0 14px 26px -16px rgba(14,143,131,.6)}' +
    '.qr-btn:focus-visible{outline:2.5px solid #0e8f83;outline-offset:2px}' +
    '.qr-btn kbd{position:absolute;top:7px;right:9px;font:700 10px ui-monospace,monospace;color:rgba(16,14,42,.35)}' +
    '.qr-btn.yes.on{background:#0e8f83;color:#fff;border-color:#0e8f83}.qr-btn.no.on{background:#100e2a;color:#fff;border-color:#100e2a}.qr-btn.unsure.on{background:rgba(16,14,42,.08)}' +
    '.qr-list{display:flex;flex-direction:column;gap:9px}' +
    '.qr-opt{display:flex;align-items:center;gap:12px;text-align:left;width:100%;font:650 15px/1.35 "Manrope",sans-serif;color:inherit;background:#fff;border:1.5px solid rgba(16,14,42,.12);border-radius:16px;padding:13px 16px;cursor:pointer;transition:transform .15s,border-color .15s,background .15s}' +
    '.qr-opt:hover{border-color:#0e8f83;transform:translateX(3px)}.qr-opt:focus-visible{outline:2.5px solid #0e8f83;outline-offset:2px}' +
    '.qr-mark{flex:0 0 22px;height:22px;border-radius:7px;border:2px solid rgba(16,14,42,.25);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff}' +
    '.qr-opt.on{border-color:#0e8f83;background:rgba(14,143,131,.08)}.qr-opt.on .qr-mark{background:#0e8f83;border-color:#0e8f83}' +
    '.qr-opt.crit.on{border-color:#d24f28;background:rgba(210,79,40,.08)}.qr-opt.crit.on .qr-mark{background:#d24f28;border-color:#d24f28}' +
    '.qr-opt .num{margin-left:auto;font:700 11px ui-monospace,monospace;color:rgba(16,14,42,.35)}' +
    '.qr-nav{display:flex;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}.qr-sp{flex:1}' +
    '.qr-go{font:800 14.5px "Manrope",sans-serif;border:0;border-radius:999px;padding:13px 24px;cursor:pointer;background:#0e8f83;color:#fff;transition:transform .15s,box-shadow .15s}.qr-go:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 26px -12px rgba(14,143,131,.6)}.qr-go:disabled{opacity:.45;cursor:default}' +
    '.qr-ghost{background:transparent;color:inherit;border:1.5px solid rgba(16,14,42,.15)}' +
    '.qr-link{border:0;background:none;font:700 13px "Manrope",sans-serif;color:rgba(16,14,42,.5);cursor:pointer;padding:8px 6px;text-decoration:underline;text-underline-offset:3px}' +
    '.qr-keys{margin-top:14px;font-size:11.5px;font-weight:700;color:rgba(16,14,42,.38)}' +
    '.qr-alarm{border-radius:18px;background:rgba(210,79,40,.09);border:1.5px solid rgba(210,79,40,.4);color:#9a3c1f;padding:14px 16px;margin:0 0 16px;font-size:14px;line-height:1.55;animation:qrIn .3s ease}.qr-alarm b{display:block;font-size:15.5px;color:#b3401f;margin-bottom:3px}' +
    '.qr-call{display:inline-flex;align-items:center;gap:8px;margin-top:10px;background:#d24f28;color:#fff !important;font-weight:800;border-radius:999px;padding:10px 20px;text-decoration:none}' +
    '.qr-help{border-radius:18px;background:rgba(124,111,219,.1);border:1.5px solid rgba(124,111,219,.35);padding:14px 16px;margin:0 0 16px;font-size:14px;line-height:1.55}' +
    /* aside */
    '.qr-aside{position:sticky;top:74px;display:flex;flex-direction:column;gap:14px}' +
    '.qr-panel{background:rgba(255,255,255,.75);backdrop-filter:blur(8px);border:1px solid rgba(16,14,42,.08);border-radius:22px;padding:16px 18px}' +
    '.qr-h{display:flex;align-items:center;gap:8px;font:800 11px "Manrope",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:rgba(16,14,42,.5);margin:0 0 12px}' +
    '.qr-h .live{width:7px;height:7px;border-radius:50%;background:#0e8f83;box-shadow:0 0 0 0 rgba(14,143,131,.5);animation:qrPulse 1.6s infinite}' +
    '@keyframes qrPulse{70%{box-shadow:0 0 0 8px rgba(14,143,131,0)}100%{box-shadow:0 0 0 0 rgba(14,143,131,0)}}' +
    '.qr-dx{display:flex;flex-direction:column;gap:8px}' +
    '.qr-row{border-radius:14px;padding:9px 11px;cursor:pointer;transition:background .2s,transform .5s cubic-bezier(.22,1,.36,1)}.qr-row:hover,.qr-row.open{background:rgba(16,14,42,.04)}' +
    '.qr-row-t{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:750}.qr-row-t .nm{flex:1;min-width:0}' +
    '.qr-row-t .pc{font:800 13px "Space Grotesk",sans-serif;color:rgba(16,14,42,.65)}' +
    '.qr-d{font:800 11px "Manrope",sans-serif;padding:1px 6px;border-radius:999px;animation:qrIn .4s}.qr-d.up{color:#0b6f66;background:rgba(14,143,131,.12)}.qr-d.dn{color:rgba(16,14,42,.5);background:rgba(16,14,42,.06)}' +
    '.qr-bar{height:7px;border-radius:7px;background:rgba(16,14,42,.07);margin-top:7px;overflow:hidden}.qr-bar i{display:block;height:100%;border-radius:7px;background:linear-gradient(90deg,#0e8f83,#2f8fd1);transition:width .7s cubic-bezier(.22,1,.36,1)}' +
    '.qr-row.lead .qr-bar i{background:linear-gradient(90deg,#0e8f83,#7c6fdb)}.qr-row.dng .qr-bar i{background:linear-gradient(90deg,#e07a3f,#d24f28)}' +
    '.qr-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#d24f28;background:rgba(210,79,40,.1);padding:2px 7px;border-radius:999px}' +
    '.qr-ev{display:none;margin-top:8px;font-size:12.5px;line-height:1.5}.qr-row.open .qr-ev{display:block}.qr-ev b{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:rgba(16,14,42,.5)}' +
    '.qr-chips{display:flex;flex-wrap:wrap;gap:6px}.qr-chip{font-size:12.5px;font-weight:700;padding:5px 10px;border-radius:999px;animation:qrIn .4s}' +
    '.qr-chip.y{background:rgba(14,143,131,.1);color:#0b6f66}.qr-chip.n{background:rgba(16,14,42,.05);color:rgba(16,14,42,.5);text-decoration:line-through;text-decoration-color:rgba(16,14,42,.3)}.qr-chip.t{background:rgba(124,111,219,.12);color:#5a4fb8}' +
    '.qr-urg{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.qr-urg div{font-size:10.5px;font-weight:800;text-align:center;color:rgba(16,14,42,.4)}.qr-urg div i{display:block;height:7px;border-radius:7px;background:rgba(16,14,42,.08);margin-bottom:5px;transition:background .4s}' +
    '.qr-urg div.on i{background:var(--c)}.qr-urg div.now{color:var(--c)}' +
    '.qr-fine{font-size:11.5px;color:rgba(16,14,42,.45);margin:10px 0 0}' +
    '.qr-mob{display:none}' +
    '@media (max-width:860px){.qr-aside{position:static}.qr-aside.fold .qr-panel.more,.qr-aside.fold .qr-row:nth-child(n+4),.qr-aside.fold .qr-fine{display:none}.qr-aside.fold .qr-row{padding:6px 8px}.qr-mob{display:block;width:100%;margin-top:8px;padding:10px}.qr-top{flex-wrap:wrap}.qr-step{order:3;width:100%;margin:0}}' +
    /* summary / emergency */
    '.qr-title{font:800 clamp(24px,3.6vw,32px)/1.15 "Space Grotesk",sans-serif;letter-spacing:-.02em;margin:0 0 10px}' +
    '.qr-lead{font-size:15px;line-height:1.6;color:rgba(16,14,42,.68);margin:0 0 16px}' +
    '.qr-big{display:flex;align-items:center;gap:14px;padding:16px;border-radius:18px;background:linear-gradient(135deg,rgba(14,143,131,.08),rgba(124,111,219,.08));margin-bottom:14px}.qr-big .em{font-size:34px}.qr-big b{display:block;font:800 20px "Space Grotesk",sans-serif}.qr-big span{font-size:13px;color:rgba(16,14,42,.6);font-weight:700}' +
    '.qr-emg{background:linear-gradient(160deg,#b3182a,#d24f28);color:#fff;border:0}.qr-emg .qr-lead,.qr-emg .qr-fine{color:rgba(255,255,255,.88)}.qr-emg .qr-call{background:#fff;color:#b3182a !important;font-size:17px;padding:14px 26px}' +
    '.qr-emg ul{margin:8px 0 0;padding-left:20px;line-height:1.6}.qr-emg .qr-link{color:rgba(255,255,255,.85)}' +
    '.qr-why-box{background:rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;margin:14px 0;font-size:14px;line-height:1.55}' +
    '.qr-text{width:100%;min-height:90px;border-radius:16px;border:1.5px solid rgba(16,14,42,.14);padding:13px 15px;font:500 15px "Manrope",sans-serif;color:inherit;background:#fff;resize:vertical;outline:none}.qr-text:focus{border-color:#0e8f83;box-shadow:0 0 0 3px rgba(14,143,131,.14)}' +
    '.qr-load{display:flex;align-items:center;gap:12px;font-weight:700;color:rgba(16,14,42,.6);padding:20px 0}.qr-dots i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#0e8f83;margin-right:4px;animation:qrDot 1s infinite}.qr-dots i:nth-child(2){animation-delay:.15s}.qr-dots i:nth-child(3){animation-delay:.3s}' +
    '@keyframes qrDot{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:none}}' +
    '.qr-card.dim .qr-yn,.qr-card.dim .qr-list{opacity:.5;pointer-events:none}' +
    '@media (prefers-reduced-motion:reduce){.qr *{animation:none !important;transition:none !important}}' +
    '@media (hover:none){.qr-keys,.qr-btn kbd{display:none}}' +
    /* dark */
    'html[data-theme="dark"] .qr{background:radial-gradient(1200px 600px at 15% -10%,rgba(126,224,212,.08),transparent 60%),#0d0c1f;color:#f2f0f8}' +
    'html[data-theme="dark"] .qr-top{background:rgba(13,12,31,.86);border-color:rgba(255,255,255,.08)}' +
    'html[data-theme="dark"] .qr-card,html[data-theme="dark"] .qr-btn,html[data-theme="dark"] .qr-opt,html[data-theme="dark"] .qr-text{background:#18162e;border-color:rgba(255,255,255,.12);color:#f2f0f8}' +
    'html[data-theme="dark"] .qr-panel{background:rgba(24,22,46,.8);border-color:rgba(255,255,255,.1)}' +
    'html[data-theme="dark"] .qr-why,html[data-theme="dark"] .qr-lead,html[data-theme="dark"] .qr-step,html[data-theme="dark"] .qr-h,html[data-theme="dark"] .qr-keys,html[data-theme="dark"] .qr-fine,html[data-theme="dark"] .qr-row-t .pc,html[data-theme="dark"] .qr-big span{color:#a9a6bd}' +
    'html[data-theme="dark"] .qr-insight{color:#7ee0d4;background:rgba(126,224,212,.08);border-color:rgba(126,224,212,.2)}' +
    'html[data-theme="dark"] .qr-btn.no.on{background:#f2f0f8;color:#0d0c1f}html[data-theme="dark"] .qr-chip.y{color:#7ee0d4;background:rgba(126,224,212,.1)}html[data-theme="dark"] .qr-chip.n{color:#8b88a3}' +
    'html[data-theme="dark"] .qr-bar,html[data-theme="dark"] .qr-urg div i{background:rgba(255,255,255,.1)}html[data-theme="dark"] .qr-x,html[data-theme="dark"] .qr-link{color:#a9a6bd}' +
    'html[data-theme="dark"] .qr-alarm{background:rgba(210,79,40,.16);color:#f0a488}html[data-theme="dark"] .qr-alarm b{color:#ffb59d}html[data-theme="dark"] .qr-ghost{border-color:rgba(255,255,255,.2)}';

  function ensureDom() {
    if (root) return;
    var s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
    root = document.createElement("div");
    root.className = "qr"; root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Symptom check");
    document.body.appendChild(root);
    document.addEventListener("keydown", onKey);
  }

  function finish(result) {
    if (!root || root.hidden) return;
    root.hidden = true; document.body.style.overflow = "";
    if (st) st.active = false;
    var d = done; done = null; if (d) d(result);
  }

  function call(body) {
    return fetch(API + "/diagnosis/reason", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || d.ok === false) { var e = new Error(d.message || "failed"); e.status = r.status; throw e; } return d; }); });
  }

  /* ---------- flow ---------- */
  QR.run = function (opts) {
    ensureDom();
    if (done) finish({ cancelled: true });
    API = opts.apiBase || API;
    st = { text: opts.text, answers: [], labels: [], res: null, prev: null, active: true, busy: false, detail: opts.detail || "standard", sel: [], fold: true, open: {} };
    return new Promise(function (resolve) {
      done = resolve;
      root.hidden = false; document.body.style.overflow = "hidden";
      frame();
      main('<div class="qr-load"><span class="qr-dots"><i></i><i></i><i></i></span>' + esc(L("Reading what you wrote…")) + "</div>");
      turn();
    });
  };

  function frame() {
    root.innerHTML = '<div class="qr-top"><div class="qr-brand"><span class="qr-orb" aria-hidden="true"></span>' + esc(L("Thinking it through with you")) + '</div><span class="qr-step" id="qr-step"></span><button type="button" class="qr-x" id="qr-close" aria-label="' + esc(L("Close")) + '">✕</button></div>' +
      '<div class="qr-grid"><div><div class="qr-card" id="qr-main"></div></div><aside class="qr-aside fold" id="qr-aside" aria-live="polite"></aside></div>';
    root.querySelector("#qr-close").onclick = function () { finish({ cancelled: true }); };
  }
  function main(html) { var m = root.querySelector("#qr-main"); m.className = "qr-card"; m.innerHTML = html; return m; }

  function turn() {
    var owner = st;
    owner.busy = true; root.classList.add("busy");
    var m = root.querySelector("#qr-main"); if (m) m.classList.add("dim");
    call({ text: owner.text, answers: owner.answers, detail: owner.detail, lang: hi() ? "hi" : "en" }).then(function (res) {
      if (st !== owner || !owner.active) return;
      owner.busy = false; root.classList.remove("busy");
      owner.prev = owner.res; owner.res = res;
      drawAside(res);
      if (res.stop_reason === "need_more_detail" && !owner.answers.length) return showThin();
      if (res.stop_reason === "emergency") return showEmergency(res);
      if (res.done) return showSummary(res);
      showQuestion(res);
    }).catch(function () {
      if (st !== owner || !owner.active) return;
      owner.busy = false; root.classList.remove("busy");
      main('<p class="qr-lead">' + esc(L("We couldn't reach QueroCura. Check your connection and try again. If you feel very unwell, don't wait: seek care now.")) + '</p><div class="qr-nav"><button type="button" class="qr-go" id="qr-retry">' + esc(L("Try again")) + "</button></div>");
      root.querySelector("#qr-retry").onclick = function () { turn(); };
    });
  }

  function answer(qid, value, label, extra) {
    if (st.busy) return;
    st.answers.push(Object.assign({ q: qid, a: value }, extra || {}));
    st.labels.push({ id: qid, question: st.res.next.prompt, answer: label });
    turn();
  }
  function back() {
    if (st.busy || !st.answers.length) return;
    st.answers.pop(); st.labels.pop();
    turn();
  }

  /* ---------- question ---------- */
  function stepText(res) {
    var n = st.answers.filter(function (a) { return a.q.charAt(0) !== "_"; }).length;
    var lo = Math.min(3, res.budget), hiN = Math.min(7, res.budget);
    return L("Question %n").replace("%n", st.answers.length + 1) + " · " + L("usually %a–%b questions").replace("%a", lo).replace("%b", hiN) + (n ? "" : "");
  }

  function showQuestion(res) {
    var q = res.next, html = "";
    root.querySelector("#qr-step").textContent = stepText(res);
    if (res.insight && st.answers.length) html += '<div class="qr-insight" role="status"><span>🧠</span><span>' + esc(res.insight) + "</span></div>";
    if (res.helpline) html += '<div class="qr-help">💜 ' + esc(res.helpline) + "</div>";
    html += '<div id="qr-alarm"></div><h2 class="qr-q" id="qr-qtext">' + esc(q.prompt) + "</h2>";
    if (q.why) html += '<div class="qr-why"><b>💡 ' + esc(L("Why I'm asking")) + "</b><span>" + esc(q.why) + "</span></div>";
    if (q.type === "yesno") {
      html += '<div class="qr-yn" role="radiogroup" aria-labelledby="qr-qtext">' + q.options.map(function (o) {
        var k = o.value === "yes" ? "Y" : o.value === "no" ? "N" : "U";
        return '<button type="button" class="qr-btn ' + o.value + '" data-v="' + o.value + '" role="radio" aria-checked="false"><kbd>' + k + "</kbd>" + esc(o.label) + "</button>";
      }).join("") + "</div>";
    } else {
      st.sel = [];
      html += '<div class="qr-list" role="' + (q.type === "multi" ? "group" : "radiogroup") + '" aria-labelledby="qr-qtext">' + q.options.map(function (o, i) {
        return '<button type="button" class="qr-opt' + (o.critical ? " crit" : "") + '" data-v="' + esc(o.value) + '" role="' + (q.type === "multi" ? "checkbox" : "radio") + '" aria-checked="false">' +
          (q.type === "multi" ? '<span class="qr-mark">✓</span>' : "") + "<span>" + esc(o.label) + "</span>" + (q.type === "single" && i < 9 ? '<span class="num">' + (i + 1) + "</span>" : "") + "</button>";
      }).join("") + "</div>";
    }
    html += '<div class="qr-nav">' + (st.answers.length ? '<button type="button" class="qr-go qr-ghost" id="qr-back">← ' + esc(L("Back")) + "</button>" : "") +
      '<span class="qr-sp"></span>' + (st.answers.length >= 2 ? '<button type="button" class="qr-link" id="qr-finish">' + esc(L("Finish now")) + "</button>" : "") +
      (q.type === "multi" ? '<button type="button" class="qr-go" id="qr-next" disabled>' + esc(L("Continue")) + " →</button>" : "") + "</div>" +
      (q.type === "yesno" ? '<div class="qr-keys">' + esc(L("Keys: Y yes · N no · U not sure · ← back")) + "</div>" : "");
    var m = main(html);
    var b = m.querySelector("#qr-back"); if (b) b.onclick = back;
    var f = m.querySelector("#qr-finish"); if (f) f.onclick = function () { showSummary(st.res, true); };
    if (q.type === "yesno") {
      [].forEach.call(m.querySelectorAll(".qr-btn"), function (btn) {
        btn.onclick = function () { btn.classList.add("on"); btn.setAttribute("aria-checked", "true"); var o = opt(q, btn.getAttribute("data-v")); answer(q.id, o.value, o.label); };
      });
      m.querySelector(".qr-btn").focus();
    } else if (q.type === "single") {
      [].forEach.call(m.querySelectorAll(".qr-opt"), function (btn) {
        btn.onclick = function () { btn.classList.add("on"); var o = opt(q, btn.getAttribute("data-v")); answer(q.id, o.value, o.label); };
      });
      m.querySelector(".qr-opt").focus();
    } else {
      var next = m.querySelector("#qr-next");
      [].forEach.call(m.querySelectorAll(".qr-opt"), function (btn) {
        btn.onclick = function () {
          var v = btn.getAttribute("data-v");
          if (v === "none") st.sel = st.sel.indexOf("none") >= 0 ? [] : ["none"];
          else { st.sel = st.sel.filter(function (x) { return x !== "none"; }); var k = st.sel.indexOf(v); if (k >= 0) st.sel.splice(k, 1); else st.sel.push(v); }
          [].forEach.call(m.querySelectorAll(".qr-opt"), function (x) { var on = st.sel.indexOf(x.getAttribute("data-v")) >= 0; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
          next.disabled = !st.sel.length;
          var crit = q.options.filter(function (o) { return o.critical && st.sel.indexOf(o.value) >= 0; });
          m.querySelector("#qr-alarm").innerHTML = crit.length ? '<div class="qr-alarm" role="alert"><b>🚨 ' + esc(L("This can be an emergency")) + "</b>" + esc(L("Please call 112 (or your local emergency number) or go to the nearest emergency department now. Don't wait for the rest of the check.")) + '<br><a class="qr-call" href="tel:112">📞 ' + esc(L("Call 112")) + "</a></div>" : "";
        };
      });
      next.onclick = function () {
        var shown = q.options.filter(function (o) { return o.value !== "none"; }).map(function (o) { return o.value; });
        var picked = st.sel.filter(function (x) { return x !== "none"; });
        var label = picked.length ? q.options.filter(function (o) { return picked.indexOf(o.value) >= 0; }).map(function (o) { return o.label; }).join("; ") : opt(q, "none").label;
        answer(q.id, picked, label, { shown: shown });
      };
      m.querySelector(".qr-opt").focus();
    }
  }
  function opt(q, v) { return q.options.filter(function (o) { return o.value === v; })[0] || { value: v, label: v }; }

  function onKey(e) {
    if (!root || root.hidden) return;
    if (e.key === "Escape") { finish({ cancelled: true }); return; }
    if (!st || st.busy || !st.res || !st.res.next || /TEXTAREA|INPUT/.test((document.activeElement || {}).tagName || "")) return;
    var q = st.res.next, k = e.key.toLowerCase();
    if (q.type === "yesno" && (k === "y" || k === "n" || k === "u")) {
      var btn = root.querySelector('.qr-btn[data-v="' + ({ y: "yes", n: "no", u: "unsure" })[k] + '"]'); if (btn) { e.preventDefault(); btn.click(); }
    } else if (q.type === "single" && /^[1-9]$/.test(k)) {
      var b = root.querySelectorAll(".qr-opt")[+k - 1]; if (b) { e.preventDefault(); b.click(); }
    } else if (e.key === "ArrowLeft" && st.answers.length) { e.preventDefault(); back(); }
  }

  /* ---------- the reasoning panel ---------- */
  var URG = [["self", "Home care", "#2f8f5e"], ["soon", "Doctor soon", "#c98a10"], ["urgent", "Today", "#d24f28"], ["emergency", "Emergency", "#b3182a"]];
  function urgIndex(level) { return level === "emergency" ? 3 : level === "urgent" ? 2 : level === "soon" ? 1 : 0; }

  function drawAside(res) {
    var aside = root.querySelector("#qr-aside"); if (!aside) return;
    var before = {};
    [].forEach.call(aside.querySelectorAll(".qr-row"), function (r) { before[r.getAttribute("data-id")] = r.getBoundingClientRect().top; });
    var deltas = res.deltas || {}, ui = urgIndex(res.level);
    var dx = (res.differential || []).map(function (d, i) {
      var dl = deltas[d.id], badge = "";
      if (st.answers.length && typeof dl === "number" && Math.abs(dl) >= 0.03) badge = '<span class="qr-d ' + (dl > 0 ? "up" : "dn") + '">' + (dl > 0 ? "▲" : "▼") + "</span>";
      var ev = (d.supporting.length ? "<b>" + esc(L("Fits because")) + '</b><div class="qr-chips" style="margin:4px 0 8px">' + d.supporting.map(function (s) { return '<span class="qr-chip y">✓ ' + esc(s) + "</span>"; }).join("") + "</div>" : "") +
        (d.against.length ? "<b>" + esc(L("Argues against")) + '</b><div class="qr-chips" style="margin-top:4px">' + d.against.map(function (s) { return '<span class="qr-chip n">' + esc(s) + "</span>"; }).join("") + "</div>" : "");
      return '<div class="qr-row' + (i === 0 ? " lead" : "") + (d.danger && (d.level === "emergency" || d.level === "urgent") ? " dng" : "") + (st.open[d.id] ? " open" : "") + '" data-id="' + esc(d.id) + '" tabindex="0" role="button" aria-expanded="' + !!st.open[d.id] + '">' +
        '<div class="qr-row-t"><span aria-hidden="true">' + esc(d.emoji || "•") + '</span><span class="nm">' + esc(d.name) + "</span>" + (d.danger && (d.level === "emergency" || d.level === "urgent") ? '<span class="qr-tag">' + esc(L("can be serious")) + "</span>" : "") + badge + '<span class="pc">' + d.fit + "%</span></div>" +
        '<div class="qr-bar"><i style="width:' + Math.max(3, d.fit) + '%"></i></div>' + (ev ? '<div class="qr-ev">' + ev + "</div>" : "") + "</div>";
    }).join("");
    var ev = res.evidence || { present: [], denied: [] };
    var chips = ev.present.map(function (x) { return '<span class="qr-chip y">✓ ' + esc(x.label) + "</span>"; }).join("") +
      (ev.duration_days != null ? '<span class="qr-chip t">⏱ ' + esc(ev.duration_days < 1 ? L("under a day") : L("about %d days").replace("%d", Math.round(ev.duration_days))) + "</span>" : "") +
      ev.denied.map(function (x) { return '<span class="qr-chip n">' + esc(x.label) + "</span>"; }).join("");
    aside.innerHTML =
      '<div class="qr-panel"><div class="qr-h"><span class="live"></span>' + esc(L("What I'm considering")) + '</div><div class="qr-dx">' + dx + '</div><p class="qr-fine">' + esc(L("Pattern estimates from what you've said, not a diagnosis.")) + "</p>" +
      '<button type="button" class="qr-go qr-ghost qr-mob" id="qr-fold">' + esc(st.fold ? L("Show my reasoning") : L("Hide")) + "</button></div>" +
      '<div class="qr-panel more"><div class="qr-h">' + esc(L("How urgent")) + '</div><div class="qr-urg">' + URG.map(function (u, i) { return '<div class="' + (i <= ui ? "on" : "") + (i === ui ? " now" : "") + '" style="--c:' + u[2] + '"><i></i>' + esc(L(u[1])) + "</div>"; }).join("") + "</div></div>" +
      '<div class="qr-panel more"><div class="qr-h">' + esc(L("What I've understood")) + '</div><div class="qr-chips">' + (chips || '<span class="qr-fine" style="margin:0">' + esc(L("Nothing yet")) + "</span>") + "</div></div>";
    aside.classList.toggle("fold", st.fold);
    aside.querySelector("#qr-fold").onclick = function () { st.fold = !st.fold; aside.classList.toggle("fold", st.fold); this.textContent = st.fold ? L("Show my reasoning") : L("Hide"); };
    [].forEach.call(aside.querySelectorAll(".qr-row"), function (r) {
      var id = r.getAttribute("data-id");
      function toggle() { st.open[id] = !st.open[id]; r.classList.toggle("open", st.open[id]); r.setAttribute("aria-expanded", !!st.open[id]); }
      r.onclick = toggle; r.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
      // slide rows from where they were, so a re-ranking is something you can see
      if (before[id] != null) {
        var dy = before[id] - r.getBoundingClientRect().top;
        if (Math.abs(dy) > 2) { r.style.transition = "none"; r.style.transform = "translateY(" + dy + "px)"; requestAnimationFrame(function () { requestAnimationFrame(function () { r.style.transition = ""; r.style.transform = ""; }); }); }
      }
    });
    // bars move from their previous width, so each answer's effect is visible
    st.widths = st.widths || {};
    [].forEach.call(aside.querySelectorAll(".qr-row"), function (r) {
      var id = r.getAttribute("data-id"), bar = r.querySelector(".qr-bar i"), w = bar.style.width;
      bar.style.width = (st.widths[id] || 0) + "%"; st.widths[id] = parseFloat(w);
      requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = w; }); });
    });
  }

  /* ---------- endings ---------- */
  function result(res, extra) {
    var summary = st.labels.slice();
    return Object.assign({
      reasoned: true, text: res.compiled_text, original_text: st.text, reasoning: slim(res), transcript: summary, summary: summary,
      answers: st.answers, emergency: res.level === "emergency", helpline: res.helpline || "", detail: st.detail,
    }, extra || {});
  }
  function slim(res) {
    return { differential: res.differential, evidence: res.evidence, level: res.level, urgency: res.urgency, red_flags: res.red_flags, stop_reason: res.stop_reason, asked: res.asked, band: res.band };
  }

  function showSummary(res, early) {
    var top = (res.differential || [])[0] || {}, n = st.answers.length;
    var why = early ? L("you asked me to finish") : ({ confident: L("one explanation now clearly leads"), budget_reached: L("that's as many questions as this check allows"), no_more_useful_questions: L("no further question would change the picture") })[res.stop_reason] || L("no further question would change the picture");
    root.querySelector("#qr-step").textContent = "";
    var m = main((res.insight && n ? '<div class="qr-insight" role="status"><span>🧠</span><span>' + esc(res.insight) + "</span></div>" : "") +
      '<h2 class="qr-title">' + esc(L("Here's my thinking")) + "</h2>" +
      '<div class="qr-big"><span class="em">' + esc(top.emoji || "🩺") + "</span><div><span>" + esc(L("Leading explanation")) + "</span><b>" + esc(top.name || "") + "</b><span>" + esc(res.urgency || "") + "</span></div></div>" +
      (n ? '<p class="qr-lead">' + esc(L("I asked %n questions and stopped because %r.").replace("%n", n).replace("%r", why)) + "</p>" : "") +
      '<div class="qr-nav"><button type="button" class="qr-go" id="qr-done">' + esc(L("See my full results →")) + "</button>" + (n ? '<button type="button" class="qr-go qr-ghost" id="qr-back">← ' + esc(L("Change an answer")) + "</button>" : "") + "</div>");
    m.querySelector("#qr-done").onclick = function () { finish(result(res)); };
    m.querySelector("#qr-done").focus();
    var b = m.querySelector("#qr-back"); if (b) b.onclick = back;
    st.fold = false; var aside = root.querySelector("#qr-aside"); if (aside) aside.classList.remove("fold");
  }

  function showEmergency(res) {
    var f = (res.red_flags || []).filter(function (x) { return x.level === "emergency"; })[0] || (res.red_flags || [])[0] || {};
    root.querySelector("#qr-step").textContent = "";
    var told = (res.evidence && res.evidence.present || []).map(function (x) { return x.label; }).slice(0, 6).join(", ");
    var m = main('<h2 class="qr-title">🚨 ' + esc(L("Please get emergency help now")) + "</h2>" +
      '<p class="qr-lead">' + esc(f.recommended_action || L("Please call 112 (or your local emergency number) or go to the nearest emergency department now. Don't wait for the rest of the check.")) + "</p>" +
      '<a class="qr-call" href="tel:112">📞 ' + esc(L("Call 112")) + "</a>" +
      '<div class="qr-why-box"><b>' + esc(L("Why: ")) + "</b>" + esc(f.title || "") + (f.message ? " — " + esc(f.message) : "") + "</div>" +
      (res.helpline ? '<div class="qr-why-box">💜 ' + esc(res.helpline) + "</div>" : "") +
      "<b>" + esc(L("While you wait for help")) + "</b><ul><li>" + esc(L("Stay with someone, don't drive yourself, and keep your phone with you.")) + "</li><li>" + esc(L("Don't eat or drink anything until a doctor has seen you.")) + "</li>" +
      (told ? "<li>" + esc(L("Tell them: ")) + esc(told) + "</li>" : "") + "</ul>" +
      '<div class="qr-nav"><button type="button" class="qr-link" id="qr-done">' + esc(L("See the full reasoning")) + " →</button>" + (st.answers.length ? '<button type="button" class="qr-link" id="qr-back">← ' + esc(L("Change an answer")) + "</button>" : "") + "</div>");
    m.classList.add("qr-emg");
    m.querySelector("#qr-done").onclick = function () { finish(result(res, { emergency: true })); };
    var b = m.querySelector("#qr-back"); if (b) b.onclick = back;
    m.querySelector(".qr-call").focus();
  }

  function showThin() {
    root.querySelector("#qr-step").textContent = "";
    var m = main('<h2 class="qr-title">' + esc(L("Tell me a little more")) + '</h2><p class="qr-lead">' + esc(L("I couldn't pick out a symptom from that yet. What do you feel, where, and since when?")) + "</p>" +
      '<textarea class="qr-text" id="qr-more" maxlength="1500" placeholder="' + esc(L("e.g. fever since yesterday with a sore throat")) + '">' + esc(st.text) + "</textarea>" +
      '<div class="qr-nav"><button type="button" class="qr-go" id="qr-again">' + esc(L("Try again")) + '</button><span class="qr-sp"></span><button type="button" class="qr-link" id="qr-anyway">' + esc(L("Analyse anyway")) + "</button></div>");
    var t = m.querySelector("#qr-more"); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
    m.querySelector("#qr-again").onclick = function () { var v = t.value.trim(); if (!v) return; st.text = v; st.answers = []; st.labels = []; turn(); };
    m.querySelector("#qr-anyway").onclick = function () { finish({ thin: true, text: t.value.trim() || st.text }); };
  }
})();
