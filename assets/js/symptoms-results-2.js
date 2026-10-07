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
const RESULT_KEY = "qc-symptom-result";

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function mdBold(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

const URGENCY_COLORS = {
  low: "#0e8f83", medium: "#c98a10", high: "#d24f28", emergency: "#b3182a", unknown: "#2f8fd1",
};
function urgencyColor(word) {
  const w = (word || "").toLowerCase();
  if (w.includes("emergency")) return URGENCY_COLORS.emergency;
  if (w.includes("high") || w.includes("urgent")) return URGENCY_COLORS.high;
  if (w.includes("medium") || w.includes("caution") || w.includes("watch")) return URGENCY_COLORS.medium;
  if (w.includes("low") || w.includes("routine")) return URGENCY_COLORS.low;
  return URGENCY_COLORS.unknown;
}

function listHtml(className, items) {
  if (!items || !items.length) return "";
  return '<ul class="' + className + '">' + items.map(i => "<li>" + mdBold(i) + "</li>").join("") + "</ul>";
}

const CONFIDENCE_BAND_TEXT = {
  narrow: "High confidence match",
  moderate: "Moderate confidence match",
  broad: "Broader, less certain match",
};

/* ---------- No medicine advice: client-side safety net ----------
   The server already strips drug names and builds `home_triage`. This is a second
   line of defence, so even an older server response can't show a drug name. */
const DRUG_NAME_RE = /(?<![\w-])(?:paracetamol|acetaminophen|tylenol|panadol|calpol|crocin|dolo|ibuprofen|brufen|advil|nurofen|aspirin|disprin|naproxen|diclofenac|voltaren|ketorolac|tramadol|codeine|combiflam|omeprazole|pantoprazole|esomeprazole|ranitidine|famotidine|gaviscon|loperamide|imodium|domperidone|ondansetron|simethicone|cetirizine|loratadine|fexofenadine|chlorpheniramine|chlorphenamine|diphenhydramine|benadryl|pseudoephedrine|phenylephrine|xylometazoline|oxymetazoline|dextromethorphan|guaifenesin|amoxicillin|azithromycin|ciprofloxacin|doxycycline|metronidazole|prednisolone|metformin|salbutamol|ventolin|hydrocortisone|clotrimazole|calamine|ORS|oral rehydration (?:salts?|solutions?)|\d+(?:\.\d+)? ?(?:mg|mcg|ml))(?![\w-])/i;
const DRUG_CLASS_RE = /(?<![\w-])(?:nsaids?|painkillers?|pain ?relievers?|analgesics?|antipyretics?|antacids?|laxatives?|antihistamines?|decongestants?|cough (?:syrups?|suppressants?|medicines?)|lozenges?|throat sprays?|nasal sprays?|antibiotics?|steroids?|inhalers?|ointments?|(?:eye|ear|nose) drops|over[- ]the[- ]counter|OTC|tablets?|capsules?|pills?)(?![\w-])/i;
const CAUTION_RE = /\b(?:avoid|do not|don't|never|not|without|unless|before|stop|no need|only if|check with|ask)\b/i;
function hasMedicine(sentence) { return DRUG_NAME_RE.test(sentence) || (DRUG_CLASS_RE.test(sentence) && !CAUTION_RE.test(sentence)); }
function scrubText(t) {
  if (typeof t !== "string" || !t) return t;
  t = t.replace(/\b(?:ORS|oral rehydration (?:salts?|solutions?))\b/gi, "plenty of fluids, in small frequent sips");
  const parts = t.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const kept = parts.filter(x => !hasMedicine(x));
  return kept.length === parts.length ? t : kept.join(" ").trim();
}
function scrubList(a) { return (a || []).map(scrubText).filter(Boolean); }

const TRIAGE_LEVELS = [
  { key: "self_care",  label: "Self-care",   color: "#2f8f5e", headline: "Self-care at home", summary: "This looks manageable at home. Rest, fluids and watching for change are usually enough.", icon: "🏡" },
  { key: "monitor",    label: "Monitor",     color: "#0e8f83", headline: "Monitor at home", summary: "Home care is reasonable. Keep an eye on it and re-check if anything changes.", icon: "👀" },
  { key: "see_doctor", label: "Doctor soon", color: "#c98a10", headline: "Book a doctor visit soon", summary: "Home care is fine meanwhile, but arrange a visit within the next few days — sooner if it worsens.", icon: "🩺" },
  { key: "urgent",     label: "Today",       color: "#d24f28", headline: "See a doctor today", summary: "This should be looked at today. Contact a doctor, urgent-care clinic or hospital now.", icon: "⚠️" },
  { key: "emergency",  label: "Emergency",   color: "#b3182a", headline: "Get emergency help now", summary: "Call your local emergency number or go to the nearest emergency department. Don't wait it out at home.", icon: "🚨" },
];
const SAFE_STEPS = ["Rest and avoid pushing through it", "Drink water or clear fluids regularly", "Note when it started and what makes it better or worse", "Log your vitals so QueroCura can track the trend"];

const ENGINE_LEVEL = { self: "self_care", monitor: "monitor", soon: "see_doctor", urgent: "urgent", emergency: "emergency" };
const ENGINE_WORD = { self: "low", monitor: "low", soon: "medium", urgent: "urgent", emergency: "emergency" };
function engineLevel(data) { return (data && data.syndrome_engine && data.syndrome_engine.urgency_level) || ""; }

function triageLevelFor(data) {
  if (ENGINE_LEVEL[engineLevel(data)]) return ENGINE_LEVEL[engineLevel(data)];
  const hay = [data.urgency, data.triage, data.overall_urgency].join(" ").toLowerCase();
  if (/emergency|999|112/.test(hay)) return "emergency";
  if (/urgent|high|same[- ]day/.test(hay)) return "urgent";
  if (/soon|medium|moderate|see a doctor/.test(hay)) return "see_doctor";
  if (/monitor|watch/.test(hay)) return "monitor";
  const r = String(data.risk || "").toLowerCase();
  return r === "high" ? "urgent" : r === "medium" ? "see_doctor" : r === "low" ? "self_care" : "monitor";
}

function buildTriage(data) {
  const server = data.home_triage;
  const key = (server && server.level) || triageLevelFor(data);
  const meta = TRIAGE_LEVELS.find(l => l.key === key) || TRIAGE_LEVELS[1];
  const steps = scrubList((server && server.do) || data.home_care_now || data.care);
  return {
    meta: meta, idx: TRIAGE_LEVELS.indexOf(meta),
    headline: (server && server.headline) || meta.headline,
    summary: (server && server.summary) || meta.summary,
    steps: steps.length ? steps : SAFE_STEPS,
    avoid: scrubList((server && server.avoid) || data.avoid),
    watch: scrubList((server && server.watch_for) || data.red_flags),
    escalate: scrubText((server && server.escalate_if) || data.when_doctor || ""),
    specialist: (server && server.specialist) || data.specialist || "",
    recheck: server && typeof server.recheck_hours === "number" ? server.recheck_hours : ({ self_care: 48, monitor: 24, see_doctor: 24, urgent: 0, emergency: 0 })[key],
    note: (server && server.pharmacist_note) || "QueroCura doesn't suggest medicines. If you want something for relief, ask a pharmacist or doctor — they can check it against your allergies, other medicines and health conditions.",
  };
}

function triageHtml(data) {
  const t = buildTriage(data), c = t.meta.color;
  const meter = TRIAGE_LEVELS.map((l, i) =>
    '<div class="tm-seg' + (i <= t.idx ? ' on' : '') + (i === t.idx ? ' now' : '') + '"><div class="tm-bar"></div><div class="tm-label">' + l.label + '</div></div>').join("");
  let html = '<div class="card reveal triage-card" style="--tc:' + c + '">' +
    '<div class="triage-head"><div class="triage-ic">' + t.meta.icon + '</div><div>' +
      '<div class="section-label" style="margin:0 0 2px;">Home triage</div>' +
      '<div class="triage-headline">' + escapeHtml(t.headline) + '</div>' +
      '<div class="triage-sum">' + escapeHtml(t.summary) + '</div></div></div>' +
    '<div class="triage-meter" aria-label="Triage level: ' + escapeHtml(t.meta.label) + '">' + meter + '</div>' +
    '<div class="care-cols"><div><div class="section-label" style="margin-top:0;">Safe to do now</div>' + listHtml("care-list do", t.steps) + '</div>' +
    '<div>' + (t.avoid.length ? '<div class="section-label" style="margin-top:0;">Best avoided</div>' + listHtml("care-list avoid", t.avoid) : '') + '</div></div>';
  // red flags already have their own card at the top of the page
  if (t.escalate) html += '<div class="when-doctor-callout" style="margin-top:14px;"><span>🩺</span><span><strong>See a doctor if:</strong> ' + mdBold(t.escalate) + (t.specialist ? ' <span style="opacity:.75;">(' + escapeHtml(t.specialist) + ')</span>' : '') + '</span></div>';
  html += '<div class="triage-actions">';
  if (t.recheck > 0) html += '<button type="button" class="tri-btn" id="tri-remind" data-hours="' + t.recheck + '">⏰ Remind me to re-check in ' + (t.recheck >= 24 ? (t.recheck / 24) + ' day' + (t.recheck >= 48 ? 's' : '') : t.recheck + 'h') + '</button>';
  if (t.idx >= 2) html += '<a class="tri-btn' + (t.recheck > 0 ? ' ghost' : '') + '" href="../../calendar/?new=1&type=doctor&title=' + encodeURIComponent('Doctor visit — ' + (data.name || 'symptoms')) + '">📅 Book a doctor visit</a>';
  html += '<a class="tri-btn ghost" href="../../vitals/">❤️ Log vitals</a></div>';
  html += '<div class="triage-foot">' + escapeHtml(t.note) + '</div></div>';
  return html;
}

function wireTriageActions(data) {
  const btn = document.getElementById("tri-remind");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await QC.cal.list(); // decides server vs local storage
      const hrs = parseInt(btn.getAttribute("data-hours"), 10) || 24;
      const when = new Date(Date.now() + hrs * 3600000);
      await QC.cal.save({
        title: "Re-check: " + (data.name || "your symptoms"), type: "followup",
        start: QC.cal.fmt(when), status: "scheduled", reminders: [0],
        notes: "How are you feeling compared with your symptom check? Log vitals and re-run the symptom checker if anything changed.",
        prep: [{ text: "Log vitals", done: false }, { text: "Re-run the symptom check if you feel worse", done: false }],
      });
      btn.textContent = "✓ Reminder added to your calendar";
      QC.toast("Reminder set — we'll nudge you to re-check.", "ok");
      QC.refreshAlerts({ force: true, toast: false });
    } catch (e) {
      btn.disabled = false;
      QC.toast("Couldn't add the reminder. Try from the Calendar page.", "err");
    }
  });
}

