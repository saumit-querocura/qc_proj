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

async function requireSession() {
  const res = await fetch(API_BASE + "/auth/me", { credentials: "include" });
  const data = await res.json();
  if (!data.logged_in) { window.location.href = "../login/"; return null; }
  return data.user;
}
async function requireCompletedProfile() {
  try {
    const res = await fetch(API_BASE + "/profile", { credentials: "include" });
    const data = await res.json();
    if (data.ok && data.profile && !data.profile.wizard_done) {
      window.location.href = "../onboarding/";
      return false;
    }
  } catch (e) {}
  return true;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function mdBold(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

document.querySelectorAll(".example-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.getElementById("sym-input").value = chip.getAttribute("data-text");
    document.getElementById("sym-input").focus();
  });
});

const SCAN_PHRASES = [
  "Reading what you shared…",
  "Cross-checking your saved profile…",
  "Comparing against known symptom patterns…",
  "Weighing your latest vitals…",
  "Putting together your guidance…",
];
const REFINE_PHRASES = [
  "Factoring in your answers…",
  "Recalculating the best match…",
  "Almost there…",
];
let scanTimer = null;

// Opens the full-screen overlay in its "scan" phase. Called both for the
// first pass (round is falsy) and for the brief re-scan after the targeted
// questions are answered (round = 1, using REFINE_PHRASES instead).
function startScan(round) {
  const scan = document.getElementById("sym-scan");
  const status = document.getElementById("sym-scan-status");
  const scanPhase = document.getElementById("sym-scan-phase");
  const qPhase = document.getElementById("sym-scan-questions");
  scan.classList.remove("scan-done");
  scan.classList.add("show");
  scanPhase.style.display = "flex";
  qPhase.style.display = "none";

  const phrases = round ? REFINE_PHRASES : SCAN_PHRASES;
  let i = 0;
  status.textContent = phrases[0];
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(() => {
    i = (i + 1) % phrases.length;
    status.style.opacity = 0;
    setTimeout(() => { status.textContent = phrases[i]; status.style.opacity = 1; }, 220);
  }, 1100);
}

// Plays the completion flourish (rings fall away, core pulses out) then
// fades the whole overlay away, handing off to the results reveal.
function stopScan() {
  const scan = document.getElementById("sym-scan");
  const status = document.getElementById("sym-scan-status");
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  scan.classList.add("scan-done");
  if (status) status.textContent = "All set — revealing your results…";
  setTimeout(() => {
    scan.classList.remove("show");
    setTimeout(() => { scan.classList.remove("scan-done"); }, 420);
  }, 550);
}

