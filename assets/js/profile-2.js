var STORAGE_KEY = 'qc-theme';
var root = document.documentElement;
var SUN_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1L5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
var MOON_ICON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="#100e2a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
function applyTheme(dark) {
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  var icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.innerHTML = dark ? SUN_ICON : MOON_ICON;
}
window.toggleTheme = function () { applyTheme(root.getAttribute('data-theme') !== 'dark'); };
if (root.getAttribute('data-theme') === 'dark') applyTheme(true);

const API_BASE = "https://app.querocura.com/api";

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function cap(s) { s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

let options = null;
let state = {
  display_name: "", age: "", sex: "unknown", blood_type: "unknown",
  med_allergies: [], food_allergies: [], env_allergies: [],
  conditions: [], past_conditions: [], medications: "", family_history: [],
  smoking: "unknown", alcohol: "unknown", exercise: "unknown",
  pregnant: false, occupation: "",
};
let savedSnapshot = null; // last-saved state, for Cancel to restore from
let userInfo = null;

function mergeProfileIntoState(p) {
  if (!p) return;
  ["display_name","sex","blood_type","medications","smoking","alcohol","exercise","occupation"].forEach(k => {
    if (p[k] !== undefined && p[k] !== null) state[k] = p[k];
  });
  if (p.age !== undefined && p.age !== null) state.age = p.age;
  ["med_allergies","food_allergies","env_allergies","conditions","past_conditions","family_history"].forEach(k => {
    if (Array.isArray(p[k])) state[k] = p[k].slice();
  });
  if (typeof p.pregnant === "boolean") state.pregnant = p.pregnant;
}

async function saveProfile() {
  QCProfile.flush(document);
  QCProfile.applyRules(state);
  const payload = Object.assign({}, state, { wizard_done: true });
  const res = await fetch(API_BASE + "/profile", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.message || "Couldn't save your profile.");
  return data;
}

/* ---- Reusable widgets now live in assets/qc-profile.js (shared with onboarding) ---- */
const esc2 = QCProfile.esc;
function pillRow(cat, opts, labels) { return QCProfile.pillRow(cat, opts, labels); }
function chipCloud(cat, items, placeholder) { return QCProfile.chipCloud(cat, items, placeholder); }

function floatField(id, cat, label, type, opt) {
  opt = opt || {};
  const val = state[cat] == null ? "" : state[cat];
  const filled = val !== "" ? " filled" : "";
  const tag = type === "textarea" ? "textarea" : "input";
  const openTag = tag === "textarea"
    ? '<textarea class="field-input' + filled + '" id="' + id + '" rows="' + (opt.rows || 3) + '" placeholder=" " ' +
        'data-cat="' + cat + '" data-h-input="qcSetText">' + esc(val) + '</textarea>'
    : '<input class="field-input' + filled + '" id="' + id + '" type="' + (type || "text") + '" placeholder=" " value="' + esc(val) + '" ' +
        (opt.min !== undefined ? 'min="' + opt.min + '" ' : '') + (opt.max !== undefined ? 'max="' + opt.max + '" ' : '') +
        'data-cat="' + cat + '" data-h-input="qcSetText">';
  return '<div class="field"><div class="field-inner">' + openTag +
    '<label class="field-label" for="' + id + '">' + esc(label) + (opt.optional ? ' <span class="field-opt">optional</span>' : '') + '</label>' +
    '</div></div>';
}
window.qcSetText = function (el, cat) {
  el.classList.toggle('filled', el.value.length > 0);
  state[cat] = cat === 'age' ? (el.value === '' ? '' : el.value) : el.value;
};

/* ---- Section definitions ---- */
const BLOOD_LABELS = { unknown: "Not sure" };
const LIFESTYLE_LABELS = { unknown: "Prefer not to say", none: "None" };

function sexLabel(v) { return (QCProfile.SEX_UI[v] || { label: cap(v) }).label; }
function tagset(arr, emptyText) {
  if (!arr || !arr.length) return '<span class="tag empty-tag">' + esc(emptyText || "None recorded") + '</span>';
  return '<div class="tagset">' + arr.map(v => '<span class="tag">' + esc(v) + '</span>').join("") + '</div>';
}

const SECTIONS = [
  {
    key: "basics", title: "Basics", icon: "👋", tint: "#e6f6f4",
    view: () => [
      ["Name", esc(state.display_name || "—")],
      ["Age", esc(state.age || "—")],
      ["Biological sex", esc(sexLabel(state.sex))],
      ["Blood group", esc((BLOOD_LABELS[state.blood_type]) || state.blood_type)],
    ],
    edit: () =>
      floatField("f-name", "display_name", "What should we call you?", "text") +
      floatField("f-age", "age", "Age", "number", { min: 1, max: 120, optional: true }) +
      QCProfile.sexPicker() +
      QCProfile.bloodGroup(options),
  },
  {
    key: "allergies", title: "Allergies", icon: "⚠️", tint: "#fdece7",
    view: () => [
      ["Medication", tagset(state.med_allergies)],
      ["Food", tagset(state.food_allergies)],
      ["Environmental", tagset(state.env_allergies)],
    ],
    edit: () =>
      '<div class="esec-label">Medication allergies</div>' + chipCloud("med_allergies", options.common_med_allergies, "Add another — press Enter or tap Add") +
      '<div class="esec-label">Food allergies</div>' + chipCloud("food_allergies", options.common_food_allergies, "Add another — press Enter or tap Add") +
      '<div class="esec-label">Environmental allergies</div>' + chipCloud("env_allergies", options.common_env_allergies, "Add another — press Enter or tap Add"),
  },
  {
    key: "history", title: "Health history", icon: "📋", tint: "#eae8fb",
    view: () => [
      ["Ongoing conditions", tagset(state.conditions)],
      ["Past conditions & surgeries", tagset(state.past_conditions)],
    ],
    edit: () =>
      '<div class="esec-label">Ongoing conditions <span class="field-opt">you live with these now</span></div>' + chipCloud("conditions", options.known_conditions, "Add another ongoing condition — press Enter or tap Add") +
      '<div class="esec-label">Past conditions &amp; surgeries <span class="field-opt">resolved, treated or removed</span></div>' + chipCloud("past_conditions", options.past_conditions, "Add another past condition or surgery — press Enter or tap Add"),
  },
  {
    key: "meds", title: "Medications & family", icon: "💊", tint: "#fbf1dc",
    view: () => [
      ["Current medications", esc(state.medications || "—")],
      ["Family history", tagset(state.family_history)],
    ],
    edit: () =>
      floatField("f-meds", "medications", "Current medications", "textarea", { rows: 3, optional: true }) +
      '<div class="esec-label">Family history</div>' + chipCloud("family_history", options.known_family_history, "Add another — press Enter or tap Add"),
  },
  {
    key: "lifestyle", title: "Lifestyle", icon: "🏃", tint: "#e4f1fb",
    view: () => [
      ["Smoking", esc((LIFESTYLE_LABELS[state.smoking]) || cap(state.smoking))],
      ["Alcohol", esc((LIFESTYLE_LABELS[state.alcohol]) || cap(state.alcohol))],
      ["Exercise", esc((LIFESTYLE_LABELS[state.exercise]) || cap(state.exercise))],
    ],
    edit: () => QCProfile.lifestyle("smoking", "Smoking") + QCProfile.lifestyle("alcohol", "Alcohol") + QCProfile.lifestyle("exercise", "Exercise"),
  },
  {
    key: "other", title: "Pregnancy & occupation", icon: "✨", tint: "#e6f6f4",
    view: () => [
      ["Currently pregnant", QCProfile.pregnancyApplicable(state) ? (state.pregnant ? "Yes" : "No") : "Not applicable"],
      ["Occupation", esc(state.occupation || "—")],
    ],
    edit: () =>
      (QCProfile.pregnancyBlock() || '<div class="qcp-help" style="margin:0 0 14px;">Pregnancy questions don\'t apply with your current details (biological sex / age), so they\'re hidden.</div>') +
      floatField("f-occ", "occupation", "Occupation", "text", { optional: true }),
  },
];

const editingSet = new Set();

QCProfile.bind(state, function (notes, opts) {
  const y = window.scrollY;
  editingSet.forEach(key => renderSection(key, true));
  window.scrollTo(0, y);
  if (opts && opts.keepFocusCat) {
    const inp = document.querySelector('input.extra-input[data-cat="' + opts.keepFocusCat + '"]');
    if (inp) inp.focus();
  }
  updateIdHero();
}, function () {});

function renderAllSections() {
  const box = document.getElementById("qc-sections");
  box.innerHTML = SECTIONS.map(sec => sectionHtml(sec)).join("");
}

function sectionHtml(sec) {
  const isEditing = editingSet.has(sec.key);
  let body;
  if (isEditing) {
    body = '<div class="edit-body">' + sec.edit() +
      '<div class="edit-footer">' +
        '<button type="button" class="btn-save" data-sec="' + sec.key + '" data-h-click="qcSaveSection">Save changes</button>' +
        '<button type="button" class="btn-cancel" data-sec="' + sec.key + '" data-h-click="qcCancelSection">Cancel</button>' +
        '<span class="save-note" id="qc-save-note-' + sec.key + '">Saved ✓</span>' +
      '</div></div>';
  } else {
    body = '<table class="sec-table">' + sec.view().map(([l, v]) =>
      '<tr><td class="rlabel">' + esc(l) + '</td><td class="rvalue">' + v + '</td></tr>'
    ).join("") + '</table>';
  }
  return '<div class="sec-card" data-sec="' + sec.key + '">' +
    '<div class="sec-head">' +
      '<div class="sec-ic" style="--sec-tint:' + sec.tint + '">' + sec.icon + '</div>' +
      '<div class="sec-title">' + esc(sec.title) + '</div>' +
      '<button type="button" class="sec-edit-btn' + (isEditing ? ' is-editing' : '') + '" data-sec="' + sec.key + '" data-h-click="qcToggleEdit">' +
        (isEditing ? 'Editing…' : '✎ Edit') +
      '</button>' +
    '</div>' + body +
  '</div>';
}

function renderSection(key, keepEditing) {
  const card = document.querySelector('.sec-card[data-sec="' + key + '"]');
  if (!card) return;
  const sec = SECTIONS.find(s => s.key === key);
  if (keepEditing) editingSet.add(key);
  card.outerHTML = sectionHtml(sec);
}

window.qcToggleEdit = function (key) {
  if (editingSet.has(key)) editingSet.delete(key);
  else editingSet.add(key);
  renderSection(key, editingSet.has(key));
};

window.qcCancelSection = function (key) {
  if (savedSnapshot) {
    mergeProfileIntoState(savedSnapshot);
  }
  editingSet.delete(key);
  renderSection(key, false);
};

window.qcSaveSection = async function (key) {
  const card = document.querySelector('.sec-card[data-sec="' + key + '"]');
  const saveBtn = card.querySelector(".btn-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try {
    const data = await saveProfile();
    savedSnapshot = data.profile || Object.assign({}, state);
    updateIdHero();
    editingSet.delete(key);
    renderSection(key, false);
    const note = document.getElementById("qc-save-note-" + key);
    // renderSection just replaced the DOM, so re-find isn't needed here --
    // the card is back in view mode. Show a brief confirmation instead by
    // flashing the section border.
    const freshCard = document.querySelector('.sec-card[data-sec="' + key + '"]');
    if (freshCard) {
      freshCard.style.transition = "box-shadow 0.3s ease";
      freshCard.style.boxShadow = "0 0 0 2px rgba(14,143,131,0.4)";
      setTimeout(() => { freshCard.style.boxShadow = ""; }, 900);
    }
  } catch (err) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save changes";
    alert(err.message || "Couldn't save your profile. Please try again.");
  }
};