/* "Ongoing" note: makes it explicit where this result shows up in Insights */
function ongoingNoteHtml(data) {
  if (!data.name) return "";
  return '<div class="ongoing-note"><span>🔎</span><span>This check is saved to <a href="../../insights/">Insights → Ongoing conditions</a>, so you can always see what\'s been flagged. In a day or two I\'ll ask how you\'re feeling, and once you say you\'re better it comes off your ongoing list. It\'s a possibility, not a diagnosis. Already living with <b>' + escapeHtml(data.name) + '</b>? <a href="#" id="add-to-profile">Add it to my profile</a>.</span></div>';
}
function wireOngoing(data) {
  const a = document.getElementById("add-to-profile");
  if (!a) return;
  a.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const cur = await fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json());
      const prof = (cur && cur.profile) || {};
      const list = (prof.conditions || []).slice();
      if (list.some(x => x.toLowerCase() === data.name.toLowerCase())) { QC.toast("Already on your profile.", "ok"); return; }
      list.push(data.name);
      const res = await fetch(API_BASE + "/profile", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, prof, { conditions: list, wizard_done: true })) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.message);
      a.outerHTML = "<b>✓ Added to your profile</b>";
      QC.toast(data.name + " added to your ongoing conditions.", "ok");
    } catch (err) { QC.toast("Couldn't update your profile.", "err"); }
  });
}

