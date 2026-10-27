/* QueroCura for Hospitals: making the portal the facility's own.
 *  apply(custom)  colour, logo, layout density and the facility's own words, applied as the portal opens
 *  Customise tab  for administrators: look and letterhead, words, registration questions, MRN prefix, targets,
 *                 report templates; for everyone: which screen opens first, compact layout, pinned screens
 * Exposes window.QCCustom { apply, term, tabs, loaders, fieldsForm, readFields }. */
(function () {
  "use strict";
  function H() { return window.QCHosp; }
  function esc(s) { return H().esc(s); }
  function api(p, o) { return H().api(p, o); }
  function el(id) { return document.getElementById(id); }
  function toast(m, k) { H().P.toast(m, k); }
  var C = null;
  var TERM_LABEL = { patient: "Patient", patients: "Patients", mrn: "Record number (MRN)", visit: "Visit", opd: "Outpatients (OPD)", ipd: "Inpatients (IPD)", ward: "Ward",
    bed: "Bed", department: "Department", doctor: "Doctor", queue: "Queue", admission: "Admission", discharge: "Discharge", bill: "Bill" };
  var TAB_LABEL = { "my-day": "My day", queue: "Queue", patients: "Patients", appointments: "Appointments", insights: "Insights", orders: "Tests and tasks", board: "Hospital board",
    beds: "Beds", imaging: "Scans", lab: "Lab", pharmacy: "Pharmacy", billing: "Billing", claims: "Claims", ot: "Theatres", setup: "Setup" };

  /* ---------------------------------------------------------------- applying the look */
  function hexMix(hex, other, t) {
    var a = [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16); }), b = [1, 3, 5].map(function (i) { return parseInt(other.substr(i, 2), 16); });
    return "#" + a.map(function (v, i) { return ("0" + Math.round(v + (b[i] - v) * t).toString(16)).slice(-2); }).join("");
  }
  function apply(custom) {
    C = custom || C; if (!C) return;
    var root = document.documentElement, b = C.branding || {}, acc = b.accent || "#0e8f83";
    var dark = root.getAttribute("data-theme") === "dark";
    root.style.setProperty("--brand", acc);
    root.style.setProperty("--brand-d", hexMix(acc, "#000000", 0.18));
    root.style.setProperty("--brand-soft", hexMix(acc, dark ? "#18162e" : "#ffffff", 0.88));
    root.style.setProperty("--teal", dark ? hexMix(acc, "#ffffff", 0.45) : acc);
    root.style.setProperty("--teal-d", dark ? hexMix(acc, "#ffffff", 0.6) : hexMix(acc, "#000000", 0.18));
    root.classList.add("hp-branded");
    root.classList.toggle("hp-compact", (C.prefs || {}).density === "compact");
    root.classList.toggle("hp-calm", !!(C.prefs || {}).reduce_motion);
    var name = el("org-name");
    if (name) {
      var old = document.getElementById("org-logo"); if (old) old.remove();
      if (b.logo && H().me()) {
        var img = new Image(); img.id = "org-logo"; img.alt = ""; img.className = "org-logo";
        img.src = H().P.API + "/hospital/public/logo/" + encodeURIComponent(H().me().org.id) + "?t=" + (b.logo_ts || 0);
        name.parentNode.parentNode.insertBefore(img, name.parentNode);
      }
    }
  }
  // dark mode switch: re-derive the tints
  new MutationObserver(function () { if (C) apply(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  function term(k, fallback) { return (C && C.terms && C.terms[k]) || fallback || TERM_LABEL[k] || k; }

  /* ---------------------------------------------------------------- the registration questions, as a form */
  function fieldsForm(values) {
    var fs = (C && C.fields) || [];
    if (!fs.length) return "";
    values = values || {};
    return '<fieldset class="cf-set"><legend>More details</legend><div class="grid2">' + fs.map(function (f) {
      var id = "cf-" + f.key, v = values[f.key], req = f.required ? " required" : "", lab = '<label for="' + id + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : "") + "</label>";
      var help = f.help ? '<small class="hint">' + esc(f.help) + "</small>" : "";
      if (f.type === "choice") return '<div class="field">' + lab + '<select class="input" id="' + id + '" data-cf="' + f.key + '"' + req + '><option value="">Choose…</option>' +
        f.options.map(function (o) { return "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" + help + "</div>";
      if (f.type === "yesno") return '<div class="field"><label class="check"><input type="checkbox" id="' + id + '" data-cf="' + f.key + '"' + (v ? " checked" : "") + "> " + esc(f.label) + "</label>" + help + "</div>";
      var t = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
      return '<div class="field">' + lab + '<input class="input" type="' + t + '" id="' + id + '" data-cf="' + f.key + '" maxlength="200" value="' + esc(v == null ? "" : v) + '"' + req + ">" + help + "</div>";
    }).join("") + "</div></fieldset>";
  }
  function readFields(box) {
    var out = {};
    [].forEach.call((box || document).querySelectorAll("[data-cf]"), function (i) { out[i.getAttribute("data-cf")] = i.type === "checkbox" ? i.checked : i.value.trim(); });
    return out;
  }

  /* ---------------------------------------------------------------- the Customise tab */
  function tabs(can) { return [["customise", "Customise", true, "admin"]]; }
  function loaders() { return { customise: load }; }

  function load() {
    var box = el("tab-customise");
    if (!box) {
      box = document.createElement("section"); box.className = "tab"; box.id = "tab-customise";
      el("workspace").appendChild(box);
    }
    box.hidden = false;
    box.innerHTML = '<div class="empty">Loading…</div>';
    api("/hospital/custom").then(function (r) {
      if (H().guard(r)) return;
      if (!r.ok) { box.innerHTML = '<div class="notice bad">' + esc(r.message || "Couldn’t load settings.") + "</div>"; return; }
      C = r; render(box, r);
    });
  }

  function render(box, r) {
    var admin = H().can("org"), b = r.branding, h = "";
    h += '<div class="cu-head"><div><h2>Make QueroCura yours</h2><p class="sub">' + (admin ? "How the portal looks, the words it uses, what it asks at registration and the times your facility holds itself to. Changes apply to everyone straight away." : "Your own layout. Your administrator sets how the portal looks for everyone.") + "</p></div></div>";
    // everyone: my layout
    h += '<div class="card cu-card"><h3>🧑‍💻 Your layout</h3><div class="grid2">' +
      '<div class="field"><label for="cu-home">Open on</label><select class="input" id="cu-home">' + r.tabs.map(function (t) { return '<option value="' + t + '"' + (r.prefs.home === t ? " selected" : "") + ">" + esc(TAB_LABEL[t] || t) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Density</label><div class="seg" role="radiogroup">' + [["comfortable", "Comfortable"], ["compact", "Compact"]].map(function (d) { return '<button type="button" role="radio" aria-checked="' + (r.prefs.density === d[0]) + '" class="' + (r.prefs.density === d[0] ? "on" : "") + '" data-density="' + d[0] + '">' + d[1] + "</button>"; }).join("") + "</div></div></div>" +
      '<div class="field"><label>Pinned to the top bar</label><div class="cu-pins">' + r.tabs.filter(function (t) { return t !== "my-day"; }).map(function (t) { var on = r.prefs.pinned.indexOf(t) >= 0; return '<button type="button" class="chipbtn' + (on ? " on" : "") + '" data-pin="' + t + '" aria-pressed="' + on + '">' + esc(TAB_LABEL[t] || t) + "</button>"; }).join("") + "</div></div>" +
      '<label class="check"><input type="checkbox" id="cu-calm"' + (r.prefs.reduce_motion ? " checked" : "") + "> Fewer animations</label></div>";
    if (admin) {
      h += '<div class="cu-grid">';
      // look
      h += '<div class="card cu-card"><h3>🎨 Look and letterhead</h3><div class="cu-preview" id="cu-preview" style="--pv:' + esc(b.accent) + '"><div class="cu-pv-bar">' + (b.logo ? '<img alt="" src="' + H().P.API + "/hospital/public/logo/" + encodeURIComponent(H().me().org.id) + "?t=" + b.logo_ts + '">' : "") + "<b>" + esc(b.short_name || H().me().org.name) + '</b></div><div class="cu-pv-body"><span class="cu-pv-btn">Primary button</span><span class="cu-pv-chip">Chip</span><span class="cu-pv-link">A link</span></div></div>' +
        '<div class="field"><label>Accent colour</label><div class="cu-swatches">' + r.accents.map(function (a) { return '<button type="button" class="cu-sw' + (a === b.accent ? " on" : "") + '" style="background:' + a + '" data-accent="' + a + '" aria-label="Colour ' + a + '"></button>'; }).join("") +
        '<input type="color" id="cu-accent" value="' + esc(b.accent) + '" aria-label="Pick any colour"></div><small class="hint" id="cu-contrast"></small></div>' +
        '<div class="grid2"><div class="field"><label for="cu-short">Short name</label><input class="input" id="cu-short" maxlength="24" value="' + esc(b.short_name) + '" placeholder="e.g. Sunrise"></div>' +
        '<div class="field"><label for="cu-logo">Logo (PNG or JPEG)</label><input class="input" id="cu-logo" type="file" accept="image/png,image/jpeg">' + (b.logo ? '<button type="button" class="link" id="cu-nologo">Remove logo</button>' : "") + "</div></div>" +
        '<div class="field"><label for="cu-letter">Letterhead (up to 4 lines on printed documents)</label><textarea class="input" id="cu-letter" rows="3" maxlength="500" placeholder="Sunrise Multispeciality Hospital&#10;12 MG Road, Pune 411001 · 020 1234 5678">' + esc((b.letterhead || []).join("\n")) + "</textarea></div>" +
        '<div class="field"><label for="cu-footer">Footer line</label><input class="input" id="cu-footer" maxlength="200" value="' + esc(b.footer) + '" placeholder="e.g. NABH accredited · Emergency 24×7: 020 1234 5600"></div>' +
        '<button class="btn btn-primary" type="button" id="cu-save-look">Save look</button></div>';
      // words
      h += '<div class="card cu-card"><h3>🗣️ Your words</h3><p class="sub">Rename things to what your staff already say. Leave a box empty to keep the default.</p><div class="grid2">' +
        Object.keys(TERM_LABEL).map(function (k) { var v = r.terms[k], def = { patient: "Patient", patients: "Patients", mrn: "MRN", visit: "Visit", opd: "OPD", ipd: "IPD", ward: "Ward", bed: "Bed", department: "Department", doctor: "Doctor", queue: "Queue", admission: "Admission", discharge: "Discharge", bill: "Bill" }[k];
          return '<div class="field"><label for="cu-t-' + k + '">' + esc(TERM_LABEL[k]) + '</label><input class="input" id="cu-t-' + k + '" data-term="' + k + '" maxlength="24" placeholder="' + esc(def) + '" value="' + esc(v === def ? "" : v) + '"></div>'; }).join("") +
        '</div><div class="grid2"><div class="field"><label for="cu-prefix">Prefix for new record numbers</label><input class="input" id="cu-prefix" maxlength="7" value="' + esc(r.numbering.mrn_prefix) + '" placeholder="e.g. SMH-"><small class="hint">New numbers look like ' + esc(r.numbering.mrn_prefix || "") + '26-000123. Existing numbers never change.</small></div></div>' +
        '<button class="btn btn-primary" type="button" id="cu-save-words">Save words</button></div>';
      // fields
      h += '<div class="card cu-card cu-wide"><h3>📝 Registration questions</h3><p class="sub">Extra questions your front desk asks: scheme or ration card, referral source, employee ID… Answers are stored encrypted with the patient’s record and included in exports.</p>' +
        '<div id="cu-fields">' + (r.fields.length ? "" : '<div class="empty">None yet.</div>') + "</div>" +
        '<div class="row"><button class="btn" type="button" id="cu-add-field">+ Add a question</button><span class="grow"></span><button class="btn btn-primary" type="button" id="cu-save-fields">Save questions</button></div></div>';
      // targets
      h += '<div class="card cu-card cu-wide"><h3>⏱️ Targets</h3><p class="sub">The times your facility holds itself to. My day, the queue and the scan worklist flag anything past them.</p><div class="cu-targets">' +
        Object.keys(r.target_info).map(function (k) { var i = r.target_info[k], hour = k === "discharge_by_hour";
          return '<div class="cu-target"><label for="cu-tg-' + k + '">' + esc(i.label) + '</label><div class="cu-tg-in"><input class="input" type="number" id="cu-tg-' + k + '" data-target="' + k + '" min="' + i.min + '" max="' + i.max + '" value="' + r.targets[k] + '"><span>' + (hour ? ":00" : "min") + "</span></div><small>" + (hour ? "" : esc(human(r.targets[k]))) + "</small></div>"; }).join("") +
        '</div><button class="btn btn-primary" type="button" id="cu-save-targets">Save targets</button></div>';
      h += '<div class="card cu-card cu-wide" id="cu-sites"><h3>🏥 Sites</h3><div class="empty">Loading…</div></div>';
      h += "</div>";
    }
    box.innerHTML = h;
    if (admin) { drawFields(r.fields); loadSitesCard(); }
    wire(box, r);
  }
  /* sites: a hospital group's branches, which departments are where, and who works where */
  function loadSitesCard() {
    Promise.all([api("/hospital/sites"), api("/hospital/ops/structure")]).then(function (res) {
      var sr = res[0], st = res[1], box = el("cu-sites"); if (!box || !sr.ok) return;
      var sites = sr.items, team = (st.team || []).filter(function (t) { return t.status === "active"; });
      var h = '<h3>🏥 Sites</h3><p class="sub">' + (sites.length ? "Each department and ward belongs to a site. Patients keep one record across all of them; the queue, beds and board can show one site at a time (pick it at the top of the page)." :
        "One building? You don't need this. If you run branches or a separate centre, name your main site first: your existing departments, wards and team join it. Then add the others.") + "</p>";
      h += sites.length ? '<div class="cu-sitelist">' + sites.map(function (x) {
        return '<div class="cu-site' + (x.active ? "" : " off") + '"><div class="grow"><b>' + esc(x.name) + "</b>" + (x.code ? ' <span class="pill">' + esc(x.code) + "</span>" : "") + (x.main ? ' <span class="pill ok">Main</span>' : "") +
          '<small>' + esc([x.city, x.departments + " departments", x.beds + " beds", x.staff + " people"].filter(Boolean).join(" · ")) + "</small></div>" +
          '<button type="button" class="btn btn-sm btn-ghost" data-site-edit="' + esc(x.id) + '">Edit</button></div>';
      }).join("") + "</div>" : "";
      h += '<form class="cu-siteform" id="cu-siteform" novalidate><input type="hidden" id="cs-id"><div class="grid3"><div class="field"><label for="cs-name">' + (sites.length ? "Site name" : "Your main site") + '</label><input class="input" id="cs-name" maxlength="80" placeholder="e.g. Main campus, Hinjewadi branch"></div>' +
        '<div class="field"><label for="cs-code">Short code</label><input class="input" id="cs-code" maxlength="6" placeholder="e.g. HJW"></div><div class="field"><label for="cs-city">City</label><input class="input" id="cs-city" maxlength="60"></div></div>' +
        '<div class="row"><label class="check" id="cs-mainw" hidden><input type="checkbox" id="cs-main"> Make this the main site</label><label class="check" id="cs-activew" hidden><input type="checkbox" id="cs-active" checked> Open</label><span class="grow"></span>' +
        '<button type="button" class="btn btn-ghost" id="cs-cancel" hidden>Cancel</button><button class="btn btn-primary" type="submit" id="cs-save">' + (sites.length ? "Add site" : "Name the main site") + "</button></div></form>";
      if (sites.length > 1) {
        h += '<details class="cu-sitemap"><summary>Departments by site</summary><div class="cu-place">' + st.departments.filter(function (d) { return d.active; }).map(function (d) {
          return '<label><span>' + esc(d.name) + '</span><select class="input input-sm" data-place-dept="' + esc(d.id) + '">' + sites.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === d.site_id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>";
        }).join("") + '</div><p class="mini">A department’s wards move with it.</p></details>';
        h += '<details class="cu-sitemap"><summary>Who works where</summary><div class="cu-who"><table class="t"><thead><tr><th>Person</th>' + sites.map(function (x) { return "<th>" + esc(x.code || x.name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
          team.map(function (t) { return "<tr><td>" + esc(t.name) + "</td>" + sites.map(function (x) { var on = ((sr.staff_sites || {})[t.id] || []).indexOf(x.id) >= 0; return '<td><input type="checkbox" aria-label="' + esc(t.name + " at " + x.name) + '" data-works="' + esc(t.id) + '" value="' + esc(x.id) + '"' + (on ? " checked" : "") + "></td>"; }).join("") + "</tr>"; }).join("") +
          '</tbody></table></div><p class="mini">Ticks save straight away.</p></details>';
      }
      box.innerHTML = h;
      var form = el("cu-siteform");
      form.onsubmit = function (e) {
        e.preventDefault();
        var body = { id: el("cs-id").value, name: el("cs-name").value.trim(), code: el("cs-code").value.trim(), city: el("cs-city").value.trim() };
        if (body.id) { body.main = el("cs-main").checked; body.active = el("cs-active").checked; }
        api("/hospital/sites", { method: "POST", body: body }).then(function (x) { toast(x.message, x.ok ? "" : "err"); if (x.ok) { loadSitesCard(); H().reloadSites(); } });
      };
      el("cs-cancel").onclick = function () { loadSitesCard(); };
      box.onclick = function (e) {
        var t = e.target.closest("[data-site-edit]"); if (!t) return;
        var x = sites.filter(function (y) { return y.id === t.getAttribute("data-site-edit"); })[0];
        el("cs-id").value = x.id; el("cs-name").value = x.name; el("cs-code").value = x.code || ""; el("cs-city").value = x.city || "";
        el("cs-main").checked = x.main; el("cs-active").checked = x.active; el("cs-mainw").hidden = x.main; el("cs-activew").hidden = false; el("cs-cancel").hidden = false;
        el("cs-save").textContent = "Save site"; el("cs-name").focus();
      };
      box.onchange = function (e) {
        var p = e.target.closest("[data-place-dept]");
        if (p) return api("/hospital/sites/place", { method: "POST", body: { kind: "department", id: p.getAttribute("data-place-dept"), site_id: p.value } }).then(function (x) { toast(x.ok ? "Moved." : x.message, x.ok ? "" : "err"); });
        var w = e.target.closest("[data-works]");
        if (w) {
          var sid = w.getAttribute("data-works");
          var ids = [].map.call(box.querySelectorAll('[data-works="' + sid + '"]:checked'), function (i) { return i.value; });
          api("/hospital/sites/staff", { method: "POST", body: { staff_id: sid, site_ids: ids } }).then(function (x) { if (!x.ok) toast(x.message, "err"); });
        }
      };
    });
  }
  function human(m) { m = +m; return m < 60 ? m + " min" : m < 1440 ? (Math.round(m / 6) / 10) + " h" : (Math.round(m / 144) / 10) + " days"; }

  function drawFields(list) {
    var box = el("cu-fields"); if (!box) return;
    box.innerHTML = list.map(function (f, i) {
      return '<div class="cu-field" data-i="' + i + '"><input class="input" data-f="label" maxlength="48" placeholder="Question" value="' + esc(f.label) + '" aria-label="Question">' +
        '<select class="input" data-f="type" aria-label="Kind of answer">' + [["text", "Text"], ["number", "Number"], ["date", "Date"], ["choice", "Choice"], ["yesno", "Yes / no"]].map(function (t) { return '<option value="' + t[0] + '"' + (f.type === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
        '<input class="input" data-f="options" placeholder="Choices, separated by commas" value="' + esc((f.options || []).join(", ")) + '"' + (f.type === "choice" ? "" : " hidden") + ' aria-label="Choices">' +
        '<label class="check"><input type="checkbox" data-f="required"' + (f.required ? " checked" : "") + "> Required</label>" +
        '<button type="button" class="vp-x link" data-up="' + i + '" aria-label="Move up"' + (i ? "" : " disabled") + ">↑</button><button type=\"button\" class=\"link\" data-del=\"" + i + '" aria-label="Remove">✕</button></div>';
    }).join("") || '<div class="empty">None yet.</div>';
  }
  function readFieldRows() {
    return [].map.call(document.querySelectorAll("#cu-fields .cu-field"), function (row) {
      var g = function (k) { return row.querySelector('[data-f="' + k + '"]'); };
      return { label: g("label").value.trim(), type: g("type").value, required: g("required").checked, options: g("options").value.split(",").map(function (x) { return x.trim(); }).filter(Boolean) };
    });
  }

  function savePrefs(body) {
    api("/hospital/custom/prefs", { method: "POST", body: body }).then(function (x) {
      if (!x.ok) return toast(x.message || "Couldn’t save.", "err");
      C.prefs = x.item; apply(C); toast("Saved.");
      if (H().me()) { H().me().custom = C; }
    });
  }

  function wire(box, r) {
    box.onclick = function (e) {
      var t = e.target;
      var d = t.closest("[data-density]"); if (d) { box.querySelectorAll("[data-density]").forEach(function (x) { x.classList.toggle("on", x === d); x.setAttribute("aria-checked", x === d); }); return savePrefs({ density: d.getAttribute("data-density") }); }
      var p = t.closest("[data-pin]"); if (p) { p.classList.toggle("on"); p.setAttribute("aria-pressed", p.classList.contains("on")); return savePrefs({ pinned: [].map.call(box.querySelectorAll("[data-pin].on"), function (x) { return x.getAttribute("data-pin"); }) }); }
      var a = t.closest("[data-accent]"); if (a) { el("cu-accent").value = a.getAttribute("data-accent"); preview(); return; }
      if (t.id === "cu-add-field") { var l = readFieldRows(); l.push({ label: "", type: "text" }); drawFields(l); var last = box.querySelector("#cu-fields .cu-field:last-child input"); if (last) last.focus(); return; }
      var del = t.closest("[data-del]"); if (del) { var l2 = readFieldRows(); l2.splice(+del.getAttribute("data-del"), 1); drawFields(l2); return; }
      var up = t.closest("[data-up]"); if (up) { var l3 = readFieldRows(), i = +up.getAttribute("data-up"); l3.splice(i - 1, 0, l3.splice(i, 1)[0]); drawFields(l3); return; }
      if (t.id === "cu-save-fields") {
        return api("/hospital/custom/fields", { method: "POST", body: { fields: readFieldRows().filter(function (f) { return f.label; }) } }).then(function (x) { toast(x.ok ? "Questions saved." : x.message, x.ok ? "" : "err"); if (x.ok) { C.fields = x.item; drawFields(x.item); } });
      }
      if (t.id === "cu-save-targets") {
        var body = {}; box.querySelectorAll("[data-target]").forEach(function (i) { body[i.getAttribute("data-target")] = +i.value; });
        return api("/hospital/custom/targets", { method: "POST", body: body }).then(function (x) { toast(x.ok ? "Targets saved." : x.message, x.ok ? "" : "err"); if (x.ok) C.targets = x.item; });
      }
      if (t.id === "cu-save-words") {
        var terms = {}; box.querySelectorAll("[data-term]").forEach(function (i) { terms[i.getAttribute("data-term")] = i.value.trim(); });
        return Promise.all([api("/hospital/custom/terms", { method: "POST", body: terms }), api("/hospital/custom/numbering", { method: "POST", body: { mrn_prefix: el("cu-prefix").value.trim() } })]).then(function (x) {
          var bad = x.filter(function (y) { return !y.ok; })[0];
          if (bad) return toast(bad.message, "err");
          C.terms = x[0].item; C.numbering = x[1].item; toast("Saved. Reload to see the new words everywhere."); H().refreshMe && H().refreshMe();
        });
      }
      if (t.id === "cu-nologo") { return api("/hospital/custom/branding", { method: "POST", body: { remove_logo: true } }).then(function (x) { if (x.ok) { C.branding = x.item; apply(C); load(); } }); }
      if (t.id === "cu-save-look") { return saveLook(); }
    };
    box.oninput = function (e) {
      if (e.target.id === "cu-accent") preview();
      var tg = e.target.closest && e.target.closest("[data-target]"); if (tg && tg.getAttribute("data-target") !== "discharge_by_hour") tg.closest(".cu-target").querySelector("small").textContent = human(tg.value);
      var ty = e.target.closest && e.target.closest('[data-f="type"]');
      if (ty) ty.parentNode.querySelector('[data-f="options"]').hidden = ty.value !== "choice";
    };
    box.onchange = function (e) {
      if (e.target.id === "cu-home") savePrefs({ home: e.target.value });
      if (e.target.id === "cu-calm") savePrefs({ reduce_motion: e.target.checked });
      if (e.target.matches && e.target.matches('[data-f="type"]')) e.target.parentNode.querySelector('[data-f="options"]').hidden = e.target.value !== "choice";
    };
    if (el("cu-accent")) preview();
  }

  function contrast(hex) {
    var l = function (h) { return [1, 3, 5].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); };
    var a = l(hex), L = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    return (1.05) / (L + 0.05);
  }
  function preview() {
    var v = el("cu-accent").value, pv = el("cu-preview"), ok = contrast(v) >= 3;
    pv.style.setProperty("--pv", v);
    document.querySelectorAll(".cu-sw").forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-accent") === v); });
    var c = el("cu-contrast"); c.textContent = ok ? "Contrast on white " + contrast(v).toFixed(1) + ":1 ✓" : "Too light: text on it would be hard to read (needs 3:1, this is " + contrast(v).toFixed(1) + ":1).";
    c.className = "hint " + (ok ? "ok" : "bad");
  }
  function saveLook() {
    var f = el("cu-logo").files[0], btn = el("cu-save-look");
    btn.disabled = true;
    var body = { accent: el("cu-accent").value, short_name: el("cu-short").value.trim(), letterhead: el("cu-letter").value.split("\n"), footer: el("cu-footer").value.trim() };
    var p;
    if (f) {
      var fd = new FormData(); fd.append("logo", f);
      Object.keys(body).forEach(function (k) { fd.append(k, k === "letterhead" ? body[k].join("\n") : body[k]); });
      p = fetch(H().P.API + "/hospital/custom/branding", { method: "POST", credentials: "include", body: fd }).then(function (x) { return x.json(); });
    } else p = api("/hospital/custom/branding", { method: "POST", body: body });
    p.then(function (x) {
      btn.disabled = false;
      if (!x.ok) return toast(x.message || "Couldn’t save.", "err");
      C.branding = x.item; apply(C); toast("Saved. Everyone sees the new look now."); load();
    }, function () { btn.disabled = false; toast("Couldn’t save.", "err"); });
  }

  window.QCCustom = { apply: apply, term: term, tabs: tabs, loaders: loaders, fieldsForm: fieldsForm, readFields: readFields, data: function () { return C; } };
})();
