/* ---- Theme toggle (shared qc-theme key) ---- */
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

/* ---- Setup ---- */
const API = "https://app.querocura.com/api";
const TOTAL_STEPS = 6;
let curStep = 1;
let options = null;
let state = {
  display_name: "", age: "", sex: "unknown", blood_type: "unknown",
  med_allergies: [], food_allergies: [], env_allergies: [],
  conditions: [], past_conditions: [], medications: "", family_history: [],
  smoking: "unknown", alcohol: "unknown", exercise: "unknown",
  pregnant: false, occupation: "",
};

const STEP_META = [
  { tint: "#e6f6f4", icon: "👋", title: "Let's get acquainted", hint: "A few basics so QueroCura knows who it's caring for.", say: "Hi, I'm Cura! I'll keep this quick — about a minute." },
  { tint: "#fdece7", icon: "⚠️", title: "Any allergies?", hint: "We use this to keep every recommendation safer.", say: "Allergies first — this is what keeps advice safe for you." },
  { tint: "#eae8fb", icon: "📋", title: "Your health history", hint: "What you live with now, and what's already behind you.", say: "Both matter: ongoing conditions and the ones you've left behind." },
  { tint: "#fbf1dc", icon: "💊", title: "Medicines & family health", hint: "Current medicines and hereditary patterns that matter.", say: "Family patterns often explain more than you'd think." },
  { tint: "#e4f1fb", icon: "🏃", title: "How do you live?", hint: "Lifestyle shapes risk and the advice you receive.", say: "No judgement here — honest answers give better advice." },
  { tint: "#e6f6f4", icon: "✨", title: "Review & finish", hint: "One last check, then you're all set.", say: "Last stop! Check it over and we're done." },
];
const SEEN_FLAG = { 2: "_allergiesSeen", 3: "_conditionsSeen", 4: "_medsSeen" };

const esc = QCProfile.esc;
function firstName() { return (state.display_name || "").trim().split(/\s+/)[0] || ""; }

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

function payloadFor(finish) {
  const out = {};
  Object.keys(state).forEach(k => { if (k.charAt(0) !== "_") out[k] = state[k]; });
  out.wizard_done = !!finish;
  return out;
}
async function saveProfile(finish) {
  QCProfile.flush(document.getElementById("qc-step-body"));
  QCProfile.applyRules(state);
  const res = await fetch(API + "/profile", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadFor(finish)),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.message || "Couldn't save your profile.");
  return data;
}

window.qcSkip = async function (e) {
  e.preventDefault();
  try { await saveProfile(true); window.location.href = "../dashboard/"; }
  catch (err) { showError(err.message); }
};

function showError(msg) {
  const box = document.getElementById("qc-error");
  box.textContent = msg || "Something went wrong. Please try again.";
  box.style.display = "block";
}
function hideError() { document.getElementById("qc-error").style.display = "none"; }

/* ---- progress: step dots + a live "profile strength" meter ---- */
function updateProgress() {
  const s = QCProfile.strength(state);
  document.getElementById("qc-progress-label").textContent = "Step " + curStep + " of " + TOTAL_STEPS;
  document.getElementById("qc-progress-pct").textContent = s.pct + "%";
  document.getElementById("qc-progress-fill").style.width = Math.max(4, s.pct) + "%";
  document.getElementById("qc-step-dots").innerHTML = STEP_META.map((m, i) =>
    '<span class="sdot' + (i + 1 === curStep ? ' now' : i + 1 < curStep ? ' done' : '') + '">' + (i + 1 < curStep ? "✓" : m.icon) + '</span>').join("");
  document.getElementById("qc-step-glow").style.setProperty("--step-tint", STEP_META[curStep - 1].tint);
}