const RISK_LEVEL_TEXT = { Low: "Low severity", Medium: "Moderate severity", High: "High severity" };

function matchVisualsHtml(data) {
  const hasGauge = typeof data.match_strength === "number";
  const hasSeverity = data.risk && RISK_LEVEL_TEXT[data.risk];
  if (!hasGauge && !hasSeverity) return "";

  let html = '<div class="match-visuals">';

  if (hasGauge) {
    const pct = Math.round(data.match_strength * 100);
    const gaugeColor = pct >= 62 ? "#0e8f83" : pct >= 35 ? "#c58a0f" : "#8a7bb5";
    const bandText = CONFIDENCE_BAND_TEXT[data.confidence_band] || "Estimated match";
    html += '<div class="gauge-wrap">' +
      '<div class="gauge-ring" style="--pct:' + pct + ';--gauge-color:' + gaugeColor + ';"><div class="gauge-inner">' + pct + '%</div></div>' +
      '<div class="gauge-text"><div class="gauge-title">Match confidence</div><div class="gauge-desc">' + escapeHtml(bandText) + '</div></div>' +
    '</div>';
  }

  if (hasSeverity) {
    const level = data.risk; // "Low" | "Medium" | "High"
    const activeClass = "active-" + level.toLowerCase();
    const segCount = level === "Low" ? 1 : level === "Medium" ? 2 : 3;
    let segs = "";
    for (let i = 0; i < 3; i++) {
      segs += '<div class="sev-seg' + (i < segCount ? " " + activeClass : "") + '"></div>';
    }
    html += '<div class="severity-block">' +
      '<div class="severity-title">Condition severity</div>' +
      '<div class="severity-bar">' + segs + '</div>' +
      '<div class="severity-desc">' + escapeHtml(RISK_LEVEL_TEXT[level]) + '</div>' +
    '</div>';
  }

  html += '</div>';
  return html;
}

