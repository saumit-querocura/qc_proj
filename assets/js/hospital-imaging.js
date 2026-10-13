/* QueroCura for Hospitals: imaging studies and AI-assisted reading.
 * Worklist, upload (DICOM, PNG, JPEG), a viewer (zoom, pan, window-like brightness/contrast, invert, finding boxes,
 * side-by-side prior), the AI draft (two readers), finding-by-finding review and the clinician's signed report.
 * The AI never signs anything and nothing unsigned reaches the patient.
 */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function can(p) { return H().can(p); }
  function toast(m, k) { H().P.toast(m, k); }
  var ICON = { xray: "🦴", ct: "🌀", mri: "🧲", us: "🔊", pet: "☢️", mammo: "🎗️", fluoro: "🎞️", other: "🖼️" };
  var STAT = { uploaded: ["Waiting for a read", ""], analysing: ["AI reading…", "wait"], draft: ["AI draft ready", "ok"], failed: ["AI read failed", "bad"], signed: ["Signed", "ok"] };
  var S = { filter: "to_report", settings: null, poll: null, study: null, urls: {}, view: { i: 0, z: 1, x: 0, y: 0, b: 100, c: 100, inv: false, boxes: true, cmp: false, cmpUrl: null, focus: null, measure: false, heat: false, meas: {} } };

  function fetchImage(sid, idx) {
    var key = sid + ":" + idx;
    if (S.urls[key]) return Promise.resolve(S.urls[key]);
    return fetch(H().P.API + "/hospital/imaging/studies/" + encodeURIComponent(sid) + "/images/" + idx, { credentials: "include", cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("image"); return r.blob(); })
      .then(function (b) { var u = URL.createObjectURL(b); S.urls[key] = u; return u; });
  }
  function fetchHeat(sid, idx) {
    var key = sid + ":heat:" + idx;
    if (S.urls[key]) return Promise.resolve(S.urls[key]);
    return fetch(H().P.API + "/hospital/imaging/studies/" + encodeURIComponent(sid) + "/images/" + idx + "/asymmetry", { credentials: "include", cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("heat"); return r.blob(); })
      .then(function (b) { var u = URL.createObjectURL(b); S.urls[key] = u; return u; });
  }

  /* calipers: lengths in millimetres when the DICOM pixel spacing is known, otherwise in image pixels */
  function measLen(m) {
    var im = (S.study.images || [])[S.view.i] || {};
    var dx = (m[2] - m[0]) * (im.width || 1), dy = (m[3] - m[1]) * (im.height || 1);
    if (im.cal) return (Math.sqrt(Math.pow(dx * im.cal.mm_x, 2) + Math.pow(dy * im.cal.mm_y, 2))).toFixed(1) + " mm";
    return Math.round(Math.sqrt(dx * dx + dy * dy)) + " px";
  }
  function drawMeas() {
    var svg = el("img-meas"), lab = el("img-mlabels"); if (!svg) return;
    var list = S.view.meas[S.view.i] || [];
    svg.innerHTML = list.map(function (m) { return '<line x1="' + m[0] * 100 + '" y1="' + m[1] * 100 + '" x2="' + m[2] * 100 + '" y2="' + m[3] * 100 + '" vector-effect="non-scaling-stroke"/>'; }).join("");
    lab.innerHTML = list.map(function (m) { return '<span style="left:' + (m[0] + m[2]) * 50 + "%;top:" + (m[1] + m[3]) * 50 + '%">' + measLen(m) + "</span>"; }).join("");
  }
  function frac(e) {
    var r = el("img-main").getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  function freeImages() { Object.keys(S.urls).forEach(function (k) { URL.revokeObjectURL(S.urls[k]); }); S.urls = {}; }

  /* ---------------------------------------------------------------- worklist */
  function load() {
    var box = el("tab-imaging");
    box.innerHTML = '<div class="empty">Loading imaging…</div>';
    Promise.all([api("/hospital/imaging/settings"), api("/hospital/imaging/studies?status=" + S.filter)]).then(function (res) {
      var st = res[0], li = res[1];
      if (H().guard(st) || H().guard(li)) return;
      if (!st.ok) { box.innerHTML = '<div class="notice bad">' + esc(st.message) + "</div>"; return; }
      S.settings = st;
      var q = st.quality || {};
      var aiState = !st.provider_ready ? '<span class="pill">AI not configured on this server</span>' : st.enabled ? '<span class="pill ok">✓ AI-assisted reading on</span>' : '<span class="pill wait">AI-assisted reading off</span>';
      var h = '<div class="img-head"><div><h2>Imaging</h2><p class="sub">Upload X-ray, CT, MRI, ultrasound, PET and mammography images. An AI can prepare a draft read; a doctor or radiologist reviews every finding and signs the report.</p></div>' +
        '<div class="img-head-r">' + aiState + (can("org") && st.provider_ready ? ' <button class="btn btn-sm btn-ghost" type="button" data-aiset>' + (st.enabled ? "Turn off" : "Turn on") + "</button>" : "") + "</div></div>";
      if (q.studies_with_ai) h += '<div class="img-gov"><span>🧭 <b>How the AI is doing here</b></span><span><b>' + (q.acceptance_rate == null ? "–" : Math.round(q.acceptance_rate * 100) + "%") + "</b> of its findings accepted by your clinicians (" + q.findings_accepted + "/" + (q.findings_accepted + q.findings_rejected) + ")</span>" +
        "<span><b>" + q.critical_confirmed + "/" + q.critical_flags + "</b> critical flags confirmed</span><span><b>" + (q.median_turnaround_min == null ? "–" : q.median_turnaround_min + " min") + "</b> median time to a signed report</span></div>";
      h += '<div class="ops-bar"><div class="chips">' + [["to_report", "To report"], ["signed", "Signed"], ["", "All"]].map(function (f) { return '<button type="button" class="chipbtn' + (S.filter === f[0] ? " on" : "") + '" data-filter="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</div>" +
        (can("imaging") ? '<div class="ops-bar-r"><button class="btn btn-primary btn-sm" type="button" data-new>+ New study</button></div>' : "") + "</div>";
      var items = li.items || [];
      h += items.length ? '<div class="img-list">' + items.map(function (s) {
        var stt = STAT[s.status] || [s.status, ""];
        return '<button type="button" class="img-row' + (s.critical && s.status !== "signed" ? " crit" : "") + '" data-open="' + esc(s.id) + '"><span class="img-ic">' + (ICON[s.modality] || "🖼️") + '</span><span class="grow"><b>' + esc(s.patient_name) + " · " + esc(s.modality_label) + " " + esc(s.region) + "</b>" +
          '<small>' + esc(H().when(s.created_ts)) + " · by " + esc(s.created_by || "") + (s.signed_by ? " · signed by " + esc(s.signed_by) : "") + "</small></span>" +
          (s.critical && s.status !== "signed" ? '<span class="sev sev-emergency">AI critical flag</span>' : "") + '<span class="pill ' + stt[1] + '">' + esc(stt[0]) + "</span></button>";
      }).join("") + "</div>" : '<div class="card ops-empty"><div class="ops-empty-ic">🩻</div><h2>' + (S.filter === "to_report" ? "Nothing waiting to be reported" : "No studies yet") + '</h2><p class="sub">Add a study from here, from a patient\'s visit, or from an imaging order.</p></div>';
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-filter]"))) { S.filter = t.getAttribute("data-filter"); load(); return; }
        if (e.target.closest("[data-new]")) return newStudy({});
        if (e.target.closest("[data-aiset]")) return aiSettings();
        if ((t = e.target.closest("[data-open]"))) openStudy(t.getAttribute("data-open"));
      };
    });
  }

  function aiSettings() {
    var on = S.settings && S.settings.enabled;
    if (on) {
      if (!window.confirm("Turn off AI-assisted reading for your organisation? Studies can still be uploaded, read and signed.")) return;
      return api("/hospital/imaging/settings", { method: "POST", body: { enabled: false } }).then(function (r) { toast(r.message, r.ok ? "" : "err"); load(); });
    }
    modalHtml('<h2 id="ops-title">Turn on AI-assisted reading</h2><div class="img-terms"><p><b>What it does.</b> When a clinician asks, de-identified images, the clinical question, the technique and the patient\'s age and sex are sent to an AI model, which prepares a draft read: a systematic review, findings with locations, a differential and its limits. A second, independent AI pass looks for anything missed.</p>' +
      '<p><b>What it is not.</b> It is not a cleared medical device and is not validated for diagnosis. It can miss findings and can be wrong. It never signs a report: a qualified clinician must review every finding and sign. Unsigned drafts are never shown to patients.</p>' +
      '<p><b>Privacy.</b> DICOM identifiers are removed and photos re-encoded before anything is sent. Where burned-in text can\'t be masked automatically, the person requesting the read must confirm no names or IDs are visible. Patients can turn AI off for their own scans, and every AI read appears in the patient\'s activity log.</p></div>' +
      '<label class="hp-check"><input type="checkbox" id="ai-ack"> <span>I understand, and our clinicians will review and sign every report.</span></label><button class="btn btn-primary" type="button" id="ai-on">Turn on</button><div class="msg" id="ai-msg"></div>');
    el("ai-on").onclick = function () {
      api("/hospital/imaging/settings", { method: "POST", body: { enabled: true, acknowledged: el("ai-ack").checked } }).then(function (r) { if (r.ok) { toast(r.message); closeModal(); load(); } else H().say(el("ai-msg"), r.message, "err"); });
    };
  }
  function modalHtml(html, wide) {
    var back = el("ops-modal"), modal = back.querySelector(".modal");
    modal.classList.toggle("img-modal", !!wide);
    el("ops-body").innerHTML = html; H().P.openModal("ops-modal"); return el("ops-body");
  }
  function closeModal() { H().P.closeModal("ops-modal"); el("ops-modal").querySelector(".modal").classList.remove("img-modal"); }

  /* ---------------------------------------------------------------- new study */
  function newStudy(pre) {
    Promise.all([H().loadRoster(), api("/hospital/imaging/settings")]).then(function (res) {
      var roster = (res[0] || []).filter(function (x) { return x.kind === "grant" && x.state === "active"; });
      var st = res[1].ok ? res[1] : S.settings;
      if (!roster.length) { modalHtml('<h2 id="ops-title">New imaging study</h2><div class="empty">No connected patients. Connect the patient first.</div>'); return; }
      var b = modalHtml('<h2 id="ops-title">New imaging study</h2><p class="sub">DICOM (.dcm), PNG or JPEG, up to 10 files and 30 MB in total. Identifying DICOM tags are removed; CT is shown in the right windows for the region.</p><form id="ns-form" novalidate>' +
        '<div class="grid2"><div class="field"><label for="ns-p">Patient</label><select class="input" id="ns-p">' + roster.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === pre.grant_id ? " selected" : "") + ">" + esc(g.patient_name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ns-prior">Compare with a prior study (optional)</label><select class="input" id="ns-prior"><option value="">None</option></select></div>' +
        '<div class="field"><label for="ns-m">Modality</label><select class="input" id="ns-m"><option value="">Detect from DICOM</option>' + Object.keys(st.modalities).map(function (k) { return '<option value="' + k + '"' + (k === pre.modality ? " selected" : "") + ">" + esc(st.modalities[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ns-r">Region</label><select class="input" id="ns-r">' + st.regions.map(function (r) { return "<option" + (r === pre.region ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select></div></div>" +
        '<div class="field"><label for="ns-q">Clinical question</label><textarea class="input" id="ns-q" rows="2" maxlength="800" placeholder="e.g. Fever and cough for 5 days, crackles right base. Pneumonia? Effusion?">' + esc(pre.indication || "") + '</textarea><span class="hint">The read is reasoned around this question, so a specific one gives a better answer.</span></div>' +
        '<label class="img-drop" id="ns-drop"><input type="file" id="ns-f" multiple accept=".dcm,application/dicom,image/png,image/jpeg"><span>🩻</span><b>Choose or drop images</b><small id="ns-names">DICOM, PNG or JPEG</small></label>' +
        '<label class="hp-check"><input type="checkbox" id="ns-noid"> <span>No patient names, IDs or dates are visible on these images (crop them out if they are).</span></label>' +
        '<button class="btn btn-primary" type="submit" id="ns-go">Upload study</button><div class="msg" id="ns-msg"></div></form>');
      var files = [];
      function setFiles(list) { files = [].slice.call(list || []).slice(0, 10); el("ns-names").textContent = files.length ? files.map(function (f) { return f.name; }).join(", ") : "DICOM, PNG or JPEG"; }
      el("ns-f").onchange = function () { setFiles(this.files); };
      var drop = el("ns-drop");
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
      drop.ondragleave = function () { drop.classList.remove("over"); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); setFiles(e.dataTransfer.files); };
      function priors() {
        api("/hospital/imaging/studies?grant=" + encodeURIComponent(el("ns-p").value)).then(function (r) {
          el("ns-prior").innerHTML = '<option value="">None</option>' + ((r.items || []).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.modality_label + " " + s.region + " · " + new Date(s.created_ts * 1000).toLocaleDateString()) + (s.status === "signed" ? " · signed" : "") + "</option>"; }).join(""));
        });
      }
      el("ns-p").onchange = priors; priors();
      el("ns-form").onsubmit = function (e) {
        e.preventDefault();
        if (!files.length) { H().say(el("ns-msg"), "Choose at least one image.", "err"); return; }
        if (!el("ns-m").value && files.some(function (f) { return !/\.dcm$/i.test(f.name) && f.type !== "application/dicom"; })) { H().say(el("ns-msg"), "Choose the modality: it can only be read automatically from DICOM files.", "err"); el("ns-m").focus(); return; }
        var size = files.reduce(function (a, f) { return a + f.size; }, 0);
        if (size > 30 * 1024 * 1024) { H().say(el("ns-msg"), "That's more than 30 MB. Upload fewer images or export smaller ones.", "err"); return; }
        var fd = new FormData();
        fd.append("grant_id", el("ns-p").value); fd.append("modality", el("ns-m").value); fd.append("region", el("ns-r").value);
        fd.append("indication", el("ns-q").value); fd.append("prior_id", el("ns-prior").value); fd.append("no_identifiers", el("ns-noid").checked ? "1" : "");
        if (pre.order_id) fd.append("order_id", pre.order_id);
        if (pre.encounter_id) fd.append("encounter_id", pre.encounter_id);
        files.forEach(function (f) { fd.append("files", f, f.name); });
        el("ns-go").disabled = true; H().say(el("ns-msg"), "Uploading and de-identifying…");
        fetch(H().P.API + "/hospital/imaging/studies", { method: "POST", credentials: "include", body: fd }).then(function (r) { return r.json(); }).then(function (r) {
          el("ns-go").disabled = false;
          if (!r.ok) { H().say(el("ns-msg"), r.message || "Upload failed.", "err"); return; }
          toast(r.message); openStudy(r.item.id);
          if (window.QCOps && document.querySelector('[data-tab="imaging"].on')) load();
        }, function () { el("ns-go").disabled = false; H().say(el("ns-msg"), "Upload failed. Check your connection.", "err"); });
      };
    });
  }

  /* ---------------------------------------------------------------- the reading workspace */
  function openStudy(sid) {
    clearTimeout(S.poll);
    api("/hospital/imaging/studies/" + encodeURIComponent(sid)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { toast(r.message, "err"); return; }
      if (!S.study || S.study.id !== sid) { freeImages(); S.view = { i: 0, z: 1, x: 0, y: 0, b: 100, c: 100, inv: false, boxes: true, cmp: false, cmpUrl: null, focus: null, measure: false, heat: false, meas: {} }; }
      S.study = r.item;
      render();
      if (r.item.ai_status === "queued" || r.item.ai_status === "running") S.poll = setTimeout(function () { if (el("img-ws")) openStudy(sid); }, 4000);
    });
  }

  function render() {
    var s = S.study, ai = s.ai;
    var tech = Object.keys(s.meta || {}).filter(function (k) { return ["source", "text_masked", "detected_modality"].indexOf(k) < 0; }).map(function (k) { return esc(k.replace(/([a-z])([A-Z])/g, "$1 $2")) + ": " + esc(s.meta[k]); }).join(" · ");
    var qIssues = [];
    (s.images || []).forEach(function (im) { (im.quality.issues || []).forEach(function (x) { if (qIssues.indexOf(x) < 0) qIssues.push(x); }); });
    var h = '<div id="img-ws" class="img-ws"><div class="img-viewer"><div class="img-stage" id="img-stage"><div class="img-canvas" id="img-canvas"><div class="img-frame"><img id="img-main" alt="Study image" draggable="false"><img id="img-heat" class="img-heat" alt="" hidden><div class="img-boxes" id="img-boxes"></div><svg class="img-meas" id="img-meas" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="img-mlabels" id="img-mlabels"></div></div></div>' +
      '<div class="img-cmp" id="img-cmp" hidden><img id="img-prior" alt="Prior study"><span>Prior</span></div><div class="img-label" id="img-label"></div></div>' +
      '<div class="img-tools"><button type="button" data-z="1.25" title="Zoom in">＋</button><button type="button" data-z="0.8" title="Zoom out">－</button><button type="button" data-reset title="Reset">⟲</button>' +
      '<label title="Brightness">☀<input type="range" min="40" max="220" value="' + S.view.b + '" id="vb"></label><label title="Contrast">◐<input type="range" min="40" max="300" value="' + S.view.c + '" id="vc"></label>' +
      '<button type="button" data-inv class="' + (S.view.inv ? "on" : "") + '" title="Invert">⬛⬜</button>' + (ai ? '<button type="button" data-boxes class="' + (S.view.boxes ? "on" : "") + '" title="Show AI findings">▢ Findings</button>' : "") +
      (s.prior_id ? '<button type="button" data-cmp class="' + (S.view.cmp ? "on" : "") + '">⇆ Prior</button>' : "") +
      '<button type="button" data-measure class="' + (S.view.measure ? "on" : "") + '" title="Measure: drag across the image">📏 Measure</button>' +
      (s.pixel_analysis ? '<button type="button" data-heat class="' + (S.view.heat ? "on" : "") + '" title="Left-right asymmetry map (pixel statistics, not AI)">◐ Asymmetry</button>' : "") + "</div>" +
      '<div class="img-thumbs">' + (s.images || []).map(function (im) { return '<button type="button" class="img-th' + (im.idx === S.view.i ? " on" : "") + '" data-i="' + im.idx + '"><img data-src="' + im.idx + '" alt=""><span>' + esc(im.label) + "</span></button>"; }).join("") + "</div></div>";
    // side panel
    h += '<div class="img-side"><div class="img-pt"><span class="img-ic big">' + (ICON[s.modality] || "🖼️") + '</span><div><h2 id="ops-title">' + esc(s.modality_label + " · " + s.region) + '</h2><div class="mini">' + esc(s.patient_name) + " · " + esc(H().when(s.created_ts)) + " · uploaded by " + esc(s.created_by || "") + "</div></div></div>" +
      (s.indication ? '<div class="img-q"><span>Clinical question</span>' + esc(s.indication) + "</div>" : "") + (tech ? '<div class="mini img-tech">' + tech + "</div>" : "") +
      (qIssues.length ? '<div class="img-warn">⚠ Image quality: ' + qIssues.map(esc).join(" ") + "</div>" : "") + (!s.access_active ? '<div class="notice bad">The patient\'s access has ended.</div>' : "");
    h += aiPanel(s);
    h += guidancePanel(s);
    h += pixelPanel(s);
    h += reportPanel(s);
    h += "</div></div>";
    modalHtml(h, true);
    wire();
    showImage(S.view.i);
    [].forEach.call(document.querySelectorAll("[data-src]"), function (im) { fetchImage(s.id, +im.getAttribute("data-src")).then(function (u) { im.src = u; }, function () {}); });
  }

  function aiPanel(s) {
    var ai = s.ai, st = S.settings || {};
    if (s.status === "signed" && !ai) return "";
    if (!ai) {
      if (s.ai_status === "queued" || s.ai_status === "running") {
        return '<div class="img-ai running"><div class="img-steps"><div class="on"><i></i>De-identified images ready</div><div class="' + (s.ai_status === "running" ? "on pulse" : "") + '"><i></i>First reader: systematic review of every area</div><div><i></i>Second reader: looking for misses, challenging each finding</div><div><i></i>Reconciled draft for your review</div></div><p class="mini">This usually takes one to three minutes. You can close this and come back.</p></div>';
      }
      var why = !st.provider_ready ? "AI-assisted reading isn't configured on this server." : !st.enabled ? "An administrator can switch on AI-assisted reading." : !s.ai_allowed ? "This patient has turned off AI help with their scans." : "";
      return '<div class="img-ai"><div class="img-ai-h">🧠 AI-assisted draft</div>' + (s.ai_error ? '<div class="notice bad">' + esc(s.ai_error) + "</div>" : "") +
        (why ? '<p class="mini">' + esc(why) + " You can read and report the study yourself below.</p>" :
          '<p class="mini">Two independent AI passes read the images around your clinical question: a systematic first read, then a second reader that hunts for misses and challenges every finding. You review and sign.</p>' +
          (can("imaging") ? '<button class="btn btn-primary" type="button" data-ai>Ask AI for a draft read</button>' : "")) + "</div>";
    }
    var dec = s.decisions || {}, signer = can("imaging_sign") && s.status !== "signed";
    var sevRank = { critical: 0, significant: 1, minor: 2, incidental: 3 };
    var fs = ai.findings.slice().sort(function (a, b) { return sevRank[a.severity] - sevRank[b.severity]; });
    var notes = {};
    (ai.review_notes || []).forEach(function (n) { notes[n.finding_id] = n; });
    var h = '<div class="img-ai done"><div class="img-ai-h">🧠 AI draft <span class="mini">· not a report · ' + esc(s.ai_model || "") + " · " + esc(H().when(s.ai_done_ts)) + "</span></div>";
    if (ai.critical_alert.present) h += '<div class="img-crit" role="alert">🚨 <b>Possible critical finding:</b> ' + esc(ai.critical_alert.reason) + ". Confirm on the images and act on it now if you agree.</div>";
    if (ai.reliability) {
      var rl = ai.reliability;
      h += '<div class="img-rel ' + rl.band + '"><div class="img-rel-s"><b>' + rl.score + '</b><span>/100</span></div><div class="grow"><b>Draft reliability: ' + esc(rl.band) + "</b>" +
        '<div class="img-rel-bar"><i style="width:' + rl.score + '%"></i></div><div class="mini">' + rl.why.map(esc).join(" · ") + "</div></div></div>";
    }
    var q = ai.quality;
    h += '<div class="img-qa ' + (q.adequate && q.matches_request ? "ok" : "bad") + '">' + (q.adequate ? "✓ Diagnostic quality" : "⚠ Limited quality") + " · " + esc([q.identified_modality, q.identified_region, q.views].filter(Boolean).join(", ")) + (q.matches_request ? "" : " · <b>does not match the request</b>") + (q.issues.length ? '<div class="mini">' + q.issues.map(esc).join(" ") + "</div>" : "") + "</div>";
    if (ai.answer_to_clinical_question) h += '<div class="img-answer"><span>Answer to the clinical question</span>' + esc(ai.answer_to_clinical_question) + "</div>";
    h += '<div class="img-sec"><div class="ops-h">Findings · ' + fs.length + (signer ? " · accept or reject each" : "") + "</div>" + (fs.length ? fs.map(function (f) {
      var n = notes[f.id], d = dec[f.id] || "";
      return '<div class="img-f sev-' + f.severity + (d ? " " + d : "") + (S.view.focus === f.id ? " focus" : "") + '" data-f="' + esc(f.id) + '"><div class="img-f-t"><span class="sev sev-' + (f.severity === "critical" ? "emergency" : f.severity === "significant" ? "urgent" : "warning") + '">' + esc(f.severity) + "</span><b>" + esc(f.title) + "</b>" +
        '<span class="img-conf" title="AI confidence"><i style="width:' + Math.round(f.confidence * 100) + '%"></i></span><small>' + Math.round(f.confidence * 100) + "%</small></div>" +
        '<div class="img-f-d">' + esc(f.description) + "</div>" + (f.location ? '<div class="mini">📍 ' + esc(f.location) + (f.image_index != null ? " · image " + (f.image_index + 1) : "") + (f.measurements ? " · " + esc(f.measurements) : "") + "</div>" : "") +
        (f.evidence ? '<div class="mini">🔎 ' + esc(f.evidence) + "</div>" : "") +
        '<div class="img-badges">' + (f.consensus === "both" ? '<span class="ib both">✓✓ Both readers</span>' : f.consensus === "both_revised" ? '<span class="ib both">✓✓ Both readers (revised)</span>' : f.consensus === "second_only" ? '<span class="ib one">2nd reader only</span>' : "") +
        (f.pixel_support ? '<span class="ib px">◐ Asymmetry map agrees</span>' : "") + (f.box_mm ? '<span class="ib mm">📏 box ≈ ' + f.box_mm[0] + " × " + f.box_mm[1] + " mm</span>" : "") +
        (f.classification ? '<span class="ib gl">📘 ' + esc(f.classification.system.toUpperCase()) + "</span>" : "") + "</div>" + (n ? '<div class="img-note ' + n.action + '">2nd reader ' + esc(n.action) + (n.reason ? ": " + esc(n.reason) : "") + "</div>" : "") +
        '<div class="img-f-a">' + (f.image_index != null ? '<button type="button" class="btn btn-sm btn-ghost" data-show="' + esc(f.id) + '">Show on image</button>' : "") +
        (signer ? '<button type="button" class="btn btn-sm' + (d === "accepted" ? " btn-primary" : "") + '" data-dec="accepted" data-id="' + esc(f.id) + '">✓ Accept</button><button type="button" class="btn btn-sm' + (d === "rejected" ? " btn-danger" : "") + '" data-dec="rejected" data-id="' + esc(f.id) + '">✕ Reject</button>' : (d ? '<span class="pill ' + (d === "accepted" ? "ok" : "bad") + '">' + esc(d) + "</span>" : "")) + "</div></div>";
    }).join("") : '<div class="mini">No findings reported.</div>') + "</div>";
    if (ai.impression.length) h += '<div class="img-sec"><div class="ops-h">Impression</div><ol class="img-imp">' + ai.impression.map(function (i) { return "<li>" + esc(i.text) + ' <span class="mini">(' + Math.round(i.confidence * 100) + "%)</span></li>"; }).join("") + "</ol></div>";
    if (ai.differential.length) h += '<div class="img-sec"><div class="ops-h">Differential</div>' + ai.differential.map(function (d) {
      return '<div class="img-dd"><b>' + esc(d.diagnosis) + '</b> <span class="pill ' + (d.likelihood === "high" ? "ok" : d.likelihood === "low" ? "" : "wait") + '">' + esc(d.likelihood) + "</span>" +
        (d["for"].length ? '<div class="mini">For: ' + d["for"].map(esc).join("; ") + "</div>" : "") + (d.against.length ? '<div class="mini">Against: ' + d.against.map(esc).join("; ") + "</div>" : "") + "</div>";
    }).join("") + "</div>";
    if (ai.comparison) h += '<div class="img-sec"><div class="ops-h">Comparison with prior</div><div class="mini">' + esc(ai.comparison) + "</div></div>";
    if (ai.systematic_review.length) h += '<details class="img-sec"><summary class="ops-h">Systematic review (' + ai.systematic_review.length + ' areas)</summary><div class="img-sys">' + ai.systematic_review.map(function (r) { return '<div class="' + r.status + '"><b>' + esc(r.area) + "</b><span>" + esc(r.status.replace("_", " ")) + "</span><small>" + esc(r.note) + "</small></div>"; }).join("") + "</div></details>";
    if (ai.agreement != null || (ai.first_read && ai.first_read.finding_titles)) h += '<details class="img-sec"><summary class="ops-h">How the two readers compared' + (ai.agreement != null ? " · " + Math.round(ai.agreement * 100) + "% agreement" : "") + "</summary>" +
      '<div class="mini">First reader saw: ' + (ai.first_read.finding_titles.map(esc).join("; ") || "nothing") + "</div>" + (ai.review_notes || []).map(function (n) { return '<div class="img-note ' + n.action + '">' + esc(n.finding_id) + " " + esc(n.action) + ": " + esc(n.reason) + "</div>"; }).join("") + "</details>";
    if (ai.recommendations.length) h += '<div class="img-sec"><div class="ops-h">Suggested next steps</div><ul class="img-ul">' + ai.recommendations.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul></div>";
    if (ai.limitations.length) h += '<div class="img-sec"><div class="ops-h">Limits of this read</div><ul class="img-ul lim">' + ai.limitations.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul></div>";
    h += '<p class="mini img-disc">An AI draft for a qualified clinician to verify. It can miss findings and can be wrong, and it is not a cleared medical device. Nothing here reaches the patient until a clinician signs a report.</p></div>';
    return h;
  }

  /* ---- follow-up guidance from published rules (Fleischner, BI-RADS, Bosniak, TI-RADS, AAA) ---- */
  function guidancePanel(s) {
    var g = s.guidance || [];
    if (!g.length) return "";
    var signer = can("imaging_sign") && s.status !== "signed";
    return '<div class="img-gl"><div class="img-ai-h">📘 Follow-up guidance <span class="mini">· rule-based, from published guidelines</span></div>' + g.map(function (x) {
      var inp = x.inputs || {};
      var form = "";
      if (signer && !x.not_applicable) {
        if (x.key === "fleischner") form = '<div class="img-gl-f"><label>Size <input class="input" data-g="size_mm" value="' + esc(inp.size_mm == null ? "" : inp.size_mm) + '" inputmode="decimal"> mm</label>' +
          '<label>Type <select class="input" data-g="nodule_type">' + ["solid", "part-solid", "ground-glass"].map(function (t) { return "<option" + (t === inp.type ? " selected" : "") + ">" + t + "</option>"; }).join("") + "</select></label>" +
          '<label>Number <select class="input" data-g="multiplicity"><option value="single"' + (inp.multiple ? "" : " selected") + '>single</option><option value="multiple"' + (inp.multiple ? " selected" : "") + ">multiple</option></select></label>" +
          '<label>Risk <select class="input" data-g="risk"><option value="">unknown</option><option value="low"' + (inp.risk === "low" ? " selected" : "") + '>low</option><option value="high"' + (inp.risk === "high" ? " selected" : "") + ">high</option></select></label>";
        else if (x.key === "ti-rads") form = '<div class="img-gl-f"><label>Level <input class="input" data-g="category" value="' + esc(inp.level || "") + '" placeholder="TR4"></label><label>Size <input class="input" data-g="size_mm" value="' + esc(inp.size_mm == null ? "" : inp.size_mm) + '" inputmode="decimal"> mm</label>';
        else if (x.key === "aaa") form = '<div class="img-gl-f"><label>Diameter <input class="input" data-g="size_mm" value="' + esc(inp.diameter_mm == null ? "" : inp.diameter_mm) + '" inputmode="decimal"> mm</label>';
        else form = '<div class="img-gl-f"><label>Category <input class="input" data-g="category" value="' + esc(inp.category || "") + '"></label>';
        form += '<button type="button" class="btn btn-sm" data-glcalc="' + esc(x.finding_id) + '">Recalculate</button></div>';
      }
      return '<div class="img-gl-c' + (x.needs ? " needs" : "") + (x.not_applicable ? " na" : "") + '" data-gl="' + esc(x.finding_id) + '"><div class="mini">' + esc(x.finding) + " · <b>" + esc(x.system) + "</b>" + (x.category_meaning ? " · " + esc(x.category_meaning) : "") + "</div>" +
        '<div class="img-gl-r">' + esc(x.recommendation) + "</div>" + (x.risk_note && x.needs ? '<div class="mini">' + esc(x.risk_note) + "</div>" : "") +
        (x.size_source ? '<div class="mini">Size ' + esc(x.size_source) + (x.size_source !== "reported" ? ": check it with the calipers" : "") + ".</div>" : "") +
        (x.applies_to ? '<div class="mini">Applies to: ' + esc(x.applies_to) + "</div>" : "") + form + "</div>";
    }).join("") + '<p class="mini">Accepted findings with complete inputs are added to the report under "Follow-up guidance".</p></div>';
  }

  /* ---- local pixel analysis (no AI) ---- */
  function pixelPanel(s) {
    var spots = [];
    (s.images || []).forEach(function (im) { if (im.asym) spots.push(im); });
    if (!spots.length) return "";
    var cur = spots[0].asym;
    return '<details class="img-sec img-px"><summary class="ops-h">◐ Asymmetry map · ' + esc(cur.level) + " (" + cur.score + ")</summary>" +
      '<p class="mini">Each region is compared with its mirror image across the midline. On the overlay, warm colours mark the side that is denser (brighter) than its mirror and cool colours the side that is darker; you decide which side is abnormal. The strongest regions are outlined in purple and handed to the second AI reader to double-check. ' + esc(cur.caveat) + "</p>" +
      spots.map(function (im) { return '<div class="mini">Image ' + (im.idx + 1) + " (" + esc(im.label) + "): " + (im.asym.hotspots.length ? im.asym.hotspots.length + " region" + (im.asym.hotspots.length > 1 ? "s" : "") + ", strongest on the image " + esc(im.asym.hotspots[0].side_of_image) : "no strong asymmetry") + "</div>"; }).join("") + "</details>";
  }

  function reportPanel(s) {
    if (s.status === "signed") {
      return '<div class="img-rep signed"><div class="img-ai-h">✍️ Signed report <span class="mini">· ' + esc(s.signed_by) + " · " + esc(H().when(s.signed_ts)) + '</span></div><pre class="img-pre">' + esc(s.report) + "</pre>" +
        (s.addenda || []).map(function (a) { return '<div class="img-add"><b>Addendum · ' + esc(a.by) + " · " + esc(H().when(a.ts)) + "</b><div>" + esc(a.text) + "</div></div>"; }).join("") +
        (can("imaging_sign") ? '<div class="field" style="margin-top:10px"><label for="img-add">Add an addendum</label><textarea class="input" id="img-add" rows="2" maxlength="3000"></textarea></div><button class="btn btn-sm" type="button" data-addendum>Add addendum</button>' : "") + "</div>";
    }
    if (!can("imaging_sign")) return '<div class="img-rep"><p class="mini">A doctor or radiologist will review and sign the report.</p></div>';
    var undecided = s.ai ? s.ai.findings.filter(function (f) { return !(s.decisions || {})[f.id]; }).length : 0;
    return '<div class="img-rep"><div class="img-ai-h">✍️ Your report</div>' + (s.ai ? '<p class="mini">' + (undecided ? undecided + " finding" + (undecided > 1 ? "s" : "") + " still to accept or reject. " : "") + 'Build the report from the findings you accepted, then edit it freely.</p><button class="btn btn-sm" type="button" data-build>Build from accepted findings</button>' : "") +
      '<textarea class="input mono" id="img-report" rows="12" maxlength="12000" placeholder="EXAMINATION:\nCLINICAL QUESTION:\nTECHNIQUE:\n\nFINDINGS:\n\nIMPRESSION:">' + "</textarea>" +
      '<button class="btn btn-primary" type="button" data-sign>Sign report</button><div class="msg" id="img-msg"></div><p class="mini">Signing files the report in the patient\'s QueroCura record (if they allowed records) and completes any linked imaging order.</p></div>';
  }

  /* ---------------------------------------------------------------- viewer */
  /* size the image to fit the stage exactly, so the frame (and every box, caliper and overlay laid on it in
     percentages) has the image's own shape */
  function fit() {
    var c = el("img-canvas"), im = el("img-main");
    if (!c || !im || !im.naturalWidth) return;
    var k = Math.min(c.clientWidth / im.naturalWidth, c.clientHeight / im.naturalHeight);
    im.style.maxWidth = im.style.maxHeight = "none";
    im.style.width = Math.max(1, Math.floor(im.naturalWidth * k)) + "px";
    im.style.height = Math.max(1, Math.floor(im.naturalHeight * k)) + "px";
  }
  window.addEventListener("resize", function () { if (el("img-main")) fit(); });

  function apply() {
    var v = S.view, c = el("img-canvas"); if (!c) return;
    c.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.z + ")";
    var f = "brightness(" + v.b + "%) contrast(" + v.c + "%)" + (v.inv ? " invert(1)" : "");
    el("img-main").style.filter = f;
    var p = el("img-prior"); if (p) p.style.filter = f;
  }
  function showImage(i) {
    var s = S.study, v = S.view; v.i = i;
    [].forEach.call(document.querySelectorAll(".img-th"), function (t) { t.classList.toggle("on", +t.getAttribute("data-i") === i); });
    var im = (s.images || [])[i];
    el("img-label").textContent = im ? (i + 1) + " / " + s.images.length + " · " + im.label : "";
    fetchImage(s.id, i).then(function (u) { var m = el("img-main"); m.onload = fit; m.src = u; if (m.complete) fit(); }, function () { el("img-label").textContent = "Couldn't load the image."; });
    var bx = el("img-boxes");
    bx.innerHTML = (s.ai && v.boxes ? s.ai.findings.filter(function (f) { return f.image_index === i && f.box; }).map(function (f) {
      return '<div class="img-box sev-' + f.severity + (v.focus === f.id ? " focus" : "") + '" style="left:' + f.box[0] * 100 + "%;top:" + f.box[1] * 100 + "%;width:" + (f.box[2] - f.box[0]) * 100 + "%;height:" + (f.box[3] - f.box[1]) * 100 + '%"><span>' + esc(f.title) + (f.box_mm ? " · ≈" + f.box_mm[0] + "×" + f.box_mm[1] + " mm" : "") + "</span></div>";
    }).join("") : "") + (v.heat && im && im.asym ? im.asym.hotspots.map(function (h, k) {
      var b = h.box;
      return '<div class="img-box asym" style="left:' + b[0] * 100 + "%;top:" + b[1] * 100 + "%;width:" + (b[2] - b[0]) * 100 + "%;height:" + (b[3] - b[1]) * 100 + '%"><span>asymmetry ' + (k + 1) + "</span></div>";
    }).join("") : "");
    var hm = el("img-heat");
    H().show(hm, !!(v.heat && im && im.asym));
    if (v.heat && im && im.asym) fetchHeat(s.id, i).then(function (u) { hm.src = u; }, function () { H().show(hm, false); });
    drawMeas();
    apply();
  }
  function wire() {
    var stage = el("img-stage"), v = S.view, drag = null;
    stage.onwheel = function (e) { e.preventDefault(); v.z = Math.min(8, Math.max(0.5, v.z * (e.deltaY < 0 ? 1.12 : 0.89))); apply(); };
    var mline = null;
    stage.onpointerdown = function (e) {
      stage.setPointerCapture(e.pointerId);
      if (v.measure) { var p = frac(e); mline = [p[0], p[1], p[0], p[1]]; (v.meas[v.i] = v.meas[v.i] || []).push(mline); drawMeas(); return; }
      drag = { x: e.clientX - v.x, y: e.clientY - v.y };
    };
    stage.onpointermove = function (e) {
      if (mline) { var p = frac(e); mline[2] = p[0]; mline[3] = p[1]; drawMeas(); return; }
      if (!drag) return; v.x = e.clientX - drag.x; v.y = e.clientY - drag.y; apply();
    };
    stage.onpointerup = function () {
      if (mline && Math.abs(mline[2] - mline[0]) + Math.abs(mline[3] - mline[1]) < 0.01) { v.meas[v.i].pop(); drawMeas(); }
      mline = null; drag = null;
    };
    el("vb").oninput = function () { v.b = +this.value; apply(); };
    el("vc").oninput = function () { v.c = +this.value; apply(); };
    var ws = el("img-ws");
    ws.onclick = function (e) {
      var t;
      if ((t = e.target.closest("[data-z]"))) { v.z = Math.min(8, Math.max(0.5, v.z * +t.getAttribute("data-z"))); apply(); return; }
      if (e.target.closest("[data-reset]")) { v.z = 1; v.x = 0; v.y = 0; v.b = 100; v.c = 100; v.inv = false; el("vb").value = 100; el("vc").value = 100; apply(); return; }
      if ((t = e.target.closest("[data-inv]"))) { v.inv = !v.inv; t.classList.toggle("on", v.inv); apply(); return; }
      if ((t = e.target.closest("[data-boxes]"))) { v.boxes = !v.boxes; t.classList.toggle("on", v.boxes); showImage(v.i); return; }
      if ((t = e.target.closest("[data-cmp]"))) { v.cmp = !v.cmp; t.classList.toggle("on", v.cmp); compare(); return; }
      if ((t = e.target.closest("[data-measure]"))) {
        if (v.measure && (v.meas[v.i] || []).length && window.confirm("Clear the measurements on this image?")) v.meas[v.i] = [];
        v.measure = !v.measure; t.classList.toggle("on", v.measure); el("img-stage").classList.toggle("measuring", v.measure); drawMeas(); return;
      }
      if ((t = e.target.closest("[data-heat]"))) { v.heat = !v.heat; t.classList.toggle("on", v.heat); showImage(v.i); return; }
      if ((t = e.target.closest("[data-glcalc]"))) return recalc(t.getAttribute("data-glcalc"));
      if ((t = e.target.closest("[data-i]"))) { showImage(+t.getAttribute("data-i")); return; }
      if ((t = e.target.closest("[data-show]"))) {
        var f = S.study.ai.findings.filter(function (x) { return x.id === t.getAttribute("data-show"); })[0];
        v.focus = f.id; v.boxes = true;
        if (f.box) { v.z = Math.min(3, 0.6 / Math.max(f.box[2] - f.box[0], f.box[3] - f.box[1], 0.2)); var r = stage.getBoundingClientRect(); v.x = (0.5 - (f.box[0] + f.box[2]) / 2) * r.width * v.z; v.y = (0.5 - (f.box[1] + f.box[3]) / 2) * r.height * v.z; }
        [].forEach.call(document.querySelectorAll(".img-f"), function (n) { n.classList.toggle("focus", n.getAttribute("data-f") === f.id); });
        showImage(f.image_index); return;
      }
      if ((t = e.target.closest("[data-dec]"))) return decide(t.getAttribute("data-id"), t.getAttribute("data-dec"));
      if (e.target.closest("[data-ai]")) return askAI(false);
      if (e.target.closest("[data-build]")) return api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/draft-report").then(function (r) { if (r.ok) { el("img-report").value = r.report; el("img-report").focus(); } else toast(r.message, "err"); });
      if (e.target.closest("[data-sign]")) return signIt();
      if (e.target.closest("[data-addendum]")) return api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/addendum", { method: "POST", body: { text: el("img-add").value } }).then(function (r) { toast(r.message, r.ok ? "" : "err"); if (r.ok) openStudy(S.study.id); });
    };
  }
  function recalc(fid) {
    var card = document.querySelector('[data-gl="' + fid + '"]'), vals = {};
    [].forEach.call(card.querySelectorAll("[data-g]"), function (i) { vals[i.getAttribute("data-g")] = i.value; });
    api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/guidance", { method: "POST", body: { finding_id: fid, values: vals } }).then(function (r) {
      if (!r.ok) { toast(r.message, "err"); return; }
      S.study.guidance = r.items;
      var keep = el("img-report") ? el("img-report").value : "";
      render(); if (el("img-report")) el("img-report").value = keep;
      toast("Guidance updated.");
    });
  }

  function compare() {
    var box = el("img-cmp"), s = S.study;
    H().show(box, S.view.cmp);
    el("img-stage").classList.toggle("split", S.view.cmp);
    fit();
    if (S.view.cmp && s.prior_id) fetchImage(s.prior_id, 0).then(function (u) { el("img-prior").src = u; apply(); }, function () { box.querySelector("span").textContent = "Prior image unavailable"; });
  }
  function decide(fid, d) {
    var cur = (S.study.decisions || {})[fid];
    var next = cur === d ? "" : d;
    api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/findings/" + encodeURIComponent(fid), { method: "POST", body: { decision: next } }).then(function (r) {
      if (!r.ok) { toast(r.message, "err"); return; }
      S.study.decisions = S.study.decisions || {};
      if (next) S.study.decisions[fid] = next; else delete S.study.decisions[fid];
      var keep = el("img-report") ? el("img-report").value : "";
      render(); if (el("img-report")) el("img-report").value = keep;
    });
  }
  function askAI(confirmed) {
    api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/ai", { method: "POST", body: { confirm_no_identifiers: !!confirmed } }).then(function (r) {
      if (r.code === "confirm_identifiers") {
        if (window.confirm(r.message + "\n\nI've checked: no names, IDs or dates are visible.")) askAI(true);
        return;
      }
      toast(r.message, r.ok ? "" : "err");
      if (r.ok) openStudy(S.study.id);
    });
  }
  function signIt() {
    var text = el("img-report").value;
    if (!window.confirm("Sign this report? It will be filed in the patient's record under your name.")) return;
    api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/sign", { method: "POST", body: { report: text } }).then(function (r) {
      if (r.ok) { toast(r.message); openStudy(S.study.id); } else H().say(el("img-msg"), r.message, "err");
    });
  }

  window.QCImaging = { load: load, newStudy: newStudy, open: openStudy, leave: function () { clearTimeout(S.poll); } };
})();
