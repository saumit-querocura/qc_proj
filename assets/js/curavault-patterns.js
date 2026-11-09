/* CuraVault: the Vitals and Symptom History tabs.
   Vitals: what your readings show over time (/curavault/vitals/insights), a form that catches mistyped numbers, and an
   immediate warning when a saved reading is dangerous. Symptom history: your checks grouped into episodes, what keeps
   coming back, and a quick "how are you now?" (/curavault/symptoms/patterns).
   Every value comes from the server; all server text is escaped before it touches innerHTML. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const E = s => esc(s);
  const TONE_CHIP = { good: "good", info: "muted", watch: "warn", warn: "bad", urgent: "bad" };

  function when(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const that = new Date(d); that.setHours(0, 0, 0, 0);
    const diff = Math.round((today - that) / 864e5);
    const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (diff === 0) return "Today, " + t;
    if (diff === 1) return "Yesterday, " + t;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }) + ", " + t;
  }
  function day(ts) {                                  // "2026-09-18 10:00:00" or ISO -> "18 Sep"
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ts || ""));
    if (!m) return "";
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }
  function n1(v) { return v == null ? "—" : (Number.isInteger(+v) ? String(+v) : (Math.round(v * 10) / 10).toString()); }
  function chip(label, tone) { return label ? '<span class="hs-chip ' + (TONE_CHIP[tone] || tone || "muted") + '">' + E(label) + "</span>" : ""; }
  function attnRows(list) {
    return '<div class="hs-attn">' + list.map(a =>
      '<div class="hs-attn-row ' + E(a.tone) + '"><span class="hs-attn-ic" aria-hidden="true">' + (a.tone === "urgent" || a.tone === "warn" ? "!" : "i") +
      '</span><span class="hs-attn-text">' + E(a.text) + "</span></div>").join("") + "</div>";
  }

  /* ---------- a small line chart of one or two series against the usual range ---------- */
  function spark(series, band, label) {
    const W = 160, H = 46, P = 5;
    const all = series.flatMap(s => s.pts.map(p => p.v)).concat(band ? [band.low, band.high].filter(v => v != null) : []);
    let min = Math.min(...all), max = Math.max(...all);
    if (max - min < 1e-9) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12; min -= pad; max += pad;
    const times = series.flatMap(s => s.pts.map(p => p.t));
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const x = t => t1 === t0 ? W / 2 : P + (t - t0) / (t1 - t0) * (W - 2 * P);
    const y = v => H - P - (v - min) / (max - min) * (H - 2 * P);
    let svg = '<svg class="sp" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + E(label) + '">';
    if (band && (band.low != null || band.high != null)) {
      const top = y(band.high != null ? Math.min(band.high, max) : max), bot = y(band.low != null ? Math.max(band.low, min) : min);
      svg += '<rect class="sp-band" x="0" y="' + top.toFixed(1) + '" width="' + W + '" height="' + Math.max(1, bot - top).toFixed(1) + '" rx="3"></rect>';
    }
    series.forEach((s, si) => {
      if (s.pts.length > 1) svg += '<polyline class="sp-line' + (si ? " alt" : "") + '" points="' + s.pts.map(p => x(p.t).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ") + '"></polyline>';
      s.pts.forEach((p, i) => {
        const last = i === s.pts.length - 1;
        if (!last && s.pts.length > 12) return;            // a long run reads as a line; only the latest gets a dot
        svg += '<circle class="sp-dot' + (last ? " last" : "") + (si ? " alt" : "") + '" cx="' + x(p.t).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="' + (last ? 3.6 : 2.4) + '"><title>' + E(p.tip) + "</title></circle>";
      });
    });
    return svg + "</svg>";
  }

  /* ================================ VITALS ================================ */
  let vitalsData = null, showAllReadings = false;

  function valueText(m) {
    if (m.key === "bp") return m.latest.systolic + "/" + m.latest.diastolic;
    return n1(m.latest.value);
  }
  function unitText(u) { return u === "%" ? "%" : " " + u; }
  function usualText(m) {
    if (m.key === "bp") return "Usual: under 120/80";
    if (!m.usual) return m.own_usual != null ? "Your usual: " + n1(m.own_usual) + unitText(m.unit) : "";
    return "Usual: " + n1(m.usual.low) + "–" + n1(m.usual.high) + unitText(m.unit);
  }
  function measureTile(m) {
    let series, band;
    if (m.key === "bp") {
      series = [
        { pts: m.points.map(p => ({ t: new Date(p.at).getTime(), v: p.systolic, tip: when(p.at) + ": " + p.systolic + "/" + p.diastolic })) },
        { pts: m.points.map(p => ({ t: new Date(p.at).getTime(), v: p.diastolic, tip: when(p.at) + ": " + p.systolic + "/" + p.diastolic })) },
      ];
      band = { low: 60, high: 120 };
    } else {
      series = [{ pts: m.points.map(p => ({ t: new Date(p.at).getTime(), v: p.value, tip: when(p.at) + ": " + n1(p.value) + unitText(m.unit) })) }];
      band = m.usual || null;
    }
    const g = m.grade || (m.change ? { label: m.change.tone === "warn" ? "Big change" : "", tone: m.change.tone } : null);
    const off = g && (g.tone === "warn" || g.tone === "urgent");
    return '<div class="hs-lab pv-tile ' + (off ? "off" : "ok") + '">' +
      '<div class="hs-lab-top"><div><div class="hs-lab-name">' + E(m.name) + '</div><div class="hs-lab-what">' + E(m.count + " reading" + (m.count === 1 ? "" : "s") + " · last " + when(m.latest.at)) + "</div></div>" +
      '<div class="hs-lab-val">' + E(valueText(m)) + "<small>" + E(m.unit) + "</small></div></div>" +
      '<div class="hs-lab-mid">' + spark(series, band, m.name + " over time") + '<div class="hs-lab-chips">' + (g ? chip(g.label, g.tone) : "") +
        (m.unusual_for_you ? chip("Unusual for you", "warn") : "") + "</div></div>" +
      (m.sentence ? '<p class="hs-lab-text">' + E(m.sentence) + "</p>" : "") +
      (m.time_of_day ? '<p class="hs-lab-text">' + E(m.time_of_day.sentence) + "</p>" : "") +
      '<div class="hs-lab-foot">' + E(usualText(m)) + (m.key === "bp" ? ' · <span class="pv-key"><i></i>top <i class="alt"></i>bottom</span>' : "") + "</div></div>";
  }

  function cell(r, key, grades) {
    const g = (grades || []).find(x => x.metric === key);
    let v;
    if (key === "bp") v = r.systolic_bp != null && r.diastolic_bp != null ? r.systolic_bp + "/" + r.diastolic_bp : null;
    else v = r[key];
    if (v == null) return '<td class="pv-none">—</td>';
    return '<td><span class="pv-cell ' + E(g ? g.tone : "") + '"' + (g && g.label ? ' title="' + E(g.label) + '"' : "") + ">" + E(key === "bp" ? v : n1(v)) + "</span></td>";
  }

  function renderVitals(d) {
    vitalsData = d;
    const box = $("cv-vitals-insights");
    const wrap = $("cv-vitals-wrap");
    if (!box || !wrap) return;
    if (!d || !d.ok) {
      box.innerHTML = '<div class="hs-head"><h2>❤️ Your vitals</h2></div><div class="empty-note">Couldn\'t load your vitals right now. <a href="#" data-pv-retry="vitals">Try again</a></div>';
      wrap.innerHTML = "";
      return;
    }
    if (!d.has_data) {
      box.innerHTML = '<div class="hs-head"><div><h2>❤️ Your vitals</h2><p class="card-sub">Log a reading below — blood pressure, pulse, oxygen, temperature, sugar or weight. ' +
        "Each one is checked as you save it, and after a few readings you'll see your own usual levels, your blood-pressure average the way clinics read it, and anything that changes.</p></div></div>";
      wrap.innerHTML = '<div class="empty-note">No readings yet.</div>';
      return;
    }
    const sm = d.summary;
    let html = '<div class="hs-head"><div><h2>❤️ Your vitals</h2><p class="card-sub">' + E(sm.readings + " reading" + (sm.readings === 1 ? "" : "s") + " since " + day(sm.first) +
      (sm.this_month ? " · " + sm.this_month + " in the last 30 days" : "")) + "</p></div></div>";
    html += d.attention.length ? attnRows(d.attention) : '<div class="hs-calm">✓ Nothing in your recent readings stands out.</div>';
    html += '<div class="hs-labs pv-tiles">' + d.measures.map(measureTile).join("") + "</div>";
    if (d.habits.length) html += '<ul class="pv-habits">' + d.habits.map(h => "<li>" + E(h) + "</li>").join("") + "</ul>";
    html += '<p class="hs-note">' + E(d.note) + "</p>";
    box.innerHTML = html;

    const rows = showAllReadings ? d.readings : d.readings.slice(0, 10);
    wrap.innerHTML = '<div class="pv-table"><table><thead><tr><th>When</th><th>BP</th><th>Pulse</th><th>SpO₂</th><th>Temp °C</th><th>Sugar</th><th>Weight</th></tr></thead><tbody>' +
      rows.map(r => "<tr><td class=\"pv-when\">" + E(when(r.recorded_at)) + (r.notes ? '<small>' + E(r.notes) + "</small>" : "") + "</td>" +
        cell(r, "bp", r.grades) + cell(r, "heart_rate", r.grades) + cell(r, "spo2", r.grades) + cell(r, "temperature_c", r.grades) +
        cell(r, "blood_glucose_mgdl", r.grades) + cell(r, "weight_kg", r.grades) + "</tr>").join("") + "</tbody></table></div>" +
      (d.readings.length > 10 ? '<button type="button" class="hs-more" id="pv-more">' + (showAllReadings ? "Show fewer" : "Show all " + d.readings.length + " readings") + "</button>" : "");
  }

  async function loadVitals() {
    const d = await cvGet("/vitals/insights");
    renderVitals(d);
    return d;
  }

  /* ---------- the form ---------- */
  const FIELD_IDS = { heart_rate: "cv-v-hr", systolic_bp: "cv-v-sys", diastolic_bp: "cv-v-dia", spo2: "cv-v-spo2", temperature_c: "cv-v-temp",
    blood_glucose_mgdl: "cv-v-glucose", weight_kg: "cv-v-weight", respiratory_rate: "cv-v-resp", recorded_at: "cv-v-when" };

  function localStamp(d) {                           // the person's own clock with its offset, so "morning" means their morning
    const p = n => String(Math.abs(n)).padStart(2, "0");
    const off = -d.getTimezoneOffset();
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":00" +
      (off >= 0 ? "+" : "-") + p(Math.trunc(off / 60)) + ":" + p(off % 60);
  }
  function nowForInput() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function clearErrors() {
    document.querySelectorAll("#cv-vitals-form .pv-err").forEach(el => el.remove());
    document.querySelectorAll("#cv-vitals-form [aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  }
  function showErrors(fields) {
    Object.keys(fields || {}).forEach(k => {
      const input = $(FIELD_IDS[k]);
      if (!input) return;
      input.setAttribute("aria-invalid", "true");
      const m = document.createElement("div");
      m.className = "pv-err"; m.textContent = fields[k];
      input.insertAdjacentElement("afterend", m);
    });
    const first = Object.keys(fields || {}).map(k => $(FIELD_IDS[k])).find(Boolean);
    if (first) first.focus();
  }
  function showAlert(a) {
    const box = $("cv-vitals-alert");
    if (!box) return;
    if (!a) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.className = "pv-alert " + (a.tone === "urgent" ? "urgent" : "warn");
    box.innerHTML = '<b>' + (a.tone === "urgent" ? "This reading needs attention now" : "Worth keeping an eye on") + "</b><p>" + E(a.text) + "</p>" +
      '<button type="button" class="btn-ghost" data-pv-dismiss>OK</button>';
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function bindForm() {
    const form = $("cv-vitals-form");
    if (!form || form.dataset.pv) return;
    form.dataset.pv = "1";
    const whenInput = $("cv-v-when");
    if (whenInput) { whenInput.value = nowForInput(); whenInput.max = nowForInput(); }
    form.addEventListener("input", e => {
      if (e.target.getAttribute("aria-invalid")) {
        e.target.removeAttribute("aria-invalid");
        const n = e.target.nextElementSibling;
        if (n && n.classList.contains("pv-err")) n.remove();
      }
    });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      clearErrors();
      showAlert(null);
      const btn = $("cv-vitals-btn");
      btn.disabled = true; btn.textContent = "Saving…";
      const val = id => { const el = $(id); return el && el.value !== "" ? el.value : null; };
      const w = whenInput && whenInput.value ? new Date(whenInput.value) : new Date();
      const payload = { recorded_at: localStamp(isNaN(w) ? new Date() : w), source: "manual", notes: ($("cv-v-notes").value || "").trim() };
      Object.keys(FIELD_IDS).forEach(k => { if (k !== "recorded_at") payload[k] = val(FIELD_IDS[k]); });
      try {
        const { ok, data } = await cvPost("/vitals", payload);
        if (!ok || !data.ok) {
          if (data && data.fields) showErrors(data.fields);
          throw new Error((data && data.error) || "Couldn't save that reading.");
        }
        form.reset();
        if (whenInput) { whenInput.value = nowForInput(); whenInput.max = nowForInput(); }
        if (data.alert) showAlert(data.alert);
        else { toast("Saved to your Vault.", "ok"); if (typeof fireConfetti === "function") fireConfetti(); }
        await loadVitals();
      } catch (err) {
        toast(err.message || "Something went wrong.", "err");
      } finally {
        btn.disabled = false; btn.textContent = "Save to Vault";
      }
    });
  }

  /* ============================ SYMPTOM HISTORY ============================ */
  let symData = null, showAllEpisodes = false;
  const MOVE = { worse: ["Getting worse", "bad"], better: ["Settling", "good"], same: ["About the same", "muted"] };
  const CHECKIN = { better: ["You said: better", "good"], same: ["You said: about the same", "muted"], worse: ["You said: worse", "bad"] };

  function triTone(t) {
    const c = triageClass(t);
    return c === "emergency" || c === "urgent" ? "bad" : (c === "monitor" ? "warn" : "muted");
  }
  function triShort(t) {
    const s = String(t || "");
    if (/emerg/i.test(s)) return "Emergency";
    if (/urgent/i.test(s)) return "Urgent";
    if (/high/i.test(s)) return "See a doctor soon";
    if (/monitor|moderate/i.test(s)) return "Monitor";
    return s ? "Routine" : "";
  }
  function range(ep) {
    const a = day(ep.start), b = day(ep.end);
    return a === b ? a : a + " – " + b;
  }

  function monthsChart(months) {
    const max = Math.max(1, ...months.map(m => m.checks));
    return '<div class="pv-months" role="img" aria-label="Symptom checks per month, last 12 months">' + months.map(m => {
      const [y, mo] = m.month.split("-").map(Number);
      const name = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short" });
      const h = m.checks ? Math.max(8, m.checks / max * 100) : 0;
      const u = m.checks ? m.urgent / m.checks * 100 : 0;
      return '<div class="pv-month" title="' + E(name + " " + y + ": " + m.checks + " check" + (m.checks === 1 ? "" : "s") + (m.urgent ? ", " + m.urgent + " urgent" : "")) + '">' +
        '<div class="pv-col"><i style="height:' + h.toFixed(0) + '%"><b style="height:' + u.toFixed(0) + '%"></b></i></div><span>' + E(name.slice(0, 1)) + "</span></div>";
    }).join("") + "</div>";
  }

  function episodeCard(ep, i) {
    const mv = MOVE[ep.movement], ci = CHECKIN[ep.checkin];
    const conds = ep.conditions.length ? ep.conditions.join(" → ") : "No clear pattern";
    const ask = ep.open && !ep.checkin && ep.suggested;
    return '<div class="pv-ep' + (ep.open ? " open" : "") + '">' +
      '<div class="pv-ep-top"><div><div class="pv-ep-when">' + E(range(ep)) + (ep.checks > 1 ? " · " + ep.checks + " checks" : "") + "</div>" +
        '<div class="pv-ep-cond">' + E(conds) + "</div></div>" +
        '<div class="pv-ep-chips">' + chip(triShort(ep.worst_triage), triTone(ep.worst_triage)) + (mv ? chip(mv[0], mv[1]) : "") + (ci ? chip(ci[0], ci[1]) : "") + "</div></div>" +
      (ep.symptoms.length ? '<div class="pv-syms">' + ep.symptoms.map(s => '<span>' + E(s) + "</span>").join("") + "</div>" : "") +
      ((ep.max_temp_c || ep.reported_days) ? '<div class="pv-ep-facts">' +
        (ep.reported_days ? "<span>You said it had lasted " + E(ep.reported_days) + " day" + (ep.reported_days === 1 ? "" : "s") + "</span>" : "") +
        (ep.max_temp_c ? "<span>Highest temperature you logged: " + E(n1(ep.max_temp_c)) + " °C</span>" : "") + "</div>" : "") +
      (ask ? '<div class="pv-ask"><span>How are you now?</span>' +
        ["better", "same", "worse"].map(a => '<button type="button" class="btn-ghost' + (a === "better" ? " go" : "") + '" data-pv-checkin="' + a + '" data-pv-name="' + E(ep.suggested) + '">' +
          ({ better: "Better", same: "About the same", worse: "Worse" })[a] + "</button>").join("") + "</div>" : "") +
      (ep.items.length > 1 || (ep.items[0] && ep.items[0].alternatives.length) ? '<details class="pv-ep-detail"><summary>' + (ep.items.length > 1 ? "Each check" : "Details") + "</summary>" +
        ep.items.map(c => '<div class="pv-check"><div class="pv-check-top"><b>' + E(when(String(c.ts).replace(" ", "T"))) + "</b>" + chip(triShort(c.triage), triTone(c.triage)) + "</div>" +
          "<div>Suggested: " + E(c.condition || "no clear pattern") + (c.confidence ? " (" + E(c.confidence) + " match)" : "") + "</div>" +
          (c.symptoms.length ? "<div>You described: " + E(c.symptoms.join(", ")) + (c.duration_days ? ", for " + E(c.duration_days) + " day" + (c.duration_days === 1 ? "" : "s") : "") + "</div>" : "") +
          (c.alternatives.length ? "<div class=\"pv-alt\">Also considered: " + E(c.alternatives.join(", ")) + "</div>" : "") + "</div>").join("") + "</details>" : "") +
      "</div>";
  }

  function renderSymptoms(d) {
    symData = d;
    const wrap = $("cv-symptoms-wrap");
    if (!wrap) return;
    if (!d || !d.ok) {
      wrap.innerHTML = '<div class="empty-note">Couldn\'t load your symptom history right now. <a href="#" data-pv-retry="symptoms">Try again</a></div>';
      return;
    }
    if (!d.has_data) {
      wrap.innerHTML = '<div class="empty-note">No symptom checks yet. <a href="../symptoms/">Run one from the Symptoms tab</a> — each check is kept here, grouped with the others from the same illness, so you can see what keeps coming back.</div>';
      return;
    }
    const sm = d.summary;
    let html = '<p class="pv-sum">' + E(sm.checks + " check" + (sm.checks === 1 ? "" : "s") + " in " + sm.episodes + " episode" + (sm.episodes === 1 ? "" : "s") + " since " + day(sm.first)) +
      ' · <a href="../symptoms/">Run a new check</a></p>';
    if (d.attention.length) html += attnRows(d.attention);
    html += '<div class="pv-sym-grid">';
    html += '<div class="pv-panel"><h3 class="hs-sub">Checks over the last 12 months</h3>' + monthsChart(d.months) + '<div class="pv-legend"><span><i></i>checks</span><span><i class="u"></i>urgent</span></div></div>';
    html += '<div class="pv-panel"><h3 class="hs-sub">Keeps coming back</h3>' + (d.recurring.length ? d.recurring.map(r =>
      '<div class="pv-rec"><div class="pv-rec-top"><b>' + E(r.symptom.charAt(0).toUpperCase() + r.symptom.slice(1)) + "</b><span>" + E(r.episodes + " episodes") + "</span></div>" +
      "<p>" + E(r.sentence) + "</p></div>").join("") :
      '<p class="hs-hint">Nothing yet. When the same symptom turns up in three separate illnesses, it shows here.</p>') + "</div>";
    html += "</div>";

    const eps = showAllEpisodes ? d.episodes : d.episodes.slice(0, 6);
    html += '<h3 class="hs-sub">Episodes</h3><div class="pv-eps">' + eps.map(episodeCard).join("") + "</div>";
    if (d.episodes.length > 6) html += '<button type="button" class="hs-more" id="pv-more-eps">' + (showAllEpisodes ? "Show fewer" : "Show all " + d.episodes.length + " episodes") + "</button>";
    if (d.questions.length) {
      html += '<details class="hs-q"><summary>Questions to take to your doctor (' + d.questions.length + ")</summary><ul>" +
        d.questions.map(q => "<li><b>" + E(q.topic) + ".</b> " + E(q.text) + "</li>").join("") + "</ul></details>";
    }
    html += '<p class="hs-note">' + E(d.note) + "</p>";
    wrap.innerHTML = html;
  }

  async function loadSymptoms() {
    const d = await cvGet("/symptoms/patterns");
    renderSymptoms(d);
    return d;
  }

  async function checkin(name, answer, btn) {
    btn.closest(".pv-ask").querySelectorAll("button").forEach(b => { b.disabled = true; });
    try {
      const res = await fetch(API_BASE + "/insights/ongoing/checkin", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.err || data.error || "Couldn't save that.");
      if (answer === "worse") toast("Thanks. If you're getting worse, see a doctor, or run a new check to see what's changed.", "err");
      else toast(answer === "better" ? "Glad to hear it. Noted." : "Noted. We'll ask again in a couple of days.", "ok");
      await loadSymptoms();
    } catch (err) {
      toast(err.message || "Something went wrong.", "err");
      btn.closest(".pv-ask").querySelectorAll("button").forEach(b => { b.disabled = false; });
    }
  }

  /* ---------- wiring ---------- */
  document.addEventListener("click", e => {
    const t = e.target;
    const retry = t.closest("[data-pv-retry]");
    if (retry) { e.preventDefault(); (retry.dataset.pvRetry === "vitals" ? loadVitals : loadSymptoms)(); return; }
    if (t.closest("#pv-more")) { showAllReadings = !showAllReadings; renderVitals(vitalsData); return; }
    if (t.closest("#pv-more-eps")) { showAllEpisodes = !showAllEpisodes; renderSymptoms(symData); return; }
    if (t.closest("[data-pv-dismiss]")) { showAlert(null); return; }
    const ci = t.closest("[data-pv-checkin]");
    if (ci) checkin(ci.dataset.pvName, ci.dataset.pvCheckin, ci);
  });

  window.CuraVaultPatterns = { loadVitals, loadSymptoms };
  bindForm();
  loadVitals();
  loadSymptoms();
})();
