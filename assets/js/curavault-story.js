/* CuraVault: the health story (what your own records say), record search, and a visit summary to print.
   Every value shown comes from /curavault/story or /curavault/search; nothing here is inferred in the browser.
   All text from the server is escaped before it touches innerHTML. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const E = s => esc(s);
  const STATUS = {
    confirmed: ["Checked", "good"], needs_review: ["Needs checking", "warn"], reading: ["Reading…", "muted"],
    unreadable: ["Couldn't read", "bad"], stored: ["Stored", "muted"],
  };
  const CAT = { lab_report: ["🧪", "Lab report"], prescription: ["💊", "Prescription"], scan: ["🩻", "Scan"], discharge_summary: ["🏥", "Discharge summary"], vaccination: ["💉", "Vaccination"], other: ["📄", "Other"] };

  function day(iso) {                                  // "2026-09-18" -> "18 Sep 2026", read as a calendar day (no timezone drift)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function num(v) { return v == null ? "" : (Math.abs(v) < 100 ? String(Math.round(v * 10) / 10) : String(Math.round(v))); }
  function withUnit(v, unit) { return num(v) + (unit === "%" ? "%" : " " + unit); }

  /* ---------- sparkline: values over time against the usual range (shaded) ---------- */
  function spark(t) {
    const W = 148, H = 44, P = 5, pts = t.points;
    const lo = t.range.low, hi = t.range.high;
    const vals = pts.map(p => p.value).concat([lo, hi].filter(v => v != null));
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1e-9) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12; min -= pad; max += pad;
    const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts[pts.length - 1].date).getTime();
    const x = d => pts.length < 2 ? W / 2 : P + (new Date(d).getTime() - t0) / Math.max(1, t1 - t0) * (W - 2 * P);
    const y = v => H - P - (v - min) / (max - min) * (H - 2 * P);
    const bandTop = y(hi != null ? Math.min(hi, max) : max), bandBot = y(lo != null ? Math.max(lo, min) : min);
    let svg = '<svg class="sp" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + E(t.name + " over time") + '">';
    if (lo != null || hi != null) svg += '<rect class="sp-band" x="0" y="' + bandTop.toFixed(1) + '" width="' + W + '" height="' + Math.max(1, bandBot - bandTop).toFixed(1) + '" rx="3"></rect>';
    if (pts.length > 1) svg += '<polyline class="sp-line" points="' + pts.map(p => x(p.date).toFixed(1) + "," + y(p.value).toFixed(1)).join(" ") + '"></polyline>';
    pts.forEach((p, i) => {
      svg += '<circle class="sp-dot' + (i === pts.length - 1 ? " last" : "") + '" cx="' + x(p.date).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="' + (i === pts.length - 1 ? 4 : 3) + '">' +
        "<title>" + E(day(p.date) + ": " + withUnit(p.value, t.unit)) + "</title></circle>";
    });
    return svg + "</svg>";
  }

  function chip(label, tone) { return '<span class="hs-chip ' + tone + '">' + E(label) + "</span>"; }
  function statusChip(t) {
    if (t.status === "high") return chip("Above usual", "warn");
    if (t.status === "low") return chip("Below usual", "warn");
    return chip("In usual range", "good");
  }
  function trendChip(t) {
    return ({ improving: chip("Improving", "good"), worsening: chip("Moving away", "bad"), back_in_range: chip("Back in range", "good"),
      steady: chip("Steady", "muted"), in_range: "", single: chip("One result", "muted") })[t.trend] || "";
  }
  function rangeText(t) {
    const lo = t.range.low, hi = t.range.high, u = t.unit === "%" ? "%" : " " + t.unit;
    if (lo != null && hi != null) return "Usual: " + num(lo) + "–" + num(hi) + u;
    if (hi != null) return "Usual: under " + num(hi) + u;
    if (lo != null) return "Usual: " + num(lo) + u + " or more";
    return "";
  }

  /* ---------- the story card ---------- */
  let lastStory = null, showAllLabs = false;

  function labTile(t) {
    return '<div class="hs-lab ' + (t.status === "in" ? "ok" : "off") + '">' +
      '<div class="hs-lab-top"><div><div class="hs-lab-name">' + E(t.name) + '</div><div class="hs-lab-what">' + E(t.what) + "</div></div>" +
      '<div class="hs-lab-val">' + E(withUnit(t.latest.value, t.unit)) + '<small>' + E(day(t.latest.date)) + "</small></div></div>" +
      '<div class="hs-lab-mid">' + spark(t) + '<div class="hs-lab-chips">' + statusChip(t) + trendChip(t) + "</div></div>" +
      '<p class="hs-lab-text">' + E(t.sentence) + "</p>" +
      '<div class="hs-lab-foot">' + E(rangeText(t)) + (t.range.from_report ? " (from your lab)" : "") +
      ' · <button type="button" class="hs-link" data-cv-review="' + E(t.latest.record_id) + '">See report</button></div></div>';
  }

  function renderStory(s) {
    const box = $("cv-story");
    if (!box) return;
    lastStory = s;
    if (!s || !s.ok) {
      box.innerHTML = '<div class="hs-head"><h2>Your health story</h2></div><div class="empty-note">Couldn\'t put your story together right now. <a href="#" data-story-retry>Try again</a></div>';
      return;
    }
    const sum = s.summary;
    if (!sum.records) {
      box.innerHTML = '<div class="hs-head"><div><h2>Your health story</h2><p class="card-sub">Upload a lab report, scan or prescription. CuraVault reads it, you check what it read, ' +
        "and from then on your results are tracked here over time: what's improving, what's outside the usual range, and any follow-up your reports asked for.</p></div></div>" +
        '<button type="button" class="save-btn" data-go-tab="records">Upload your first record</button>';
      return;
    }
    let html = '<div class="hs-head"><div><h2>Your health story</h2><p class="card-sub">' +
      E(sum.records + " record" + (sum.records === 1 ? "" : "s") + (sum.first ? " from " + day(sum.first) + " to " + day(sum.last) : "") +
        (sum.confirmed_values ? " · " + sum.confirmed_values + " checked result" + (sum.confirmed_values === 1 ? "" : "s") : "")) +
      '</p></div><button type="button" class="btn-ghost go" id="hs-visit-btn">🩺 Prepare a visit summary</button></div>';

    if (s.attention.length) {
      html += '<div class="hs-attn">' + s.attention.map(a =>
        '<div class="hs-attn-row ' + E(a.tone) + '"><span class="hs-attn-ic" aria-hidden="true">' + (a.tone === "warn" ? "!" : "i") + '</span><span class="hs-attn-text">' + E(a.text) + "</span>" +
        (a.record_id ? '<button type="button" class="btn-ghost' + (a.kind === "review" ? " go" : "") + '" data-cv-review="' + E(a.record_id) + '">' + (a.kind === "review" ? "Check now" : "Open report") + "</button>" : "") +
        "</div>").join("") + "</div>";
    } else {
      html += '<div class="hs-calm">✓ Nothing in your records needs a follow-up right now.</div>';
    }

    if (s.labs.length) {
      const labs = showAllLabs ? s.labs : s.labs.slice(0, 6);
      html += '<h3 class="hs-sub">Your results over time</h3><div class="hs-labs">' + labs.map(labTile).join("") + "</div>";
      if (s.labs.length > 6) html += '<button type="button" class="hs-more" id="hs-more">' + (showAllLabs ? "Show fewer" : "Show all " + s.labs.length + " results") + "</button>";
    } else if (s.to_check.some(x => x.status === "needs_review")) {
      html += '<p class="hs-hint">Your lab results appear here, with trends, once you\'ve checked what was read from each report.</p>';
    }

    if (s.scan_changes.length) {
      html += '<h3 class="hs-sub">Findings measured on more than one scan</h3>' + s.scan_changes.map(c => {
        const max = Math.max(...c.points.map(p => p.size_mm));
        return '<div class="hs-change ' + E(c.change) + '"><div class="hs-change-bars">' + c.points.map(p =>
          '<div class="hs-bar-row"><span>' + E(day(p.date)) + '</span><div class="hs-bar"><i style="width:' + Math.max(6, p.size_mm / max * 100).toFixed(0) + '%"></i></div><b>' + E(num(p.size_mm)) + " mm</b></div>").join("") +
          '</div><p>' + E(c.sentence) + "</p></div>";
      }).join("");
    }

    if (s.follow_ups.length) {
      const label = { overdue: ["Overdue", "bad"], due_soon: ["Due soon", "warn"], upcoming: ["Coming up", "muted"], done: ["Looks done", "good"] };
      html += '<h3 class="hs-sub">Follow-ups your reports asked for</h3><div class="hs-fups">' + s.follow_ups.map(f =>
        '<div class="hs-fup"><div class="hs-fup-when">' + chip(label[f.state][0], label[f.state][1]) + '<span>Due ' + E(day(f.due)) + "</span></div>" +
        '<div class="hs-fup-body"><q>' + E(f.asked) + "</q><small>From " + E(f.record_title) + ", " + E(day(f.record_date)) +
        (f.state === "done" && f.done_title ? ". Later record: " + E(f.done_title) : "") + "</small></div></div>").join("") + "</div>";
    }

    if (s.scans.length) {
      html += '<details class="hs-scans"><summary>What your scan reports concluded (' + s.scans.length + ")</summary>" + s.scans.map(x =>
        '<div class="hs-scan"><div class="hs-scan-top"><b>' + E(x.title) + "</b><span>" + E(day(x.date)) + (x.modality ? " · " + E(x.modality) : "") + "</span></div><p>" + E(x.impression) + "</p>" +
        (x.confirmed ? "" : '<small>As read from the report. <button type="button" class="hs-link" data-cv-review="' + E(x.record_id) + '">Check it</button></small>') + "</div>").join("") + "</details>";
    }

    if (s.questions.length) {
      html += '<details class="hs-q"><summary>Questions to take to your doctor (' + s.questions.length + ")</summary><ul>" +
        s.questions.map(q => "<li><b>" + E(q.topic) + ".</b> " + E(q.text) + "</li>").join("") + "</ul></details>";
    }
    html += '<p class="hs-note">' + E(s.note) + "</p>";
    box.innerHTML = html;
  }

  async function loadStory() {
    const s = await cvGet("/story");
    renderStory(s);
    if (s && s.ok) applyStatuses(s.statuses || {});
    return s;
  }

  /* ---------- records: statuses, filters, search ---------- */
  let filter = "all";
  function applyStatuses(map) {
    (lastRecords || []).forEach(r => { if (map[r.id]) r.review_status = map[r.id]; });
  }

  function recordRow(r) {
    const st = STATUS[r.review_status] || STATUS.stored;
    const cat = CAT[r.category] || CAT.other;
    const action = { needs_review: "Check what was read", unreadable: "Fix", confirmed: "View", reading: "View", stored: "View" }[r.review_status] || "View";
    return '<div class="rec-row"><span class="rec-ic" aria-hidden="true">' + cat[0] + "</span>" +
      '<div class="rec-main"><div class="rec-title">' + E(r.title || r.original_filename || "Untitled") + "</div>" +
      '<div class="rec-meta">' + E(day(r.record_date || r.created_at) || "No date") + " · " + E(cat[1]) + (r.size_bytes ? " · " + E(bytesToSize(r.size_bytes)) : "") + "</div></div>" +
      chip(st[0], st[1]) +
      '<div class="rec-actions"><button type="button" class="btn-ghost' + (r.review_status === "needs_review" ? " go" : "") + '" data-cv-review="' + E(r.id) + '">' + E(action) + "</button>" +
      '<button type="button" class="btn-ghost danger" data-cv-delete="' + E(r.id) + '" aria-label="Delete ' + E(r.title || "record") + '">Delete</button></div></div>';
  }

  function renderRecordList() {
    const wrap = $("cv-records-wrap");
    if (!wrap || !lastRecords || !lastRecords.length) return;
    const counts = {};
    lastRecords.forEach(r => { counts[r.category || "other"] = (counts[r.category || "other"] || 0) + 1; });
    const waiting = lastRecords.filter(r => r.review_status === "needs_review" || r.review_status === "unreadable").length;
    const chips = [["all", "All", lastRecords.length]].concat(waiting ? [["check", "Needs checking", waiting]] : [])
      .concat(Object.keys(CAT).filter(k => counts[k]).map(k => [k, CAT[k][1], counts[k]]));
    if (!chips.some(c => c[0] === filter)) filter = "all";
    const shown = lastRecords.filter(r => filter === "all" || (filter === "check" ? (r.review_status === "needs_review" || r.review_status === "unreadable") : (r.category || "other") === filter))
      .slice().sort((a, b) => String(b.record_date || b.created_at || "").localeCompare(String(a.record_date || a.created_at || "")));
    let html = '<div class="rec-filters" role="group" aria-label="Filter records">' + chips.map(c =>
      '<button type="button" class="rec-filter' + (c[0] === filter ? " on" : "") + '" data-rec-filter="' + c[0] + '" aria-pressed="' + (c[0] === filter) + '">' + E(c[1]) + " <span>" + c[2] + "</span></button>").join("") + "</div>";
    let year = null;
    shown.forEach(r => {
      const y = String(r.record_date || r.created_at || "").slice(0, 4) || "Undated";
      if (y !== year) { html += '<div class="rec-year">' + E(y) + "</div>"; year = y; }
      html += recordRow(r);
    });
    wrap.innerHTML = html;
  }

  let searchSeq = 0, searchTimer = null;
  async function runSearch(q) {
    const seq = ++searchSeq, out = $("cv-search-results");
    if (q.trim().length < 2) { out.innerHTML = ""; out.hidden = true; $("cv-records-wrap").hidden = false; return; }
    out.hidden = false; $("cv-records-wrap").hidden = true;
    out.innerHTML = '<div class="skel skel-row"></div>';
    const data = await cvGet("/search?q=" + encodeURIComponent(q.trim()));
    if (seq !== searchSeq) return;
    if (!data.ok) { out.innerHTML = '<div class="empty-note">Search isn\'t available right now.</div>'; return; }
    if (!data.results.length) { out.innerHTML = '<div class="empty-note">Nothing in your records mentions “' + E(data.query) + '”.</div>'; return; }
    const where = { title: "in the title", type: "record type", notes: "in your notes", source: "source", file: "file name", results: "in your results", report: "in the report" };
    out.innerHTML = '<div class="rec-year">' + data.results.length + " record" + (data.results.length === 1 ? "" : "s") + " mention “" + E(data.query) + "”</div>" + data.results.map(r => {
      const cat = CAT[r.category] || CAT.other;
      return '<div class="rec-row"><span class="rec-ic" aria-hidden="true">' + cat[0] + '</span><div class="rec-main"><div class="rec-title">' + E(r.title) + "</div>" +
        '<div class="rec-meta">' + E(day(r.date) || "No date") + " · " + E(where[r.where] || "") + "</div>" +
        '<div class="rec-snip">' + E(r.snippet.before) + "<mark>" + E(r.snippet.match) + "</mark>" + E(r.snippet.after) + "</div></div>" +
        '<div class="rec-actions"><button type="button" class="btn-ghost" data-cv-review="' + E(r.record_id) + '">Open</button></div></div>';
    }).join("");
  }

  /* ---------- visit summary: one page to show (or print for) a doctor ---------- */
  async function visitSummary() {
    const btn = $("hs-visit-btn");
    if (btn) btn.disabled = true;
    try {
      const [story, prof, meds] = await Promise.all([
        lastStory && lastStory.ok ? Promise.resolve(lastStory) : cvGet("/story"),
        fetch(API_BASE + "/profile", { credentials: "include" }).then(r => r.json()).catch(() => ({})),
        cvGet("/medications/current"),
      ]);
      const p = (prof && prof.profile) || {};
      const name = (document.getElementById("idc-name") || {}).textContent || "";
      const list = a => (Array.isArray(a) ? a : String(a || "").split(",")).map(x => String(x).trim()).filter(Boolean);
      const allergies = list(p.med_allergies).concat(list(p.food_allergies));
      const sec = (title, body) => body ? "<section><h3>" + E(title) + "</h3>" + body + "</section>" : "";
      const off = story.labs.filter(t => t.status !== "in");
      const labRows = story.labs.map(t => {
        const prev = t.points.length > 1 ? t.points[t.points.length - 2] : null;
        return "<tr><td>" + E(t.name) + "</td><td><b>" + E(withUnit(t.latest.value, t.unit)) + "</b><br><small>" + E(day(t.latest.date)) + "</small></td><td>" +
          (prev ? E(withUnit(prev.value, t.unit)) + "<br><small>" + E(day(prev.date)) + "</small>" : "—") + "</td><td>" + E(rangeText(t).replace("Usual: ", "")) + "</td><td>" +
          E(t.status === "high" ? "Above" : t.status === "low" ? "Below" : "In range") + "</td></tr>";
      }).join("");
      const html =
        '<div class="vs-head"><div><h2>Health summary</h2><p>' + E(name) + (p.age ? " · " + E(p.age) + " years" : "") + (p.sex && p.sex !== "unknown" ? " · " + E(p.sex) : "") +
        "</p></div><p class=\"vs-made\">Prepared " + E(day(new Date().toISOString().slice(0, 10))) + " from records the patient keeps in CuraVault.<br>Lab values were checked by the patient against their reports.</p></div>" +
        sec("Conditions and allergies", (list(p.conditions).length || allergies.length) ?
          "<p><b>Conditions:</b> " + E(list(p.conditions).join(", ") || "none recorded") + "</p><p><b>Allergies:</b> " + E(allergies.join(", ") || "none recorded") + "</p>" : "") +
        sec("Current medicines", meds && meds.ok && (meds.medications || []).length ?
          "<ul>" + meds.medications.map(m => "<li>" + E(m.name + (m.strength ? " " + m.strength : "")) + (m.schedule_summary ? " — " + E(m.schedule_summary) : "") + "</li>").join("") + "</ul>" : "") +
        sec("Needs attention", story.attention.filter(a => a.kind === "follow_up" || a.kind === "lab").length ? "<ul>" + story.attention.filter(a => a.kind === "follow_up" || a.kind === "lab").map(a => "<li>" + E(a.text) + "</li>").join("") + "</ul>" : "") +
        sec("Results outside the usual range", off.length ? "<ul>" + off.map(t => "<li>" + E(t.sentence) + "</li>").join("") + "</ul>" : "") +
        sec("Lab results", labRows ? '<table><thead><tr><th>Test</th><th>Latest</th><th>Before that</th><th>Usual</th><th></th></tr></thead><tbody>' + labRows + "</tbody></table>" : "") +
        sec("Scans", story.scans.length ? "<ul>" + story.scans.map(x => "<li><b>" + E(x.title) + "</b>, " + E(day(x.date)) + ": " + E(x.impression) + "</li>").join("") + "</ul>" : "") +
        sec("Changes between scans", story.scan_changes.length ? "<ul>" + story.scan_changes.map(c => "<li>" + E(c.sentence) + "</li>").join("") + "</ul>" : "") +
        sec("Follow-ups the reports asked for", story.follow_ups.length ? "<ul>" + story.follow_ups.map(f => "<li>" + E(f.asked) + " <small>(" + E(f.record_title) + ", due " + E(day(f.due)) + ")</small></li>").join("") + "</ul>" : "") +
        sec("My questions", story.questions.length ? "<ul>" + story.questions.map(q => "<li>" + E(q.text) + "</li>").join("") + "</ul>" : "");
      $("cv-print").innerHTML = html;
      const dlg = document.createElement("dialog");
      dlg.className = "vs-dialog";
      dlg.innerHTML = '<div class="vs-body">' + html + '</div><div class="vs-actions"><button type="button" class="btn-ghost" data-vs="close">Close</button><button type="button" class="save-btn" data-vs="print">Print or save as PDF</button></div>';
      dlg.addEventListener("click", e => {
        const b = e.target.closest("[data-vs]");
        if (!b) return;
        if (b.dataset.vs === "print") window.print(); else dlg.close();
      });
      dlg.onclose = () => { dlg.remove(); if (btn) btn.focus(); };
      document.body.append(dlg);
      dlg.showModal();
    } catch (e) {
      toast("Couldn't prepare the summary. Please try again.", "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------- wiring ---------- */
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#hs-visit-btn")) { visitSummary(); return; }
    if (t.closest("#hs-more")) { showAllLabs = !showAllLabs; renderStory(lastStory); return; }
    const f = t.closest("[data-rec-filter]");
    if (f) { filter = f.dataset.recFilter; renderRecordList(); return; }
    const go = t.closest("[data-go-tab]");
    if (go) { const tab = document.querySelector('.vtab[data-tab="' + go.dataset.goTab + '"]'); if (tab) tab.click(); return; }
    if (t.closest("[data-story-retry]")) { e.preventDefault(); loadStory(); }
  });
  const search = $("cv-search");
  if (search) {
    search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(search.value), 250); });
    search.addEventListener("keydown", e => { if (e.key === "Escape") { search.value = ""; runSearch(""); } });
  }
  // a review confirmed, a record uploaded or deleted: the story and the list both change
  document.addEventListener("cv-medications-changed", () => { loadStory().then(renderRecordList); });
  document.addEventListener("cv-records-changed", () => { loadStory().then(renderRecordList); });

  window.CuraVaultStory = { load: loadStory, renderRecords: renderRecordList };
  // the records may have arrived before this script did
  if (typeof lastRecords !== "undefined" && lastRecords.length) renderRecordList();
  loadStory().then(() => { if (typeof lastRecords !== "undefined" && lastRecords.length) renderRecordList(); });
})();
