/* Easier vitals on the Vitals page: say it, snap the device display, or import from Apple Health / Google.
 * Nothing is saved automatically: readings are filled into the normal form so the person confirms them first. */
(function () {
  "use strict";
  var API = (window.QC_API_BASE || "https://app.querocura.com/api");
  var FIELDS = { temp: "v-temp", sys_bp: "v-sys", dia_bp: "v-dia", pulse: "v-pulse", spo2: "v-spo2", glucose: "v-glucose", weight: "v-weight" };
  var LABEL = { sys_bp: "Systolic", dia_bp: "Diastolic", pulse: "Pulse", spo2: "SpO₂", glucose: "Glucose", temp: "Temp", weight: "Weight" };
  var UNIT = { sys_bp: "mmHg", dia_bp: "mmHg", pulse: "bpm", spo2: "%", glucose: "mg/dL", temp: "°C", weight: "kg" };
  var DEVICES = [["auto", "Not sure"], ["bp", "BP monitor"], ["glucose", "Glucometer"], ["temp", "Thermometer"], ["spo2", "Pulse oximeter"], ["weight", "Scale"]];
  var device = "auto", lastFile = null, cloudAvailable = false;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function toast(m, k) { if (window.QC && QC.toast) QC.toast(m, k); }

  function post(path, body, isForm) {
    var init = { method: "POST", credentials: "include" };
    if (isForm) init.body = body; else { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body); }
    return fetch(API + path, init).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; return d; }); })
      .catch(function () { return { ok: false, message: "We couldn't reach QueroCura. Check your connection." }; });
  }

  var css = document.createElement("style");
  css.textContent =
    ".qq{margin-bottom:18px;background:linear-gradient(135deg,rgba(14,143,131,.09),rgba(124,111,219,.09));border:1px solid rgba(14,143,131,.22)}" +
    ".qq-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}" +
    ".qq-btn{display:inline-flex;align-items:center;gap:8px;border:1.5px solid rgba(16,14,42,.14);background:#fff;color:#100e2a;font:800 13.5px Manrope,sans-serif;padding:11px 18px;border-radius:999px;cursor:pointer;transition:transform .15s,box-shadow .15s}" +
    ".qq-btn:hover{transform:translateY(-2px);box-shadow:0 12px 22px -14px rgba(16,14,42,.45)}.qq-btn.live{background:#d24f28;border-color:#d24f28;color:#fff;animation:qqPulse 1.2s ease infinite}" +
    "@keyframes qqPulse{50%{box-shadow:0 0 0 8px rgba(210,79,40,.18)}}" +
    ".qq-chips{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 4px}.qq-chip{border:1.5px solid rgba(16,14,42,.14);background:#fff;color:#100e2a;border-radius:999px;padding:6px 12px;font:700 12px Manrope,sans-serif;cursor:pointer}.qq-chip.sel{background:#0e8f83;border-color:#0e8f83;color:#fff}" +
    ".qq-res{margin-top:14px;border-radius:16px;background:#fff;border:1px solid rgba(16,14,42,.1);padding:14px 16px;font:600 14px Manrope,sans-serif;color:#100e2a}" +
    ".qq-res.bad{border-color:#d24f28}.qq-vals{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.qq-val{background:rgba(14,143,131,.1);border-radius:12px;padding:7px 12px;font-weight:800}.qq-val small{font-weight:700;opacity:.65;margin-left:3px}" +
    ".qq-note{font-size:12.5px;color:rgba(16,14,42,.6);margin-top:6px}.qq-say{font-style:italic;color:rgba(16,14,42,.65);margin-top:8px}" +
    ".qq-type{display:flex;gap:8px;margin-top:12px}.qq-type input{flex:1;border:1.5px solid rgba(16,14,42,.14);border-radius:12px;padding:10px 12px;font:600 14px Manrope,sans-serif}" +
    ".qq-flash{animation:qqFlash 1.4s ease}@keyframes qqFlash{0%,60%{box-shadow:0 0 0 4px rgba(14,143,131,.45);background:rgba(14,143,131,.1)}100%{box-shadow:none}}" +
    "html[data-theme='dark'] .qq-btn,html[data-theme='dark'] .qq-chip,html[data-theme='dark'] .qq-res,html[data-theme='dark'] .qq-type input{background:#18162e;color:#f2f0f8;border-color:rgba(255,255,255,.16)}html[data-theme='dark'] .qq-note,html[data-theme='dark'] .qq-say{color:#a9a6bd}" +
    "@media (prefers-reduced-motion:reduce){.qq-btn.live,.qq-flash{animation:none}}";
  document.head.appendChild(css);

  function build() {
    var form = $("qc-vitals-form"); if (!form || $("qc-quick")) return;
    var host = form.closest(".card") || form;
    var sec = document.createElement("div");
    sec.className = "card qq"; sec.id = "qc-quick";
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    sec.innerHTML =
      '<h2 style="margin:0 0 2px">⚡ Quick log</h2><div class="qq-note" style="margin:0">Say it, snap your device, or bring readings in from your phone or watch. You always check before saving.</div>' +
      '<div class="qq-row">' +
        '<button type="button" class="qq-btn" id="qq-voice">🎙️ Say it</button>' +
        '<button type="button" class="qq-btn" id="qq-photo">📷 Snap a device</button>' +
        '<button type="button" class="qq-btn" id="qq-import">📲 Import from Apple Health / Google</button>' +
      '</div>' +
      '<div id="qq-voice-area"></div><div id="qq-photo-area" style="display:none"></div><div id="qq-res"></div>' +
      '<input type="file" id="qq-file-cam" accept="image/*" capture="environment" hidden><input type="file" id="qq-file" accept="image/jpeg,image/png,image/webp" hidden>';
    host.parentNode.insertBefore(sec, host);
    $("qq-voice").addEventListener("click", function () { SR ? toggleListen() : showTypeBox(true); });
    $("qq-photo").addEventListener("click", function () { var a = $("qq-photo-area"); a.style.display = a.style.display === "none" ? "" : "none"; if (a.style.display === "") drawPhotoArea(); });
    $("qq-import").addEventListener("click", function () { if (window.QCImport) QCImport.open(); else toast("The importer is still loading. Try again in a moment.", "err"); });
    $("qq-file").addEventListener("change", function (e) { pick(e.target.files && e.target.files[0]); e.target.value = ""; });
    $("qq-file-cam").addEventListener("change", function (e) { pick(e.target.files && e.target.files[0]); e.target.value = ""; });
    if (!SR) showTypeBox(false);
  }

  /* ---------- voice / typed ---------- */
  var rec = null, listening = false, finalText = "";
  function showTypeBox(focus) {
    var a = $("qq-voice-area");
    if (!$("qq-type")) {
      a.innerHTML = '<div class="qq-type" id="qq-type"><input id="qq-text" type="text" maxlength="300" placeholder="Type or paste: BP 120 over 80, pulse 72, sugar 98" aria-label="Describe your readings"><button type="button" class="qq-btn" id="qq-go">Read it</button></div>';
      $("qq-go").addEventListener("click", function () { parse($("qq-text").value); });
      $("qq-text").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); parse($("qq-text").value); } });
    }
    if (focus) $("qq-text").focus();
  }
  function toggleListen() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, btn = $("qq-voice");
    if (listening && rec) { rec.stop(); return; }
    try {
      rec = new SR(); rec.lang = /^hi/i.test(navigator.language || "") ? "hi-IN" : "en-IN"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    } catch (e) { showTypeBox(true); return; }
    finalText = "";
    rec.onstart = function () { listening = true; btn.classList.add("live"); btn.textContent = "⏹ Listening… tap to stop"; $("qq-voice-area").innerHTML = '<div class="qq-say" id="qq-say">Say something like “BP 120 over 80, pulse 72, sugar 98”.</div>'; };
    rec.onresult = function (e) { var t = ""; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; finalText = t; var s = $("qq-say"); if (s) s.textContent = "“" + t + "”"; };
    rec.onerror = function (e) { listening = false; btn.classList.remove("live"); btn.textContent = "🎙️ Say it"; if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone access is blocked. You can type your readings instead.", "err"); showTypeBox(true); };
    rec.onend = function () { listening = false; btn.classList.remove("live"); btn.textContent = "🎙️ Say it"; if (finalText.trim()) { showTypeBox(false); $("qq-text").value = finalText; parse(finalText); } };
    try { rec.start(); } catch (e) { showTypeBox(true); }
  }
  function parse(text) {
    text = (text || "").trim(); if (!text) return;
    $("qq-res").innerHTML = '<div class="qq-res">Reading…</div>';
    post("/vitals/parse", { text: text }).then(function (d) {
      if (d.status === 401) { location.href = "../login/"; return; }
      show(d, "voice");
    });
  }

  /* ---------- photo ---------- */
  function drawPhotoArea() {
    var a = $("qq-photo-area");
    a.innerHTML = '<div class="qq-note" style="margin-top:12px">What are you photographing? Hold the phone straight-on, fill the frame with the display, and avoid glare.</div><div class="qq-chips" id="qq-dev">' +
      DEVICES.map(function (d) { return '<button type="button" class="qq-chip' + (d[0] === device ? " sel" : "") + '" data-d="' + d[0] + '">' + esc(d[1]) + '</button>'; }).join("") + '</div>' +
      '<div class="qq-row" style="margin-top:6px"><button type="button" class="qq-btn" id="qq-cam">📸 Take photo</button><button type="button" class="qq-btn" id="qq-choose">🖼️ Choose photo</button></div>';
    $("qq-dev").addEventListener("click", function (e) { var b = e.target.closest("[data-d]"); if (!b) return; device = b.getAttribute("data-d"); Array.prototype.forEach.call($("qq-dev").children, function (c) { c.classList.toggle("sel", c === b); }); });
    $("qq-cam").addEventListener("click", function () { $("qq-file-cam").click(); });
    $("qq-choose").addEventListener("click", function () { $("qq-file").click(); });
  }
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600, s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b || file); }, "image/jpeg", 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  function pick(file) { if (!file) return; lastFile = file; send(false); }
  function send(allowCloud) {
    if (!lastFile) return;
    $("qq-res").innerHTML = '<div class="qq-res">Reading the display…</div>';
    shrink(lastFile).then(function (blob) {
      var fd = new FormData(); fd.append("photo", blob, "reading.jpg"); fd.append("device", device); if (allowCloud) fd.append("allow_cloud", "1");
      return post("/vitals/photo", fd, true);
    }).then(function (d) { if (d.status === 401) { location.href = "../login/"; return; } cloudAvailable = !!d.cloud_available; show(d, "photo"); });
  }

  /* ---------- show + fill ---------- */
  function show(d, kind) {
    var box = $("qq-res"), r = d.readings || {}, keys = Object.keys(r);
    if (!d.ok || !keys.length) {
      var more = (kind === "photo" && cloudAvailable) ? '<div class="qq-row"><button type="button" class="qq-btn" id="qq-cloud">✨ Try the optional AI reader</button></div><div class="qq-note">This sends the photo to a third-party AI service to read the numbers. It is never used to diagnose anything, and you decide each time.</div>' : "";
      box.innerHTML = '<div class="qq-res bad">' + esc(d.message || "We couldn't find any readings.") + (d.notes && d.notes.length ? '<div class="qq-note">' + d.notes.map(esc).join(" ") + '</div>' : "") + more + '</div>';
      var c = $("qq-cloud"); if (c) c.addEventListener("click", function () { send(true); });
      return;
    }
    box.innerHTML = '<div class="qq-res"><b>' + (kind === "photo" ? "Here's what we read" : "Here's what we heard") + '</b>' + (d.confidence != null && kind === "photo" ? ' <span class="qq-note">(' + (d.confidence >= .8 ? "high" : "medium") + ' confidence)</span>' : "") +
      '<div class="qq-vals">' + keys.map(function (k) { return '<span class="qq-val">' + esc(LABEL[k] || k) + ' ' + esc(r[k]) + '<small>' + esc(UNIT[k] || "") + '</small></span>'; }).join("") + '</div>' +
      (d.notes && d.notes.length ? '<div class="qq-note">' + d.notes.map(esc).join(" ") + '</div>' : "") +
      '<div class="qq-note">We filled them into the form below. Please check they match your device, then press <b>Save reading</b>.</div></div>';
    fill(r);
  }
  function fill(r) {
    var firstEl = null;
    Object.keys(FIELDS).forEach(function (k) {
      if (r[k] == null) return;
      var el = $(FIELDS[k]); if (!el) return;
      el.value = r[k]; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("blur"));
      el.classList.remove("qq-flash"); void el.offsetWidth; el.classList.add("qq-flash"); firstEl = firstEl || el;
    });
    var form = $("qc-vitals-form"); if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
