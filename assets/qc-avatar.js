/* QueroCura profile photo picker: choose or take a photo, drag and zoom to frame it, save.
 *
 *   QCAvatar.open({ onChange })     opens the sheet; onChange(hasPhoto) runs after a save or removal
 *
 * The photo is cropped to a square and shrunk to 512px in the browser before upload (fast on mobile data); the
 * server re-encodes it again to 256px and strips all metadata, so nothing here is trusted.
 * Needs qc-app.js (QC.API_BASE, QC.toast, QC.avatar).
 */
(function () {
  "use strict";
  var QCAvatar = window.QCAvatar = {};
  var API = function () { return (window.QC && QC.API_BASE) || "https://app.querocura.com/api"; };
  var STAGE = 300, OUT = 512, MAX_FILE = 12 * 1024 * 1024;

  var CSS = '' +
    '.qca-back{position:fixed;inset:0;z-index:300;background:rgba(16,14,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;animation:qcaFade .18s ease}' +
    '.qca-sheet{width:min(380px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#100e2a;border-radius:24px;padding:22px 22px 18px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);font-family:"Manrope",sans-serif}' +
    '.qca-sheet h3{margin:0 0 4px;font:700 18px "Space Grotesk","Manrope",sans-serif}.qca-sub{font-size:13px;opacity:.65;line-height:1.5;margin:0 0 14px}' +
    '.qca-stage{position:relative;width:' + STAGE + 'px;max-width:100%;aspect-ratio:1;margin:0 auto 12px;border-radius:50%;overflow:hidden;background:#eef3f2;touch-action:none;cursor:grab;box-shadow:inset 0 0 0 1px rgba(16,14,42,.1)}' +
    '.qca-sheet [hidden]{display:none!important}' +
    '.qca-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);background:#000}' +
    '.qca-stage.drag{cursor:grabbing}.qca-stage canvas{display:block;width:100%;height:100%}' +
    '.qca-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:600;opacity:.6;text-align:center;padding:20px;pointer-events:none}.qca-empty span{font-size:42px}' +
    '.qca-zoom{display:flex;align-items:center;gap:10px;margin:0 6px 14px;font-size:16px}.qca-zoom input{flex:1;accent-color:#0e8f83}' +
    '.qca-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:10px}' +
    '.qca-btn{border:1.5px solid rgba(16,14,42,.16);background:transparent;color:inherit;border-radius:999px;padding:9px 16px;font:700 13px "Manrope",sans-serif;cursor:pointer}.qca-btn:hover{border-color:#0e8f83;color:#0e8f83}' +
    '.qca-btn.primary{background:#0e8f83;border-color:#0e8f83;color:#fff}.qca-btn.primary:hover{background:#0b6f66;color:#fff}.qca-btn.danger:hover{border-color:#d24f28;color:#d24f28}.qca-btn[disabled]{opacity:.45;cursor:not-allowed}' +
    '.qca-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}.qca-priv{font-size:11.5px;opacity:.55;line-height:1.5;margin:10px 0 0;text-align:center}' +
    '@keyframes qcaFade{from{opacity:0}to{opacity:1}}html[data-theme="dark"] .qca-sheet{background:#18162e;color:#f2f0f8}html[data-theme="dark"] .qca-btn{border-color:rgba(255,255,255,.22)}html[data-theme="dark"] .qca-stage{background:#100e2a}' +
    '@media (prefers-reduced-motion:reduce){.qca-back{animation:none}}';
  function injectCss() { if (document.getElementById("qca-css")) return; var s = document.createElement("style"); s.id = "qca-css"; s.textContent = CSS; document.head.appendChild(s); }
  function toast(m, k) { if (window.QC && QC.toast) QC.toast(m, k); }

  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(function () { return viaImage(file); });
    return viaImage(file);
  }
  function viaImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("bad image")); };
      img.src = url;
    });
  }

  QCAvatar.open = function (opts) {
    opts = opts || {};
    injectCss();
    var prevFocus = document.activeElement;
    var back = document.createElement("div");
    back.className = "qca-back";
    back.innerHTML = '<div class="qca-sheet" role="dialog" aria-modal="true" aria-labelledby="qca-h"><h3 id="qca-h">Profile photo</h3>' +
      '<p class="qca-sub">Choose a clear photo of your face. Drag to move it and use the slider to zoom.</p>' +
      '<div class="qca-stage" id="qca-stage"><canvas width="' + STAGE + '" height="' + STAGE + '"></canvas><video id="qca-video" playsinline muted autoplay hidden></video><div class="qca-empty" id="qca-empty"><span>📷</span>Choose or take a photo</div></div>' +
      '<div class="qca-zoom" id="qca-zoomrow" hidden><span aria-hidden="true">🔍</span><input type="range" id="qca-zoom" min="100" max="400" value="100" aria-label="Zoom"></div>' +
      '<div class="qca-row" id="qca-camrow" hidden><button type="button" class="qca-btn primary" id="qca-snap">📸 Capture</button><button type="button" class="qca-btn" id="qca-camoff">Back</button></div>' +
      '<div class="qca-row" id="qca-mainrow"><button type="button" class="qca-btn" id="qca-choose">Choose photo</button><button type="button" class="qca-btn" id="qca-camera">Take photo</button><button type="button" class="qca-btn danger" id="qca-remove" hidden>Remove</button></div>' +
      '<div class="qca-foot"><button type="button" class="qca-btn" id="qca-cancel">Cancel</button><button type="button" class="qca-btn primary" id="qca-save" disabled>Save photo</button></div>' +
      '<p class="qca-priv">Only you see this photo. It is stored securely in your account and never shared.</p>' +
      '<input type="file" id="qca-file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" hidden><input type="file" id="qca-cam" accept="image/*" capture="user" hidden></div>';
    document.body.appendChild(back);
    var $ = function (id) { return back.querySelector("#" + id); };
    var canvas = back.querySelector("canvas"), ctx = canvas.getContext("2d");
    var stage = $("qca-stage"), zoom = $("qca-zoom"), save = $("qca-save");
    var bmp = null, base = 1, scale = 1, ox = 0, oy = 0, changed = false;

    var cached = window.QC && QC.avatar && QC.avatar.cached();
    if (cached) $("qca-remove").hidden = false;

    function clamp() {
      var w = bmp.width * base * scale, h = bmp.height * base * scale;
      ox = Math.min(0, Math.max(STAGE - w, ox)); oy = Math.min(0, Math.max(STAGE - h, oy));
    }
    function draw() {
      ctx.fillStyle = "#eef3f2"; ctx.fillRect(0, 0, STAGE, STAGE);
      if (!bmp) return;
      clamp();
      ctx.drawImage(bmp, ox, oy, bmp.width * base * scale, bmp.height * base * scale);
    }
    function setBitmap(b) {
      bmp = b; base = STAGE / Math.min(b.width, b.height); scale = 1; zoom.value = 100;
      ox = (STAGE - b.width * base) / 2; oy = (STAGE - b.height * base) / 2;
      $("qca-empty").hidden = true; $("qca-zoomrow").hidden = false; save.disabled = false; changed = true; draw();
    }
    function pick(file) {
      if (!file) return;
      if (file.size > MAX_FILE) { toast("That photo is too large. Please choose one under 12 MB.", "err"); return; }
      loadBitmap(file).then(setBitmap, function () { toast("That file doesn't look like a photo we can open. Try a JPEG or PNG.", "err"); });
    }
    $("qca-choose").addEventListener("click", function () { $("qca-file").click(); });
    var video = $("qca-video"), stream = null;
    function stopCam() {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      video.srcObject = null; video.hidden = true; $("qca-camrow").hidden = true; $("qca-mainrow").hidden = false;
      $("qca-empty").hidden = !!bmp; $("qca-zoomrow").hidden = !bmp; save.disabled = !bmp;
    }
    // "Take photo" opens a live camera preview right here. Only if the browser has no camera API (or no camera)
    // do we fall back to the device's own capture picker.
    $("qca-camera").addEventListener("click", function () {
      if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { $("qca-cam").click(); return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }).then(function (s) {
        stream = s; video.srcObject = s; video.hidden = false;
        var p = video.play(); if (p && p.catch) p.catch(function () {});
        $("qca-empty").hidden = true; $("qca-zoomrow").hidden = true; save.disabled = true;
        $("qca-mainrow").hidden = true; $("qca-camrow").hidden = false; $("qca-snap").focus();
      }).catch(function (err) {
        var n = err && err.name;
        if (n === "NotAllowedError" || n === "SecurityError") toast("Camera access is blocked. Allow it in your browser's site settings, or choose a photo instead.", "err");
        else if (n === "NotFoundError" || n === "OverconstrainedError") { toast("No camera found. Choose a photo instead.", "err"); }
        else toast("Couldn't start the camera. Choose a photo instead.", "err");
      });
    });
    $("qca-camoff").addEventListener("click", stopCam);
    $("qca-snap").addEventListener("click", function () {
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) { toast("The camera isn't ready yet. Give it a second.", "err"); return; }
      var side = Math.min(w, h), snap = document.createElement("canvas"); snap.width = snap.height = Math.min(side, 1024);
      var c = snap.getContext("2d");
      c.translate(snap.width, 0); c.scale(-1, 1);                              // mirrored, exactly as shown in the preview
      c.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, snap.width, snap.height);
      stopCam(); setBitmap(snap);
    });
    $("qca-file").addEventListener("change", function (e) { pick(e.target.files[0]); });
    $("qca-cam").addEventListener("change", function (e) { pick(e.target.files[0]); });

    zoom.addEventListener("input", function () {
      if (!bmp) return;
      var old = scale, next = zoom.value / 100, cx = STAGE / 2;     // zoom around the middle of the frame
      ox = cx - (cx - ox) * (next / old); oy = cx - (cx - oy) * (next / old); scale = next; draw();
    });
    var drag = null;
    stage.addEventListener("pointerdown", function (e) { if (!bmp) return; drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy }; stage.classList.add("drag"); stage.setPointerCapture(e.pointerId); });
    stage.addEventListener("pointermove", function (e) {
      if (!drag) return; var k = STAGE / stage.getBoundingClientRect().width;
      ox = drag.ox + (e.clientX - drag.x) * k; oy = drag.oy + (e.clientY - drag.y) * k; draw();
    });
    function endDrag() { drag = null; stage.classList.remove("drag"); }
    stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("wheel", function (e) { if (!bmp) return; e.preventDefault(); zoom.value = Math.min(400, Math.max(100, +zoom.value - e.deltaY / 4)); zoom.dispatchEvent(new Event("input")); }, { passive: false });

    function close() { stopCam(); document.removeEventListener("keydown", onKey); back.remove(); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {} }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "Tab") {                                              // keep keyboard focus inside the sheet
        var f = back.querySelectorAll("button:not([disabled]):not([hidden]),input[type=range]:not([hidden])");
        if (!f.length) return; var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    $("qca-cancel").addEventListener("click", close);
    $("qca-choose").focus();

    $("qca-remove").addEventListener("click", function () {
      var b = $("qca-remove"); b.disabled = true;
      fetch(API() + "/profile/photo", { method: "DELETE", credentials: "include" }).then(function (r) { return r.json(); }).then(function (r) {
        if (!r.ok) throw new Error("failed");
        QC.avatar.set(null); toast("Photo removed.", "ok"); if (opts.onChange) opts.onChange(false); close();
      }).catch(function () { b.disabled = false; toast("Couldn't remove the photo. Please try again.", "err"); });
    });

    save.addEventListener("click", function () {
      if (!bmp || !changed) return;
      save.disabled = true; save.textContent = "Saving…";
      var out = document.createElement("canvas"); out.width = out.height = OUT;
      var k = OUT / STAGE, c2 = out.getContext("2d");
      c2.fillStyle = "#fff"; c2.fillRect(0, 0, OUT, OUT);
      c2.drawImage(bmp, ox * k, oy * k, bmp.width * base * scale * k, bmp.height * base * scale * k);
      out.toBlob(function (blob) {
        if (!blob) { toast("Couldn't prepare that photo.", "err"); save.disabled = false; save.textContent = "Save photo"; return; }
        var fd = new FormData(); fd.append("photo", blob, "profile.jpg");
        fetch(API() + "/profile/photo", { method: "POST", credentials: "include", body: fd }).then(function (r) { return r.json(); }).then(function (r) {
          if (!r.ok) throw new Error(r.message || "failed");
          var thumb = document.createElement("canvas"); thumb.width = thumb.height = 192;       // what the whole site paints: small and instant
          thumb.getContext("2d").drawImage(out, 0, 0, 192, 192);
          QC.avatar.set(thumb.toDataURL("image/jpeg", 0.85), r.v);
          toast("Profile photo updated ✨", "ok"); if (opts.onChange) opts.onChange(true); close();
        }).catch(function (e) { save.disabled = false; save.textContent = "Save photo"; toast((e && e.message && e.message !== "failed") ? e.message : "Couldn't save the photo. Please try again.", "err"); });
      }, "image/jpeg", 0.9);
    });
  };
})();