// Swaps the overlay from its scan phase into its questions phase (no fade
// out / back in -- same overlay, same immersive view) and renders the
// targeted follow-up questions from generate_clarifying_questions() on the
// backend. Answering all of them, or skipping, re-runs analysis once more
// (round = 1) with the answers folded into the symptom text.
function showQuestionPhase(questions, baseText) {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  const scanPhase = document.getElementById("sym-scan-phase");
  const qPhase = document.getElementById("sym-scan-questions");
  scanPhase.style.display = "none";
  qPhase.style.display = "flex";

  const list = document.getElementById("sqp-list");
  const progress = document.getElementById("sqp-progress");
  const counter = document.getElementById("sqp-counter");
  const skipBtn = document.getElementById("sqp-skip");
  progress.innerHTML = questions.map(() => '<div class="sqp-dot"></div>').join("");
  const dots = progress.querySelectorAll(".sqp-dot");

  const answers = [];
  let step = 0;

  function finish(useAnswers) {
    const extras = useAnswers ? answers.filter(a => a).join(". ") : "";
    const refinedText = extras ? (baseText + ". " + extras) : baseText;
    runAnalysis(refinedText, document.getElementById("sym-btn"), 1);
  }

  // Renders exactly one question at a time -- a real back-and-forth rather
  // than a wall of questions dropped on the person at once. Order is the
  // discriminative ranking generate_clarifying_questions() already computed
  // on the backend; this just paces it out one step per answer.
  function renderStep() {
    if (step >= questions.length) { finish(true); return; }
    const q = questions[step];
    counter.textContent = "Question " + (step + 1) + " of " + questions.length;

    if (q.type && q.type !== "yesno" && Array.isArray(q.options) && q.options.length) {
      // Options-bearing question (currently: duration) -- one stacked
      // button per option, answered with that option's own phrase rather
      // than a generic yes/no confirm_phrase.
      list.innerHTML =
        '<div class="qc-question sqp-step">' + escapeHtml(q.question) + '</div>' +
        '<div class="qc-opts sqp-step">' +
          q.options.map((opt, oi) => '<button type="button" class="qc-opt-btn" data-qc-opt="' + oi + '">' + escapeHtml(opt.label) + '</button>').join("") +
        '</div>';
      list.querySelectorAll(".qc-opt-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const oi = parseInt(btn.getAttribute("data-qc-opt"), 10);
          const opt = q.options[oi];
          answers[step] = (opt && (opt.phrase || opt.label)) || "";

          if (dots[step]) dots[step].classList.add("sqp-done");
          step++;
          renderStep();
        });
      });
      return;
    }

    list.innerHTML =
      '<div class="qc-question sqp-step">' + escapeHtml(q.question) + '</div>' +
      (q.why ? '<div class="sqp-step" style="font-size:12.5px;line-height:1.5;opacity:.7;margin:-4px 0 12px;max-width:440px">Why I ask: ' + escapeHtml(q.why) + '</div>' : '') +
      '<div class="qc-btns sqp-step">' +
        '<button type="button" class="qc-btn" data-qc-answer="yes">Yes</button>' +
        '<button type="button" class="qc-btn" data-qc-answer="no">No</button>' +
        '<button type="button" class="qc-btn" data-qc-answer="skip">Not sure</button>' +
      '</div>';
    list.querySelectorAll(".qc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.getAttribute("data-qc-answer");
        if (choice === "yes") answers[step] = q.confirm_phrase || q.symptom_key;
        else if (choice === "no") answers[step] = "no " + (q.confirm_phrase || q.symptom_key);
        else answers[step] = "";

        if (dots[step]) dots[step].classList.add("sqp-done");
        step++;
        renderStep();
      });
    });
  }

  renderStep();

  // Skip stops the interview where it stands and refines with whatever was
  // answered so far -- it doesn't discard already-given answers.
  if (skipBtn) skipBtn.onclick = () => finish(true);
}

// Rendering the actual result now lives entirely on results/index.html --
// this page's job ends at handing the raw analysis response off via
// sessionStorage and navigating there (see the success branch of
// runAnalysis() below).

// The structured interview answers for this check, carried through to the results page.
let qcInterview = null;