/* ---- Cura's speech bubble: reacts to what you've entered ---- */
function curaSays() {
  const n = firstName(), age = parseInt(state.age, 10);
  if (curStep === 1 && n) return "Nice to meet you, " + n + "! 😊";
  if (curStep === 2) {
    const a = state.med_allergies.length + state.food_allergies.length + state.env_allergies.length;
    if (a) return "Got it — I'll keep " + a + " allerg" + (a > 1 ? "ies" : "y") + " in mind on every check. 🛡️";
  }
  if (curStep === 3) {
    if (state.conditions.length && state.past_conditions.length) return "Thanks — that's a really complete picture. 🧩";
    if (state.conditions.length) return "Noted. I'll watch the trends that matter for " + state.conditions[0].toLowerCase() + ". 👀";
  }
  if (curStep === 4 && !isNaN(age) && age >= 40) return "From 40 on, heart and diabetes history in the family really count. ❤️";
  if (curStep === 5 && state.exercise === "active") return "Active already — love it! 💪";
  return STEP_META[curStep - 1].say;
}
function refreshBubble() { const b = document.getElementById("qc-bubble"); if (b) b.textContent = curaSays(); }

/* ---- Smart hints: only shown when they apply ---- */
function smartHint() {
  const age = parseInt(state.age, 10);
  if (curStep === 1 && !isNaN(age) && (age < 1 || age > 120)) return "That age doesn't look right — double-check it?";
  if (curStep === 1 && !isNaN(age) && age < 18) return "Under 18? Symptom checks use child-specific guidance for you. 🧒";
  if (curStep === 3) {
    const cs = state.conditions.map(c => c.toLowerCase());
    if (cs.some(c => c.indexOf("diabetes") >= 0)) return "With diabetes, logging glucose in Vitals lets QueroCura spot trends early. 🩸";
    if (cs.some(c => c.indexOf("hypertension") >= 0)) return "With hypertension, regular BP readings in Vitals make your trends far more useful. ❤️";
  }
  if (curStep === 5 && state.smoking === "regular") return "Thank you for being honest. It nudges your health score — and quitting moves it back up. 🌱";
  return "";
}

function buildStepBody() {
  const meta = STEP_META[curStep - 1];
  const hint = smartHint();
  let inner =
    '<div class="cura-bubble"><span class="cura-face" aria-hidden="true">🩺</span><span id="qc-bubble">' + esc(curaSays()) + '</span></div>' +
    '<div class="step-head"><div class="step-icon" style="background:' + meta.tint + '">' + meta.icon + '</div><h1 class="step-title">' + meta.title + '</h1></div>' +
    '<p class="step-hint">' + meta.hint + '</p>' +
    (hint ? '<div class="smart-hint">💡 ' + esc(hint) + '</div>' : '');

  if (curStep === 1) {
    inner += floatField("f-name", "display_name", "What should we call you?", "text");
    inner += floatField("f-age", "age", "Age", "number", { min: 1, max: 120, optional: true });
    inner += QCProfile.sexPicker();
    inner += QCProfile.bloodGroup(options);
  } else if (curStep === 2) {
    inner += '<div class="sec-label">Medication allergies</div>' + QCProfile.chipCloud("med_allergies", options.common_med_allergies, "Another medication allergy — press Enter or tap Add", { noun: "medications" });
    inner += '<div class="sec-label">Food allergies</div>' + QCProfile.chipCloud("food_allergies", options.common_food_allergies, "Another food allergy — press Enter or tap Add");
    inner += '<div class="sec-label">Environmental allergies</div>' + QCProfile.chipCloud("env_allergies", options.common_env_allergies, "Another environmental allergy — press Enter or tap Add");
  } else if (curStep === 3) {
    inner += '<div class="sec-label">Ongoing conditions <span class="field-opt">you live with these now</span></div>' +
      QCProfile.chipCloud("conditions", options.known_conditions, "Another ongoing condition — press Enter or tap Add", { noun: "conditions" });
    inner += '<div class="sec-label">Past conditions &amp; surgeries <span class="field-opt">resolved, treated or removed</span></div>' +
      QCProfile.chipCloud("past_conditions", options.past_conditions, "Another past condition or surgery — press Enter or tap Add", { noun: "past conditions" });
  } else if (curStep === 4) {
    inner += floatField("f-meds", "medications", "Current medications", "textarea", { rows: 3, optional: true });
    inner += '<div class="sec-label">Family history</div>' + QCProfile.chipCloud("family_history", options.known_family_history, "Another family condition — press Enter or tap Add");
  } else if (curStep === 5) {
    inner += QCProfile.lifestyle("smoking", "Smoking") + QCProfile.lifestyle("alcohol", "Alcohol") + QCProfile.lifestyle("exercise", "Exercise");
  } else if (curStep === 6) {
    const preg = QCProfile.pregnancyBlock();
    inner += preg || (state.sex === "male" ? '<div class="qcp-help">Pregnancy questions are skipped — they don\'t apply to you.</div>' : '');
    inner += floatField("f-occ", "occupation", "Occupation", "text", { optional: true });
    inner += '<div class="sec-label" style="margin-top:26px">Review</div>' + renderReview();
    const s = QCProfile.strength(state);
    if (s.missing.length) inner += '<div class="strength-tip">Profile ' + s.pct + '% complete. Adding <b>' + esc(s.missing.slice(0, 2).join(" and ")) + '</b> would sharpen your health score and symptom checks.</div>';
    else inner += '<div class="strength-tip good">Profile complete — nice work! 🎉</div>';
  }

  inner += '<div class="step-footer">' +
    '<button class="btn-back" id="qc-back-btn" data-h-click="qcBack"' + (curStep === 1 ? ' disabled' : '') + '>&larr; Back</button>' +
    '<button class="btn-next" id="qc-next-btn" data-h-click="qcNext">' +
      (curStep === TOTAL_STEPS ? 'Finish &amp; go to dashboard ✨' : 'Continue') +
      (curStep === TOTAL_STEPS ? '' : ' <span>&rarr;</span>') +
    '</button>' +
  '</div>';
  return inner;
}