function normalizeResponse(data) {
  if (!data || !data.top_condition) return data; // already flat (fast/analyse shape)
  const top = data.top_condition || {};
  const reasoning = data.clinical_reasoning || {};
  return Object.assign({}, data, {
    name: top.name,
    emoji: top.emoji,
    confidence: undefined,
    match_strength: top.match_strength,
    confidence_band: top.confidence_band,
    risk: top.risk,
    description: top.description,
    red_flags: top.red_flags,
    home_care_now: top.home_care_now,
    home_care_ongoing: top.home_care_ongoing,
    avoid: top.avoid,
    when_doctor: top.when_doctor,
    specialist: top.specialist,
    urgency: data.overall_urgency,
    patient_answer: reasoning.patient_answer,
    why_it_fits: reasoning.why_it_fits,
    monitoring_advice: reasoning.monitoring_advice,
    doctor_summary: reasoning.doctor_summary,
    possible_conditions: data.possible_conditions,
  });
}

function renderResult(rawData, interview) {
  const data = normalizeResponse(rawData);
  const wrap = document.getElementById("sym-results");
  const raw = data.raw || data.diagnosis || {};
  const board = raw.medical_reasoning_board || null;
  const governor = raw.final_intelligence_governor || null;

  const urgencyWord = data.urgency || data.triage || "Unknown";
  const sevWord = ENGINE_WORD[engineLevel(data)] || urgencyWord;
  const uColor = urgencyColor(sevWord);
  const isSevere = /high|urgent|emergency/i.test(sevWord) || (board && board.safety_override);

  if (data.name) {
    document.getElementById("results-title").textContent = data.name;
    document.getElementById("results-sub").textContent = "Based on what you shared, here's our read on what might be going on and what to do next.";
  }

  let html = "";
  let delay = 0;
  const step = () => { const d = delay; delay += 90; return 'style="animation-delay:' + d + 'ms"'; };

  html += '<div class="urgency-banner reveal ' + (isSevere ? "pulse" : "") + '" ' + step() + ' style="background:' + uColor + '1a; color:' + uColor + '; animation-delay:' + (delay - 90) + 'ms">' +
    '<span class="ub-dot" style="background:' + uColor + '"></span>' +
    'Urgency: ' + escapeHtml(urgencyWord) +
    (governor && governor.confidence_band ? '<span style="margin-left:auto;font-weight:600;font-size:12.5px;opacity:0.8;text-transform:none;">' + escapeHtml(governor.confidence_band) + ' confidence' + (governor.confidence_score ? ' · ' + Math.round(governor.confidence_score) + '%' : '') + '</span>' : '') +
  '</div>';

  if (interview && interview.emergency) {
    html += '<div class="card reveal emergency-alert" ' + step() + '>' +
      '<div class="section-label" style="margin-top:0;">🚨 Please don\'t wait</div>' +
      '<div class="patient-answer">Some of the answers you gave can be signs of an emergency. <strong>Call your local emergency number (112 in India) or go to the nearest emergency department now.</strong> The analysis below is for information and is not a substitute for urgent care.' +
      ' <a class="tri-btn" style="margin-top:10px;--tc:#d24f28;" href="tel:112">Call 112</a></div></div>';
  }
  if (interview && interview.helpline) {
    html += '<div class="card reveal" ' + step() + '><div class="comorbidity-callout" style="background:rgba(124,111,219,0.1);border-color:rgba(124,111,219,0.35);color:inherit;"><span>💜</span><span>' + escapeHtml(interview.helpline) + '</span></div></div>';
  }

  const redChips = (data.red_flags || []).map(s => '<span class="info-chip red">⚠ ' + escapeHtml(s) + '</span>').join("");
  if (redChips) {
    html += '<div class="card reveal emergency-alert" ' + step() + '>' +
      '<div class="section-label" style="margin-top:0;">🚨 Seek care now if you notice</div>' +
      '<div class="chip-list">' + redChips + '</div>' +
    '</div>';
  }

  if (data.when_doctor) {
    html += '<div class="card reveal" ' + step() + '><div class="when-doctor-callout"><span>🩺</span><span><strong>See a doctor:</strong> ' + mdBold(scrubText(data.when_doctor)) + (data.specialist ? ' <span style="opacity:0.75;">(' + escapeHtml(data.specialist) + ')</span>' : '') + '</span></div></div>';
  }

  if (data.patient_answer || data.summary) {
    html += '<div class="card reveal" ' + step() + '><div class="patient-answer">' + mdBold(scrubText(data.patient_answer || data.summary)).replace(/\n\n/g, "<br><br>") + '</div></div>';
  }

  if (data.name) {
    html += '<div class="card reveal" ' + step() + '>' +
      '<div class="condition-head">' +
        '<div class="condition-emoji">' + (data.emoji || "🩺") + '</div>' +
        '<div><div class="condition-name">' + escapeHtml(data.name) + '</div>' +
        '<div class="condition-meta">' + (data.confidence ? data.confidence + "% match" : "") + '</div></div>' +
      '</div>' +
      (data.description ? '<div class="condition-desc">' + escapeHtml(scrubText(data.description)) + '</div>' : '') +
      matchVisualsHtml(data);

    if (data.home_care_ongoing && scrubList(data.home_care_ongoing).length) {
      html += '<div class="section-label">Ongoing care</div>' + listHtml("care-list do", scrubList(data.home_care_ongoing));
    }
    html += ongoingNoteHtml(data);
    html += '</div>';
  }

  html += triageHtml(data);

  if (interview && interview.summary && interview.summary.length) {
    html += '<div class="card reveal" ' + step() + '>' +
      '<div class="section-label" style="margin-top:0;">What you told me — and what I factored in</div>' +
      '<div class="ans-list">' + interview.summary.map(function (r) { return '<div class="ans-row"><span>' + escapeHtml(r.question) + '</span><b>' + escapeHtml(r.answer) + '</b></div>'; }).join("") + '</div>' +
      '<div class="triage-foot">These detailed answers sharpened the match. If something was wrong, run a new check and answer again.</div></div>';
  }

  if (data.reasoning_explanation) {
    html += '<div class="card reveal" ' + step() + '><div class="reasoning-callout"><span>🧠</span><span>' + escapeHtml(scrubText(data.reasoning_explanation)) + '</span></div></div>';
  }

  if (board && ((board.reasoning_trace && board.reasoning_trace.length) || (board.must_not_miss && board.must_not_miss.length))) {
    html += '<div class="card reveal" ' + step() + '>' +
      '<div class="section-label" style="margin-top:0;">How QueroCura reasoned about this</div>';
    if (board.reasoning_trace && board.reasoning_trace.length) {
      html += '<ul class="monitor-list">' + board.reasoning_trace.map(t => '<li>' + escapeHtml(String(t)) + '</li>').join("") + '</ul>';
    }
    if (board.must_not_miss && board.must_not_miss.length) {
      html += '<div class="chip-list" style="margin-top:10px;">' +
        board.must_not_miss.map(m => '<span class="info-chip red">👁 Don\'t miss: ' + escapeHtml(m.name || "") + '</span>').join("") +
      '</div>';
    }
    html += '</div>';
  }

  const others = (data.possible_conditions || data.alternatives || []).filter(c => c.name && c.name !== data.name).slice(0, 4);
  if (others.length) {
    html += '<div class="card reveal" ' + step() + '>' +
      '<div class="section-label" style="margin-top:0;">Other possibilities</div>' +
      others.map(c => '<div class="other-cond-row"><span class="other-cond-name">' + escapeHtml(c.name) + '</span><span class="other-cond-urgency">' + escapeHtml(c.urgency || c.risk || "—") + '</span></div>').join("") +
    '</div>';
  }

  const comorbidity = data.possible_comorbidity;
  if (comorbidity && comorbidity.note) {
    html += '<div class="card reveal" ' + step() + '><div class="comorbidity-callout"><span>' + (comorbidity.secondary && comorbidity.secondary.emoji ? comorbidity.secondary.emoji : "🔀") + '</span><span><strong>Worth noting:</strong> ' + escapeHtml(comorbidity.note) + '</span></div></div>';
  }

  if ((data.why_it_fits && data.why_it_fits.length) || (data.monitoring_advice && data.monitoring_advice.length)) {
    html += '<div class="card reveal" ' + step() + '>';
    if (data.why_it_fits && data.why_it_fits.length) {
      html += '<div class="section-label" style="margin-top:0;">Why this fits</div>' + listHtml("followup-list", scrubList(data.why_it_fits));
    }
    if (data.monitoring_advice && data.monitoring_advice.length) {
      html += '<div class="section-label">Keep an eye on</div>' + listHtml("monitor-list", scrubList(data.monitoring_advice));
    }
    html += '</div>';
  }

  if (data.doctor_summary) {
    html += '<div class="card reveal" ' + step() + '><div class="doctor-callout"><span>🩺</span><span><strong>For your doctor:</strong> ' + mdBold(scrubText(data.doctor_summary)) + '</span></div></div>';
  }

  wrap.innerHTML = html;
  wireTriageActions(data);
  wireOngoing(data);
  document.getElementById("bottom-actions").style.display = "flex";
}