async function runAnalysis(text, busyBtn, round) {
  const errEl = document.getElementById("sym-err");
  errEl.textContent = "";
  if (busyBtn) busyBtn.disabled = true;

  // First pass only: ask the specific, personalised interview questions (onset,
  // character, severity, red flags, exposures ...) before analysing. If the
  // interview isn't available (older backend / offline) this quietly returns null.
  if (!round && window.QCInterview) {
    let iv = null;
    try { iv = await QCInterview.run({ text, apiBase: API_BASE }); } catch (e) { iv = null; }
    if (iv && iv.cancelled) {
      if (busyBtn) busyBtn.disabled = false;
      updatePickerBtn();
      return;
    }
    qcInterview = iv && iv.summary ? iv : null;
    if (qcInterview) text = qcInterview.text;
  }
  startScan(round);

  try {
    // Using the lighter /diagnosis/analyse endpoint here (not /fast/analyse):
    // the richer 18-module pipeline behind /fast/analyse loads several large
    // knowledge files and was pushing the backend's 512MB Render instance
    // over its memory limit under real traffic (2026-09-25). This endpoint
    // runs the same core legacy-engine diagnosis without that extra load;
    // results/index.html's normalizeResponse() reshapes this response into
    // the flat shape its renderer expects, regardless of which endpoint answered.
    const res = await fetch(API_BASE + "/diagnosis/analyse", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: (window.QCI18n && QCI18n.lang) || "en" }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.err || data.message || "Couldn't analyze that just now.");

    // Offer the targeted follow-up questions full-screen, inside the same
    // overlay the scan just used, rather than dumping them into the results
    // -- only on the first round, and only when the backend actually sent
    // them (top two candidates weren't clearly separated).
    const questions = data.clarifying_questions || [];
    if (questions.length && (round || 0) === 0) {
      showQuestionPhase(questions, text);
    } else {
      // Results now live on their own page (results/index.html) instead of
      // rendering inline below the form, with a clear "Back to Symptom
      // Analyzer" way back. Hand the analysis off via sessionStorage --
      // it's a same-origin, one-shot handoff for a page navigated to right
      // after this fetch resolves, not state meant to persist or be read
      // back later, so sessionStorage (not an API round-trip) is the right
      // tool here. The results page redirects back here if it ever finds
      // this empty (e.g. a stale bookmark or the back button).
      try {
        sessionStorage.setItem("qc-symptom-result", JSON.stringify({ data, baseText: text, round: round || 0, ts: Date.now(), interview: qcInterview ? { summary: qcInterview.summary, emergency: qcInterview.emergency, red_flags: qcInterview.red_flags, helpline: qcInterview.helpline } : null }));
      } catch (e) {}
      window.location.href = "results/";
      return;
    }
  } catch (err) {
    stopScan();
    errEl.textContent = err.message || "Something went wrong — please try again.";
  } finally {
    if (busyBtn) busyBtn.disabled = false;
    updatePickerBtn();
  }
}

document.getElementById("sym-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("sym-input").value.trim();
  if (!text) return;
  await runAnalysis(text, document.getElementById("sym-btn"));
});