/* Re-render the current step without losing scroll position or what the person was typing. */
function renderStep(opts) {
  opts = opts || {};
  const body = document.getElementById("qc-step-body");
  const y = window.scrollY;
  // keep unsaved text in the plain text fields (name, age, meds, occupation) -- already in `state` via oninput
  body.innerHTML = buildStepBody();
  updateProgress();
  window.scrollTo(0, y);
  if (opts.keepFocusCat) {
    const inp = body.querySelector('input.extra-input[data-cat="' + opts.keepFocusCat + '"]');
    if (inp) inp.focus();
  }
}

QCProfile.bind(state, function (notes, opts) {
  if (notes && notes.length) { /* rules already applied; surface what changed */ }
  renderStep(opts);
}, function () { refreshBubble(); });

function floatField(id, cat, label, type, opt) {
  opt = opt || {};
  const val = state[cat] == null ? "" : state[cat];
  const filled = val !== "" ? " filled" : "";
  const openTag = type === "textarea"
    ? '<textarea class="field-input' + filled + '" id="' + id + '" rows="' + (opt.rows || 3) + '" placeholder=" " data-cat="' + cat + '" data-h-input="qcSetText">' + esc(val) + '</textarea>'
    : '<input class="field-input' + filled + '" id="' + id + '" type="' + (type || "text") + '" placeholder=" " value="' + esc(val) + '" ' +
        (opt.min !== undefined ? 'min="' + opt.min + '" ' : '') + (opt.max !== undefined ? 'max="' + opt.max + '" ' : '') +
        'data-cat="' + cat + '" data-h-input="qcSetText" data-h-keydown="qcEnterNext">';
  return '<div class="field"><div class="field-inner">' + openTag +
    '<label class="field-label" for="' + id + '">' + esc(label) + (opt.optional ? ' <span class="field-opt">optional</span>' : '') + '</label>' +
    '</div></div>';
}
window.qcSetText = function (el, cat) {
  el.classList.toggle('filled', el.value.length > 0);
  state[cat] = el.value;
  if (cat === "age") {
    // age can change whether pregnancy applies; re-check without re-rendering mid-typing
    QCProfile.applyRules(state);
  }
  refreshBubble();
  updateProgress();
};

