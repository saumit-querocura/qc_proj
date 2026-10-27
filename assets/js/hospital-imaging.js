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
  var ICON = { xray: "🦴", ct: "🌀", mri: "🧲", us: "🔊", pet: "☢️", mammo: "🎗️", fluoro: "🎞️", ecg: "💓", echo: "🫀", dental: "🦷", fundus: "👁️", derm: "🩹",
    endo: "🔦", dexa: "🦴", nm: "☢️", ctg: "🤰", path: "🔬", other: "🖼️" };
  var PRI = { stat: ["STAT", "emergency"], urgent: ["Urgent", "urgent"], routine: ["Routine", ""] };
  function dur(m) { m = Math.round(m); return m < 60 ? m + " min" : m < 1440 ? Math.floor(m / 60) + " h" + (m % 60 && m < 600 ? " " + (m % 60) + " min" : "") : Math.floor(m / 1440) + " days"; }
  var STAT = { uploaded: ["Waiting for a read", ""], analysing: ["AI reading…", "wait"], draft: ["AI draft ready", "ok"], failed: ["AI read failed", "bad"], signed: ["Signed", "ok"] };
  var S = { filter: "to_report", mod: "", settings: null, poll: null, study: null, urls: {}, stack: { on: false, k: 0, n: 0 }, view: { i: 0, z: 1, x: 0, y: 0, b: 100, c: 100, inv: false, boxes: true, cmp: false, cmpUrl: null, focus: null, measure: false, heat: false, meas: {} } };

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
    var q = S.filter === "mine" ? "status=to_report&mine=1" : "status=" + S.filter;
    Promise.all([api("/hospital/imaging/settings"), api("/hospital/imaging/studies?" + q + (S.mod ? "&modality=" + S.mod : ""))]).then(function (res) {
      var st = res[0], li = res[1];
      if (H().guard(st) || H().guard(li)) return;
      if (!st.ok) { box.innerHTML = '<div class="notice bad">' + esc(st.message) + "</div>"; return; }
      S.settings = st;
      var q = st.quality || {};
      var where = st.mode === "local" ? "on-premise " : st.mode === "hybrid" ? "on-premise + cloud " : "";
      var aiState = !st.provider_ready ? '<span class="pill">AI not configured on this server</span>' : st.enabled ? '<span class="pill ok">✓ ' + where + 'AI-assisted reading on</span>' : '<span class="pill wait">AI-assisted reading off</span>';
      var h = engineStrip(st) + '<div class="img-head"><div><h2>Imaging</h2><p class="sub">X-ray, CT and MRI (single images or whole series), ultrasound, mammography, PET and nuclear medicine, ECG, echo, dental, retinal and skin photos, endoscopy, DEXA and CTG. An AI can prepare a draft read; a doctor or radiologist reviews every finding and signs the report.</p></div>' +
        '<div class="img-head-r">' + aiState + (can("org") && st.provider_ready ? ' <button class="btn btn-sm btn-ghost" type="button" data-aiset>' + (st.enabled ? "Turn off" : "Turn on") + "</button>" : "") + "</div></div>";
      if (q.studies_with_ai) h += '<div class="img-gov"><span>🧭 <b>How the AI is doing here</b></span><span><b>' + (q.acceptance_rate == null ? "–" : Math.round(q.acceptance_rate * 100) + "%") + "</b> of its findings accepted by your clinicians (" + q.findings_accepted + "/" + (q.findings_accepted + q.findings_rejected) + ")</span>" +
        "<span><b>" + q.critical_confirmed + "/" + q.critical_flags + "</b> critical flags confirmed</span><span><b>" + (q.median_turnaround_min == null ? "–" : q.median_turnaround_min + " min") + "</b> median time to a signed report</span></div>";
      var cn = li.counts || {};
      if (cn.critical_not_told) h += '<div class="notice bad">🚨 <b>' + cn.critical_not_told + " critical result" + (cn.critical_not_told > 1 ? "s" : "") + "</b> not yet told to the treating team. Open " + (cn.critical_not_told > 1 ? "them" : "it") + ', confirm, and record the call.</div>';
      var chips = [["to_report", "To report", cn.open], ["mine", "Mine", cn.mine], ["unassigned", "Unassigned", cn.unassigned], ["critical", "Critical", cn.critical], ["signed", "Signed"], ["", "All"]];
      h += '<div class="ops-bar"><div class="chips">' + chips.map(function (f) { return '<button type="button" class="chipbtn' + (S.filter === f[0] ? " on" : "") + (f[0] === "critical" && f[2] ? " er" : "") + '" data-filter="' + f[0] + '">' + f[1] + (f[2] ? ' <span class="n">' + f[2] + "</span>" : "") + "</button>"; }).join("") + "</div>" +
        '<div class="ops-bar-r">' + (cn.overdue ? '<span class="ops-stat warn"><b>' + cn.overdue + "</b> past target</span>" : "") + (cn.stat ? '<span class="ops-stat warn"><b>' + cn.stat + "</b> STAT</span>" : "") +
        '<select class="input input-sm" id="img-mod" aria-label="Kind of scan"><option value="">All kinds</option>' + Object.keys(st.modalities).map(function (k) { return '<option value="' + k + '"' + (S.mod === k ? " selected" : "") + ">" + esc(st.modalities[k]) + "</option>"; }).join("") + "</select>" +
        (can("imaging") ? '<button class="btn btn-primary btn-sm" type="button" data-new>+ New study</button>' : "") + "</div></div>";
      var items = li.items || [];
      h += items.length ? '<div class="img-list">' + items.map(function (s) {
        var stt = STAT[s.status] || [s.status, ""];
        var pr = PRI[s.priority] || PRI.routine, open = s.status !== "signed";
        return '<button type="button" class="img-row' + (s.critical && open ? " crit" : "") + (s.overdue_min > 0 && open ? " late" : "") + '" data-open="' + esc(s.id) + '"><span class="img-ic">' + (ICON[s.modality] || "🖼️") + '</span><span class="grow"><b>' + esc(s.patient_name) + " · " + esc(s.modality_label) + " " + esc(s.region) + "</b>" +
          '<small>' + esc(H().when(s.created_ts)) + " · by " + esc(s.created_by || "") + (s.assigned_name && open ? " · 👤 " + esc(s.assigned_name) : "") + (s.signed_by ? " · signed by " + esc(s.signed_by) : "") +
          (s.overdue_min > 0 && open ? ' · <b class="late">' + dur(s.overdue_min) + " past target</b>" : "") + (s.peer ? " · peer " + ["", "✓ agree", "minor", "⚠ significant"][s.peer.score] : "") + "</small></span>" +
          (open && s.priority !== "routine" ? '<span class="sev sev-' + pr[1] + '">' + pr[0] + "</span>" : "") +
          (s.critical && open ? '<span class="sev sev-emergency">' + (s.communicated ? "Critical · told" : "Critical · not yet told") + "</span>" : "") + '<span class="pill ' + stt[1] + '">' + esc(s.ai_status === "needs_type" ? "Choose the scan type" : stt[0]) + "</span></button>";
      }).join("") + "</div>" : '<div class="card ops-empty"><div class="ops-empty-ic">🩻</div><h2>' + (S.filter === "to_report" ? "Nothing waiting to be reported" : "No studies yet") + '</h2><p class="sub">Add a study from here, from a patient\'s visit, or from an imaging order.</p></div>';
      box.innerHTML = h;
      box.onclick = function (e) {
        var t;
        if ((t = e.target.closest("[data-filter]"))) { S.filter = t.getAttribute("data-filter"); load(); return; }
        if (e.target.id === "img-mod") return;
        if (e.target.closest("[data-new]")) return newStudy({});
        if (e.target.closest("[data-aiset]")) return aiSettings();
        if ((t = e.target.closest("[data-open]"))) openStudy(t.getAttribute("data-open"));
      };
      var ms = el("img-mod"); if (ms) ms.onchange = function () { S.mod = this.value; load(); };
    });
  }

  /* the on-premise engine: which models are installed, validated here, and how they're doing */
  function engineStrip(st) {
    if (!st.engine || st.mode !== "local" && st.mode !== "hybrid") return "";
    var ms = st.engine.models || {}, perf = {};
    (st.engine.performance || []).forEach(function (p) { perf[p.model] = p; });
    return '<details class="img-engine"><summary>🖥️ <b>On-premise AI</b> · runs on your own server, images never leave it · ' + Object.keys(ms).filter(function (k) { return ms[k].ready; }).length + " model(s) ready</summary>" +
      '<div class="img-engine-list">' + Object.keys(ms).map(function (k) {
        var m = ms[k], p = perf[k];
        return '<div class="img-engine-m' + (m.ready ? "" : " off") + '"><b>' + esc(m.title) + '</b> <span class="mini">v' + esc(m.version) + "</span>" +
          '<div class="mini">' + (m.ready ? "✓ Ready" : "✕ Not installed") + " · " + (m.validated_here ? "✓ Validated on your cases" : "Not yet validated on your cases") + (p ? " · " + p.reads + " reads, " + p.avg_ms + " ms average" : "") + "</div>" +
          '<div class="mini">For: ' + esc(m.intended_use || "") + "</div>" + (m.kind === "weights" ? '<div class="mini">Trained on: ' + esc(m.trained_on || "") + "<br>Licence: " + esc(m.licence || "") + "</div>" : '<div class="mini">' + esc(m.trained_on || "") + "</div>") + "</div>";
      }).join("") + "</div></details>";
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
      var b = modalHtml('<h2 id="ops-title">New imaging study</h2><p class="sub">A whole CT or MRI series (a folder or ZIP of DICOM files, up to 290 MB) is rebuilt into key images, reformats and a scroll stack. Single DICOM files, DICOM ECGs, and PNG or JPEG photos (up to 10) work too. Identifying tags are removed.</p><form id="ns-form" novalidate>' +
        '<div class="grid2"><div class="field"><label for="ns-p">Patient</label><select class="input" id="ns-p">' + roster.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === pre.grant_id ? " selected" : "") + ">" + esc(g.patient_name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ns-prior">Compare with a prior study (optional)</label><select class="input" id="ns-prior"><option value="">None</option></select></div>' +
        '<div class="field"><label for="ns-m">Kind of scan</label><select class="input" id="ns-m"><option value="">Work it out for me</option>' + Object.keys(st.modalities).filter(function (k) { return k !== "other"; }).map(function (k) { return '<option value="' + k + '"' + (k === pre.modality ? " selected" : "") + ">" + (ICON[k] || "") + " " + esc(st.modalities[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="ns-r">Region</label><select class="input" id="ns-r"><option value="">Work it out / not applicable</option>' + st.regions.map(function (r) { return "<option" + (r === pre.region ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>Priority</label><div class="seg" id="ns-pri">' + [["routine", "Routine"], ["urgent", "Urgent"], ["stat", "STAT"]].map(function (x) { return '<button type="button" data-v="' + x[0] + '" class="' + ((pre.priority || "routine") === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</div></div></div>" +
        '<div class="field"><label for="ns-q">Clinical question</label><textarea class="input" id="ns-q" rows="2" maxlength="800" placeholder="e.g. Fever and cough for 5 days, crackles right base. Pneumonia? Effusion?">' + esc(pre.indication || "") + '</textarea><span class="hint">The read is reasoned around this question, so a specific one gives a better answer.</span></div>' +
        '<label class="img-drop" id="ns-drop"><input type="file" id="ns-f" multiple accept=".dcm,application/dicom,.zip,application/zip,image/png,image/jpeg"><span>🩻</span><b>Choose or drop images, a ZIP, or a whole folder</b><small id="ns-names">DICOM, ZIP, PNG or JPEG</small></label>' +
        '<div class="row" style="margin:-4px 0 10px"><button type="button" class="link" id="ns-folder">📁 Choose a DICOM folder instead</button><input type="file" id="ns-dir" webkitdirectory multiple hidden></div>' +
        '<label class="hp-check"><input type="checkbox" id="ns-noid"> <span>No patient names, IDs or dates are visible on these images (crop them out if they are).</span></label>' +
        '<button class="btn btn-primary" type="submit" id="ns-go">Upload study</button><div class="msg" id="ns-msg"></div></form>');
      var files = [];
      function isImg(f) { return /\.(png|jpe?g)$/i.test(f.name) || /^image\//.test(f.type); }
      function setFiles(list) {
        files = [].slice.call(list || []).filter(function (f) { return f.size > 0 && !/^\./.test(f.name) && !/\.(txt|xml|htm|html|exe|js)$/i.test(f.name) && f.name !== "DICOMDIR"; });
        var n = files.length, mb = files.reduce(function (a, f) { return a + f.size; }, 0) / 1048576;
        el("ns-names").textContent = !n ? "DICOM, ZIP, PNG or JPEG" : n > 4 ? n + " files · " + mb.toFixed(1) + " MB" : files.map(function (f) { return f.name; }).join(", ");
      }
      el("ns-f").onchange = function () { setFiles(this.files); };
      el("ns-folder").onclick = function () { el("ns-dir").click(); };
      el("ns-dir").onchange = function () { setFiles(this.files); };
      var pri = pre.priority || "routine";
      el("ns-pri").onclick = function (e) { var t = e.target.closest("[data-v]"); if (!t) return; pri = t.getAttribute("data-v"); [].forEach.call(this.children, function (c) { c.classList.toggle("on", c === t); }); };
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
        if (files.filter(isImg).length > 10) { H().say(el("ns-msg"), "Up to 10 photos or images at a time (a DICOM series can have many more files).", "err"); return; }
        var size = files.reduce(function (a, f) { return a + f.size; }, 0);
        if (size > 290 * 1024 * 1024) { H().say(el("ns-msg"), "That's more than 290 MB. Upload one series at a time, or a thinner reconstruction.", "err"); return; }
        var fd = new FormData();
        fd.append("grant_id", el("ns-p").value); fd.append("modality", el("ns-m").value); fd.append("region", el("ns-r").value); fd.append("priority", pri);
        fd.append("indication", el("ns-q").value); fd.append("prior_id", el("ns-prior").value); fd.append("no_identifiers", el("ns-noid").checked ? "1" : "");
        if (pre.order_id) fd.append("order_id", pre.order_id);
        if (pre.encounter_id) fd.append("encounter_id", pre.encounter_id);
        files.forEach(function (f) { fd.append("files", f, f.name); });
        el("ns-go").disabled = true; H().say(el("ns-msg"), files.length > 8 ? "Uploading " + files.length + " files and rebuilding the series… this can take a minute." : "Uploading and de-identifying…");
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
    return api("/hospital/imaging/studies/" + encodeURIComponent(sid)).then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { toast(r.message, "err"); return; }
      if (!S.study || S.study.id !== sid) { freeImages(); S.stack = { on: false, k: 0, n: 0 }; S.view = { i: 0, z: 1, x: 0, y: 0, b: 100, c: 100, inv: false, boxes: true, cmp: false, cmpUrl: null, focus: null, measure: false, heat: false, meas: {} }; }
      S.study = r.item;
      render();
      if (r.item.ai_status === "queued" || r.item.ai_status === "running") S.poll = setTimeout(function () { if (el("img-ws")) openStudy(sid); }, 4000);
    });
  }

  function render() {
    var s = S.study, ai = s.ai;
    var tech = Object.keys(s.meta || {}).filter(function (k) { return ["source", "text_masked", "detected_modality", "auto", "series", "waveform"].indexOf(k) < 0; }).map(function (k) { return esc(k.replace(/([a-z])([A-Z])/g, "$1 $2")) + ": " + esc(s.meta[k]); }).join(" · ");
    var se = (s.meta || {}).series;
    if (se) tech = "Series: " + se.slices + " slices, " + se.spacing_mm + " mm apart" + (se.description ? " (" + esc(se.description) + ")" : "") + (se.other_series ? " · " + se.other_series + " other series in the upload not used" : "") + (tech ? " · " + tech : "");
    S.stack.n = s.stack || 0;
    var qIssues = [];
    (s.images || []).forEach(function (im) { (im.quality.issues || []).forEach(function (x) { if (qIssues.indexOf(x) < 0) qIssues.push(x); }); });
    var h = '<div id="img-ws" class="img-ws"><div class="img-viewer"><div class="img-stage" id="img-stage"><div class="img-canvas" id="img-canvas"><div class="img-frame"><img id="img-main" alt="Study image" draggable="false"><img id="img-heat" class="img-heat" alt="" hidden><div class="img-boxes" id="img-boxes"></div><svg class="img-meas" id="img-meas" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="img-mlabels" id="img-mlabels"></div></div></div>' +
      '<div class="img-cmp" id="img-cmp" hidden><img id="img-prior" alt="Prior study"><span>Prior</span></div><div class="img-label" id="img-label"></div></div>' +
      '<div class="img-tools"><button type="button" data-z="1.25" title="Zoom in">＋</button><button type="button" data-z="0.8" title="Zoom out">－</button><button type="button" data-reset title="Reset">⟲</button>' +
      '<label title="Brightness">☀<input type="range" min="40" max="220" value="' + S.view.b + '" id="vb"></label><label title="Contrast">◐<input type="range" min="40" max="300" value="' + S.view.c + '" id="vc"></label>' +
      '<button type="button" data-inv class="' + (S.view.inv ? "on" : "") + '" title="Invert">⬛⬜</button>' + (ai ? '<button type="button" data-boxes class="' + (S.view.boxes ? "on" : "") + '" title="Show AI findings">▢ Findings</button>' : "") +
      (s.prior_id ? '<button type="button" data-cmp class="' + (S.view.cmp ? "on" : "") + '">⇆ Prior</button>' : "") +
      '<button type="button" data-measure class="' + (S.view.measure ? "on" : "") + '" title="Measure: drag across the image">📏 Measure</button>' +
      (s.pixel_analysis ? '<button type="button" data-heat class="' + (S.view.heat ? "on" : "") + '" title="Left-right asymmetry map (pixel statistics, not AI)">◐ Asymmetry</button>' : "") +
      (s.stack ? '<button type="button" data-stack class="' + (S.stack.on ? "on" : "") + '" title="Scroll through every slice">🎞 Series (' + s.stack + ")</button>" : "") + "</div>" +
      (s.stack ? '<div class="img-stackbar" id="img-stackbar"' + (S.stack.on ? "" : " hidden") + '><button type="button" data-sk="-1" aria-label="Previous slice">‹</button><input type="range" id="img-sk" min="0" max="' + (s.stack - 1) + '" value="' + S.stack.k + '" aria-label="Slice"><button type="button" data-sk="1" aria-label="Next slice">›</button><span id="img-skl"></span><span class="mini">Wheel or ↑↓ to scroll · Shift+wheel zooms</span></div>' : "") +
      '<div class="img-thumbs">' + (s.images || []).map(function (im) { return '<button type="button" class="img-th' + (im.idx === S.view.i ? " on" : "") + '" data-i="' + im.idx + '"><img data-src="' + im.idx + '" alt=""><span>' + esc(im.label) + "</span></button>"; }).join("") + "</div></div>";
    // side panel
    h += '<div class="img-side"><div class="img-pt"><span class="img-ic big">' + (ICON[s.modality] || "🖼️") + '</span><div><h2 id="ops-title">' + esc(s.modality_label + " · " + s.region) + '</h2><div class="mini">' + esc(s.patient_name) + " · " + esc(H().when(s.created_ts)) + " · uploaded by " + esc(s.created_by || "") + "</div></div></div>" +
      workflowBar(s) + typePanel(s) +
      (s.indication ? '<div class="img-q"><span>Clinical question</span>' + esc(s.indication) + "</div>" : "") + (tech ? '<div class="mini img-tech">' + tech + "</div>" : "") +
      (qIssues.length ? '<div class="img-warn">⚠ Image quality: ' + qIssues.map(esc).join(" ") + "</div>" : "") + (!s.access_active ? '<div class="notice bad">The patient\'s access has ended.</div>' : "");
    h += aiPanel(s);
    h += computedPanel(s);
    h += guidancePanel(s);
    h += commsPanel(s);
    h += pixelPanel(s);
    h += reportPanel(s);
    h += "</div></div>";
    modalHtml(h, true);
    wire();
    showImage(S.view.i);
    [].forEach.call(document.querySelectorAll("[data-src]"), function (im) { fetchImage(s.id, +im.getAttribute("data-src")).then(function (u) { im.src = u; }, function () {}); });
  }

  /* priority, who is reading it, how long it has waited */
  function workflowBar(s) {
    if (s.status === "signed") return "";
    var pr = s.priority || "routine";
    return '<div class="img-wf"><label>Priority <select class="input input-sm" id="img-pri">' + Object.keys(PRI).map(function (k) { return '<option value="' + k + '"' + (k === pr ? " selected" : "") + ">" + PRI[k][0] + "</option>"; }).join("") + "</select></label>" +
      '<span class="img-wf-who">' + (s.assigned_name ? "👤 " + esc(s.assigned_name) : "Not assigned") + "</span>" +
      (can("imaging_sign") ? (s.assigned_to === H().me().staff.id ? '<button type="button" class="btn btn-sm btn-ghost" data-assign="">Release</button>' : '<button type="button" class="btn btn-sm" data-assign="me">Take it</button>') +
        '<button type="button" class="btn btn-sm btn-ghost" data-assign-to>Assign…</button>' : "") +
      (s.overdue_min > 0 ? '<span class="late">⏱ ' + dur(s.overdue_min) + " past target</span>" : s.due_ts ? '<span class="mini">⏱ due ' + esc(H().when(s.due_ts)) + "</span>" : "") + "</div>";
  }
  /* when nobody (and no AI) could be sure what the scan is */
  function typePanel(s) {
    var auto = (s.meta || {}).auto;
    if (s.status === "signed" || !(s.modality === "other" || s.ai_status === "needs_type" || (auto && !auto.confirmed))) return "";
    var st = S.settings || {}, mods = st.modalities || {};
    var guess = auto && auto.ai && auto.ai.modality ? "The AI thought: " + (mods[auto.ai.modality] || auto.ai.modality) + " (" + Math.round((auto.ai.confidence || 0) * 100) + "%)" + (auto.ai.reason ? ", " + auto.ai.reason : "") + ". " :
      auto && auto.guess ? "A quick look suggests " + (mods[auto.guess] || auto.guess) + " (" + auto.why + "). " : "";
    return '<div class="img-type"><b>What kind of scan is this?</b><p class="mini">' + esc(guess) + (s.modality === "other" ? "Choose it so the read uses the right checklist." : "Confirm or change it.") + "</p>" +
      '<div class="row"><select class="input input-sm" id="img-type-m">' + Object.keys(mods).filter(function (k) { return k !== "other"; }).map(function (k) { return '<option value="' + k + '"' + (k === s.modality ? " selected" : "") + ">" + (ICON[k] || "") + " " + esc(mods[k]) + "</option>"; }).join("") + "</select>" +
      '<select class="input input-sm" id="img-type-r">' + (st.regions || []).map(function (r) { return "<option" + (r === s.region ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="btn btn-sm btn-primary" data-settype>Save</button></div></div>';
  }
  /* numbers worked out in code from values the reader read off the image (QTc, DEXA category, EF band) */
  function computedPanel(s) {
    var c = s.ai && s.ai.computed;
    if (!c || !c.length) return "";
    return '<div class="img-calc"><div class="img-ai-h">🧮 Worked out from the image <span class="mini">· arithmetic in QueroCura, not by the AI</span></div>' + c.map(function (x) {
      return '<div class="img-calc-r ' + x.flag + '"><span>' + esc(x.label) + "</span><b>" + esc(x.value) + '</b><small>' + esc(x.note) + "</small></div>";
    }).join("") + '<p class="mini">Check the values it started from on the trace or report before you rely on them.</p></div>';
  }
  /* critical results: who was told, how, and that they read it back */
  function commsPanel(s) {
    var crit = s.critical || (s.ai && s.ai.critical_alert && s.ai.critical_alert.present);
    if (!crit && !(s.comms || []).length) return "";
    var list = (s.comms || []).map(function (c) { return '<div class="img-comm">📞 ' + esc(c.to) + " · " + esc(c.how.replace("_", " ")) + " · read back ✓ · by " + esc(c.by) + " · " + esc(H().when(c.ts)) + " (" + dur(c.minutes_after_upload) + " after upload)" + (c.note ? "<div class=\"mini\">" + esc(c.note) + "</div>" : "") + "</div>"; }).join("");
    var form = can("imaging_sign") && s.status !== "signed" ? '<div class="img-comm-f"><div class="grid2"><div class="field"><label for="cm-to">Told (name and role)</label><input class="input" id="cm-to" maxlength="80" placeholder="e.g. Dr Rao, ED consultant"></div>' +
      '<div class="field"><label for="cm-how">How</label><select class="input" id="cm-how"><option value="phone">Phone</option><option value="in_person">In person</option><option value="pager">Pager</option><option value="message">Secure message</option></select></div></div>' +
      '<div class="field"><label for="cm-note">Note (optional)</label><input class="input" id="cm-note" maxlength="300"></div><label class="hp-check"><input type="checkbox" id="cm-rb"> <span>They read the result back to me</span></label>' +
      '<button type="button" class="btn btn-sm btn-primary" data-comm>Record the call</button></div>' : "";
    return '<div class="img-comms' + (list ? "" : " due") + '"><div class="img-ai-h">🚨 Critical result communication</div>' + (list || '<p class="mini">A critical finding is told to the treating team before the report is signed, and recorded here.</p>') + form + "</div>";
  }

  function aiPanel(s) {
    var ai = s.ai, st = S.settings || {};
    if (s.status === "signed" && !ai) return "";
    if (!ai) {
      if (s.ai_status === "needs_type") return '<div class="img-ai"><div class="img-ai-h">🧠 AI-assisted draft</div><div class="notice wait">' + esc(s.ai_error || "Choose the kind of scan first.") + "</div></div>";
      if (s.ai_status === "queued" || s.ai_status === "running") {
        return '<div class="img-ai running"><div class="img-steps"><div class="on"><i></i>De-identified images ready</div><div class="' + (s.ai_status === "running" ? "on pulse" : "") + '"><i></i>First reader: systematic review of every area</div><div><i></i>Second reader: looking for misses, challenging each finding</div><div><i></i>Reconciled draft for your review</div></div><p class="mini">This usually takes one to three minutes. You can close this and come back.</p></div>';
      }
      var why = !st.provider_ready ? "AI-assisted reading isn't configured on this server." : !st.enabled ? "An administrator can switch on AI-assisted reading." : !s.ai_allowed ? "This patient has turned off AI help with their scans." : "";
      return '<div class="img-ai"><div class="img-ai-h">🧠 AI-assisted draft</div>' + (s.ai_error ? '<div class="notice bad">' + esc(s.ai_error) + "</div>" : "") +
        (why ? '<p class="mini">' + esc(why) + " You can read and report the study yourself below.</p>" :
          (st.mode === "local" ? '<p class="mini">The on-premise engine reads this study on your own server (nothing is sent out) and marks what it finds; you review every finding and sign.</p>' : '<p class="mini">Two independent AI passes read the images around your clinical question: a systematic first read, then a second reader that hunts for misses and challenges every finding. You review and sign.</p>') +
          (can("imaging") ? '<button class="btn btn-primary" type="button" data-ai>' + (st.mode === "local" ? "Run the on-premise AI read" : "Ask AI for a draft read") + "</button>" : "")) + "</div>";
    }
    var dec = s.decisions || {}, signer = can("imaging_sign") && s.status !== "signed";
    var sevRank = { critical: 0, significant: 1, minor: 2, incidental: 3 };
    var fs = ai.findings.slice().sort(function (a, b) { return sevRank[a.severity] - sevRank[b.severity]; });
    var notes = {};
    (ai.review_notes || []).forEach(function (n) { notes[n.finding_id] = n; });
    var eg = ai.engine;
    var h = '<div class="img-ai done"><div class="img-ai-h">' + (eg ? "🖥️ On-premise AI draft" : "🧠 AI draft") + ' <span class="mini">· not a report · ' + esc(eg ? eg.title + " v" + eg.version + " · " + eg.latency_ms + " ms" : s.ai_model || "") + " · " + esc(H().when(s.ai_done_ts)) + "</span></div>";
    if (eg) h += '<div class="img-onprem"><span>🔒 Read on this server; the images never left it.</span>' + (eg.validated_here ? '<span class="ib both">✓ Validated on your cases</span>' : '<span class="ib one">Not yet validated on your cases</span>') + "</div>";
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
        '<div class="img-badges">' + (f.consensus === "model" ? '<span class="ib px">◆ On-premise model</span>' : "") + (f.consensus === "both" ? '<span class="ib both">✓✓ Both readers</span>' : f.consensus === "both_revised" ? '<span class="ib both">✓✓ Both readers (revised)</span>' : f.consensus === "second_only" ? '<span class="ib one">2nd reader only</span>' : "") +
        (f.pixel_support ? '<span class="ib px">◐ Asymmetry map agrees</span>' : "") + (f.box_mm ? '<span class="ib mm">📏 box ≈ ' + f.box_mm[0] + " × " + f.box_mm[1] + " mm</span>" : "") +
        (f.classification ? '<span class="ib gl">📘 ' + esc(f.classification.system.toUpperCase()) + "</span>" : "") + "</div>" + (n ? '<div class="img-note ' + n.action + '">2nd reader ' + esc(n.action) + (n.reason ? ": " + esc(n.reason) : "") + "</div>" : "") +
        '<div class="img-f-a">' + (f.image_index != null ? '<button type="button" class="btn btn-sm btn-ghost" data-show="' + esc(f.id) + '">Show on image</button>' : "") +
        (signer ? '<button type="button" class="btn btn-sm' + (d === "accepted" ? " btn-primary" : "") + '" data-dec="accepted" data-id="' + esc(f.id) + '">✓ Accept</button><button type="button" class="btn btn-sm' + (d === "rejected" ? " btn-danger" : "") + '" data-dec="rejected" data-id="' + esc(f.id) + '">✕ Reject</button>' : (d ? '<span class="pill ' + (d === "accepted" ? "ok" : "bad") + '">' + esc(d) + "</span>" : "")) + "</div></div>";
    }).join("") : '<div class="mini">No findings reported.</div>') + "</div>";
    if (eg && eg.scores) {
      var top = Object.keys(eg.scores).map(function (k) { return [k, eg.scores[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
      h += '<details class="img-sec"><summary class="ops-h">Model scores (0.50 = its operating point)</summary><div class="img-scores">' + top.map(function (t) {
        return '<div class="img-score' + (t[1] >= 0.5 ? " on" : t[1] >= 0.4 ? " mid" : "") + '"><span>' + esc(t[0].replace(/_/g, " ")) + '</span><i><b style="width:' + Math.round(t[1] * 100) + '%"></b><em style="left:50%"></em></i><small>' + t[1].toFixed(2) + "</small></div>";
      }).join("") + "</div></details>";
    }
    if (eg && eg.st_mm) h += '<details class="img-sec"><summary class="ops-h">ST deviation at J+60 ms (mm)</summary><div class="img-st">' + Object.keys(eg.st_mm).map(function (l) {
      var v = eg.st_mm[l];
      return '<span class="' + (v >= 1 ? "up" : v <= -1 ? "down" : "") + '"><b>' + esc(l) + "</b>" + (v > 0 ? "+" : "") + v.toFixed(1) + "</span>";
    }).join("") + "</div></details>";
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
        (can("imaging_sign") ? '<div class="field" style="margin-top:10px"><label for="img-add">Add an addendum</label><textarea class="input" id="img-add" rows="2" maxlength="3000"></textarea></div><button class="btn btn-sm" type="button" data-addendum>Add addendum</button>' : "") +
        peerPanel(s) + "</div>";
    }
    if (!can("imaging_sign")) return '<div class="img-rep"><p class="mini">A doctor or radiologist will review and sign the report.</p></div>';
    var undecided = s.ai ? s.ai.findings.filter(function (f) { return !(s.decisions || {})[f.id]; }).length : 0;
    return '<div class="img-rep"><div class="img-ai-h">✍️ Your report</div>' + (s.ai ? '<p class="mini">' + (undecided ? undecided + " finding" + (undecided > 1 ? "s" : "") + " still to accept or reject. " : "") + 'Build the report from the findings you accepted, then edit it freely.</p>' : "") +
      '<div class="row">' + (s.ai ? '<button class="btn btn-sm" type="button" data-build>Build from accepted findings</button>' : "") + (s.template ? '<button class="btn btn-sm btn-ghost" type="button" data-tpl>Use our template</button>' : "") +
      '<button class="btn btn-sm btn-ghost" type="button" data-savetpl title="Save what is in the box as this facility’s template for this kind of scan">Save as template</button></div>' +
      '<textarea class="input mono" id="img-report" rows="12" maxlength="12000" placeholder="EXAMINATION:\nCLINICAL QUESTION:\nTECHNIQUE:\n\nFINDINGS:\n\nIMPRESSION:">' + "</textarea>" +
      '<button class="btn btn-primary" type="button" data-sign>Sign report</button><div class="msg" id="img-msg"></div><p class="mini">Signing files the report in the patient\'s QueroCura record (if they allowed records) and completes any linked imaging order.</p></div>';
  }

  /* a second reporter scores the signed report (agree / minor / significant discrepancy) */
  function peerPanel(s) {
    var p = s.peer_detail;
    if (p) return '<div class="img-peer"><b>Peer review</b> · ' + esc(p.label) + " · " + esc(p.by) + " · " + esc(H().when(p.ts)) + (p.note ? '<div class="mini">' + esc(p.note) + "</div>" : "") + "</div>";
    if (!can("imaging_sign") || s.signed_by === H().me().staff.name) return "";
    var sc = (S.settings || {}).peer_scale || { 1: "Agree", 2: "Minor discrepancy", 3: "Significant discrepancy" };
    return '<div class="img-peer"><b>Peer review</b> <span class="mini">· for quality, by someone other than the reporter</span><div class="seg" id="pr-s">' + Object.keys(sc).map(function (k) { return '<button type="button" data-v="' + k + '">' + esc(sc[k].split(" (")[0]) + "</button>"; }).join("") + "</div>" +
      '<input class="input" id="pr-n" maxlength="1000" placeholder="What differs (needed for a discrepancy)"><button type="button" class="btn btn-sm" data-peer>Save review</button></div>';
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
  function showSlice(k) {
    var s = S.study; k = Math.max(0, Math.min(S.stack.n - 1, k)); S.stack.k = k;
    var sk = el("img-sk"); if (sk) sk.value = k;
    el("img-skl").textContent = "Slice " + (k + 1) + " / " + S.stack.n;
    el("img-label").textContent = "Series · slice " + (k + 1) + " of " + S.stack.n;
    el("img-boxes").innerHTML = ""; H().show(el("img-heat"), false);
    var key = s.id + ":stack:" + k, m = el("img-main");
    var go = function (u) { m.onload = fit; m.src = u; if (m.complete) fit(); };
    if (S.urls[key]) return go(S.urls[key]);
    fetch(H().P.API + "/hospital/imaging/studies/" + encodeURIComponent(s.id) + "/stack/" + k, { credentials: "include" }).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) { S.urls[key] = URL.createObjectURL(b); if (S.stack.k === k) go(S.urls[key]); }, function () {});
    [k + 1, k + 2, k - 1].forEach(function (j) {                               // read ahead so scrolling is smooth
      if (j < 0 || j >= S.stack.n || S.urls[s.id + ":stack:" + j]) return;
      fetch(H().P.API + "/hospital/imaging/studies/" + encodeURIComponent(s.id) + "/stack/" + j, { credentials: "include" }).then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) { if (b) S.urls[s.id + ":stack:" + j] = URL.createObjectURL(b); }, function () {});
    });
  }
  function showImage(i) {
    var s = S.study, v = S.view; v.i = i;
    if (S.stack.on) { S.stack.on = false; var sb = el("img-stackbar"); if (sb) sb.hidden = true; var bt = document.querySelector("[data-stack]"); if (bt) bt.classList.remove("on"); }
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
    stage.onwheel = function (e) {
      e.preventDefault();
      if (S.stack.on && !e.shiftKey) { showSlice(S.stack.k + (e.deltaY > 0 ? 1 : -1)); return; }
      v.z = Math.min(8, Math.max(0.5, v.z * (e.deltaY < 0 ? 1.12 : 0.89))); apply();
    };
    var skr = el("img-sk"); if (skr) skr.oninput = function () { showSlice(+this.value); };
    document.onkeydown = function (e) {
      if (!el("img-ws") || !S.stack.on || /input|textarea|select/i.test((e.target || {}).tagName || "")) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); showSlice(S.stack.k + (e.key === "PageDown" ? 10 : 1)); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); showSlice(S.stack.k - (e.key === "PageUp" ? 10 : 1)); }
    };
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
    var ps = el("img-pri"); if (ps) ps.onchange = function () { post("priority", { priority: this.value }); };
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
      if ((t = e.target.closest("[data-stack]"))) {
        if (S.stack.on) { showImage(v.i); return; }
        S.stack.on = true; t.classList.add("on"); el("img-stackbar").hidden = false; v.measure = false; showSlice(S.stack.k || Math.floor(S.stack.n / 2)); return;
      }
      if ((t = e.target.closest("[data-sk]"))) { showSlice(S.stack.k + +t.getAttribute("data-sk")); return; }
      if ((t = e.target.closest("[data-assign]"))) return post("assign", { to: t.getAttribute("data-assign") });
      if (e.target.closest("[data-assign-to]")) return assignTo();
      if (e.target.closest("[data-settype]")) return post("type", { modality: el("img-type-m").value, region: el("img-type-r").value });
      if (e.target.closest("[data-comm]")) return post("communicate", { to: el("cm-to").value, how: el("cm-how").value, note: el("cm-note").value, read_back: el("cm-rb").checked }, true);
      if (e.target.closest("[data-tpl]")) { var ta = el("img-report"); if (!ta.value.trim() || window.confirm("Replace what is in the report box with the template?")) { ta.value = S.study.template; ta.focus(); } return; }
      if (e.target.closest("[data-savetpl]")) {
        var txt = el("img-report").value.trim(); if (txt.length < 20) { toast("Write the template in the report box first.", "err"); return; }
        return api("/hospital/imaging/templates", { method: "POST", body: { key: S.study.modality + (S.study.region && S.study.region !== "Other" ? "|" + S.study.region.toLowerCase() : ""), text: txt } }).then(function (r) { toast(r.message, r.ok ? "" : "err"); if (r.ok) S.study.template = txt; });
      }
      if ((t = e.target.closest("#pr-s [data-v]"))) { [].forEach.call(t.parentNode.children, function (c) { c.classList.toggle("on", c === t); }); return; }
      if (e.target.closest("[data-peer]")) { var on = document.querySelector("#pr-s .on"); if (!on) { toast("Choose agree or a discrepancy.", "err"); return; } return post("peer", { score: +on.getAttribute("data-v"), note: el("pr-n").value }); }
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
  function post(what, body, keepReport) {
    var keep = el("img-report") ? el("img-report").value : "";
    return api("/hospital/imaging/studies/" + encodeURIComponent(S.study.id) + "/" + what, { method: "POST", body: body }).then(function (r) {
      toast(r.message, r.ok ? "" : "err");
      if (r.ok) return openStudy(S.study.id).then(function () { if (el("img-report") && keep) el("img-report").value = keep; });
    });
  }
  /* choose a colleague who can report, least busy first */
  function assignTo() {
    var bar = document.querySelector(".img-wf"); if (!bar) return;
    api("/hospital/imaging/readers").then(function (r) {
      if (!r.ok || !r.items.length) { toast("No colleagues who can report imaging yet.", "err"); return; }
      var old = el("img-asg-box"); if (old) old.remove();
      var box = document.createElement("div");
      box.id = "img-asg-box"; box.className = "img-asg";
      box.innerHTML = '<label for="img-asg">Assign to</label><select class="input input-sm" id="img-asg">' + r.items.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === S.study.assigned_to ? " selected" : "") + ">" + esc(p.name) + " · " + p.open + " open" + (p.id === H().me().staff.id ? " (you)" : "") + "</option>";
      }).join("") + '</select><button type="button" class="btn btn-sm btn-primary" id="img-asg-go">Assign</button><button type="button" class="btn btn-sm btn-ghost" id="img-asg-x">Cancel</button>';
      bar.appendChild(box);
      el("img-asg").focus();
      el("img-asg-go").onclick = function () { post("assign", { to: el("img-asg").value }); };
      el("img-asg-x").onclick = function () { box.remove(); };
    });
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
