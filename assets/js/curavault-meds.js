/* CuraVault: the Medicines tab (what each medicine is, checks against your own records, is it working, tests usually
   repeated, doses taken) from /curavault/medicines/insights, and the records tidy-up (better titles, dates and types read
   from each document, duplicate uploads, visits) from /curavault/records/insights.
   All server text is escaped before it touches innerHTML. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const E = s => esc(s);
  const TONE_CHIP = { good: "good", info: "muted", watch: "warn", warn: "bad", urgent: "bad" };
  const chip = (label, tone) => label ? '<span class="hs-chip ' + (TONE_CHIP[tone] || tone || "muted") + '">' + E(label) + "</span>" : "";

  function day(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return "";
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }
  function when(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t = new Date(d); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - today) / 864e5);
    const hm = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return diff === 0 ? "today " + hm : diff === 1 ? "tomorrow " + hm : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + hm;
  }
  function attn(list) {
    return '<div class="hs-attn">' + list.map(c =>
      '<div class="hs-attn-row ' + E(c.tone) + '"><span class="hs-attn-ic" aria-hidden="true">' + (c.tone === "urgent" || c.tone === "warn" ? "!" : "i") +
      '</span><span class="hs-attn-text"><b>' + E(c.title) + ".</b> " + E(c.text) + "</span></div>").join("") + "</div>";
  }

  /* ================================ MEDICINES ================================ */
  let medData = null;

  function medTile(m) {
    const worst = (m.flags || []).sort((a, b) => ({ urgent: 4, warn: 3, watch: 2, info: 1 })[b] - ({ urgent: 4, warn: 3, watch: 2, info: 1 })[a])[0];
    const ad = m.adherence && m.adherence.due ? m.adherence : null;
    return '<div class="mi-med' + (worst === "urgent" || worst === "warn" ? " off" : "") + '">' +
      '<div class="mi-med-top"><div><div class="mi-med-name">' + E(m.name) + (m.strength ? ' <small>' + E(m.strength) + "</small>" : "") + "</div>" +
      (m.ingredients.length ? '<div class="mi-med-ing">Contains ' + E(m.ingredients.join(" + ")) + "</div>" : '<div class="mi-med-ing">Not in CuraVault\'s medicine list yet, so it isn\'t included in the checks.</div>') + "</div>" +
      (worst ? chip(worst === "urgent" ? "Check now" : worst === "warn" ? "Needs a look" : "Note", worst) : (m.known ? chip("No clashes", "good") : "")) + "</div>" +
      (m.purpose ? '<p class="mi-med-for">' + E(m.purpose) + ".</p>" : "") +
      '<div class="mi-med-meta">' + E(m.schedule || "") + (m.next_dose ? " · Next " + E(when(m.next_dose)) : "") + (m.start ? " · Since " + E(day(m.start)) : "") + "</div>" +
      (ad ? '<div class="mi-ad"><div class="mi-ad-bar"><i style="width:' + ad.pct + '%"></i></div><span>' + E(ad.pct + "% taken · " + ad.taken + " of " + ad.due + " in 30 days") + "</span></div>" : "") +
      "</div>";
  }

  function effectRow(e) {
    const tone = { better: "good", worse: "warn", same: "muted" }[e.verdict];
    const label = { better: "Moving the right way", worse: "Moving the wrong way", same: "About the same" }[e.verdict];
    const u = e.unit === "%" ? "%" : " " + e.unit;
    return '<div class="mi-eff"><div class="mi-eff-top"><b>' + E(e.name) + "</b> <span>on " + E(e.medicine) + "</span>" + chip(label, tone) + "</div>" +
      '<div class="mi-eff-vals"><span>' + E(String(e.before.value) + (e.marker === "bp" ? "" : u)) + "<small>" + E(e.before.date ? "before · " + day(e.before.date) : "before") + "</small></span>" +
      '<span class="mi-arrow" aria-hidden="true">→</span><span>' + E(String(e.after.value) + (e.marker === "bp" ? "" : u)) + "<small>" + E(e.after.date ? "latest · " + day(e.after.date) : "recently") + "</small></span></div>" +
      "<p>" + E(e.sentence) + "</p></div>";
  }

  function adherenceBlock(a) {
    if (!a.overall || !a.overall.due) return '<p class="hs-hint">Once you start marking reminded doses as taken, you\'ll see how many you took and which time of day gets missed.</p>';
    const o = a.overall;
    const R = 34, C = 2 * Math.PI * R, off = C * (1 - o.pct / 100);
    let html = '<div class="mi-adh"><svg class="mi-ring" viewBox="0 0 84 84" width="84" height="84" role="img" aria-label="' + E(o.pct + "% of reminded doses taken") + '">' +
      '<circle cx="42" cy="42" r="' + R + '" class="mi-ring-bg"></circle><circle cx="42" cy="42" r="' + R + '" class="mi-ring-fg ' + (o.pct >= 80 ? "good" : "warn") + '" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle>' +
      '<text x="42" y="47" text-anchor="middle">' + o.pct + "%</text></svg>" +
      '<div><p class="mi-adh-big">' + E(o.taken + " of " + o.due + " reminded doses taken in the last 30 days") + "</p>" +
      '<p class="hs-lab-text">' + E((o.skipped ? o.skipped + " skipped · " : "") + (o.missed ? o.missed + " not marked · " : "") + (a.streak_days ? a.streak_days + "-day streak of every dose taken" : "")) .replace(/ · $/, "") + "</p>" +
      (a.slot_sentence ? '<p class="hs-lab-text">' + E(a.slot_sentence) + "</p>" : "") + "</div></div>";
    if (a.slots.length > 1) {
      html += '<div class="mi-slots">' + a.slots.map(s => '<div class="mi-slot"><span>' + E(s.time) + '</span><div class="mi-ad-bar"><i class="' + (s.pct >= 80 ? "" : "low") + '" style="width:' + (s.pct || 0) + '%"></i></div><b>' + E(s.pct + "%") + "</b></div>").join("") + "</div>";
    }
    return html;
  }

  function timeline(meds) {
    const withStart = meds.filter(m => m.start);
    if (withStart.length < 1) return "";
    const end = new Date(), start = new Date(end); start.setMonth(start.getMonth() - 12);
    const span = end - start;
    const pos = d => Math.max(0, Math.min(100, (d - start) / span * 100));
    const months = [];
    for (let i = 0; i <= 12; i += 3) { const d = new Date(start); d.setMonth(d.getMonth() + i); months.push('<span style="left:' + pos(d).toFixed(1) + '%">' + E(d.toLocaleDateString(undefined, { month: "short" })) + "</span>"); }
    return '<div class="mi-tl"><div class="mi-tl-axis">' + months.join("") + "</div>" + withStart.map(m => {
      const s = new Date(m.start + "T00:00:00"), e = m.end ? new Date(m.end + "T00:00:00") : (m.state === "past" ? null : end);
      const l = pos(s), r = e ? pos(e) : l + 1.5;
      return '<div class="mi-tl-row"><span class="mi-tl-name">' + E(m.name) + '</span><div class="mi-tl-track"><i class="' + E(m.state) + '" style="left:' + l.toFixed(1) + "%;width:" + Math.max(1.5, r - l).toFixed(1) + '%" title="' +
        E(day(m.start) + (m.end ? " – " + day(m.end) : m.state === "past" ? ", stopped" : " – now")) + '"></i></div></div>';
    }).join("") + "</div>";
  }

  function renderMeds(d) {
    medData = d;
    const box = $("cv-med-insights");
    if (box) {
      if (!d || !d.ok) {
        box.innerHTML = '<div class="hs-head"><h2>💊 Your medicines</h2></div><div class="empty-note">Couldn\'t check your medicines right now. <a href="#" data-mi-retry>Try again</a></div>';
      } else if (!d.has_data) {
        box.innerHTML = '<div class="hs-head"><div><h2>💊 Your medicines</h2><p class="card-sub">Upload a prescription in Records and check what was read. Your medicines then appear here: what each one is, ' +
          "any clashes with each other or with your allergies, conditions and results, whether your results moved since you started, and the doses you've taken.</p></div></div>" +
          '<button type="button" class="save-btn" data-go-tab="records">Upload a prescription</button>';
      } else {
        const s = d.summary;
        const current = d.medicines.filter(m => m.state !== "past"), past = d.medicines.filter(m => m.state === "past");
        let html = '<div class="hs-head"><div><h2>💊 Your medicines</h2><p class="card-sub">' + E(s.active + " current" + (s.upcoming ? " · " + s.upcoming + " starting later" : "") + (s.past ? " · " + s.past + " past" : "")) + "</p></div></div>";
        html += d.checks.length ? '<h3 class="hs-sub">Worth checking with your doctor or pharmacist</h3>' + attn(d.checks)
          : '<div class="hs-calm">✓ No overlaps or clashes found between your medicines, your allergies, your conditions and your results.</div>';
        if (current.length) html += '<h3 class="hs-sub">What you take</h3><div class="mi-meds">' + current.map(medTile).join("") + "</div>";
        if (d.effects.length) html += '<h3 class="hs-sub">Since you started</h3><div class="mi-effs">' + d.effects.map(effectRow).join("") + "</div>";
        html += '<h3 class="hs-sub">Doses taken</h3>' + adherenceBlock(d.adherence);
        if (d.monitoring.length) {
          html += '<h3 class="hs-sub">Tests usually repeated on your medicines</h3><div class="mi-mon">' + d.monitoring.map(m =>
            '<div class="mi-mon-row">' + chip(m.due ? "Due" : "Up to date", m.due ? "watch" : "good") + "<span>" + E(m.text) + "</span></div>").join("") + "</div>";
        }
        const tl = timeline(d.medicines);
        if (tl) html += '<h3 class="hs-sub">Your medicines over the last year</h3>' + tl;
        if (past.length) html += '<details class="hs-q"><summary>Past medicines (' + past.length + ")</summary>" + '<div class="mi-meds">' + past.map(medTile).join("") + "</div></details>";
        html += '<p class="hs-note">' + E(d.note) + "</p>";
        box.innerHTML = html;
      }
    }
    renderTeaser(d);
  }

  function renderTeaser(d) {
    const t = $("cv-med-teaser");
    if (!t) return;
    if (!d || !d.ok || !d.has_data) { t.hidden = true; return; }
    const current = d.medicines.filter(m => m.state === "active");
    const next = current.map(m => m.next_dose).filter(Boolean).sort()[0];
    const serious = d.checks.filter(c => c.tone === "urgent" || c.tone === "warn").length;
    const ad = d.adherence.overall;
    t.hidden = false;
    t.innerHTML = '<div class="mi-teaser"><span class="mi-teaser-ic" aria-hidden="true">💊</span><div class="mi-teaser-text"><b>' + E(current.length + " current medicine" + (current.length === 1 ? "" : "s")) + "</b>" +
      "<span>" + E([next ? "Next dose " + when(next) : "", ad && ad.due ? ad.pct + "% of doses taken this month" : ""].filter(Boolean).join(" · ")) + "</span></div>" +
      (serious ? chip(serious + " to check", "warn") : chip("No clashes found", "good")) +
      '<button type="button" class="btn-ghost go" data-go-tab="medicines">Open medicines</button></div>';
  }

  async function loadMeds() {
    const d = await cvGet("/medicines/insights");
    renderMeds(d);
    return d;
  }

  /* ================================ RECORDS TIDY-UP ================================ */
  const CAT_NAME = { lab_report: "Lab report", scan: "Scan", prescription: "Prescription", discharge_summary: "Discharge summary", vaccination: "Vaccination", other: "Other" };
  let tidy = null;
  function dismissed() { try { return JSON.parse(localStorage.getItem("cv-tidy-dismissed") || "[]"); } catch (_) { return []; } }
  function dismiss(id) { try { const d = dismissed(); d.push(id); localStorage.setItem("cv-tidy-dismissed", JSON.stringify(d.slice(-200))); } catch (_) { /* private mode */ } }

  function renderTidy(d) {
    tidy = d;
    const box = $("cv-rec-tidy");
    if (!box) return;
    if (!d || !d.ok) { box.hidden = true; return; }
    const gone = new Set(dismissed());
    const sug = d.suggestions.filter(s => !gone.has(s.record_id + ":" + JSON.stringify(s.suggested)));
    const dups = d.duplicates.filter(x => !gone.has("dup:" + x.record_ids.join(",")));
    const visits = d.visits;
    if (!sug.length && !dups.length && !visits.length && !d.tips.length) { box.hidden = true; return; }
    box.hidden = false;
    let html = '<div class="hs-head"><div><h2>✨ Keep your vault tidy</h2><p class="card-sub">Read from the documents themselves. Nothing changes until you say so.</p></div>' +
      (sug.length > 1 ? '<button type="button" class="btn-ghost go" data-tidy-all>Apply all ' + sug.length + "</button>" : "") + "</div>";
    if (sug.length) {
      html += '<div class="rt-list">' + sug.map(s => {
        const c = s.suggested, bits = [];
        if (c.category) bits.push("Type: " + CAT_NAME[c.category]);
        if (c.record_date) bits.push("Date: " + day(c.record_date));
        if (c.source_name) bits.push("From: " + c.source_name);
        return '<div class="rt-row"><div class="rt-main"><div class="rt-from">' + E(s.current.title) + "</div>" +
          '<div class="rt-to">' + (c.title ? E(c.title) : E(s.current.title)) + "</div>" +
          (bits.length ? '<div class="rt-bits">' + bits.map(b => "<span>" + E(b) + "</span>").join("") + "</div>" : "") +
          '<small>' + E(s.why) + "</small></div>" +
          '<div class="rt-act"><button type="button" class="btn-ghost go" data-tidy-apply="' + E(s.record_id) + '">Apply</button><button type="button" class="btn-ghost" data-tidy-skip="' + E(s.record_id) + '">Not now</button></div></div>';
      }).join("") + "</div>";
    }
    if (dups.length) {
      html += '<h3 class="hs-sub">Uploaded more than once</h3>' + dups.map(x =>
        '<div class="rt-dup"><p>' + E(x.text) + '</p><div class="rt-act">' + x.record_ids.map((id, i) =>
          '<button type="button" class="btn-ghost" data-cv-review="' + E(id) + '">Open ' + (i + 1) + "</button>").join("") +
        '<button type="button" class="btn-ghost" data-tidy-dup="' + E(x.record_ids.join(",")) + '">They\'re different</button></div></div>').join("");
    }
    if (visits.length) {
      html += '<details class="hs-q rt-visits"' + (sug.length || dups.length ? "" : " open") + '><summary>Records that go together (' + visits.length + " visit" + (visits.length === 1 ? "" : "s") + ")</summary>" + visits.map(v =>
        '<div class="rt-visit"><div class="rt-visit-top"><b>' + E(day(v.start) + (v.end !== v.start ? " – " + day(v.end) : "")) + "</b><span>" + E(v.label + (v.source ? " · " + v.source : "")) + "</span></div>" +
        '<div class="rt-visit-items">' + v.items.map(it => '<button type="button" class="rt-pill" data-cv-review="' + E(it.id) + '">' + E(it.title) + "</button>").join("") + "</div></div>").join("") + "</details>";
    }
    if (d.tips.length) html += '<ul class="pv-habits">' + d.tips.map(t => "<li>" + E(t) + "</li>").join("") + "</ul>";
    box.innerHTML = html;
  }

  async function loadTidy() {
    const d = await cvGet("/records/insights");
    renderTidy(d);
    return d;
  }

  async function apply(ids, btn) {
    const list = tidy.suggestions.filter(s => ids.includes(s.record_id));
    if (btn) btn.disabled = true;
    let ok = 0;
    for (const s of list) {
      try {
        const res = await fetch(CV + "/records/" + encodeURIComponent(s.record_id), {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s.suggested),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't update that record.");
        ok++;
      } catch (e) { toast(e.message, "err"); }
    }
    if (ok) {
      toast(ok === 1 ? "Record updated." : ok + " records updated.", "ok");
      if (typeof loadRecords === "function") await loadRecords();
      document.dispatchEvent(new CustomEvent("cv-records-changed"));
    }
    await loadTidy();
  }

  /* ---------- wiring ---------- */
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-mi-retry]")) { e.preventDefault(); loadMeds(); return; }
    const a = t.closest("[data-tidy-apply]");
    if (a) { apply([a.dataset.tidyApply], a); return; }
    if (t.closest("[data-tidy-all]")) {
      const gone = new Set(dismissed());
      apply(tidy.suggestions.filter(s => !gone.has(s.record_id + ":" + JSON.stringify(s.suggested))).map(s => s.record_id), t.closest("[data-tidy-all]"));
      return;
    }
    const sk = t.closest("[data-tidy-skip]");
    if (sk) { const s = tidy.suggestions.find(x => x.record_id === sk.dataset.tidySkip); if (s) dismiss(s.record_id + ":" + JSON.stringify(s.suggested)); renderTidy(tidy); return; }
    const dp = t.closest("[data-tidy-dup]");
    if (dp) { dismiss("dup:" + dp.dataset.tidyDup); renderTidy(tidy); }
  });
  document.addEventListener("cv-medications-changed", loadMeds);
  document.addEventListener("cv-records-changed", () => { loadTidy(); loadMeds(); });

  window.CuraVaultMeds = { loadMeds, loadTidy };
  loadMeds();
  loadTidy();
})();