/* ---- Tap-to-select symptom picker (ported from the monolith's /symptoms page) ---- */
const SYMPTOM_CATS = [
  { name: "Emergency Signs", icon: "🚨", emergency: true, items: [
    ["slurred speech","🗣️","Slurred Speech"], ["face droop","😶","Face Drooping"], ["one side weakness","💪","One-Side Weakness"],
    ["stiff neck fever","😬","Stiff Neck + Fever"], ["swelling lips","😮","Throat / Lip Swelling"],
    ["thunderclap headache","⚡","Sudden Worst Headache Ever"],
  ]},
  { name: "General", icon: "🌡️", items: [
    ["fever","🤒","Fever"], ["low grade fever","🌡️","Low-Grade Fever"], ["fatigue","😴","Fatigue / No energy"],
    ["body ache","🦴","Body / Muscle Ache"], ["chills","🥶","Chills / Shivering"], ["sweating","💧","Sweating"],
    ["loss of appetite","😶","No Appetite"], ["sudden onset","⚡","Started Suddenly"],
    ["unexplained weight loss","⚖️","Unexplained Weight Loss"], ["unexplained weight gain","⚖️","Unexplained Weight Gain"],
  ]},
  { name: "Head & Mind", icon: "🧠", items: [
    ["headache","🤕","Headache"], ["severe headache","💥","Severe / Worst Headache"], ["thunderclap headache","⚡","Thunderclap Headache"],
    ["dizziness","💫","Dizziness"], ["positional dizziness","🌀","Room Spinning / Vertigo"], ["confusion","😵","Confusion / Brain fog"],
    ["fainting","😶‍🌫️","Fainting"], ["photophobia","😎","Sensitive to Light"], ["numbness","🧊","Numbness / Tingling"],
    ["visual disturbance","👁️","Visual Disturbance / Blurred"],
  ]},
  { name: "Nose, Throat & Sinuses", icon: "🧻", items: [
    ["sore throat","😮‍💨","Sore Throat"], ["runny nose","🧻","Runny Nose"], ["nasal congestion","😤","Blocked Nose"],
    ["sneezing","🤧","Sneezing"], ["facial pain","😣","Facial / Sinus Pain"], ["coloured nasal discharge","🟢","Green / Yellow Discharge"],
    ["loss of smell","👃","Loss of Smell"], ["loss of taste","👅","Loss of Taste"], ["stiff neck","😬","Stiff Neck"],
    ["neck lump","🔵","Lump in Neck"], ["nosebleed","🩸","Nosebleed"],
  ]},
  { name: "Ears", icon: "👂", items: [
    ["ear pain","👂","Ear Pain / Earache"], ["ear discharge","💧","Discharge from Ear"],
  ]},
  { name: "Chest & Breathing", icon: "🫁", items: [
    ["chest pain","🫀","Chest Pain"], ["pleuritic chest pain","🔪","Sharp Pain with Breathing"], ["chest wall pain","🤚","Chest Wall Tender to Touch"],
    ["chest tightness","🪢","Chest Tightness"], ["breathlessness","😮","Breathlessness"], ["shortness of breath lying","🛌","Worse Lying Flat"],
    ["cough","😷","Cough"], ["wheezing","🌬️","Wheezing"], ["palpitations","💓","Palpitations"],
    ["palpitations at rest","💓","Palpitations at Rest"], ["radiating pain","💪","Pain to Arm or Jaw"],
    ["sharp chest worse lying","📐","Sharp Chest — Worse Lying Down"], ["better sitting forward","🪑","Better Leaning Forward"],
  ]},
  { name: "Stomach & Gut", icon: "🤢", items: [
    ["nausea","🤢","Nausea"], ["vomiting","🤮","Vomiting"], ["diarrhea","🚽","Diarrhoea"], ["abdominal pain","😖","Stomach Pain"],
    ["right lower abdominal pain","📍","Lower Right Pain"], ["periumbilical pain","⭕","Pain Around Belly Button"],
    ["stomach cramps","😣","Stomach Cramps"], ["heartburn","🔥","Heartburn / Acid Taste"],
    ["rebound tenderness","🤚","Worse When You Release Pressure"], ["blood in stool","🩸","Blood in Stool"],
    ["rapid onset","⚡","Started Suddenly After Eating"],
  ]},
  { name: "Urinary", icon: "💧", items: [
    ["burning urination","🔥","Burning When Peeing"], ["frequent urination","🔄","Peeing Very Often"],
    ["flank pain","🤚","Side / Kidney Pain"], ["blood in urine","🩸","Blood in Urine"],
  ]},
  { name: "Joints & Muscles", icon: "🦴", items: [
    ["back pain","🦴","Back Pain"], ["worse with touch","🤚","Worse When Pressed"], ["severe bone pain","💥","Severe Bone / Joint Pain"],
    ["hot joint","🔴","Hot, Red, Swollen Joint"], ["joint swelling","💢","Joint Swelling"], ["big toe pain","🦶","Big Toe / Foot Pain"],
    ["neck pain","😬","Neck Pain / Stiffness"],
  ]},
  { name: "Legs & Circulation", icon: "🦵", items: [
    ["leg swelling","🦵","Swollen Leg / Ankle"], ["calf pain","🦴","Calf Pain / Tenderness"], ["ankle swelling","🦵","Ankle Swelling"],
  ]},
  { name: "Skin", icon: "🩹", items: [
    ["rash","🔴","Rash"], ["unilateral rash","↔️","Rash on One Side Only"], ["painful rash","🔥","Painful Rash"],
    ["skin blisters","🫧","Blisters on Skin"], ["burning skin","🔥","Burning / Tingling Skin"], ["cellulitis rash","🟥","Spreading Red / Hot Skin"],
    ["itching","🐜","Itching"], ["hives","🐝","Hives / Welts"], ["swelling lips","👄","Swollen Face or Lips"],
    ["rash with fever","🌡️","Rash with Fever"],
  ]},
  { name: "Eyes", icon: "👁️", items: [
    ["eye redness","👁️","Red / Pink Eyes"], ["eye discharge","🟡","Sticky / Watery Eye Discharge"], ["eye itching","😣","Itchy Eyes"], ["eye pain","😩","Eye Pain"],
  ]},
  { name: "Thyroid & Hormones", icon: "🦋", items: [
    ["heat intolerance","🥵","Heat Intolerance"], ["cold intolerance","🥶","Cold Intolerance"],
    ["hair loss","💇","Hair Loss / Thinning"], ["heart rate fast","💓","Heart Racing / Fast Pulse"],
  ]},
  { name: "Dental", icon: "🦷", items: [
    ["tooth pain","🦷","Toothache"], ["gum swelling","😬","Swollen Gums"],
  ]},
];

