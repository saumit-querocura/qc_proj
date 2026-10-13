/* Results for a check that went through the reasoning interview (assets/qc-reason.js).
 *
 *   QCResReason.render(wrap, data, interview, helpers)
 *
 * `data` is the normalised /diagnosis/analyse response, `interview` what QCReason resolved with (the final differential,
 * the evidence, every question and answer). One page in the order a person needs it: what to do, why, what would change
 * it, and a summary to show a doctor.
 */
(function () {
  "use strict";
  var HI = {
    "Get emergency help now": "अभी आपातकालीन मदद लें",
    "Call 112": "112 पर कॉल करें",
    "Why I'm saying this": "मैं यह क्यों कह रहा हूँ",
    "While you wait for help": "मदद आने तक",
    "Stay with someone and don't drive yourself.": "किसी के साथ रहें और ख़ुद गाड़ी न चलाएँ।",
    "Don't eat or drink until a doctor has seen you.": "डॉक्टर के देखने तक कुछ न खाएँ-पिएँ।",
    "Keep this page open: the summary below is ready to show the doctor.": "यह पेज खुला रखें: नीचे का सारांश डॉक्टर को दिखाने के लिए तैयार है।",
    "Most likely": "सबसे संभावित",
    "match": "मेल",
    "Based on what you wrote and %n answers.": "आपके लिखे और %n जवाबों के आधार पर।",
    "Based on what you wrote.": "आपके लिखे के आधार पर।",
    "How I reached this": "मैं इस नतीजे तक कैसे पहुँचा",
    "Each bar is how well your story fits that explanation. Tap one to see the evidence.": "हर पट्टी दिखाती है कि आपकी बात उस कारण से कितनी मेल खाती है। सबूत देखने के लिए किसी पर टैप करें।",
    "Fits because": "इसलिए मेल खाता है",
    "Argues against": "इसके ख़िलाफ़",
    "What I understood": "मैंने क्या समझा",
    "You have": "आपको है",
    "You don't have": "आपको नहीं है",
    "about %d days": "लगभग %d दिन",
    "under a day": "एक दिन से कम",
    "Your answers": "आपके जवाब",
    "Get help sooner if": "जल्दी मदद लें अगर",
    "About %s": "%s के बारे में",
    "For your doctor": "आपके डॉक्टर के लिए",
    "A short summary of this check. Show it at your visit or send it ahead.": "इस जाँच का छोटा सारांश। मिलने पर दिखाएँ या पहले से भेज दें।",
    "Copy": "कॉपी करें",
    "Share": "शेयर करें",
    "Print": "प्रिंट करें",
    "Copied": "कॉपी हो गया",
    "Symptom check": "लक्षण जाँच",
    "In their words": "उनके शब्दों में",
    "Duration": "अवधि",
    "Reported": "बताए गए लक्षण",
    "Denied": "जिनसे इनकार किया",
    "Questions answered": "जवाब दिए गए सवाल",
    "Patterns considered (not a diagnosis)": "विचार किए गए पैटर्न (निदान नहीं)",
    "Suggested urgency": "सुझाई गई तत्परता",
    "Warning signs flagged": "चेतावनी संकेत",
    "none": "कोई नहीं",
    "From QueroCura's symptom checker: educational triage support, not a diagnosis.": "QueroCura के लक्षण जाँचकर्ता से: शैक्षिक मार्गदर्शन, निदान नहीं।",
    "can be serious": "गंभीर हो सकता है",
    "QueroCura's symptom checker gives educational guidance only. It is not a diagnosis. If you feel worse, or a warning sign appears, get care sooner.":
      "QueroCura का लक्षण जाँचकर्ता सिर्फ़ शैक्षिक मार्गदर्शन देता है। यह निदान नहीं है। अगर तबीयत बिगड़े या कोई चेतावनी संकेत दिखे, तो जल्दी इलाज लें।",
  };
  function hi() { return !!(window.QCI18n && window.QCI18n.lang === "hi"); }
  function L(s) { return hi() && HI[s] ? HI[s] : s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var CSS = '' +
    '.rr-hero{border-radius:26px;padding:clamp(22px,4vw,34px);margin-bottom:20px;color:#fff;background:linear-gradient(140deg,var(--c1),var(--c2));box-shadow:0 30px 60px -36px var(--c2);position:relative;overflow:hidden}' +
    '.rr-hero::after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.1)}' +
    '.rr-hero>*{position:relative}' +
    '.rr-kick{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.85}' +
    '.rr-head{font:700 clamp(26px,4vw,36px)/1.12 "Fraunces",serif;margin:6px 0 8px}' +
    '.rr-sum{font-size:15px;line-height:1.6;opacity:.92;max-width:620px;margin:0}' +
    '.rr-lead{display:flex;align-items:center;gap:14px;margin-top:18px;background:rgba(255,255,255,.14);border-radius:18px;padding:12px 16px;backdrop-filter:blur(4px)}' +
    '.rr-lead .em{font-size:30px}.rr-lead b{display:block;font:800 19px "Space Grotesk",sans-serif}.rr-lead small{font-size:12.5px;font-weight:700;opacity:.85}' +
    '.rr-ring{margin-left:auto;width:56px;height:56px;border-radius:50%;background:conic-gradient(#fff calc(var(--p)*1%),rgba(255,255,255,.22) 0);display:flex;align-items:center;justify-content:center;flex:0 0 auto}' +
    '.rr-ring span{width:44px;height:44px;border-radius:50%;background:var(--c2);display:flex;align-items:center;justify-content:center;font:800 13px "Space Grotesk",sans-serif}' +
    '.rr-call{display:inline-flex;align-items:center;gap:8px;margin-top:16px;background:#fff;color:#b3182a !important;font:800 17px "Manrope",sans-serif;border-radius:999px;padding:14px 26px;text-decoration:none}' +
    '.rr-box{background:rgba(255,255,255,.14);border-radius:16px;padding:12px 16px;margin-top:14px;font-size:14.5px;line-height:1.55}.rr-box ul{margin:6px 0 0;padding-left:20px}' +
    '.rr-dx{display:flex;flex-direction:column;gap:10px;margin-top:6px}' +
    '.rr-row{border:1px solid rgba(16,14,42,.08);border-radius:16px;padding:12px 14px;cursor:pointer;transition:background .2s}.rr-row:hover{background:rgba(16,14,42,.025)}' +
    '.rr-row-t{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px}.rr-row-t .nm{flex:1}.rr-row-t .pc{font:800 14px "Space Grotesk",sans-serif;opacity:.7}' +
    '.rr-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#d24f28;background:rgba(210,79,40,.1);padding:2px 8px;border-radius:999px}' +
    '.rr-bar{height:8px;border-radius:8px;background:rgba(16,14,42,.07);margin-top:8px;overflow:hidden}.rr-bar i{display:block;height:100%;width:0;border-radius:8px;background:linear-gradient(90deg,#0e8f83,#2f8fd1);transition:width 1s cubic-bezier(.22,1,.36,1)}' +
    '.rr-row.lead .rr-bar i{background:linear-gradient(90deg,#0e8f83,#7c6fdb)}.rr-row.dng .rr-bar i{background:linear-gradient(90deg,#e07a3f,#d24f28)}' +
    '.rr-ev{display:none;margin-top:10px}.rr-row.open .rr-ev{display:block}.rr-ev b{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;opacity:.55;margin:6px 0 5px}' +
    '.rr-chips{display:flex;flex-wrap:wrap;gap:6px}.rr-chip{font-size:12.5px;font-weight:700;padding:5px 11px;border-radius:999px}' +
    '.rr-chip.y{background:rgba(14,143,131,.1);color:#0b6f66}.rr-chip.n{background:rgba(16,14,42,.05);color:rgba(16,14,42,.55);text-decoration:line-through;text-decoration-color:rgba(16,14,42,.3)}.rr-chip.t{background:rgba(124,111,219,.12);color:#5a4fb8}.rr-chip.r{background:rgba(210,79,40,.1);color:#b3401f}' +
    '.rr-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:640px){.rr-cols{grid-template-columns:1fr}}' +
    '.rr-qa{display:flex;flex-direction:column;border:1px solid rgba(16,14,42,.08);border-radius:16px;overflow:hidden;margin-top:10px}.rr-qa div{display:flex;gap:14px;justify-content:space-between;padding:10px 14px;font-size:13.5px;border-bottom:1px solid rgba(16,14,42,.06)}.rr-qa div:last-child{border:0}.rr-qa span{opacity:.65;flex:1}.rr-qa b{text-align:right;flex:1}' +
    'details.rr-more summary{cursor:pointer;font-weight:800;font-size:14px;list-style:none;display:flex;align-items:center;gap:8px}details.rr-more summary::-webkit-details-marker{display:none}details.rr-more summary::after{content:"▾";margin-left:auto;transition:transform .2s}details.rr-more[open] summary::after{transform:rotate(180deg)}' +
    '.rr-doc{white-space:pre-wrap;font:500 13px/1.6 ui-monospace,"Cascadia Mono",Consolas,monospace;background:rgba(16,14,42,.035);border:1px dashed rgba(16,14,42,.16);border-radius:16px;padding:16px;margin:12px 0;max-height:360px;overflow:auto}' +
    '.rr-btns{display:flex;gap:8px;flex-wrap:wrap}.rr-btn{border:1.5px solid rgba(16,14,42,.15);background:#fff;color:inherit;border-radius:999px;padding:9px 16px;font:800 13px "Manrope",sans-serif;cursor:pointer}.rr-btn:hover{border-color:#0e8f83;color:#0e8f83}' +
    '.rr-fine{font-size:12px;opacity:.6;margin:8px 0 0;line-height:1.5}' +
    'html[data-theme="dark"] .rr-row,html[data-theme="dark"] .rr-qa{border-color:rgba(255,255,255,.1)}html[data-theme="dark"] .rr-qa div{border-color:rgba(255,255,255,.07)}' +
    'html[data-theme="dark"] .rr-bar{background:rgba(255,255,255,.1)}html[data-theme="dark"] .rr-chip.y{color:#7ee0d4;background:rgba(126,224,212,.1)}html[data-theme="dark"] .rr-chip.n{color:#8b88a3}' +
    'html[data-theme="dark"] .rr-doc{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.15)}html[data-theme="dark"] .rr-btn{background:#18162e;border-color:rgba(255,255,255,.18)}' +
    '@media print{.topbar,.back-bar,#bottom-actions,.rr-btns,.triage-actions,.rr-hero::after{display:none !important}.rr-row .rr-ev{display:block}.rr-doc{max-height:none}}' +
    '@media (prefers-reduced-motion:reduce){.rr-bar i{transition:none}}';

  var LEVEL = {
    self: ["#2f8f5e", "#0e8f83"], monitor: ["#2f8f5e", "#0e8f83"], soon: ["#c98a10", "#b8730c"], urgent: ["#e07a3f", "#c9461f"], emergency: ["#d24f28", "#9c1426"],
  };

  function chips(list, cls, mark) { return (list || []).map(function (x) { return '<span class="rr-chip ' + cls + '">' + (mark || "") + esc(x) + "</span>"; }).join(""); }

  function doctorSummary(data, iv) {
    var R = iv.reasoning || {}, ev = R.evidence || { present: [], denied: [] };
    var dur = ev.duration_days == null ? "" : ev.duration_days < 1 ? L("under a day") : L("about %d days").replace("%d", Math.round(ev.duration_days));
    var lines = [
      L("Symptom check") + " · " + new Date().toLocaleString(hi() ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
      "",
      L("In their words") + ': "' + String(iv.original_text || "").trim() + '"',
    ];
    if (dur) lines.push(L("Duration") + ": " + dur);
    lines.push(L("Reported") + ": " + (ev.present.map(function (x) { return x.label; }).join(", ") || L("none")));
    lines.push(L("Denied") + ": " + (ev.denied.map(function (x) { return x.label; }).join(", ") || L("none")));
    var qa = (iv.transcript || []).filter(function (t) { return !t.id || t.id.charAt(0) !== "_"; });   // safety and duration are in the lines above
    if (qa.length) {
      lines.push("", L("Questions answered") + ":");
      qa.forEach(function (t) { lines.push("  • " + t.question + " — " + t.answer); });
    }
    lines.push("", L("Patterns considered (not a diagnosis)") + ":");
    (R.differential || []).slice(0, 4).forEach(function (d) { lines.push("  • " + d.name + " (" + d.fit + "%)" + (d.supporting.length ? ": " + d.supporting.join(", ") : "")); });
    lines.push("", L("Suggested urgency") + ": " + (R.urgency || data.urgency || ""));
    lines.push(L("Warning signs flagged") + ": " + (((R.red_flags || []).map(function (f) { return f.title; }).join("; ")) || L("none")));
    lines.push("", L("From QueroCura's symptom checker: educational triage support, not a diagnosis."));
    return lines.join("\n");
  }

  function render(wrap, data, iv, h) {
    if (!document.getElementById("rr-css")) { var s = document.createElement("style"); s.id = "rr-css"; s.textContent = CSS; document.head.appendChild(s); }
    var R = iv.reasoning || {}, dx = R.differential || [], top = dx[0] || {}, ev = R.evidence || { present: [], denied: [] };
    var level = (data.syndrome_engine && data.syndrome_engine.urgency_level) || R.level || "monitor";
    var emergency = level === "emergency" || (data.assessment && data.assessment.status === "urgent_action" && data.assessment.urgency_level === "emergency");
    var colors = LEVEL[emergency ? "emergency" : level] || LEVEL.monitor;
    var n = (iv.transcript || []).length;
    var html = "";

    // 1. What to do
    if (emergency) {
      var flags = (R.red_flags || []).filter(function (f) { return f.level === "emergency"; });
      if (!flags.length) flags = ((data.safety_triage || {}).findings || []).filter(function (f) { return f.level === "emergency"; });
      html += '<div class="rr-hero reveal" style="--c1:' + colors[0] + ";--c2:" + colors[1] + '" role="alert"><div class="rr-kick">🚨 ' + esc(L("Get emergency help now")) + "</div>" +
        '<div class="rr-head">' + esc((flags[0] && flags[0].recommended_action) || L("Get emergency help now")) + "</div>" +
        '<a class="rr-call" href="tel:112">📞 ' + esc(L("Call 112")) + "</a>" +
        (flags.length ? '<div class="rr-box"><b>' + esc(L("Why I'm saying this")) + "</b><ul>" + flags.map(function (f) { return "<li><b>" + esc(f.title) + "</b> — " + esc(f.message) + "</li>"; }).join("") + "</ul></div>" : "") +
        '<div class="rr-box"><b>' + esc(L("While you wait for help")) + "</b><ul><li>" + esc(L("Stay with someone and don't drive yourself.")) + "</li><li>" + esc(L("Don't eat or drink until a doctor has seen you.")) + "</li><li>" + esc(L("Keep this page open: the summary below is ready to show the doctor.")) + "</li></ul></div>" +
        (iv.helpline ? '<div class="rr-box">💜 ' + esc(iv.helpline) + "</div>" : "") + "</div>";
    } else {
      var t = h.buildTriage(data);
      html += '<div class="rr-hero reveal" style="--c1:' + colors[0] + ";--c2:" + colors[1] + '"><div class="rr-kick">' + esc(t.meta.icon + " " + t.meta.label) + "</div>" +
        '<div class="rr-head">' + esc(t.headline) + '</div><p class="rr-sum">' + esc(t.summary) + "</p>" +
        (top.name ? '<div class="rr-lead"><span class="em">' + esc(top.emoji || data.emoji || "🩺") + "</span><div><small>" + esc(L("Most likely")) + "</small><b>" + esc(top.name) + "</b><small>" + esc(n ? L("Based on what you wrote and %n answers.").replace("%n", n) : L("Based on what you wrote.")) + "</small></div>" +
          '<div class="rr-ring" style="--p:' + (top.fit || 0) + '" title="' + esc(L("match")) + '"><span>' + (top.fit || 0) + "%</span></div></div>" : "") +
        (iv.helpline ? '<div class="rr-box">💜 ' + esc(iv.helpline) + "</div>" : "") + "</div>";
      html += h.triageHtml(data, { noHead: true });
    }

    // 2. Why
    html += '<div class="card reveal"><div class="section-label" style="margin-top:0">🧠 ' + esc(L("How I reached this")) + '</div><p class="rr-fine" style="margin:0 0 10px">' + esc(L("Each bar is how well your story fits that explanation. Tap one to see the evidence.")) + '</p><div class="rr-dx">' +
      dx.slice(0, 5).map(function (d, i) {
        var serious = d.danger && (d.level === "emergency" || d.level === "urgent");
        return '<div class="rr-row' + (i === 0 ? " lead open" : "") + (serious ? " dng" : "") + '" tabindex="0" role="button" aria-expanded="' + (i === 0) + '"><div class="rr-row-t"><span>' + esc(d.emoji || "•") + '</span><span class="nm">' + esc(d.name) + "</span>" + (serious ? '<span class="rr-tag">' + esc(L("can be serious")) + "</span>" : "") + '<span class="pc">' + d.fit + "%</span></div>" +
          '<div class="rr-bar"><i data-w="' + Math.max(3, d.fit) + '"></i></div><div class="rr-ev">' +
          (d.supporting.length ? "<b>" + esc(L("Fits because")) + '</b><div class="rr-chips">' + chips(d.supporting, "y", "✓ ") + "</div>" : "") +
          (d.against.length ? "<b>" + esc(L("Argues against")) + '</b><div class="rr-chips">' + chips(d.against, "n") + "</div>" : "") + "</div></div>";
      }).join("") + "</div>";
    var dur = ev.duration_days == null ? "" : ev.duration_days < 1 ? L("under a day") : L("about %d days").replace("%d", Math.round(ev.duration_days));
    html += '<div class="section-label">' + esc(L("What I understood")) + '</div><div class="rr-cols"><div><div class="rr-fine" style="margin:0 0 6px;font-weight:800">' + esc(L("You have")) + '</div><div class="rr-chips">' + chips(ev.present.map(function (x) { return x.label; }), "y", "✓ ") + (dur ? '<span class="rr-chip t">⏱ ' + esc(dur) + "</span>" : "") + "</div></div>" +
      '<div><div class="rr-fine" style="margin:0 0 6px;font-weight:800">' + esc(L("You don't have")) + '</div><div class="rr-chips">' + (chips(ev.denied.map(function (x) { return x.label; }), "n") || '<span class="rr-fine" style="margin:0">—</span>') + "</div></div></div>";
    if (n) html += '<details class="rr-more" style="margin-top:16px"><summary>💬 ' + esc(L("Your answers")) + " (" + n + ')</summary><div class="rr-qa">' + iv.transcript.map(function (t) { return "<div><span>" + esc(t.question) + "</span><b>" + esc(t.answer) + "</b></div>"; }).join("") + "</div></details>";
    html += "</div>";

    // 3. What would change it
    var watch = h.scrubList(data.red_flags || []);
    if (watch.length && !emergency) html += '<div class="card reveal emergency-alert"><div class="section-label" style="margin-top:0">⚠️ ' + esc(L("Get help sooner if")) + '</div><div class="rr-chips">' + chips(watch, "r") + "</div></div>";

    // 4. About the leading explanation
    if (data.name && data.description) {
      html += '<div class="card reveal"><div class="section-label" style="margin-top:0">' + esc(L("About %s").replace("%s", data.name)) + '</div><div class="condition-desc" style="margin:0">' + esc(h.scrubText(data.description)) + "</div>" +
        (h.scrubList(data.home_care_ongoing).length ? '<div class="section-label">' + esc("Ongoing care") + "</div>" + h.listHtml("care-list do", h.scrubList(data.home_care_ongoing)) : "") + h.ongoingNoteHtml(data) + "</div>";
    }

    // 5. For the doctor
    var summary = doctorSummary(data, iv);
    html += '<div class="card reveal"><div class="section-label" style="margin-top:0">🩺 ' + esc(L("For your doctor")) + '</div><p class="rr-fine" style="margin:0">' + esc(L("A short summary of this check. Show it at your visit or send it ahead.")) + '</p><div class="rr-doc" id="rr-doc">' + esc(summary) + '</div>' +
      '<div class="rr-btns"><button type="button" class="rr-btn" id="rr-copy">📋 ' + esc(L("Copy")) + "</button>" + (navigator.share ? '<button type="button" class="rr-btn" id="rr-share">📤 ' + esc(L("Share")) + "</button>" : "") + '<button type="button" class="rr-btn" id="rr-print">🖨 ' + esc(L("Print")) + "</button></div></div>";
    html += '<p class="rr-fine" style="text-align:center;margin:6px 0 20px">' + esc(L("QueroCura's symptom checker gives educational guidance only. It is not a diagnosis. If you feel worse, or a warning sign appears, get care sooner.")) + "</p>";

    wrap.innerHTML = html;
    if (!emergency) { h.wireTriageActions(data); }
    h.wireOngoing(data);
    [].forEach.call(wrap.querySelectorAll(".rr-row"), function (r) {
      function toggle() { var on = !r.classList.contains("open"); r.classList.toggle("open", on); r.setAttribute("aria-expanded", on); }
      r.onclick = toggle; r.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () { [].forEach.call(wrap.querySelectorAll(".rr-bar i"), function (b) { b.style.width = b.getAttribute("data-w") + "%"; }); }); });
    var copy = document.getElementById("rr-copy");
    copy.onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(summary) : Promise.reject()).then(function () { copy.textContent = "✓ " + L("Copied"); }, function () {
        var r = document.createRange(); r.selectNodeContents(document.getElementById("rr-doc")); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      });
    };
    var share = document.getElementById("rr-share");
    if (share) share.onclick = function () { navigator.share({ title: L("Symptom check"), text: summary }).catch(function () {}); };
    document.getElementById("rr-print").onclick = function () { window.print(); };
    var title = document.getElementById("results-title"), sub = document.getElementById("results-sub");
    if (title) title.textContent = emergency ? L("Get emergency help now") : (top.name || data.name || title.textContent);
    if (sub) sub.textContent = "";
    var bottom = document.getElementById("bottom-actions"); if (bottom) bottom.style.display = "flex";
  }

  window.QCResReason = { render: render, doctorSummary: doctorSummary };
})();