function updateIdHero() {
  const name = state.display_name || (userInfo && (userInfo.display_name || userInfo.username || userInfo.email)) || "—";
  document.getElementById("qc-id-name").textContent = name;
  const initials = name && name !== "—" ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  document.getElementById("qc-id-avatar").textContent = initials;
  document.getElementById("qc-user-dot").textContent = initials;
  document.getElementById("qc-user-name").textContent = name !== "—" ? name.split(" ")[0] : "";

  const bits = [];
  if (state.age) bits.push(state.age + " y/o");
  if (state.sex && state.sex !== "unknown") bits.push(sexLabel(state.sex));
  if (state.occupation) bits.push(state.occupation);
  document.getElementById("qc-id-meta").textContent = bits.length ? bits.join(" · ") : "No extra details yet — tap Edit below to fill this in.";

  const chipsBox = document.getElementById("qc-id-chips");
  const chips = [];
  const allergies = [].concat(state.med_allergies || [], state.food_allergies || [], state.env_allergies || []);
  allergies.slice(0, 5).forEach(a => chips.push('<span class="id-chip warn">⚠ ' + esc(a) + '</span>'));
  (state.conditions || []).slice(0, 3).forEach(c => chips.push('<span class="id-chip info">' + esc(c) + '</span>'));
  if (state.pregnant && QCProfile.pregnancyApplicable(state)) chips.push('<span class="id-chip info">Pregnant</span>');
  if (state.blood_type && state.blood_type !== "unknown") chips.push('<span class="id-chip' + (/Bombay|Rh-null|Rare/.test(state.blood_type) ? ' warn' : '') + '">🩸 ' + esc(state.blood_type) + '</span>');
  chipsBox.innerHTML = chips.length ? chips.join("") : '<span class="id-chip">No allergies or conditions on file</span>';
  renderHeroExtras(allergies);
}

