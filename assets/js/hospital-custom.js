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
  function apply(custom, me) {
    C = custom || C;
    if (!C || !window.QCTheme) return;
    QCTheme.apply(C, me || (H() && H().me ? H().me() : null));
  }

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
    h += '<div class="cu-head"><div><h2>Make it yours</h2><p class="sub">' + (admin ? "How the portal looks, the words it uses, what it asks at registration and the times your facility holds itself to. Changes apply to everyone straight away." : "Your own layout. Your administrator sets how the portal looks for everyone.") + "</p></div></div>";
    // everyone: my layout
    h += '<div class="card cu-card"><h3>🧑‍💻 Your layout</h3><div class="grid2">' +
      '<div class="field"><label for="cu-home">Open on</label><select class="input" id="cu-home">' + r.tabs.map(function (t) { return '<option value="' + t + '"' + (r.prefs.home === t ? " selected" : "") + ">" + esc(TAB_LABEL[t] || t) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Density</label><div class="seg" role="radiogroup">' + [["comfortable", "Comfortable"], ["compact", "Compact"]].map(function (d) { return '<button type="button" role="radio" aria-checked="' + (r.prefs.density === d[0]) + '" class="' + (r.prefs.density === d[0] ? "on" : "") + '" data-density="' + d[0] + '">' + d[1] + "</button>"; }).join("") + "</div></div></div>" +
      '<div class="field"><label>Pinned to the top bar</label><div class="cu-pins">' + r.tabs.filter(function (t) { return t !== "my-day"; }).map(function (t) { var on = r.prefs.pinned.indexOf(t) >= 0; return '<button type="button" class="chipbtn' + (on ? " on" : "") + '" data-pin="' + t + '" aria-pressed="' + on + '">' + esc(TAB_LABEL[t] || t) + "</button>"; }).join("") + "</div></div>" +
      '<div class="field"><label for="cu-sleep">Put my screen to sleep after</label><select class="input" id="cu-sleep">' +
        [["", "Follow " + esc(orgShort()) + " (" + sleepWord(r.branding.sleep_min) + ")"], ["0", "Never"], ["1", "1 minute"], ["3", "3 minutes"], ["5", "5 minutes"], ["10", "10 minutes"], ["20", "20 minutes"]]
          .map(function (o) { var v = r.prefs.sleep_min == null ? "" : String(r.prefs.sleep_min); return '<option value="' + o[0] + '"' + (o[0] === v ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
        '</select><small class="hint">It goes back to your hospital\u2019s mark, so what you were reading isn\u2019t left on show. Your session still ends after 20 quiet minutes.</small></div>' +
      '<div class="cu-checks">' +
      '<label class="check"><input type="checkbox" id="cu-calm"' + (r.prefs.reduce_motion ? " checked" : "") + "> Fewer animations</label>" +
      '<label class="check"><input type="checkbox" id="cu-flow"' + (r.prefs.flow !== false ? " checked" : "") + "> Slow colour moving behind the pages</label>" +
      '<label class="check"><input type="checkbox" id="cu-lobme"' + (r.prefs.lobby !== false ? " checked" : "") + "> Open through the lobby when I sign in</label></div>" +
      '<div class="row"><button class="btn btn-sm" type="button" id="cu-sleep-now">\ud83c\udf19 Try it now</button></div></div>';
    if (admin) {
      h += '<div class="cu-grid">';
      // look: two colours, a tone, a type, the marks — and what everyone will see
      var lob = b.lobby || {}, orgNm = (H().me() && H().me().org && H().me().org.name) || "your hospital";
      var sample = (b.short_name || b.app_name || orgNm).split(/\s+/)[0].slice(0, 11);
      var sw = function (id, cur, list) {
        return list.map(function (a2) { return '<button type="button" class="cu-sw' + (a2 === cur ? " on" : "") + '" style="background:' + a2 + '" data-sw="' + id + '" data-accent="' + a2 + '" aria-label="' + a2 + '"></button>'; }).join("");
      };
      h += '<div class="card cu-card cu-wide"><h3>🎨 Your look</h3>' +
        '<p class="sub">Two colours and a mark, and every person at ' + esc(orgNm) + ' works inside your hospital, not inside ours — every screen, every printout, the browser tab. <b>Urgent, warning and good keep their own colours everywhere:</b> they mean something, so they are never branded.</p>' +
        '<div class="cu-studio"><div>' +
        '<div class="field"><label>Main colour</label><div class="cu-swatches">' + sw("accent", b.accent, r.accents) +
          '<input type="color" id="cu-accent" value="' + esc(b.accent) + '" aria-label="Pick any colour"></div><small class="hint" id="cu-contrast"></small></div>' +
        '<div class="field"><label for="cu-accent2">Second colour</label><small class="hint">Used in gradients, the lobby and the mark. Never for text.</small><div class="cu-swatches">' + sw("accent2", b.accent2, r.accents) +
          '<input type="color" id="cu-accent2" value="' + esc(b.accent2 || b.accent) + '" aria-label="Pick a second colour">' +
          '<button type="button" class="link" id="cu-auto2">Choose one for me</button></div></div>' +
        '<div class="grid2"><div class="field"><label>Default tone</label><div class="cu-tones" role="radiogroup" id="cu-tones">' +
          [["auto", "Each person chooses"], ["light", "Light"], ["dark", "Dark"]].map(function (t) {
            return '<button type="button" class="cu-tone' + (b.tone === t[0] ? " on" : "") + '" role="radio" aria-checked="' + (b.tone === t[0]) + '" data-tone="' + t[0] + '">' + esc(t[1]) + "</button>";
          }).join("") + "</div></div>" +
        '<div class="field"><label>Type</label><div class="cu-type" role="radiogroup" id="cu-types">' +
          [["modern", "Modern"], ["clean", "Clean"], ["classic", "Classic"]].map(function (t) {
            return '<button type="button" class="t-' + t[0] + (b.type_style === t[0] ? " on" : "") + '" role="radio" aria-checked="' + (b.type_style === t[0]) + '" data-type="' + t[0] + '"><b>' + esc(sample) + "</b><small>" + t[1] + "</small></button>";
          }).join("") + "</div></div></div>" +
        '<div class="grid2"><div class="field"><label for="cu-app">What your team calls it</label><input class="input" id="cu-app" maxlength="40" value="' + esc(b.app_name) + '" placeholder="' + esc(orgNm) + '"><small class="hint">Shown in the top bar and the browser tab.</small></div>' +
          '<div class="field"><label for="cu-tagline">Line under the name</label><input class="input" id="cu-tagline" maxlength="80" value="' + esc(b.tagline) + '" placeholder="e.g. Care that knows you"></div></div>' +
        '<div class="grid2"><div class="field"><label for="cu-short">Short name</label><input class="input" id="cu-short" maxlength="24" value="' + esc(b.short_name) + '" placeholder="e.g. Sunrise"><small class="hint">For tight spaces and printed headers.</small></div>' +
          '<div class="field"><label for="cu-footer">Footer line</label><input class="input" id="cu-footer" maxlength="200" value="' + esc(b.footer) + '" placeholder="e.g. NABH accredited · Emergency 24×7: 020 1234 5600"></div></div>' +
        '<div class="grid2"><div class="field"><label for="cu-logo">Wide logo</label><small class="hint">The top bar and printed letterheads. If your name is drawn into it, we won\u2019t print the name beside it.</small>' +
          (b.logo ? '<div class="cu-mark"><img alt="" src="' + H().P.API + "/hospital/public/logo/" + encodeURIComponent(H().me().org.id) + "?t=" + (b.logo_ts || 0) + '"><button type="button" class="link" id="cu-nologo">Remove</button></div>' : "") +
          '<input class="input" id="cu-logo" type="file" accept="image/png,image/jpeg"></div>' +
          '<div class="field"><label for="cu-markf">Square mark</label><small class="hint">The lobby and the browser tab.</small>' +
          (b.mark ? '<div class="cu-mark"><img alt="" src="' + H().P.API + "/hospital/public/logo/" + encodeURIComponent(H().me().org.id) + "?v=mark&t=" + (b.mark_ts || 0) + '"><button type="button" class="link" id="cu-nomark">Remove</button></div>' : "") +
          '<input class="input" id="cu-markf" type="file" accept="image/png,image/jpeg"></div></div>' +
        '<div class="field"><label for="cu-letter">Letterhead (up to 4 lines on printed documents)</label><textarea class="input" id="cu-letter" rows="3" maxlength="500" placeholder="Sunrise Multispeciality Hospital&#10;12 MG Road, Pune 411001&#10;020 1234 5600">' + esc((b.letterhead || []).join("\n")) + "</textarea></div>" +
        '<button class="btn btn-primary" type="button" id="cu-save-look">Save look</button>' +
        "</div>" + liveBox() + "</div></div>";
      // the lobby
      h += '<div class="card cu-card"><h3>🚪 The lobby</h3><p class="sub">The first thing your team sees when they sign in: your mark, your colours, and this hour’s real numbers. They touch the mark to open their work.</p>' +
        '<label class="check"><input type="checkbox" id="cu-lob-on"' + (lob.on !== false ? " checked" : "") + "> Show the lobby when people sign in</label>" +
        '<div class="field"><label>Background</label><div class="cu-lobstyles" role="radiogroup" id="cu-lobstyles">' +
          [["aurora", "Aurora"], ["orbit", "Orbit"], ["pulse", "Heartbeat"], ["calm", "Calm"]].map(function (t) {
            return '<button type="button" class="' + (lob.style === t[0] ? "on" : "") + '" role="radio" aria-checked="' + (lob.style === t[0]) + '" data-lobstyle="' + t[0] + '">' + esc(t[1]) + "</button>";
          }).join("") + "</div></div>" +
        '<div class="field"><label for="cu-lob-motto">A line under your name, just here</label><input class="input" id="cu-lob-motto" maxlength="90" value="' + esc(lob.motto || "") + '" placeholder="' + esc(b.tagline || "e.g. Since 1974 · 400 beds · one record") + '"></div>' +
        '<label class="check"><input type="checkbox" id="cu-lob-live"' + (lob.live !== false ? " checked" : "") + "> Let live numbers drift past</label>" +
        '<small class="hint">Each person sees only the figures their role already allows.</small>' +
        '<div class="field"><label for="cu-sleepdef">Screens go back to the mark after</label><select class="input" id="cu-sleepdef">' +
          [["0", "Never"], ["1", "1 minute"], ["3", "3 minutes"], ["5", "5 minutes"], ["10", "10 minutes"], ["20", "20 minutes"]]
            .map(function (o) { return '<option value="' + o[0] + '"' + (+o[0] === +b.sleep_min ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") +
          '</select><small class="hint">For shared computers on a ward. Anyone can set their own instead.</small></div>' +
        '<div class="row"><button class="btn" type="button" id="cu-lob-try">See it</button><span class="grow"></span><button class="btn btn-primary" type="button" id="cu-save-lobby">Save lobby</button></div></div>';
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
      var a = t.closest("[data-accent]"); if (a) { el(a.getAttribute("data-sw") === "accent2" ? "cu-accent2" : "cu-accent").value = a.getAttribute("data-accent"); preview(); return; }
      var tn = t.closest("[data-tone]"); if (tn) { box.querySelectorAll("[data-tone]").forEach(function (x) { x.classList.toggle("on", x === tn); x.setAttribute("aria-checked", x === tn); }); return preview(); }
      var ty2 = t.closest("[data-type]"); if (ty2) { box.querySelectorAll("[data-type]").forEach(function (x) { x.classList.toggle("on", x === ty2); x.setAttribute("aria-checked", x === ty2); }); return preview(); }
      var ls = t.closest("[data-lobstyle]"); if (ls) { box.querySelectorAll("[data-lobstyle]").forEach(function (x) { x.classList.toggle("on", x === ls); x.setAttribute("aria-checked", x === ls); }); return; }
      if (t.id === "cu-auto2") { var A = QCTheme.toOklch(el("cu-accent").value) || { L: 0.6, C: 0.12, h: 180 }; el("cu-accent2").value = QCTheme.oklch(Math.min(0.72, A.L + 0.08), Math.min(A.C, 0.16), A.h + 46); return preview(); }
      if (t.id === "cu-nomark") { return api("/hospital/custom/branding", { method: "POST", body: { remove_mark: true } }).then(function (x) { if (x.ok) { C.branding = x.item; apply(C); load(); } }); }
      if (t.id === "cu-lob-try") { return tryLobby(); }
      if (t.id === "cu-sleep-now") { return H().sleep(); }
      if (t.id === "cu-save-lobby") { return saveLobby(); }
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
      if (/^cu-(accent|accent2|app|tagline|lob-motto)$/.test(e.target.id)) preview();
      var tg = e.target.closest && e.target.closest("[data-target]"); if (tg && tg.getAttribute("data-target") !== "discharge_by_hour") tg.closest(".cu-target").querySelector("small").textContent = human(tg.value);
      var ty = e.target.closest && e.target.closest('[data-f="type"]');
      if (ty) ty.parentNode.querySelector('[data-f="options"]').hidden = ty.value !== "choice";
    };
    box.onchange = function (e) {
      if (e.target.id === "cu-home") savePrefs({ home: e.target.value });
      if (e.target.id === "cu-calm") savePrefs({ reduce_motion: e.target.checked });
      if (e.target.id === "cu-lobme") savePrefs({ lobby: e.target.checked });
      if (e.target.id === "cu-flow") savePrefs({ flow: e.target.checked });
      if (e.target.id === "cu-sleep") savePrefs({ sleep_min: e.target.value === "" ? null : +e.target.value });
      if (e.target.matches && e.target.matches('[data-f="type"]')) e.target.parentNode.querySelector('[data-f="options"]').hidden = e.target.value !== "choice";
    };
    if (el("cu-accent")) preview();
  }

  function liveBox() {
    return '<div class="cu-live" id="cu-live"><h4>What everyone will see</h4>' +
      '<div class="cu-shot"><div class="s-blobs"><i></i><i></i></div><div class="s-mid">' +
        '<div class="s-mark" id="cu-sh-mark"></div><div class="s-nm" id="cu-sh-name"></div><div class="s-tg" id="cu-sh-tag"></div>' +
      "</div></div>" +
      '<div class="cu-rows"><div class="s-bar"><span class="s-pill">Call in</span><span class="s-ghost">Patients</span><span class="s-ghost">Beds</span></div>' +
        '<div class="s-card"><b id="cu-sh-kpi">12 waiting in OPD</b><small>average wait 18 min</small></div>' +
        '<div class="s-state"><i class="st-good">Within target</i><i class="st-warn">Needs a look</i><i class="st-bad">Urgent</i></div></div>' +
      '<p class="cu-note">Your lobby, then your screens. The three states keep their own colours so nobody has to learn new ones.</p></div>';
  }
  function orgShort() {
    var b = (C && C.branding) || {};
    return b.short_name || b.app_name || ((H().me() && H().me().org && H().me().org.name) || "your hospital").split(/\s+/)[0];
  }
  function sleepWord(m) { return !+m ? "never" : +m === 1 ? "1 minute" : +m + " minutes"; }
  function tonePick() { var on = document.querySelector("#cu-tones .cu-tone.on"); return on ? on.getAttribute("data-tone") : "auto"; }
  function typePick() { var on = document.querySelector("#cu-types button.on"); return on ? on.getAttribute("data-type") : "modern"; }
  function lobPick() { var on = document.querySelector("#cu-lobstyles button.on"); return on ? on.getAttribute("data-lobstyle") : "aurora"; }
  var FONTS = { modern: "'Space Grotesk'", clean: "'Manrope'", classic: "'Fraunces', Georgia" };

  function contrast(hex) {
    var l = function (h) { return [1, 3, 5].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); };
    var a = l(hex), L = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    return (1.05) / (L + 0.05);
  }
  function preview() {
    var box = el("cu-live"); if (!box || !window.QCTheme) return;
    var v = el("cu-accent").value, v2 = el("cu-accent2").value;
    var tone = tonePick(), dark = tone === "dark" || (tone === "auto" && document.documentElement.getAttribute("data-theme") === "dark");
    var P = QCTheme.palette(v, v2, dark);
    [["--pv", P.brand], ["--pv2", P.alt], ["--pv-sand", P.sand], ["--pv-card", P.card], ["--pv-ink", P.ink],
     ["--pv-on", P.brandInk], ["--pv-deep", P.onBrandSoft], ["--pv-font", FONTS[typePick()]]].forEach(function (kv) { box.style.setProperty(kv[0], kv[1]); });
    document.querySelectorAll('[data-sw="accent"]').forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-accent") === v); });
    document.querySelectorAll('[data-sw="accent2"]').forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-accent") === v2); });
    var nm = el("cu-app").value.trim() || (H().me() && H().me().org ? H().me().org.name : "Hospital");
    el("cu-sh-name").textContent = nm;
    var tg = el("cu-lob-motto") && el("cu-lob-motto").value.trim();
    el("cu-sh-tag").textContent = tg || el("cu-tagline").value.trim();
    var mk = el("cu-sh-mark"), b = C.branding || {};
    var url = b.mark || b.logo ? H().P.API + "/hospital/public/logo/" + encodeURIComponent(H().me().org.id) + (b.mark ? "?v=mark&t=" + (b.mark_ts || 0) : "?t=" + (b.logo_ts || 0)) : "";
    mk.innerHTML = url ? '<img alt="" src="' + esc(url) + '">' : "";
    if (!url) mk.textContent = nm.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase() || "H";
    var ok = contrast(v) >= 3, c = el("cu-contrast");
    var deepened = P.brandBtn.toLowerCase() !== String(v).toLowerCase();
    c.textContent = !ok ? "Too light to use: text on it would be hard to read (needs 3:1, this is " + contrast(v).toFixed(1) + ":1)."
      : deepened ? "Good. Buttons and links use a slightly deeper shade of it so their words stay easy to read."
      : "Good. Words read clearly on it everywhere.";
    c.className = "hint " + (ok ? "ok" : "bad");
  }
  function saveLook() {
    var f = el("cu-logo").files[0], fm = el("cu-markf").files[0], btn = el("cu-save-look");
    btn.disabled = true;
    var body = { accent: el("cu-accent").value, accent2: el("cu-accent2").value, tone: tonePick(), type_style: typePick(),
      app_name: el("cu-app").value.trim(), tagline: el("cu-tagline").value.trim(), short_name: el("cu-short").value.trim(),
      letterhead: el("cu-letter").value.split("\n"), footer: el("cu-footer").value.trim() };
    var p;
    if (f || fm) {
      var fd = new FormData();
      if (f) fd.append("logo", f);
      if (fm) fd.append("mark", fm);
      Object.keys(body).forEach(function (k) { fd.append(k, k === "letterhead" ? body[k].join("\n") : body[k]); });
      p = fetch(H().P.API + "/hospital/custom/branding", { method: "POST", credentials: "include", body: fd }).then(function (x) { return x.json(); });
    } else p = api("/hospital/custom/branding", { method: "POST", body: body });
    p.then(function (x) {
      btn.disabled = false;
      if (!x.ok) return toast(x.message || "Couldn’t save.", "err");
      C.branding = x.item; apply(C);
      if (H().me()) H().me().custom = C;
      toast("Saved. Everyone at your hospital sees this now."); load();
    }, function () { btn.disabled = false; toast("Couldn’t save.", "err"); });
  }
  function lobbyBody() {
    return { lobby: { on: el("cu-lob-on").checked, style: lobPick(), motto: el("cu-lob-motto").value.trim(), live: el("cu-lob-live").checked },
             sleep_min: +el("cu-sleepdef").value };
  }
  function saveLobby() {
    api("/hospital/custom/branding", { method: "POST", body: lobbyBody() }).then(function (x) {
      if (!x.ok) return toast(x.message || "Couldn’t save.", "err");
      C.branding = x.item; apply(C);
      if (H().me()) H().me().custom = C;
      toast("Saved. Your team arrives here from now on."); load();
    });
  }
  function tryLobby() {                                  // show it with the settings on screen, saved or not
    if (!window.QCLobby || !H().me()) return;
    var keep = C.branding.lobby;
    C.branding.lobby = lobbyBody().lobby;
    QCLobby.show(H().me()).then(function () { C.branding.lobby = keep; });
  }

  window.QCCustom = { apply: apply, term: term, preview: preview, tabs: tabs, loaders: loaders, fieldsForm: fieldsForm, readFields: readFields, data: function () { return C; } };
})();
