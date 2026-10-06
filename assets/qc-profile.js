/* Shared profile widgets + rules for the onboarding wizard and the Profile page.
 *
 *  - merges the server's option lists with built-in fallbacks (so the UI is complete
 *    even before a backend update is deployed)
 *  - rules: pregnancy only where it can apply, a condition is either ongoing or past
 *  - widgets: pills, searchable chip clouds with a real "Add" button, blood-group picker
 *    with rare/complex types, profile-strength meter
 *
 *  Usage: QCProfile.bind(state, rerenderFn); then put the html helpers in your template.
 */
(function () {
  "use strict";
  var P = window.QCProfile = {};

  var FALLBACK = {
    past_conditions: [
      "Appendectomy", "Gallbladder removal", "Tonsillectomy", "Hernia repair", "C-section", "Heart surgery / bypass",
      "Stent / angioplasty", "Fracture (healed)", "Joint replacement", "Tuberculosis (treated)", "COVID-19 (recovered)",
      "Dengue (recovered)", "Malaria (recovered)", "Typhoid (recovered)", "Hepatitis (recovered)", "Pneumonia (recovered)",
      "Kidney stones", "DVT / Blood clot (resolved)", "Stroke (recovered)", "Cancer (in remission)", "Gestational diabetes",
      "Pre-eclampsia", "Depression (resolved)", "Blood transfusion"
    ],
    blood_common: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    blood_rare: ["Bombay (hh)", "Rh-null (Golden blood)", "Duffy-negative", "Kell-positive (K+)", "Kidd-negative", "Lutheran-negative", "Para-Bombay", "Rare / other (not listed)"]
  };
  var RARE_NOTES = {
    "Bombay (hh)": "Bombay (hh) blood can only receive Bombay blood — not even O. Flagging it can save your life in an emergency.",
    "Rh-null (Golden blood)": "Rh-null is one of the rarest types in the world. Only Rh-null donors are compatible.",
    "Para-Bombay": "Para-Bombay looks like a normal group on basic tests but behaves like Bombay. Worth confirming with a lab."
  };
  P.PREGNANCY_MIN_AGE = 10; P.PREGNANCY_MAX_AGE = 60;

  var SEX_UI = {
    female: { label: "Female", emoji: "♀️" },
    male: { label: "Male", emoji: "♂️" },
    other: { label: "Intersex / other", emoji: "⚧️" },
    unknown: { label: "Prefer not to say", emoji: "🤐" }
  };
  var LIFE_UI = {
    smoking: { unknown: "🤐 Prefer not to say", never: "🌿 Never", occasional: "🚬 Occasional", regular: "🚬 Regular", "ex-smoker": "🎉 Ex-smoker" },
    alcohol: { unknown: "🤐 Prefer not to say", none: "🥤 None", occasional: "🍷 Occasional", moderate: "🍻 Moderate", heavy: "⚠️ Heavy" },
    exercise: { unknown: "🤐 Prefer not to say", sedentary: "🛋️ Sedentary", light: "🚶 Light", moderate: "🏃 Moderate", active: "🏋️ Active" }
  };
  P.SEX_UI = SEX_UI; P.LIFE_UI = LIFE_UI;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lc(s) { return String(s || "").toLowerCase(); }
  P.esc = esc;

  /* ---------- options ---------- */
  P.options = function (server) {
    var o = Object.assign({}, server || {});
    o.past_conditions = (o.past_conditions && o.past_conditions.length) ? o.past_conditions : FALLBACK.past_conditions;
    var common = (o.blood_types_common && o.blood_types_common.length) ? o.blood_types_common : FALLBACK.blood_common;
    var rare = (o.blood_types_rare && o.blood_types_rare.length) ? o.blood_types_rare : FALLBACK.blood_rare;
    o.blood_types_common = common; o.blood_types_rare = rare;
    o.blood_types = ["unknown"].concat(common, rare);
    o.sex_options = (o.sex_options && o.sex_options.length > 1) ? o.sex_options : ["female", "male", "other", "unknown"];
    ["smoking_options", "alcohol_options", "exercise_options"].forEach(function (k) {
      if (!o[k] || o[k].length < 2) o[k] = Object.keys(LIFE_UI[k.replace("_options", "")]);
    });
    ["known_conditions", "known_family_history", "common_med_allergies", "common_food_allergies", "common_env_allergies"].forEach(function (k) { o[k] = o[k] || []; });
    if (o.pregnancy_age_range) { P.PREGNANCY_MIN_AGE = o.pregnancy_age_range[0]; P.PREGNANCY_MAX_AGE = o.pregnancy_age_range[1]; }
    return o;
  };

  /* ---------- rules ---------- */
  P.pregnancyApplicable = function (st) {
    if (st.sex === "male") return false;
    var age = parseInt(st.age, 10);
    if (!isNaN(age) && (age < P.PREGNANCY_MIN_AGE || age > P.PREGNANCY_MAX_AGE)) return false;
    return true;
  };
  P.applyRules = function (st) {
    var notes = [];
    if (st.pregnant && !P.pregnancyApplicable(st)) { st.pregnant = false; notes.push("Pregnancy cleared — it doesn't apply with the details you've entered."); }
    st.conditions = st.conditions || []; st.past_conditions = st.past_conditions || [];
    var ongoing = st.conditions.map(lc);
    var before = st.past_conditions.length;
    st.past_conditions = st.past_conditions.filter(function (c) { return ongoing.indexOf(lc(c)) < 0; });
    if (st.past_conditions.length !== before) notes.push("Moved a condition from past to ongoing.");
    return notes;
  };

  /* ---------- binding ---------- */
  var ctx = { state: null, rerender: function () {}, onChange: function () {} };
  P.bind = function (state, rerender, onChange) { ctx.state = state; ctx.rerender = rerender || ctx.rerender; ctx.onChange = onChange || ctx.onChange; };
  function changed() { var n = P.applyRules(ctx.state); ctx.onChange(n); return n; }

  /* ---------- widgets ---------- */
  P.pillRow = function (cat, opts, labels) {
    return '<div class="pill-row" role="radiogroup">' + opts.map(function (v) {
      var label = (labels && labels[v]) || (v.charAt(0).toUpperCase() + v.slice(1));
      var on = ctx.state[cat] === v;
      return '<span class="pill' + (on ? ' sel' : '') + '" role="radio" aria-checked="' + on + '" tabindex="0" data-cat="' + cat + '" data-v="' + esc(v) + '" onclick="QCProfile.pick(this)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();QCProfile.pick(this)}">' + esc(label) + '</span>';
    }).join("") + '</div>';
  };
  P.pick = function (el) {
    var cat = el.dataset.cat, v = el.dataset.v;
    var group = el.closest(".pill-row");
    group.querySelectorAll('.pill[data-cat="' + cat + '"]').forEach(function (p) { p.classList.remove("sel"); p.setAttribute("aria-checked", "false"); });
    el.classList.add("sel"); el.setAttribute("aria-checked", "true");
    ctx.state[cat] = v;
    var notes = changed();
    if (cat === "sex" || cat === "blood_type") ctx.rerender(notes);
  };

  P.sexPicker = function () {
    var labels = {}, opts = ["female", "male", "other", "unknown"];
    opts.forEach(function (k) { labels[k] = SEX_UI[k].emoji + " " + SEX_UI[k].label; });
    return '<div class="sec-label">Biological sex</div>' + P.pillRow("sex", opts, labels) +
      '<div class="qcp-help">The sex you were assigned at birth. We use it only for medical accuracy — symptom checks, reference ranges and pregnancy questions. It isn\'t about identity.</div>';
  };

  P.lifestyle = function (cat, title) {
    var opts = Object.keys(LIFE_UI[cat]);
    return '<div class="sec-label">' + title + '</div>' + P.pillRow(cat, opts, LIFE_UI[cat]);
  };

  P.bloodGroup = function (opt) {
    var cur = ctx.state.blood_type, rare = opt.blood_types_rare, isRare = rare.indexOf(cur) >= 0;
    var commonLabels = { unknown: "🤷 Not sure" };
    var html = '<div class="sec-label">Blood group <span class="field-opt">optional</span></div>' +
      P.pillRow("blood_type", ["unknown"].concat(opt.blood_types_common), commonLabels) +
      '<details class="qcp-rare"' + (isRare ? ' open' : '') + '><summary>🩸 Have a rare or complex type? <span>Bombay, Rh-null and more</span></summary>' +
      P.pillRow("blood_type", rare, {}) +
      (RARE_NOTES[cur] ? '<div class="qcp-note">' + esc(RARE_NOTES[cur]) + '</div>' : '') +
      '</details>';
    return html;
  };

  /* chip cloud with search + custom entries + a real Add button */
  P.chipCloud = function (cat, items, placeholder, opt) {
    opt = opt || {};
    var cur = ctx.state[cat] || [];
    var searchable = opt.search !== false && items.length > 14;
    var html = '';
    if (searchable) html += '<input type="search" class="qcp-search" placeholder="Search ' + esc(opt.noun || "list") + '…" aria-label="Search" oninput="QCProfile.filter(this)">';
    html += '<div class="chip-cloud" data-cloud="' + cat + '">';
    items.forEach(function (item) {
      if (item === "None") {
        html += '<span class="chip none-chip' + (cur.length === 0 ? ' sel' : '') + '" data-cat="' + cat + '" data-v="__none__" onclick="QCProfile.toggle(this)">None</span>';
      } else {
        html += '<span class="chip' + (cur.indexOf(item) >= 0 ? ' sel' : '') + '" data-cat="' + cat + '" data-v="' + esc(item) + '" onclick="QCProfile.toggle(this)">' + esc(item) + '</span>';
      }
    });
    cur.filter(function (v) { return items.indexOf(v) < 0; }).forEach(function (v) {
      html += '<span class="chip sel custom-chip" data-cat="' + cat + '" data-v="' + esc(v) + '" onclick="QCProfile.toggle(this)">' + esc(v) + ' ×</span>';
    });
    html += '</div><div class="qcp-add"><input type="text" class="extra-input" data-cat="' + cat + '" placeholder="' + esc(placeholder || "Add your own — then press Enter") + '" ' +
      'onkeydown="if(event.key===\'Enter\'){event.preventDefault();QCProfile.add(\'' + cat + '\',this)}">' +
      '<button type="button" class="qcp-add-btn" onclick="QCProfile.add(\'' + cat + '\',this.previousElementSibling)">+ Add</button></div>';
    return html;
  };
  P.filter = function (input) {
    var q = lc(input.value.trim()), cloud = input.parentNode.querySelector(".chip-cloud");
    cloud.querySelectorAll(".chip").forEach(function (c) {
      var show = !q || c.classList.contains("sel") || lc(c.textContent).indexOf(q) >= 0;
      c.style.display = show ? "" : "none";
    });
  };
  P.toggle = function (el) {
    var cat = el.dataset.cat, v = el.dataset.v, st = ctx.state;
    if (v === "__none__") { st[cat] = []; ctx.rerender([]); return; }
    var arr = st[cat] = st[cat] || [], idx = arr.indexOf(v);
    if (idx < 0) {
      arr.push(v);
      // a condition is either ongoing or past, never both
      var other = cat === "conditions" ? "past_conditions" : cat === "past_conditions" ? "conditions" : null;
      if (other && st[other]) st[other] = st[other].filter(function (x) { return lc(x) !== lc(v); });
    } else arr.splice(idx, 1);
    changed();
    ctx.rerender([], { keepFocusCat: null });
  };
  P.add = function (cat, input) {
    if (!input) return;
    var raw = input.value.trim(); if (!raw) { input.focus(); return; }
    var st = ctx.state, arr = st[cat] = st[cat] || [];
    raw.split(",").map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) {
      if (!arr.some(function (x) { return lc(x) === lc(t); })) arr.push(t);
      var other = cat === "conditions" ? "past_conditions" : cat === "past_conditions" ? "conditions" : null;
      if (other && st[other]) st[other] = st[other].filter(function (x) { return lc(x) !== lc(t); });
    });
    input.value = "";
    changed();
    ctx.rerender([], { keepFocusCat: cat });
  };
  /* Commit anything typed but not yet added -- call before saving / moving on. */
  P.flush = function (root) {
    var st = ctx.state, any = false;
    (root || document).querySelectorAll("input.extra-input").forEach(function (inp) {
      var raw = inp.value.trim(), cat = inp.dataset.cat; if (!raw || !cat) return;
      var arr = st[cat] = st[cat] || [];
      raw.split(",").map(function (t) { return t.trim(); }).filter(Boolean).forEach(function (t) { if (!arr.some(function (x) { return lc(x) === lc(t); })) arr.push(t); });
      inp.value = ""; any = true;
    });
    if (any) changed();
    return any;
  };

  P.pregnancyBlock = function () {
    var st = ctx.state;
    if (!P.pregnancyApplicable(st)) return "";
    return '<div class="sec-label">Currently pregnant?</div><div class="pill-row">' +
      '<span class="pill' + (st.pregnant ? ' sel' : '') + '" tabindex="0" onclick="QCProfile.setPreg(true)">🤰 Yes</span>' +
      '<span class="pill' + (!st.pregnant ? ' sel' : '') + '" tabindex="0" onclick="QCProfile.setPreg(false)">No</span></div>';
  };
  P.setPreg = function (v) { ctx.state.pregnant = !!v; changed(); ctx.rerender([]); };

  /* ---------- profile strength: how much we know, and what would help most ---------- */
  P.strength = function (st) {
    var checks = [
      [!!(st.display_name || "").trim(), 10, "your name"],
      [st.age !== "" && st.age != null, 10, "your age"],
      [st.sex && st.sex !== "unknown", 10, "biological sex"],
      [st.blood_type && st.blood_type !== "unknown", 8, "blood group"],
      [(st.med_allergies || []).length + (st.food_allergies || []).length + (st.env_allergies || []).length > 0 || st._allergiesSeen, 12, "allergies"],
      [(st.conditions || []).length > 0 || st._conditionsSeen, 14, "health conditions"],
      [(st.past_conditions || []).length > 0 || st._pastSeen, 8, "past conditions"],
      [!!(st.medications || "").trim() || st._medsSeen, 8, "current medicines"],
      [(st.family_history || []).length > 0 || st._familySeen, 8, "family history"],
      [st.smoking !== "unknown" && st.alcohol !== "unknown" && st.exercise !== "unknown", 12, "lifestyle"]
    ];
    var pct = 0, missing = [];
    checks.forEach(function (c) { if (c[0]) pct += c[1]; else missing.push(c[2]); });
    return { pct: Math.min(100, pct), missing: missing };
  };

  /* ---------- styles for the new pieces ---------- */
  var css = '' +
    '.qcp-help{font-size:12.5px;line-height:1.5;color:rgba(16,14,42,.55);margin-top:10px}' +
    '.qcp-note{margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(210,79,40,.08);color:#9a3c1f;font-size:12.5px;line-height:1.5;font-weight:600}' +
    '.qcp-rare{margin-top:12px;border:1.5px dashed rgba(16,14,42,.18);border-radius:14px;padding:10px 14px}' +
    '.qcp-rare[open]{border-style:solid;border-color:rgba(210,79,40,.35);background:rgba(210,79,40,.03)}' +
    '.qcp-rare summary{cursor:pointer;font-weight:700;font-size:13.5px;list-style:none;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}' +
    '.qcp-rare summary::-webkit-details-marker{display:none}.qcp-rare summary span{font-weight:500;font-size:12px;color:rgba(16,14,42,.5)}' +
    '.qcp-rare .pill-row{margin-top:12px}' +
    '.qcp-search{width:100%;padding:10px 14px;border-radius:12px;border:1.5px solid rgba(16,14,42,.14);margin-bottom:12px;font:500 14px "Manrope",sans-serif;background:#fff;color:#100e2a;outline:none}' +
    '.qcp-search:focus{border-color:#0e8f83;box-shadow:0 0 0 3px rgba(14,143,131,.15)}' +
    '.qcp-add{display:flex;gap:8px;margin-top:6px}.qcp-add .extra-input{margin-top:0;flex:1}' +
    '.qcp-add-btn{flex:0 0 auto;border:none;border-radius:10px;padding:0 16px;background:#0e8f83;color:#fff;font:800 13px "Manrope",sans-serif;cursor:pointer;transition:transform .15s,background .15s}' +
    '.qcp-add-btn:hover{background:#0b6f66;transform:translateY(-1px)}' +
    '.pill:focus-visible,.chip:focus-visible{outline:2px solid #0e8f83;outline-offset:2px}' +
    'html[data-theme="dark"] .qcp-help,html[data-theme="dark"] .qcp-rare summary span{color:#a9a6bd}' +
    'html[data-theme="dark"] .qcp-rare{border-color:rgba(255,255,255,.2)}html[data-theme="dark"] .qcp-rare[open]{border-color:rgba(240,130,100,.5);background:rgba(210,79,40,.06)}' +
    'html[data-theme="dark"] .qcp-note{background:rgba(210,79,40,.16);color:#f0a488}' +
    'html[data-theme="dark"] .qcp-search{background:#100e2a;color:#f2f0f8;border-color:rgba(255,255,255,.16)}' +
    'html[data-theme="dark"] .qcp-add-btn{background:#7ee0d4;color:#100e2a}';
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
})();
