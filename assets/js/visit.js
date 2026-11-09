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
  var STARTER = null, FROM_CHECK = new URLSearchParams(location.search).get("from") === "check", PERSONAL = null;
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
          (A.reasons.length || A.reason_text ? '<p class="vp-soft">You started this earlier. We kept everything, so you can pick up where you left off.</p>' : "") +
          (STARTER && !(A.reasons.length || A.reason_text) ? '<div class="vp-starter"><div class="vp-st-ic" aria-hidden="true">🔍</div><div class="grow"><b>Start from your symptom check?</b><p>On ' + esc(fmtDay(STARTER.check.date)) +
            (STARTER.check.result ? " it matched <b>" + esc(STARTER.check.result) + "</b>" : "") + (STARTER.check.symptoms.length ? ": " + esc(STARTER.check.symptoms.slice(0, 5).join(", ")) : "") +
            '. Cura can fill in the first answers for you to check.</p></div><button type="button" class="btn btn-primary btn-sm" id="vp-use-check">Use it ✨</button></div>' : "") + "</div>";
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
        var items = askItems(), sug = items.map(function (x) { return x.q; });
        if (PERSONAL === null) h = '<div class="vp-thinking" role="status"><span class="vp-dots3" aria-hidden="true"><i></i><i></i><i></i></span> Cura is writing questions from what you told it…</div>';
        else {
          var tops = items.filter(function (x) { return x.top; });
          h = (tops.length ? '<div class="vp-picks"><div><b>⭐ Cura\'s picks for this visit</b><span>The three that matter most for what you told it.</span></div><button type="button" class="btn btn-sm" id="vp-add-top">Add all three</button></div>' : "");
          [["you", "💬 From what you told me"], ["data", "📊 From your health data"], ["any", "📝 Good at any visit"]].forEach(function (grp) {
            var rows = items.map(function (x, i) { return [x, i]; }).filter(function (p) { return p[0].src === grp[0]; });
            if (!rows.length) return;
            h += '<div class="vp-qgrp">' + grp[1] + '</div><div class="vp-qs">' + rows.map(function (p) {
              var x = p[0], on = A.questions.indexOf(x.q) >= 0;
              return '<label class="vp-q' + (on ? " on" : "") + (x.top ? " top" : "") + '"><input type="checkbox" data-q="' + p[1] + '"' + (on ? " checked" : "") + "><span>" + (x.top ? '<i class="vp-star" aria-label="Cura\'s pick">⭐</i> ' : "") + esc(x.q) +
                (x.why ? '<small class="vp-why">' + esc(x.why) + "</small>" : "") + "</span></label>";
            }).join("") + "</div>";
          });
        }
        h = h +
          label("Your own questions") + '<div class="vp-own" id="f-own">' + A.own_questions.map(function (x, i) { return '<div class="vp-ownq"><span>' + esc(x) + '</span><button type="button" class="vp-x" data-rmq="' + i + '" aria-label="Remove">✕</button></div>'; }).join("") + "</div>" +
          '<div class="vp-addq"><input class="input" id="f-newq" maxlength="220" aria-label="Add your own question" placeholder="e.g. Can I keep going to the gym?"><button type="button" class="btn" id="f-addq">Add</button></div>';
        STEPS_SUG = sug;
        break;
      case "done":
        h = '<div class="vp-hello vp-done"><div class="vp-sun big" aria-hidden="true">🌸</div><h2>You’re ready.</h2><p>Your summary is waiting. Share it with your doctor using a QR code and a PIN, download it, or print it. You can come back and change anything until your visit, and a shared link always shows the latest.</p>' +
          '<div class="vp-row center"><button class="btn btn-primary" type="button" data-share="1">📲 Share with my doctor</button><button class="btn" type="button" data-go="summary">See my doctor summary</button><button class="btn" type="button" id="f-pdf2">⬇ Download PDF</button></div></div>';
        break;
    }
    return h;
  }
  var STEPS_SUG = [], LOADING_Q = false;

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
    if (s.id === "ask" && PERSONAL === null && !LOADING_Q) { LOADING_Q = true; loadPersonal(); }
    if (s.id !== "ask") { LOADING_Q = false; if (PERSONAL !== null && s.id !== "done") PERSONAL = null; }
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
      if (b.id === "vp-use-check") return useStarter(true);
      if (b.id === "vp-add-top") { askItems().filter(function (x) { return x.top; }).forEach(function (x) { if (A.questions.indexOf(x.q) < 0) A.questions.push(x.q); }); queueSave(); renderStep(0); P.toast("Added Cura's three picks ⭐"); return; }
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
  // the questions for the "ask" step: written by the server from the answers so far, falling back to the general list
  function askItems() {
    var list = (PERSONAL || []).slice();
    if (!list.length) ((PREP && PREP.question_groups) || []).forEach(function (g) { (g.questions || []).forEach(function (x) { list.push({ q: x, why: "", src: g.id === "visit" ? "any" : "data" }); }); });
    var have = list.map(function (x) { return x.q; });
    A.questions.forEach(function (x) { if (have.indexOf(x) < 0) list.unshift({ q: x, why: "You picked this earlier", src: "you" }); });
    return list.slice(0, 16);
  }
  function loadPersonal() {
    PERSONAL = null;
    flush().then(function () { return api(q("/insights/visit-prep/questions")); }).then(function (r) {
      PERSONAL = (r && r.ok && r.questions) || [];
      var s = live()[STEP]; if (s && s.id === "ask") renderStep(0);
    }, function () { PERSONAL = []; var s = live()[STEP]; if (s && s.id === "ask") renderStep(0); });
  }
  function useStarter(go) {
    if (!STARTER) return;
    var s = STARTER.answers;
    ["reasons", "areas", "others"].forEach(function (k) { (s[k] || []).forEach(function (v) { if (A[k].indexOf(v) < 0) A[k].push(v); }); });
    if (!A.reason_text && s.reason_text) A.reason_text = s.reason_text;
    if (!A.onset && s.onset) A.onset = s.onset;
    STARTER = null; queueSave(true);
    if (go) { STEP = 1; renderStep(1); P.toast("Filled in from your symptom check. Change anything that's not right."); }
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
    try { history.replaceState(null, "", location.pathname + location.search + "#" + (t === "summary" && FOCUS_SHARE ? "share" : t)); } catch (e) {}
  }

  function loadSummary() {
    el("sum").innerHTML = '<div class="paper"><p class="sub">Putting your summary together…</p></div>';
    api(q("/insights/visit-prep/summary")).then(function (r) {
      if (!r || !r.ok) { el("sum").innerHTML = '<div class="card"><p class="msg err">' + esc((r && (r.message || r.err)) || "Couldn't build the summary.") + "</p></div>"; return; }
      SUMMARY = r.summary; el("sum").innerHTML = paper(r.summary);
      if (window.QCVisitShare) { QCVisitShare.render(el("vshare")); if (FOCUS_SHARE) { FOCUS_SHARE = false; setTimeout(QCVisitShare.focus, 60); } }
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
    if (s.glance) h += '<div class="ph-glance"><div class="ph-gl-l">At a glance</div><p>' + esc(s.glance) + "</p></div>";
    h += sec("Presenting concern", s.concern ? '<p class="ph-concern">' + esc(s.concern) + "</p>" : "");
    var so = s.stands_out || [];
    h += sec("Worth your attention", so.length ? '<ul class="ph-so">' + so.map(function (x) { return '<li class="t-' + esc(x.tone) + '"><span aria-hidden="true">' + esc(x.icon) + "</span><span>" + esc(x.text) + "</span></li>"; }).join("") + "</ul>" : "");
    if (s.story && s.story.length) h += sec("In my own words", s.story.map(function (x) { return '<div class="ph-para"><div class="ph-ph">' + esc(x.h) + "</div><p>" + esc(x.p) + "</p></div>"; }).join(""));
    else h += sec("History, in my words", s.hpi.length ? "<p>" + s.hpi.map(esc).join(" ") + "</p>" : "");
    var bg = (s.allergies.length ? '<p><b>Allergies:</b> <span class="ph-red">' + s.allergies.map(esc).join(", ") + "</span></p>" : "") + (s.conditions.length ? "<p><b>Known conditions:</b> " + s.conditions.map(esc).join(", ") + "</p>" : "") +
      (s.context.length && !(s.story && s.story.length) ? "<p><b>Also:</b> " + s.context.map(esc).join("; ") + "</p>" : "");
    h += sec("Background", bg);
    var a = s.adherence || {};
    h += sec("Medicines", s.medicines.length || s.meds_note ? (s.medicines.length ? '<div class="table-scroll"><table><thead><tr><th>Medicine</th><th>How</th><th>I say</th></tr></thead><tbody>' + s.medicines.map(function (m) { return "<tr><td>" + esc(m.name) + '</td><td class="mut">' + esc(m.how) + "</td><td>" + esc(m.reported || "–") + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      (a.has_data ? '<p class="mut">Doses marked taken in QueroCura, last ' + a.days + " days: <b>" + a.taken + " of " + a.scheduled + " (" + a.percent + "%)</b>; skipped " + a.skipped + "; not answered " + a.unanswered + ".</p>" : "") +
      (s.meds_note ? "<p><b>My note:</b> " + esc(s.meds_note) + "</p>" : "") : "");
    h += sec("Home readings", s.readings.length ? '<div class="table-scroll"><table><thead><tr><th>Reading</th><th>Latest</th><th>Range</th><th>Trend</th></tr></thead><tbody>' + s.readings.map(function (r) {
      return "<tr><td>" + esc(r.label) + (r.flag ? ' <span class="ph-flag">flagged</span>' : "") + "</td><td><b>" + esc(r.latest) + "</b> " + esc(r.unit) + "</td><td>" + esc(r.min) + "–" + esc(r.max) + "</td><td>" + esc(r.direction) + " (" + esc(r.count) + ")</td></tr>";
    }).join("") + "</tbody></table></div>" + ((s.related || []).length ? '<p class="ph-rel"><b>Bearing on this visit:</b> ' + s.related.map(function (r) { return esc(r.text); }).join(" ") + "</p>" : "") : "");
    var cg = s.checks_grouped || {};
    var rec = (s.flagged_labs.length ? "<p><b>Lab values outside the usual range:</b> " + s.flagged_labs.map(esc).join(", ") + "</p>" : "") + (s.scans.length ? "<p><b>Scan reports:</b> " + s.scans.map(esc).join(", ") + "</p>" : "") +
      ((cg.groups || []).length ? '<p><b>App symptom checks</b> <span class="mut">(pattern matches, not diagnoses)</span>: ' + esc(cg.sentence || "") + '</p><div class="ph-chk">' + cg.groups.slice(0, 6).map(function (g) {
        return '<span class="ph-cg' + (g.days >= 3 ? " rep" : "") + '"><b>' + esc(g.result) + "</b> " + (g.days > 1 ? g.days + " days" : "once") + ' · last ' + esc(fmtDay(g.last)) + "</span>";
      }).join("") + "</div>" :
      s.symptom_checks.length ? "<p><b>App symptom checks</b> <span class=\"mut\">(pattern matches, not diagnoses)</span>: " + s.symptom_checks.map(function (c) { return esc(fmtDay(c.date)) + " " + esc(c.result); }).join("; ") + "</p>" : "");
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
    if (s.glance) L.push("", "AT A GLANCE: " + s.glance);
    if (s.concern) L.push("", "CONCERN: " + s.concern);
    if ((s.stands_out || []).length) { L.push("", "WORTH YOUR ATTENTION"); s.stands_out.forEach(function (x) { L.push("- " + x.text); }); }
    if ((s.story || []).length) { L.push("", "IN MY OWN WORDS"); s.story.forEach(function (x) { L.push(x.h + ": " + x.p); }); }
    else { if (s.hpi.length) L.push("", "HISTORY: " + s.hpi.join(" ")); s.ice.forEach(function (x) { L.push(x[0] + ": " + x[1]); }); }
    if (s.allergies.length) L.push("", "Allergies: " + s.allergies.join(", "));
    if (s.conditions.length) L.push("Conditions: " + s.conditions.join(", "));
    if (s.medicines.length) { L.push("", "MEDICINES"); s.medicines.forEach(function (m) { L.push("- " + m.name + (m.how ? " (" + m.how + ")" : "") + (m.reported ? ": " + m.reported : "")); }); }
    if (s.meds_note) L.push("Note: " + s.meds_note);
    if (s.readings.length) { L.push("", "READINGS"); s.readings.forEach(function (r) { L.push("- " + r.label + ": latest " + r.latest + " " + r.unit + ", range " + r.min + " to " + r.max + ", " + r.direction); }); }
    if ((s.checks_grouped || {}).sentence) L.push("", "SYMPTOM CHECKS (pattern matches, not diagnoses): " + s.checks_grouped.sentence);
    if (s.questions.length) { L.push("", "QUESTIONS"); s.questions.forEach(function (x, i) { L.push(i + 1 + ". " + x); }); }
    L.push("", s.note);
    return L.join("\n");
  }

  /* ---------------- bring & share ---------------- */
  function bring(d) {
    return '<div class="card"><h2>Bring with you</h2><ul class="ck">' + d.checklist.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></div>" +
      '<div class="card no-print vs-mini"><div class="vs-badge" aria-hidden="true">📲</div><div><h2>Share with my doctor</h2><p class="sub">A private link and QR code that opens your full summary, protected by a 6-digit PIN. Your doctor needs no app or account.</p>' +
      '<button class="btn btn-primary" type="button" data-share="1">Set it up</button></div></div>';
  }
  var FOCUS_SHARE = false;
  function openShare() {
    if (!el("pane-summary").hidden && SUMMARY && el("vs-card")) { QCVisitShare.focus(); return; }
    FOCUS_SHARE = true; showTab("summary");
  }
  /* ---------------- start ---------------- */
  document.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
  document.addEventListener("click", function (e) {
    var g = e.target.closest && e.target.closest("#pane-summary [data-go]"); if (g) showTab(g.getAttribute("data-go"));
    var sh = e.target.closest && e.target.closest("[data-share]"); if (sh) { e.preventDefault(); openShare(); }
  });
  if (window.QCVisitShare) QCVisitShare.init({ flush: function () { return flush(); }, summary: function () { return SUMMARY; }, event: function () { return EVENT || (PREP && PREP.visit && PREP.visit.id) || ""; }, prep: function () { return PREP; } });
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
      PREP = d; A = (a && a.ok && a.answers) || {}; MEDS = (a && a.medicines) || []; PROFILE = (pr && pr.profile) || {}; STARTER = (a && a.starter) || null;
      ["reasons", "areas", "feels", "affects", "others", "expect", "questions", "own_questions"].forEach(function (k) { if (!Array.isArray(A[k])) A[k] = []; });
      if (!A.meds || typeof A.meds !== "object") A.meds = {}; if (!A.context) A.context = {};
      if (!EVENT && d.visit && d.visit.id) EVENT = d.visit.id;
      STEP = A.done ? 0 : (A.step || 0);
      el("hero").innerHTML = hero(d);
      if (STARTER && FROM_CHECK) useStarter(true); else renderStep(0);
      el("pane-bring").innerHTML = bring(d);
      var h = location.hash.replace("#", "");
      if (h === "share") openShare(); else if (h === "summary" || h === "bring") showTab(h);
    });
  });

  function hero(d) {
    var v = d.visit, since = d.since_last_visit || {};
    return v ? '<div class="hv-ic" aria-hidden="true">🩺</div><div><div class="hv-t">' + esc(v.title) + '</div><div class="hv-w">' + esc(fmtWhen(v.when)) + (v.in_days != null ? " · " + inWords(v.in_days) : "") + (v.location ? " · 📍 " + esc(v.location) : "") + "</div>" +
      (since.date ? '<div class="hv-s">Last doctor visit ' + esc(fmtDay(since.date)) + " (" + since.days + " days ago)</div>" : "") + "</div>"
      : '<div class="hv-ic" aria-hidden="true">📅</div><div><div class="hv-t">No visit in your calendar yet</div><div class="hv-w">You can still prepare. <a href="../calendar/?new=1&amp;type=doctor">Add the appointment</a> and it will show here.</div></div>';
  }
})();