const pickerState = { symptoms: {}, dur: "", sev: "" };

function renderCats() {
  const box = document.getElementById("sym-cats");
  box.innerHTML = SYMPTOM_CATS.map((cat, ci) => {
    const btns = cat.items.map(([key, emoji, label]) =>
      '<button type="button" class="sym-btn" data-s="' + escapeHtml(key) + '" data-label="' + escapeHtml(emoji + " " + label) + '">' +
        '<span>' + emoji + '</span><span>' + escapeHtml(label) + '</span>' +
      '</button>'
    ).join("");
    return '<details class="cat-details' + (cat.emergency ? ' emergency' : '') + '"' + (cat.emergency ? ' open' : '') + '>' +
      '<summary class="cat-summary"><span class="cs-ic">' + cat.icon + '</span>' + escapeHtml(cat.name) +
      '<span class="cs-count">' + cat.items.length + '</span><span class="cs-chevron">›</span></summary>' +
      '<div class="cat-body"><div class="sym-grid">' + btns + '</div></div>' +
    '</details>';
  }).join("");

  box.querySelectorAll(".sym-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleSymBtn(btn));
  });
}

function toggleSymBtn(btn) {
  const s = btn.getAttribute("data-s"), l = btn.getAttribute("data-label");
  if (pickerState.symptoms[s]) { delete pickerState.symptoms[s]; btn.classList.remove("sel"); }
  else { pickerState.symptoms[s] = l; btn.classList.add("sel"); }
  updateSelectedBar();
}

function removeSym(key) {
  delete pickerState.symptoms[key];
  document.querySelectorAll('.sym-btn[data-s="' + CSS.escape(key) + '"]').forEach(b => b.classList.remove("sel"));
  updateSelectedBar();
}

function updateSelectedBar() {
  const keys = Object.keys(pickerState.symptoms);
  const bar = document.getElementById("sym-selbar");
  const chips = document.getElementById("sym-selchips");
  if (keys.length) {
    bar.classList.add("show");
    chips.innerHTML = keys.map(k =>
      '<span class="selected-chip">' + escapeHtml(pickerState.symptoms[k]) +
      '<span class="sc-x" data-key="' + escapeHtml(k) + '">✕</span></span>'
    ).join("");
    chips.querySelectorAll(".sc-x").forEach(x => x.addEventListener("click", () => removeSym(x.getAttribute("data-key"))));
  } else {
    bar.classList.remove("show");
    chips.innerHTML = "";
  }
  updatePickerBtn();
}

function updatePickerBtn() {
  const n = Object.keys(pickerState.symptoms).length;
  const btn = document.getElementById("sym-picker-btn");
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? "Select symptoms to analyze" : "Analyze " + n + " symptom" + (n > 1 ? "s" : "") + " →";
}

document.querySelectorAll('.meta-pills').forEach(group => {
  const type = group.getAttribute("data-meta");
  group.querySelectorAll(".meta-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const already = pill.classList.contains("sel");
      group.querySelectorAll(".meta-pill").forEach(p => p.classList.remove("sel"));
      if (!already) { pill.classList.add("sel"); pickerState[type] = pill.getAttribute("data-v"); }
      else { pickerState[type] = ""; }
    });
  });
});

