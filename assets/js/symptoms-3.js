/* ===== Symptom input upgrades: detail meter, voice dictation, "still dealing with something?" ===== */
(function () {
  const $ = s => document.querySelector(s);
  const input = $("#sym-input");

  /* -- detail meter: nudges for the four things that most sharpen a result -- */
  const CHECKS = {
    when: /\b(since|for (?:the )?(?:last|past)?\s*\d|ago|yesterday|today|tonight|this (?:morning|evening|afternoon)|last night|\d+\s*(?:hour|hr|day|week|month)s?|started|began|weeks?|days?)\b/i,
    where: /\b(head|forehead|eyes?|ears?|nose|throat|neck|chest|back|stomach|belly|abdomen|tummy|arms?|legs?|knees?|ankles?|foot|feet|hands?|shoulders?|hips?|jaw|teeth|tooth|skin|joints?|left|right|lower|upper|side)\b/i,
    how: /\b(mild|moderate|severe|slight|intense|unbearable|worst|terrible|bearable|\d{1,2}\s*\/\s*10)\b/i,
    with: /\b(and|also|along with|together with|plus|as well|with)\b|,.+,/i,
  };
  function updateMeter() {
    const t = input.value || "";
    let ok = 0;
    document.querySelectorAll("#sym-meter .dm-chip").forEach(c => {
      const done = CHECKS[c.getAttribute("data-k")].test(t);
      c.classList.toggle("ok", done);
      c.disabled = done;
      if (done) ok++;
    });
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    $("#sym-meter-fill").style.width = (!words ? 0 : ok * 25) + "%";
    $("#sym-meter-lbl").textContent = !words ? "The more detail, the sharper the result:" : ok >= 4 ? "Great detail — that's all I need 👌" : ok >= 2 ? "Good. Adding more helps even more:" : "Tell me a bit more:";
  }
  input.addEventListener("input", updateMeter);
  document.querySelectorAll("#sym-meter .dm-chip").forEach(c => c.addEventListener("click", () => {
    input.value = (input.value.replace(/\s+$/, "") + c.getAttribute("data-add")).replace(/^\s+/, "");
    input.focus(); input.setSelectionRange(input.value.length, input.value.length); updateMeter();
  }));
  document.querySelectorAll(".example-chip").forEach(ch => ch.addEventListener("click", () => setTimeout(updateMeter, 0)));
  updateMeter();

  /* -- voice dictation (only where the browser supports it) -- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#sym-mic");
  if (SR && mic) {
    mic.classList.add("on");
    const langBtn = $("#sym-lang");
    const LANGS = [["en-IN", "EN", "English"], ["hi-IN", "हि", "Hindi"]];
    let li = 0;
    try { li = Math.max(0, LANGS.findIndex(l => l[0] === localStorage.getItem("qc-voice-lang"))); } catch (e) {}
    if (window.QCI18n && QCI18n.lang === "hi" && !localStorage.getItem("qc-voice-lang")) li = 1;      // a Hindi screen speaks Hindi unless the person chose otherwise
    const showLang = () => { if (langBtn) { langBtn.classList.add("on"); langBtn.textContent = LANGS[li][1]; langBtn.setAttribute("aria-label", "Speaking language: " + LANGS[li][2]); } };
    showLang();
    if (langBtn) langBtn.addEventListener("click", () => { li = (li + 1) % LANGS.length; try { localStorage.setItem("qc-voice-lang", LANGS[li][0]); } catch (e) {} showLang(); QC.toast("Speaking language: " + LANGS[li][2], "ok"); });
    let rec = null, base = "";
    mic.addEventListener("click", () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new SR();
        rec.lang = LANGS[li][0]; rec.interimResults = true; rec.continuous = false;
        base = input.value ? input.value.replace(/\s+$/, "") + " " : "";
        rec.onresult = e => { let s = ""; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; input.value = base + s; updateMeter(); };
        rec.onerror = () => { QC.toast("Couldn't hear that. Check microphone permission and try again.", "err"); };
        rec.onend = () => { rec = null; mic.classList.remove("rec"); mic.setAttribute("aria-label", "Speak your symptoms"); };
        rec.start(); mic.classList.add("rec"); mic.setAttribute("aria-label", "Stop listening");
      } catch (e) { rec = null; }
    });
  }

  /* -- still dealing with something? (conditions from earlier checks) -- */
  const strip = $("#sym-ongoing");
  function renderOngoing(og) {
    const items = ((og && og.items) || []).filter(i => i.source === "symptom_check");
    if (!items.length) { strip.hidden = true; return; }
    strip.hidden = false;
    strip.innerHTML = '<div class="og-title">🩺 Still dealing with something from an earlier check?</div>' +
      '<div class="og-sub">Tell me if it has cleared up. That keeps your health score honest and takes it off your ongoing list.</div>' +
      items.map(i => '<div class="og-item" data-name="' + QC.esc(i.name) + '"><div class="og-name">' + QC.esc(i.name) +
        '<small>' + (i.days_open >= 1 ? "checked " + i.days_open + " day" + (i.days_open === 1 ? "" : "s") + " ago" : "checked recently") + '</small></div>' +
        '<button type="button" class="og-btn good" data-a="better">✓ Feeling better</button><button type="button" class="og-btn" data-a="update">Update</button></div>').join("");
  }
  strip.addEventListener("click", async e => {
    const b = e.target.closest(".og-btn"); if (!b) return;
    const row = b.closest(".og-item"), name = row.getAttribute("data-name");
    if (b.getAttribute("data-a") === "update") {
      input.value = "Update on my " + name.toLowerCase() + ": "; input.focus(); input.setSelectionRange(input.value.length, input.value.length); updateMeter();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    row.querySelectorAll("button").forEach(x => { x.disabled = true; });
    try {
      const res = await fetch(QC.API_BASE + "/insights/ongoing/checkin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, answer: "better" }) });
      const out = await res.json(); if (!out.ok) throw new Error(out.err);
      QC.clearCache();
      QC.toast("Glad you're feeling better! 🎉 Removed from your ongoing list.", "ok");
      row.classList.add("done");
      setTimeout(() => { row.remove(); if (!strip.querySelector(".og-item")) strip.hidden = true; }, 480);
      if (QC.refreshAlerts) QC.refreshAlerts({ force: true, toast: false });
    } catch (err) {
      row.querySelectorAll("button").forEach(x => { x.disabled = false; });
      QC.toast("Couldn't save that. Please try again.", "err");
    }
  });
  const stale = QC.stale("insights-30");
  if (stale && stale.ok !== false) renderOngoing(stale.ongoing_conditions);
  QC.insights(30).then(d => { if (d && d.ok !== false) renderOngoing(d.ongoing_conditions); });
})();