document.getElementById("qc-signout-btn").addEventListener("click", async () => {
  await fetch(API_BASE + "/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = "../../";
});

(async function init() {
  const [meData, profData] = await Promise.all([
    fetch(API_BASE + "/auth/me", { credentials: "include" }).then(r => r.json()).catch(() => ({ logged_in: false })),
    fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => null),
  ]);
  if (!meData.logged_in) { window.location.href = "../../login/"; return; }
  const user = meData.user;
  if (profData && profData.ok && profData.profile && !profData.profile.wizard_done) {
    window.location.href = "../../onboarding/";
    return;
  }
  const name = user.display_name || user.username || user.email || "";
  const initials = name ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("") : "?";
  document.getElementById("qc-user-dot").textContent = initials;
  document.getElementById("qc-user-name").textContent = name ? name.split(" ")[0] : "";

  // This page only ever renders a result that the symptom analyzer just
  // produced and handed off via sessionStorage -- there's no server-side
  // "get my last result" endpoint, and a stale/missing entry (bookmarked
  // link, back button after starting a new check elsewhere, etc.) means
  // there's genuinely nothing to show here, so send them back to run one.
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem(RESULT_KEY) || "null"); } catch (e) {}
  if (!stored || !stored.data) {
    window.location.href = "../";
    return;
  }
  renderResult(stored.data, stored.interview);
})();
