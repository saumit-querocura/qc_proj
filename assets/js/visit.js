/* Prepare for your next visit.
 *  1. Prepare with me: a short, calm set of questions (what is going on, since when, how it feels, what you've tried,
 *     your medicines, what worries you, what you'd like to ask).  Answers save as you go, per appointment.
 *  2. Doctor summary: your words plus what QueroCura already knows, in the order a doctor takes a history, ready to
 *     download as a PDF, print, copy, or send with a private link.
 *  3. Bring & share: the checklist and the private link with a PIN. */
(function () {
  "use strict";
  var P = QCPage, esc = P.esc, api = P.api;
  var PREP = null, A = null, MEDS = [], PROFILE = {}, STEP = 0, SAVE_T = null, SAVING = null, EVENT = new URLSearchParams(location.search).get("event") || "";
  function el(id) { return document.getElementById(id); }
  function q(path) { return path + (EVENT ? (path.indexOf("?") < 0 ? "?" : "&") + "event=" + encodeURIComponent(EVENT) : ""); }

  function fmtWhen(s) {
    if (!s) return "";
    var d = new Date(String(s).replace(" ", "T"));
    return isNaN(d) ? s : d.toLocaleString([], { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  }
  function fmtDay(s) {
    var d = new Date(s + "T00:00:00");
    return isNaN(d) ? s : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  }
  function inWords(n) { return n === 0 ? "today" : n === 1 ? "tomorrow" : "in " + n + " days"; }

  /* ---------------- the questions ---------------- */
  var C = {
    reasons: [["pain", "🤕", "Pain"], ["fever", "🌡️", "Fever"], ["cough", "😮‍💨", "Cough or breathing"], ["tired", "🥱", "Tiredness"], ["stomach", "🫃", "Stomach"], ["skin", "🩹", "Skin"],
      ["head", "🌀", "Headache or dizziness"], ["mood", "🌧️", "Mood, stress or sleep"], ["checkup", "🩺", "Routine check-up"], ["followup", "🔁", "Follow-up"], ["results", "📄", "Test results"],
      ["refill", "💊", "Medicine review"], ["other", "✨", "Something else"]],
    onset: [["today", "Today"], ["days", "A few days ago"], ["week", "About a week"], ["weeks", "A few weeks"], ["month", "About a month"], ["months", "A few months"], ["year", "About a year"], ["years", "Years"]],
    course: [["better", "🌤️", "Getting better"], ["same", "☁️", "About the same"], ["worse", "🌧️", "Getting worse"], ["comes_goes", "🌦️", "Comes and goes"]],
    areas: [["head", "Head"], ["face", "Face"], ["throat", "Throat"], ["chest", "Chest"], ["back", "Back"], ["belly", "Belly"], ["pelvis", "Lower belly"], ["arms", "Arms / hands"], ["legs", "Legs / feet"], ["joints", "Joints"], ["skin", "Skin"], ["whole", "All over"]],
    feels: [["sharp", "Sharp"], ["dull", "Dull ache"], ["burning", "Burning"], ["throbbing", "Throbbing"], ["tight", "Tight / pressing"], ["cramping", "Cramping"], ["itchy", "Itchy"], ["numb", "Numb / tingling"], ["sore", "Sore"]],
    affects: [["sleep", "😴", "Sleep"], ["work", "💼", "Work or school"], ["eating", "🍽️", "Eating"], ["mood", "💭", "Mood"], ["walking", "🚶", "Moving about"], ["family", "🏡", "Family life"]],
    others: [["fever", "Fever"], ["nausea", "Nausea / vomiting"], ["appetite", "Less appetite"], ["weight", "Weight change"], ["breath", "Breathless"], ["dizzy", "Dizzy"], ["rash", "Rash"], ["swelling", "Swelling"],
      ["urine", "Passing urine changed"], ["bowel", "Bowels changed"], ["bleeding", "Unusual bleeding"], ["palpitations", "Heart racing"]],
    expect: [["explain", "💡", "An explanation"], ["tests", "🧪", "Tests"], ["treatment", "🌿", "Treatment"], ["meds_review", "💊", "Review my medicines"], ["reassure", "🤝", "Reassurance"],
      ["referral", "🧭", "A specialist"], ["certificate", "📝", "A certificate"], ["plan", "🗺️", "A plan for next steps"]],
    meds: [["as_prescribed", "✓ As prescribed"], ["missed_some", "Missed some"], ["stopped", "Stopped"], ["side_effects", "Side effects"], ["unsure", "Not sure how"]],
    ynu: [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]],
    sleep: [["good", "😴 Well"], ["ok", "😐 So-so"], ["poor", "😵‍💫 Poorly"]]
  };
  var FACES = ["😌", "🙂", "🙂", "😐", "😐", "😕", "😣", "😣", "😖", "😫", "😫"];
  var WORDS = ["None at all", "Barely there", "Mild", "Mild", "Noticeable", "Moderate", "Quite bad", "Bad", "Very bad", "Severe", "Worst imaginable"];
  var PLANTS = ["🌱", "🌱", "🌿", "🌿", "🪴", "🪴", "🌳", "🌳", "🌷", "🌸", "🌸", "💐"];

  function symptomish() { return !A.reasons.length || A.reasons.some(function (r) { return ["checkup", "followup", "results", "refill"].indexOf(r) < 0; }); }
  function maybePregnant() { var s = String(PROFILE.sex || "").toLowerCase(), a = +PROFILE.age || 0; return s === "female" && (!a || (a >= 12 && a <= 55)); }

  // Each step: id, emoji, a question, a hint, and whether it applies right now.
  var STEPS = [
    { id: "hello", ok: function () { return true; } },
    { id: "what", e: "🌼", t: "What's bringing you in?", h: "Pick anything that fits, then say it in your own words. There are no wrong answers." },
    { id: "when", e: "🗓️", t: "When did it start, and how is it going?", h: "Roughly is perfect.", ok: symptomish },
    { id: "where", e: "📍", t: "Where do you feel it, and what is it like?", h: "Skip anything that doesn't apply.", ok: symptomish },
    { id: "how", e: "🌡️", t: "How much is it bothering you?", h: "At its worst. Slide to the face that fits.", ok: symptomish },
    { id: "change", e: "🔄", t: "What makes it better or worse?", h: "And anything you've already tried, including home remedies or medicines.", ok: symptomish },
    { id: "else", e: "🔍", t: "Noticed anything else?", h: "Even things that seem unrelated can help your doctor." },
    { id: "meds", e: "💊", t: "How are your medicines going?", h: "Honest answers help your doctor most. Nobody is judging." },
    { id: "you", e: "🫶", t: "A little about you lately", h: "Only if you're happy to share." },
    { id: "mind", e: "💭", t: "What's on your mind about it?", h: "Doctors find this one really useful: what you think it is, what worries you, and what you'd like from the visit." },
    { id: "ask", e: "🙋", t: "What would you like to ask?", h: "Tick the ones you want, and add your own. They'll be listed for your doctor." },
    { id: "done", ok: function () { return true; } }
  ];
  function live() { return STEPS.filter(function (s) { return !s.ok || s.ok(); }); }

  function pills(name, list, multi, chosen) {
    return '<div class="vp-pills" role="group" data-name="' + name + '">' + list.map(function (o) {
      var on = multi ? chosen.indexOf(o[0]) >= 0 : chosen === o[0];
      var label = o.length === 3 ? '<span class="pe" aria-hidden="true">' + o[1] + "</span>" + esc(o[2]) : esc(o[1]);
      return '<button type="button" class="vp-pill' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-' + (multi ? "multi" : "one") + '="' + name + '" data-v="' + o[0] + '">' + label + "</button>";
    }).join("") + "</div>";
  }
  function area(id, val, ph, rows) { return '<textarea class="input vp-text" id="' + id + '" rows="' + (rows || 2) + '" maxlength="400" placeholder="' + esc(ph) + '">' + esc(val || "") + "</textarea>"; }
  function label(t, forId) { return forId ? '<label class="vp-lbl" for="' + forId + '">' + esc(t) + "</label>" : '<div class="vp-lbl">' + esc(t) + "</div>"; }

  function knownChips() {
    var k = [], ab = (PREP && PREP.about_you) || {};
    (ab.conditions || []).forEach(function (c) { k.push(["🩺", c]); });
    (ab.allergies || []).forEach(function (a) { k.push(["⚠️", "Allergy: " + a]); });
    if (MEDS.length) k.push(["💊", MEDS.length + " medicine" + (MEDS.length > 1 ? "s" : "")]);
    if (PREP && PREP.readings && PREP.readings.length) k.push(["❤️", PREP.readings.length + " kinds of readings"]);
    if (PREP && PREP.symptom_checks && PREP.symptom_checks.length) k.push(["🔍", PREP.symptom_checks.length + " symptom check" + (PREP.symptom_checks.length > 1 ? "s" : "")]);
    if (PREP && PREP.records && (PREP.records.flagged_labs || []).length) k.push(["🧪", PREP.records.flagged_labs.length + " lab value" + (PREP.records.flagged_labs.length > 1 ? "s" : "") + " to mention"]);
    return k;
  }

  function stepBody(s) {
    var h = "";
    switch (s.id) {
      case "hello":
        var v = PREP.visit, k = knownChips();
        h = '<div class="vp-hello"><div class="vp-sun" aria-hidden="true">🌤️</div><h2>' + (v ? "Let's get you ready for " + esc(v.title) : "Let's get you ready for your next visit") + "</h2>" +
          (v ? '<p class="vp-when">' + esc(fmtWhen(v.when)) + (v.in_days != null ? " · " + inWords(v.in_days) : "") + "</p>" : "") +
          "<p>A few gentle questions, about three minutes. We'll turn your answers into a one-page summary your doctor can read in under a minute, so more of your visit is about you.</p>" +
          (k.length ? '<div class="vp-known"><div class="vp-lbl">Already filled in from QueroCura ✨</div><div class="vp-chips">' + k.map(function (c) { return '<span class="vp-chip"><span aria-hidden="true">' + c[0] + "</span>" + esc(c[1]) + "</span>"; }).join("") + "</div></div>" : "") +
          (A.reasons.length || A.reason_text ? '<p class="vp-soft">You started this earlier. We kept everything, so you can pick up where you left off.</p>' : "") + "</div>";
        break;
      case "what":
        h = pills("reasons", C.reasons, true, A.reasons) + label("In your own words", "f-reason") + area("f-reason", A.reason_text, "e.g. Headaches most mornings for two weeks, worse after screens", 3);
        break;
      case "when":
        h = pills("onset", C.onset, false, A.onset) + '<div class="vp-row">' + label("Or a date, if you remember", "f-onset-date") + '<input class="input vp-date" type="date" id="f-onset-date" value="' + esc(A.onset_date) + '" max="' + new Date().toISOString().slice(0, 10) + '"></div>' +
          label("Since then, it's…") + pills("course", C.course, false, A.course);
        break;
      case "where":
        h = label("Where") + pills("areas", C.areas, true, A.areas) + label("What it feels like") + pills("feels", C.feels, true, A.feels);
        break;
      case "how":
        var sv = A.severity == null ? 5 : A.severity;
        h = '<div class="vp-meter"><div class="vp-face" id="f-face" aria-hidden="true">' + FACES[sv] + '</div><div class="vp-sevn"><b id="f-sevn">' + (A.severity == null ? "–" : sv) + '</b>/10 · <span id="f-sevw">' + (A.severity == null ? "Slide to choose" : WORDS[sv]) + "</span></div>" +
          '<input type="range" min="0" max="10" step="1" id="f-sev" value="' + sv + '" aria-label="How bad it is at its worst, 0 to 10" aria-valuetext="' + (A.severity == null ? "not chosen" : sv + " out of 10, " + WORDS[sv]) + '"><div class="vp-scale"><span>0 · none</span><span>10 · worst</span></div></div>' +
          label("It gets in the way of…") + pills("affects", C.affects, true, A.affects);
        break;
      case "change":
        h = label("Better with", "f-better") + area("f-better", A.better, "e.g. Rest, lying down in a dark room") + label("Worse with", "f-worse") + area("f-worse", A.worse, "e.g. Screens, climbing stairs, after food") +
          label("Already tried", "f-tried") + area("f-tried", A.tried, "e.g. Paracetamol 500 mg twice, more water, a hot pack");
        break;
      case "else":
        h = pills("others", C.others, true, A.others) + label("Anything else", "f-other") + area("f-other", A.other_text, "e.g. My feet swell by evening");
        break;
      case "meds":
        h = MEDS.length ? '<div class="vp-meds">' + MEDS.map(function (m) {
          return '<div class="vp-med"><div class="vp-medn"><b>' + esc(m.name) + "</b> " + esc(m.strength || "") + '<small>' + esc(m.how || "") + "</small></div>" + pills("med:" + m.id, C.meds, false, A.meds[m.id] || "") + "</div>";
        }).join("") + "</div>" : '<div class="vp-empty">No medicines are saved in CuraVault yet. If you take any, list them below (and you can <a href="../curavault/">add them to CuraVault</a> for reminders).</div>';
        h += label(MEDS.length ? "Side effects, or anything else about your medicines" : "Medicines you take, and anything about them", "f-mednote") + area("f-mednote", A.meds_note, MEDS.length ? "e.g. The new tablet makes me dizzy in the morning" : "e.g. Telmisartan 40 mg each morning; a vitamin D sachet weekly", 3);
        break;
      case "you":
        h = label("Sleep lately") + pills("ctx:sleep", C.sleep, false, A.context.sleep) + label("More stress than usual?") + pills("ctx:stress", C.ynu, false, A.context.stress) +
          label("Travelled recently?") + pills("ctx:travel", C.ynu, false, A.context.travel) +
          (maybePregnant() ? label("Could you be pregnant?") + pills("ctx:pregnant", C.ynu.concat([["na", "Doesn't apply"]]), false, A.context.pregnant) : "");
        break;
      case "mind":
        h = label("What do you think it might be?", "f-ideas") + area("f-ideas", A.ideas, "e.g. Maybe my blood pressure") + label("What worries you most?", "f-concerns") + area("f-concerns", A.concerns, "e.g. That it could be something serious", 2) +
          label("From this visit, I'd love…") + pills("expect", C.expect, true, A.expect) + area("f-expect", A.expect_text, "Anything else you hope for (optional)", 1).replace("<textarea ", '<textarea aria-label="Anything else you hope for" ');
        break;
      case "ask":
        var sug = [];
        ((PREP && PREP.question_groups) || []).forEach(function (g) { (g.questions || []).forEach(function (x) { if (sug.indexOf(x) < 0) sug.push(x); }); });
        sug = sug.slice(0, 10);
        A.questions.forEach(function (x) { if (sug.indexOf(x) < 0) sug.unshift(x); });
        h = (sug.length ? '<div class="vp-qs">' + sug.map(function (x, i) {
          var on = A.questions.indexOf(x) >= 0;
          return '<label class="vp-q' + (on ? " on" : "") + '"><input type="checkbox" data-q="' + i + '"' + (on ? " checked" : "") + "><span>" + esc(x) + "</span></label>";
        }).join("") + "</div>" : "") +
          label("Your own questions") + '<div class="vp-own" id="f-own">' + A.own_questions.map(function (x, i) { return '<div class="vp-ownq"><span>' + esc(x) + '</span><button type="button" class="vp-x" data-rmq="' + i + '" aria-label="Remove">✕</button></div>'; }).join("") + "</div>" +
          '<div class="vp-addq"><input class="input" id="f-newq" maxlength="220" aria-label="Add your own question" placeholder="e.g. Can I keep going to the gym?"><button type="button" class="btn" id="f-addq">Add</button></div>';
        STEPS_SUG = sug;
        break;
      case "done":
        h = '<div class="vp-hello vp-done"><div class="vp-sun big" aria-hidden="true">🌸</div><h2>You’re ready.</h2><p>Your summary is waiting. Download it, print it, or send your doctor a private link. You can come back and change anything until your visit.</p>' +
          '<div class="vp-row center"><button class="btn btn-primary" type="button" data-go="summary">See my doctor summary</button><button class="btn" type="button" id="f-pdf2">⬇ Download PDF</button></div></div>';
        break;
    }
    return h;
  }
  var STEPS_SUG = [];

  function renderStep(dir) {
    var steps = live();
    STEP = Math.max(0, Math.min(STEP, steps.length - 1));
    var s = steps[STEP], first = STEP === 0, last = s.id === "done";
    var pct = Math.round(100 * STEP / (steps.length - 1));
    var dots = steps.map(function (x, i) { return '<span class="vp-dot' + (i < STEP ? " past" : i === STEP ? " now" : "") + '"></span>'; }).join("");
    el("vp").innerHTML =
      '<div class="vp-progress" aria-hidden="true"><div class="vp-track"><div class="vp-fill" style="width:' + pct + '%"></div><div class="vp-plant" style="left:' + pct + '%">' + PLANTS[Math.min(PLANTS.length - 1, Math.round(pct / 9))] + "</div></div>" +
        '<div class="vp-dots">' + dots + "</div></div>" +
      '<div class="vp-card ' + (dir < 0 ? "from-left" : "from-right") + '" role="group" aria-labelledby="vp-q">' +
        (s.t ? '<div class="vp-head"><span class="vp-emoji" aria-hidden="true">' + s.e + '</span><div><div class="vp-count">Step ' + STEP + " of " + (steps.length - 2) + '</div><h2 id="vp-q">' + esc(s.t) + '</h2><p class="vp-hint">' + esc(s.h) + "</p></div></div>" : '<span id="vp-q" class="sr-only">Visit preparation</span>') +
        '<div class="vp-body">' + stepBody(s) + "</div></div>" +
      '<div class="vp-nav">' + (first ? "<span></span>" : '<button type="button" class="btn vp-back" id="vp-back">← Back</button>') +
        '<span class="vp-saved" id="vp-saved" aria-live="polite"></span>' +
        (last ? "" : '<button type="button" class="btn btn-primary vp-next" id="vp-next">' + (first ? (A.reasons.length || A.reason_text ? "Carry on →" : "Let's begin →") : (s.id === "ask" ? "Finish 🌸" : "Next →")) + "</button>") + "</div>" +
      (!first && !last ? '<button type="button" class="vp-skip" id="vp-skip">Skip this one</button>' : "");
    wireStep(s);
    if (s.id === "done") { P.confetti(["🌸", "🌼", "✨", "💛"], 26); A.done = true; queueSave(true); }
    var head = el("vp-q"); if (head && dir) try { head.focus({ preventScroll: true }); } catch (e) {}
  }

  function readFields(s) {
    var v = function (id) { var x = el(id); return x ? x.value.trim() : null; };
    if (s.id === "what") A.reason_text = v("f-reason");
    if (s.id === "when") A.onset_date = v("f-onset-date") || "";
    if (s.id === "change") { A.better = v("f-better"); A.worse = v("f-worse"); A.tried = v("f-tried"); }
    if (s.id === "else") A.other_text = v("f-other");
    if (s.id === "meds") A.meds_note = v("f-mednote");
    if (s.id === "mind") { A.ideas = v("f-ideas"); A.concerns = v("f-concerns"); A.expect_text = v("f-expect"); }
  }

  function wireStep(s) {
    var box = el("vp");
    box.querySelectorAll("textarea, input[type=date], #f-newq").forEach(function (t) { t.addEventListener("input", function () { readFields(s); queueSave(); }); });
    box.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.hasAttribute("data-multi")) {
        var n = b.getAttribute("data-multi"), val = b.getAttribute("data-v"), arr = A[n], i = arr.indexOf(val);
        if (i >= 0) arr.splice(i, 1); else arr.push(val);
        b.classList.toggle("on", i < 0); b.setAttribute("aria-pressed", i < 0); pop(b); queueSave(); return;
      }
      if (b.hasAttribute("data-one")) {
        var key = b.getAttribute("data-one"), v1 = b.getAttribute("data-v"), cur;
        if (key.indexOf("med:") === 0) { cur = A.meds[key.slice(4)]; A.meds[key.slice(4)] = cur === v1 ? undefined : v1; if (cur === v1) delete A.meds[key.slice(4)]; }
        else if (key.indexOf("ctx:") === 0) { cur = A.context[key.slice(4)]; A.context[key.slice(4)] = cur === v1 ? "" : v1; }
        else { cur = A[key]; A[key] = cur === v1 ? "" : v1; }
        b.parentNode.querySelectorAll("button").forEach(function (x) { var on = x === b && cur !== v1; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
        pop(b); queueSave(); return;
      }
      if (b.id === "vp-next") return next(1);
      if (b.id === "vp-back") return next(-1);
      if (b.id === "f-addq") return addQ();
      if (b.id === "f-pdf2") return downloadPdf(b);
      if (b.hasAttribute("data-rmq")) { A.own_questions.splice(+b.getAttribute("data-rmq"), 1); queueSave(); renderStep(0); return; }
      if (b.hasAttribute("data-go")) return showTab(b.getAttribute("data-go"));
    };
    var skip = el("vp-skip"); if (skip) skip.onclick = function () { next(1); };
    var sev = el("f-sev");
    if (sev) sev.addEventListener("input", function () {
      var n = +sev.value; A.severity = n; el("f-face").textContent = FACES[n]; el("f-sevn").textContent = n; el("f-sevw").textContent = WORDS[n];
      sev.setAttribute("aria-valuetext", n + " out of 10, " + WORDS[n]);
      el("f-face").classList.remove("wob"); void el("f-face").offsetWidth; el("f-face").classList.add("wob"); queueSave();
    });
    box.querySelectorAll("[data-q]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var x = STEPS_SUG[+cb.getAttribute("data-q")], i = A.questions.indexOf(x);
        if (cb.checked && i < 0) A.questions.push(x); if (!cb.checked && i >= 0) A.questions.splice(i, 1);
        cb.closest(".vp-q").classList.toggle("on", cb.checked); queueSave();
      });
    });
    var nq = el("f-newq"); if (nq) nq.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addQ(); } });
  }
  function addQ() {
    var i = el("f-newq"), t = i.value.trim();
    if (!t) return;
    if (A.own_questions.length >= 6) { P.toast("Six of your own is the most. Your doctor will thank you for keeping it short.", "err"); return; }
    A.own_questions.push(t); queueSave(); renderStep(0); el("f-newq").focus();
  }
  function pop(b) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }

  function next(d) {
    var steps = live(); readFields(steps[STEP]);
    STEP = Math.max(0, Math.min(steps.length - 1, STEP + d));
    A.step = STEP; queueSave();
    renderStep(d);
    window.scrollTo({ top: Math.max(0, el("vp").getBoundingClientRect().top + window.scrollY - 90), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function queueSave(now) {
    clearTimeout(SAVE_T);
    var s = el("vp-saved"); if (s) s.textContent = "Saving…";
    SAVE_T = setTimeout(save, now ? 0 : 700);
  }
  function save() {
    var body = JSON.parse(JSON.stringify(A));
    SAVING = api("/insights/visit-prep/answers", { method: "POST", body: { event: EVENT || (PREP.visit && PREP.visit.id) || "", answers: body } }).then(function (r) {
      var s = el("vp-saved");
      if (s) s.textContent = r && r.ok ? "Saved ✓" : "Couldn't save. We'll try again.";
      if (!(r && r.ok)) SAVE_T = setTimeout(save, 4000);
      return r;
    });
    return SAVING;
  }

  /* ---------------- doctor summary ---------------- */
  function flush() { clearTimeout(SAVE_T); return save(); }

  function showTab(t) {
    document.querySelectorAll("[data-tab]").forEach(function (b) { var on = b.getAttribute("data-tab") === t; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    el("pane-prep").hidden = t !== "prep"; el("pane-summary").hidden = t !== "summary"; el("pane-bring").hidden = t !== "bring";
    if (t === "summary") flush().then(loadSummary);
    try { history.replaceState(null, "", location.pathname + location.search + "#" + t); } catch (e) {}
  }

  function loadSummary() {
    el("sum").innerHTML = '<div class="paper"><p class="sub">Putting your summary together…</p></div>';
    api(q("/insights/visit-prep/summary")).then(function (r) {
      if (!r || !r.ok) { el("sum").innerHTML = '<div class="card"><p class="msg err">' + esc((r && (r.message || r.err)) || "Couldn't build the summary.") + "</p></div>"; return; }
      SUMMARY = r.summary; el("sum").innerHTML = paper(r.summary);
    });
  }
  var SUMMARY = null;

  function paper(s) {
    var p = s.patient, v = s.visit, sec = function (t, body) { return body ? '<section><h3>' + esc(t) + "</h3>" + body + "</section>" : ""; };
    var who = [p.name || "You", p.age ? p.age + " yrs" : "", p.sex, p.blood ? "Blood group " + p.blood : ""].filter(Boolean).join(", ");
    var empty = !s.concern && !s.hpi.length && !s.ice.length;
    var h = '<article class="paper" aria-label="Doctor summary"><header><div class="ph-t">Visit summary for the clinician</div><div class="ph-who">' + esc(who) + '</div><div class="ph-meta">' +
      esc(v ? v.title + " · " + fmtWhen(v.when) : "No appointment in the calendar") + (s.since_last_visit && s.since_last_visit.date ? " · Last visit " + esc(fmtDay(s.since_last_visit.date)) : "") + "</div></header>";
    if (empty) h += '<div class="ph-nudge">🌱 Your own words are missing. <button type="button" class="linkish" data-go="prep">Answer a few questions</button> and they’ll appear here first.</div>';
    h += sec("Presenting concern", s.concern ? "<p><b>" + esc(s.concern) + "</b></p>" : "");
    h += sec("History, in my words", s.hpi.length ? "<p>" + s.hpi.map(esc).join(" ") + "</p>" : "");
    h += sec("Ideas, concerns, expectations", s.ice.map(function (x) { return "<p><b>" + esc(x[0]) + ":</b> " + esc(x[1]) + "</p>"; }).join(""));
    var bg = (s.allergies.length ? '<p><b>Allergies:</b> <span class="ph-red">' + s.allergies.map(esc).join(", ") + "</span></p>" : "") + (s.conditions.length ? "<p><b>Known conditions:</b> " + s.conditions.map(esc).join(", ") + "</p>" : "") +
      (s.context.length ? "<p><b>Also:</b> " + s.context.map(esc).join("; ") + "</p>" : "");
    h += sec("Background", bg);
    var a = s.adherence || {};
    h += sec("Medicines", s.medicines.length || s.meds_note ? (s.medicines.length ? '<div class="table-scroll"><table><thead><tr><th>Medicine</th><th>How</th><th>I say</th></tr></thead><tbody>' + s.medicines.map(function (m) { return "<tr><td>" + esc(m.name) + '</td><td class="mut">' + esc(m.how) + "</td><td>" + esc(m.reported || "–") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      (a.has_data ? '<p class="mut">Doses marked taken in QueroCura, last ' + a.days + " days: <b>" + a.taken + " of " + a.scheduled + " (" + a.percent + "%)</b>; skipped " + a.skipped + "; not answered " + a.unanswered + ".</p>" : "") +
      (s.meds_note ? "<p><b>My note:</b> " + esc(s.meds_note) + "</p>" : "") : "");
    h += sec("Home readings", s.readings.length ? '<div class="table-scroll"><table><thead><tr><th>Reading</th><th>Latest</th><th>Range</th><th>Trend</th></tr></thead><tbody>' + s.readings.map(function (r) {
      return "<tr><td>" + esc(r.label) + (r.flag ? ' <span class="ph-flag">flagged</span>' : "") + "</td><td><b>" + esc(r.latest) + "</b> " + esc(r.unit) + "</td><td>" + esc(r.min) + "–" + esc(r.max) + "</td><td>" + esc(r.direction) + " (" + esc(r.count) + ")</td></tr>";
    }).join("") + "</tbody></table></div>" : "");
    var rec = (s.flagged_labs.length ? "<p><b>Lab values outside the usual range:</b> " + s.flagged_labs.map(esc).join(", ") + "</p>" : "") + (s.scans.length ? "<p><b>Scan reports:</b> " + s.scans.map(esc).join(", ") + "</p>" : "") +
      (s.symptom_checks.length ? "<p><b>App symptom checks</b> <span class=\"mut\">(pattern matches, not diagnoses)</span>: " + s.symptom_checks.map(function (c) { return esc(fmtDay(c.date)) + " " + esc(c.result); }).join("; ") + "</p>" : "");
    h += sec("Records", rec);
    h += sec("I'd like to ask", s.questions.length ? "<ol>" + s.questions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol>" : "");
    h += '<footer>' + esc(s.note) + " Prepared " + esc(s.generated) + ".</footer></article>";
    return h;
  }

  function downloadPdf(btn) {
    if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = "Preparing…"; }
    flush().then(function () { return fetch(P.API + q("/insights/visit-prep/pdf"), { credentials: "include" }); }).then(function (r) {
      if (!r.ok) throw new Error("pdf");
      var name = (/filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "") || [])[1] || "visit-summary.pdf";
      return r.blob().then(function (b) { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000); P.toast("Downloaded. Bring it along, or send it to your doctor.", ""); });
    }).catch(function () { P.toast("Couldn't make the PDF just now. Try Print instead.", "err"); }).then(function () { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t; } });
  }

  function asText(s) {
    var L = ["VISIT SUMMARY (" + s.generated + ")", [s.patient.name, s.patient.age ? s.patient.age + " yrs" : "", s.patient.sex].filter(Boolean).join(", ")];
    if (s.visit) L.push(s.visit.title + ", " + fmtWhen(s.visit.when));
    if (s.concern) L.push("", "CONCERN: " + s.concern);
    if (s.hpi.length) L.push("", "HISTORY: " + s.hpi.join(" "));
    s.ice.forEach(function (x) { L.push(x[0] + ": " + x[1]); });
    if (s.allergies.length) L.push("", "Allergies: " + s.allergies.join(", "));
    if (s.conditions.length) L.push("Conditions: " + s.conditions.join(", "));
    if (s.medicines.length) { L.push("", "MEDICINES"); s.medicines.forEach(function (m) { L.push("- " + m.name + (m.how ? " (" + m.how + ")" : "") + (m.reported ? ": " + m.reported : "")); }); }
    if (s.meds_note) L.push("Note: " + s.meds_note);
    if (s.readings.length) { L.push("", "READINGS"); s.readings.forEach(function (r) { L.push("- " + r.label + ": latest " + r.latest + " " + r.unit + ", range " + r.min + " to " + r.max + ", " + r.direction); }); }
    if (s.questions.length) { L.push("", "QUESTIONS"); s.questions.forEach(function (x, i) { L.push(i + 1 + ". " + x); }); }
    L.push("", s.note);
    return L.join("\n");
  }

  /* ---------------- bring & share ---------------- */
  function bring(d) {
    return '<div class="card"><h2>Bring with you</h2><ul class="ck">' + d.checklist.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>" + shareCard(d);
  }
  var SECTIONS = [["summary", "Basics, allergies and conditions", true], ["vitals", "Vitals and trends", true], ["labs", "Lab results", true], ["imaging", "Scan reports", false],
    ["medicines", "Current medicines", true], ["symptoms", "Recent symptom checks", true], ["questions", "My questions", true]];
  function hoursOptions(d) {
    var opts = [[24, "1 day"], [48, "2 days"], [72, "3 days"], [168, "7 days"]], pick = 48;
    if (d.visit && d.visit.in_days != null) {
      var need = (d.visit.in_days + 2) * 24;
      pick = opts.reduce(function (b, o) { return o[0] >= need && (b === null || o[0] < b) ? o[0] : b; }, null) || 168;
    }
    return opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === pick ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  }
  function shareCard(d) {
    return '<div class="card no-print" id="share-card"><h2>Send it to your doctor</h2>' +
      '<p class="sub">A private link (and QR code) so your doctor can read a one-page brief before you walk in. You choose what is in it, it needs a PIN, it stops working on its own, and you can switch it off any time. Your answers above are included.</p>' +
      '<div class="lbl">Include</div><div class="scopes">' + SECTIONS.map(function (x) { return '<label class="scope' + (x[2] ? " on" : "") + '"><input type="checkbox" data-sec="' + x[0] + '"' + (x[2] ? " checked" : "") + "> <span>" + esc(x[1]) + "</span></label>"; }).join("") + "</div>" +
      '<div class="grid2"><div class="field"><label for="b-hours">Link works for</label><select class="input" id="b-hours">' + hoursOptions(d) + "</select></div></div>" +
      '<div class="row"><button class="btn btn-primary" id="b-make" type="button">Create link and QR code</button></div>' +
      '<div class="msg" id="b-msg" role="status"></div><div id="b-out" hidden></div></div>';
  }
  function wireShare() {
    var card = el("share-card"); if (!card) return;
    card.addEventListener("change", function (e) { var l = e.target.closest && e.target.closest(".scope"); if (l) l.classList.toggle("on", e.target.checked); });
    el("b-make").addEventListener("click", function () {
      var btn = this, msg = el("b-msg");
      var scopes = ["brief"].concat(Array.prototype.map.call(card.querySelectorAll("[data-sec]:checked"), function (c) { return c.getAttribute("data-sec"); }));
      var reason = A.reason_text || "", concerns = [A.concerns, A.ideas ? "Wonders if it is: " + A.ideas : ""].filter(Boolean).slice(0, 3);
      btn.disabled = true; msg.className = "msg"; msg.textContent = "Making your link...";
      flush().then(function () {
        return api("/share/create", { method: "POST", body: { hours: +el("b-hours").value, scopes: scopes, label: "Visit prep", max_views: 10, brief: { reason: reason.slice(0, 300), concerns: concerns.map(function (c) { return c.slice(0, 160); }) } } });
      }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.className = "msg err"; msg.textContent = r.message || "Couldn't make the link."; return; }
        msg.textContent = ""; showLink(r);
        api("/share/qr", { method: "POST", body: { url: r.url } }).then(function (x) { if (x.ok && el("b-qr")) { el("b-qr").src = x.png; el("b-qr").hidden = false; } });
      });
    });
  }
  function showLink(r) {
    var out = el("b-out"), until = new Date(r.expires_ts * 1000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    out.hidden = false;
    out.innerHTML = '<div class="shared"><div class="qrbox"><img id="b-qr" alt="QR code for your doctor to scan" width="210" height="210" hidden></div><div class="grow">' +
      '<div class="lbl">PIN (tell your doctor separately: say it, or send it in another message)</div><div class="pin">' + esc(r.pin || "") + '</div>' +
      '<div class="lbl" style="margin-top:12px">Link</div><input class="input" id="b-url" readonly value="' + esc(r.url) + '">' +
      '<div class="row" style="margin-top:10px"><button class="btn btn-sm" id="b-copy" type="button">Copy link</button>' +
        (navigator.share ? '<button class="btn btn-sm" id="b-share" type="button">Share...</button>' : "") +
        '<a class="btn btn-sm" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent("My health summary for our visit (private link, works until " + until + "): " + r.url + "\nI will send the PIN separately.") + '">WhatsApp</a></div>' +
      '<p class="hint" style="margin-top:10px">Works until ' + esc(until) + ' · opens up to ' + esc(r.max_views) + ' times.</p>' +
      '<div class="row"><button class="btn btn-sm" id="b-seen" type="button">Has my doctor opened it?</button><button class="btn btn-sm btn-danger" id="b-off" type="button">Turn the link off</button></div>' +
      '<div class="msg" id="b-state" role="status"></div></div></div>';
    el("b-copy").addEventListener("click", function () { QC.copy(r.url).then(function () { P.toast("Link copied. Send the PIN separately.", ""); }, function () { P.toast("Couldn't copy.", "err"); }); });
    var sh = el("b-share");
    if (sh) sh.addEventListener("click", function () { navigator.share({ title: "My health summary", text: "My health summary for our visit. I will send the PIN separately.", url: r.url }).catch(function () {}); });
    el("b-seen").addEventListener("click", function () {
      api("/share/" + r.id + "/log").then(function (l) {
        var m = el("b-state"); m.className = "msg";
        var seen = (l.log || []).filter(function (x) { return x.outcome === "viewed"; });
        m.textContent = seen.length ? "Opened " + seen.length + " time" + (seen.length === 1 ? "" : "s") + ", most recently " + new Date(seen[0].ts * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " (" + seen[0].device + ")." : "Not opened yet.";
      });
    });
    el("b-off").addEventListener("click", function () {
      api("/share/" + r.id + "/revoke", { method: "POST" }).then(function (x) { var m = el("b-state"); m.className = "msg " + (x.ok ? "ok" : "err"); m.textContent = x.ok ? "The link is off. Nobody can open it now." : (x.message || "Couldn't turn it off."); });
    });
  }

  /* ---------------- start ---------------- */
  document.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
  document.addEventListener("click", function (e) { var g = e.target.closest && e.target.closest("#sum [data-go]"); if (g) showTab(g.getAttribute("data-go")); });
  el("dl").addEventListener("click", function () { downloadPdf(el("dl")); });
  el("print").addEventListener("click", function () { if (el("pane-summary").hidden) { showTab("summary"); setTimeout(function () { window.print(); }, 900); } else window.print(); });
  el("copy").addEventListener("click", function () {
    if (!SUMMARY) { P.toast("Open the summary first.", "err"); return; }
    QC.copy(asText(SUMMARY)).then(function () { P.toast("Copied. Paste it into a message or your notes.", ""); }, function () { P.toast("Couldn't copy.", "err"); });
  });
  el("restart").addEventListener("click", function () {
    if (!window.confirm("Clear your answers for this visit and start again?")) return;
    api("/insights/visit-prep/answers", { method: "POST", body: { event: EVENT || (PREP.visit && PREP.visit.id) || "", clear: true } }).then(function (r) { if (r.ok) { A = r.answers; STEP = 0; renderStep(-1); P.toast("Fresh start 🌱"); } });
  });
  // leaving mid-sentence: send the last keystrokes even as the page closes
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden" || !A || !PREP) return;
    var s = el("vp-saved"); if (!s || s.textContent !== "Saving…") return;
    clearTimeout(SAVE_T);
    try { fetch(P.API + "/insights/visit-prep/answers", { method: "POST", credentials: "include", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: EVENT, answers: A }) }); } catch (e) {}
  });

  P.init().then(function (me) {
    if (!me || !me.logged_in) return;
    Promise.all([api(q("/insights/visit-prep")), api(q("/insights/visit-prep/answers")), api("/profile")]).then(function (r) {
      var d = r[0], a = r[1], pr = r[2];
      if (!d || !d.ok) { el("vp").innerHTML = '<div class="card"><p class="msg err">' + esc((d && (d.err || d.message)) || "Couldn't build your page.") + "</p></div>"; return; }
      PREP = d; A = (a && a.ok && a.answers) || {}; MEDS = (a && a.medicines) || []; PROFILE = (pr && pr.profile) || {};
      ["reasons", "areas", "feels", "affects", "others", "expect", "questions", "own_questions"].forEach(function (k) { if (!Array.isArray(A[k])) A[k] = []; });
      if (!A.meds || typeof A.meds !== "object") A.meds = {}; if (!A.context) A.context = {};
      if (!EVENT && d.visit && d.visit.id) EVENT = d.visit.id;
      STEP = A.done ? 0 : (A.step || 0);
      el("hero").innerHTML = hero(d);
      renderStep(0);
      el("pane-bring").innerHTML = bring(d); wireShare();
      var h = location.hash.replace("#", "");
      if (h === "summary" || h === "bring") showTab(h);
    });
  });

  function hero(d) {
    var v = d.visit, since = d.since_last_visit || {};
    return v ? '<div class="hv-ic" aria-hidden="true">🩺</div><div><div class="hv-t">' + esc(v.title) + '</div><div class="hv-w">' + esc(fmtWhen(v.when)) + (v.in_days != null ? " · " + inWords(v.in_days) : "") + (v.location ? " · 📍 " + esc(v.location) : "") + "</div>" +
      (since.date ? '<div class="hv-s">Last doctor visit ' + esc(fmtDay(since.date)) + " (" + since.days + " days ago)</div>" : "") + "</div>"
      : '<div class="hv-ic" aria-hidden="true">📅</div><div><div class="hv-t">No visit in your calendar yet</div><div class="hv-w">You can still prepare. <a href="../calendar/?new=1&amp;type=doctor">Add the appointment</a> and it will show here.</div></div>';
  }
})();