function renderReview() {
  const sexLabel = (QCProfile.SEX_UI[state.sex] || { label: state.sex }).label;
  const rows = [
    ["Name", state.display_name || "—"],
    ["Age", state.age || "—"],
    ["Biological sex", sexLabel],
    ["Blood group", state.blood_type === "unknown" ? "Not sure" : state.blood_type],
    ["Allergies", [].concat(state.med_allergies, state.food_allergies, state.env_allergies).join(", ") || "None recorded"],
    ["Ongoing conditions", state.conditions.join(", ") || "None recorded"],
    ["Past conditions", state.past_conditions.join(", ") || "None recorded"],
    ["Medications", state.medications || "—"],
    ["Family history", state.family_history.join(", ") || "None recorded"],
    ["Smoking", state.smoking], ["Alcohol", state.alcohol], ["Exercise", state.exercise],
    ["Occupation", state.occupation || "—"],
  ];
  if (QCProfile.pregnancyApplicable(state)) rows.splice(4, 0, ["Pregnant", state.pregnant ? "Yes" : "No"]);
  return '<div class="review-grid">' + rows.map(([l, v]) =>
    '<div class="review-item"><div class="rl">' + esc(l) + '</div><div class="rv">' + esc(v) + '</div></div>'
  ).join("") + '</div>';
}

window.qcBack = function () {
  if (curStep <= 1) return;
  QCProfile.flush(document.getElementById("qc-step-body"));
  curStep -= 1;
  const card = document.getElementById("qc-card");
  card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
  renderStep(); window.scrollTo({ top: 0, behavior: "smooth" });
};

function burst() {
  const colors = ["#0e8f83", "#7c6fdb", "#2f8fd1", "#e0a52c", "#f0765a"];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = (30 + Math.random() * 40) + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.25) + "s";
    p.style.animationDuration = (1.1 + Math.random() * 0.8) + "s";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2400);
  }
}

window.qcNext = async function () {
  hideError();
  const btn = document.getElementById("qc-next-btn");
  if (!btn || btn.disabled) return;
  // basic sanity before moving on
  const age = parseInt(state.age, 10);
  if (curStep === 1 && state.age !== "" && (isNaN(age) || age < 1 || age > 120)) {
    showError("Please enter an age between 1 and 120 — or leave it blank.");
    return;
  }
  btn.disabled = true;
  if (SEEN_FLAG[curStep]) state[SEEN_FLAG[curStep]] = true;
  if (curStep === 3) state._pastSeen = true;
  if (curStep === 4) state._familySeen = true;
  try {
    await saveProfile(curStep === TOTAL_STEPS);
  } catch (err) {
    btn.disabled = false;
    showError(err.message);
    return;
  }
  if (curStep === TOTAL_STEPS) {
    document.getElementById("qc-finish-title").textContent = firstName() ? "You're all set, " + firstName() + "!" : "You're all set!";
    document.getElementById("qc-finish-flourish").classList.add("show");
    burst();
    setTimeout(() => { window.location.href = "../dashboard/"; }, 1400);
    return;
  }
  curStep += 1;
  const card = document.getElementById("qc-card");
  card.style.animation = "none"; void card.offsetWidth; card.style.animation = "";
  renderStep(); window.scrollTo({ top: 0, behavior: "smooth" });
};

(async function init() {
  const [meData, profData, optData] = await Promise.all([
    fetch(API + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
    fetch(API + "/profile/options", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);

  if (!meData.logged_in) { window.location.href = "../login/"; return; }

  options = QCProfile.options(optData && optData.options);

  if (profData && profData.ok && profData.profile) {
    if (profData.profile.wizard_done) { window.location.href = "../dashboard/"; return; }
    mergeProfileIntoState(profData.profile);
  }
  if (!state.display_name && meData.user) state.display_name = meData.user.display_name || "";

  renderStep();
})();


(window.QCH = window.QCH || {});
QCH.qcBack = function () { qcBack(); };
QCH.qcNext = function () { qcNext(); };
QCH.qcSetText = function () { qcSetText(this, this.dataset.cat); };
QCH.qcEnterNext = function (event) { if (event.key === 'Enter') { event.preventDefault(); qcNext(); } };