document.getElementById("sym-picker-btn").addEventListener("click", async () => {
  const labels = Object.values(pickerState.symptoms);
  if (!labels.length) return;
  let text = "I'm experiencing: " + labels.map(l => l.replace(/^\S+\s/, "")).join(", ") + ".";
  if (pickerState.dur) text += " Duration: " + pickerState.dur + ".";
  if (pickerState.sev) text += " Severity: " + pickerState.sev + ".";
  await runAnalysis(text, document.getElementById("sym-picker-btn"));
});

renderCats();

document.getElementById("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../";
});

/* ---- "How are you feeling now?" check-in banner ---- */
/* Shown only from time to time (at most once every CHECKIN_INTERVAL_MS),
   not on every single page load -- qc-checkin-last-shown (localStorage,
   persists across visits) is the gate. Answering a task resolves it
   server-side, so once someone says they're okay it naturally stays quiet
   until a genuinely new check-in gets scheduled (after a later symptom
   check) -- nothing extra to track for that on the frontend. */
const CHECKIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CHECKIN_LAST_SHOWN_KEY = "qc-checkin-last-shown";
let qcCheckinItemId = null;

function checkinDue() {
  try {
    const last = parseInt(localStorage.getItem(CHECKIN_LAST_SHOWN_KEY) || "0", 10);
    return !last || (Date.now() - last) >= CHECKIN_INTERVAL_MS;
  } catch (e) {
    return true;
  }
}

function markCheckinShown() {
  try { localStorage.setItem(CHECKIN_LAST_SHOWN_KEY, String(Date.now())); } catch (e) {}
}

async function loadCheckin() {
  if (!checkinDue()) return;
  try {
    const res = await fetch(API_BASE + "/smart-followups/due", { credentials: "include" });
    const data = await res.json();
    if (!data.ok || !data.items || !data.items.length) return;
    renderCheckin(data.items[0]);
    markCheckinShown();
  } catch (e) {}
}

function renderCheckin(item) {
  qcCheckinItemId = item.id;
  const banner = document.getElementById("qc-checkin");
  const qEl = document.getElementById("qc-checkin-question");
  const optsEl = document.getElementById("qc-checkin-options");

  const anchorName = item.anchor_condition_name;
  qEl.textContent = item.question
    ? (item.question + (anchorName ? " (about your " + anchorName.toLowerCase() + " check)" : ""))
    : "How are you feeling now compared with your last check?";

  const options = (item.options && item.options.length) ? item.options : ["Better", "Same", "Worse", "New symptom appeared"];
  optsEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "checkin-opt-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => answerCheckin(item.id, opt));
    optsEl.appendChild(btn);
  });

  banner.style.display = "flex";
}

async function answerCheckin(taskId, optionText) {
  const banner = document.getElementById("qc-checkin");
  banner.querySelectorAll(".checkin-opt-btn").forEach(b => { b.disabled = true; });

  try {
    await fetch(API_BASE + "/smart-followups/answer", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: taskId, answer_text: optionText, answer_payload: { option: optionText } }),
    });
  } catch (e) {}

  document.getElementById("qc-checkin-question").textContent = "Thanks — that helps keep your health score accurate. 💛";
  document.getElementById("qc-checkin-options").innerHTML = "";
  setTimeout(() => { banner.style.display = "none"; }, 2200);
}

document.getElementById("qc-checkin-dismiss").addEventListener("click", () => {
  // "Not now" just re-arms the regular interval rather than answering the
  // task -- markCheckinShown() was already called when it appeared, so
  // this doesn't change *when* it can show again, it just closes it now.
  document.getElementById("qc-checkin").style.display = "none";
});

(async function init() {
  const [meData, profData] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../login/"; return; }
  const user = meData.user;
  if (profData && profData.ok && profData.profile && !profData.profile.wizard_done) {
    window.location.href = "../onboarding/";
    return;
  }
  const name = user.display_name || user.username || user.email || "";
  const initials = name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  document.getElementById("qc-user-dot").textContent = initials;
  document.getElementById("qc-user-name").textContent = name ? name.split(" ")[0] : "";
  loadCheckin();
})();