/* Completeness ring, "next step" card, quick-fact tiles and the photo button label. */
function hasPhoto() { return !!(window.QC && QC.avatar && QC.avatar.cached()); }
function renderHeroExtras(allergies) {
  const real = list => (list || []).filter(x => x && String(x).toLowerCase() !== "none");
  const answered = list => (list || []).length > 0;       // "None" counts as an answer
  const checks = [
    { ok: !!(state.display_name && state.display_name.trim()), tip: "Add your name" },
    { ok: !!state.age, tip: "Add your age" },
    { ok: state.sex && state.sex !== "unknown", tip: "Set your biological sex" },
    { ok: state.blood_type && state.blood_type !== "unknown", tip: "Add your blood group (it matters in emergencies)" },
    { ok: answered(state.med_allergies) || answered(state.food_allergies) || answered(state.env_allergies), tip: "Tell me about any allergies (or choose None)" },
    { ok: answered(state.conditions), tip: "Add your ongoing conditions (or choose None)" },
    { ok: ["smoking", "alcohol", "exercise"].every(k => state[k] && state[k] !== "unknown"), tip: "Fill in your lifestyle (smoking, alcohol, exercise)" },
    { ok: hasPhoto(), tip: "Add a profile photo", photo: true },
  ];
  const done = checks.filter(c => c.ok).length, pct = Math.round(done / checks.length * 100), next = checks.find(c => !c.ok);
  document.getElementById("qc-ring").style.setProperty("--p", pct);
  document.getElementById("qc-complete").innerHTML = '<div class="ic-head">Profile strength<b>' + pct + '%</b></div><div class="ic-bar"><i style="width:' + pct + '%"></i></div>' +
    '<div class="ic-next">' + (next ? 'Next: <a id="qc-next-link">' + esc(next.tip) + '</a>' : '🎉 Your profile is complete. Every analysis is now fully personalised.') + '</div>';
  const nl = document.getElementById("qc-next-link");
  if (nl) nl.addEventListener("click", () => { if (next.photo) QCAvatar.open({ onChange: updateIdHero }); else document.getElementById("qc-sections").scrollIntoView({ behavior: "smooth", block: "start" }); });
  document.getElementById("qc-photo-link").textContent = hasPhoto() ? "📷 Change photo" : "📷 Add photo";

  const al = real(allergies), cond = real(state.conditions);
  const tiles = [
    ["Age", state.age ? state.age : "—"], ["Sex", state.sex && state.sex !== "unknown" ? sexLabel(state.sex) : "—"],
    ["Blood group", state.blood_type && state.blood_type !== "unknown" ? state.blood_type : "—"],
    ["Allergies", al.length ? al.length : "None"], ["Conditions", cond.length ? cond.length : "None"],
  ];
  document.getElementById("qc-tiles").innerHTML = tiles.map(t => '<div class="id-tile' + (t[0] === "Allergies" && al.length ? " warn" : "") + '"><small>' + t[0] + '</small><b>' + esc(String(t[1])) + '</b></div>').join("");
}

document.getElementById("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../";
});

(async function init() {
  const [meData, profData, optData] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
    fetch(API_BASE + "/profile/options", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../login/"; return; }
  userInfo = meData.user;
  options = QCProfile.options(optData && optData.options);

  if (profData && profData.ok && profData.profile && !profData.profile.wizard_done) {
    // Never been through setup at all -- that belongs in the wizard, not
    // an edit view of a profile that doesn't exist yet.
    window.location.href = "../onboarding/";
    return;
  }
  if (profData && profData.ok && profData.profile) {
    mergeProfileIntoState(profData.profile);
    savedSnapshot = profData.profile;
  }

  updateIdHero();
  renderAllSections();
})();


(window.QCH = window.QCH || {});
QCH.qcSetText = function () { qcSetText(this, this.dataset.cat); };
QCH.qcSaveSection = function () { qcSaveSection(this.dataset.sec); };
QCH.qcCancelSection = function () { qcCancelSection(this.dataset.sec); };
QCH.qcToggleEdit = function () { qcToggleEdit(this.dataset.sec); };
